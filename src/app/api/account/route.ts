import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, ne, desc, gt } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError, publicOrigin } from "@/lib/auth";
import { encrypt, decrypt, hashPassword, verifyPassword, newToken, hashToken } from "@/lib/security";
import { audit } from "@/lib/data";
function authenticator(secret: string, email: string) { return new OTPAuth.TOTP({ issuer: "DeployFlow", label: email, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }); }
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const body = await checkedJson(req); const action = z.object({ action: z.string() }).parse(body).action;
    const ctx = await requestContext(req, ["create-key", "revoke-key"].includes(action) ? "admin" : "read");
    if (ctx.user.id === "00000000-0000-4000-8000-000000000001" && ["password", "mfa-setup", "mfa-disable", "request-verification"].includes(action)) throw new ApiError("Create a personal account to manage sign-in security. The shared demo account cannot enable MFA or change its password.", 409);
    if (action === "profile") {
      const { name } = z.object({ name: z.string().trim().min(2).max(80) }).parse(body); await db.update(s.users).set({ name }).where(eq(s.users.id, ctx.user.id)); await audit(ctx.organization.id, ctx.user.id, "user.profile_updated", "user", ctx.user.id); return Response.json({ ok: true });
    }
    if (action === "password") {
      const input = z.object({ currentPassword: z.string().max(128), password: z.string().min(10).max(128) }).parse(body);
      if (!await verifyPassword(input.currentPassword, ctx.user.passwordHash)) throw new ApiError("Your current password is incorrect.", 401);
      await db.update(s.users).set({ passwordHash: await hashPassword(input.password) }).where(eq(s.users.id, ctx.user.id));
      await db.delete(s.sessions).where(and(eq(s.sessions.userId, ctx.user.id), ne(s.sessions.id, ctx.sessionId || "00000000-0000-0000-0000-000000000000")));
      await audit(ctx.organization.id, ctx.user.id, "user.password_changed", "user", ctx.user.id); return Response.json({ ok: true });
    }
    if (action === "revoke-session") {
      const { id } = z.object({ id: z.uuid() }).parse(body); const [session] = await db.delete(s.sessions).where(and(eq(s.sessions.id, id), eq(s.sessions.userId, ctx.user.id))).returning(); if (!session) throw new ApiError("Session not found.", 404); await audit(ctx.organization.id, ctx.user.id, "session.revoked", "session", id); return Response.json({ ok: true });
    }
    if (action === "create-key") {
      const { name } = z.object({ name: z.string().trim().min(2).max(60) }).parse(body); const token = `df_${newToken()}`;
      const [key] = await db.insert(s.apiTokens).values({ organizationId: ctx.organization.id, userId: ctx.user.id, name, tokenHash: hashToken(token), prefix: token.slice(0, 11) }).returning({ id: s.apiTokens.id, name: s.apiTokens.name });
      await audit(ctx.organization.id, ctx.user.id, "api_key.created", "api_key", key.id); return Response.json({ key, token }, { status: 201 });
    }
    if (action === "revoke-key") {
      const { id } = z.object({ id: z.uuid() }).parse(body); const [key] = await db.update(s.apiTokens).set({ revoked: true }).where(and(eq(s.apiTokens.id, id), eq(s.apiTokens.organizationId, ctx.organization.id))).returning({ id: s.apiTokens.id }); if (!key) throw new ApiError("API key not found.", 404); await audit(ctx.organization.id, ctx.user.id, "api_key.revoked", "api_key", id); return Response.json({ ok: true });
    }
    if (action === "mfa-setup") {
      if (ctx.user.mfaCipher) throw new ApiError("Two-factor authentication is already enabled.", 409);
      const secret = new OTPAuth.Secret({ size: 20 }).base32; const uri = authenticator(secret, ctx.user.email).toString();
      await db.delete(s.authTokens).where(and(eq(s.authTokens.userId, ctx.user.id), eq(s.authTokens.purpose, "mfa-setup")));
      await db.insert(s.authTokens).values({ userId: ctx.user.id, tokenHash: encrypt(secret), purpose: "mfa-setup", expiresAt: new Date(Date.now() + 600000) });
      return Response.json({ secret, uri, qr: await QRCode.toDataURL(uri, { width: 220, margin: 1 }) });
    }
    if (action === "mfa-enable") {
      const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(body);
      const [pending] = await db.select().from(s.authTokens).where(and(eq(s.authTokens.userId, ctx.user.id), eq(s.authTokens.purpose, "mfa-setup"), gt(s.authTokens.expiresAt, new Date()))).orderBy(desc(s.authTokens.createdAt)).limit(1);
      if (!pending) throw new ApiError("Authenticator setup expired. Start again.", 400); const secret = decrypt(pending.tokenHash);
      if (authenticator(secret, ctx.user.email).validate({ token: code, window: 1 }) === null) throw new ApiError("That code isn't valid. Enter the current code from your authenticator.", 400);
      await db.update(s.users).set({ mfaCipher: encrypt(secret) }).where(eq(s.users.id, ctx.user.id)); await db.delete(s.authTokens).where(eq(s.authTokens.id, pending.id)); await audit(ctx.organization.id, ctx.user.id, "user.mfa_enabled", "user", ctx.user.id); return Response.json({ ok: true });
    }
    if (action === "mfa-disable") {
      const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(body); if (!ctx.user.mfaCipher) throw new ApiError("Two-factor authentication is not enabled.");
      if (authenticator(decrypt(ctx.user.mfaCipher), ctx.user.email).validate({ token: code, window: 1 }) === null) throw new ApiError("Invalid authenticator code.", 400);
      await db.update(s.users).set({ mfaCipher: null }).where(eq(s.users.id, ctx.user.id)); await audit(ctx.organization.id, ctx.user.id, "user.mfa_disabled", "user", ctx.user.id); return Response.json({ ok: true });
    }
    if (action === "request-verification") {
      if (!process.env.SMTP_URL) throw new ApiError("Email delivery isn't configured. Set SMTP_URL to enable verification emails.", 409);
      const token = newToken(); await db.insert(s.authTokens).values({ userId: ctx.user.id, tokenHash: hashToken(token), purpose: "verify", expiresAt: new Date(Date.now() + 86400000) });
      const { sendMail } = await import("@/lib/mail"); await sendMail(ctx.user.email, "Verify your DeployFlow email", `Verify your email: ${publicOrigin(req)}/verify-email?token=${token}`); return Response.json({ ok: true });
    }
    throw new ApiError("Unknown account action.", 404);
  } catch (error) { return apiError(error); }
}
