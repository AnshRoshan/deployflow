import { after, NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { ACTIVE_STATUSES, enqueueDeployment, runDeployment, previousDeployment } from "@/lib/deployments";
import { audit } from "@/lib/data";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, context: Context) {
  try {
    const ctx = await requestContext(req); const { id } = await context.params;
    const [row] = await db.select({ deployment: s.deployments, project: s.projects, branch: s.branches }).from(s.deployments).innerJoin(s.projects, eq(s.projects.id, s.deployments.projectId)).innerJoin(s.branches, eq(s.branches.id, s.deployments.branchId)).where(and(eq(s.deployments.id, id), eq(s.deployments.organizationId, ctx.organization.id)));
    if (!row) throw new ApiError("Deployment not found.", 404);
    const logs = await db.select().from(s.deploymentLogs).where(and(eq(s.deploymentLogs.deploymentId, id), eq(s.deploymentLogs.organizationId, ctx.organization.id))).orderBy(s.deploymentLogs.createdAt);
    const history = await db.select().from(s.deployments).where(and(eq(s.deployments.environmentId, row.deployment.environmentId), eq(s.deployments.organizationId, ctx.organization.id))).orderBy(desc(s.deployments.createdAt)).limit(20);
    return Response.json({ ...row, logs, history });
  } catch (error) { return apiError(error); }
}
export async function PATCH(req: NextRequest, context: Context) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy"); const { id } = await context.params; const { action } = z.object({ action: z.enum(["cancel", "retry", "rollback"]) }).parse(await checkedJson(req));
    const [current] = await db.select().from(s.deployments).where(and(eq(s.deployments.id, id), eq(s.deployments.organizationId, ctx.organization.id)));
    if (!current) throw new ApiError("Deployment not found.", 404);
    if (action === "cancel") {
      const [cancelled] = await db.update(s.deployments).set({ status: "cancelled", finishedAt: new Date(), leaseUntil: null }).where(and(eq(s.deployments.id, id), inArray(s.deployments.status, ACTIVE_STATUSES))).returning();
      if (!cancelled) throw new ApiError("Only an active deployment can be cancelled.", 409);
      const [healthy] = await db.select().from(s.deployments).where(and(eq(s.deployments.environmentId, current.environmentId), eq(s.deployments.status, "ready"))).limit(1);
      await db.update(s.environments).set({ status: healthy ? "ready" : "stopped" }).where(eq(s.environments.id, current.environmentId));
      await db.insert(s.deploymentLogs).values({ organizationId: ctx.organization.id, deploymentId: id, stage: "cancelled", level: "warn", message: `Deployment cancelled by ${ctx.user.name}.` });
      await audit(ctx.organization.id, ctx.user.id, "deployment.cancelled", "deployment", id); return Response.json({ deployment: cancelled });
    }
    const source = action === "rollback" ? await previousDeployment(ctx.organization.id, id) : current;
    if (action === "retry" && ACTIVE_STATUSES.includes(current.status)) throw new ApiError("This deployment is already running.", 409);
    const deployment = await enqueueDeployment({ organizationId: ctx.organization.id, projectId: source.projectId, branchId: source.branchId, commitSha: source.commitSha, message: source.message, actorId: ctx.user.id, trigger: action });
    after(() => runDeployment(deployment.id)); return Response.json({ deployment }, { status: 202 });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest, context: Context) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin"); const { id } = await context.params;
    const [current] = await db.select().from(s.deployments).where(and(eq(s.deployments.id, id), eq(s.deployments.organizationId, ctx.organization.id)));
    if (!current) throw new ApiError("Deployment not found.", 404);
    if (ACTIVE_STATUSES.includes(current.status)) throw new ApiError("Cancel this active deployment before deleting its record.", 409);
    await db.delete(s.deployments).where(and(eq(s.deployments.id, id), eq(s.deployments.organizationId, ctx.organization.id)));
    await audit(ctx.organization.id, ctx.user.id, "deployment.deleted", "deployment", id, { commit: current.commitSha, status: current.status });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
