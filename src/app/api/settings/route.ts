import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { requestContext, apiError, checkedJson, sameOrigin } from "@/lib/auth";
import { audit } from "@/lib/data";
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "admin"); const input = z.object({ name: z.string().trim().min(2).max(60), previewQuota: z.number().int().min(1).max(500), buildMinutesQuota: z.number().int().min(10).max(100000) }).parse(await checkedJson(req));
    const [organization] = await db.update(organizations).set(input).where(eq(organizations.id, ctx.organization.id)).returning(); await audit(ctx.organization.id, ctx.user.id, "organization.updated", "organization", ctx.organization.id, input); return Response.json({ organization });
  } catch (error) { return apiError(error); }
}
