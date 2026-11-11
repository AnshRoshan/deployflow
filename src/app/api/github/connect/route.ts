import { NextRequest, NextResponse } from "next/server";
import { requestContext, ApiError, apiError, publicOrigin } from "@/lib/auth";
import { newToken, hashToken } from "@/lib/security";
import { shortCookieOptions } from "@/lib/cookies";
export async function GET(req: NextRequest) {
  try {
    await requestContext(req, "admin");
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) throw new ApiError("GitHub OAuth isn't configured. Connect with a fine-grained personal access token instead.", 409);
    const state = newToken(); const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID); url.searchParams.set("redirect_uri", `${publicOrigin(req)}/api/github/callback`); url.searchParams.set("scope", "repo read:user"); url.searchParams.set("state", state);
    const response = NextResponse.redirect(url); response.cookies.set("df_oauth_state", hashToken(state), await shortCookieOptions(600)); return response;
  } catch (error) { return apiError(error); }
}
