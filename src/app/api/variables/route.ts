import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { encrypt } from "@/lib/security";
import { audit } from "@/lib/data";
const fields = { key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(100), value: z.string().min(1).max(8192), secret: z.boolean().default(false), phase: z.enum(["build", "runtime", "both"]).default("runtime") };
async function checkScope(orgId: string, projectId: string, branchId?: string | null) {
  const [project] = await db.select().from(s.projects).where(and(eq(s.projects.id, projectId), eq(s.projects.organizationId, orgId)));
  if (!project) throw new ApiError("Project not found.", 404);
  if (branchId) { const [branch] = await db.select().from(s.branches).where(and(eq(s.branches.id, branchId), eq(s.branches.projectId, projectId), eq(s.branches.organizationId, orgId))); if (!branch) throw new ApiError("Branch not found in this project.", 404); }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy"); const input = z.object({ ...fields, projectId: z.uuid(), branchId: z.uuid().nullable().optional() }).parse(await checkedJson(req)); await checkScope(ctx.organization.id, input.projectId, input.branchId);
    const [variable] = await db.insert(s.variables).values({ organizationId: ctx.organization.id, projectId: input.projectId, branchId: input.branchId, scopeKey: input.branchId || "*", key: input.key, valueCipher: encrypt(input.value), secret: input.secret, phase: input.phase }).onConflictDoUpdate({ target: [s.variables.projectId, s.variables.scopeKey, s.variables.key], set: { valueCipher: encrypt(input.value), secret: input.secret, phase: input.phase, version: sql`${s.variables.version} + 1`, updatedAt: new Date() } }).returning({ id: s.variables.id, key: s.variables.key, version: s.variables.version });
    await audit(ctx.organization.id, ctx.user.id, "variable.saved", "variable", variable.id, { key: variable.key, projectId: input.projectId, branchId: input.branchId || "all", secret: input.secret }); return Response.json({ variable }, { status: 201 });
  } catch (error) { return apiError(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy"); const input = z.object({ id: z.uuid(), ...fields }).parse(await checkedJson(req));
    const [existing] = await db.select().from(s.variables).where(and(eq(s.variables.id, input.id), eq(s.variables.organizationId, ctx.organization.id))); if (!existing) throw new ApiError("Variable not found.", 404);
    await checkScope(ctx.organization.id, existing.projectId, existing.branchId);
    const [variable] = await db.update(s.variables).set({ key: input.key, valueCipher: encrypt(input.value), secret: input.secret, phase: input.phase, version: existing.version + 1, updatedAt: new Date() }).where(eq(s.variables.id, existing.id)).returning({ id: s.variables.id, key: s.variables.key });
    await audit(ctx.organization.id, ctx.user.id, "variable.updated", "variable", existing.id, { key: input.key, version: existing.version + 1 }); return Response.json({ variable });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy"); const { id } = z.object({ id: z.uuid() }).parse(await checkedJson(req));
    const [variable] = await db.delete(s.variables).where(and(eq(s.variables.id, id), eq(s.variables.organizationId, ctx.organization.id))).returning(); if (!variable) throw new ApiError("Variable not found.", 404);
    await audit(ctx.organization.id, ctx.user.id, "variable.deleted", "variable", id, { key: variable.key }); return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
