// Pure metadata shared by server and client. No database imports here.
export type PolicyShape = {
  secretScanning?: boolean; sast?: boolean; dependencyAudit?: boolean; containerScan?: boolean;
  licenseCheck?: boolean; sbom?: boolean; imageSigning?: boolean; nonRootRuntime?: boolean;
  readOnlyRootfs?: boolean; networkIsolation?: boolean; requireApprovals?: boolean;
  failOnFindings?: boolean;
};

export const POLICY_FIELDS: { key: keyof PolicyShape; label: string; description: string; category: string }[] = [
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
  health_check: "Health check", provenance: "Build provenance", security_gates: "Security gates",
};

export function postureScore(policies: PolicyShape[]): number {
  if (!policies.length) return 0;
  const keys = POLICY_FIELDS.map(f => f.key);
  const total = policies.reduce((sum, policy) => {
    const on = keys.filter(k => policy[k] === true).length;
    return sum + Math.round((on / keys.length) * 100);
  }, 0);
  return Math.round(total / policies.length);
}
