import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError, publicOrigin } from "@/lib/auth";
import { audit } from "@/lib/data";
const roles = z.enum(["Admin", "Developer", "Viewer", "QA Engineer"]);
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin"); const input = z.object({ email: z.email().max(254), role: roles }).parse(await checkedJson(req)); const email = input.email.toLowerCase();
    await db.transaction(async tx => {
      let [user] = await tx.select().from(s.users).where(eq(s.users.email, email));
      if (!user) [user] = await tx.insert(s.users).values({ name: email.split("@")[0], email }).returning();
      const [existing] = await tx.select().from(s.memberships).where(and(eq(s.memberships.organizationId, ctx.organization.id), eq(s.memberships.userId, user.id)));
      if (existing) throw new ApiError("This person is already a member or has a pending invitation.", 409);
      await tx.insert(s.memberships).values({ organizationId: ctx.organization.id, userId: user.id, role: input.role, status: user.passwordHash ? "active" : "invited" });
      await tx.insert(s.auditLogs).values({ organizationId: ctx.organization.id, actorId: ctx.user.id, action: "member.invited", resourceType: "member", resourceId: user.id, details: { email, role: input.role } });
    });
    if (process.env.SMTP_URL) { const { sendMail } = await import("@/lib/mail"); await sendMail(email, "You're invited to DeployFlow", `${ctx.user.name} invited you to ${ctx.organization.name}. Register with this email at ${publicOrigin(req)}/login?mode=register to join the workspace.`); }
    return Response.json({ ok: true, message: process.env.SMTP_URL ? "Invitation sent." : "Invitation saved. The member can join by registering with this email." }, { status: 201 });
  } catch (error) { return apiError(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin"); const { id, role } = z.object({ id: z.uuid(), role: roles }).parse(await checkedJson(req));
    const [member] = await db.update(s.memberships).set({ role }).where(and(eq(s.memberships.id, id), eq(s.memberships.organizationId, ctx.organization.id), ne(s.memberships.role, "Owner"))).returning();
    if (!member) throw new ApiError("Member not found, or organization ownership cannot be changed here.", 404);
    await audit(ctx.organization.id, ctx.user.id, "member.role_changed", "member", member.userId, { role }); return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin"); const { id } = z.object({ id: z.uuid() }).parse(await checkedJson(req));
    const [member] = await db.delete(s.memberships).where(and(eq(s.memberships.id, id), eq(s.memberships.organizationId, ctx.organization.id), ne(s.memberships.role, "Owner"))).returning();
    if (!member) throw new ApiError("Member not found, or the organization owner cannot be removed.", 404);
    await audit(ctx.organization.id, ctx.user.id, "member.removed", "member", member.userId); return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
