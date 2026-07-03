# Anker Fund Operations — system design

VC fund + venture-studio management accounting and operations: deal pipeline
evaluation through commitment, syndication, fund accounting, and studio ops —
designed as one interconnected system, compared against what the platform
ships today.

Written July 2026 against the `v0/345668-9c5fb9de` branch.

---

## 1. What exists today (inventory)

The platform already has a real fund-of-record spine. This design does not
replace it — it fills the holes between the pieces and connects them.

| Area | Module(s) | State |
| --- | --- | --- |
| Fund entity + LP register | `lib/portfolio/funds.ts`, `fund_lps` table | **Live.** Commitments, called/distributed amounts, ownership %, LP types, transfers. |
| Capital calls | `lib/portfolio/capital-calls.ts` | **Live.** Draft→sent→settled lifecycle, per-LP line items pro-rated on commitment, AI-drafted notices, paid cascade into `fund_lps.called_amount`. |
| Distributions | `lib/portfolio/distributions.ts` | **Live.** Mirror of calls; pro-rata on ownership; *waterfall computed off-platform* — the GP enters a net amount. |
| Capital account statements | `lib/portfolio/capital-account.ts` | **Live.** Per-LP transaction history, running balances, DPI. TVPI/RVPI only if a NAV number is passed in manually — **no NAV of record**. |
| Portfolio companies + KPIs | `lib/portfolio/queries.ts` | **Live.** Company registry, monthly KPI snapshots (manual / founder form / xlsx / API). Flat `total_invested_amount` — no per-round positions. |
| LP quarterly reports | `lib/portfolio/lp-quarterly-report.ts` | **Live.** AI letter over a frozen KPI snapshot. |
| Fund assessment | `fund-assessment*.ts` | **Live.** Six-lens scoring, AI generation, history. |
| Legal formation | `legal*.ts` (24-doc catalogue, fields, review, credits) | **Live.** Formation docs, 94-field taxonomy, submit-for-review with edit-lock + counsel email. |
| LP data rooms / documents | `data-room.ts`, documents routes | **Live.** LP-scoped access. |
| Deal pipeline | `deals` table + `/dashboard/pipeline` | **Thin.** Founder-CRM-shaped: prospect→contacted→meeting→DD→term-sheet→closed, one investor per row, an amount, notes. No evaluation, no IC, no allocation, no link to the fund of record. |
| Fund models | `lib/tools/vc-fund-model.ts`, `venture-studio-model.ts`, `fund-of-funds.ts` | **Live but disconnected.** Standalone calculators; not fed by actual fund data. |
| Syndication / SPVs | — | **Absent.** |
| Fund accounting (GL, fees, expenses, NAV) | — | **Absent.** No journal, no chart of accounts, no management-fee accrual, no valuations. |
| Management company / studio ops | — | **Absent** as an operational module (exists only as a forecast calculator). |

Grep-verified absences: no `nav_snapshot`, `valuation_event`, `fair_value`,
`journal_entr`, `chart_of_accounts`, `spv`, `syndicat`, `ic_vote`, or
`deal_memo` anywhere in `lib/`, `app/`, or `scripts/`.

---

## 2. Design principles

1. **One spine: the investment transaction.** Every module reads/writes the
   same `investments` ledger (fund → security → company). Pipeline produces
   them, accounting values them, waterfalls distribute them, reports render
   them. Today the platform jumps from "deal closed" to "company in
   portfolio" with no transaction in between — that's the core missing link.
2. **Events, not mutable balances.** `fund_lps.called_amount` today is an
   incremented counter. Keep it as a materialized convenience, but derive it
   from immutable line items (already true for calls/distributions — extend
   the same pattern to valuations and fees).
3. **The calculators become the planning layer.** VC Fund Model / Studio
   Model / FoF tools already encode pacing, reserves, and waterfall math.
   Wire them to read actuals from the fund of record so every fund gets
   *plan vs. actual* for free.
