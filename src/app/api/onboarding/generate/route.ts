import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError, publicOrigin } from "@/lib/auth";
import { generateRepositoryAssets } from "@/lib/generators";
import { audit } from "@/lib/data";
import { ensurePolicy } from "@/lib/security-policy";

const schema = z.object({ projectId: z.uuid(), provider: z.enum(["github", "gitlab", "both"]).default("both"), enableSecurity: z.boolean().default(true) });

export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const ctx = await requestContext(req, "deploy");
    const input = schema.parse(await checkedJson(req));
    const [project] = await db.select().from(s.projects).where(and(eq(s.projects.id, input.projectId), eq(s.projects.organizationId, ctx.organization.id)));
    if (!project) throw new ApiError("Project not found in this organization.", 404);
    const policy = await ensurePolicy(ctx.organization.id, project.id);
    const files = generateRepositoryAssets({
      repository: project.repository, projectName: project.name, framework: project.framework,
      defaultBranch: project.defaultBranch, buildCommand: project.buildCommand, healthPath: project.healthPath,
      port: project.port, provider: input.provider, deployflowUrl: publicOrigin(req),
      organizationId: ctx.organization.id, projectId: project.id,
      enableSecurity: input.enableSecurity && policy.sast,
    });
    for (const file of files) {
      await db.insert(s.generatedAssets).values({ organizationId: ctx.organization.id, projectId: project.id, kind: file.kind, path: file.path, content: file.content, status: "generated" })
        .onConflictDoUpdate({ target: [s.generatedAssets.organizationId, s.generatedAssets.projectId, s.generatedAssets.path], set: { content: file.content, kind: file.kind, status: "generated", createdAt: new Date() } });
    }
    await audit(ctx.organization.id, ctx.user.id, "onboarding.assets_generated", "project", project.id, { provider: input.provider, files: files.map(f => f.path) });
    return Response.json({ files, repository: project.repository });
  } catch (error) { return apiError(error); }
}
