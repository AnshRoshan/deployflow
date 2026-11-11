import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { requestContext, ApiError, publicOrigin } from "@/lib/auth";
import { encrypt, newToken, safeEqual, hashToken } from "@/lib/security";
import { githubRequest } from "@/lib/github";
import { audit } from "@/lib/data";
export async function GET(req: NextRequest) {
  try {
    const ctx = await requestContext(req, "admin"); const code = req.nextUrl.searchParams.get("code"); const state = req.nextUrl.searchParams.get("state"); const expected = (await cookies()).get("df_oauth_state")?.value;
    if (!code || !state || !expected || !safeEqual(hashToken(state), expected)) throw new ApiError("GitHub authorization state is invalid. Please try connecting again.", 403);
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) throw new ApiError("GitHub OAuth is not configured.", 409);
    const result = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${publicOrigin(req)}/api/github/callback` }), signal: AbortSignal.timeout(12000) });
    const tokenData = await result.json(); if (!result.ok || !tokenData.access_token) throw new ApiError("GitHub authorization failed. Please try again.", 401);
    const account = await githubRequest<{ login: string }>(tokenData.access_token, "/user");
    await db.insert(integrations).values({ organizationId: ctx.organization.id, account: account.login, mode: "oauth", credentialCipher: encrypt(tokenData.access_token), webhookCipher: encrypt(newToken()), connected: true }).onConflictDoUpdate({ target: integrations.organizationId, set: { account: account.login, mode: "oauth", credentialCipher: encrypt(tokenData.access_token), connected: true } });
    await audit(ctx.organization.id, ctx.user.id, "integration.connected", "integration", ctx.organization.id, { account: account.login, method: "oauth" });
    const response = NextResponse.redirect(new URL("/integrations?connected=github", req.url)); response.cookies.delete("df_oauth_state"); return response;
  } catch (error) { if (error instanceof ApiError) return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(error.message)}`, req.url)); return NextResponse.redirect(new URL("/integrations?error=GitHub%20connection%20failed.%20Please%20try%20again.", req.url)); }
}
