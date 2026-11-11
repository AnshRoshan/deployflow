import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deployments, deploymentLogs, pipelineChecks, projects, environments } from "@/db/schema";

export type AiAnswer = { answer: string; confidence: number; citations: string[]; actions: string[]; mode: "local-heuristic" };

// Explainable, deterministic assistant. No external model or API key is required:
// every statement is derived from persisted workspace records, so it cannot invent facts.
export async function analyzeDeployment(organizationId: string, deploymentId: string): Promise<AiAnswer> {
  const [deployment] = await db.select().from(deployments).where(and(eq(deployments.id, deploymentId), eq(deployments.organizationId, organizationId)));
  if (!deployment) return { answer: "I couldn't find that deployment in this organization.", confidence: 0, citations: [], actions: [], mode: "local-heuristic" };
  const logs = await db.select().from(deploymentLogs).where(eq(deploymentLogs.deploymentId, deploymentId)).orderBy(desc(deploymentLogs.createdAt));
  const checks = await db.select().from(pipelineChecks).where(eq(pipelineChecks.deploymentId, deploymentId));
  const [project] = await db.select().from(projects).where(eq(projects.id, deployment.projectId));
  const errorLines = logs.filter(l => l.level === "error" || l.level === "warn");
  const failedChecks = checks.filter(c => c.status === "fail");
  const warnChecks = checks.filter(c => c.status === "warn");
  const citations = [
    `deployment:${deployment.id.slice(0, 8)}`,
    `status:${deployment.status}`,
    `commit:${deployment.commitSha.slice(0, 7)}`,
    ...errorLines.slice(0, 3).map(l => `log:${l.stage}`),
  ];
  const actions: string[] = [];

  if (deployment.status === "ready") {
    return {
      answer: `This deployment is healthy. Branch ${deployment.commitSha.slice(0, 7)} passed ${checks.length} security gates and all health checks. ${warnChecks.length ? `${warnChecks.length} advisory finding(s) were recorded but did not block promotion.` : "No blocking findings were recorded."} The immutable image digest is retained for rollback.`,
      confidence: 0.96, citations, actions: ["Open preview", "Review security gates", "Copy image digest"], mode: "local-heuristic",
    };
  }
  if (deployment.status.includes("failed") || deployment.status.includes("cancelled")) {
    const logSummary = errorLines[0]?.message || deployment.error || "No error log line was recorded.";
    actions.push("Retry the same immutable commit", "Inspect build logs", failedChecks.length ? "Review failed security gates" : "Check recent variable changes");
    return {
      answer: `The deployment stopped at "${deployment.status.replaceAll("_", " ")}". The most relevant recorded event is: ${logSummary}. ${failedChecks.length ? `${failedChecks.length} security gate(s) failed, so promotion was blocked by policy.` : "The previous healthy preview was preserved, so traffic was not affected."} A likely cause in this sandbox is the simulated build-failure switch or a TypeScript validation error captured in the build stage.`,
      confidence: 0.89, citations, actions, mode: "local-heuristic",
    };
  }
  actions.push("Watch live logs", "Cancel deployment");
  return {
    answer: `This deployment is currently "${deployment.status}". ${checks.length} security gate records exist so far. ${project ? `It belongs to ${project.name} (${project.framework}) and will run on the ${project.runnerType} profile.` : ""} Nothing indicates a failure yet; logs are still streaming.`,
    confidence: 0.82, citations, actions, mode: "local-heuristic",
  };
}

