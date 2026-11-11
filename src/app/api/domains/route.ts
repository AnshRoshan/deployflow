import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { newToken } from "@/lib/security";
import { audit } from "@/lib/data";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin"); const input = z.object({ hostname: z.string().toLowerCase().regex(/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a valid hostname without https:// or a path."), projectId: z.uuid().nullable().optional() }).parse(await checkedJson(req));
    if (input.projectId) { const [p] = await db.select().from(s.projects).where(and(eq(s.projects.id, input.projectId), eq(s.projects.organizationId, ctx.organization.id))); if (!p) throw new ApiError("Project not found.", 404); }
    const [domain] = await db.insert(s.domains).values({ organizationId: ctx.organization.id, projectId: input.projectId, hostname: input.hostname, verificationToken: `deployflow-verification=${newToken().slice(0, 24)}` }).returning();
    await audit(ctx.organization.id, ctx.user.id, "domain.created", "domain", domain.id, { hostname: domain.hostname }); return Response.json({ domain }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) return Response.json({ error: "This hostname is already registered." }, { status: 409 }); return apiError(error);
  }
}
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin"); const { id, action } = z.object({ id: z.uuid(), action: z.literal("verify") }).parse(await checkedJson(req));
    const [existing] = await db.select().from(s.domains).where(and(eq(s.domains.id, id), eq(s.domains.organizationId, ctx.organization.id))); if (!existing) throw new ApiError("Domain not found.", 404);
    if (ctx.organization.mode !== "sandbox") throw new ApiError("Live DNS verification requires a configured DNS provider.", 409);
    const [domain] = await db.update(s.domains).set({ verified: true, sslStatus: "active" }).where(eq(s.domains.id, id)).returning();
    await audit(ctx.organization.id, ctx.user.id, "domain.verified", "domain", id, { mode: "sandbox", hostname: domain.hostname }); return Response.json({ domain });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin"); const { id } = z.object({ id: z.uuid() }).parse(await checkedJson(req));
    const [existing] = await db.select().from(s.domains).where(and(eq(s.domains.id, id), eq(s.domains.organizationId, ctx.organization.id))); if (!existing) throw new ApiError("Domain not found.", 404);
    if (existing.kind === "wildcard") throw new ApiError("The workspace wildcard domain is required while preview environments exist.", 409);
    await db.delete(s.domains).where(eq(s.domains.id, id)); await audit(ctx.organization.id, ctx.user.id, "domain.deleted", "domain", id, { hostname: existing.hostname }); return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
