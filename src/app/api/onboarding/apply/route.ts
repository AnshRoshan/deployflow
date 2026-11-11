import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { integrationToken, commitFilesToGitHub } from "@/lib/github";
import { audit } from "@/lib/data";
import { hashToken, newToken } from "@/lib/security";

const schema = z.object({
  projectId: z.uuid(),
  paths: z.array(z.string().max(200)).min(1).max(12),
  branch: z.string().min(1).max(100).default("main"),
  commitMessage: z.string().trim().min(4).max(120).default("chore: add DeployFlow CI and security workflows"),
  mode: z.enum(["github", "simulate"]).default("simulate"),
});

const ALLOWED_PREFIXES = [".github/workflows/", ".github/dependabot.yml", ".gitlab-ci.yml", "deployflow.yml", "SECURITY.md"];

export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const ctx = await requestContext(req, "admin");
    const input = schema.parse(await checkedJson(req));
    const [project] = await db.select().from(s.projects).where(and(eq(s.projects.id, input.projectId), eq(s.projects.organizationId, ctx.organization.id)));
    if (!project) throw new ApiError("Project not found in this organization.", 404);
    for (const path of input.paths) {
      if (!ALLOWED_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix))) throw new ApiError(`Refusing to write outside the allowed CI configuration paths: ${path}`, 400);
    }
    const assets = await db.select().from(s.generatedAssets).where(and(eq(s.generatedAssets.organizationId, ctx.organization.id), eq(s.generatedAssets.projectId, project.id), inArray(s.generatedAssets.path, input.paths)));
    if (assets.length !== input.paths.length) throw new ApiError("Generate the selected files before committing them.", 409);

    let token: string | null = null;
    if (input.mode === "github") {
      try { token = await integrationToken(ctx.organization.id); } catch { token = null; }
      if (!token) throw new ApiError("Connect a live GitHub account with Contents: write and Workflows: write permission before committing. You can still use sandbox simulation.", 409);
    }

    let results: { path: string; commitSha: string; status: string }[];
    let mode = input.mode;
    if (token) {
      const committed = await commitFilesToGitHub(token, project.repository, input.branch, assets.map(a => ({ path: a.path, content: a.content })), input.commitMessage);
      results = committed.map(r => ({ ...r, status: r.status }));
    } else {
      mode = "simulate";
      const seed = newToken();
      results = assets.map((a, i) => ({ path: a.path, commitSha: hashToken(seed + i).slice(0, 40), status: "simulated" }));
    }
    for (const result of results) {
      await db.update(s.generatedAssets).set({ status: mode === "github" ? "committed" : "simulated", commitSha: result.commitSha })
        .where(and(eq(s.generatedAssets.organizationId, ctx.organization.id), eq(s.generatedAssets.projectId, project.id), eq(s.generatedAssets.path, result.path)));
    }
    await audit(ctx.organization.id, ctx.user.id, "onboarding.assets_applied", "project", project.id, { mode, branch: input.branch, paths: input.paths, repository: project.repository });
    return Response.json({ ok: true, mode, results, repository: project.repository, branch: input.branch });
  } catch (error) { return apiError(error); }
}
