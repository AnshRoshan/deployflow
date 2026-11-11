"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Blocks, Check, CircleAlert, Cloud, Code2, Container, Cpu, GitBranch, GitFork, GitMerge, Info, KeyRound, Link2, LockKeyhole, Pause, Play, Plug, Plus, RefreshCw, Server, ShieldCheck, Trash2, Unplug, Webhook } from "lucide-react";
import { authHeaders, useWorkspace } from "./workspace-context";
import { PageHeading } from "./dashboard";
import { Button, CopyButton, EmptyState, Field, Modal, StatusBadge } from "./ui";
import { dateTime, timeAgo } from "@/lib/utils";

type WebhookEvent = { id: string; deliveryId: string; event: string; status: string; error: string | null; createdAt: string };
type ConnectionResult = { webhookUrl: string; webhookSecret: string; account?: string };
type RunnerCreated = { runner: { name: string; kind: string }; token: string };

const RUNNER_LABELS: Record<string, string> = {
  "sandbox-docker": "Sandbox Docker",
  "github-actions": "GitHub Actions Bridge",
  "gitlab-runner": "GitLab Runner Sandbox",
  "self-hosted": "Self-Hosted Agent",
};

export function IntegrationsPage() {
  const { data, mutate, toast, canAdmin, openModal } = useWorkspace();
  const params = useSearchParams();
  const [connectOpen, setConnectOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [workflowModal, setWorkflowModal] = useState<"github-actions" | "gitlab-runner" | null>(null);
  const [runnerModal, setRunnerModal] = useState(false);
  const [runnerName, setRunnerName] = useState("");
  const [runnerKind, setRunnerKind] = useState("sandbox-docker");
  const [runnerRegion, setRunnerRegion] = useState("sandbox-local");
  const [runnerCapacity, setRunnerCapacity] = useState(4);
  const [runnerCreated, setRunnerCreated] = useState<RunnerCreated | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [oauth, setOauth] = useState(false);

  const integration = data.integration;
  const connected = integration?.connected;
  const live = connected && integration?.mode !== "demo";
  const sampleProject = data.projects[0];
  const sampleBranch = data.branches.find(b => b.projectId === sampleProject?.id);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-deployflow-host";

  const loadEvents = () => {
    if (canAdmin) {
      fetch("/api/integrations", { headers: authHeaders() })
        .then(async r => {
          const res = await r.json();
          if (r.ok) { setEvents(res.events); setOauth(res.oauthAvailable); }
        })
        .catch(() => {});
    }
  };
  useEffect(() => {
    loadEvents();
    if (params.get("connected")) toast("GitHub connected. Your repositories are ready to discover.");
    if (params.get("error")) toast(params.get("error")!, "error");
  }, []);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const res = await mutate("/api/integrations", { action: "connect", token });
      setResult(res as unknown as ConnectionResult); setToken(""); loadEvents();
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  };

  const disconnect = () => openModal({
    type: "confirm",
    title: "Disconnect GitHub?",
    description: "Repository discovery and incoming webhooks will stop. Existing projects and deployment history remain available. Stored GitHub credentials will be deleted.",
    confirmLabel: "Disconnect",
    danger: true,
    onConfirm: async () => {
      await mutate("/api/integrations", { action: "disconnect" }, "POST", "GitHub disconnected. Stored credentials removed.");
      setManageOpen(false);
    },
  });

  const registerRunner = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const res = await mutate("/api/runners", { name: runnerName, kind: runnerKind, region: runnerRegion, capacity: runnerCapacity }, "POST", "Runner registered. Copy its one-time token.");
      setRunnerCreated(res as unknown as RunnerCreated);
      setRunnerName("");
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  };

  const githubWorkflowYaml = `name: DeployFlow Preview
on:
  push:
    branches: ["main", "feature/*", "fix/*"]
  pull_request:
    types: [opened, synchronize]
jobs:
  deployflow:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger DeployFlow deployment
        run: |
          curl -fsS -X POST "${origin}/api/v1/deployments" \\
            -H "Authorization: Bearer \${{ secrets.DEPLOYFLOW_API_TOKEN }}" \\
            -H "x-organization-id: ${data.organization.id}" \\
            -H "Content-Type: application/json" \\
            -d '{"projectId":"${sampleProject?.id || "<project-id>"}","branchId":"${sampleBranch?.id || "<branch-id>"}"}'`;

  const gitlabCiYaml = `deployflow_preview:
  stage: deploy
  image: curlimages/curl:8.10.1
  script:
    - >
      curl -fsS -X POST "${origin}/api/v1/deployments"
      -H "Authorization: Bearer $DEPLOYFLOW_API_TOKEN"
      -H "x-organization-id: ${data.organization.id}"
      -H "Content-Type: application/json"
      -d '{"projectId":"${sampleProject?.id || "<project-id>"}","branchId":"${sampleBranch?.id || "<branch-id>"}"}'
  rules:
    - if: $CI_COMMIT_BRANCH`;

  return (
    <>
      <PageHeading title="Integrations & Runners" description="Connect Git providers, copy CI workflows, and manage sandbox or self-hosted runners.">
        <a className="btn btn-secondary" href="/docs#github"><Info size={13} />Integration guide</a>
        {canAdmin && <Button variant="primary" onClick={() => { setRunnerCreated(null); setError(""); setRunnerModal(true); }}><Plus size={14} />Register runner</Button>}
      </PageHeading>

      <div className="notice-banner">
        <Plug size={19} />
        <div>
          <strong>Control plane + runner bridges.</strong>{" "}
          {live ? "GitHub repository discovery is live. Builds execute on simulated sandbox runners unless connected to an external worker." : "Connect GitHub to discover real repositories. Use the GitHub Actions or GitLab CI bridges to trigger DeployFlow deployments from real CI pipelines."}
        </div>
      </div>

      <div className="integration-grid">
        <section className="card integration-card">
          <div className="card-top">
            <span className="integration-logo"><GitFork size={26} /></span>
            {connected && <span className={`status-badge status-${live ? "green" : "amber"}`}><Check size={11} />{live ? "Connected" : "Demo connection"}</span>}
          </div>
          <h3>GitHub</h3>
          <p>Discover repositories and branches via OAuth or fine-grained PAT, and receive HMAC-verified webhooks.</p>
          {connected && <div className="credential-box flex-center"><GitFork size={13} />{integration.account}<span className="ml-auto" style={{ fontSize: 10 }}>{live ? integration.mode.toUpperCase() : "SAMPLE"}</span></div>}
          <Button variant={connected && !live ? "secondary" : "primary"} disabled={!canAdmin} onClick={() => { setResult(null); setError(""); setConnectOpen(true); }}>
            {live ? "Reconnect GitHub" : "Connect GitHub"}<ArrowUpRight size={13} />
          </Button>
          {connected && <button className="text-link" style={{ margin: "14px auto 0", display: "flex" }} disabled={!canAdmin} onClick={() => setManageOpen(true)}>Manage connection</button>}
        </section>

        <section className="card integration-card">
          <div className="card-top">
            <span className="integration-logo"><Code2 size={25} /></span>
            <span className="status-badge status-green"><Check size={11} />API Ready</span>
          </div>
          <h3>GitHub Actions</h3>
          <p>Trigger DeployFlow previews directly from any GitHub Actions workflow using a scoped API token.</p>
          <div className="credential-box flex-center"><Server size={13} />{data.runners.filter(r => r.kind === "github-actions" && r.status === "online").length} active bridge runners</div>
          <Button variant="secondary" onClick={() => setWorkflowModal("github-actions")}><Code2 size={13} />View workflow YAML</Button>
        </section>

        <section className="card integration-card">
          <div className="card-top">
            <span className="integration-logo"><GitMerge size={25} /></span>
            <span className="status-badge status-blue"><Server size={11} />CI Bridge</span>
          </div>
          <h3>GitLab CI & Runner</h3>
          <p>Trigger sandbox preview deployments from <code>.gitlab-ci.yml</code> or register a GitLab Runner bridge token.</p>
          <div className="credential-box flex-center"><Cpu size={13} />{data.runners.filter(r => r.kind === "gitlab-runner").length} configured runners</div>
          <Button variant="secondary" onClick={() => setWorkflowModal("gitlab-runner")}><Code2 size={13} />View .gitlab-ci.yml</Button>
        </section>

        <IntegrationCard title="Slack" description="Real-time deployment notifications and preview links posted straight to your team channels." icon={<Blocks size={25} />} />
        <IntegrationCard title="AWS Execution Plane" description="Connect ECS/Fargate, ECR, Route 53, and ACM for production cloud infrastructure." icon={<Cloud size={26} />} />
        <IntegrationCard title="Docker BuildKit Daemon" description="Attach isolated BuildKit sandboxes with rootless container execution and registry push." icon={<Container size={26} />} />
      </div>

      <section className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <h2>Runners & build workers <span className="count-label">{data.runners.length}</span></h2>
            <p>Manage sandbox Docker workers, CI bridges, and runner lifecycle (pause, drain, or delete safely).</p>
          </div>
          {canAdmin && <Button size="small" variant="primary" onClick={() => { setRunnerCreated(null); setError(""); setRunnerModal(true); }}><Plus size={12} />Register runner</Button>}
        </div>
        {data.runners.length ? (
          <div className="table-scroll">
            <table className="full-table">
              <thead><tr><th>Runner</th><th>Type</th><th>Status</th><th>Region / Pool</th><th>Capacity</th><th>Token</th><th>Last heartbeat</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {data.runners.map(runner => (
                  <tr key={runner.id}>
                    <td>
                      <div className="project-name flex-center"><Server size={14} />{runner.name}</div>
                      <div className="commit-message">{runner.activeJobs ? `${runner.activeJobs} active jobs` : "Idle · ready for work"}</div>
                    </td>
                    <td><span className="branch-badge">{RUNNER_LABELS[runner.kind] || runner.kind}</span></td>
                    <td><StatusBadge status={runner.status === "online" ? "active" : runner.status === "paused" ? "stopped" : "pending"} /></td>
                    <td className="time-cell">{runner.region}</td>
                    <td className="time-cell">{runner.capacity} slots</td>
                    <td className="mono" style={{ fontSize: 11 }}>{runner.prefix}••••</td>
                    <td className="time-cell">{timeAgo(runner.lastHeartbeatAt)}</td>
                    <td>
                      {canAdmin && (
                        <div className="flex-center">
                          <Button
                            size="small"
                            onClick={() => {
                              const next = runner.status === "online" ? "paused" : "online";
                              void mutate("/api/runners", { id: runner.id, status: next, heartbeat: true }, "PATCH", `Runner ${next === "online" ? "resumed" : "paused"}.`).catch(() => {});
                            }}
                          >
                            {runner.status === "online" ? <Pause size={12} /> : <Play size={12} />}
                            {runner.status === "online" ? "Pause" : "Resume"}
                          </Button>
                          <button
                            className="icon-button"
                            aria-label={`Delete runner ${runner.name}`}
                            onClick={() => openModal({
                              type: "confirm",
                              title: `Delete runner ${runner.name}?`,
                              description: "This immediately revokes the runner token and removes it from the workspace pool. If it is the last online runner handling an active deployment, pause or wait for the deployment first.",
                              confirmLabel: "Delete runner",
                              danger: true,
                              onConfirm: () => mutate("/api/runners", { id: runner.id }, "DELETE", `Runner ${runner.name} deleted.`),
                            })}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Server} title="No runners registered" description="Register a sandbox or CI bridge runner to execute deployments." action={canAdmin && <Button variant="primary" onClick={() => setRunnerModal(true)}><Plus size={13} />Register runner</Button>} />
        )}
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <h2>Webhook activity</h2>
            <p>Signature-verified, asynchronous, and deduplicated by delivery ID.</p>
          </div>
          {canAdmin && (
            <Button size="small" disabled={!events.some(e => e.status === "failed")} onClick={async () => { try { await mutate("/api/integrations", { action: "retry" }, "POST", "Failed webhook deliveries queued for retry."); loadEvents(); } catch {} }}>
              <RefreshCw size={12} />Retry failed
            </Button>
          )}
        </div>
        {events.length ? (
          <div className="table-scroll">
            <table className="full-table">
              <thead><tr><th>Delivery</th><th>Event</th><th>Status</th><th>Received</th></tr></thead>
              <tbody>
                {events.map(event => (
                  <tr key={event.id}>
                    <td className="mono" style={{ fontSize: 11 }}>{event.deliveryId}<div className="commit-message">{event.error}</div></td>
                    <td>{event.event}</td>
                    <td><StatusBadge status={event.status === "processed" ? "ready" : event.status} /></td>
                    <td>{dateTime(event.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: "35px 20px" }}>
            <Webhook size={26} color="#64748b" />
            <h3 style={{ marginTop: 14 }}>Ready when your repositories are.</h3>
            <p>{canAdmin ? "Connect a live GitHub account and configure its webhook to see deliveries here." : "Webhook delivery details are available to organization administrators."}</p>
          </div>
        )}
      </section>

      {connectOpen && (
        <Modal title={result ? "One last step to find your flow." : "Connect your GitHub."} subtitle={result ? "Add this webhook to each repository you want to deploy automatically." : "Use a fine-grained token scoped to the repositories you choose."} onClose={() => { setConnectOpen(false); setToken(""); setResult(null); }}>
          <form onSubmit={connect}>
            <div className="modal-body">
              {result ? (
                <>
                  <div className="inline-note"><ShieldCheck size={16} />Connected as <strong>{result.account}</strong>. Save this webhook secret now. It won&apos;t be shown again.</div>
                  <p className="field-label">Payload URL</p>
                  <div className="credential-box flex-center"><span style={{ flex: 1 }}>{result.webhookUrl}</span><CopyButton text={result.webhookUrl} /></div>
                  <p className="field-label">Webhook secret</p>
                  <div className="credential-box flex-center"><span style={{ flex: 1 }}>{result.webhookSecret}</span><CopyButton text={result.webhookSecret} /></div>
                  <p className="field-hint" style={{ lineHeight: 1.8 }}>Choose content type <code>application/json</code> and send push, create, delete, and pull request events. Your public APP_URL must be reachable by GitHub.</p>
                </>
              ) : (
                <>
                  <Field label="Fine-grained personal access token" hint="Grant repository Metadata: Read and Contents: Read. Tokens are encrypted before storage.">
                    <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="github_pat_..." required minLength={20} />
                  </Field>
                  <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="text-link">Create a token on GitHub<ArrowUpRight size={12} /></a>
                  <div className="inline-note"><LockKeyhole size={15} />Your token is never sent back to the browser after connection. Use a short expiry and only the repositories you need.</div>
                  {oauth && <a href="/api/github/connect" className="btn btn-secondary w-full"><GitFork size={14} />Continue with GitHub OAuth</a>}
                  {error && <div className="inline-note error"><CircleAlert size={15} />{error}</div>}
                </>
              )}
            </div>
            <div className="modal-footer">
              <Button type="button" onClick={() => { setConnectOpen(false); setResult(null); }}>{result ? "Done" : "Cancel"}</Button>
              {!result && <Button variant="primary" type="submit" loading={loading} disabled={token.length < 20}><Link2 size={13} />Connect account</Button>}
            </div>
          </form>
        </Modal>
      )}

      {manageOpen && (
        <Modal title="Your GitHub connection" subtitle="Repository access and webhook configuration." onClose={() => setManageOpen(false)}>
          <div className="modal-body">
            <div className="credential-box flex-center"><GitFork size={17} />{integration?.account}<StatusBadge status="active" /></div>
            <p className="field-label">Repository webhook URL</p>
            <div className="credential-box flex-center"><span style={{ flex: 1 }}>{origin}/api/github/webhook/{data.organization.id}</span><CopyButton text={`${origin}/api/github/webhook/${data.organization.id}`} /></div>
            <div className="inline-note"><Info size={15} />{live ? "Rotate the webhook secret if it may have been exposed. Update each repository's webhook after rotation." : "This is a sample connection, not a live GitHub authorization. Connect your account to discover real repositories."}</div>
          </div>
          <div className="modal-footer">
            {live && (
              <Button loading={loading} onClick={async () => { setLoading(true); try { const res = await mutate("/api/integrations", { action: "rotate-webhook" }); setManageOpen(false); setResult(res as unknown as ConnectionResult); setConnectOpen(true); } catch {} finally { setLoading(false); } }}>
                <RefreshCw size={12} />Rotate secret
              </Button>
            )}
            <Button variant="danger" onClick={disconnect}><Unplug size={12} />Disconnect</Button>
          </div>
        </Modal>
      )}

      {workflowModal && (
        <Modal
          wide
          title={workflowModal === "github-actions" ? "GitHub Actions preview workflow" : "GitLab CI preview pipeline"}
          subtitle="Create an API token in Settings → API keys and store it as DEPLOYFLOW_API_TOKEN in your repository secrets."
          onClose={() => setWorkflowModal(null)}
        >
          <div className="modal-body">
            <div className="flex-center" style={{ marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>{workflowModal === "github-actions" ? ".github/workflows/deployflow.yml" : ".gitlab-ci.yml"}</strong>
              <CopyButton text={workflowModal === "github-actions" ? githubWorkflowYaml : gitlabCiYaml} label="Copy YAML" />
            </div>
            <pre className="code-block">{workflowModal === "github-actions" ? githubWorkflowYaml : gitlabCiYaml}</pre>
            <div className="inline-note"><Info size={15} />Requests hit the real <code>/api/v1/deployments</code> endpoint, verify your Bearer token and organization ID, enforce quotas, and record deployment logs.</div>
          </div>
          <div className="modal-footer">
            <a href="/settings?tab=api" className="btn btn-secondary"><KeyRound size={13} />Create API token</a>
            <Button variant="primary" onClick={() => setWorkflowModal(null)}>Done</Button>
          </div>
        </Modal>
      )}

      {runnerModal && (
        <Modal
          title={runnerCreated ? "Runner registered." : "Register a runner"}
          subtitle={runnerCreated ? "Save this one-time registration token. It won't be shown again." : "Add a sandbox worker, CI bridge, or self-hosted runner slot to this workspace."}
          onClose={() => { setRunnerModal(false); setRunnerCreated(null); }}
        >
          {runnerCreated ? (
            <>
              <div className="modal-body">
                <div className="inline-note"><ShieldCheck size={16} />Runner <strong>{runnerCreated.runner.name}</strong> ({RUNNER_LABELS[runnerCreated.runner.kind] || runnerCreated.runner.kind}) is online.</div>
                <p className="field-label">Runner registration token</p>
                <div className="credential-box flex-center"><span style={{ flex: 1 }}>{runnerCreated.token}</span><CopyButton text={runnerCreated.token} /></div>
                <div className="code-block">DEPLOYFLOW_RUNNER_TOKEN={runnerCreated.token}{"\n"}npx tsx scripts/worker.ts</div>
              </div>
              <div className="modal-footer"><Button variant="primary" onClick={() => { setRunnerModal(false); setRunnerCreated(null); }}>Done</Button></div>
            </>
          ) : (
            <form onSubmit={registerRunner}>
              <div className="modal-body">
                <Field label="Runner name" hint="Lowercase letters, numbers, and hyphens.">
                  <input value={runnerName} onChange={e => setRunnerName(e.target.value)} placeholder="df-worker-eu-01" pattern="[a-z0-9][a-z0-9\-]*" required minLength={2} maxLength={60} />
                </Field>
                <div className="form-grid">
                  <Field label="Runner type">
                    <select value={runnerKind} onChange={e => setRunnerKind(e.target.value)}>
                      <option value="sandbox-docker">Sandbox Docker</option>
                      <option value="github-actions">GitHub Actions Bridge</option>
                      <option value="gitlab-runner">GitLab Runner Sandbox</option>
                      <option value="self-hosted">Self-Hosted Agent</option>
                    </select>
                  </Field>
                  <Field label="Region / pool">
                    <input value={runnerRegion} onChange={e => setRunnerRegion(e.target.value)} required minLength={2} maxLength={40} />
                  </Field>
                </div>
                <Field label="Concurrency slots">
                  <input type="number" min={1} max={32} value={runnerCapacity} onChange={e => setRunnerCapacity(Number(e.target.value))} required />
                </Field>
                {error && <div className="inline-note error"><CircleAlert size={15} />{error}</div>}
              </div>
              <div className="modal-footer">
                <Button type="button" onClick={() => setRunnerModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={loading} disabled={runnerName.length < 2}>Register runner</Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

function IntegrationCard({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <section className="card integration-card coming-soon">
      <div className="card-top"><span className="integration-logo">{icon}</span><span className="status-badge status-gray">Roadmap</span></div>
      <h3>{title}</h3>
      <p>{description}</p>
      <Button disabled><Plug size={12} />Available in execution plane</Button>
    </section>
  );
}
