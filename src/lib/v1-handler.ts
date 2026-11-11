import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, ApiError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import * as projects from "@/app/api/projects/route";
import * as deployments from "@/app/api/deployments/route";
import * as deploymentDetail from "@/app/api/deployments/[id]/route";
import * as environmentDetail from "@/app/api/environments/[id]/route";
import * as flags from "@/app/api/flags/route";
import * as bindings from "@/app/api/config/bindings/route";
import * as onboarding from "@/app/api/onboarding/generate/route";
import * as ai from "@/app/api/ai/route";
import { getWorkspaceData } from "@/lib/data";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ path?: string[] }> };
async function handle(req: NextRequest, context: Context) {
  try {
    const ctx = await requestContext(req); await rateLimit(`api:${ctx.user.id}`, 120, 60);
    const path = (await context.params).path || []; const [resource, id, action] = path;
    const detailContext = { params: Promise.resolve({ id: id || "" }) };
    const rewritten = (body: Record<string, unknown>, method = "PATCH") => { const headers = new Headers(req.headers); headers.delete("content-length"); headers.set("content-type", "application/json"); return new NextRequest(req.url, { method, headers, body: JSON.stringify(body) }); };
    if (resource === "projects" && !id) { if (req.method === "GET") return projects.GET(req); if (req.method === "POST") return projects.POST(req); }
    if (resource === "projects" && id) {
      z.uuid().parse(id); const [project] = await db.select().from(s.projects).where(and(eq(s.projects.id, id), eq(s.projects.organizationId, ctx.organization.id))); if (!project) throw new ApiError("Project not found.", 404);
      if (action === "branches" && req.method === "GET") return Response.json({ data: await db.select().from(s.branches).where(eq(s.branches.projectId, id)) });
      if (!action && req.method === "GET") return Response.json({ data: project });
      if (!action && req.method === "PATCH") return projects.PATCH(rewritten({ ...await req.json(), id }));
      if (!action && req.method === "DELETE") return projects.DELETE(rewritten({ id }, "DELETE"));
    }
    if (resource === "deployments" && !id) { if (req.method === "GET") return deployments.GET(req); if (req.method === "POST") return deployments.POST(req); }
    if (resource === "deployments" && id) {
      z.uuid().parse(id);
      if (!action && req.method === "GET") return deploymentDetail.GET(req, detailContext);
      if (action === "logs" && req.method === "GET") { const response = await deploymentDetail.GET(req, detailContext); if (!response.ok) return response; return Response.json({ data: (await response.json()).logs }); }
      if (["cancel", "rollback", "retry"].includes(action) && req.method === "POST") return deploymentDetail.PATCH(rewritten({ action }), detailContext);
    }
    if (resource === "environments") {
      if (!id && req.method === "GET") return Response.json({ data: await db.select().from(s.environments).where(eq(s.environments.organizationId, ctx.organization.id)) });
      if (id) { z.uuid().parse(id); if (!action && req.method === "GET") { const [env] = await db.select().from(s.environments).where(and(eq(s.environments.id, id), eq(s.environments.organizationId, ctx.organization.id))); if (!env) throw new ApiError("Environment not found.", 404); return Response.json({ data: env }); } if (!action && req.method === "DELETE") return environmentDetail.DELETE(rewritten({ confirm: true }, "DELETE"), detailContext); }
    }
    if (resource === "usage" && req.method === "GET") {
      const [usage] = await db.select({ activeEnvironments: sql<number>`count(*) filter (where ${s.environments.status} = 'ready')::int` }).from(s.environments).where(eq(s.environments.organizationId, ctx.organization.id));
      return Response.json({ data: { ...usage, previewQuota: ctx.organization.previewQuota, mode: ctx.organization.mode, estimatedHourlyCost: Number((usage.activeEnvironments * 0.024).toFixed(2)), currency: "USD", estimateOnly: true } });
    }
    if (resource === "organizations" && req.method === "GET") { const data = await getWorkspaceData(ctx.user.id, ctx.sessionId, ctx.organization.id); return Response.json({ data: data.organizations }); }
    if (resource === "security" && req.method === "GET") {
      const [policies, checks] = await Promise.all([
        db.select().from(s.securityPolicies).where(eq(s.securityPolicies.organizationId, ctx.organization.id)),
        db.select().from(s.pipelineChecks).where(eq(s.pipelineChecks.organizationId, ctx.organization.id)),
      ]);
      return Response.json({ data: { policies, checks }, total: checks.length });
    }
    if (resource === "flags") {
      if (req.method === "GET") return Response.json({ data: await db.select().from(s.featureFlags).where(eq(s.featureFlags.organizationId, ctx.organization.id)) });
      if (req.method === "POST") return flags.POST(req);
      if (req.method === "PATCH") return flags.PATCH(req);
      if (req.method === "DELETE") return flags.DELETE(req);
    }
    if (resource === "secrets" && req.method === "GET") {
      return Response.json({ data: await db.select().from(s.secretBindings).where(eq(s.secretBindings.organizationId, ctx.organization.id)) });
    }
    if (resource === "onboarding" && action === "generate" && req.method === "POST") return onboarding.POST(req);
    if (resource === "onboarding" && req.method === "POST") return onboarding.POST(rewritten({ ...await req.json(), projectId: id }, "POST"));
    if (resource === "assistant" && req.method === "POST") return ai.POST(req);
    throw new ApiError("Endpoint not found. See /api/openapi for the API contract.", 404);
  } catch (error) { return apiError(error); }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
