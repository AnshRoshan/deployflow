import { NextRequest } from "next/server";
import { requestContext, apiError, sameOrigin } from "@/lib/auth";
import { cleanupExpiredEnvironments } from "@/lib/deployments";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); const ctx = await requestContext(req, "deploy");
    const cleaned = await cleanupExpiredEnvironments(ctx.organization.id);
    return Response.json({ ok: true, cleaned });
  } catch (error) { return apiError(error); }
}
