# Anker — Persona Workflow Analysis

_Generated 2026-08-14. Audit of every persona-facing page: what it does, its implementation state, link correctness, and the advertised features still needed to make each persona's workflow whole._

## How to read this

**Status legend**

| Status | Meaning |
|---|---|
| ✅ **Complete** | Substantial implementation, wired to real data, reachable from nav. |
| 🟡 **Partial** | Works but shallow, missing advertised depth, or missing write-back/actions. |
| 🔀 **Redirect** | Intentional stub that redirects to the canonical route (not broken). |
| 🔗 **Mislinked** | Reachable, but the nav/entry point sends the wrong persona there, or points at the wrong surface. |
| ⛔ **Missing** | Advertised for the persona but not built. |

**Method.** Enumerated all 120 `app/dashboard/**/page.tsx` routes, measured the LOC of the client component each delegates to, traced data wiring, checked redirects, and cross-referenced the persona nav map (`components/tesseract/dashboard-sidebar.tsx`) against the marketing promises on `app/solutions/{founders,vcs,lps}` and `app/products/*`.

---

## 0. Persona access model (as shipped)

Personas live on the workspace membership (`memberships.persona ∈ founder | vc | lp`). The dashboard layout resolves the active persona and the sidebar filters nav groups/items by it. **Owners and members with a `null` persona see the full, unfiltered nav** (backward-compatible).

| Nav group | Founder | VC / GP | LP | Shared |
|---|:--:|:--:|:--:|:--:|
| Overview (Dashboard, ANKER AI) | ● | ● | ● | ● |
| AI Assistant | ● | ● | | |
| Source & match | ● | ● | | |
| Relationships | ● | ● | | |
| Fund back-office | | ● | (perf only) | |
| Investor room | | | ● | |
| Studio (Decks/Docs/Newsroom) | ● | ● | Docs+News | ● |
| Toolbox | ● | ● | | |

---

## 1. Founder workflow

**Job to be done:** define the raise → find & match investors → warm intros → outreach → track pipeline → model the deal.

| Page | Route | Status | Notes |
|---|---|:--:|---|
| Dashboard | `/dashboard` | ✅ | QuickStart (founder actions) + Spotlight + My To-Dos feed, persona-aware. |
| Discover | `/dashboard/discover` | ✅ | 1,315 LOC; 60k+ investor DB, filters, admin badge. Functional toolbar header (kept intentionally). |
| Find Investors | `/dashboard/find-investors` | ✅ | 1,066 LOC; deck → AI extraction → firm/partner ranking. |
| Network | `/dashboard/network` | ✅ | 614 LOC LinkedIn relationship graph + warm-intro paths. |
| CRM | `/dashboard/crm` | ✅ | 623 LOC Attio-style boards, tasks, funnel KPIs. |
| Outreach | `/dashboard/outreach` | ✅ | 324 LOC campaigns/inbox/analytics + studio. |
| Send Center | `/dashboard/send-center` | 🟡 | Admin-shell wrapper (outbox/replies/deliverability); thin vs. a founder-owned send view. |
| Cap Table | `/dashboard/cap-table` | ✅ | 520 LOC dilution modeling, Carta header. |
| Runway | `/dashboard/runway` | ✅ | 520 LOC burn/scenarios. |
| Term Sheet | `/dashboard/term-sheet` | ✅ | 526 LOC red-flag analyzer. |
| Tools | `/dashboard/tools` | ✅ | 14 native calculators (xlsx export). |
| Pitch deck / Documents / Decks | various | ✅ | Deck upload, data room, Figma-templated decks. |

**Founder gaps (advertised → status)**
- "Fundraise pipeline" (solutions/founders) — founders are routed to the **GP deal board** semantics via CRM; there is no dedicated founder-side raise pipeline (round stages: Building list → Contacted → In DD → Term sheet → Closed). 🟡 partial.
- **Data room _send/track_** for founders (who viewed the deck) — not surfaced. ⛔.

---

## 2. VC / GP workflow

**Job to be done:** set mandate → source deal flow → run IC → operate the fund back-office → report to LPs → stay compliant.

