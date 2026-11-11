import { NextRequest } from "next/server";
import { requestContext, apiError } from "@/lib/auth";
import { githubRequest, integrationToken, type GithubRepo } from "@/lib/github";
export async function GET(req: NextRequest) {
  try {
    const ctx = await requestContext(req, "deploy"); const token = await integrationToken(ctx.organization.id);
    if (!token) return Response.json({ demo: true, repositories: ["docs", "design-system", "internal-tools", "customer-portal", "mobile-api"].map(name => ({ full_name: `acme/${name}`, name, default_branch: "main", private: true, description: "Sample repository for your sandbox workspace", language: "TypeScript" })) });
    const repositories = await githubRequest<GithubRepo[]>(token, "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member"); return Response.json({ demo: false, repositories });
  } catch (error) { return apiError(error); }
}
