# 38 — SAIL: the monitoring and admin plane for Anker — status and spec

**Date:** 2026-10-03 · **Status:** assessment and spec, nothing built · **Companion:** [37](37-anker-agentic-venture-erp.md)
(Anker, the agentic ERP). SAIL is a **separate repository** (`345668/SAIL`, Next.js, deployed to its own Vercel
project); this document lives here because the contract between the two apps is mostly Anker's side, and the
design rule is that the two specs move together.

**Rule for this document:** §2 is verified from the SAIL repository and the Anker repository on 2026-10-03.
Everything SAIL is asked to *do* in §3 closes a gap in §2.4 or an Anker obligation in [37](37-anker-agentic-venture-erp.md) §6.4.

---

## 0. The goal, stated so it can be tested

> SAIL lets a small company staff **see what the platform is doing, know when it is wrong before a customer
> does, and fix it**, without touching production by hand and without seeing tenant private records.

Two verbs, one boundary:

- **Monitor.** Is the platform up, correct, fast and affordable? Which tenants, agents, models and jobs are healthy?
- **Administer.** Tenants, people, entitlements, billing, keys, AI configuration, the shared directory, content, and the
  engines that run unattended (campaigns, outreach).
- **Boundary.** SAIL is the platform-owner view: aggregates, traces and shared data. Tenant private records are
  reachable only through an audited, time-limited view-as grant.

The test: **an incident like this week's founder-matching 504 is noticed by SAIL, attributed to a step and a
release, and handled from SAIL**, instead of being found by a person running a test in a browser.

---

## 1. Principles

1. **SAIL holds no business logic.** It reads and configures; engines stay in Anker. (The existing relay design:
   one allowlisted proxy, a service token, user-scoped calls carry an explicit acting-user header.)
2. **Read-mostly, change by request.** Reads go straight to the shared database or Anker's admin API; every
   write is an audited action with a reason.
3. **Alerts over dashboards.** A page nobody opens does not monitor anything. Each health fact has a threshold,
   an owner and a delivery channel (§3.5).
4. **One operator plane.** Anker's in-app `/dashboard/admin` is retired once SAIL has parity (§4); two consoles
   means two places to be wrong.
5. **Least privilege for staff, with a record.** Roles, MFA, per-action audit, and view-as with a reason.
6. **Honest unknowns.** A panel shows "not measured" rather than a reassuring blank. (Today's health page shows
   "not configured" for services production does not use; §2.3.)
7. **Cheap to run.** SAIL stays a thin app; heavy aggregation happens in Anker or in database views, on a schedule.

---

## 2. Where SAIL stands (verified 2026-10-03)

### 2.1 What it is

| Fact | Evidence |
| --- | --- |
| Separate Next.js 16 app, own repository, own Vercel project; deploys by a GitHub Action on push to `main` | `README.md`, `DEPLOY.md`, `.github/workflows/deploy.yml` |
| Own identity: `company_staff` table, scrypt passwords, HMAC session cookie; roles `staff`, `admin`, `superadmin` | `db/001-init.sql`, `lib/auth.ts`, `middleware.ts` |
| Shares Anker's Neon database; its own tables are `company_staff`, `platform_api_keys`, `impersonation_grants`, `system_settings`, `platform_usage_events`, `company_audit_log`, `news_articles`, `news_themes` | `db/001-init.sql` |
| 25 portal pages, ~1,240 lines of page code in total; most are 30-line shells over a client component | `app/(portal)/*/page.tsx` |
| 18 API routes: auth, keys, tokens, AI config, newsroom, impersonation, and one **relay** to Anker's admin API | `app/api/**` |
| The relay is an allowlist (`PROXY_ALLOWLIST`, ~25 entries) plus patterns; it adds a service token server-side; user-scoped paths need an acting-user header and are audited on the Anker side | `lib/anker-proxy.ts` |
| One typecheck, no tests, one migration file, npm (Anker uses pnpm) | repository |