| Page | Route | Status | Notes |
|---|---|:--:|---|
| Deal Flow | `/dashboard/portfolio/fund/deals` | ✅ | Sourcing→IC→close board + public `/pitch` submissions land here. |
| LP Matchmaking | `/dashboard/matchmaking` | ✅ | 818 LOC six-dimension scoring, AI rationales. |
| Imports | `/dashboard/imports` | ✅ | CSV/XLSX, enrichment, crawl, URL-check (admin-shell). |
| Founder Campaigns | `/dashboard/campaigns` | ✅ | 585 LOC public submissions → assess → match → outreach. |
| LP Campaign | `/dashboard/outreach/lp-campaign` | ✅ | Enrich · draft · export. |
| **Fund** | `/dashboard/portfolio/fund` | ✅ | Detail hub + tab bar. |
| Fund performance | `…/fund/performance` | ✅ | TVPI/DPI/RVPI/MOIC/Net IRR, fund-wide NAV. |
| Financial reporting | `…/fund/reports` | ✅ | **New** — quarterly-close workflow (Bank Txns → SOI → Internal → Your Review). |
| Data explorer | `…/fund/explorer` | ✅ | **New** — measure × dimension, bar/line/area/pie, CSV. |
| Tear sheet builder | `…/fund/tear-sheet` | ✅ | **New** — Template→Funds→Companies + paged per-company preview. |
| Capital calls | `…/fund/calls` + `…/calls/new` | ✅ | **New** — Carta capital-activity wizard (type → amounts → net breakdown → review w/ health checks, PDF/email prefs, notice preview, schedule). Writes real `capital_calls` + line items. |
| Distributions | `…/fund/distributions` | 🟡 | List + inline create + detail. No stepped "Initiate payment" wizard to match the capital-call one. |
| Investments | `…/fund/investments` | 🟡 | List + inline create. No polished "New investment" modal (Carta parity). |
| Partners (LPs) | `…/fund/partners` | ✅ | DataTable of LPs. |
| Economics / Ledger / Fees / Plan | `…/fund/*` | ✅ | Fund economics, ledger, plan-vs-actual. |
| Legal | `…/fund/legal/*` | ✅ | Canvas, catalogue, fields, doc editor, review. |
| Syndication / Management co. | `…/fund/*` | ✅ | SPV syndication, management company. |
| Compliance | `/dashboard/portfolio/compliance` | ✅ | Obligation register + filing-deadline badge in nav. |
| Portfolio | `/dashboard/portfolio` | ✅ | Companies + KPIs + update ingest. |
| LP reporting | `/dashboard/portfolio/reports` | ✅ | LP quarterly report list + detail generator. |
| Fund assessment | `…/fund/assessment` | ✅ | Assessment wheel + history. |

**VC gaps (advertised → status)**
- **"Initiate a payment" (distributions) wizard** — the Carta screenshots show a distribution flow paralleling capital calls; today it's an inline create. 🟡 → build a stepped distribution wizard reusing the capital-call scaffold.
- **"New investment" modal** — Carta's guided add-investment modal; today inline. 🟡.
- **Auto-generated notice _delivery_** — the capital-call wizard renders the notice preview but does not actually email/generate the PDF batch to LPs (no send job). 🟡.
- **Net Amount Breakdown → GL posting** — breakdown buckets are captured in the wizard UI but not persisted to the ledger. 🟡.

---

## 3. LP workflow  ← **biggest gaps**

**Job to be done:** get invited → see commitment/called/distributed → download statements & docs → track portfolio performance → acknowledge calls → stay informed.

### The core problem: two disconnected LP surfaces

There are **two** LP experiences that don't reference each other:

1. **`/lp` portal** (`components/lp/lp-dashboard-client.tsx`) — the _real_ LP home: per-fund summary (commitment / called / distributed) + scoped documents. **Read-only.** Self-notes it lacks write-back ("submit a sub doc, acknowledge a capital call — a separate flow we'll add later").
2. **Dashboard "Investor room"** nav (added in the persona work) — points LPs at **GP-oriented fund pages**.

| "Investor room" item | Points at | Problem |
|---|---|---|
| My capital account | `…/fund/performance` | 🔗 **Mislinked** — this is the **fund-wide GP performance** page (Fund NAV, fund TVPI), _not_ the LP's own capital account. |
| Distributions | `…/fund/distributions` | 🔗 **Mislinked** — GP distribution _management_ list, not the LP's received distributions. |
| Statements | `/dashboard/documents` | 🔗 **Mislinked** — GP data-room admin, not LP statements. |

Additionally: **`/lp` is not linked from the dashboard shell at all** — an LP who lands in `/dashboard` has no path to their actual portal.

### LP page inventory

| Surface | Route | Status | Notes |
|---|---|:--:|---|
| LP portal home | `/lp` | 🟡 | Real, but read-only; commitment/called/distributed + docs. No NAV/IRR, no per-quarter statement download surfaced distinctly, no actions. |
| LP token portal | `/portal/[token]` | ✅ | Tokenized external LP access (no login). |
| Per-LP statement | `…/fund/lps/[lpId]/statement` | ✅ | Exists, but lives under the **GP** fund tree (GP-generated), not exposed in the LP's own nav. |
| LP capital account (own) | — | ⛔ | No LP-scoped "my commitment / called / uncalled / NAV / IRR" view. Fund performance is fund-wide. |
| Distribution notices (received) | — | ⛔ | LP cannot see notices addressed to them. |
| Capital-call acknowledge / wire-confirm | — | ⛔ | Advertised interaction; not built. |
| Notifications | — | ⛔ | solutions/lps promises "Stay informed / Notifications"; none. |
| Portfolio analytics (LP view) | — | ⛔ | Promised; the analytics page is GP pipeline analytics. |