4. **Syndication is a first-class vehicle, not a special case.** An SPV is a
   fund with one deal and its own LP register. Model it that way and every
   existing module (calls, distributions, statements, data rooms) works on
   SPVs unchanged.
5. **AI where the platform already uses it.** Deal memos, IC summaries, and
   valuation narratives follow the exact pattern of capital-call notices and
   LP letters (Qwen deep tier, frozen context snapshot).

---

## 3. Domain model

New tables in **bold**; existing tables plain.

```
funds ──────────────┬── fund_lps (register)
  │ vehicle_kind:   │      └── **lp_commitment_events** (pipeline→soft→signed→funded)
  │ fund | spv |    ├── capital_calls ── call_line_items
  │ studio_fund     ├── distributions ── distribution_line_items
  │                 ├── **valuation_snapshots** (per position, per date)
  │                 ├── **fee_schedules** + **fee_accruals**
  │                 ├── **journal_entries** ── **journal_lines** (chart_of_accounts)
  │                 └── **waterfall_runs** (deterministic carry calc)
  │
  ├── **deal_opportunities** (GP deal flow)
  │      ├── **deal_evaluations** (scorecards, weighted criteria)
  │      ├── **deal_memos** (AI-drafted, frozen context)
  │      ├── **ic_meetings** ── **ic_votes**
  │      ├── **term_grids** (proposed terms, versions)
  │      └── **allocations** (fund/SPV/co-investor split for one deal)
  │
  ├── **investments** (the spine: fund × company × security)
  │      ├── security_type, round, cost, share_count, fully_diluted_pct
  │      └── valuation_snapshots (FK)
  │
  ├── portfolio_companies ── portfolio_kpis_monthly
  │
  ├── **syndicates** (deal-scoped vehicle: an spv-kind fund + syndicate meta)
  │      ├── **syndicate_partners** (co-invest network, track record)
  │      └── carry_pct / mgmt_fee / platform_fee per deal
  │
  └── **management_company**
         ├── **mc_budget_lines** (plan) + **mc_actuals** (spend)
         ├── fee income ← fee_accruals (auto)
         └── **studio_projects** (venture-studio NewCos pre-spinout)
                └── graduates → portfolio_companies + investments
```

### 3.1 Deal pipeline → commitment (GP deal flow)

Replaces the founder-CRM `deals` shape for GP mode (the founder pipeline
stays as is — different persona).

Stages (enforced state machine, timestamps on every transition):

```
sourced → screened → deep_dive → ic_scheduled → ic_approved
        → term_sheet → committed → closed → (portfolio) | passed (any stage)
```

- **Screening**: weighted scorecard (`deal_evaluations`) — thesis fit,
  team, market, traction, valuation sanity. Criteria configurable per fund;
  reuses the six-lens UI pattern from fund assessment.
- **Deep dive**: DD checklist (documents wired to the existing data-room
  module), KPI request form (reuses founder_form KPI source), AI deal memo
  (`deal_memos`) with frozen context — same freeze pattern as
  `lp_quarterly_reports.kpis_snapshot`.
- **IC**: `ic_meetings` with agenda of deals; `ic_votes` per member
  (approve / approve-with-conditions / decline + notes). Quorum + threshold
  config per fund. Vote record is the audit trail.
- **Term grid**: versioned proposed terms (valuation, round size, security,
  pro-rata, board). On acceptance, feeds the Term Sheet Analyzer tool for
  red-flag scoring — tool already exists, becomes a step instead of a toy.
- **Commitment**: `allocations` row splits the ticket across vehicles:
  main fund $X (checked against **reserve policy** — see 3.4), SPV $Y,
  named co-investors $Z. Commitment ≠ closed: wire/closing checklist with
  condition tracking.
- **Close**: one action creates `investments` (per vehicle), creates/links
  `portfolio_companies`, seeds the first `valuation_snapshot` at cost, and
  books the journal entry (see 3.3). This is the moment pipeline data
  becomes fund-of-record data — atomic, no re-keying.

### 3.2 Syndication

