import { and, eq, desc, inArray, lt, gt, or, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ApiError } from "./auth";
import { branchSlug, hashToken } from "./security";
import { audit } from "./data";
import { runSecurityGates } from "./security-policy";

export const ACTIVE_STATUSES = ["queued", "preparing", "building", "pushing_image", "provisioning", "health_checking"];
export const isRunning = (status: string) => ACTIVE_STATUSES.includes(status);
export function eligibleBranch(name: string, rules: string) {
  return rules.split(",").map(r => r.trim()).filter(Boolean).some(rule => new RegExp(`^${rule.split("*").map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(name));
}
export async function enqueueDeployment(input: { organizationId: string; projectId: string; branchId?: string; branchName?: string; commitSha?: string; message?: string; actorId: string | null; trigger?: string }) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.organizationId}))`);
    const [project] = await tx.select().from(s.projects).where(and(eq(s.projects.id, input.projectId), eq(s.projects.organizationId, input.organizationId)));
    if (!project) throw new ApiError("Project not found in this organization.", 404);
    let [branch] = input.branchId ? await tx.select().from(s.branches).where(and(eq(s.branches.id, input.branchId), eq(s.branches.projectId, project.id), eq(s.branches.organizationId, input.organizationId))) : await tx.select().from(s.branches).where(and(eq(s.branches.projectId, project.id), eq(s.branches.name, input.branchName || project.defaultBranch)));
    if (!branch && input.branchName && input.commitSha) {
      [branch] = await tx.insert(s.branches).values({ organizationId: input.organizationId, projectId: project.id, name: input.branchName, commitSha: input.commitSha, message: input.message || "Deploy branch" }).returning();
    }
    if (!branch) throw new ApiError("Branch not found. Sync your repository or choose an existing branch.", 404);
    if (!branch.enabled) throw new ApiError("Deployments are disabled for this branch.", 409);
    const commitSha = input.commitSha || branch.commitSha;
    if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new ApiError("A full, immutable 40-character commit SHA is required.");
    const [buildUsage] = await tx.select({ seconds: sql<number>`coalesce(sum(${s.deployments.durationSeconds}), 0)::int` }).from(s.deployments).where(and(eq(s.deployments.organizationId, input.organizationId), gt(s.deployments.createdAt, new Date(Date.now() - 30 * 86400000))));
    const [organization] = await tx.select().from(s.organizations).where(eq(s.organizations.id, input.organizationId));
    if (buildUsage.seconds >= organization.buildMinutesQuota * 60) throw new ApiError("Your organization's rolling 30-day build-minute budget has been reached. Update the budget in Settings before deploying.", 409);
    let [environment] = await tx.select().from(s.environments).where(eq(s.environments.branchId, branch.id));
    if (!environment || environment.status === "deleted") {
      const [usage] = await tx.select({ count: sql<number>`count(*)::int` }).from(s.environments).where(and(eq(s.environments.organizationId, input.organizationId), inArray(s.environments.status, ["ready", "provisioning"])));
      const [org] = await tx.select().from(s.organizations).where(eq(s.organizations.id, input.organizationId));
      if (usage.count >= org.previewQuota) throw new ApiError(`Your organization has reached its ${org.previewQuota}-environment quota. Clean up a preview or update your quota in Settings.`, 409);
      if (environment) {
        [environment] = await tx.update(s.environments).set({ status: "provisioning", hostname: `${project.name}-${branchSlug(branch.name, branch.id)}.${org.slug}.preview.test`, createdAt: new Date() }).where(eq(s.environments.id, environment.id)).returning();
      } else {
        [environment] = await tx.insert(s.environments).values({ organizationId: input.organizationId, projectId: project.id, branchId: branch.id, hostname: `${project.name}-${branchSlug(branch.name, branch.id)}.${org.slug}.preview.test`, protected: branch.name === project.defaultBranch, expiresAt: branch.name === project.defaultBranch ? null : new Date(Date.now() + project.ttlHours * 3600000) }).returning();
      }
    }
    const [active] = await tx.select({ id: s.deployments.id }).from(s.deployments).where(and(eq(s.deployments.environmentId, environment.id), inArray(s.deployments.status, ACTIVE_STATUSES))).limit(1);
    if (active) throw new ApiError("This environment already has a deployment in progress.", 409);
    const [deployment] = await tx.insert(s.deployments).values({ organizationId: input.organizationId, projectId: project.id, branchId: branch.id, environmentId: environment.id, commitSha, message: input.message || branch.message, actorId: input.actorId, trigger: input.trigger || "manual" }).returning();
    await tx.insert(s.deploymentLogs).values({ organizationId: input.organizationId, deploymentId: deployment.id, stage: "queued", message: "Deployment queued. Waiting for an available sandbox worker." });
    await tx.insert(s.auditLogs).values({ organizationId: input.organizationId, actorId: input.actorId, action: "deployment.created", resourceType: "deployment", resourceId: deployment.id, details: { branch: branch.name, commit: commitSha, trigger: deployment.trigger } });
    return deployment;
  });
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function runDeployment(id: string) {
  const [job] = await db.transaction(async tx => {
    const [candidate] = await tx.select().from(s.deployments).where(and(eq(s.deployments.id, id), inArray(s.deployments.status, ACTIVE_STATUSES), or(isNull(s.deployments.leaseUntil), lt(s.deployments.leaseUntil, new Date())))).for("update", { skipLocked: true });
    if (!candidate) return [];
    if (candidate.attempts >= 3) {
      await tx.update(s.deployments).set({ status: "deploy_failed", error: "Worker lease expired after 3 attempts. Retry this deployment manually.", finishedAt: new Date() }).where(eq(s.deployments.id, id)); return [];
    }
    return tx.update(s.deployments).set({ leaseUntil: new Date(Date.now() + 90000), startedAt: candidate.startedAt || new Date(), attempts: candidate.attempts + 1 }).where(eq(s.deployments.id, id)).returning();
  });
  if (!job) return;
  try {
    const [projInfo] = await db.select({ runnerType: s.projects.runnerType, buildCommand: s.projects.buildCommand }).from(s.projects).where(eq(s.projects.id, job.projectId));
    const runnerLabel = projInfo?.runnerType === "github-actions" ? "GitHub Actions sandbox bridge" : projInfo?.runnerType === "gitlab-runner" ? "GitLab Runner sandbox worker" : "DeployFlow Docker sandbox worker";
    const stages = [
      ["preparing", `${runnerLabel} acquired. Resolving project configuration; no untrusted code is executed.`],
      ["building", `Simulating \`${projInfo?.buildCommand || "npm run build"}\` and isolated container image build.`],
      ["pushing_image", "Simulating immutable image digest publication to the container registry."],
      ["provisioning", "Simulating isolated runtime allocation with configured CPU and memory limits."],
      ["health_checking", "Simulating application readiness and HTTPS routing checks."],
      ["ready", "Sandbox deployment complete. Your preview record is ready to explore."],
    ];
    for (const [stage, message] of stages) {
      await wait(1600);
      const accepted = await db.transaction(async tx => {
        const [current] = await tx.select().from(s.deployments).where(eq(s.deployments.id, id)).for("update");
        if (!current || !isRunning(current.status)) return false;
        const [project] = await tx.select().from(s.projects).where(eq(s.projects.id, current.projectId));
        const [branch] = await tx.select().from(s.branches).where(eq(s.branches.id, current.branchId));
        if (!project || !branch) return false;
        const failed = stage === "building" && current.trigger === "failure-test";
        await tx.update(s.deployments).set({ status: failed ? "build_failed" : stage, ...(failed ? { error: "Simulated build failure. The previous healthy deployment has been preserved.", finishedAt: new Date(), leaseUntil: null } : {}), ...(stage === "ready" ? { finishedAt: new Date(), durationSeconds: Math.max(1, Math.round((Date.now() - (current.startedAt?.getTime() || Date.now() - 10000)) / 1000)), imageDigest: `sandbox:sha256:${hashToken(current.commitSha + current.id)}`, leaseUntil: null } : {}) }).where(eq(s.deployments.id, id));
        await tx.insert(s.deploymentLogs).values({ organizationId: current.organizationId, deploymentId: id, stage, level: failed ? "error" : "info", message: failed ? "Simulated build failure requested. Existing healthy image and routing are preserved." : message });
        if (stage === "ready" || failed) {
          const [healthy] = await tx.select({ id: s.deployments.id }).from(s.deployments).where(and(eq(s.deployments.environmentId, current.environmentId), eq(s.deployments.status, "ready"))).limit(1);
          await tx.update(s.environments).set({ status: stage === "ready" ? "ready" : healthy ? "ready" : "stopped", lastActivityAt: new Date(), ...(stage === "ready" ? { expiresAt: branch.name === project.defaultBranch ? null : new Date(Date.now() + project.ttlHours * 3600000) } : {}) }).where(eq(s.environments.id, current.environmentId));
          await tx.insert(s.notifications).values({ organizationId: current.organizationId, title: failed ? "Deployment needs attention" : "Your preview is ready", body: `${project.name} · ${branch.name} ${failed ? "failed its sandbox build. The previous healthy deployment is preserved." : "has a fresh sandbox preview."}`, kind: failed ? "error" : "success", resourceId: id });
          await tx.insert(s.auditLogs).values({ organizationId: current.organizationId, actorId: current.actorId, action: failed ? "deployment.failed" : "environment.ready", resourceType: "deployment", resourceId: id, details: { mode: "sandbox", runner: project.runnerType, commit: current.commitSha } });
        }
        return !failed;
      });
      if (!accepted) break;
    }
    try {
      const gates = await runSecurityGates(id);
      if (gates.length) {
        const [job] = await db.select().from(s.deployments).where(eq(s.deployments.id, id));
        await db.insert(s.deploymentLogs).values({ organizationId: job.organizationId, deploymentId: id, stage: "security_gates", level: "info", message: `DevSecOps gates evaluated: ${gates.length} checks recorded (${gates.filter(g => "status" in g && g.status === "warn").length} advisory). Findings and severities retained in the Security Center.` });
      }
    } catch { /* gates are advisory in sandbox mode */ }
  } catch {
    await db.update(s.deployments).set({ status: "deploy_failed", error: "The worker could not complete this deployment. Please retry.", finishedAt: new Date(), leaseUntil: null }).where(and(eq(s.deployments.id, id), inArray(s.deployments.status, ACTIVE_STATUSES)));
  }
}
export async function cleanupExpiredEnvironments(organizationId: string) {
  const expired = await db.select().from(s.environments).where(and(eq(s.environments.organizationId, organizationId), eq(s.environments.protected, false), inArray(s.environments.status, ["ready", "stopped"]), lt(s.environments.expiresAt, new Date())));
  let cleaned = 0;
  for (const env of expired) {
    const [active] = await db.select().from(s.deployments).where(and(eq(s.deployments.environmentId, env.id), inArray(s.deployments.status, ACTIVE_STATUSES))).limit(1);
    if (active) continue;
    await db.update(s.environments).set({ status: "deleted" }).where(and(eq(s.environments.id, env.id), eq(s.environments.protected, false)));
    await audit(organizationId, null, "environment.cleaned_up", "environment", env.id, { reason: "retention_policy", hostname: env.hostname, mode: "sandbox" });
    cleaned++;
  }
  return cleaned;
}
export async function recoverOrganizationJobs(organizationId: string) {
  await cleanupExpiredEnvironments(organizationId);
  return db.select({ id: s.deployments.id }).from(s.deployments).where(and(eq(s.deployments.organizationId, organizationId), inArray(s.deployments.status, ACTIVE_STATUSES), lt(s.deployments.createdAt, new Date(Date.now() - 30000)), or(isNull(s.deployments.leaseUntil), lt(s.deployments.leaseUntil, new Date())))).limit(5);
}
export async function previousDeployment(organizationId: string, deploymentId: string) {
  const [current] = await db.select().from(s.deployments).where(and(eq(s.deployments.id, deploymentId), eq(s.deployments.organizationId, organizationId)));
  if (!current) throw new ApiError("Deployment not found.", 404);
  const [previous] = await db.select().from(s.deployments).where(and(eq(s.deployments.environmentId, current.environmentId), eq(s.deployments.status, "ready"), lt(s.deployments.createdAt, current.createdAt))).orderBy(desc(s.deployments.createdAt)).limit(1);
  if (!previous) throw new ApiError("There is no healthy deployment to roll back to.", 409);
  return previous;
}
export const randomCommit = () => randomBytes(20).toString("hex");
