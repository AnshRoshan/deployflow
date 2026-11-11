import { NextRequest } from "next/server";
import { z } from "zod";
import { requestContext, apiError, checkedJson, sameOrigin } from "@/lib/auth";
import { analyzeDeployment, answerWorkspaceQuestion } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ question: z.string().trim().max(500).optional(), deploymentId: z.uuid().optional() }).refine(v => Boolean(v.question || v.deploymentId), { message: "Provide a question or a deployment ID." });

export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const ctx = await requestContext(req);
    await rateLimit(`ai:${ctx.user.id}`, 30, 60);
    const input = schema.parse(await checkedJson(req));
    const result = input.deploymentId
      ? await analyzeDeployment(ctx.organization.id, input.deploymentId)
      : await answerWorkspaceQuestion(ctx.organization.id, input.question || "");
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
