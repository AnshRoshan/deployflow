import { after, NextRequest } from "next/server";
import { requestContext, apiError } from "@/lib/auth";
import { getWorkspaceData } from "@/lib/data";
import { recoverOrganizationJobs, runDeployment } from "@/lib/deployments";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const ctx = await requestContext(req);
    const jobs = await recoverOrganizationJobs(ctx.organization.id);
    after(async () => { for (const job of jobs) await runDeployment(job.id); });
    const data = await getWorkspaceData(ctx.user.id, ctx.sessionId, req.nextUrl.searchParams.get("organizationId") || ctx.organization.id);
    return Response.json({ ...data, demoMode: ctx.isDemo }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
