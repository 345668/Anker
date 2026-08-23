# Anker platform audit — current map (2026-08-23)

_A fresh, code-verified inventory of the platform: every surface, the engines behind it,
what's genuinely built vs. stubbed, and what's actually left to build. Supersedes
`platform-audit.md` (2026-08-15), several rows of which are now stale — see §8._

Method: counted from the working tree on branch `feat/agent-tooling-expansion`; engine
wiring verified by import-graph greps (direct **and** indirect, via parent engines), not
by the older doc's assumptions.

---

## 1. Executive verdict

The platform is **large and overwhelmingly real**. The three persona surfaces — founder
fundraising, VC/GP fund-ops, LP monitoring — run on real Postgres data and real
deterministic engines, now fronted by a 47-tool AI agent belt. Since the Aug-15 audit,
**the domain engines that were "CRUD-only" are now wired** (share-plans→vesting,
valuations-409a→OPM, kyc→opensanctions, loan-ops→servicing/amortization, spv→economics).

The genuine remaining work is narrower than before and clusters in four areas:
1. **Three admin cards** still "Coming soon" (users/roles, audit log, billing UI).
2. **A few engines need real external data/integrations** (KYC live provider, K-1 gen,
   contract AI, compensation benchmarks, registrar filings, scenario persistence).
3. **The async/notifications layer is thin** — 5 crons today; no deadline-reminder or
   in-app notification engine.
4. **Carta-grade app shell** — entity switcher, ⌘K, a shared table/metric-tile kit.

Plus operational deploy/config (doc-worker, Stripe webhook secret, env/tables).

---

## 2. Surface inventory (counts)

| Surface | Count |
|---|---|
| Dashboard pages (`app/dashboard/**/page.tsx`) | **138** |
| API routes (`app/api/**/route.ts`) | **310** |
| Deterministic engines (`lib/modules/*.ts`) | **13** |
| Agent tools (across 4 registries) | **47** |
| Scheduled crons (`vercel.json`) | **5** |
| Mock/TODO markers in dashboard pages | **3** files (admin index cards, admin/users, portfolio/fund/legal) |

Agent-tool registries: `tools.ts` (27) · `tools-platform.ts` (8) · `tools-modeling.ts`
(7) · `tools-fo.ts` (5). Merged into `ALL_TOOLS` in the agent loop and the MCP route.

---

## 3. Deterministic engines — all 13 built and wired

Legend: **direct** = imported by a dashboard page/route; **indirect** = reached through a
parent engine.

| Engine (`lib/modules/`) | Wired | How |
|---|---|---|
| `carta-modules` | ✅ direct | 14 pages/routes (umbrella) |
| `kyc` | ✅ direct | 8; chains to `opensanctions` |
| `opensanctions` | ✅ indirect | via `kyc.ts` |
| `share-plans` | ✅ direct | 6; imports `vesting` 15× |
| `vesting` | ✅ indirect | via `share-plans.ts` + agent tool `model_vesting` |
| `valuation-409a` | ✅ direct | 2; wraps OPM |
| `opm-409a` | ✅ direct | 1 + agent tool `model_409a` |
| `loan-servicing` | ✅ direct | 6; imports `loan-amortization` |
| `loan-amortization` | ✅ indirect | via `loan-servicing.ts` + `dataroom/statements` + agent tool |
| `waterfall` | ✅ indirect | via `spv-economics.ts` + `portfolio/waterfall` + agent tool `model_waterfall` |
| `spv-economics` | ✅ direct | 2 |
| `spv-lifecycle` | ✅ direct | 5 |
| `spv-portal` | ✅ direct | 3 |

> Correction to the prior audit: 409A, vesting, loan, and waterfall are **not** "not built"
> — they're built and wired (some indirectly). Direct-import counts of 0 were misleading.

---

## 4. Persona surfaces — status

