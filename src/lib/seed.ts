import { db } from "@/db";
import { sql, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { encrypt, hashPassword, hashToken } from "./security";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./demo";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_ORG_ID = "00000000-0000-4000-8000-000000000002";
// RFC 4122 v4 layout with a valid variant nibble (8-b), so strict UUID validators accept every seeded id.
const sid = (group: number, n: number) => `10000000-0000-4000-8${String(group).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
const sha = (n: number) => Array.from({ length: 40 }, (_, i) => "a8f3c21e72b90d9c4d2e1650ab39cf728de6104f"[(n * 7 + i * 3) % 40]).join("");
export async function ensureDemo() {
  const [existing] = await db.select({ id: s.organizations.id }).from(s.organizations).where(eq(s.organizations.id, DEMO_ORG_ID)).limit(1);
  if (existing) { await seedPlatformExtras();
    const existingRunners = await db.select({ id: s.runners.id }).from(s.runners).where(eq(s.runners.organizationId, DEMO_ORG_ID)).limit(1);
    if (!existingRunners.length) {
      await db.insert(s.runners).values([
        { id: sid(13, 1), organizationId: DEMO_ORG_ID, name: "df-sandbox-docker-01", kind: "sandbox-docker", status: "online", region: "sandbox-local", capacity: 6, tokenHash: hashToken("demo-runner-docker-01"), prefix: "dfr_demo01" },
        { id: sid(13, 2), organizationId: DEMO_ORG_ID, name: "gh-actions-bridge-01", kind: "github-actions", status: "online", region: "github-hosted", capacity: 4, tokenHash: hashToken("demo-runner-gh-01"), prefix: "dfr_ghact1" },
        { id: sid(13, 3), organizationId: DEMO_ORG_ID, name: "gl-runner-sandbox-01", kind: "gitlab-runner", status: "paused", region: "sandbox-local", capacity: 4, tokenHash: hashToken("demo-runner-gl-01"), prefix: "dfr_glrun1" },
      ]).onConflictDoNothing();
    }
    return;
  }
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(742109)`);
    const [check] = await tx.select().from(s.organizations).where(eq(s.organizations.id, DEMO_ORG_ID)); if (check) return;
    const now = Date.now(); const ago = (minutes: number) => new Date(now - minutes * 60000);
    await tx.insert(s.users).values([
      { id: DEMO_USER_ID, name: "Jamie Davidson", email: DEMO_EMAIL, color: "peach", emailVerified: true, passwordHash: await hashPassword(DEMO_PASSWORD) },
      ...[["Alex Morgan", "alex@acme.dev", "mint"], ["Sarah Chen", "sarah@acme.dev", "lavender"], ["David Park", "david@acme.dev", "blue"], ["Emma Wilson", "emma@acme.dev", "pink"]].map((u, i) => ({ id: sid(1, i + 2), name: u[0], email: u[1], color: u[2], emailVerified: true })),
    ]);
    await tx.insert(s.organizations).values({ id: DEMO_ORG_ID, name: "Acme Engineering", slug: "acme-engineering", plan: "Pro", previewQuota: 30 });
    await tx.insert(s.memberships).values([
      { organizationId: DEMO_ORG_ID, userId: DEMO_USER_ID, role: "Owner" },
      ...[2, 3, 4, 5].map((n, i) => ({ organizationId: DEMO_ORG_ID, userId: sid(1, n), role: ["Admin", "Developer", "Developer", "QA Engineer"][i] })),
    ]);
    await tx.insert(s.integrations).values({ id: sid(12, 1), organizationId: DEMO_ORG_ID, account: "acme", mode: "demo", connected: true });
    await tx.insert(s.runners).values([
      { id: sid(13, 1), organizationId: DEMO_ORG_ID, name: "df-sandbox-docker-01", kind: "sandbox-docker", status: "online", region: "sandbox-local", capacity: 6, tokenHash: hashToken("demo-runner-docker-01"), prefix: "dfr_demo01" },
      { id: sid(13, 2), organizationId: DEMO_ORG_ID, name: "gh-actions-bridge-01", kind: "github-actions", status: "online", region: "github-hosted", capacity: 4, tokenHash: hashToken("demo-runner-gh-01"), prefix: "dfr_ghact1" },
      { id: sid(13, 3), organizationId: DEMO_ORG_ID, name: "gl-runner-sandbox-01", kind: "gitlab-runner", status: "paused", region: "sandbox-local", capacity: 4, tokenHash: hashToken("demo-runner-gl-01"), prefix: "dfr_glrun1" },
    ]);
    const specs: [string, string, string, string, string[]][] = [
      ["storefront", "Next.js", "black", "The customer-facing shopping experience.", ["main", "feature/checkout", "fix/cart-validation"]],
      ["nexus-api", "Node.js", "mint", "Core API and authentication services.", ["main", "feature/auth", "fix/rate-limits"]],
      ["marketing-site", "Next.js", "peach", "A faster, friendlier first impression.", ["main", "feature/new-homepage", "fix/responsive"]],
      ["dashboard", "React", "lavender", "Everything your customers need, in one place.", ["main", "feature/analytics", "fix/navigation"]],
      ["payments-service", "FastAPI", "blue", "Secure payment processing infrastructure.", ["main", "feature/subscriptions", "fix/webhooks"]],
      ["docs", "Next.js", "yellow", "Guides and references for our developer platform.", ["main", "feature/api-reference", "fix/search"]],
      ["component-library", "React", "pink", "The building blocks of a consistent experience.", ["main", "feature/data-table", "fix/accessibility"]],
      ["notifications-service", "Node.js", "slate", "The right message, at the right moment.", ["main", "feature/email-templates", "fix/queue-retries"]],
    ];
    const messages = ["Add checkout experience", "Update authentication middleware", "Refresh landing page hero", "Connect analytics endpoints", "Optimize product image loading", "Improve error handling", "Update dependencies", "Add validation checks"];
    for (let p = 0; p < specs.length; p++) {
      const [name, framework, color, description, branchNames] = specs[p];
      await tx.insert(s.projects).values({ id: sid(3, p + 1), organizationId: DEMO_ORG_ID, name, repository: `acme/${name}`, framework, color, description, defaultBranch: "main", createdAt: ago(14400 + p * 1440) });
      for (let b = 0; b < 3; b++) {
        const bn = b + p * 3 + 1; const branchId = sid(4, bn); const envId = sid(5, bn);
        await tx.insert(s.branches).values({ id: branchId, organizationId: DEMO_ORG_ID, projectId: sid(3, p + 1), name: branchNames[b], commitSha: sha(bn), message: messages[p], protected: b === 0, updatedAt: ago(p * 12 + b * 30) });
        await tx.insert(s.environments).values({ id: envId, organizationId: DEMO_ORG_ID, projectId: sid(3, p + 1), branchId, hostname: `${name}-${branchNames[b].replaceAll("/", "-")}.acme.preview.test`, status: "ready", protected: b === 0, createdAt: ago(10000 + bn * 10), lastActivityAt: ago(p * 12 + b * 30), expiresAt: b === 0 ? null : new Date(now + (72 - bn) * 3600000) });
      }
      for (let v = 0; v < 3; v++) await tx.insert(s.variables).values({ id: sid(7, p * 3 + v + 1), organizationId: DEMO_ORG_ID, projectId: sid(3, p + 1), key: ["NODE_ENV", "API_BASE_URL", "DATABASE_URL"][v], valueCipher: encrypt(["production", "https://api.acme.example/v1", "postgresql://sandbox:illustrative-only@db.test/app"][v]), secret: v === 2, phase: v === 2 ? "runtime" : "build" });
    }
    for (let i = 0; i < 142; i++) {
      const p = i < 5 ? [0, 1, 2, 3, 0][i] : i % 8;
      const b = i < 5 ? [1, 0, 2, 1, 0][i] : (i + Math.floor(i / 8)) % 3;
      const branchNumber = p * 3 + b + 1;
      const status = i === 3 ? "building" : i === 4 || i === 67 ? "build_failed" : "ready";
      const duration = status === "ready" ? 60 + (i * 17) % 49 : status === "build_failed" ? 47 : null;
      let createdAt = ago(i < 5 ? [2, 5, 12, 18, 24][i] : 40 + i * 69);
      if (i >= 5) {
        const counts = [12, 18, 24, 21, 27, 16, 19]; let cursor = i - 5; let day = 0;
        while (day < 6 && cursor >= counts[day]) { cursor -= counts[day]; day++; }
        const date = new Date(now); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - day));
        const minutes = day === 6 ? (cursor * 7) % Math.max(1, Math.floor((now - date.getTime()) / 60000)) : (cursor * 73 + 45) % 1440;
        createdAt = new Date(date.getTime() + minutes * 60000);
      }
      const id = sid(6, i + 1); const branchId = sid(4, branchNumber); const projectId = sid(3, p + 1);
      await tx.insert(s.deployments).values({ id, organizationId: DEMO_ORG_ID, projectId, branchId, environmentId: sid(5, branchNumber), commitSha: i === 0 ? "a8f3c21" + sha(i).slice(7) : sha(i + 150), message: messages[i < 5 ? i : i % messages.length], status, durationSeconds: duration, trigger: i % 4 === 0 ? "manual" : "github", actorId: i % 4 === 0 ? DEMO_USER_ID : sid(1, (i % 4) + 1), imageDigest: status === "ready" ? `sha256:${sha(i + 300)}` : null, error: status === "build_failed" ? "Build failed: TypeScript type check found 2 errors in src/components/ProductGrid.tsx. The previous healthy deployment is still available." : null, createdAt, startedAt: status === "building" ? null : createdAt, finishedAt: duration ? new Date(createdAt.getTime() + duration * 1000) : null, attempts: status === "building" ? 0 : 1 });
      const stages = [["queued", "Deployment accepted from " + (i % 4 === 0 ? "dashboard" : "GitHub webhook")], ["preparing", `Resolving immutable commit ${sha(i).slice(0, 7)}`], ["building", `Running ${specs[p][1] === "FastAPI" ? "pip install -r requirements.txt" : "npm ci && npm run build"}`], ["building", "Compiled application successfully. Running validation checks."], ["pushing_image", "Publishing sandbox image artifact (simulated)"], ["provisioning", "Allocating isolated runtime · 1 vCPU / 1 GB memory"], ["health_checking", "GET /health → 200 OK · sandbox health check passed"], ["ready", "Preview published. Your environment is ready to explore."]];
      for (let l = 0; l < stages.length; l++) {
        if (status === "build_failed" && l > 3) break;
        await tx.insert(s.deploymentLogs).values({ organizationId: DEMO_ORG_ID, deploymentId: id, stage: stages[l][0], level: status === "build_failed" && l === 3 ? "error" : "info", message: status === "build_failed" && l === 3 ? "TypeScript error TS2322: Type 'string' is not assignable to type 'number'. Build terminated; existing deployment preserved." : stages[l][1], createdAt: new Date(createdAt.getTime() + l * 10000) });
      }
    }
    for (let h = 0; h < 168; h++) await tx.insert(s.resourceMetrics).values({ organizationId: DEMO_ORG_ID, cpu: 22 + (h * 7) % 23, memory: 46 + (h * 11) % 23, requests: 800 + (h * 137) % 1500, recordedAt: ago(h * 60) });
    await tx.insert(s.domains).values([
      { id: sid(8, 1), organizationId: DEMO_ORG_ID, hostname: "*.acme.preview.test", verified: true, sslStatus: "active", kind: "wildcard", verificationToken: "sandbox-wildcard" },
      { id: sid(8, 2), organizationId: DEMO_ORG_ID, projectId: sid(3, 1), hostname: "preview.acme.example", verified: true, sslStatus: "active", kind: "custom", verificationToken: "deployflow-verification-demo" },
    ]);
    const notices = [
      ["Your preview is ready", "storefront · feature/checkout is ready to explore.", "success", 2, false],
      ["A deployment needs your attention", "storefront · main failed its build. Your previous preview is still healthy.", "error", 24, false],
      ["Keep your workspace tidy", "3 preview environments are approaching their cleanup window.", "info", 90, false],
      ["Welcome to your flow", "Your Acme Engineering workspace is ready. Start by connecting a project.", "success", 1440, true],
    ] as const;
    for (let n = 0; n < notices.length; n++) { const [title, body, kind, mins, read] = notices[n]; await tx.insert(s.notifications).values({ id: sid(9, n + 1), organizationId: DEMO_ORG_ID, userId: DEMO_USER_ID, title, body, kind, read, resourceId: sid(6, n === 1 ? 5 : 1), createdAt: ago(mins) }); }
    for (let a = 0; a < 8; a++) await tx.insert(s.auditLogs).values({ organizationId: DEMO_ORG_ID, actorId: a % 4 === 0 ? DEMO_USER_ID : sid(1, a % 4 + 1), action: ["deployment.created", "environment.ready", "project.created", "variable.updated", "deployment.failed", "member.invited", "domain.verified", "integration.connected"][a], resourceType: ["deployment", "environment", "project", "variable", "deployment", "member", "domain", "integration"][a], resourceId: sid(6, a + 1), createdAt: ago(3 + a * 37), details: { source: "sandbox demo" } });
  });
  await seedPlatformExtras();
}

