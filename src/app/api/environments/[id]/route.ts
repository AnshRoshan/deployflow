import { after, NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { ACTIVE_STATUSES, enqueueDeployment, runDeployment } from "@/lib/deployments";
import { audit } from "@/lib/data";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: NextRequest, context: Context) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy"); const { id } = await context.params; const input = z.object({ action: z.enum(["stop", "restart", "protect", "unprotect"]) }).parse(await checkedJson(req));
    const [env] = await db.select().from(s.environments).where(and(eq(s.environments.id, id), eq(s.environments.organizationId, ctx.organization.id)));
    if (!env || env.status === "deleted") throw new ApiError("Environment not found.", 404);
    const [active] = await db.select().from(s.deployments).where(and(eq(s.deployments.environmentId, id), inArray(s.deployments.status, ACTIVE_STATUSES))).limit(1);
    if (active && input.action !== "protect") throw new ApiError("Wait for the active deployment to finish, or cancel it first.", 409);
    if (input.action === "restart") {
      const deployment = await enqueueDeployment({ organizationId: ctx.organization.id, projectId: env.projectId, branchId: env.branchId, actorId: ctx.user.id, trigger: "restart" }); after(() => runDeployment(deployment.id)); return Response.json({ deployment }, { status: 202 });
    }
    if (input.action === "unprotect" && !["Owner", "Admin"].includes(ctx.role)) throw new ApiError("An organization owner or administrator is required to remove environment protection.", 403);
    const [updated] = await db.update(s.environments).set(input.action === "protect" ? { protected: true } : input.action === "unprotect" ? { protected: false } : { status: "stopped" }).where(eq(s.environments.id, id)).returning();
    await audit(ctx.organization.id, ctx.user.id, `environment.${input.action === "stop" ? "stopped" : input.action === "protect" ? "protected" : "unprotected"}`, "environment", id); return Response.json({ environment: updated });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest, context: Context) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy"); const { id } = await context.params; const { confirm } = z.object({ confirm: z.literal(true) }).parse(await checkedJson(req));
    const [env] = await db.select().from(s.environments).where(and(eq(s.environments.id, id), eq(s.environments.organizationId, ctx.organization.id)));
    if (!env || env.status === "deleted") throw new ApiError("Environment not found.", 404);
    if (env.protected) throw new ApiError("This environment is protected. Unprotect it first before deleting.", 409);
    const [active] = await db.select().from(s.deployments).where(and(eq(s.deployments.environmentId, id), inArray(s.deployments.status, ACTIVE_STATUSES))).limit(1);
    if (active) throw new ApiError("Cancel the active deployment before deleting this environment.", 409);
    await db.update(s.environments).set({ status: "deleted", protected: false }).where(eq(s.environments.id, id));
    await audit(ctx.organization.id, ctx.user.id, "environment.deleted", "environment", id, { hostname: env.hostname, confirmed: confirm, mode: "sandbox" }); return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
