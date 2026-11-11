import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { integrationToken, githubRequest, type GithubBranch } from "@/lib/github";
import { randomCommit } from "@/lib/deployments";
import { audit } from "@/lib/data";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy"); const input = z.object({ projectId: z.uuid(), name: z.string().min(1).max(100).regex(/^[\w./-]+$/).optional(), sync: z.boolean().default(false) }).parse(await checkedJson(req));
    const [project] = await db.select().from(s.projects).where(and(eq(s.projects.id, input.projectId), eq(s.projects.organizationId, ctx.organization.id))); if (!project) throw new ApiError("Project not found.", 404);
    const token = await integrationToken(ctx.organization.id); let discovered: GithubBranch[];
    if (token) discovered = await githubRequest<GithubBranch[]>(token, `/repos/${project.repository.split("/").map(encodeURIComponent).join("/")}/branches?per_page=100`);
    else if (input.name) discovered = [{ name: input.name, commit: { sha: randomCommit() } }];
    else discovered = (await db.select().from(s.branches).where(eq(s.branches.projectId, project.id))).map(b => ({ name: b.name, commit: { sha: b.commitSha } }));
    for (const branch of discovered) await db.insert(s.branches).values({ organizationId: ctx.organization.id, projectId: project.id, name: branch.name, commitSha: branch.commit.sha, protected: branch.name === project.defaultBranch }).onConflictDoUpdate({ target: [s.branches.projectId, s.branches.name], set: { commitSha: branch.commit.sha, updatedAt: new Date() } });
    await audit(ctx.organization.id, ctx.user.id, "branches.synchronized", "project", project.id, { count: discovered.length, source: token ? "github" : "sandbox" }); return Response.json({ ok: true, count: discovered.length });
  } catch (error) { return apiError(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy"); const input = z.object({ id: z.uuid(), enabled: z.boolean().optional(), protected: z.boolean().optional() }).parse(await checkedJson(req));
    const [branch] = await db.update(s.branches).set({ ...(input.enabled !== undefined ? { enabled: input.enabled } : {}), ...(input.protected !== undefined ? { protected: input.protected } : {}) }).where(and(eq(s.branches.id, input.id), eq(s.branches.organizationId, ctx.organization.id))).returning(); if (!branch) throw new ApiError("Branch not found.", 404);
    if (input.protected !== undefined) await db.update(s.environments).set({ protected: input.protected }).where(eq(s.environments.branchId, branch.id));
    await audit(ctx.organization.id, ctx.user.id, "branch.updated", "branch", branch.id, { name: branch.name, enabled: input.enabled }); return Response.json({ branch });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy");
    const { id, mode } = z.object({ id: z.uuid(), mode: z.enum(["cleanup", "delete"]).default("cleanup") }).parse(await checkedJson(req));
    const [branch] = await db.select().from(s.branches).where(and(eq(s.branches.id, id), eq(s.branches.organizationId, ctx.organization.id)));
    if (!branch) throw new ApiError("Branch not found.", 404);
    const [project] = await db.select().from(s.projects).where(eq(s.projects.id, branch.projectId));
    const [env] = await db.select().from(s.environments).where(eq(s.environments.branchId, id));
    if (env?.protected) throw new ApiError("Unprotect this environment before deleting or cleaning it up.", 409);
    const { inArray } = await import("drizzle-orm");
    const { ACTIVE_STATUSES, cleanupExpiredEnvironments } = await import("@/lib/deployments");
    const [active] = await db.select({ id: s.deployments.id }).from(s.deployments).where(and(eq(s.deployments.branchId, id), inArray(s.deployments.status, ACTIVE_STATUSES))).limit(1);
    if (active) throw new ApiError("Cancel the active deployment on this branch first.", 409);
    if (mode === "delete") {
      if (project && branch.name === project.defaultBranch) throw new ApiError("The project's default branch cannot be deleted.", 409);
      await db.delete(s.branches).where(and(eq(s.branches.id, id), eq(s.branches.organizationId, ctx.organization.id)));
      await audit(ctx.organization.id, ctx.user.id, "branch.deleted", "branch", id, { branch: branch.name, project: project?.name });
      return Response.json({ ok: true, deleted: true });
    }
    if (env && env.status !== "deleted") {
      await db.update(s.environments).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.environments.id, env.id));
      await cleanupExpiredEnvironments(ctx.organization.id);
    }
    await audit(ctx.organization.id, ctx.user.id, "environment.cleanup_scheduled", "branch", id, { branch: branch.name });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
