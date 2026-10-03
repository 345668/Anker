# 38 — SAIL: the monitoring and admin plane for Anker — status and spec

**Date:** 2026-10-03 (second edition, after a scrutiny pass; §11 lists what changed) · **Status:** assessment and spec, nothing
built · **Companion:** [37](37-anker-agentic-venture-erp.md) (Anker, the agentic ERP). SAIL is a **separate repository**
(`345668/SAIL`, Next.js, its own Vercel project); this document lives in the Anker repository because the contract between
the two apps is mostly Anker's side and the two specs must move together.

**Rule for this document:** §2 is verified from the SAIL repository, the Anker repository and read-only production counts on
2026-10-03; unverified items are marked. Everything in §3 closes a gap in §2.4 or an Anker obligation in
[37](37-anker-agentic-venture-erp.md) §6.4.

---

## 0. The goal, stated so it can be tested

> SAIL lets a small company staff **see what the platform is doing, know when it is wrong before a customer does, and fix
> it**, without touching production by hand and without seeing tenant private records.

- **Monitor.** Is the platform up, correct, fast and affordable? Which tenants, agents, models, jobs and data sources are
  healthy?
- **Administer.** Tenants, people, entitlements, billing, keys, AI configuration, the shared directory, content, compliance
  requests, and the engines that run unattended (campaigns, outreach).
- **Boundary.** SAIL is the platform-owner view: aggregates, traces and shared data. Tenant private records are reachable only
  through an audited, time-limited view-as grant.

The test: **an incident like this week's founder-matching 504 is noticed by SAIL, attributed to a step and a release, and
handled from SAIL**, instead of being found by a person running a test in a browser.

---

## 1. Principles

1. **SAIL holds no business logic.** It reads and configures; engines stay in Anker (the relay: one allowlisted proxy, a
   service token, user-scoped calls carry an acting-user header).
2. **Read-mostly, change by request.** Every write is an audited action with a **reason**, and is reversible where it can be.
3. **Alerts over dashboards.** Each health fact has a threshold, an owner, a channel and a runbook.
4. **One operator plane.** Anker's in-app `/dashboard/admin` retires when SAIL has parity (§4).
5. **Least privilege, with a record.** Roles, MFA, per-action audit; separate database roles for reading and writing.
6. **Honest unknowns.** A panel shows "not measured", never a reassuring blank. (Today's health page shows "not configured"
   for services production does not use, and the billing page shows an empty table nothing writes to; §2.3.)
7. **Disclose side effects.** An action that emails or messages real people states who and how many before it runs and has a
   safe mode. (An applicant "re-assess" emails the applicant every time; staff must never trigger that by accident.)
8. **Production must not depend on SAIL.** Anker keeps working with SAIL down. SAIL is a console, not a dependency: it reads
   shared rows Anker already reads (AI router config) and nothing in the request path calls SAIL.
9. **Cheap to run.** SAIL stays thin; heavy aggregation happens in Anker or in database views on a schedule.

---

## 2. Where SAIL stands (verified 2026-10-03)

### 2.1 What it is

| Fact | Evidence |
| --- | --- |
| Separate Next.js 16 app, own repository and Vercel project; **deploys on every push to `main` with no test step** (checkout, install CLI, pull, build, deploy) | `.github/workflows/deploy.yml` |
| Own identity: `company_staff`, scrypt passwords, **stateless** HMAC session cookie, 8-hour lifetime; roles `staff`, `admin`, `superadmin`; **one staff account exists (role `admin`)** | `lib/auth.ts`, production |
| Shares Anker's Neon database; its own tables: `company_staff`, `platform_api_keys`, `impersonation_grants`, `system_settings`, `platform_usage_events`, `company_audit_log` (25 rows), `news_articles`, `news_themes` | `db/001-init.sql`, production |
| 25 portal pages, ~1,240 lines of page code, most 30-line shells over a client component; 18 API routes | `app/` |
| The relay: an allowlist (`PROXY_ALLOWLIST`, ~25 entries plus patterns), service token added server-side, user-scoped paths need an acting-user header and are audited on the Anker side | `lib/anker-proxy.ts` |
| No tests, one migration file, npm (Anker uses pnpm), one typecheck script | repository |
| Platform keys on file: Mistral, OpenAI, Qwen (two rows, one disabled), Resend. **No Anthropic or Gemini key** | production |

### 2.2 What it does today

