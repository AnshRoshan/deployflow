"use client";
import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, Box, Check, CheckCheck, CircleAlert, CircleCheck, Copy, Download, FileCode2, GitBranch, GitFork, GitMerge, KeyRound, LockKeyhole, Plus, RefreshCw, Rocket, ShieldCheck, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useWorkspace } from "./workspace-context";
import { PageHeading } from "./dashboard";
import { Button, CopyButton, EmptyState, Field, Modal, StatusBadge, Toggle } from "./ui";
import { CHECK_LABELS, POLICY_FIELDS, postureScore } from "@/lib/policy-fields";
import { generateSecretManifest } from "@/lib/generators";
import { dateTime, downloadFile, timeAgo } from "@/lib/utils";
import type { FeatureFlagView, GeneratedAssetView, SecretBindingView, SecurityPolicyView } from "@/lib/types";

/* ───────────────────────── Security Center ───────────────────────── */

export function SecurityCenter() {
  const { data, mutate, canAdmin } = useWorkspace();
  const [projectId, setProjectId] = useState(data.projects[0]?.id || "");
  const [scanning, setScanning] = useState(false);
  const policies = data.securityPolicies;
  const checks = data.pipelineChecks;
  const score = postureScore(policies);
  const policy = policies.find(p => p.projectId === projectId);
  const project = data.projects.find(p => p.id === projectId);
  const failed = checks.filter(c => c.status === "fail");
  const warnings = checks.filter(c => c.status === "warn");
  const passing = checks.filter(c => c.status === "pass");
  const updatePolicy = (key: string, value: boolean) => { if (!policy) return; void mutate("/api/security", { projectId, [key]: value }, "PATCH", "Security policy updated.").catch(() => {}); };
  const runScan = async () => {
    const deployment = data.deployments[0];
    if (!deployment) return;
    setScanning(true);
    try { await mutate("/api/security", { deploymentId: deployment.id }, "POST", "Security gates evaluated and recorded."); } catch {} finally { setScanning(false); }
  };

  return <>
    <PageHeading title="Security center" description="Default DevSecOps gates, policy coverage, and recorded findings across every deployment.">
      <Link className="btn btn-secondary" href="/onboarding"><FileCode2 size={13} /> Generate CI workflows</Link>
      <Button variant="primary" loading={scanning} disabled={!data.deployments.length} onClick={runScan}><RefreshCw size={13} /> Evaluate gates</Button>
    </PageHeading>

    <div className="sec-hero">
      <section className="card sec-score-card">
        <div className="sec-score-ring" style={{ ["--score" as string]: `${score}%` }}><span>{score}</span></div>
        <div>
          <h3>Security posture score</h3>
          <p>Weighted from {POLICY_FIELDS.length} default controls across {policies.length} project polic{policies.length === 1 ? "y" : "ies"}. Gates run before promotion; blocking findings preserve the last healthy preview.</p>
          <div className="flex-center" style={{ marginTop: 12, gap: 8 }}>
            <StatusBadge status={score >= 80 ? "active" : "pending"} />
            <span className="text-muted" style={{ fontSize: 10.5 }}>Updated {policy ? timeAgo(policy.updatedAt) : "never"}</span>
          </div>
        </div>
      </section>
      <section className="card settings-card">
        <h3>Enforced by default</h3>
        <p>Every new project inherits these gates. Overrides are per project and fully audited.</p>
        {["Secret scanning before build", "SAST + dependency audit", "Container scan + SBOM", "Non-root, read-only, isolated runtime", "Protected branches require approval"].map(item => (
          <div key={item} className="flex-center" style={{ fontSize: 11, padding: "5px 0", color: "var(--ink-2)" }}><Check size={13} color="var(--brand)" />{item}</div>
        ))}
      </section>
    </div>

    <div className="sec-grid">
      <StatTile icon={ShieldCheck} label="Gates evaluated" value={checks.length} caption={`${passing.length} clean pass results`} />
      <StatTile icon={CircleAlert} label="Blocking findings" value={failed.length} caption="Promotion stopped by policy" tone="danger" />
      <StatTile icon={Activity} label="Advisory findings" value={warnings.length} caption="Recorded, non-blocking" tone="warning" />
    </div>

    <section className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div><h2>Policy engine <span className="count-label">{project?.name || "No project"}</span></h2><p>Toggle controls for this project. Changes apply to the next deployment.</p></div>
        <select className="select-input" value={projectId} onChange={e => setProjectId(e.target.value)} aria-label="Select project">
          {data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {policy ? <div className="sec-policy-list">
        {POLICY_FIELDS.map(field => (
          <div className="sec-policy-row" key={String(field.key)}>
            <div><h4>{field.label} <span className="text-muted" style={{ fontSize: 9, fontWeight: 400 }}>· {field.category}</span></h4><p>{field.description}</p></div>
            <Toggle label={field.label} checked={Boolean(policy[field.key as keyof SecurityPolicyView])} disabled={!canAdmin} onChange={value => updatePolicy(String(field.key), value)} />
          </div>
        ))}
        <div className="sec-policy-row">
          <div><h4>Severity threshold</h4><p>Findings at or above this level block promotion when fail-on-findings is enabled.</p></div>
          <select className="select-input" value={policy.maxSeverity} disabled={!canAdmin} onChange={e => { void mutate("/api/security", { projectId, maxSeverity: e.target.value }, "PATCH", "Severity threshold updated.").catch(() => {}); }} aria-label="Severity threshold">
            {["low", "medium", "high", "critical"].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div className="sec-policy-row">
          <div><h4>Required approvals</h4><p>Human approvals needed before a protected branch can promote.</p></div>
          <select className="select-input" value={policy.requiredApprovals} disabled={!canAdmin} onChange={e => { void mutate("/api/security", { projectId, requiredApprovals: Number(e.target.value) }, "PATCH", "Approval policy updated.").catch(() => {}); }} aria-label="Required approvals">
            {[0, 1, 2, 3].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div> : <EmptyState icon={ShieldCheck} title="No policy for this project" description="Policies are created automatically for new projects." />}
    </section>

    <section className="card">
      <div className="card-header"><div><h2>Recent gate results</h2><p>Persisted per-deployment findings. Simulated in this sandbox installation.</p></div><Link href="/deployments" className="text-link">All deployments <ArrowUpRight size={12} /></Link></div>
      {checks.slice(0, 12).map(check => (
        <div className="sec-check-row" key={check.id}>
          <span className={`sec-check-icon ${check.status === "fail" ? "fail" : check.status === "warn" ? "warn" : "pass"}`}>
            {check.status === "fail" ? <CircleAlert size={14} /> : check.status === "warn" ? <Activity size={14} /> : <Check size={14} />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sec-check-name">{CHECK_LABELS[check.checkType] || check.checkType.replaceAll("_", " ")}</div>
            <div className="sec-check-meta">{check.detail || `${check.findings} findings`} · {timeAgo(check.createdAt)}</div>
          </div>
          <StatusBadge status={check.status === "fail" ? "failed" : check.status === "warn" ? "pending" : "ready"} />
          <span className="cell-secondary">{check.severity !== "none" ? check.severity : `${check.durationSeconds}s`}</span>
        </div>
      ))}
      {!checks.length && <EmptyState icon={ShieldCheck} title="No gates recorded yet" description="Evaluate gates on a deployment to populate security results." />}
    </section>
  </>;
}

function StatTile({ icon: Icon, label, value, caption, tone }: { icon: typeof ShieldCheck; label: string; value: number; caption: string; tone?: "danger" | "warning" }) {
  return <section className="sec-tile">
    <div className="sec-tile-head"><span className="sec-tile-icon"><Icon size={17} /></span>{tone && <StatusBadge status={tone === "danger" ? "failed" : "pending"} />}</div>
    <div className="stat-value">{value}</div><p><strong style={{ color: "var(--ink-2)" }}>{label}</strong> · {caption}</p>
  </section>;
}

/* ───────────────────────── Feature Flags ───────────────────────── */

export function FeatureFlagsPage() {
  const { data, mutate, openModal, canDeploy } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ key: "", description: "", projectId: "", rollout: 100, production: true, preview: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const create = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      await mutate("/api/flags", { key: form.key, description: form.description, projectId: form.projectId || null, enabled: false, rollout: form.rollout, environments: [form.production && "production", form.preview && "preview"].filter(Boolean) }, "POST", `Flag ${form.key} created.`);
      setCreateOpen(false); setForm({ key: "", description: "", projectId: "", rollout: 100, production: true, preview: true });
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  };
  return <>
    <PageHeading title="Feature flags" description="Progressive rollouts with environment scoping — independent of branch configuration.">
      <Button variant="primary" disabled={!canDeploy} onClick={() => setCreateOpen(true)}><Plus size={14} /> New flag</Button>
    </PageHeading>
    <div className="notice-banner"><Sparkles size={19} /><div><strong>Flags are separate from environment variables.</strong> A flag controls behavior at runtime; a variable controls configuration. Both can be scoped per project, and neither leaks across organizations.</div></div>
    {data.featureFlags.length ? <div className="project-page-grid">{data.featureFlags.map(flag => <FlagCard key={flag.id} flag={flag} />)}</div> : <section className="card"><EmptyState icon={Sparkles} title="Ship behind a switch" description="Create your first flag to control a rollout without redeploying." action={canDeploy && <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={13} /> New flag</Button>} /></section>}
    {createOpen && <Modal title="A safer way to ship." subtitle="Create a flag with a name, scope, and rollout percentage." onClose={() => setCreateOpen(false)}>
      <form onSubmit={create}><div className="modal-body">
        <Field label="Flag key" hint="Lowercase letters, numbers, and underscores."><input className="mono" value={form.key} onChange={e => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="new_checkout_flow" required minLength={2} maxLength={60} /></Field>
        <Field label="Description"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What does this flag control?" maxLength={200} /></Field>
        <Field label="Project scope"><select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })}><option value="">Organization-wide</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label={`Rollout · ${form.rollout}%`}><input type="range" min={0} max={100} value={form.rollout} onChange={e => setForm({ ...form, rollout: Number(e.target.value) })} /></Field>
        <label className="check-label"><input type="checkbox" checked={form.production} onChange={e => setForm({ ...form, production: e.target.checked })} /> Production</label>
        <label className="check-label" style={{ marginTop: 8 }}><input type="checkbox" checked={form.preview} onChange={e => setForm({ ...form, preview: e.target.checked })} /> Preview environments</label>
        {error && <div className="inline-note error"><CircleAlert size={15} />{error}</div>}
      </div><div className="modal-footer"><Button type="button" onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="primary" type="submit" loading={loading} disabled={form.key.length < 2}>Create flag</Button></div></form>
    </Modal>}
  </>;
}

function FlagCard({ flag }: { flag: FeatureFlagView }) {
  const { data, mutate, openModal, canDeploy } = useWorkspace();
  const [rollout, setRollout] = useState(flag.rollout);
  const project = data.projects.find(p => p.id === flag.projectId);
  return <article className="flag-card">
    <div className="flag-top"><span className="flag-key">{flag.key}</span><Toggle checked={flag.enabled} disabled={!canDeploy} label={`Enable ${flag.key}`} onChange={enabled => { void mutate("/api/flags", { id: flag.id, enabled }, "PATCH", `${flag.key} ${enabled ? "enabled" : "disabled"}.`).catch(() => {}); }} /></div>
    <p>{flag.description || "No description provided."}</p>
    <div className="flex-center" style={{ gap: 6, flexWrap: "wrap" }}>
      <span className="flag-pill">{project?.name || "All projects"}</span>
      {flag.environments.map(env => <span key={env} className="status-badge status-gray">{env}</span>)}
    </div>
    <div className="flag-rollout">
      <input type="range" min={0} max={100} value={rollout} disabled={!canDeploy} onChange={e => setRollout(Number(e.target.value))} onPointerUp={() => { void mutate("/api/flags", { id: flag.id, rollout }, "PATCH", `${flag.key} rollout set to ${rollout}%.`).catch(() => {}); }} />
      <span className="flag-pill">{rollout}%</span>
    </div>
    <div className="flex-center" style={{ borderTop: "1px solid var(--line)", paddingTop: 11 }}>
      <span className="cell-secondary">Updated {timeAgo(flag.updatedAt)}</span>
      <button className="icon-button ml-auto" aria-label={`Delete flag ${flag.key}`} disabled={!canDeploy} onClick={() => openModal({ type: "confirm", title: `Delete ${flag.key}?`, description: "This removes the flag and its rollout configuration. Applications reading the flag should treat it as disabled.", confirmLabel: "Delete flag", danger: true, onConfirm: () => mutate("/api/flags", { id: flag.id }, "DELETE", "Feature flag deleted.") })}><Trash2 size={14} /></button>
    </div>
  </article>;
}

/* ───────────────────────── Secrets & Config ───────────────────────── */

const PROVIDERS = [
  { id: "deployflow", label: "DeployFlow", icon: LockKeyhole },
  { id: "github-actions", label: "GitHub Actions", icon: GitFork },
  { id: "gitlab-ci", label: "GitLab CI/CD", icon: GitMerge },
  { id: "external", label: "Vault / AWS", icon: KeyRound },
];

export function SecretsHubPage() {
  const { data, mutate, canAdmin, openModal } = useWorkspace();
  const [tab, setTab] = useState("deployflow");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ provider: "github-actions", externalName: "", internalKey: "", kind: "secret", direction: "outbound", projectId: "" });
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const bindings = data.secretBindings.filter(b => tab === "external" ? ["vault", "aws-secrets-manager"].includes(b.provider) : b.provider === tab);
  const providerLabel = PROVIDERS.find(p => p.id === tab)?.label || "Provider";
  const manifest = useMemo(() => generateSecretManifest(data.secretBindings), [data.secretBindings]);
  const cli = tab === "github-actions" ? `gh secret set DEPLOYFLOW_API_TOKEN --body "$DEPLOYFLOW_VALUE"\ngh variable set DEPLOYFLOW_ORG_ID --body "<organization-id>"` : tab === "gitlab-ci" ? `# Project → Settings → CI/CD → Variables\n# Add DEPLOYFLOW_API_TOKEN as a masked, protected variable\n# Add PREVIEW_BASE_URL as a plain variable` : `# Use your provider CLI to sync the bound keys\nvault kv put secret/deployflow DATABASE_URL="$DEPLOYFLOW_VALUE"`;
  const create = async (e: FormEvent) => { e.preventDefault(); setLoading(true); setError(""); try { await mutate("/api/config/bindings", { ...form, projectId: form.projectId || null }, "POST", "Configuration binding created."); setCreateOpen(false); } catch (err) { setError((err as Error).message); } finally { setLoading(false); } };

  return <>
    <PageHeading title="Secrets & config" description="One place for DeployFlow variables and their GitHub, GitLab, Vault, and AWS counterparts.">
      <Button onClick={() => downloadFile("deployflow-config-manifest.md", manifest, "text/markdown")}><Download size={13} /> Download manifest</Button>
      <Button variant="primary" disabled={!canAdmin} onClick={() => { setForm({ ...form, provider: tab === "deployflow" || tab === "external" ? "github-actions" : tab }); setCreateOpen(true); }}><Plus size={14} /> New binding</Button>
    </PageHeading>
    <div className="notice-banner"><LockKeyhole size={19} /><div><strong>Values never leave the control plane.</strong> Bindings store names and metadata only. DeployFlow variables are encrypted with AES-256-GCM; the generated manifest contains CLI commands, never plaintext secrets.</div></div>
    <div className="hub-tabs">{PROVIDERS.map(p => <button key={p.id} className={`hub-tab ${tab === p.id ? "active" : ""}`} onClick={() => setTab(p.id)}><p.icon size={14} />{p.label}<span className="count-label">{p.id === "deployflow" ? data.variables.length : data.secretBindings.filter(b => p.id === "external" ? ["vault", "aws-secrets-manager"].includes(b.provider) : b.provider === p.id).length}</span></button>)}</div>

    {tab === "deployflow" ? <section className="card">
      <div className="card-header"><div><h2>DeployFlow variables</h2><p>Project defaults with branch-level overrides. Edit them on a project's Variables tab.</p></div><Link href="/projects" className="text-link">Open projects <ArrowUpRight size={12} /></Link></div>
      <div className="table-scroll"><table className="full-table"><thead><tr><th>Key</th><th>Value</th><th>Project</th><th>Scope</th><th>Phase</th><th>Type</th></tr></thead><tbody>{data.variables.map(v => <tr key={v.id}>
        <td className="mono" style={{ fontSize: 11 }}>{v.key}</td>
        <td className="mono" style={{ fontSize: 11 }}>{v.secret ? "••••••••••••" : v.value.length > 24 ? v.value.slice(0, 24) + "…" : v.value}</td>
        <td>{data.projects.find(p => p.id === v.projectId)?.name || "—"}</td>
        <td>{data.branches.find(b => b.id === v.branchId)?.name || "All branches"}</td>
        <td className="time-cell">{v.phase === "both" ? "Build & runtime" : v.phase}</td>
        <td><StatusBadge status={v.secret ? "active" : "pending"} /></td>
      </tr>)}</tbody></table></div>
      {!data.variables.length && <EmptyState icon={KeyRound} title="No variables yet" description="Add project defaults and branch overrides from a project page." />}
    </section> : <div className="settings-grid">
      <section className="card">
        <div className="card-header"><div><h2>{providerLabel} bindings</h2><p>Maps an external secret or variable name to a DeployFlow key.</p></div></div>
        {bindings.length ? bindings.map(b => <div className="hub-binding" key={b.id}>
          <span className="sec-tile-icon"><KeyRound size={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}><code>{b.externalName}</code><div className="cell-secondary">← {b.internalKey} · {b.kind} · {b.direction}</div></div>
          <StatusBadge status={b.syncStatus === "configured" || b.syncStatus === "synced" ? "active" : "pending"} />
          <Button size="small" disabled={!canAdmin} onClick={() => { void mutate("/api/config/bindings", { id: b.id, syncStatus: "synced" }, "PATCH", `${b.externalName} marked as synced.`).catch(() => {}); }}><CheckCheck size={12} /> Mark synced</Button>
          <button className="icon-button" aria-label={`Delete binding ${b.externalName}`} disabled={!canAdmin} onClick={() => openModal({ type: "confirm", title: `Delete ${b.externalName}?`, description: "Only the mapping is removed. The external secret in your provider is not modified.", confirmLabel: "Delete binding", danger: true, onConfirm: () => mutate("/api/config/bindings", { id: b.id }, "DELETE", "Binding removed.") })}><Trash2 size={14} /></button>
        </div>) : <EmptyState icon={KeyRound} title={`No ${providerLabel} bindings`} description="Create a binding to document and sync this provider's configuration." />}
      </section>
      <section className="card settings-card">
        <h3>Exact CLI commands</h3><p>Run these in your repository or CI provider to set the referenced names.</p>
        <div className="code-block" style={{ margin: 0 }}>{cli}</div>
        <div className="inline-note" style={{ marginTop: 14 }}><ShieldCheck size={15} />GitHub fine-grained tokens used by DeployFlow need <strong>Contents: write</strong> and <strong>Workflows: write</strong> only when committing generated workflows from Onboarding.</div>
        <Link href="/onboarding" className="text-link" style={{ marginTop: 16 }}>Generate CI workflows <ArrowUpRight size={12} /></Link>
      </section>
    </div>}

    {createOpen && <Modal title="Bind an external configuration name" subtitle="Only names and metadata are stored — never values." onClose={() => setCreateOpen(false)}>
      <form onSubmit={create}><div className="modal-body">
        <Field label="Provider"><select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>{["github-actions", "gitlab-ci", "vault", "aws-secrets-manager", "deployflow"].map(v => <option key={v}>{v}</option>)}</select></Field>
        <div className="form-grid">
          <Field label="External name"><input className="mono" value={form.externalName} onChange={e => setForm({ ...form, externalName: e.target.value.toUpperCase() })} placeholder="DEPLOYFLOW_API_TOKEN" required /></Field>
          <Field label="DeployFlow key"><input className="mono" value={form.internalKey} onChange={e => setForm({ ...form, internalKey: e.target.value.toUpperCase() })} placeholder="DEPLOYFLOW_API_TOKEN" required /></Field>
        </div>
        <div className="form-grid"><Field label="Type"><select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="secret">Secret</option><option value="variable">Variable</option></select></Field><Field label="Direction"><select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option value="outbound">DeployFlow → provider</option><option value="inbound">Provider → DeployFlow</option></select></Field></div>
        <Field label="Project scope"><select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })}><option value="">Organization-wide</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        {error && <div className="inline-note error"><CircleAlert size={15} />{error}</div>}
      </div><div className="modal-footer"><Button type="button" onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="primary" type="submit" loading={loading}>Create binding</Button></div></form>
    </Modal>}
  </>;
}

