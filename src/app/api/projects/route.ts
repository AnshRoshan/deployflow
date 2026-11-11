import { after, NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { encrypt } from "@/lib/security";
import { githubRequest, integrationToken, type GithubRepo, type GithubBranch } from "@/lib/github";
import { enqueueDeployment, runDeployment, randomCommit } from "@/lib/deployments";
import { audit } from "@/lib/data";
import { rateLimit } from "@/lib/rate-limit";
export const maxDuration = 60;
const projectSchema = z.object({ name: z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers, and hyphens."), repository: z.string().trim().regex(/^[\w.-]+\/[\w.-]+$/, "Enter a repository as owner/repository."), framework: z.enum(["Next.js", "React", "Node.js", "Python", "FastAPI", "Django", "Static", "Docker"]).default("Next.js"), defaultBranch: z.string().min(1).max(100).default("main"), description: z.string().max(200).default(""), runnerType: z.enum(["sandbox-docker", "github-actions", "gitlab-runner"]).default("sandbox-docker"), deploy: z.boolean().default(true) });
export async function GET(req: NextRequest) {
  try { const ctx = await requestContext(req); const rows = await db.select().from(s.projects).where(eq(s.projects.organizationId, ctx.organization.id)); const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1); return Response.json({ data: rows.slice((page - 1) * 25, page * 25), total: rows.length, page, pageSize: 25 }); } catch (error) { return apiError(error); }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy"); const input = projectSchema.parse(await checkedJson(req)); await rateLimit(`projects:${ctx.organization.id}`, 20, 600);
    const token = await integrationToken(ctx.organization.id).catch(e => { if (e instanceof ApiError && e.status === 409) return null; throw e; });
    let repo: GithubRepo | undefined; let remoteBranches: GithubBranch[] = [];
    if (token) {
      repo = await githubRequest<GithubRepo>(token, `/repos/${input.repository.split("/").map(encodeURIComponent).join("/")}`);
      remoteBranches = await githubRequest<GithubBranch[]>(token, `/repos/${input.repository.split("/").map(encodeURIComponent).join("/")}/branches?per_page=100`);
      input.defaultBranch = repo.default_branch;
    }
    const [duplicate] = await db.select().from(s.projects).where(and(eq(s.projects.organizationId, ctx.organization.id), eq(s.projects.repository, input.repository)));
    if (duplicate) throw new ApiError("This repository is already connected to a project.", 409);
    const project = await db.transaction(async tx => {
      const [p] = await tx.insert(s.projects).values({ organizationId: ctx.organization.id, name: input.name, repository: input.repository, framework: input.framework, defaultBranch: input.defaultBranch, description: input.description || (repo?.description ?? ""), runnerType: input.runnerType, color: ["mint", "lavender", "blue", "peach"][Math.floor(Math.random() * 4)] }).returning();
      const options = remoteBranches.length ? remoteBranches.map(b => ({ organizationId: ctx.organization.id, projectId: p.id, name: b.name, commitSha: b.commit.sha, protected: b.name === p.defaultBranch })) : [{ organizationId: ctx.organization.id, projectId: p.id, name: p.defaultBranch, commitSha: randomCommit(), protected: true }];
      await tx.insert(s.branches).values(options);
      await tx.insert(s.variables).values({ organizationId: ctx.organization.id, projectId: p.id, key: "NODE_ENV", valueCipher: encrypt("production"), phase: "runtime" });
      await tx.insert(s.securityPolicies).values({ organizationId: ctx.organization.id, projectId: p.id });
      await tx.insert(s.auditLogs).values({ organizationId: ctx.organization.id, actorId: ctx.user.id, action: "project.created", resourceType: "project", resourceId: p.id, details: { repository: p.repository, source: token ? "github" : "sandbox" } }); return p;
    });
    let deployment = null;
    if (input.deploy) { deployment = await enqueueDeployment({ organizationId: ctx.organization.id, projectId: project.id, actorId: ctx.user.id }); after(() => runDeployment(deployment!.id)); }
    return Response.json({ project, deployment }, { status: 201 });
  } catch (error) { return apiError(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy"); const body = await checkedJson(req); const { id, ...fields } = z.object({ id: z.uuid(), name: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(), description: z.string().max(200).optional(), buildCommand: z.string().min(1).max(500).optional(), startCommand: z.string().min(1).max(500).optional(), dockerfile: z.string().max(200).optional(), port: z.number().int().min(1).max(65535).optional(), cpu: z.number().min(0.25).max(4).optional(), memory: z.number().int().min(256).max(8192).optional(), autoDeploy: z.boolean().optional(), ttlHours: z.number().int().min(1).max(720).optional(), healthPath: z.string().regex(/^\/[\w./-]*$/).optional(), branchRules: z.string().max(300).optional(), runnerType: z.enum(["sandbox-docker", "github-actions", "gitlab-runner"]).optional() }).parse(body);
    const [project] = await db.update(s.projects).set(fields).where(and(eq(s.projects.id, id), eq(s.projects.organizationId, ctx.organization.id))).returning();
    if (!project) throw new ApiError("Project not found.", 404); await audit(ctx.organization.id, ctx.user.id, "project.updated", "project", id, fields); return Response.json({ project });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin"); const { id } = z.object({ id: z.uuid() }).parse(await checkedJson(req));
    const project = await db.transaction(async tx => {
      const { inArray } = await import("drizzle-orm");
      const { ACTIVE_STATUSES } = await import("@/lib/deployments");
      await tx.update(s.deployments).set({ status: "cancelled", finishedAt: new Date(), leaseUntil: null }).where(and(eq(s.deployments.projectId, id), eq(s.deployments.organizationId, ctx.organization.id), inArray(s.deployments.status, ACTIVE_STATUSES)));
      const [deleted] = await tx.delete(s.projects).where(and(eq(s.projects.id, id), eq(s.projects.organizationId, ctx.organization.id))).returning();
      if (!deleted) throw new ApiError("Project not found.", 404);
      await tx.insert(s.auditLogs).values({ organizationId: ctx.organization.id, actorId: ctx.user.id, action: "project.deleted", resourceType: "project", resourceId: id, details: { name: deleted.name, repository: deleted.repository } });
      return deleted;
    });
    return Response.json({ ok: true, name: project.name });
  } catch (error) { return apiError(error); }
}