- `syndicates` = deal-scoped vehicle. Implementation: a `funds` row with
  `vehicle_kind='spv'` + a syndicate metadata row (carry to lead, platform
  fee, minimum ticket, close date). **Calls, distributions, statements,
  and data rooms work unchanged** because an SPV is a fund.
- `syndicate_partners`: the GP's co-invest network — who they've syndicated
  with, response rate, average ticket, sectors. This deliberately reuses the
  investor/LP matchmaking engine: "which of my co-investors fit this deal"
  is the same scoring problem as LP matching, with deal attributes instead
  of fund attributes.
- LP-side commitments to an SPV run through `lp_commitment_events`
  (invited → viewed → soft-committed → docs-out → signed → funded), which
  also upgrades the main fund's raise pipeline (today only
  `lp_pipeline_events` exists on the LP-matching side; this unifies them).
- Outreach integration: inviting co-investors to a deal drops them into the
  existing outreach campaign engine with a deal-specific template + the
  SPV data room link.

### 3.3 Fund accounting (management accounting core)

Minimum viable fund GL — not a general accounting system, a **fund** one:

- `chart_of_accounts`: fixed venture chart (~30 accounts): capital
  contributions, investments at cost, unrealized gain/loss, realized
  gain/loss, management fees, fund expenses (audit/legal/admin), carry,
  distributions payable, cash.
- `journal_entries` + `journal_lines`: double-entry, **auto-booked by the
  modules that already know the event**:
  - call line paid → DR cash / CR contributed capital
  - close investment → DR investment at cost / CR cash
  - valuation snapshot → DR/CR unrealized gain / investment FV adjustment
  - distribution paid → realized gain recognition + CR cash
  - fee accrual (quarterly) → DR mgmt fee expense / CR due-to-manager
  Manual entries allowed but rare. Trial balance and a simple fund P&L /
  balance sheet render from the journal.
- `fee_schedules`: per fund — fee %, base (committed / invested / NAV),
  step-downs, waivers. `fee_accruals` generated quarterly; payment of an
  accrual is *income on the management-company side* (one event, two books).
- `valuation_snapshots`: per investment, per date, with method
  (cost / last-round / mark / write-down), source (round event, manual,
  409A), and note. Fund NAV = Σ position FV + cash − liabilities, becomes
  the number `capital-account.ts` is currently begging for
  (`currentNav` parameter) — TVPI/RVPI/IRR per LP finally computed from
  the record, not hand-fed.
- `waterfall_runs`: deterministic European/deal-by-deal waterfall over the
  journal + LP register (hurdle, catch-up, carry %). Output: per-LP gross →
  net lines that **pre-fill a distribution draft** instead of the GP
  computing net externally. The exit-waterfall tool's math is the starting
  point; it graduates from calculator to engine.

### 3.4 Planning ↔ actuals (the calculators grow up)

- Fund model tool reads the fund of record: pacing plan vs. actual
  deployment, reserve policy vs. actual follow-on usage, projected vs.
  actual J-curve. Reserve check at allocation time (3.1) uses this.
- Studio model ↔ `management_company` + `studio_projects`: planned NewCos
  vs. launched, studio budget vs. `mc_actuals`, projected common-stock value
  vs. actual `investments` created at spinout.
