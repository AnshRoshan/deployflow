import { cookies } from "next/headers";
import { sessionCookieOptions, workspaceCookieOptions } from "./cookies";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { users, sessions, memberships, organizations, apiTokens, auditLogs } from "@/db/schema";
import { hashToken, newToken, canAdmin, canDeploy } from "./security";
import { DEMO_ORG_ID, DEMO_USER_ID, ensureDemo } from "./seed";

export class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function getAuth() {
  const token = (await cookies()).get("df_session")?.value;
  if (!token) return null;
  const [row] = await db.select({ user: users, sessionId: sessions.id }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  return row ?? null;
}
export async function requireUser() { const auth = await getAuth(); if (!auth) redirect("/login"); return auth; }
// Cookie-less environments (third-party iframes block cookies) still need a usable app.
// Unauthenticated visitors get the shared, publicly documented sandbox workspace only.
export async function getDemoAuth() {
  await ensureDemo();
  const [user] = await db.select().from(users).where(eq(users.id, DEMO_USER_ID));
  return { user, sessionId: null, isDemo: true };
}
export async function getAuthOrDemo() {
  const auth = await getAuth();
  return auth ? { ...auth, isDemo: false } : { ...(await getDemoAuth()), isDemo: true };
}
export async function createSession(userId: string, agent = "Web browser") {
  const token = newToken();
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), agent: agent.slice(0, 200), expiresAt: new Date(Date.now() + 7 * 86400000) });
  return token;
}
export async function setSessionCookie(userId: string, agent?: string) {
  const token = await createSession(userId, agent);
  (await cookies()).set("df_session", token, await sessionCookieOptions());
  (await cookies()).delete("df_logged_out");
  return token;
}
export async function requestAuth(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  // Session token (64 hex chars) lets signed-in users work even when cookies are blocked.
  if (bearer && /^[a-f0-9]{64}$/i.test(bearer)) {
    const [row] = await db.select({ user: users, sessionId: sessions.id }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(and(eq(sessions.tokenHash, hashToken(bearer)), gt(sessions.expiresAt, new Date()))).limit(1);
    if (!row) throw new ApiError("Your session has expired. Please sign in again.", 401);
    return row;
  }
  if (bearer?.startsWith("df_")) {
    const [row] = await db.select({ user: users, tokenId: apiTokens.id }).from(apiTokens).innerJoin(users, eq(users.id, apiTokens.userId)).where(and(eq(apiTokens.tokenHash, hashToken(bearer)), eq(apiTokens.revoked, false))).limit(1);
    if (!row) throw new ApiError("Invalid or revoked API token.", 401);
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.tokenId));
    return { user: row.user, sessionId: null };
  }
  const token = req.cookies.get("df_session")?.value;
  if (!token) throw new ApiError("Sign in to continue.", 401);
  const [row] = await db.select({ user: users, sessionId: sessions.id }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!row) throw new ApiError("Your session has expired. Please sign in again.", 401);
  return row;
}
export async function requestContext(req: NextRequest, permission: "read" | "deploy" | "admin" = "read") {
  let auth: { user: typeof users.$inferSelect; sessionId: string | null } | null = null;
  try { auth = await requestAuth(req); } catch (error) { if (!(error instanceof ApiError) || error.status !== 401) throw error; }
  const isDemo = !auth;
  if (!auth) auth = await getDemoAuth();
  const orgId = req.headers.get("x-organization-id") || req.nextUrl.searchParams.get("organizationId") || req.cookies.get("df_organization")?.value;
  const rows = await db.select({ organization: organizations, role: memberships.role }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId)).where(and(eq(memberships.userId, auth.user.id), eq(memberships.status, "active")));
  // Anonymous visitors are confined to the shared sandbox; personal organizations stay protected.
  if (isDemo && orgId && orgId !== DEMO_ORG_ID) throw new ApiError("Sign in to access this organization.", 403);
  const membership = isDemo ? rows.find(r => r.organization.id === DEMO_ORG_ID) : orgId ? rows.find(r => r.organization.id === orgId) : rows[0];
  if (!membership) {
    if (orgId && rows[0]) await db.insert(auditLogs).values({ organizationId: rows[0].organization.id, actorId: auth.user.id, action: "organization.access_denied", resourceType: "organization", resourceId: orgId, result: "denied", details: { reason: "No active membership" } });
    throw new ApiError("You don't have access to this organization.", 403);
  }
  if (permission === "admin" && !canAdmin(membership.role)) throw new ApiError("An organization administrator is required for this action.", 403);
  if (permission === "deploy" && !canDeploy(membership.role)) throw new ApiError("Your role has read-only access to deployments.", 403);
  return { ...auth, organization: membership.organization, role: membership.role, isDemo };
}
export function apiError(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join(".");
    const message = issue ? `${field ? `${field}: ` : ""}${issue.message}` : "Please check the submitted fields.";
    return Response.json({ error: message, details: error.issues }, { status: 422 });
  }
  console.error("DeployFlow API error:", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
export async function checkedJson(req: NextRequest) {
  if (!req.headers.get("content-type")?.includes("application/json")) throw new ApiError("Expected an application/json request.", 415);
  const text = await req.text(); if (text.length > 65536) throw new ApiError("Request is too large.", 413);
  try { return JSON.parse(text); } catch { throw new ApiError("Invalid JSON request.", 400); }
}
export function publicOrigin(req: NextRequest) {
  if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host).split(",")[0].trim();
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = forwardedProto || req.nextUrl.protocol.replace(":", "");
  return new URL(`${proto}://${host}`).origin;
}
export function sameOrigin(req: NextRequest) {
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") throw new ApiError("Cross-origin request rejected.", 403);
  // Fetch Metadata is set by the browser and cannot be overridden by page JavaScript.
  // Trust it when a deployment proxy rewrites the public Host / forwarded-host headers.
  if (site === "same-origin" || site === "none") return;
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) throw new ApiError("Cross-origin request rejected.", 403);
}