| Area | Reality |
| --- | --- |
| Tenants and people | Organizations and Users lists |
| **View-as** | SAIL mints a single-use grant (`impersonation_grants`: 1 minted, **0 used**) and builds a link to `/api/impersonate/accept` on the tenant app, **which does not exist in Anker**. View-as is not functional |
| Platform secrets and AI | Platform keys (AES-256-GCM at rest), AI config (provider, per-task models, kill switches, Qwen free/plan lane keys), integration keys, MCP and extension tokens: **real** |
| Content | Newsroom (draft → publish → archive, themes, API keys, image upload through the relay): **real** |
| Data operations | Imports, Crawl, URL check, Email check, Enrichment, Research, Inbox, Waitlist, Outreach, Email: relayed to Anker's admin engines; thin |
| Founder campaign engine | Console with engine controls, board, attach deck: **real** |
| **Billing** | Reads **`platform_usage_events`, which nothing in Anker writes**; the page says "No usage recorded yet". Real cost data is in Anker's `ai_calls` (tokens, workspace, provider; **no cost column**) |
| Audit | Reads `company_audit_log`. Successful sign-ins are recorded; **failed sign-ins are not** |

### 2.3 The monitoring that exists

- **Dashboard:** six counts. No trends, no thresholds.
- **System health:** pings `OLLAMA_URL`, `SEARXNG_URL`, `MARKER_URL`, `TENANT_APP_URL` and counts nine tables. Production uses
  none of the first three (search is now a provider chain; PDF reading is in-app), so the tiles read "not configured" or
  "down" whatever the platform's health, and **the things that matter are not on the page**: the Qwen lanes, the 15 cron jobs,
  deploys, matching, the email provider, queues.
- Anker already records what SAIL needs and SAIL shows none of it: `ai_calls` (3,115 rows; **584 in the last 7 days, 96.7%
  ok, 19 failed**), the assistant event log, `audit_events` (0 rows; §37 §2.4), campaign job queues, `/api/diagnostics`
  (liveness for anyone, detail for an admin), and an `ai-usage` route that is not in SAIL's allowlist.

### 2.4 Gaps

| # | Gap | Consequence |
| --- | --- | --- |
| S1 | No AI operations view (usage, cost, failures by lane/model/task/tenant) | The 401 on a plan key, the exhausted free lane and the search 403 were all found by hand |
| S2 | No run traces or failed-run triage; `ai_calls` has no run id and no cost | A hung run is invisible; the 504 had one log line |
| S3 | No job and cron health for 15 scheduled jobs | A silent cron failure lasts until a customer asks |
| S4 | No deploy/CI awareness | Which release broke what is unknown |
| S5 | No quality monitor (evals, matching health) | Regressions are found by users |
| S6 | No data-quality workspace: duplicate/conflict queues, import review | 716 open conflicts live in a CSV |
| S7 | No tenant health or usage metering | Cannot see who is active, stuck, expensive |
| S8 | No alerting, no incident record | Nobody is told; nothing is remembered |
| S9 | No oversight of agent actions once Anker has them | Staff cannot see or stop autonomous activity |
| S10 | **Staff security is thin:** no MFA; **no login rate limit or lockout**; stateless sessions **cannot be revoked and are never re-checked against the database, so a disabled staff account keeps working until its token expires (up to 8 hours)**; failed logins not logged; one account; roles exist but per-route enforcement is minimal (`role` is read in a few places) | The console controls platform-wide keys and every tenant's access |
| S11 | **Deploys to production on every push with no tests**, no preview environment | A bad commit reaches production directly |
| S12 | Two admin consoles | Duplication |
| S13 | **View-as is broken** | Support cannot see what a customer sees; the grant table fills with unused rows |
| S14 | **Billing page reads an unwritten table** | The owner has no spend view at all |
| S15 | **Blast radius of shared secrets and database:** SAIL and Anker share a secret family and an encryption scheme (duplicated helpers); SAIL connects with the single platform database credential (a role-level restriction was not found, though no statement in SAIL writes tenant tables directly); and the service token is full admin on the tenant side | One leaked SAIL credential reaches every tenant |
| S16 | **No compliance operations:** nothing for data-subject requests, suppression, opt-outs, sub-processor register, data licences | Anker's legal exposure ([37](37-anker-agentic-venture-erp.md) §8) has no operator tooling |
| S17 | No release control: no feature flags, no maintenance mode, no rollback from the console | Fixes need a deploy |
| S18 | No pitch / waitlist / application queues in one place (owner-tier submissions, early access, founder applications) | Inbound leads and applicants are scattered |
| S19 | No runbooks, no on-call, no post-incident record | Knowledge lives in one head |

