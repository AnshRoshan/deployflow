import { and, eq, desc, gt, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import * as s from "@/db/schema";
import { safeDecrypt } from "./key";
import type { WorkspaceData, Role, OrganizationView } from "./types";

export async function getWorkspaceData(userId: string, sessionId: string | null, preferredOrg?: string): Promise<WorkspaceData> {
  const orgRows = await db.select({ org: s.organizations, role: s.memberships.role }).from(s.memberships).innerJoin(s.organizations, eq(s.organizations.id, s.memberships.organizationId)).where(and(eq(s.memberships.userId, userId), eq(s.memberships.status, "active"))).orderBy(s.memberships.createdAt);
  const selected = orgRows.find(r => r.org.id === preferredOrg) || orgRows[0];
  if (!selected) throw new Error("No active organization membership.");
  const orgId = selected.org.id; const where = eq(s.deployments.organizationId, orgId);
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
  const [projectRows, branchRows, deploymentRows, environmentRows, variableRows, domainRows, noticeRows, auditRows, metricRows, integrationRows, memberRows, sessionRows, tokenRows, runnerRows, policyRows, checkRows, flagRows, bindingRows, assetRows] = await Promise.all([
    db.select().from(s.projects).where(eq(s.projects.organizationId, orgId)).orderBy(s.projects.createdAt),
    db.select().from(s.branches).where(eq(s.branches.organizationId, orgId)).orderBy(s.branches.name),
    db.select({ d: s.deployments, p: s.projects, b: s.branches, u: s.users }).from(s.deployments).innerJoin(s.projects, eq(s.projects.id, s.deployments.projectId)).innerJoin(s.branches, eq(s.branches.id, s.deployments.branchId)).leftJoin(s.users, eq(s.users.id, s.deployments.actorId)).where(where).orderBy(desc(s.deployments.createdAt)).limit(150),
    db.select({ e: s.environments, p: s.projects, b: s.branches }).from(s.environments).innerJoin(s.projects, eq(s.projects.id, s.environments.projectId)).innerJoin(s.branches, eq(s.branches.id, s.environments.branchId)).where(and(eq(s.environments.organizationId, orgId), ne(s.environments.status, "deleted"))).orderBy(s.environments.createdAt),
    db.select().from(s.variables).where(eq(s.variables.organizationId, orgId)),
    db.select().from(s.domains).where(eq(s.domains.organizationId, orgId)),
    db.select().from(s.notifications).where(eq(s.notifications.organizationId, orgId)).orderBy(desc(s.notifications.createdAt)).limit(100),
    db.select({ a: s.auditLogs, u: s.users }).from(s.auditLogs).leftJoin(s.users, eq(s.users.id, s.auditLogs.actorId)).where(eq(s.auditLogs.organizationId, orgId)).orderBy(desc(s.auditLogs.createdAt)).limit(120),
    db.select().from(s.resourceMetrics).where(and(eq(s.resourceMetrics.organizationId, orgId), gt(s.resourceMetrics.recordedAt, new Date(Date.now() - 7 * 86400000)))).orderBy(s.resourceMetrics.recordedAt),
    db.select().from(s.integrations).where(eq(s.integrations.organizationId, orgId)),
    db.select({ m: s.memberships, u: s.users }).from(s.memberships).innerJoin(s.users, eq(s.users.id, s.memberships.userId)).where(eq(s.memberships.organizationId, orgId)),
    db.select().from(s.sessions).where(and(eq(s.sessions.userId, userId), gt(s.sessions.expiresAt, new Date()))).orderBy(desc(s.sessions.createdAt)),
    db.select().from(s.apiTokens).where(and(eq(s.apiTokens.organizationId, orgId), eq(s.apiTokens.revoked, false))),
    db.select().from(s.runners).where(eq(s.runners.organizationId, orgId)).orderBy(s.runners.createdAt),
    db.select().from(s.securityPolicies).where(eq(s.securityPolicies.organizationId, orgId)),
    db.select().from(s.pipelineChecks).where(eq(s.pipelineChecks.organizationId, orgId)).orderBy(desc(s.pipelineChecks.createdAt)).limit(120),
    db.select().from(s.featureFlags).where(eq(s.featureFlags.organizationId, orgId)).orderBy(s.featureFlags.createdAt),
    db.select().from(s.secretBindings).where(eq(s.secretBindings.organizationId, orgId)).orderBy(s.secretBindings.createdAt),
    db.select().from(s.generatedAssets).where(eq(s.generatedAssets.organizationId, orgId)).orderBy(desc(s.generatedAssets.createdAt)).limit(60),
  ]);
  const deploymentViews = deploymentRows.map(({ d, p, b, u }) => ({ ...d, projectName: p.name, framework: p.framework, color: p.color, branch: b.name, actor: u?.name || "GitHub" }));
  const integration = integrationRows[0];
  const activeStatuses = new Set(["queued", "preparing", "building", "pushing_image", "provisioning", "health_checking"]);
  const activeProjectIds = new Set(deploymentRows.filter(({ d }) => activeStatuses.has(d.status)).map(({ d }) => d.projectId));
  const data = {
    user: { id: user.id, name: user.name, email: user.email, color: user.color, emailVerified: user.emailVerified, mfaEnabled: !!user.mfaCipher },
    organization: { ...selected.org, role: selected.role as Role },
    organizations: orgRows.map(r => ({ ...r.org, role: r.role as Role })) as OrganizationView[],
    projects: projectRows.map(p => ({ ...p, branchCount: branchRows.filter(b => b.projectId === p.id).length, environmentCount: environmentRows.filter(e => e.p.id === p.id && e.e.status !== "stopped").length, lastDeploymentAt: deploymentViews.find(d => d.projectId === p.id)?.createdAt || null, status: deploymentViews.find(d => d.projectId === p.id)?.status || "not_deployed" })),
    branches: branchRows,
    deployments: deploymentViews,
    environments: environmentRows.map(({ e, p, b }) => ({ ...e, projectName: p.name, framework: p.framework, color: p.color, branch: b.name, commitSha: b.commitSha, cpu: p.cpu, memory: p.memory })),
    variables: variableRows.map(v => ({ ...v, valueCipher: undefined, value: v.secret ? "••••••••••••" : (safeDecrypt(v.valueCipher) ?? "•••••••• (unavailable)") })),
    domains: domainRows,
    notifications: noticeRows,
    auditLogs: auditRows.map(({ a, u }) => ({ ...a, actor: u?.name || "System" })),
    metrics: metricRows,
    integration: integration ? { id: integration.id, provider: integration.provider, account: integration.account, mode: integration.mode, connected: integration.connected, webhookConfigured: !!integration.webhookCipher, createdAt: integration.createdAt } : null,
    members: memberRows.map(({ m, u }) => ({ id: m.id, userId: u.id, name: u.name, email: u.email, color: u.color, role: m.role as Role, status: m.status })),
    sessions: sessionRows.map(session => ({ id: session.id, agent: session.agent, createdAt: session.createdAt, expiresAt: session.expiresAt, current: session.id === sessionId })),
    apiTokens: tokenRows.map(t => ({ id: t.id, name: t.name, prefix: t.prefix, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt })),
    runners: runnerRows.map(r => ({ id: r.id, name: r.name, kind: r.kind, status: r.status, region: r.region, capacity: r.capacity, prefix: r.prefix, lastHeartbeatAt: r.lastHeartbeatAt, createdAt: r.createdAt, activeJobs: deploymentRows.filter(({ d, p }) => activeStatuses.has(d.status) && p.runnerType === r.kind).length + (activeProjectIds.size && 0) })),
    securityPolicies: policyRows,
    pipelineChecks: checkRows.map(c => ({ id: c.id, deploymentId: c.deploymentId, projectId: c.projectId, checkType: c.checkType, status: c.status, severity: c.severity, findings: c.findings, detail: c.detail, durationSeconds: c.durationSeconds, createdAt: c.createdAt })),
    featureFlags: flagRows.map(f => ({ id: f.id, projectId: f.projectId, key: f.key, description: f.description, enabled: f.enabled, rollout: f.rollout, environments: f.environments, updatedAt: f.updatedAt })),
    secretBindings: bindingRows.map(b => ({ id: b.id, projectId: b.projectId, provider: b.provider, externalName: b.externalName, internalKey: b.internalKey, kind: b.kind, direction: b.direction, syncStatus: b.syncStatus, lastSyncedAt: b.lastSyncedAt })),
    generatedAssets: assetRows.map(a => ({ id: a.id, projectId: a.projectId, kind: a.kind, path: a.path, content: a.content, status: a.status, commitSha: a.commitSha, createdAt: a.createdAt })),
  };
  return JSON.parse(JSON.stringify(data)) as WorkspaceData;
}
export async function loadPageData(userId: string, sessionId: string | null) { return getWorkspaceData(userId, sessionId, (await cookies()).get("df_organization")?.value); }
export async function audit(organizationId: string, actorId: string | null, action: string, resourceType: string, resourceId?: string, details: Record<string, unknown> = {}) {
  await db.insert(s.auditLogs).values({ organizationId, actorId, action, resourceType, resourceId, details });
}
