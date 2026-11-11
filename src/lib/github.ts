import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ApiError } from "./auth";
import { decrypt } from "./security";
import { enqueueDeployment, eligibleBranch } from "./deployments";

const GH_HEADERS = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "DeployFlow-Control-Plane" });

export async function githubRequest<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, { headers: GH_HEADERS(token), signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (!response.ok) throw new ApiError(response.status === 401 ? "GitHub credentials expired. Reconnect your account in Integrations." : response.status === 404 ? "Repository not found or not authorized for this GitHub connection." : `GitHub request failed (${response.status}). Please try again.`, response.status === 401 ? 401 : 502);
  return response.json() as Promise<T>;
}

async function githubMutate<T>(token: string, path: string, method: "PUT" | "DELETE", body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, { method, headers: GH_HEADERS(token), body: JSON.stringify(body), signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok) {
    const hint = response.status === 403 || response.status === 422
      ? " The token needs Contents: write and (for .github/workflows) Workflows: write permission on this repository."
      : "";
    throw new ApiError(`GitHub ${method} failed (${response.status}).${hint}`, response.status === 401 ? 401 : 502);
  }
  return response.json() as Promise<T>;
}

/** Returns the blob SHA when the file exists, null for a genuine 404, throws otherwise. */
export async function githubFileSha(token: string, path: string): Promise<string | undefined> {
  const response = await fetch(`https://api.github.com${path}`, { headers: GH_HEADERS(token), signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new ApiError(`GitHub metadata request failed (${response.status}). Check repository access and token permissions.`, response.status === 401 ? 401 : 502);
  const data = await response.json() as { sha?: string };
  return data.sha;
}

export type CommittedFile = { path: string; content: string };
/** Serial create-or-update via the GitHub Contents API. Returns one commit SHA per file. */
export async function commitFilesToGitHub(token: string, repository: string, branch: string, files: CommittedFile[], message: string) {
  const [owner, repo] = repository.split("/");
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`;
  const results: { path: string; commitSha: string; status: "created" | "updated" }[] = [];
  for (const file of files) {
    const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
    let sha: string | undefined;
    sha = await githubFileSha(token, `${base}/${encodedPath}?ref=${encodeURIComponent(branch)}`);
    const result = await githubMutate<{ commit?: { sha?: string } }>(token, `${base}/${encodedPath}`, "PUT", {
      message, content: Buffer.from(file.content, "utf8").toString("base64"), branch, ...(sha ? { sha } : {}),
    });
    results.push({ path: file.path, commitSha: result.commit?.sha || "", status: sha ? "updated" : "created" });
  }
  return results;
}
export type GithubRepo = { full_name: string; name: string; default_branch: string; private: boolean; description: string | null; language: string | null };
export type GithubBranch = { name: string; commit: { sha: string } };
export async function integrationToken(organizationId: string) {
  const [integration] = await db.select().from(s.integrations).where(eq(s.integrations.organizationId, organizationId));
  if (!integration?.connected) throw new ApiError("Connect GitHub before selecting a live repository.", 409);
  if (integration.mode === "demo") return null;
  if (!integration.credentialCipher) throw new ApiError("This GitHub connection needs to be reauthorized.", 409);
  return decrypt(integration.credentialCipher);
}
export async function processWebhookEvent(eventId: string) {
  const [event] = await db.select().from(s.webhookEvents).where(eq(s.webhookEvents.id, eventId));
  if (!event || event.status !== "pending") return;
  try {
    const payload = event.payload;
    const repository = (payload.repository as { full_name?: string } | undefined)?.full_name;
    if (!repository) throw new Error("Repository metadata is missing.");
    const [integration] = await db.select().from(s.integrations).where(eq(s.integrations.organizationId, event.organizationId));
    if (!integration?.connected) return;
    if (event.event === "installation" && payload.action === "deleted") {
      await db.update(s.integrations).set({ connected: false }).where(eq(s.integrations.id, integration.id));
      await db.update(s.webhookEvents).set({ status: "processed" }).where(eq(s.webhookEvents.id, eventId)); return;
    }
    const [project] = await db.select().from(s.projects).where(and(eq(s.projects.repository, repository), eq(s.projects.organizationId, event.organizationId)));
    if (!project || project.organizationId !== event.organizationId) throw new Error("No authorized project for this repository.");
    if (event.event === "delete" || (event.event === "push" && typeof payload.after === "string" && /^0+$/.test(payload.after)) || (event.event === "pull_request" && payload.action === "closed")) {
      const pr = payload.pull_request as { head?: { ref?: string } } | undefined;
      const name = event.event === "delete" ? String(payload.ref) : event.event === "push" ? String(payload.ref).replace(/^refs\/heads\//, "") : pr?.head?.ref;
      const [branch] = await db.select().from(s.branches).where(and(eq(s.branches.name, name || ""), eq(s.branches.projectId, project.id), eq(s.branches.organizationId, event.organizationId)));
      if (branch?.projectId === project.id) await db.update(s.environments).set({ expiresAt: new Date(Date.now() + (event.event === "pull_request" ? 24 : project.ttlHours) * 3600000) }).where(eq(s.environments.branchId, branch.id));
    } else if (project.autoDeploy) {
      const pr = payload.pull_request as { head?: { ref?: string; sha?: string; label?: string } } | undefined;
      const commit = payload.after as string || (payload.create as { sha?: string } | undefined)?.sha || pr?.head?.sha;
      const name = event.event === "pull_request" ? pr?.head?.ref : String(payload.ref || "").replace(/^refs\/heads\//, "");
      if (!name || !commit || !/^[a-f0-9]{40}$/i.test(commit)) throw new Error("A valid branch and immutable commit SHA are required.");
      if (!eligibleBranch(name, project.branchRules)) { await db.update(s.webhookEvents).set({ status: "processed" }).where(eq(s.webhookEvents.id, eventId)); return; }
      const [existingBranch] = await db.select().from(s.branches).where(and(eq(s.branches.name, name), eq(s.branches.projectId, project.id), eq(s.branches.organizationId, event.organizationId)));
      if (existingBranch && existingBranch.projectId === project.id) await db.update(s.branches).set({ commitSha: commit, updatedAt: new Date() }).where(eq(s.branches.id, existingBranch.id));
      const job = await enqueueDeployment({ organizationId: event.organizationId, projectId: project.id, branchName: name, commitSha: commit, message: (payload.head_commit as { message?: string } | undefined)?.message || `GitHub ${event.event}`, actorId: null, trigger: "github" });
      const { runDeployment } = await import("./deployments"); await runDeployment(job.id);
    }
    await db.update(s.webhookEvents).set({ status: "processed" }).where(eq(s.webhookEvents.id, eventId));
  } catch (error) {
    await db.update(s.webhookEvents).set({ status: "failed", error: error instanceof Error ? error.message : "Webhook processing failed." }).where(eq(s.webhookEvents.id, eventId));
  }
}
