"use client";
import { useState } from "react";
import { ThemeToggle } from "./theme-provider";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Box, Check, CircleCheck, Code2, Cpu, GitBranch, GitFork, GitMerge, Globe2, KeyRound, Layers3, LockKeyhole, Play, Rocket, Server, ShieldCheck, Sparkles, Terminal, Timer, Trash2, Wand2, Bot, Flag, Zap } from "lucide-react";

const BRANCH_DEMOS = [
  {
    branch: "feature/checkout",
    url: "storefront-feature-checkout-a8f3c210.acme.preview.test",
    commit: "a8f3c21",
    runner: "df-sandbox-docker-01",
    time: "42s",
    ttl: "Auto-cleanup in 72h",
    status: "Ready",
    stages: ["Webhook verified", "Docker image built", "1 vCPU · 1 GB provisioned", "GET /health → 200 OK", "HTTPS route active"],
  },
  {
    branch: "main",
    url: "storefront-main-0019c4b2.acme.preview.test",
    commit: "48cebd4",
    runner: "gh-actions-bridge-01",
    time: "1m 04s",
    ttl: "Protected · never deleted",
    status: "Ready",
    stages: ["GitHub push accepted", "Immutable digest pushed", "Zero-downtime swap", "GET /health → 200 OK", "TLS 1.3 active"],
  },
  {
    branch: "fix/auth-middleware",
    url: "nexus-api-fix-auth-middleware-7d2e91f0.acme.preview.test",
    commit: "d103f86",
    runner: "gl-runner-sandbox-01",
    time: "51s",
    ttl: "Auto-cleanup in 48h",
    status: "Ready",
    stages: ["MR pipeline triggered", "Encrypted env injected", "Isolated container up", "GET /health → 200 OK", "Preview URL live"],
  },
];

