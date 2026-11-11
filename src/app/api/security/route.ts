import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { ensurePolicy, POLICY_FIELDS, runSecurityGates } from "@/lib/security-policy";
import { audit } from "@/lib/data";

const policySchema = z.object({
  projectId: z.uuid(),
  secretScanning: z.boolean().optional(), sast: z.boolean().optional(), dependencyAudit: z.boolean().optional(),
  containerScan: z.boolean().optional(), licenseCheck: z.boolean().optional(), sbom: z.boolean().optional(),
  imageSigning: z.boolean().optional(), nonRootRuntime: z.boolean().optional(), readOnlyRootfs: z.boolean().optional(),
  networkIsolation: z.boolean().optional(), requireApprovals: z.boolean().optional(), failOnFindings: z.boolean().optional(),
  requiredApprovals: z.number().int().min(0).max(10).optional(),
  maxSeverity: z.enum(["low", "medium", "high", "critical"]).optional(),
  allowedRegistries: z.string().max(400).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requestContext(req);
    const [policies, checks] = await Promise.all([
      db.select().from(s.securityPolicies).where(eq(s.securityPolicies.organizationId, ctx.organization.id)),
      db.select().from(s.pipelineChecks).where(eq(s.pipelineChecks.organizationId, ctx.organization.id)),
    ]);
    return Response.json({ policies, checks, fields: POLICY_FIELDS });
  } catch (error) { return apiError(error); }
}

export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin");
    const input = policySchema.parse(await checkedJson(req));
    const [project] = await db.select().from(s.projects).where(and(eq(s.projects.id, input.projectId), eq(s.projects.organizationId, ctx.organization.id)));
    if (!project) throw new ApiError("Project not found in this organization.", 404);
    await ensurePolicy(ctx.organization.id, input.projectId);
    const { projectId, ...fields } = input;
    const [policy] = await db.update(s.securityPolicies).set({ ...fields, updatedAt: new Date() }).where(and(eq(s.securityPolicies.projectId, projectId), eq(s.securityPolicies.organizationId, ctx.organization.id))).returning();
    await audit(ctx.organization.id, ctx.user.id, "security.policy_updated", "project", projectId, { project: project.name, changes: Object.keys(fields) });
    return Response.json({ policy });
  } catch (error) { return apiError(error); }
}

export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy");
    const { deploymentId } = z.object({ deploymentId: z.uuid() }).parse(await checkedJson(req));
    const [deployment] = await db.select().from(s.deployments).where(and(eq(s.deployments.id, deploymentId), eq(s.deployments.organizationId, ctx.organization.id)));
    if (!deployment) throw new ApiError("Deployment not found.", 404);
    const checks = await runSecurityGates(deploymentId);
    await audit(ctx.organization.id, ctx.user.id, "security.gates_evaluated", "deployment", deploymentId, { checks: checks.length });
    return Response.json({ checks });
  } catch (error) { return apiError(error); }
}
