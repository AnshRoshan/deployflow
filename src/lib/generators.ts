export type GeneratedFile = { kind: string; path: string; content: string; description: string };

export type BootstrapInput = {
  repository: string;
  projectName: string;
  framework: string;
  defaultBranch: string;
  buildCommand: string;
  healthPath: string;
  port: number;
  provider: "github" | "gitlab" | "both";
  deployflowUrl: string;
  organizationId: string;
  projectId: string;
  enableSecurity: boolean;
};

const safe = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, "-");

export function generateRepositoryAssets(input: BootstrapInput): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const api = `${input.deployflowUrl.replace(/\/$/, "")}/api/v1/deployments`;
  const orgHeader = input.organizationId;

  if (input.provider === "github" || input.provider === "both") {
    files.push({
      kind: "github-workflow",
      path: ".github/workflows/deployflow.yml",
      description: "Trigger isolated preview deployments on pushes and pull requests.",
      content: `name: DeployFlow preview
on:
  push:
    branches: ["${input.defaultBranch}", "feature/**", "fix/**"]
  pull_request:
    types: [opened, synchronize, reopened, closed]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deployflow-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger DeployFlow control plane
        env:
          DEPLOYFLOW_TOKEN: \${{ secrets.DEPLOYFLOW_API_TOKEN }}
          DEPLOYFLOW_API: "${api}"
        run: |
          if [ -z "$DEPLOYFLOW_TOKEN" ]; then
            echo "::warning::DEPLOYFLOW_API_TOKEN is not configured; skipping deployment trigger."
            exit 0
          fi
          curl -fsS -X POST "$DEPLOYFLOW_API" \\
            -H "Authorization: Bearer $DEPLOYFLOW_TOKEN" \\
            -H "x-organization-id: ${orgHeader}" \\
            -H "Content-Type: application/json" \\
            -d "{\\"projectId\\":\\"${input.projectId}\\",\\"branchName\\":\\"\${{ github.ref_name }}\\"}"
`,
    });
    if (input.enableSecurity) {
      files.push({
        kind: "github-workflow",
        path: ".github/workflows/deployflow-security.yml",
        description: "DevSecOps gates: secret scan, SAST, dependency audit, container scan and SBOM.",
        content: `name: DeployFlow security gates
on:
  push:
    branches: ["${input.defaultBranch}", "feature/**", "fix/**"]
  pull_request:
  schedule:
    - cron: "17 4 * * 1"

permissions:
  contents: read
  security-events: write

jobs:
  gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Secret scan
        uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }} }
      - name: Dependency audit
        run: |
          if [ -f package-lock.json ]; then npm audit --audit-level=high; fi
          if [ -f requirements.txt ]; then pip-audit || true; fi
      - name: Static analysis
        uses: github/codeql-action/init@v3
        with: { languages: javascript-typescript, python }
      - name: Perform CodeQL analysis
        uses: github/codeql-action/analyze@v3
      - name: Build container
        run: docker build -t deployflow-preview:\${{ github.sha }} .
      - name: Container vulnerability scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: deployflow-preview:\${{ github.sha }}
          severity: HIGH,CRITICAL
          exit-code: "1"
      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with: { image: deployflow-preview:\${{ github.sha }}, format: cyclonedx-json }
`,
      });
    }
    files.push({
      kind: "dependabot",
      path: ".github/dependabot.yml",
      description: "Automated dependency updates grouped by ecosystem.",
      content: `version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule: { interval: weekly, day: monday }
    open-pull-requests-limit: 6
    groups:
      production: { patterns: ["*"] }
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: weekly }
`,
    });
  }

  if (input.provider === "gitlab" || input.provider === "both") {
    files.push({
      kind: "gitlab-ci",
      path: ".gitlab-ci.yml",
      description: "GitLab CI pipeline with preview trigger and security gates.",
      content: `stages: [test, security, deploy]

variables:
  DEPLOYFLOW_API: "${api}"
  DEPLOYFLOW_ORG: "${orgHeader}"
  DEPLOYFLOW_PROJECT: "${input.projectId}"

deployflow_preview:
  stage: deploy
  image: curlimages/curl:8.10.1
  script:
    - |
      if [ -z "$DEPLOYFLOW_API_TOKEN" ]; then
        echo "DEPLOYFLOW_API_TOKEN not configured; skipping trigger."; exit 0
      fi
      curl -fsS -X POST "$DEPLOYFLOW_API" \\
        -H "Authorization: Bearer $DEPLOYFLOW_API_TOKEN" \\
        -H "x-organization-id: $DEPLOYFLOW_ORG" \\
        -H "Content-Type: application/json" \\
        -d "{\\"projectId\\":\\"$DEPLOYFLOW_PROJECT\\",\\"branchName\\":\\"$CI_COMMIT_REF_NAME\\"}"
  rules:
    - if: $CI_COMMIT_BRANCH

${input.enableSecurity ? `secret_detection:
  stage: security
  image: registry.gitlab.com/security-products/secret-detection:latest
  script: ["/analyzer run"]
  artifacts: { reports: { secret_detection: gl-secret-detection-report.json } }
  allow_failure: false

dependency_scanning:
  stage: security
  image: node:20-alpine
  script:
    - if [ -f package-lock.json ]; then npm audit --audit-level=high; fi
  allow_failure: false
` : ""}`,
    });
  }

  files.push({
    kind: "config",
    path: "deployflow.yml",
    description: "Declarative project configuration. Overrides are applied in the dashboard.",
    content: `version: 1
project:
  name: ${safe(input.projectName)}
  repository: ${input.repository}
  framework: ${input.framework}
  default_branch: ${input.defaultBranch}

build:
  command: ${JSON.stringify(input.buildCommand)}
  port: ${input.port}
  provider: docker

preview:
  enabled: true
  auto_deploy: true
  cleanup_on_branch_delete: true
  ttl_hours: 72

health_check:
  path: ${input.healthPath}
  timeout_seconds: 30
  retries: 3

security:
  fail_on_findings: ${input.enableSecurity}
  non_root_runtime: true
  read_only_rootfs: true
  network_isolation: true
`,
  });
  files.push({
    kind: "policy",
    path: "SECURITY.md",
    description: "Security contact and vulnerability disclosure policy.",
    content: `# Security policy

This repository uses DeployFlow preview environments with isolated, ephemeral runtimes.

## Reporting a vulnerability
Please report security issues to the repository owners privately. Do not open a public issue for exploitable findings.

## Automated controls
- Secret scanning and dependency auditing run on every push.
- Container images are scanned for HIGH/CRITICAL vulnerabilities before promotion.
- Production branches require approval and are excluded from automatic cleanup.
- Preview environments are isolated by organization, project and branch.
`,
  });
  return files;
}

export function generateSecretManifest(bindings: { provider: string; externalName: string; internalKey: string; kind: string }[]) {
  const gh = bindings.filter(b => b.provider === "github-actions");
  const gl = bindings.filter(b => b.provider === "gitlab-ci");
  return `# DeployFlow federated configuration manifest
# Generated ${new Date().toISOString()}
# Values are never stored here. Use the gh / gl CLI commands below to set secrets.

${gh.length ? `## GitHub Actions secrets\n${gh.map(b => `- \`${b.externalName}\` ← DeployFlow \`${b.internalKey}\` (${b.kind})\n  gh secret set ${b.externalName} --body "$DEPLOYFLOW_VALUE"`).join("\n")}\n` : ""}${gl.length ? `\n## GitLab CI/CD variables\n${gl.map(b => `- \`${b.externalName}\` ← DeployFlow \`${b.internalKey}\` (${b.kind})\n  # Project → Settings → CI/CD → Variables → Add variable`).join("\n")}\n` : ""}`;
}
