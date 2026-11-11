import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin } from "@/lib/auth";
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req); const { id } = z.object({ id: z.uuid().optional() }).parse(await checkedJson(req));
    await db.update(notifications).set({ read: true }).where(and(eq(notifications.organizationId, ctx.organization.id), or(isNull(notifications.userId), eq(notifications.userId, ctx.user.id)), id ? eq(notifications.id, id) : undefined)); return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req);
    const input = z.object({ id: z.uuid().optional(), clearRead: z.boolean().optional() }).parse(await checkedJson(req));
    if (input.clearRead) {
      await db.delete(notifications).where(and(eq(notifications.organizationId, ctx.organization.id), or(isNull(notifications.userId), eq(notifications.userId, ctx.user.id)), eq(notifications.read, true)));
      return Response.json({ ok: true });
    }
    if (input.id) {
      await db.delete(notifications).where(and(eq(notifications.organizationId, ctx.organization.id), or(isNull(notifications.userId), eq(notifications.userId, ctx.user.id)), eq(notifications.id, input.id)));
    }
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
