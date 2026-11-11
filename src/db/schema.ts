import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, uniqueIndex, index, real } from "drizzle-orm/pg-core";

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull(), email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), color: text("color").notNull().default("mint"), emailVerified: boolean("email_verified").notNull().default(false),
  mfaCipher: text("mfa_cipher"), createdAt: created(),
});
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  agent: text("agent").notNull().default("Web browser"), createdAt: created(),
}, t => [index("sessions_user_idx").on(t.userId)]);
export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(), purpose: text("purpose").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: created(),
});
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull(), slug: text("slug").notNull().unique(), plan: text("plan").notNull().default("Pro"),
  mode: text("mode").notNull().default("sandbox"), previewQuota: integer("preview_quota").notNull().default(30), buildMinutesQuota: integer("build_minutes_quota").notNull().default(1000), createdAt: created(),
});
export const memberships = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), role: text("role").notNull().default("Developer"), status: text("status").notNull().default("active"), createdAt: created(),
}, t => [uniqueIndex("membership_unique").on(t.organizationId, t.userId)]);
export const integrations = pgTable("github_installations", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }).unique(),
  provider: text("provider").notNull().default("github"), account: text("account").notNull(), mode: text("mode").notNull().default("demo"),
  credentialCipher: text("credential_cipher"), webhookCipher: text("webhook_cipher"), connected: boolean("connected").notNull().default(true), createdAt: created(),
});
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(), repository: text("repository").notNull(), description: text("description").notNull().default(""), framework: text("framework").notNull().default("Next.js"),
  defaultBranch: text("default_branch").notNull().default("main"), buildCommand: text("build_command").notNull().default("npm run build"), startCommand: text("start_command").notNull().default("npm run start"),
  dockerfile: text("dockerfile").notNull().default("Dockerfile"), port: integer("port").notNull().default(3000), cpu: real("cpu").notNull().default(1), memory: integer("memory").notNull().default(1024),
  autoDeploy: boolean("auto_deploy").notNull().default(true), ttlHours: integer("ttl_hours").notNull().default(72), healthPath: text("health_path").notNull().default("/health"),
  branchRules: text("branch_rules").notNull().default("*"), runnerType: text("runner_type").notNull().default("sandbox-docker"), color: text("color").notNull().default("mint"), createdAt: created(),
}, t => [uniqueIndex("project_repository_unique").on(t.organizationId, t.repository), index("projects_org_idx").on(t.organizationId)]);
export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), name: text("name").notNull(), commitSha: text("commit_sha").notNull(),
  message: text("message").notNull().default("Update application"), enabled: boolean("enabled").notNull().default(true), protected: boolean("protected").notNull().default(false), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("branch_name_unique").on(t.projectId, t.name), index("branches_project_idx").on(t.projectId)]);
export const environments = pgTable("environments", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }).unique(),
  hostname: text("hostname").notNull().unique(), status: text("status").notNull().default("provisioning"), protected: boolean("protected").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }), lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(), createdAt: created(),
}, t => [index("environments_org_status_idx").on(t.organizationId, t.status)]);
export const deployments = pgTable("deployments", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
  environmentId: uuid("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }), commitSha: text("commit_sha").notNull(), message: text("message").notNull(),
  status: text("status").notNull().default("queued"), durationSeconds: integer("duration_seconds"), trigger: text("trigger").notNull().default("manual"), actorId: uuid("actor_id").references(() => users.id),
  imageDigest: text("image_digest"), error: text("error"), startedAt: timestamp("started_at", { withTimezone: true }), finishedAt: timestamp("finished_at", { withTimezone: true }),
  leaseUntil: timestamp("lease_until", { withTimezone: true }), attempts: integer("attempts").notNull().default(0), createdAt: created(),
}, t => [index("deployments_org_time_idx").on(t.organizationId, t.createdAt), index("deployments_status_idx").on(t.status), index("deployments_project_idx").on(t.projectId), index("deployments_branch_idx").on(t.branchId)]);
export const deploymentLogs = pgTable("deployment_logs", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  deploymentId: uuid("deployment_id").notNull().references(() => deployments.id, { onDelete: "cascade" }), stage: text("stage").notNull(), level: text("level").notNull().default("info"), message: text("message").notNull(), createdAt: created(),
}, t => [index("logs_deployment_idx").on(t.deploymentId)]);
export const variables = pgTable("environment_variables", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
  scopeKey: text("scope_key").notNull().default("*"), key: text("key").notNull(), valueCipher: text("value_cipher").notNull(), secret: boolean("secret").notNull().default(false),
  phase: text("phase").notNull().default("runtime"), version: integer("version").notNull().default(1), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("variable_scope_unique").on(t.projectId, t.scopeKey, t.key)]);