// Idempotent DevSecOps demo content. One cheap existence check per page load.
async function seedPlatformExtras() {
  const [flag] = await db.select({ id: s.featureFlags.id }).from(s.featureFlags).where(eq(s.featureFlags.organizationId, DEMO_ORG_ID)).limit(1);
  if (flag) return;
  const projects = await db.select({ id: s.projects.id }).from(s.projects).where(eq(s.projects.organizationId, DEMO_ORG_ID));
  for (let i = 0; i < projects.length; i++) {
    await db.insert(s.securityPolicies).values({ organizationId: DEMO_ORG_ID, projectId: projects[i].id, imageSigning: i % 2 === 0, maxSeverity: i % 3 === 0 ? "critical" : "high" }).onConflictDoNothing();
  }
  const recent = await db.select({ id: s.deployments.id, projectId: s.deployments.projectId, status: s.deployments.status, commitSha: s.deployments.commitSha }).from(s.deployments).where(eq(s.deployments.organizationId, DEMO_ORG_ID)).limit(24);
  const types = ["secret_scan", "sast", "dependency_audit", "container_scan", "sbom", "runtime_hardening"];
  for (const deployment of recent) {
    const rows = types.map((checkType, i) => {
      const warn = checkType === "dependency_audit" && (parseInt(deployment.commitSha.slice(0, 2), 16) + i) % 7 === 0;
      const fail = deployment.status.includes("failed") && checkType === "secret_scan";
      return { organizationId: DEMO_ORG_ID, deploymentId: deployment.id, projectId: deployment.projectId, checkType, status: fail ? "fail" : warn ? "warn" : "pass", severity: fail ? "critical" : warn ? "medium" : "none", findings: fail ? 1 : warn ? 2 : 0, detail: fail ? "Simulated: credential pattern detected in build context. Gate blocked promotion." : warn ? "Simulated: advisory-level dependency findings; promotion allowed by policy." : "Simulated: no blocking findings.", durationSeconds: 2 + i * 3 };
    });
    await db.insert(s.pipelineChecks).values(rows).onConflictDoNothing();
  }
  await db.insert(s.featureFlags).values([
    { organizationId: DEMO_ORG_ID, projectId: projects[0]?.id, key: "new_checkout_flow", description: "Progressive rollout of the redesigned checkout experience.", enabled: true, rollout: 25, environments: ["production", "preview"] },
    { organizationId: DEMO_ORG_ID, projectId: projects[1]?.id, key: "ai_failure_hints", description: "Show explainable failure hints in the deployment details page.", enabled: true, rollout: 100, environments: ["production", "preview"] },
    { organizationId: DEMO_ORG_ID, key: "beta_billing_dashboard", description: "Early access to the new cost intelligence view.", enabled: false, rollout: 10, environments: ["preview"] },
    { organizationId: DEMO_ORG_ID, projectId: projects[3]?.id, key: "realtime_activity_feed", description: "Stream environment events into the dashboard.", enabled: true, rollout: 60, environments: ["preview"] },
  ]).onConflictDoNothing();
  await db.insert(s.secretBindings).values([
    { organizationId: DEMO_ORG_ID, provider: "github-actions", externalName: "DEPLOYFLOW_API_TOKEN", internalKey: "DEPLOYFLOW_API_TOKEN", kind: "secret", direction: "outbound", syncStatus: "configured" },
    { organizationId: DEMO_ORG_ID, provider: "github-actions", externalName: "REGISTRY_TOKEN", internalKey: "REGISTRY_TOKEN", kind: "secret", direction: "outbound", syncStatus: "pending" },
    { organizationId: DEMO_ORG_ID, provider: "github-actions", externalName: "DEPLOYFLOW_ORG_ID", internalKey: "ORGANIZATION_ID", kind: "variable", direction: "outbound", syncStatus: "configured" },
    { organizationId: DEMO_ORG_ID, provider: "gitlab-ci", externalName: "DEPLOYFLOW_API_TOKEN", internalKey: "DEPLOYFLOW_API_TOKEN", kind: "secret", direction: "outbound", syncStatus: "configured" },
    { organizationId: DEMO_ORG_ID, provider: "gitlab-ci", externalName: "PREVIEW_BASE_URL", internalKey: "PREVIEW_BASE_URL", kind: "variable", direction: "outbound", syncStatus: "pending" },
    { organizationId: DEMO_ORG_ID, provider: "vault", externalName: "production/database", internalKey: "DATABASE_URL", kind: "secret", direction: "inbound", syncStatus: "configured" },
  ]).onConflictDoNothing();
  console.log("[deployflow] seeded DevSecOps demo content");
}
