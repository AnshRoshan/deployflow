import { after, NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin, ApiError, publicOrigin } from "@/lib/auth";
import { encrypt, newToken } from "@/lib/security";
import { githubRequest } from "@/lib/github";
import { audit } from "@/lib/data";
import { processWebhookEvent } from "@/lib/github";
export async function GET(req: NextRequest) {
  try { const ctx = await requestContext(req, "admin"); const events = await db.select({ id: s.webhookEvents.id, deliveryId: s.webhookEvents.deliveryId, event: s.webhookEvents.event, status: s.webhookEvents.status, error: s.webhookEvents.error, createdAt: s.webhookEvents.createdAt }).from(s.webhookEvents).where(eq(s.webhookEvents.organizationId, ctx.organization.id)); return Response.json({ events, oauthAvailable: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) }); } catch (error) { return apiError(error); }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin"); const input = z.object({ action: z.enum(["connect", "disconnect", "rotate-webhook", "retry"]), token: z.string().min(20).max(500).optional() }).parse(await checkedJson(req));
    if (input.action === "disconnect") {
      await db.insert(s.integrations).values({ organizationId: ctx.organization.id, account: "", connected: false }).onConflictDoUpdate({ target: s.integrations.organizationId, set: { connected: false, credentialCipher: null, webhookCipher: null } });
      await audit(ctx.organization.id, ctx.user.id, "integration.disconnected", "integration", ctx.organization.id); return Response.json({ ok: true });
    }
    if (input.action === "retry") {
      const events = await db.select({ id: s.webhookEvents.id }).from(s.webhookEvents).where(and(eq(s.webhookEvents.organizationId, ctx.organization.id), eq(s.webhookEvents.status, "failed")));
      await db.update(s.webhookEvents).set({ status: "pending", error: null }).where(and(eq(s.webhookEvents.organizationId, ctx.organization.id), eq(s.webhookEvents.status, "failed")));
      after(async () => { for (const event of events) await processWebhookEvent(event.id); }); await audit(ctx.organization.id, ctx.user.id, "integration.webhooks_retried", "integration", ctx.organization.id, { count: events.length }); return Response.json({ ok: true, count: events.length });
    }
    if (input.action === "connect") {
      if (!input.token || !/^(github_pat_|ghp_)/.test(input.token)) throw new ApiError("Enter a valid GitHub fine-grained personal access token.");
      const account = await githubRequest<{ login: string }>(input.token, "/user"); const webhookSecret = newToken();
      await db.insert(s.integrations).values({ organizationId: ctx.organization.id, account: account.login, mode: "token", credentialCipher: encrypt(input.token), webhookCipher: encrypt(webhookSecret), connected: true }).onConflictDoUpdate({ target: s.integrations.organizationId, set: { account: account.login, mode: "token", credentialCipher: encrypt(input.token), webhookCipher: encrypt(webhookSecret), connected: true } });
      await audit(ctx.organization.id, ctx.user.id, "integration.connected", "integration", ctx.organization.id, { account: account.login, provider: "github" });
      return Response.json({ ok: true, account: account.login, webhookSecret, webhookUrl: `${publicOrigin(req)}/api/github/webhook/${ctx.organization.id}` });
    }
    const [integration] = await db.select().from(s.integrations).where(eq(s.integrations.organizationId, ctx.organization.id)); if (!integration?.connected || integration.mode === "demo") throw new ApiError("Connect a live GitHub account first.", 409);
    const webhookSecret = newToken(); await db.update(s.integrations).set({ webhookCipher: encrypt(webhookSecret) }).where(eq(s.integrations.id, integration.id));
    await audit(ctx.organization.id, ctx.user.id, "integration.webhook_rotated", "integration", integration.id); return Response.json({ webhookSecret, webhookUrl: `${publicOrigin(req)}/api/github/webhook/${ctx.organization.id}` });
  } catch (error) { return apiError(error); }
}