### 2.2 What it does today

| Area | Pages | Reality |
| --- | --- | --- |
| Tenants and people | Organizations, Users | list and view-as mint; tenant-side acceptance of view-as was "phase 2" in the README *(unverified whether finished)* |
| Platform secrets and AI | Platform keys, AI config (provider, per-task models, kill switches, Qwen lane keys), Integration keys, MCP and extension tokens | **real**; keys encrypted at rest; AI config edits the row Anker's router reads |
| Content | Newsroom (draft → publish → archive, themes, API keys, image upload via relay) | **real** |
| Data operations | Imports, Crawl, URL check, Email check, Enrichment, Research, Inbox, Waitlist, Outreach, Email, Data ops | relayed to Anker's admin engines; thin |
| Founder campaign engine | Campaigns console: engine controls, board, attach deck | **real** (built 2026-10-02) |
| Billing | Billing page | reads billing tables *(depth unverified)* |
| Audit | Audit log | reads `company_audit_log` |
| Monitoring | Dashboard (six counts), System health | see §2.3 |

### 2.3 The monitoring that exists

- **Dashboard:** six counts (orgs, staff, investors, firms, articles, keys). No trends, no thresholds.
- **System health:** pings `OLLAMA_URL`, `SEARXNG_URL`, `MARKER_URL`, `TENANT_APP_URL` and counts nine tables.
  Production does not use Ollama or a local SearXNG (the search provider chain is [37](37-anker-agentic-venture-erp.md)
  §2.3), so those tiles read "not configured" or "down" regardless of platform health, and **the things that
  do matter are not on the page**: the Qwen lanes, the cron jobs, the deploys, the matching engine, the email
  provider.
