# DeployFlow

A responsive, multi-tenant deployment control plane built with Next.js App Router, TypeScript, PostgreSQL, and Drizzle ORM.

## Run locally

1. Configure `DATABASE_URL` and a 64-character hexadecimal `SECRET_ENCRYPTION_KEY` in `.env`. See `.env.example`.
2. Install dependencies with `npm install`.
3. Apply the schema with `npx drizzle-kit push`.
4. Optionally seed the public demo with `npx tsx scripts/seed.ts`. The first demo visit also seeds it automatically under a PostgreSQL advisory lock.
5. Run `npm run dev` for development, or `npm run build` and `npm run start` for production.

The landing page opens an explicitly public, shared sandbox account. Register a personal account for private work. Never place real production secrets in the shared demo organization.

## Implemented

- Salted scrypt passwords, hashed server-side sessions, session revocation, password reset and verification email flows when SMTP is configured, and optional authenticator-app MFA for personal accounts.
- Organizations, membership isolation, Owner/Admin/Developer/Viewer/QA roles, invitations, resource quotas, and append-only audit records.
- GitHub repository and branch discovery using encrypted fine-grained tokens; optional OAuth with state validation.
- Raw-body HMAC webhook verification, durable delivery deduplication, asynchronous processing, push/create/delete/pull-request handling, and retry controls.
- Project configuration, normalized collision-resistant branch hostnames, branch-specific encrypted variables, domains with simulated verification, and protected production environments.
- Durable deployment jobs with row locks, leases, staged logs, cancellation, retry, rollback, notifications, and cleanup policies.
- Searchable dashboard, projects, environments, deployment history, logs, team/security settings, API tokens, resource reports, and OpenAPI contract.
- Versioned REST API under `/api/v1`, Bearer-token authentication, organization selection, validation, and database-backed rate limits.

## Important execution boundary

**This installation is a functional control-plane sandbox, not a provisioned cloud deployment platform.**

Docker builds, registry pushes, container execution, health probes, DNS/TLS operations, application preview serving, and infrastructure telemetry are simulated and labeled accordingly. No untrusted customer code runs. Reserved `.test` preview hostnames do not resolve publicly. Cost estimates are not invoices. GitHub API calls can be live after a user connects a valid token.

The UI, organizations, memberships, configuration, sessions, audit events, notifications, and deployment state/log history are genuinely persisted. A standalone worker is provided at `scripts/worker.ts`; API routes also use Next.js `after()` for bounded background processing and recover stale jobs on workspace refresh.

A production execution plane still requires isolated ephemeral build workers, a private image registry, a restricted runtime scheduler, network policy, health-gated ingress, scoped DNS/TLS credentials, object-backed log retention, distributed observability, and cloud operational controls. Those services are intentionally not faked as live connections. The huge proposed PRD is not represented as a fully production-certified AWS service.

## Demo access

The landing page opens the shared sandbox directly. You can also sign in manually with:

- Email: `jamie@acme.dev`
- Password: `demo-workspace-2026`

This account is public and for exploration only. Register a personal account for private work.

## Workspace access without cookies

Preview deployments are commonly embedded in a cross-site iframe, where browsers block third-party cookies. A cookie-only session would silently fail there, leaving you stuck on the sign-in screen.

DeployFlow therefore does not require cookies to be usable:

- Unauthenticated visitors get the **shared sandbox workspace** (the same account whose credentials are published on the login page). The UI shows a banner with a sign-in link.
- Personal sign-in and registration return a session token that the browser stores locally and sends as `Authorization: Bearer <token>` on every API call, so private workspaces work even when cookies are blocked.
- Any request that names an organization the visitor is not a member of is rejected with 403. Anonymous visitors can only ever reach the sandbox organization.
- Stale or expired tokens fall back to the sandbox instead of locking the app.

## Encryption key handling

`SECRET_ENCRYPTION_KEY` is read from the environment. If it is absent (for example when a sandbox resets `.env`), DeployFlow generates a key and persists it at `.secrets/encryption-key` so the control plane keeps working across restarts. Values that cannot be decrypted are masked rather than crashing the dashboard. Set the environment variable explicitly for production, and keep it stable: rotating it requires re-encrypting stored secrets.

## Environment

- `DATABASE_URL`: PostgreSQL connection string.
- `SECRET_ENCRYPTION_KEY`: 32-byte key encoded as 64 hex characters. Generate with `node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'`. Keep this stable: rotating it requires re-encrypting stored secrets.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: optional GitHub OAuth application.
- `SMTP_URL`, `EMAIL_FROM`: optional SMTP transport for reset, verification, and invitation email. Without SMTP, the UI reports that delivery is unavailable; reset tokens are never exposed in API responses.
- `APP_URL`: public HTTPS origin for OAuth callbacks and GitHub webhooks.

## Worker

Run `npx tsx scripts/worker.ts` as a separately supervised process when durable background execution is needed. It polls queued jobs, claims them using `FOR UPDATE SKIP LOCKED`, renews leases while processing, and runs retention cleanup. Stop with SIGTERM or SIGINT. Do not run an extra unsupervised worker alongside the managed preview.

## Validation

- `npx next typegen`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`
- `npx tsx --test tests/core.test.ts`

Core tests cover safe branch identities, authenticated encryption, password verification, permissions, branch policies, active states, and exact signature comparison. Production deployment, cloud isolation, disaster recovery, and load targets require testing against a real execution plane and infrastructure.


## DevSecOps platform layer

DeployFlow is more than preview deployments — it is a developer-first DevSecOps control plane.

- **Security Center & policy engine** — 12 default gates (secret scanning, SAST, dependency audit, license compliance, container scan, SBOM, image signing, non-root runtime, read-only rootfs, network isolation, approvals, fail-on-findings). Configurable per project, with persisted gate results per deployment and a posture score.
- **Feature flags** — enabled state, percentage rollout, environment scope (production/preview/development) and optional project scope, all tenant-isolated.
- **Federated Secrets & Config** — bind DeployFlow variables to GitHub Actions secrets, GitLab CI/CD variables, Vault or AWS Secrets Manager. Generates exact CLI manifests; values are never stored in a config file.
- **Repository onboarding** — generate GitHub Actions, GitLab CI, Dependabot, `deployflow.yml` and `SECURITY.md` from project settings; preview, download, or commit them to a connected GitHub repository via the Contents API (requires Contents + Workflows write). Sandbox simulation mode performs no remote writes.
- **Runner bridges** — sandbox Docker, GitHub Actions, GitLab Runner and self-hosted runner registration with one-time tokens, pause/resume and active-job guards.
- **Explainable AI assistant** — grounded Q&A and deployment root-cause analysis derived only from persisted logs and gate records. Deterministic local heuristics, no external model or data egress.
- **Security gates in deployment details** — every deployment shows its recorded checks; failed builds preserve the last healthy preview.

### New REST endpoints

`GET /api/v1/security`, `GET|POST|PATCH /api/v1/flags`, `GET /api/v1/secrets`, `POST /api/v1/onboarding/generate`, `POST /api/v1/assistant` — see `/api/openapi`.

### Theme system

A semantic CSS token system drives both light and dark palettes. `ThemeProvider` lives at the root, a pre-hydration script prevents flashing, and the preference (light / dark / system) persists in `localStorage`. Theme toggles are available on the home page, auth screen and dashboard; Settings → Security → Appearance offers all three modes. The cookie-free session model also works inside cross-site iframes.
