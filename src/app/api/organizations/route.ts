import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestAuth, apiError, checkedJson, sameOrigin, ApiError } from "@/lib/auth";
import { hashToken, newToken } from "@/lib/security";
import { DEMO_ORG_ID } from "@/lib/seed";
import { workspaceCookieOptions } from "@/lib/cookies";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const auth = await requestAuth(req); const { name } = z.object({ name: z.string().trim().min(2).max(60) }).parse(await checkedJson(req));
    const org = await db.transaction(async tx => {
      const [org] = await tx.insert(s.organizations).values({ name, slug: `${name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30)}-${randomUUID().slice(0, 6)}`, plan: "Starter", previewQuota: 10 }).returning();
      await tx.insert(s.memberships).values({ organizationId: org.id, userId: auth.user.id, role: "Owner" });
      await tx.insert(s.runners).values({ organizationId: org.id, name: "df-sandbox-docker-01", kind: "sandbox-docker", status: "online", region: "sandbox-local", capacity: 4, tokenHash: hashToken(newToken()), prefix: `dfr_${newToken().slice(0, 6)}` });
      await tx.insert(s.auditLogs).values({ organizationId: org.id, actorId: auth.user.id, action: "organization.created", resourceType: "organization", resourceId: org.id }); return org;
    });
    const response = NextResponse.json({ organization: org }, { status: 201 }); response.cookies.set("df_organization", org.id, await workspaceCookieOptions()); return response;
  } catch (error) { return apiError(error); }
}
export async function PUT(req: NextRequest) {
  try {
    sameOrigin(req); const auth = await requestAuth(req); const { organizationId } = z.object({ organizationId: z.uuid() }).parse(await checkedJson(req));
    const [member] = await db.select().from(s.memberships).where(and(eq(s.memberships.organizationId, organizationId), eq(s.memberships.userId, auth.user.id), eq(s.memberships.status, "active")));
    if (!member) throw new ApiError("Organization access denied.", 403);
    const response = NextResponse.json({ ok: true }); response.cookies.set("df_organization", organizationId, await workspaceCookieOptions()); return response;
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req); const auth = await requestAuth(req); const { organizationId } = z.object({ organizationId: z.uuid() }).parse(await checkedJson(req));
    if (organizationId === DEMO_ORG_ID) throw new ApiError("The shared sandbox organization cannot be deleted.", 409);
    const memberships = await db.select().from(s.memberships).where(and(eq(s.memberships.userId, auth.user.id), eq(s.memberships.status, "active")));
    const target = memberships.find(m => m.organizationId === organizationId);
    if (!target || target.role !== "Owner") throw new ApiError("Only the organization owner can delete a workspace.", 403);
    const remaining = memberships.filter(m => m.organizationId !== organizationId);
    if (!remaining.length) throw new ApiError("Create another organization before deleting your only workspace.", 409);
    await db.delete(s.organizations).where(and(eq(s.organizations.id, organizationId), ne(s.organizations.id, DEMO_ORG_ID)));
    const nextOrganizationId = remaining[0].organizationId;
    const response = NextResponse.json({ ok: true, nextOrganizationId });
    response.cookies.set("df_organization", nextOrganizationId, await workspaceCookieOptions());
    return response;
  } catch (error) { return apiError(error); }
}
