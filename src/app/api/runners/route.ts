import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { hashToken, newToken } from "@/lib/security";
import { ACTIVE_STATUSES } from "@/lib/deployments";
import { audit } from "@/lib/data";

const runnerKinds = z.enum(["sandbox-docker", "github-actions", "gitlab-runner", "self-hosted"]);
export async function GET(req: NextRequest) {
  try {
    const ctx = await requestContext(req);
    const rows = await db.select({ id: s.runners.id, name: s.runners.name, kind: s.runners.kind, status: s.runners.status, region: s.runners.region, capacity: s.runners.capacity, prefix: s.runners.prefix, lastHeartbeatAt: s.runners.lastHeartbeatAt, createdAt: s.runners.createdAt }).from(s.runners).where(eq(s.runners.organizationId, ctx.organization.id));
    return Response.json({ runners: rows });
  } catch (error) { return apiError(error); }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin");
    const input = z.object({ name: z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers, and hyphens."), kind: runnerKinds.default("sandbox-docker"), region: z.string().trim().min(2).max(40).default("sandbox-local"), capacity: z.number().int().min(1).max(32).default(4) }).parse(await checkedJson(req));
    const token = `dfr_${newToken()}`;
    const [runner] = await db.insert(s.runners).values({ organizationId: ctx.organization.id, name: input.name, kind: input.kind, region: input.region, capacity: input.capacity, status: "online", tokenHash: hashToken(token), prefix: token.slice(0, 12) }).returning({ id: s.runners.id, name: s.runners.name, kind: s.runners.kind, status: s.runners.status, region: s.runners.region, capacity: s.runners.capacity, prefix: s.runners.prefix, lastHeartbeatAt: s.runners.lastHeartbeatAt, createdAt: s.runners.createdAt });
    await audit(ctx.organization.id, ctx.user.id, "runner.registered", "runner", runner.id, { name: runner.name, kind: runner.kind, region: runner.region });
    return Response.json({ runner, token }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) return Response.json({ error: "A runner with this name already exists in the organization." }, { status: 409 });
    return apiError(error);
  }
}
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin");
    const input = z.object({ id: z.uuid(), status: z.enum(["online", "paused", "draining"]).optional(), heartbeat: z.boolean().optional() }).parse(await checkedJson(req));
    const [runner] = await db.update(s.runners).set({ ...(input.status ? { status: input.status } : {}), ...(input.heartbeat ? { lastHeartbeatAt: new Date() } : {}) }).where(and(eq(s.runners.id, input.id), eq(s.runners.organizationId, ctx.organization.id))).returning({ id: s.runners.id, name: s.runners.name, status: s.runners.status });
    if (!runner) throw new ApiError("Runner not found.", 404);
    await audit(ctx.organization.id, ctx.user.id, "runner.updated", "runner", runner.id, { name: runner.name, status: runner.status });
    return Response.json({ runner });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin");
    const { id } = z.object({ id: z.uuid() }).parse(await checkedJson(req));
    const [target] = await db.select().from(s.runners).where(and(eq(s.runners.id, id), eq(s.runners.organizationId, ctx.organization.id)));
    if (!target) throw new ApiError("Runner not found.", 404);
    const active = await db.select({ id: s.deployments.id }).from(s.deployments).innerJoin(s.projects, eq(s.projects.id, s.deployments.projectId)).where(and(eq(s.deployments.organizationId, ctx.organization.id), eq(s.projects.runnerType, target.kind), inArray(s.deployments.status, ACTIVE_STATUSES))).limit(1);
    const peers = await db.select({ id: s.runners.id }).from(s.runners).where(and(eq(s.runners.organizationId, ctx.organization.id), eq(s.runners.kind, target.kind), eq(s.runners.status, "online")));
    if (active.length && peers.filter(p => p.id !== target.id).length === 0) throw new ApiError("Pause or wait for active deployments on this runner type before deleting the last online runner.", 409);
    await db.delete(s.runners).where(and(eq(s.runners.id, id), eq(s.runners.organizationId, ctx.organization.id)));
    await audit(ctx.organization.id, ctx.user.id, "runner.deleted", "runner", id, { name: target.name, kind: target.kind });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
