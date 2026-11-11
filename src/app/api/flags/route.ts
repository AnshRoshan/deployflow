import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { audit } from "@/lib/data";

const key = z.string().trim().min(2).max(60).regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores.");
const createSchema = z.object({ key, description: z.string().max(200).default(""), projectId: z.uuid().nullable().optional(), enabled: z.boolean().default(false), rollout: z.number().int().min(0).max(100).default(100), environments: z.array(z.enum(["production", "preview", "development"])).min(1).default(["production", "preview"]) });
const updateSchema = z.object({ id: z.uuid(), enabled: z.boolean().optional(), rollout: z.number().int().min(0).max(100).optional(), description: z.string().max(200).optional(), environments: z.array(z.enum(["production", "preview", "development"])).min(1).optional() });

async function assertProject(orgId: string, projectId?: string | null) {
  if (!projectId) return;
  const [project] = await db.select().from(s.projects).where(and(eq(s.projects.id, projectId), eq(s.projects.organizationId, orgId)));
  if (!project) throw new ApiError("Project not found in this organization.", 404);
}

export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy");
    const input = createSchema.parse(await checkedJson(req));
    await assertProject(ctx.organization.id, input.projectId);
    const [flag] = await db.insert(s.featureFlags).values({ ...input, projectId: input.projectId || null, organizationId: ctx.organization.id }).returning();
    await audit(ctx.organization.id, ctx.user.id, "feature_flag.created", "feature_flag", flag.id, { key: flag.key });
    return Response.json({ flag }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) return Response.json({ error: "A flag with this key already exists." }, { status: 409 });
    return apiError(error);
  }
}
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy");
    const { id, ...fields } = updateSchema.parse(await checkedJson(req));
    const [flag] = await db.update(s.featureFlags).set({ ...fields, updatedAt: new Date() }).where(and(eq(s.featureFlags.id, id), eq(s.featureFlags.organizationId, ctx.organization.id))).returning();
    if (!flag) throw new ApiError("Feature flag not found.", 404);
    await audit(ctx.organization.id, ctx.user.id, "feature_flag.updated", "feature_flag", id, { key: flag.key, fields: Object.keys(fields) });
    return Response.json({ flag });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin");
    const { id } = z.object({ id: z.uuid() }).parse(await checkedJson(req));
    const [flag] = await db.delete(s.featureFlags).where(and(eq(s.featureFlags.id, id), eq(s.featureFlags.organizationId, ctx.organization.id))).returning();
    if (!flag) throw new ApiError("Feature flag not found.", 404);
    await audit(ctx.organization.id, ctx.user.id, "feature_flag.deleted", "feature_flag", id, { key: flag.key });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