### 2.5 Verdict

SAIL is a working **configuration and content console** (keys, AI router, newsroom, campaign controls) with a relay to
Anker's engines, built by and for one person. It is not yet a **monitor**: it cannot see AI cost, run health, jobs, deploys,
quality or tenants, cannot tell anyone when something is wrong, and its own security and release process are weaker than the
platform it controls. The goal is the monitor, but **hardening SAIL itself comes first**, because an unprotected console that
can rewrite every tenant's keys and access is the highest-impact asset in the company.

---

## 3. Target: what SAIL is, area by area

### 3.1 Platform health (replaces System health)

A **status board** of real dependencies, each with a check the production runtime performs, a history and a runbook link:

| Component | Check | Source |
| --- | --- | --- |
| Web app and API | synthetic request; p95 latency; build id | Anker `/api/diagnostics` (exists; extend with latency and build id) |
| Database | connect, round-trip, connection saturation, replication/backup status | direct and Neon API |
| AI lanes | per lane (free, plan, others): last success, last failure kind, quota state, p95 latency | Anker `ai_calls` |
| Search, OCR, email provider, DNS/deliverability | nightly and on-deploy dependency check | Anker (new) |
| Cron jobs | last run, duration, result, next due; stale = alert | Anker `cron_runs` (new) |
| Deploys and CI | latest production deploy, status, commit; CI state; rollback target | Vercel and GitHub APIs |
| Storage and queues | blob sweep, outreach queue depth, LinkedIn action queue, assessment jobs | Anker tables |
| Billing webhooks | last Stripe event received, failures | Stripe API / Anker |
| SAIL itself | its own health, deploy, error rate | SAIL |

Retire the Ollama, SearXNG and Marker tiles for production (keep as development checks).

### 3.2 AI operations

- Calls, tokens, **cost** and latency by task, surface, lane, model and tenant for a chosen window; failures by typed kind
  (rate limited, quota, credentials, model, timeout, time limit) with the lane's remaining free allowance if known. Needs
  Anker's `run_id` and `cost` columns ([37](37-anker-agentic-venture-erp.md) §5.4).
- **Run explorer:** search and open any run: plan, steps, model and tool calls, proposals, final answer, the request clock,
  errors. *Staff see structure and metadata, not tenant prompt text.*
- **Failure triage:** error, timeout and budget-stopped runs grouped by cause, linked to the release that first showed the
  pattern.
- **Spend:** per tenant per day against a ceiling; threshold alert (§3.5).
- **Router controls** stay (provider, per-task model, kill switch, lane keys) and gain a **change log with one-click
  revert**. Add the **sub-processor register** and **per-workspace provider policy** editor
  ([37](37-anker-agentic-venture-erp.md) §8.4).

### 3.3 Agents and approvals (when Anker ships the action layer)

Proposal roll-up by tenant, risk class, status and age; staff **force-reject** and **pause an agent definition** (never
force-approve); the autonomy ceiling per tenant and who set it (staff can lower, never raise); the agent definitions
registry with triggers, budgets, last runs and success rate.

### 3.4 Data operations and quality

- **Directory quality:** duplicate rate, stale share, freshness, per-source quality, trend.
- **Review queues** through the relay: identity merges the resolver will not decide; import conflicts with the directory
  value, the sheet value and evidence, and a decision log; suspected same-name collisions. Replaces the CSV.
- **Import console:** dry-run → review → apply as the only path; run history; per-batch "what this changed" with undo where
  reversible; **source, licence and permitted use recorded per batch** before apply.
- **Safe mode for side-effecting engines:** a campaign or assessment action that emails real people shows who and how many,
  requires confirmation, and offers a sandbox recipient.
- Existing crawl, URL check, email check and enrichment tools report to the job board.

### 3.5 Alerts, incidents, runbooks

- **Rules** (data, not code): metric, threshold, window, severity, channel, runbook. Starter set: AI failure rate > 5% in 15
  min; a lane out of quota; cron stale > 2 intervals; run p95 > 120 s or any run killed by the platform; eval pass rate < 100%;
  spend over a ceiling; deploy failed; bounce/complaint rate over threshold; queue depth over limit; Stripe webhook failures;
  repeated failed staff logins.
- **Delivery:** email and a chat webhook first; on-call rotation later. Dedup and auto-resolve.
- **Incident record:** an alert becomes an incident with timeline, owner, cause, fix, linked deploy or run; a blameless review
  for Sev-1/2. Each alert links to a **runbook** (what it means, how to check, how to fix). The history is what lets us say
  "this class of bug is gone".

