import { after, NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { decrypt, safeEqual } from "@/lib/security";
import { processWebhookEvent } from "@/lib/github";
import { apiError, ApiError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
type Context = { params: Promise<{ organizationId: string }> };
export async function POST(req: NextRequest, context: Context) {
  try {
    const { organizationId } = z.object({ organizationId: z.uuid() }).parse(await context.params);
    await rateLimit(`webhook:${organizationId}`, 120, 60);
    const [integration] = await db.select().from(s.integrations).where(eq(s.integrations.organizationId, organizationId));
    if (!integration?.connected || !integration.webhookCipher || integration.mode === "demo") throw new ApiError("Webhook integration is not configured.", 404);
    const raw = await req.text(); if (raw.length > 1048576) throw new ApiError("Payload too large.", 413);
    const signature = req.headers.get("x-hub-signature-256") || ""; const expected = `sha256=${createHmac("sha256", decrypt(integration.webhookCipher)).update(raw, "utf8").digest("hex")}`;
    if (!safeEqual(signature, expected)) throw new ApiError("Invalid webhook signature.", 401);
    const deliveryId = req.headers.get("x-github-delivery"); const event = req.headers.get("x-github-event");
    if (!deliveryId || !event) throw new ApiError("GitHub delivery headers are required.");
    if (event === "ping") return Response.json({ ok: true, message: "pong" });
    if (!["push", "create", "delete", "pull_request", "installation"].includes(event)) return Response.json({ ok: true, ignored: true });
    let payload: Record<string, unknown>; try { payload = JSON.parse(raw); } catch { throw new ApiError("Invalid JSON payload."); }
    const [stored] = await db.insert(s.webhookEvents).values({ organizationId, deliveryId, event, payload }).onConflictDoNothing({ target: s.webhookEvents.deliveryId }).returning();
    if (!stored) return Response.json({ ok: true, duplicate: true });
    after(() => processWebhookEvent(stored.id)); return Response.json({ ok: true, eventId: stored.id }, { status: 202 });
  } catch (error) { return apiError(error); }
}