export function HomePage({ signedIn, userName }: { signedIn: boolean; userName?: string }) {
  const [selected, setSelected] = useState(0);
  const active = BRANCH_DEMOS[selected];

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="landing-brand">
            <span className="brand-symbol">
              <svg viewBox="0 0 32 34" fill="none" width="26" height="28">
                <path d="m16 3 13 7-13 7L3 10 16 3Z" fill="currentColor" />
                <path d="m3 16 13 7 13-7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m3 23 13 7 13-7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>DeployFlow<span className="landing-dot">.</span></span>
          </Link>
          <nav className="landing-links" aria-label="Product navigation">
            <a href="#workflow">Workflow</a>
            <a href="#features">Capabilities</a>
            <a href="#devsecops">DevSecOps</a>
            <a href="#runners">Runners & CI</a>
            <a href="#onboarding">Onboarding</a>
            <Link href="/docs">Docs</Link>
          </nav>
          <div className="landing-nav-actions">
            <ThemeToggle />
            {signedIn ? (
              <Link href="/overview" className="btn btn-primary">
                Open workspace ({userName?.split(" ")[0]})
                <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link href="/login" className="landing-signin">Sign in</Link>
                <Link href="/overview" className="btn btn-primary">
                  Launch sandbox
                  <ArrowRight size={14} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="hero-pill">
              <Sparkles size={13} />
              Multi-tenant deployment control plane · Sandbox ready
            </span>
            <h1>
              Every Git branch gets an{" "}
              <span>isolated preview</span>{" "}
              automatically.
            </h1>
            <p className="hero-lead">
              Push a commit to GitHub, trigger from GitHub Actions or GitLab CI, and let DeployFlow orchestrate builds, encrypted branch configuration, health checks, dynamic preview URLs, and automatic cleanup.
            </p>
            <div className="hero-ctas">
              <Link href="/overview" className="btn btn-primary hero-btn-lg">
                <Rocket size={16} />
                {signedIn ? "Go to dashboard" : "Explore live sandbox"}
                <ArrowRight size={15} />
              </Link>
              <Link href={signedIn ? "/projects" : "/login?mode=register"} className="btn hero-btn-secondary">
                {signedIn ? "View projects" : "Create free workspace"}
              </Link>
              <Link href="/docs" className="hero-docs-link">
                API & architecture <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="hero-trust">
              <span><ShieldCheck size={14} /> Tenant-isolated RBAC</span>
              <span><LockKeyhole size={14} /> AES-256-GCM secrets</span>
              <span><ShieldCheck size={14} /> DevSecOps gates by default</span>
            </div>
          </div>

          <div className="hero-demo-card">
            <div className="hero-demo-top">
              <div className="hero-demo-dots"><i /><i /><i /></div>
              <span className="hero-demo-title">Interactive Branch → Preview Pipeline</span>
              <span className="hero-sandbox-badge">Sandbox simulator</span>
            </div>
            <div className="hero-branch-tabs" role="tablist" aria-label="Sample Git branches">
              {BRANCH_DEMOS.map((item, idx) => (
                <button
                  key={item.branch}
                  type="button"
                  role="tab"
                  aria-selected={selected === idx}
                  className={selected === idx ? "active" : ""}
                  onClick={() => setSelected(idx)}
                >
                  <GitBranch size={13} />
                  {item.branch}
                </button>
              ))}
            </div>
            <div className="hero-preview-url">
              <LockKeyhole size={13} />
              <span className="mono">{active.url}</span>
              <span className="hero-status-pill"><CircleCheck size={12} />{active.status}</span>
            </div>
            <div className="hero-stage-list">
              {active.stages.map((stage, i) => (
                <div className="hero-stage-row" key={stage}>
                  <span className="hero-stage-check"><Check size={12} /></span>
                  <span>{stage}</span>
                  <span className="hero-stage-num">0{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="hero-demo-meta">
              <span><GitFork size={13} />Commit <code className="mono">{active.commit}</code></span>
              <span><Server size={13} />{active.runner}</span>
              <span><Clock3Icon />{active.time} · {active.ttl}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-surface" id="workflow">
        <div className="landing-container">
          <div className="landing-section-head">
            <span className="landing-eyebrow">BRANCH ROUTING & LIFECYCLE</span>
            <h2>From push to isolated URL — and clean teardown.</h2>
            <p>Every branch receives a deterministic, collision-resistant DNS label, isolated runtime limits, and a retention policy that protects production while cleaning up stale previews.</p>
          </div>
          <div className="branch-map-grid">
            {[
              ["main", "app.company.com", "Protected · never auto-deleted", "emerald"],
              ["develop", "develop.preview.company.com", "Auto-synced on merge", "blue"],
              ["feature/login", "feature-login-a8f3c210.preview.test", "72h inactivity TTL", "emerald"],
              ["bugfix/dashboard", "bugfix-dashboard-7d2e91f0.preview.test", "48h inactivity TTL", "amber"],
            ].map(([branch, url, policy, tone]) => (
              <div className="branch-map-card" key={branch}>
                <div className="branch-map-top">
                  <span className="branch-badge"><GitBranch size={12} />{branch}</span>
                  <span className={`branch-tone tone-${tone}`}>{policy}</span>
                </div>
                <div className="branch-map-url mono">
                  <Globe2 size={14} />
                  <span>{url}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="features">
        <div className="landing-container">
          <div className="landing-section-head">
            <span className="landing-eyebrow">PLATFORM CAPABILITIES</span>
            <h2>Everything a team needs to ship previews without Ops bottlenecks.</h2>
          </div>
          <div className="features-grid">
            {[
              { icon: Layers3, title: "Multi-tenant workspaces & RBAC", text: "Isolate projects, members, quotas, and audit trails per organization with Owner, Admin, Developer, QA Engineer, and Viewer permissions." },
              { icon: GitFork, title: "Live GitHub integration", text: "Connect via fine-grained PAT or OAuth, discover repositories and branches, and verify incoming GitHub webhooks with HMAC-SHA256." },
              { icon: KeyRound, title: "Scoped variables & encrypted secrets", text: "Set project defaults with branch-level overrides. Secrets are encrypted at rest with AES-256-GCM and never returned by APIs or logs." },
              { icon: Terminal, title: "Persisted logs & safe recovery", text: "Follow queued → build → publish → provision → health check stages. Failed builds never replace healthy previews, with one-click rollback." },
              { icon: Trash2, title: "Safe deletion & auto-cleanup", text: "Protected production branches are guarded from accidental removal. Unprotected expired previews are reclaimed automatically or on demand." },
              { icon: Code2, title: "Versioned REST API & OpenAPI", text: "Automate projects, deployments, logs, environments, and usage checks under /api/v1 with Bearer API tokens and database-backed rate limits." },
            ].map(item => (
              <article className="feature-card" key={item.title}>
                <span className="feature-icon"><item.icon size={20} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-surface" id="devsecops">
        <div className="landing-container">
          <div className="landing-section-head">
            <span className="landing-eyebrow">DEVSECOPS BY DEFAULT</span>
            <h2>Security, configuration, and release controls in one control plane.</h2>
            <p>Every project inherits a hardened pipeline. You decide how strict it is; DeployFlow records the evidence so audits are a query, not a scramble.</p>
          </div>
          <div className="features-grid">
            {[
              { icon: ShieldCheck, title: "12 default security gates", text: "Secret scanning, SAST, dependency audit, license checks, container scans, SBOM, image signing and runtime hardening run before promotion. Blocking findings preserve the last healthy preview." },
              { icon: KeyRound, title: "Federated secrets & variables", text: "Manage DeployFlow variables with branch overrides, then bind the same keys to GitHub Actions secrets, GitLab CI/CD variables, Vault or AWS — with exact CLI commands, never plaintext in YAML." },
              { icon: Flag, title: "Feature flags & progressive rollout", text: "Toggle behavior independently of deployment, scope by project and environment, and dial a rollout percentage without touching a branch." },
              { icon: Bot, title: "Explainable operations assistant", text: "Ask why a build failed or what your security posture is. Answers are derived only from persisted logs, gate results and workspace records — no invented facts, no data egress." },
            ].map(item => (
              <article className="feature-card" key={item.title}>
                <span className="feature-icon"><item.icon size={20} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-surface" id="runners">
        <div className="landing-container">
          <div className="runners-showcase">
            <div>
              <span className="landing-eyebrow">RUNNERS & CI BRIDGES</span>
              <h2>Built for sandbox Docker workers, GitHub Actions, and GitLab Runner.</h2>
              <p className="runners-lead">
                Assign each project to a runner profile, manage your organization&apos;s runner pool (register, pause, drain, or delete safely), and copy ready-to-run <code>.github/workflows/deployflow.yml</code> or <code>.gitlab-ci.yml</code> triggers wired to <code>/api/v1/deployments</code>.
              </p>
              <div className="runners-points">
                <div><Check size={15} /> PostgreSQL-leased worker queue with crash recovery</div>
                <div><Check size={15} /> One-time runner registration tokens (`dfr_...`)</div>
                <div><Check size={15} /> Active-job guards before deleting the last online runner</div>
              </div>
              <div className="hero-ctas" style={{ marginTop: 26 }}>
                <Link href="/integrations" className="btn btn-primary">
                  Open Integrations & Runners <ArrowRight size={14} />
                </Link>
              </div>
            </div>
            <div className="runners-code-card">
              <div className="runners-code-head">
                <span>.github/workflows/deployflow.yml</span>
                <span className="status-badge status-green">Ready to copy</span>
              </div>
              <pre>{`name: DeployFlow Preview
on:
  push:
    branches-ignore: []
jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger DeployFlow deployment
        run: |
          curl -fsS -X POST "$DEPLOYFLOW_URL/api/v1/deployments" \\
            -H "Authorization: Bearer $DEPLOYFLOW_TOKEN" \\
            -H "Content-Type: application/json" \\
            -d '{"projectId":"<project-id>","branchId":"<branch-id>"}'`}</pre>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-surface" id="onboarding">
        <div className="landing-container">
          <div className="landing-section-head">
            <span className="landing-eyebrow">ZERO-MANUAL-EFFORT ONBOARDING</span>
            <h2>Attach a repository. We generate the workflows. You stay in control.</h2>
            <p>DeployFlow writes CI/CD and security configuration straight to your repository through the GitHub Contents API — or lets you review and download every file first.</p>
          </div>
          <div className="branch-map-grid">
            {[
              ["01", "Attach", "Connect GitHub with a fine-grained token or OAuth and select a repository.", "Connect repository"],
              ["02", "Generate", "Create GitHub Actions, GitLab CI, Dependabot, deployflow.yml and SECURITY.md from project settings.", "Generate workflows"],
              ["03", "Review & commit", "Preview every file, choose a branch and commit message, then push from DeployFlow.", "Commit from here"],
              ["04", "Operate", "Pushes trigger previews, gates record evidence, flags control rollout, and cleanup is automatic.", "Manage in one place"],
            ].map(([n, title, text, cta]) => (
              <div className="branch-map-card" key={n}>
                <div className="branch-map-top"><span className="landing-eyebrow" style={{ margin: 0 }}>{n} · {cta}</span></div>
                <h3 style={{ fontSize: 15, fontWeight: 630, color: "var(--ink)", marginBottom: 6 }}>{title}</h3>
                <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-3)" }}>{text}</p>
              </div>
            ))}
          </div>
          <div className="hero-ctas" style={{ marginTop: 26 }}>
            <Link href="/onboarding" className="btn btn-primary"><Wand2 size={15} /> Open repository onboarding <ArrowRight size={14} /></Link>
            <Link href="/security" className="btn btn-secondary">Security center <ArrowUpRight size={13} /></Link>
          </div>
        </div>
      </section>

      <section className="landing-section" id="security">
        <div className="landing-container">
          <div className="sandbox-callout">
            <div className="sandbox-callout-icon"><ShieldCheck size={24} /></div>
            <div>
              <h3>Honest control-plane sandbox</h3>
              <p>
                Authentication, organization isolation, RBAC, projects, encrypted variables, audit trails, runner records, and deployment history are genuinely persisted in PostgreSQL. Docker builds, container runtimes, DNS records, and TLS activation are simulated safely — no untrusted code is executed on the host.
              </p>
            </div>
            <Link href="/overview" className="btn btn-primary">
              Launch workspace <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <div>
            <strong>DeployFlow.</strong>
            <p>Git-integrated preview environments with enterprise isolation.</p>
          </div>
          <div className="landing-footer-links">
            <Link href="/overview">Overview</Link>
            <Link href="/projects">Projects</Link>
            <Link href="/security">Security center</Link>
            <Link href="/flags">Feature flags</Link>
            <Link href="/onboarding">Onboarding</Link>
            <Link href="/docs">Documentation</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Clock3Icon() {
  return <Timer size={13} />;
}
