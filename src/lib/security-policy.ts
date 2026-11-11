import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { securityPolicies, pipelineChecks, deployments } from "@/db/schema";

export type Policy = typeof securityPolicies.$inferSelect;
export type PolicyInput = Partial<Omit<Policy, "id" | "organizationId" | "projectId" | "createdAt" | "updatedAt">>;

export const POLICY_FIELDS: { key: keyof PolicyInput; label: string; description: string; category: string }[] = [
  { key: "secretScanning", label: "Secret scanning", description: "Block commits containing credentials or tokens before build.", category: "Source" },
  { key: "sast", label: "Static analysis (SAST)", description: "Scan source for injection, unsafe deserialization and unsafe defaults.", category: "Source" },
  { key: "dependencyAudit", label: "Dependency audit", description: "Check lockfiles for known CVEs and malicious packages.", category: "Supply chain" },
  { key: "licenseCheck", label: "License compliance", description: "Reject disallowed open-source licenses in production images.", category: "Supply chain" },
  { key: "containerScan", label: "Container image scan", description: "Scan the built image layers for OS and runtime vulnerabilities.", category: "Build" },
  { key: "sbom", label: "SBOM generation", description: "Attach a CycloneDX software bill of materials to every image.", category: "Build" },
  { key: "imageSigning", label: "Image signing", description: "Sign immutable digests and verify provenance before promotion.", category: "Build" },
  { key: "nonRootRuntime", label: "Non-root runtime", description: "Require containers to run as an unprivileged user.", category: "Runtime" },
  { key: "readOnlyRootfs", label: "Read-only root filesystem", description: "Mount the container root filesystem read-only.", category: "Runtime" },
  { key: "networkIsolation", label: "Network isolation", description: "Deny egress to the control plane and other tenants.", category: "Runtime" },
  { key: "requireApprovals", label: "Required approvals", description: "Require human approval before protected branches promote.", category: "Release" },
  { key: "failOnFindings", label: "Fail build on findings", description: "Stop the pipeline when severity exceeds the configured threshold.", category: "Release" },
];

export const CHECK_LABELS: Record<string, string> = {
  secret_scan: "Secret scanning", sast: "Static analysis", dependency_audit: "Dependency audit",
  license_check: "License compliance", container_scan: "Container image scan", sbom: "SBOM generation",
  image_signing: "Image signing", runtime_hardening: "Runtime hardening", branch_protection: "Branch protection",
  health_check: "Health check", provenance: "Build provenance",
};

export async function ensurePolicy(organizationId: string, projectId: string): Promise<Policy> {
  const [existing] = await db.select().from(securityPolicies).where(and(eq(securityPolicies.organizationId, organizationId), eq(securityPolicies.projectId, projectId)));
  if (existing) return existing;
  const [created] = await db.insert(securityPolicies).values({ organizationId, projectId }).onConflictDoNothing({ target: securityPolicies.projectId }).returning();
  if (created) return created;
  const [again] = await db.select().from(securityPolicies).where(eq(securityPolicies.projectId, projectId));
  return again;
}

export function enabledChecks(policy: Policy): string[] {
  const checks: string[] = [];
  if (policy.secretScanning) checks.push("secret_scan");
  if (policy.sast) checks.push("sast");
  if (policy.dependencyAudit) checks.push("dependency_audit");
  if (policy.licenseCheck) checks.push("license_check");
  if (policy.containerScan) checks.push("container_scan");
  if (policy.sbom) checks.push("sbom");
  if (policy.imageSigning) checks.push("image_signing");
  if (policy.nonRootRuntime || policy.readOnlyRootfs || policy.networkIsolation) checks.push("runtime_hardening");
  if (policy.requireApprovals) checks.push("branch_protection");
  return checks;
}

export function postureScore(policies: Policy[]): number {
  if (!policies.length) return 0;
  const keys = POLICY_FIELDS.map(f => f.key) as (keyof Policy)[];
  const total = policies.reduce((sum, policy) => {
    const on = keys.filter(k => typeof policy[k] === "boolean" && policy[k] === true).length;
    return sum + Math.round((on / keys.length) * 100);
  }, 0);
  return Math.round(total / policies.length);
}

// Deterministic sandbox results. In a live execution plane these records would be
// written by isolated scanners; here they are clearly marked as simulated.
export async function runSecurityGates(deploymentId: string) {
  const [deployment] = await db.select().from(deployments).where(eq(deployments.id, deploymentId));
  if (!deployment) return [];
  const policy = await ensurePolicy(deployment.organizationId, deployment.projectId);
  const checks = enabledChecks(policy);
  const existing = await db.select({ checkType: pipelineChecks.checkType }).from(pipelineChecks).where(eq(pipelineChecks.deploymentId, deploymentId));
  if (existing.length) return existing;
  const seed = Number.parseInt(deployment.commitSha.slice(0, 2), 16) || 0;
  const rows = checks.map((checkType, index) => {
    const warn = ["dependency_audit", "license_check"].includes(checkType) && (seed + index) % 11 === 0;
    const fail = deployment.trigger === "failure-test" && checkType === "secret_scan";
    return {
      organizationId: deployment.organizationId, deploymentId, projectId: deployment.projectId,
      checkType, status: fail ? "fail" : warn ? "warn" : "pass",
      severity: fail ? "critical" : warn ? "medium" : "none",
      findings: fail ? 1 : warn ? 1 + ((seed + index) % 3) : 0,
      detail: fail ? "Simulated: credential pattern detected in build context. Gate blocked promotion." : warn ? "Simulated: advisory-level findings recorded; promotion allowed by policy." : "Simulated: no blocking findings.",
      durationSeconds: 2 + ((seed + index * 3) % 12),
    };
  });
  if (rows.length) await db.insert(pipelineChecks).values(rows);
  return rows;
}