- **Founder** (`/dashboard`: find-investors, matchmaking, outreach, decks, cap-table,
  data-room, portfolio, runway, tools/*): real matching + AI engines + the new modeling
  agent tools. Solid.
- **VC/GP** (`/dashboard/portfolio/fund/*`: ledger, calls, distributions, performance,
  legal, LPs, reports; deals; kyc-aml; fund-tax; spvs; loan-ops; contracts; valuations;
  share-plans; compensation; equity-compliance): the deepest surface; CRUD + engines all
  present. The engine *depth* gaps are in §5.
- **LP** (portal, capital account, fund performance, statements): read-oriented; the new
  `lp_capital_account` agent tool + `lib/portfolio/capital-account.ts` back this.

---

## 5. What's genuinely left to build (code)

### 5a. Admin console — ✅ DONE (2026-08-23)
`/dashboard/admin` is a **real, owner-gated Owner Console**. All three cards are now built
and un-stubbed:
- **Users & roles** — ✅ built. Roster merged across Supabase Auth + the app `users` table
  (admin/owner flags) + `memberships` (org role + persona); grant/revoke admin with
  owner-immutable + no-self-lockout guards, written to the audit log.
  (`lib/admin/users.ts`, `app/api/admin/users/role/route.ts`, `components/admin/users-client.tsx`)
- **Audit log** — ✅ already built (`lib/audit/audit-log.ts` + `AuditFeed`); was only mis-flagged.
- **Billing & credits** — ✅ already built (Stripe-backed `BillingClient` + `getBillingState`);
  backend real (`/api/billing/{webhook,portal,checkout}`), was only mis-flagged.

### 5b. Engines that need real external data / integrations
| Area | Page | Status |
|---|---|---|
| KYC/AML | `/dashboard/kyc-aml` | ✅ **built (2026-08-23)** — OpenSanctions was already wired (real `/match`: sanctions/PEP/adverse-media, proper adjudication, watchlist dev fallback) via `/api/kyc/cases/[id]/screen`; added an operator **live-vs-dev-fallback status banner** + `provider` in the screen response. Deploy step: set `OPENSANCTIONS_API_KEY`. |
| Fund Tax | `/dashboard/fund-tax` | ✅ **K-1 generation built (2026-08-23)** — `lib/portfolio/k1.ts` allocates fund tax-year income per LP by ownership + builds each LP's capital rollforward from real line items; `/api/portfolio/funds/[id]/k1/generate` files a per-LP `k1` doc (page shows issuance). Fund income defaults from the ledger, GP-confirmable. Remaining: tax-estimate engine; strict tax-year ledger scoping. |
| Contracts | `/dashboard/contracts` | ⬜ **clause search, AI redlines vs. playbook, e-signature** |
| Compensation | `/dashboard/compensation` | ⬜ **market-benchmark ingestion** (manual bands today) |
| Equity Compliance | `/dashboard/equity-compliance` | ⬜ **registrar/Companies House filing** integration |
| Fund Forecasting | `/dashboard/forecasting`, `tools/*` | ⬜ **scenario persistence + Monte-Carlo** (deterministic calculators exist) |

### 5c. Async / scheduled jobs
Built: `outreach-scheduler` (10m), `campaign-assessment` (15m), `campaign-send` (30m),
`compliance-digest` (Mon 08:00), `promote-scheduled-articles` (hourly), and
**`deadline-reminders` (daily 07:00)** ✅ new — capital-call + distribution reminders.

Still missing:
- **Deadline reminders — company-scoped** ⬜ 409A expiry + equity filings (fund-scoped
  calls/distributions are ✅ done; company-scoped needs the company→user mapping first).
- **Nightly loan accrual** — interest accrual + amortization posting.
- **K-1 season batch** — annual per-LP generation.
- **Notice batch delivery** — capital-call/distribution notices queued for large LP bases (send-one route exists; no batch job).
- **Valuation refresh triggers** — re-value after a raise/tender.
- **Data-room view digest** — "who viewed your room" for founders.

### 5d. Platform-wide notifications — ✅ in-app shipped (2026-08-23)
**In-app notification engine built**: `notifications` table (idempotent per
`user_id + dedupe_key`), `lib/notifications/store.ts` + `deadlines.ts` scanner, the
`deadline-reminders` cron, `/api/notifications` + `/read` routes, and a **bell tray** in
the dashboard header (`components/shell/header-trays.tsx`). Deploy steps: run the migration
and set `CRON_SECRET`.
Still to do: an **email** channel for notifications (in-app only today), and wider event
coverage beyond fund deadlines.

### 5e. Carta-grade app shell (from `carta-parity-plan.md`)
- **Entity switcher** (multi-entity) — the org/membership spine already exists.
- **⌘K command palette**.
- Shared **DataTable + metric-tile + task-pipeline** component kit; align remaining pages to the Carta UI standard.

---

## 6. Agent-tool layer (new — this session's branch)

47 tools total, persona-scoped by preset. Notable additions on
`feat/agent-tooling-expansion`:
- **Data-room refinery**: `dataroom_ingest/_reconcile/_normalize/_statements/_questions/_package`.
- **Outreach**: `send_outreach` (dry-run + confirm gate), `outreach_sequence`, `followup_sweep`.
- **Modeling/fund-ops**: `model_vesting`, `model_409a`, `model_waterfall`,
  `draft_capital_call`, `ic_memo`, `portfolio_kpi_rollup`, `lp_capital_account`.
- **Docs**: `export_investors`, `render_document_pro` (via the doc-worker).
- All output carries the white-paper house style (`lib/branding/doc-theme.ts`).

---

## 7. Operational / deploy (config, not code)

- **Doc-worker**: deploy `services/doc-worker/` (tectonic + LibreOffice); set
  `DOC_WORKER_URL` + `DOC_WORKER_TOKEN` on the app to light up `render_document_pro`.
- **Stripe**: add the **webhook secret** + billing env on Vercel (test-mode connected).
- **Resend**: `RESEND_API_KEY` per environment for `send_outreach` + notices.
- **Tables**: ensure outreach/fund/portfolio tables are provisioned in the target DB.
- **Auth**: prod is Supabase Auth, invite-only signup (`lib/auth/*`).

---

## 8. Corrections vs. the 2026-08-15 audit (staleness)

| Prior claim | Current reality |
|---|---|
| "Decommission the entire `/dashboard/admin/*` tree" | **Reversed** — it's a live, owner-gated Owner Console; only 3 cards are "Coming soon". |
| 409A "OPM computation not built" | **Built + wired** (`valuation-409a` → `opm-409a`); also an agent tool. |
| Share Plans "vesting engine not built" | **Built + wired** (`share-plans` imports `vesting` 15×). |
| Loan Ops "amortization engine not built" | **Built + wired** (`loan-servicing` → `loan-amortization`). |
| KYC "screening engine not built" | Engine + `opensanctions` **wired**; still needs a live data provider. |
| SPVs "servicing/close not built" | `spv-lifecycle`/`-economics`/`-portal` **wired** across 10 pages/routes. |

---

## 9. Recommended sequence

1. ~~**Notifications + deadline reminders** (§5d, §5c)~~ — ✅ **DONE (2026-08-23)**: in-app
   engine + bell + fund-deadline cron. Next increment: an email channel + company-scoped reminders.
2. ~~**Finish the 3 admin cards** (§5a)~~ — ✅ **DONE (2026-08-23)**: Users & roles built;
   audit + billing were already built and are now un-stubbed.
3. ~~**K-1 generation + KYC live provider** (§5b)~~ — ✅ **DONE (2026-08-23)**: per-LP K-1
   engine + generation; KYC was already live (OpenSanctions), added operator visibility.
4. **Carta shell** (§5e) — entity switcher + ⌘K + table kit for the "one app" feel. ← **next**
5. **Contract AI + equity filings + Monte-Carlo** (§5b) — larger, later.

_Progress log: 2026-08-23 — admin console, in-app notifications, and K-1 generation + KYC
visibility shipped (branches `feat/admin-users-console`, `feat/notifications-deadlines`,
`feat/k1-generation`)._

_Operational deploy items (§7) can proceed in parallel; none are blocked on code._