**LP gaps (advertised on solutions/lps → status):** Capital account 🔗/⛔ · Statements & documents 🟡 (docs yes, statements not LP-facing) · Portfolio analytics ⛔ · Notifications ⛔ · Self-serve access ✅ (`/portal/[token]`) · Secure by design ✅.

---

## 4. Shared / cross-persona

| Page | Route | Status | Notes |
|---|---|:--:|---|
| ANKER AI | `/dashboard/anker-ai` | ✅ | 506 LOC multi-model chatbot. |
| AI Assistant | `/dashboard/assistant` | ✅ | 350 LOC tool-running agent. `/dashboard/chat` 🔀 redirects here. |
| Newsroom (author) | `/dashboard/content` | ✅ | Write/AI-draft/publish to public `/newsroom`. |
| Settings / API keys / Extension | `/dashboard/settings/*` | ✅ | 1,216 LOC settings, key mgmt, LinkedIn extension tokens. |
| Help | `/dashboard/help` | ✅ | Support & docs. |
| Admin (owner/admin only) | `/dashboard/admin/*` | ✅/🟡 | Home is rich; ~15 sub-tools render via `admin-shell` (varying depth). |

**Intentional redirects (not broken):** `/dashboard/chat`→assistant · `/dashboard/pipeline`→deals · `…/legal/review`→legal/documents.

---

## 5. Link & IA issues (actionable)

| # | Issue | Severity |
|---|---|:--:|
| L1 | LP "Investor room" → `/fund/performance` shows **fund-wide GP** metrics, not the LP's capital account. | **P0** |
| L2 | LP "Distributions"/"Statements" point at **GP management** surfaces. | **P0** |
| L3 | `/lp` portal is **unreachable** from the dashboard shell (no nav link). | **P0** |
| L4 | Two parallel LP experiences (`/lp` vs dashboard "Investor room") with no reconciliation. | **P0** |
| L5 | VC "New investment" / "Initiate payment" quick actions land on **list pages**, not guided creation flows. | P1 |
| L6 | Founder has no dedicated raise-pipeline view (uses generic CRM). | P1 |

---

## 6. Prioritized recommendations

### P0 — LP workflow correctness (make the persona real)
1. **Reconcile the LP surface.** Decide: either (a) route the dashboard "Investor room" items into `/lp`-scoped views, or (b) fold `/lp` into the dashboard as LP-persona pages. Recommended: keep `/lp` as the canonical LP home and repoint "Investor room" → `/lp`, `/lp/statements`, `/lp/distributions`.
2. **Build LP-scoped capital account** — the LP's own commitment / called / uncalled / distributed / NAV / IRR (data already exists in `fund_lps` + line items; needs an LP-scoped read + page).
3. **Surface received distribution notices + capital-call acknowledgements** (write-back the `/lp` portal explicitly defers).
4. **Add `/lp` link to the shell** for LP persona (and a guard so LPs can't reach GP fund-management routes by URL).

### P1 — VC parity with Carta screenshots
5. **Distribution wizard** — stepped "Initiate payment" reusing the capital-call scaffold.
6. **New Investment modal** — guided add-investment (replace inline create).
7. **Notice delivery** — actually generate + email the capital-call PDF batch; persist Net Amount Breakdown to the ledger.

### P2 — Founder depth & polish
8. **Founder raise pipeline** — round-stage board distinct from GP deal flow.
9. **Deck send/track** — who-viewed analytics on the data room.
10. **Route-level persona guards** — currently personas scope the _nav_ only; add server guards so a persona can't reach another persona's pages by direct URL.

---

## 7. Coverage summary

| Persona | Complete | Partial | Missing/Mislinked | Verdict |
|---|:--:|:--:|:--:|---|
| **Founder** | 11 | 2 | 1 | Strong; polish raise-pipeline + deck tracking. |
| **VC / GP** | 22 | 4 | 0 | Very strong; close Carta parity on distributions/investments/notice delivery. |
| **LP** | 2 | 2 | 6 | **Weakest** — real portal exists but is disconnected and read-only; capital-account + notifications + acknowledgements needed. |
| **Shared** | 6 | 1 | 0 | Solid. |

**Bottom line:** the **VC/GP and Founder** workflows are essentially production-complete. The **LP workflow is the priority** — the pieces exist (`/lp`, statements, `fund_lps` data) but are wired to the wrong surfaces and lack write-back. Fixing L1–L4 and building the LP capital-account view would bring LP from ~25% to ~75% complete.
