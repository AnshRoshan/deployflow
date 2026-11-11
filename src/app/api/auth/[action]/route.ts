import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as OTPAuth from "otpauth";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ApiError, apiError, checkedJson, requestAuth, sameOrigin, setSessionCookie, publicOrigin } from "@/lib/auth";
import { workspaceCookieOptions } from "@/lib/cookies";
import { decrypt, hashPassword, hashToken, newToken, verifyPassword } from "@/lib/security";
import { ensureDemo, DEMO_USER_ID } from "@/lib/seed";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/data";

export const runtime = "nodejs";
type Context = { params: Promise<{ action: string }> };
export async function GET(req: NextRequest, context: Context) {
  const { action } = await context.params;
  if (action !== "demo") return Response.json({ error: "Not found." }, { status: 404 });
  try { await ensureDemo(); await setSessionCookie(DEMO_USER_ID, "Demo workspace · Chrome"); return NextResponse.redirect(new URL("/overview", publicOrigin(req))); } catch (error) { return apiError(error); }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    sameOrigin(req); const { action } = await context.params; const body = await checkedJson(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    await rateLimit(`auth:${ip}:${action}`, action === "demo" ? 30 : 12, 600);
    if (action === "demo") { await ensureDemo(); const sessionToken = await setSessionCookie(DEMO_USER_ID, "Demo workspace · Chrome"); return Response.json({ ok: true, sessionToken }); }
    if (action === "logout") {
      const auth = await requestAuth(req); if (auth.sessionId) await db.delete(s.sessions).where(eq(s.sessions.id, auth.sessionId));
      const response = NextResponse.json({ ok: true }); response.cookies.set("df_logged_out", "1", { path: "/", maxAge: 31536000, sameSite: "lax" }); response.cookies.delete("df_session"); return response;
    }
    if (action === "register") {
      const input = z.object({ name: z.string().trim().min(2).max(80), email: z.email().max(254), password: z.string().min(10).max(128) }).parse(body);
      const email = input.email.toLowerCase(); await rateLimit(`register:${email}`, 5, 3600);
      const [exists] = await db.select().from(s.users).where(eq(s.users.email, email));
      if (exists?.passwordHash) throw new ApiError("An account already uses this email. Sign in or reset your password.", 409);
      const passwordHash = await hashPassword(input.password);
      const result = await db.transaction(async tx => {
        let user: typeof s.users.$inferSelect;
        if (exists) {
          const [pending] = await tx.select().from(s.users).where(eq(s.users.id, exists.id)).for("update");
          const [active] = await tx.select().from(s.memberships).where(and(eq(s.memberships.userId, pending.id), eq(s.memberships.status, "active"))).limit(1);
          if (pending.passwordHash || active) throw new ApiError("This account has already been activated. Please sign in.", 409);
          [user] = await tx.update(s.users).set({ name: input.name, passwordHash }).where(eq(s.users.id, pending.id)).returning();
        } else {
          [user] = await tx.insert(s.users).values({ name: input.name, email, passwordHash }).returning();
        }
        const [org] = await tx.insert(s.organizations).values({ name: `${input.name.split(" ")[0]}’s workspace`, slug: `workspace-${randomUUID().slice(0, 8)}`, plan: "Starter", previewQuota: 10 }).returning();
        await tx.insert(s.memberships).values({ organizationId: org.id, userId: user.id, role: "Owner" });
        const invites = await tx.update(s.memberships).set({ status: "active" }).where(and(eq(s.memberships.userId, user.id), eq(s.memberships.status, "invited"))).returning();
        for (const invite of invites) await tx.insert(s.auditLogs).values({ organizationId: invite.organizationId, actorId: user.id, action: "member.joined", resourceType: "member", resourceId: user.id, details: { role: invite.role } });
        await tx.insert(s.runners).values({ organizationId: org.id, name: "df-sandbox-docker-01", kind: "sandbox-docker", status: "online", region: "sandbox-local", capacity: 4, tokenHash: hashToken(newToken()), prefix: `dfr_${newToken().slice(0, 6)}` });
        await tx.insert(s.auditLogs).values({ organizationId: org.id, actorId: user.id, action: "organization.created", resourceType: "organization", resourceId: org.id });
        return { user, org };
      });
      const sessionToken = await setSessionCookie(result.user.id, req.headers.get("user-agent") || "Web browser");
      const response = NextResponse.json({ ok: true, sessionToken }); response.cookies.set("df_organization", result.org.id, await workspaceCookieOptions()); return response;
    }
    if (action === "login" || action === "mfa") {
      const input = action === "login" ? z.object({ email: z.email(), password: z.string().min(1).max(128) }).parse(body) : z.object({ challenge: z.string().length(64), code: z.string().regex(/^\d{6}$/) }).parse(body);
      let user: typeof s.users.$inferSelect | undefined;
      if ("challenge" in input) {
        const [challenge] = await db.select().from(s.authTokens).where(and(eq(s.authTokens.tokenHash, hashToken(input.challenge)), eq(s.authTokens.purpose, "mfa"), gt(s.authTokens.expiresAt, new Date())));
        if (!challenge) throw new ApiError("This verification challenge expired. Please sign in again.", 401);
        [user] = await db.select().from(s.users).where(eq(s.users.id, challenge.userId));
        if (!user?.mfaCipher) throw new ApiError("Authenticator verification is unavailable.", 401);
        const token = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(decrypt(user.mfaCipher)), digits: 6, period: 30 });
        if (token.validate({ token: input.code, window: 1 }) === null) throw new ApiError("That code isn't valid. Try the current authenticator code.", 401);
        await db.delete(s.authTokens).where(eq(s.authTokens.id, challenge.id));
      } else {
        await rateLimit(`login:${input.email.toLowerCase()}`, 10, 600);
        [user] = await db.select().from(s.users).where(eq(s.users.email, input.email.toLowerCase()));
        if (!await verifyPassword(input.password, user?.passwordHash || null) || !user) throw new ApiError("Email or password is incorrect.", 401);
        if (user.mfaCipher) { const challenge = newToken(); await db.insert(s.authTokens).values({ userId: user.id, tokenHash: hashToken(challenge), purpose: "mfa", expiresAt: new Date(Date.now() + 300000) }); return Response.json({ mfaRequired: true, challenge }); }
      }
      const sessionToken = await setSessionCookie(user.id, req.headers.get("user-agent") || "Web browser");
      const orgs = await db.select().from(s.memberships).where(eq(s.memberships.userId, user.id));
      for (const org of orgs) await audit(org.organizationId, user.id, "user.login", "session");
      const response = NextResponse.json({ ok: true, sessionToken }); if (orgs[0]) response.cookies.set("df_organization", orgs[0].organizationId, await workspaceCookieOptions()); return response;
    }
    if (action === "verify") {
      const { token } = z.object({ token: z.string().length(64) }).parse(body);
      const [verified] = await db.delete(s.authTokens).where(and(eq(s.authTokens.tokenHash, hashToken(token)), eq(s.authTokens.purpose, "verify"), gt(s.authTokens.expiresAt, new Date()))).returning();
      if (!verified) throw new ApiError("This verification link is invalid or has expired.", 400);
      await db.update(s.users).set({ emailVerified: true }).where(eq(s.users.id, verified.userId));
      return Response.json({ ok: true });
    }
    if (action === "forgot") {
      const { email } = z.object({ email: z.email() }).parse(body); const [user] = await db.select().from(s.users).where(eq(s.users.email, email.toLowerCase()));
      if (user && process.env.SMTP_URL) {
        const token = newToken(); await db.insert(s.authTokens).values({ userId: user.id, tokenHash: hashToken(token), purpose: "reset", expiresAt: new Date(Date.now() + 3600000) });
        const { sendMail } = await import("@/lib/mail"); await sendMail(user.email, "Reset your DeployFlow password", `Reset your password using this one-hour link: ${publicOrigin(req)}/reset-password?token=${token}`);
      }
      return Response.json({ ok: true, message: process.env.SMTP_URL ? "If an account exists, a password reset link has been sent." : "Email delivery isn't configured in this sandbox. Ask your administrator to configure SMTP_URL." });
    }
    if (action === "reset") {
      const input = z.object({ token: z.string().length(64), password: z.string().min(10).max(128) }).parse(body);
      await db.transaction(async tx => {
        const [token] = await tx.delete(s.authTokens).where(and(eq(s.authTokens.tokenHash, hashToken(input.token)), eq(s.authTokens.purpose, "reset"), gt(s.authTokens.expiresAt, new Date()))).returning();
        if (!token) throw new ApiError("This reset link is invalid or has expired.", 400);
        await tx.update(s.users).set({ passwordHash: await hashPassword(input.password) }).where(eq(s.users.id, token.userId));
        await tx.delete(s.sessions).where(eq(s.sessions.userId, token.userId));
      });
      return Response.json({ ok: true });
    }
    throw new ApiError("Unknown authentication action.", 404);
  } catch (error) { return apiError(error); }
}