- Budget module: `mc_budget_lines` (annual, by category — the OpEx
  Pro-Forma tool's categories) vs. `mc_actuals`; variance view; fee income
  auto-populated from `fee_accruals`.

### 3.5 Studio operations

- `studio_projects`: idea → validation → build → spinout pipeline (same
  state-machine pattern as deals). Budget per project, EIR/team assignment,
  milestone gates.
- Spinout = the close action of 3.1 with the studio as founder: creates the
  company, books the fund's check as an `investments` row, records studio
  common % as a second (zero-cost) `investments` row. From then on it's a
  normal portfolio company — KPIs, reports, valuations all apply.

---

## 4. Interconnection map (why this is one system)

```
deal_opportunities ──close──▶ investments ◀──spinout── studio_projects
        │                        │    ▲
   allocations ──▶ syndicates    │    └── valuation_snapshots ──▶ NAV
        │              │         │                                │
        ▼              ▼         ▼                                ▼
  reserve check   fund_lps   journal_entries ◀── fee_accruals   TVPI/DPI/IRR
  (fund model)   (SPV = fund)     │                  │          per LP + fund
                                  ▼                  ▼               │
                            trial balance      mc_budget vs act      ▼
                                  │                            capital-account
                                  ▼                            statements, LP
                           waterfall_runs ──▶ distribution     quarterly report
                                               drafts
```

Every arrow is an existing module boundary or a single new function — no
module needs to know more than its neighbours.

---

## 5. Current platform vs. designed system

| Capability | Today | Designed |
| --- | --- | --- |
| Deal flow stages | CRM statuses, no gates | State machine with scorecards, DD checklist, IC votes, term grid |
| Deal evaluation | None (AI matching is for *finding* investors/LPs, not judging deals) | Weighted scorecards + AI deal memo with frozen context |
| IC / governance | None | Meetings, votes, quorum, audit trail |
| Commitment → close | Manual re-keying into portfolio | Atomic close: investments + company + first valuation + journal entry |
| Positions | Flat `total_invested_amount` per company | Per-round `investments` with security, cost, share count, FD% |
| NAV / valuations | Manual number passed to statements | `valuation_snapshots` of record; NAV, TVPI/RVPI/IRR computed |
| Fund accounting | None | Venture chart of accounts, auto-booked double-entry, trial balance, fund P&L/BS |
| Management fees | Legal terms only (fields taxonomy) | Fee schedules → quarterly accruals → journal + MC income |
| Waterfall / carry | Off-platform; GP enters net | `waterfall_runs` pre-fill distribution drafts |
| Capital calls / distributions | Full lifecycle ✓ | Unchanged; gains journal auto-booking |
| LP statements / reports | Live ✓ (DPI only) | Same modules, now with NAV-driven TVPI/RVPI/IRR |
| Syndication / SPVs | Absent | SPV-as-fund + syndicate partners + co-investor matching + outreach hooks |
| LP raise pipeline | `lp_pipeline_events` (matching side only) | Unified `lp_commitment_events` for funds and SPVs |
| Studio ops | Forecast calculator only | `studio_projects` pipeline + budget + spinout into fund of record |
| Mgmt-co accounting | Absent | Budget vs. actuals, fee income auto-fed |
| Plan vs. actual | Calculators disconnected | Fund/studio models read the record; reserve checks at allocation |

---

## 6. Build order (each phase ships alone)

1. **Investments spine + valuations.** `investments`,
   `valuation_snapshots`, NAV rollup; wire `capital-account.ts` metrics and
   the fund detail page. *Unlocks everything else; smallest schema risk.*
2. **Deal pipeline v2.** `deal_opportunities` + scorecards + AI memo + IC
   votes + term grid; close action writes the spine. GP pipeline page.
3. **Fund GL.** Chart of accounts, journal auto-booking from existing
   call/distribution cascades + valuations, trial balance + fund P&L view.
4. **Fees + waterfall.** `fee_schedules`/`fee_accruals`; `waterfall_runs`
   pre-filling distribution drafts (port exit-waterfall math).
5. **Syndication.** `vehicle_kind='spv'`, syndicate meta + partners,
   co-investor matching reuse, `lp_commitment_events`, outreach hook.
6. **Management company + studio.** Budget vs. actuals, fee income feed,
   `studio_projects` with spinout close.
7. **Plan vs. actual.** Fund/studio model tools read the record; reserve
   check on allocation; variance dashboards.

Phases 1–3 are the accounting core; 2 can run in parallel with 3.
Everything reuses established platform patterns: state-machine lifecycles
(calls), line-item cascades (calls/distributions), frozen AI context
(LP reports), taxonomy-driven UIs (assessment/legal), schema-drift guards
(legal-reviews).