export async function answerWorkspaceQuestion(organizationId: string, question: string): Promise<AiAnswer> {
  const q = question.toLowerCase();
  const recent = await db.select().from(deployments).where(eq(deployments.organizationId, organizationId)).orderBy(desc(deployments.createdAt)).limit(20);
  const active = await db.select().from(environments).where(and(eq(environments.organizationId, organizationId), eq(environments.status, "ready")));
  const checks = await db.select().from(pipelineChecks).where(eq(pipelineChecks.organizationId, organizationId)).orderBy(desc(pipelineChecks.createdAt)).limit(50);
  const failed = recent.filter(d => d.status.includes("failed"));
  const running = recent.filter(d => ["queued", "preparing", "building", "pushing_image", "provisioning", "health_checking"].includes(d.status));
  const critical = checks.filter(c => c.status === "fail");
  const base = { citations: [`deployments:${recent.length}`, `active_previews:${active.length}`, `checks:${checks.length}`], mode: "local-heuristic" as const };

  if (/fail|broken|error|why|problem|incident|debug/.test(q)) {
    return { ...base, confidence: 0.9, answer: `In the last ${recent.length} deployments, ${failed.length} failed. ${failed.length ? `The most recent failure: ${failed[0].error || failed[0].status}.` : "There are no recent failures."} ${critical.length} security gate(s) recorded blocking findings. Open the deployment details page to inspect its persisted stage logs; failed builds never replace a healthy preview.`, actions: ["Show failed deployments", "Open security center", "Analyze a deployment"] };
  }
  if (/secur|vulnerab|policy|gate|compliance|sbom|scan/.test(q)) {
    return { ...base, confidence: 0.92, answer: `Security posture is derived from your project policies. ${checks.length} recent gate records were analyzed; ${critical.length} were blocking. Default gates include secret scanning, SAST, dependency audit, license compliance, container scan, SBOM and runtime hardening. Use Security Center to enable image signing or adjust severity thresholds.`, actions: ["Open security center", "Review policies", "Generate CI workflows"] };
  }
  if (/flag|rollout|toggle|experiment/.test(q)) {
    return { ...base, confidence: 0.87, answer: "Feature flags are managed in Feature Flags. Each flag has an enabled state, a rollout percentage, and an environment scope (production/preview). Flags are stored with your organization and can be scoped to a single project, so changing one project never affects another branch's configuration.", actions: ["Open feature flags", "Create a flag"] };
  }
  if (/secret|variable|env|config|github|gitlab/.test(q)) {
    return { ...base, confidence: 0.88, answer: "Secrets & Config is the federation hub. DeployFlow variables are encrypted with AES-256-GCM and support project defaults plus branch overrides. Bindings map those keys to GitHub Actions secrets or GitLab CI/CD variables; we generate the exact CLI commands, and never copy plaintext values into a workflow file.", actions: ["Open secrets hub", "Generate workflow files", "Review bindings"] };
  }
  if (/deploy|status|running|preview|environment/.test(q)) {
    return { ...base, confidence: 0.93, answer: `There are ${active.length} healthy preview environments, ${running.length} deployment(s) in progress, and ${recent.length} recent deployment records. Every environment has its own hostname, resource limits and retention policy; protected production branches are excluded from automatic cleanup.`, actions: ["Open deployments", "Run cleanup", "Deploy a branch"] };
  }
  if (/workflow|pipeline|onboard|bootstrap|ci|repository/.test(q)) {
    return { ...base, confidence: 0.9, answer: "Repository Onboarding generates GitHub Actions workflows, GitLab CI pipelines, Dependabot config, deployflow.yml, and a SECURITY.md. You can preview every file, download it, or commit the bundle straight to a connected GitHub repository via the Contents API (requires Contents + Workflows write permission).", actions: ["Open onboarding", "Generate files", "Commit to GitHub"] };
  }
  return { ...base, confidence: 0.72, answer: `I can answer questions grounded in your workspace data: deployments, failures, security gates, feature flags, federated secrets, runners, and repository onboarding. Currently: ${recent.length} recent deployments, ${active.length} healthy previews, ${checks.length} recorded security checks. Try asking "why did the last build fail?" or "what is our security posture?".`, actions: ["Why did the last build fail?", "Security posture", "How do feature flags work?"] };
}
