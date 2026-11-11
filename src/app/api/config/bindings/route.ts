import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { audit } from "@/lib/data";
import { generateSecretManifest } from "@/lib/generators";

const providers = ["github-actions", "gitlab-ci", "vault", "aws-secrets-manager", "deployflow"] as const;
const createSchema = z.object({
  provider: z.enum(providers), externalName: z.string().trim().min(2).max(100).regex(/^[A-Za-z_][A-Za-z0-9_./-]*$/),
  internalKey: z.string().trim().min(2).max(100).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  kind: z.enum(["secret", "variable"]).default("secret"),
  direction: z.enum(["outbound", "inbound"]).default("outbound"),
  projectId: z.uuid().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requestContext(req);
    const bindings = await db.select().from(s.secretBindings).where(eq(s.secretBindings.organizationId, ctx.organization.id));
    return Response.json({ bindings, manifest: generateSecretManifest(bindings) });
  } catch (error) { return apiError(error); }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin");
    const input = createSchema.parse(await checkedJson(req));
    if (input.projectId) {
      const [project] = await db.select().from(s.projects).where(and(eq(s.projects.id, input.projectId), eq(s.projects.organizationId, ctx.organization.id)));
      if (!project) throw new ApiError("Project not found.", 404);
    }
    const [binding] = await db.insert(s.secretBindings).values({ ...input, projectId: input.projectId || null, organizationId: ctx.organization.id, syncStatus: "pending" }).returning();
    await audit(ctx.organization.id, ctx.user.id, "config.binding_created", "binding", binding.id, { provider: binding.provider, externalName: binding.externalName });
    return Response.json({ binding }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) return Response.json({ error: "This external name is already bound for that provider." }, { status: 409 });
    return apiError(error);
  }
}
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin");
    const { id, syncStatus } = z.object({ id: z.uuid(), syncStatus: z.enum(["pending", "configured", "synced", "error"]) }).parse(await checkedJson(req));
    const [binding] = await db.update(s.secretBindings).set({ syncStatus, lastSyncedAt: new Date() }).where(and(eq(s.secretBindings.id, id), eq(s.secretBindings.organizationId, ctx.organization.id))).returning();
    if (!binding) throw new ApiError("Binding not found.", 404);
    await audit(ctx.organization.id, ctx.user.id, "config.binding_synced", "binding", id, { provider: binding.provider, syncStatus });
    return Response.json({ binding });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin");
    const { id } = z.object({ id: z.uuid() }).parse(await checkedJson(req));
    const [binding] = await db.delete(s.secretBindings).where(and(eq(s.secretBindings.id, id), eq(s.secretBindings.organizationId, ctx.organization.id))).returning();
    if (!binding) throw new ApiError("Binding not found.", 404);
    await audit(ctx.organization.id, ctx.user.id, "config.binding_deleted", "binding", id, { provider: binding.provider });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