export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }), hostname: text("hostname").notNull().unique(), verified: boolean("verified").notNull().default(false),
  sslStatus: text("ssl_status").notNull().default("pending"), kind: text("kind").notNull().default("custom"), verificationToken: text("verification_token").notNull(), createdAt: created(),
});
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), title: text("title").notNull(), body: text("body").notNull(), kind: text("kind").notNull().default("success"),
  read: boolean("read").notNull().default(false), resourceId: uuid("resource_id"), createdAt: created(),
}, t => [index("notifications_org_idx").on(t.organizationId)]);
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id), action: text("action").notNull(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id"),
  result: text("result").notNull().default("success"), details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}), createdAt: created(),
}, t => [index("audit_org_time_idx").on(t.organizationId, t.createdAt)]);
export const resourceMetrics = pgTable("resource_metrics", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  cpu: real("cpu").notNull(), memory: real("memory").notNull(), requests: integer("requests").notNull().default(0), recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("metrics_org_time_idx").on(t.organizationId, t.recordedAt)]);
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  deliveryId: text("delivery_id").notNull().unique(), event: text("event").notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("pending"), error: text("error"), createdAt: created(),
});
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull().default(1), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const runners = pgTable("runners", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(), kind: text("kind").notNull().default("sandbox-docker"), status: text("status").notNull().default("online"),
  region: text("region").notNull().default("sandbox-local"), capacity: integer("capacity").notNull().default(4),
  tokenHash: text("token_hash").notNull().unique(), prefix: text("prefix").notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow(), createdAt: created(),
}, t => [uniqueIndex("runner_name_unique").on(t.organizationId, t.name), index("runners_org_idx").on(t.organizationId)]);
export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), name: text("name").notNull(), tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(), revoked: boolean("revoked").notNull().default(false), lastUsedAt: timestamp("last_used_at", { withTimezone: true }), createdAt: created(),
});

/* ── DevSecOps control plane ── */
export const securityPolicies = pgTable("security_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }).unique(),
  secretScanning: boolean("secret_scanning").notNull().default(true),
  sast: boolean("sast").notNull().default(true),
  dependencyAudit: boolean("dependency_audit").notNull().default(true),
  containerScan: boolean("container_scan").notNull().default(true),
  licenseCheck: boolean("license_check").notNull().default(true),
  sbom: boolean("sbom").notNull().default(true),
  imageSigning: boolean("image_signing").notNull().default(false),
  nonRootRuntime: boolean("non_root_runtime").notNull().default(true),
  readOnlyRootfs: boolean("read_only_rootfs").notNull().default(true),
  networkIsolation: boolean("network_isolation").notNull().default(true),
  requireApprovals: boolean("require_approvals").notNull().default(true),
  requiredApprovals: integer("required_approvals").notNull().default(1),
  maxSeverity: text("max_severity").notNull().default("high"),
  failOnFindings: boolean("fail_on_findings").notNull().default(true),
  allowedRegistries: text("allowed_registries").notNull().default("ghcr.io,registry.deployflow.internal"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: created(),
}, t => [index("security_policies_org_idx").on(t.organizationId)]);

export const pipelineChecks = pgTable("pipeline_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  deploymentId: uuid("deployment_id").notNull().references(() => deployments.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  checkType: text("check_type").notNull(),
  status: text("status").notNull().default("pass"),
  severity: text("severity").notNull().default("none"),
  findings: integer("findings").notNull().default(0),
  detail: text("detail").notNull().default(""),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  createdAt: created(),
}, t => [index("pipeline_checks_deployment_idx").on(t.deploymentId), index("pipeline_checks_org_idx").on(t.organizationId)]);

export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  description: text("description").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  rollout: integer("rollout").notNull().default(100),
  environments: jsonb("environments").$type<string[]>().notNull().default(["production", "preview"]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: created(),
}, t => [uniqueIndex("feature_flag_unique").on(t.organizationId, t.key), index("feature_flags_org_idx").on(t.organizationId)]);

export const secretBindings = pgTable("secret_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("github-actions"),
  externalName: text("external_name").notNull(),
  internalKey: text("internal_key").notNull(),
  kind: text("kind").notNull().default("secret"),
  direction: text("direction").notNull().default("outbound"),
  syncStatus: text("sync_status").notNull().default("pending"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: created(),
}, t => [uniqueIndex("secret_binding_unique").on(t.organizationId, t.provider, t.externalName), index("secret_bindings_org_idx").on(t.organizationId)]);

export const generatedAssets = pgTable("generated_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  path: text("path").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("generated"),
  commitSha: text("commit_sha"),
  createdAt: created(),
}, t => [uniqueIndex("generated_asset_unique").on(t.organizationId, t.projectId, t.path), index("generated_assets_org_idx").on(t.organizationId)]);