### 3.6 Tenants and customers

- Tenant list: plan, seats, last activity, usage (runs, AI cost, sends, storage), health score, billing state; drill into one
  tenant's aggregate trends; lifecycle (trial, active, paused, offboarding with export and erasure per
  [37](37-anker-agentic-venture-erp.md) §8.2).
- **Entitlements and flags:** plan features, module switches, limits, per tenant; audited; Anker's `can()` reads them
  ([37](37-anker-agentic-venture-erp.md) §5.5). **Feature flags and maintenance mode** with staged rollout.
- **Support / view-as:** a **working** accept endpoint on Anker; mandatory reason, time limit, a visible banner in the tenant
  app, every session listed per tenant, no standing access; the tenant can see that staff viewed their workspace (and when).
- **Billing:** subscriptions, credits, invoices, failed payments; Stripe is the source of truth, SAIL reads and links;
  spend from Anker's `cost` data, not from `platform_usage_events`.

### 3.7 Compliance operations

A queue for **data-subject requests** (access, erasure, objection) with a deadline clock; the **suppression registry**
across email and LinkedIn; directory **opt-out requests**; the **data-licence register** per import source; the
**sub-processor register**; the **claims register** (public claims, measured source, owner, last verified); retention
jobs and their last run. These exist so legal duties have an owner and a log.

### 3.8 Content, leads and communications

Newsroom (as built); platform email identity and templates; one **inbound queue** for waitlist, early-access, founder
applications and pitch submissions with status and owner (invite is an audited action).

### 3.9 Staff security and audit

- Roles with a **permission matrix** enforced server-side per route and per action; reasons required for writes.
- **MFA** (TOTP, with recovery) for every staff account, **required before any other SAIL work ships**.
- **Login protection:** rate limit and lockout, failed-attempt audit, optional IP allowlist.
- **Session control:** server-side session records, **checked on every request** (so disabling an account or revoking a session takes effect at once), listable and revocable; shorter lifetime for admin
  actions with step-up for dangerous ones (keys, view-as, erasure).
- **Secrets:** shown once, never re-displayed; rotation reminders; platform keys encrypted with a key **separate from
  Anker's** (end the shared secret family).
- **Database roles:** SAIL reads through a read-only role and writes only the tables it owns or through the relay; no
  standing write access to tenant tables (today it holds the one platform credential; nothing in SAIL writes tenant tables,
  so the restriction costs nothing to enforce).
- **Break-glass:** a documented second admin and recovery path so the console is never a single person.
- **Audit:** every write in `company_audit_log` with actor, action, target, before/after and reason; exportable; tamper-
  evident (hash chain or append-only).

### 3.10 Telemetry pipeline (how the data gets here)

Decision (D1): build the Anker-specific views in SAIL and use a vendor for generic logs and infrastructure metrics.
Contract: Anker emits **structured events** (run, call, tool, proposal, cron, dependency check, eval) into its own tables
with a run id on every log line; SAIL reads aggregates through the relay and pushes alerts through its own ingest. **PII
scrubbing:** no prompt text, no personal data fields; ids and metadata only; sampling for high-volume events; retention by
class (traces 30 days, aggregates 13 months). A log drain from the hosting platform to the vendor covers platform-level
timeouts that the application cannot log.

---

## 4. One operator plane: retiring `/dashboard/admin`

Anker's in-app console (owner-gated, consolidated at `/dashboard/admin`) overlaps SAIL on imports, send center, newsroom,
users and AI config. **SAIL is the only operator plane.** A function leaves the in-app console when SAIL has it with the
same capability and an audit record; until then the in-app page shows a banner pointing to SAIL. The **owner accounts** stay a
tenant-side concept (full platform access, firewalled from tenant private records, inbound pitch submissions visible); the
**tooling** moves. The service-token relay stays the bridge and gains a request log so SAIL's calls into Anker are auditable
on both sides, and an **identity and rate restriction** on the token.

---

## 5. The contract between SAIL and Anker

Everything below is an Anker obligation, behind the existing service-token relay and allowlist, read-only unless stated,
versioned under `/api/admin/v1/`; SAIL pins a version.