/* ───────────────────────── Repository Onboarding ───────────────────────── */

export function OnboardingPage() {
  const { data, mutate, canDeploy, canAdmin } = useWorkspace();
  const [projectId, setProjectId] = useState(data.projects[0]?.id || "");
  const [provider, setProvider] = useState<"github" | "gitlab" | "both">("both");
  const [enableSecurity, setEnableSecurity] = useState(true);
  const [files, setFiles] = useState<{ path: string; kind: string; content: string; description: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState("");
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [branch, setBranch] = useState(data.projects[0]?.defaultBranch || "main");
  const [message, setMessage] = useState("chore: add DeployFlow CI and security workflows");
  const [mode, setMode] = useState<"simulate" | "github">("simulate");
  const [result, setResult] = useState<{ mode: string; results: { path: string; commitSha: string }[] } | null>(null);
  const [error, setError] = useState("");
  const project = data.projects.find(p => p.id === projectId);
  const persisted = data.generatedAssets.filter(a => a.projectId === projectId);

  const generate = async () => {
    if (!projectId) return; setGenerating(true); setError("");
    try {
      const res = await mutate("/api/onboarding/generate", { projectId, provider, enableSecurity }, "POST", "CI configuration generated.");
      const list = (res.files || []) as typeof files;
      setFiles(list); setSelected(list.map(f => f.path)); setPreview(list[0]?.path || "");
    } catch (e) { setError((e as Error).message); } finally { setGenerating(false); }
  };
  const apply = async () => {
    if (!selected.length) return; setApplying(true); setError(""); setResult(null);
    try {
      const res = await mutate("/api/onboarding/apply", { projectId, paths: selected, branch, commitMessage: message, mode }, "POST", mode === "github" ? "Workflows committed to GitHub." : "Commit simulated and assets recorded.");
      setResult(res as unknown as typeof result);
    } catch (e) { setError((e as Error).message); } finally { setApplying(false); }
  };
  const toggle = (path: string) => setSelected(items => items.includes(path) ? items.filter(p => p !== path) : [...items, path]);
  const downloadBundle = () => downloadFile("deployflow-bootstrap.txt", files.filter(f => selected.includes(f.path)).map(f => `# ===== ${f.path} =====\n${f.content}`).join("\n\n"), "text/plain");

  return <>
    <PageHeading title="Repository onboarding" description="Attach a repository, generate its CI/CD and security workflows, preview every file, then commit from here.">
      <Link className="btn btn-secondary" href="/integrations"><GitFork size={13} /> Manage connections</Link>
      <Button variant="primary" loading={generating} disabled={!projectId || !canDeploy} onClick={generate}><Wand2 size={14} /> Generate files</Button>
    </PageHeading>
    <div className="notice-banner"><Rocket size={19} /><div><strong>Zero manual YAML.</strong> We generate GitHub Actions, GitLab CI, Dependabot, deployflow.yml and SECURITY.md, wired to your organization and project IDs. Preview first, then commit via the GitHub Contents API or simulate locally.</div></div>
    {error && <div className="inline-note error"><CircleAlert size={15} />{error}</div>}

    <div className="wizard-grid">
      <div>
        <section className="card settings-card" style={{ marginBottom: 18 }}>
          <h3>1 · Choose the repository</h3><p>Pick a connected project. The generator reads its framework, build command and health path.</p>
          <Field label="Project"><select value={projectId} onChange={e => { setProjectId(e.target.value); const p = data.projects.find(x => x.id === e.target.value); setBranch(p?.defaultBranch || "main"); setFiles([]); setSelected([]); }}><option value="">Select a project</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name} · {p.repository}</option>)}</select></Field>
          <Field label="CI provider"><div className="segmented">{(["github", "gitlab", "both"] as const).map(v => <button key={v} className={provider === v ? "active" : ""} onClick={() => setProvider(v)}>{v === "both" ? "Both" : v === "github" ? "GitHub Actions" : "GitLab CI"}</button>)}</div></Field>
          <div className="setting-row"><div><h4>Security workflow</h4><p>Add secret scanning, SAST, dependency audit, container scan and SBOM steps.</p></div><Toggle checked={enableSecurity} onChange={setEnableSecurity} label="Security workflow" /></div>
          {project && <div className="credential-box">{project.repository} · {project.framework} · {project.buildCommand} · {project.healthPath}</div>}
        </section>
        <section className="card">
          <div className="card-header"><div><h2>2 · Review generated files <span className="count-label">{files.length}</span></h2><p>Select the files to include in the commit bundle.</p></div>{files.length > 0 && <Button size="small" onClick={downloadBundle}><Download size={12} /> Download bundle</Button>}</div>
          {files.length ? <div className="file-list" style={{ padding: "0 18px 16px" }}>{files.map(file => <label className="file-item" key={file.path}>
            <input type="checkbox" checked={selected.includes(file.path)} onChange={() => toggle(file.path)} />
            <code>{file.path}</code><span className="cell-secondary">{file.kind}</span>
            <button type="button" className="icon-button" aria-label={`Preview ${file.path}`} onClick={e => { e.preventDefault(); setPreview(file.path); }}><FileCode2 size={14} /></button>
          </label>)}</div> : <EmptyState icon={FileCode2} title="No files generated yet" description="Click Generate files to build a ready-to-commit CI bundle." />}
        </section>
      </div>
      <div>
        <section className="card settings-card" style={{ marginBottom: 18 }}>
          <h3>3 · File preview</h3><p>{preview ? files.find(f => f.path === preview)?.description : "Select a file to inspect its content."}</p>
          {preview ? <><div className="flex-center" style={{ marginBottom: 8 }}><code className="mono" style={{ fontSize: 10.5 }}>{preview}</code><CopyButton text={files.find(f => f.path === preview)?.content || ""} /></div><pre className="file-preview">{files.find(f => f.path === preview)?.content}</pre></> : <div className="inline-note">All generated files are plain YAML or Markdown. Nothing is executed until you commit them.</div>}
        </section>
        <section className="card settings-card">
          <h3>4 · Commit from DeployFlow</h3><p>Files are written serially to avoid GitHub Contents API conflicts.</p>
          <Field label="Target branch"><input value={branch} onChange={e => setBranch(e.target.value)} required /></Field>
          <Field label="Commit message"><input value={message} onChange={e => setMessage(e.target.value)} required /></Field>
          <Field label="Mode" hint="GitHub mode requires a connected token with Contents + Workflows write permission."><select value={mode} onChange={e => setMode(e.target.value as "simulate" | "github")}><option value="simulate">Sandbox simulation (no remote writes)</option><option value="github">Commit to connected GitHub repository</option></select></Field>
          <Button variant="primary" className="w-full" loading={applying} disabled={!selected.length || !canAdmin || !projectId} onClick={apply}><GitBranch size={14} /> {mode === "github" ? "Commit to GitHub" : "Simulate commit"}</Button>
          {result && <div className="inline-note" style={{ marginTop: 14 }}><CheckCheck size={16} /><div><strong>{result.mode === "github" ? "Committed successfully" : "Simulation complete"}.</strong><br />{result.results.length} file(s): {result.results.map(r => `${r.path} (${r.commitSha.slice(0, 7)})`).join(", ")}</div></div>}
        </section>
        {persisted.length > 0 && <section className="card" style={{ marginTop: 18 }}><div className="card-header"><h2>Previously generated</h2></div>{persisted.slice(0, 8).map(asset => <div className="hub-binding" key={asset.id}><FileCode2 size={15} /><div style={{ flex: 1 }}><code>{asset.path}</code><div className="cell-secondary">{timeAgo(asset.createdAt)}{asset.commitSha ? ` · ${asset.commitSha.slice(0, 7)}` : ""}</div></div><StatusBadge status={asset.status === "committed" ? "active" : "pending"} /></div>)}</section>}
      </div>
    </div>
  </>;
}
