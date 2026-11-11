import { after, NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { deployments } from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin } from "@/lib/auth";
import { enqueueDeployment, runDeployment } from "@/lib/deployments";
import { rateLimit } from "@/lib/rate-limit";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  try {
    const ctx = await requestContext(req); const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1); const projectId = req.nextUrl.searchParams.get("projectId");
    const rows = await db.select().from(deployments).where(and(eq(deployments.organizationId, ctx.organization.id), projectId ? eq(deployments.projectId, projectId) : undefined)).orderBy(desc(deployments.createdAt));
    return Response.json({ data: rows.slice((page - 1) * 25, page * 25), total: rows.length, page, pageSize: 25 });
  } catch (error) { return apiError(error); }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy"); const input = z.object({ projectId: z.uuid(), branchId: z.uuid(), failureTest: z.boolean().default(false), idempotencyKey: z.string().max(100).optional() }).parse(await checkedJson(req));
    await rateLimit(`deploy:${ctx.organization.id}`, 30, 60);
    if (input.idempotencyKey) {
      const [existing] = await db.select().from(deployments).where(and(eq(deployments.organizationId, ctx.organization.id), eq(deployments.trigger, `manual:${input.idempotencyKey}`))).limit(1);
      if (existing) return Response.json({ deployment: existing });
    }
    const deployment = await enqueueDeployment({ organizationId: ctx.organization.id, projectId: input.projectId, branchId: input.branchId, actorId: ctx.user.id, trigger: input.failureTest ? "failure-test" : input.idempotencyKey ? `manual:${input.idempotencyKey}` : "manual" });
    after(() => runDeployment(deployment.id)); return Response.json({ deployment }, { status: 202 });
  } catch (error) { return apiError(error); }
}