| Endpoint (new unless noted) | Returns | Used by |
| --- | --- | --- |
| `GET health` (extends `/api/diagnostics`) | component statuses, latencies, build id | §3.1 |
| `GET dependencies` | nightly/on-deploy dependency check results | §3.1 |
| `GET jobs` | `cron_runs`: last run, duration, result, next due | §3.1, §3.5 |
| `GET ai/usage` (exists as `/api/admin/ai-usage`; add to allowlist; add cost) | usage and cost by task, lane, model, tenant, window | §3.2 |
| `GET ai/lanes` | per-lane state | §3.1, §3.2 |
| `GET runs`, `GET runs/:id` | run list and trace (no prompt text) | §3.2 |
| `GET evals`, `GET evals/:id` | eval runs and per-case results | §3.1, §3.5 |
| `GET proposals`, `POST proposals/:id/reject`, `POST agents/:id/pause` | proposal roll-up and staff controls | §3.3 |
| `GET tenants/:id/usage` | aggregate usage and health inputs | §3.6 |
| `GET/PUT entitlements/:org`, `GET/PUT flags` | plan, features, limits, flags | §3.6 |
| `GET review/identity`, `GET review/conflicts`, `POST review/:id/decide` | queues and decisions | §3.4 |
| `GET/POST imports` (exists; add dry-run, batch history, undo, source and licence) | import console | §3.4 |
| `GET/POST compliance/requests`, `GET/POST suppression`, `GET registers/*` | DSAR queue, suppression, licence, sub-processor and claims registers | §3.7 |
| `POST impersonate/accept` (**missing today**) | consumes a grant, scopes a read-only banner session | §3.6 |
| `POST /api/ingest/events` on **SAIL** (Anker → SAIL, signed) | alert events | §3.5 |

Rules: Anker never returns tenant private record contents on these routes (aggregates, ids, metadata); every SAIL write carries a
reason stored in both audit logs; the relay logs every call.

**Telemetry tables (Anker, new):** `cron_runs`, `eval_runs`, `eval_results`, `dependency_checks`, `alert_events`; extend
`ai_calls` (`run_id`, `cost_usd`) and `agent_runs` (trace fields; it has 0 rows today). **SAIL owns:** `alert_rules`,
`incidents`, `staff_sessions`, `mfa_factors`, `runbooks`.

---

## 6. Build plan with acceptance

Ordered so the console is **safe first, then a monitor, then a fuller admin plane**. Each depends on the Anker phase named.

**S-0 — Make SAIL safe to change (1 week).**
A CI workflow (typecheck, tests) that **gates the deploy**; a preview deployment per branch; tests for auth, the allowlist and
the audit writer; one package manager; its own health route.
*Acceptance:* a failing check blocks production; the allowlist has tests that fail on an unlisted path.

**S-1 — Staff security (1 week; do before anything else ships).**
MFA, login rate limit and lockout, failed-login audit, server-side revocable sessions, step-up for dangerous actions, the
permission matrix, a second admin account, a separate encryption key, a read-only database role.
*Acceptance:* a `staff` account cannot call an `admin` route (tested); ten failed logins lock the account and alert; a revoked
session stops working at once; MFA is required to sign in; an unreasoned write is refused.

**S-2 — Status board and job health (1–2 weeks; needs Anker Phase 0).**
Replace System health (§3.1); `cron_runs`; deploy and CI status; retire the dead tiles.
*Acceptance:* stopping a cron or breaking a dependency on purpose turns a tile red within one interval with the reason.

**S-3 — AI operations (2 weeks; needs Anker Phase 0).**
Usage, cost, lanes, failure kinds, the run explorer; add `ai-usage` and `runs` to the allowlist; replace the billing spend view.
*Acceptance:* a rejected plan key, an exhausted free lane and a search 403 each appear as a failure kind within a minute; a
hung run opens in the explorer with the slow step named; per-tenant spend for the last 7 days matches `ai_calls` tokens times
catalogue price.

**S-4 — Alerts, incidents, runbooks (1–2 weeks).**
Rules, delivery, dedup, incidents, runbooks, the starter set.
*Acceptance:* each starter rule fires in a staged test, delivers, links its runbook and resolves.

**S-5 — View-as that works (1 week; needs Anker `impersonate/accept`).**
The accept endpoint, banner, reason and time limit, tenant-visible log.
*Acceptance:* a staff member opens a tenant read-only with a reason; the session ends on time; the tenant can see it.

**S-6 — Data operations and compliance (3 weeks; needs Anker Phase 3).**
Quality dashboard, identity and conflict queues, the import console with source/licence/dry-run/undo, safe mode, DSAR and
suppression queues, the registers.
*Acceptance:* the 716 open conflicts are decided from SAIL; re-importing a batch adds nothing and the history shows it; a test
erasure request completes within its deadline clock.