- The Anker side already records what SAIL needs and SAIL does not show it: an AI call log (`ai_calls`) with a
  usage summary route (`/api/admin/ai-usage`, not in SAIL's allowlist), an audit table (`audit_events`), the
  assistant event log, per-run cost, a notifications table, campaign job queues.

### 2.4 Gaps

| # | Gap | Consequence |
| --- | --- | --- |
| S1 | No AI operations view: usage, cost, failures, lane/model, latency, by task and tenant | The Qwen free-lane exhaustion, the 401 on a plan key and the 403 on search were all found by hand |
| S2 | No run traces or failed-run triage | A hung run is invisible; the 504 had one log line |
| S3 | No job and cron health (last run, duration, failures) for 15 scheduled jobs | A silent cron failure goes unnoticed until a customer asks |
| S4 | No deploy/CI awareness | Which release broke what is unknown to the operator |
| S5 | No quality monitor: eval results, matching-engine health, ranking sanity | Regressions are found by users |
| S6 | No data-quality workspace: duplicate/conflict queues, import review, identity merges | 772 import conflicts live in a CSV in Downloads |
| S7 | No tenant health or usage metering | Cannot see who is active, stuck, expensive or churning |
| S8 | No alerting or incident record | Nobody is told; nothing is remembered |
| S9 | No oversight of agent actions (proposals, approvals) once Anker has them | Staff cannot see autonomous activity or stop it |
| S10 | Staff security basics unverified: MFA, session control, role-based action limits | The console controls platform-wide keys and every tenant's access |
| S11 | No tests, no preview environment, split package manager | A bad deploy goes straight to production |
| S12 | Admin duplicated: Anker's in-app `/dashboard/admin` (owner-gated) and SAIL | Two places; parity unclear |

### 2.5 Verdict

SAIL is a working **configuration and content console** (keys, AI router, newsroom, campaign controls) with a
relay to Anker's engines. It is not yet a **monitor**: it cannot see AI cost, run health, jobs, deploys, quality or
tenants, and it cannot tell anyone when something is wrong. The product goal is the monitor, so that is where the
build goes first.

---

## 3. Target: what SAIL is, area by area

### 3.1 Platform health (replaces System health)

A single **status board** of real dependencies, each with a check the production runtime performs and a history:

| Component | Check | Source |
| --- | --- | --- |
| Web app and API | synthetic request to a health route; p95 latency | Anker `/api/diagnostics` (exists: liveness for anyone, detail for an admin; extend with latency and build id) |
| Database | connect, round-trip, connection saturation | direct |
| AI lanes | per lane (free, plan, other providers): last success, last failure type, quota state | Anker `ai_calls` |
| Search, OCR, email provider, DNS/deliverability | nightly and on-deploy dependency check ([37](37-anker-agentic-venture-erp.md) §5.4) | Anker (new) |
| Cron jobs | last run, duration, result, next due; stale = alert | Anker `cron_runs` (new, one row per run) |
| Deploys and CI | latest production deploy, status, commit; CI state | Vercel and GitHub APIs |
| Storage and queues | blob sweep, outreach queue depth, LinkedIn action queue depth, assessment jobs | Anker tables |

Retire the Ollama, SearXNG and Marker tiles for production (keep them as optional development checks).

### 3.2 AI operations

The view the owner needs to run an AI product on a budget:

- Calls, tokens, cost and latency by **task, surface, lane, model, tenant**, for a chosen window; failures by typed
  kind (rate limited, quota, credentials, model, timeout), with the lane's remaining free allowance if known.
- **Run explorer.** Search and open any agent run: plan, steps, model and tool calls, proposals, final answer, the
  request clock, errors. This is the trace of [37](37-anker-agentic-venture-erp.md) §5.4 rendered. *Staff see
  structure and metadata, not tenant prompt text.*
- **Failure triage.** Runs that ended in error, timeout or budget stop, grouped by cause, with a link to the
  release that first showed the pattern.
- **Spend.** Per tenant, per day, against a ceiling; a threshold alert (§3.5).
- **Router controls** stay (provider, per-task model, kill switch, lane keys) and gain a **change log with a
  one-click revert**.

### 3.3 Agents and approvals (when Anker ships the action layer)

- Roll-up of proposals by tenant, risk class, status and age; a staff **force-reject** and **pause an agent
  definition** control (never force-approve).
- Autonomy settings per tenant: current ceiling by risk class, who set it, when; staff can lower a ceiling, never
  raise it.
- Agent definitions registry: what each does, its triggers, budgets, last runs, success rate.

### 3.4 Data operations

- **Directory quality:** duplicate rate, stale share, freshness, per-source quality scores, trend.
- **Review queues** (read/write through the relay): identity merges the resolver would not decide; import
  conflicts (real disagreements, with the directory value, the sheet value and the evidence, decision log);
  suspect same-name collisions. Replaces the CSV.
- **Import console** with the dry-run → review → apply flow as the only path, a run history, and "what this
  import changed" per batch with undo where reversible.
- Existing tools (crawl, URL check, email check, enrichment) stay and report to the job board.

### 3.5 Alerts and incidents

- **Rules** (data, not code): metric, threshold, window, severity, channel. Starter set: AI failure rate > 5% in
  15 min; a lane out of quota; cron stale > 2 intervals; run p95 > 120 s or any run killed by the platform; eval
  pass rate below 100%; spend per tenant or platform over a ceiling; deploy failed; email bounce/complaint rate
  over threshold; queue depth above limit.
- **Delivery:** email and a chat webhook first; on-call rotation later. Alerts deduplicate and auto-resolve.
- **Incident record:** an alert can be promoted to an incident with a timeline, owner, cause and fix, linked to the
  deploy or run. The history is what lets us say "this class of bug is gone".

### 3.6 Tenants and customers

- Tenant list with plan, seats, last activity, usage (runs, AI cost, sends, storage), health score (activity,
  errors, support flags), and billing state; drill into one tenant's aggregate trends.
- **Entitlements and flags**: plan features, module switches, limits, per tenant; audited; Anker reads them.
- **Support:** view-as with a mandatory reason, a time limit, and a visible banner in the tenant app; every
  view-as session listed per tenant; no standing access.
- **Billing:** subscriptions, credits, invoices, failed payments, from the billing tables; Stripe is the source of
  truth, SAIL reads and links.

### 3.7 Content and communications

Newsroom (as built), platform email identity, templates, the waitlist and early-access queue (invite as an audited
action).

### 3.8 Staff security and audit

Roles with a permission matrix (what `staff`, `admin`, `superadmin` can do, enforced server-side per route); MFA
for every staff account; session list and revoke; IP and device notes on sign-in; every write recorded in
`company_audit_log` with actor, action, target, before/after and reason; export. Secrets are shown once and never
re-displayed.

---

## 4. One operator plane: retiring `/dashboard/admin`

Anker's in-app console (owner-gated, consolidated at `/dashboard/admin`) overlaps SAIL on imports, send
center, newsroom, users, AI config and more. Decision (D4 in [37](37-anker-agentic-venture-erp.md)): **SAIL is the
only operator plane.**

Migration rule: a function leaves the in-app console when SAIL has it with the same capability and an audit record;
until then the in-app page shows a banner pointing to SAIL. The owner accounts stay a tenant-side concept (full
platform access, firewalled from tenant private records); the **tooling** moves. The service-token relay stays the
bridge, and gains a request log so SAIL's own calls into Anker are auditable on both sides.

---

## 5. The contract between SAIL and Anker

Everything below is an Anker obligation, exposed behind the existing service-token relay and allowlist, read-only
unless stated. Versioned under `/api/admin/v1/`; SAIL pins a version.

| Endpoint (new unless noted) | Returns | Used by |
| --- | --- | --- |
| `GET health` (extends `/api/diagnostics`) | component statuses and latencies | §3.1 |
| `GET dependencies` | nightly/on-deploy dependency check results | §3.1 |
| `GET jobs` | `cron_runs`: last run, duration, result, next due per job | §3.1, §3.5 |
| `GET ai/usage` (exists as `/api/admin/ai-usage`; add to allowlist) | usage by task, lane, model, tenant, window | §3.2 |
| `GET ai/lanes` | per-lane state (last success/failure kind, quota state) | §3.1, §3.2 |
| `GET runs`, `GET runs/:id` | run list and trace (no prompt text) | §3.2 |
| `GET evals`, `GET evals/:id` | eval runs and per-case results | §3.1, §3.5 |
| `GET proposals`, `POST proposals/:id/reject`, `POST agents/:id/pause` | proposal roll-up and staff controls | §3.3 |
| `GET tenants/:id/usage` | aggregate usage and health inputs | §3.6 |
| `GET/PUT entitlements/:org` | plan, features, limits | §3.6 |
| `GET review/identity`, `GET review/conflicts`, `POST review/:id/decide` | queues and decisions | §3.4 |
| `GET/POST imports` (exists; add dry-run, batch history, undo) | import console | §3.4 |
| `POST events` (SAIL → Anker) | none; instead Anker **pushes** alert events to SAIL via `POST /api/ingest/events` (new on SAIL, signed) | §3.5 |

Two rules: Anker never returns tenant private record contents on these routes (aggregates, ids, metadata), and
every SAIL write carries a reason string stored in both audit logs.

**Telemetry tables (Anker, new):** `cron_runs`, `agent_runs` (exists; extend with trace fields), `eval_runs`,
`eval_results`, `dependency_checks`, `alert_events`. SAIL owns `alert_rules`, `incidents`, `staff_sessions`,
`mfa_factors`.

---

## 6. Build plan with acceptance

Ordered so SAIL becomes a monitor first, then a fuller admin plane. Phase numbers here are SAIL's; each depends on
the Anker phase named.

**S-0 — Make it safe to change (1 week).**
Tests for auth, the proxy allowlist and the audit writer; a preview deployment per branch; one package manager;
CI typecheck and test on every push; a `/healthz` of its own.
*Acceptance:* a PR cannot reach production without CI green; the allowlist has tests that fail on an
unlisted path.

**S-1 — Real status board and job health (1–2 weeks; needs Anker Phase 0).**
Replace System health with §3.1 using real checks; `cron_runs` in Anker; deploy and CI status; retire the Ollama
and SearXNG tiles.
*Acceptance:* stopping a cron (or breaking a dependency on purpose) turns a tile red within one check interval and
shows the reason; the board matches what a person finds by hand.

**S-2 — AI operations (2 weeks; needs Anker Phase 0).**
Usage and cost, lanes, failure kinds, the run explorer; add `ai-usage` and `runs` to the allowlist.
*Acceptance:* the three 2026-10 incidents (a plan key rejected, a free lane exhausted, a search 403) are visible as
failure kinds within a minute of occurring; a hung run opens in the explorer with the slow step named.

**S-3 — Alerts and incidents (1–2 weeks).**
Rules, email and webhook delivery, dedup and auto-resolve, incident records; the starter rule set (§3.5).
*Acceptance:* each starter rule fires in a staged test, delivers to the channel, and resolves; an incident
carries its timeline and cause.

**S-4 — Staff security (1 week, can run alongside S-1).**
MFA, session list and revoke, permission matrix enforced per route, full before/after audit with reason.
*Acceptance:* a `staff` account cannot call an `admin` route (tested); an unreasoned write is refused; MFA is
required to sign in.

**S-5 — Data operations (2–3 weeks; needs Anker Phase 3).**
Quality dashboard, identity and conflict review queues, the import console with dry-run and undo.
*Acceptance:* the current 716 open import conflicts are decided from SAIL; re-importing a batch adds nothing and
the history shows it.

**S-6 — Tenants, entitlements, support (2 weeks).**
Tenant health and usage, entitlement and flag editor, view-as with reason and tenant-side banner, billing view.
*Acceptance:* a plan change flips a feature in the tenant app within a minute and is audited; a view-as session is
listed, time-limited and banner-marked.

**S-7 — Agent oversight (1 week; needs Anker Phase 1–2).**
Proposal roll-up, force-reject, pause an agent definition, autonomy ceilings view.
*Acceptance:* staff can pause a misbehaving agent and the next run does not start; a pending proposal can be
rejected from SAIL with a reason.

**S-8 — Parity and retirement (2 weeks).**
Close the remaining in-app admin functions (§4) and remove them.
*Acceptance:* every route under `/dashboard/admin` redirects to its SAIL equivalent; nothing was lost.

---

## 7. Metrics for SAIL itself

| Measure | Target |
| --- | --- |
| Incidents first detected by SAIL (not by a person or a customer) | > 90% |
| Time from fault to alert | < 5 min for platform faults |
| Alert precision (alerts that needed action) | > 80% |
| Operator tasks done without a shell or a database client | > 95% |
| Staff actions with a recorded reason | 100% |
| Weekly: failed runs with a known cause | > 95% |

---

## 8. Decisions for the founder

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Build monitoring in SAIL, or buy (an observability vendor) and link out? | Build the Anker-specific views (AI, runs, jobs, quality, tenants); use a vendor for generic infrastructure metrics and logs if needed, linked from the status board |
| D2 | Alert channel at first? | Email plus one chat webhook |
| D3 | Staff count and roles in the next year? | Plan for 3–6; the permission matrix (S-4) is enough |
| D4 | Retire the in-app admin? | Yes, after S-8 |
| D5 | Tenant-facing status page? | Later; first make the internal board trustworthy |
| D6 | Merge SAIL into the Anker repository (one monorepo, two apps)? | Not now; the separate identity, deploy and blast radius are features. Share types through a small package if drift appears |

---

## 9. Non-goals

A customer-facing analytics product; business logic in SAIL; a second identity provider for tenants; log storage and
search at infrastructure scale (use a vendor); autonomous remediation (SAIL alerts and lets a person act).
