import { cookies, headers } from "next/headers";

// Preview environments are often embedded in a cross-site iframe. Browsers silently
// drop SameSite=Lax cookies in that context, which makes every navigation look signed
// out. On HTTPS we therefore issue SameSite=None; Secure so the session survives.
export async function requestIsHttps() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded) return forwarded === "https";
  return Boolean(process.env.APP_URL?.startsWith("https://"));
}

export async function sessionCookieOptions() {
  const https = await requestIsHttps();
  return { httpOnly: true, secure: https, sameSite: https ? ("none" as const) : ("lax" as const), path: "/", maxAge: 7 * 86400 };
}

export async function workspaceCookieOptions() {
  const https = await requestIsHttps();
  return { secure: https, sameSite: https ? ("none" as const) : ("lax" as const), path: "/", maxAge: 7 * 86400 };
}

export async function shortCookieOptions(maxAge = 600) {
  const https = await requestIsHttps();
  return { httpOnly: true, secure: https, sameSite: https ? ("none" as const) : ("lax" as const), path: "/", maxAge };
}

export async function readCookie(name: string) {
  return (await cookies()).get(name)?.value;
}