**S-7 — Tenants, entitlements, release control (2 weeks).**
Tenant health and usage, entitlement and flag editor, maintenance mode, billing view, lifecycle.
*Acceptance:* a plan change flips a feature in the tenant app within a minute and is audited.

**S-8 — Agent oversight (1 week; needs Anker Phase 1–2).**
Proposal roll-up, force-reject, pause an agent, autonomy ceilings view.
*Acceptance:* staff pause a misbehaving agent and the next run does not start.

**S-9 — Parity and retirement (2 weeks).**
Close remaining in-app admin functions (§4) and remove them.
*Acceptance:* every `/dashboard/admin` route redirects to its SAIL equivalent; nothing lost.

---

## 7. Metrics for SAIL itself

| Measure | Target |
| --- | --- |
| Incidents first detected by SAIL (not a person or a customer) | > 90% |
| Time from fault to alert | < 5 min for platform faults |
| Alert precision (alerts that needed action) | > 80% |
| Operator tasks done without a shell or a database client | > 95% |
| Staff writes with a recorded reason | 100% |
| Failed runs with a known cause | > 95% |
| Staff accounts with MFA | 100% |
| Production deploys that passed CI | 100% |

---

## 8. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| SR1 | A compromised staff credential reaches every tenant | S-1 first; read-only DB role; step-up; allowlisted IP optional; audit |
| SR2 | SAIL becomes a dependency of production | Principle 8; failure-mode test with SAIL down |
| SR3 | Monitoring gaps make the board reassuring and wrong | "Not measured" states; dependency checks from the production runtime; chaos drills |
| SR4 | Alert fatigue | Precision metric; dedup; severity discipline; runbooks |
| SR5 | Tenant data exposed through view-as or traces | Metadata only; reason, time limit, banner, tenant-visible log |
| SR6 | Drift between the two repositories | Schema contract with one owner per table; shared types package if drift appears |
| SR7 | Single-person knowledge | Runbooks, second admin, break-glass |

---

## 9. Decisions for the founder

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Build monitoring in SAIL or buy? | Build the Anker-specific views; use a vendor for generic logs and infrastructure metrics, linked from the board |
| D2 | Alert channel at first | Email plus one chat webhook |
| D3 | Staff count and roles next year | Plan for 3–6; the permission matrix is enough |
| D4 | Retire the in-app admin? | Yes, after S-9 |
| D5 | Tenant-facing status page? | Later; first make the internal board trustworthy |
| D6 | Merge SAIL into the Anker repository? | Not now: separate identity, deploy and blast radius are features |
| D7 | Who is on call? | Name an owner and a deputy before S-4 |
| D8 | Vendor for logs and errors (for example an observability or error-tracking service)? | Pick one before S-2; a hosting log drain is the minimum |

---

## 10. Non-goals

A customer-facing analytics product; business logic in SAIL; a second identity provider for tenants; log storage and search
at infrastructure scale; autonomous remediation (SAIL alerts and lets a person act).

---

## 11. Revision notes: what the scrutiny pass changed

The first edition had these faults, now corrected:

1. **View-as** was marked "unverified"; it is **verified broken** (the tenant accept endpoint does not exist).
2. **The billing page** was described as "reads billing tables"; it reads `platform_usage_events`, which nothing writes.
3. **Staff security** was an unverified question; verified: no MFA, no login rate limit or lockout, stateless sessions that
   cannot be revoked and are not re-checked against the database (a disabled account keeps access up to 8 hours), failed
   logins unlogged, one staff account.
4. **Release process** was an unverified question; verified: SAIL deploys to production on every push with no test step.
5. **Blast radius** was missing: shared secret family, writable tenant tables, a full-admin service token (§2.4 S15).
6. **Added:** compliance operations (§3.7), release control and flags, the telemetry pipeline and PII rules (§3.10), runbooks and
   on-call, the safe-mode principle for side-effecting actions, the inbound lead queue, break-glass, the "production must not
   depend on SAIL" rule, S-0/S-1 as the first phases, and a risk table.
7. **The cost view depends on Anker adding `run_id` and `cost_usd` to `ai_calls`**; the first edition assumed they existed.
8. **Still unverified:** the depth of the Organizations, Users and Outreach pages; whether the Newsroom image-upload relay is in
   use; the Neon plan's backup and branching features.
