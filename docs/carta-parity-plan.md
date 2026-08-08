# Carta-Parity — Platform, Website & Onboarding Plan

**Status:** proposal / gap analysis
**Source:** Carta screenshots supplied 2026-08-08 (login, marketing site, in-app product demo)
**Goal:** engineer Carta's features, workflows, and design language into the Anker **platform** and **website**, and redesign the **onboarding** to match.

> Scope is large and spans 3 surfaces. This doc is the map; we pick a slice to build after prioritization (§8).

---

## 1. What the screenshots show

**Marketing site (carta.com)**
- Split **login**: left black promo panel with a **serif display** headline ("Automation, precision, and insight…") + a radial "plug into cap-table automation" diagram (CRM · Cap Table · Investors nodes, orange on black); right clean white email/passkey login.
- **Serif-led** editorial hero bands ("Streamline your fund operations", "Raise, return, repeat", "Meet the new standard") with a `Get started` + `View pricing & plans`.
- **Persona/product mega-nav & footer**: *CARTA FOR* (Private Equity, Venture Capital, Private Corporations, Private Credit, Fund of Funds) × *PRODUCTS* (Equity Suite, Fund ERP, Carta Law) — mono uppercase headers, orange square bullets.
- **Related resources** cards on a dotted grid (ARTICLE pills, serif titles, orange arrow squares).
- **Testimonials**: "Trusted with over 9k funds and SPVs", logo wall, quote cards with headshot + orange quote-mark + mono name/title.
- **Tabbed product-feature** module (FUND ADMIN / SPVS / FUND FORECASTING / FUND TAX) with a live "metrics card" (Vintage, Fund size, Capital contributions, Net IRR, TVPI…).

**In-app product**
- **Left nav**: Dashboard · Entities · Investments · Partners · Tax · MORE (Reports & Documents, Tools & Services, Resources, Firm Settings, Add-ons) + **⌘K "Navigate to"**; top bar Tasks · Downloads · Refer a friend · user menu; **entity switcher** ("Switch Entity / Choose Entity").
- **Dashboard**: "Hi, Paul. 9 items in progress", **Quick Start** (Initiate a payment · Call capital · New investment), **My To-Dos / Pending Carta / All Active / History** task list with entities, due dates (red = overdue), assignees.
- **Workflow pipeline** (2024 Taxes): horizontal **stages** (Collecting Data → Year-end Finalization → Preparing Return → Share & File) with entity counts; **expandable entity rows** revealing sub-steps (Entity information · Investments · Limited Partners → Complete/Incomplete), assignee, Review-entity action.
- **Data-dense tables** everywhere with **View · Filter · Columns · As-of date · Export**, sortable columns, expandable rows, **totals footer**:
  - **Partners** (Commitment, Amount, Total Value, NAV, Called/Paid/Prepaid Capital, DPI, RVPI, TVPI).
  - **Investments** — Schedule of Investments / Deal IRR, summary tiles (Active investments, Cost, Value, Unrealized gain), ownership %.
  - **Entities** — Funds & SPVs with **fund families** (nested), Vintage, Size, Cash, Invested, Deal IRR, TVPI, DPI, RVPI.
  - **Accounting** — Bank feeds / Trial balance / Journals / Financial reporting / Balance sheet / Statement of ops / Cash flows.
- **Cap table** (Capitalization): fully-diluted shares / amount raised tiles, stakeholder ownership table (Outstanding, Fully-diluted, ownership %), **Financing history** (round, closing date, cash raised, issue price, post-money), **Scenario modeling** tab, round badges (CS / PB / PA).

---

## 2. Carta's design language (two modes)

| | Marketing | In-app |
|---|---|---|
| **Type** | **Serif display** (transitional, high-contrast) for headlines + clean sans body | Clean sans throughout; **mono uppercase** micro-labels |
| **Color** | Black / white / **signature orange** accent; dark hero bands | White surfaces, hairline borders, orange for primary actions & positive deltas; red for overdue/negative |
| **Texture** | Dotted grids, orange square bullets, dashed arcs | Dense but airy tables, generous row height, subtle zebra/hover |
| **Components** | Editorial cards, logo wall, quote cards, tabbed feature blocks | Entity switcher, ⌘K, stage pipelines, filter/column/as-of toolbars, metric tiles, expandable rows, totals footers |

**Implication for Anker:** the Newsroom style we just shipped is already close to Carta's *marketing* mode (mono labels, hairline rules, editorial cards) — we'd add a **serif display** option for hero headlines. The *app* mode is a **data-table + workflow** system Anker partially has and should standardize.

---

## 3. App feature parity — gap analysis

Legend: ✅ exists · 🟡 partial · ⬜ missing. (Anker pages from the current dashboard.)

| Carta capability | Anker today | Status | Action |
|---|---|---|---|
| Fund entities list + **fund families** | `/dashboard/portfolio/fund`, `/portfolio` | 🟡 | Add nested families, Vtg/Size/IRR/TVPI/DPI/RVPI columns, firm-level export |
| **Entity switcher** (multi-entity) | active-org (Phase 1, memberships) | 🟡 | Build switcher in top bar (ties to §1 of persona plan) |
| **Dashboard** with Quick Start + to-dos | `/dashboard` | 🟡 | Add Quick-Start actions + unified **task/to-do** feed |
| **Workflow pipelines** (stages, sub-steps, assignees, overdue) | `/dashboard/portfolio/fund/legal/review`, deals stages | 🟡 | Build a reusable **stage-pipeline + task** engine (Tax/Close/Onboarding reuse it) |
| **Partners / LP** table (commitments, NAV, DPI…) | `/portfolio/fund/lps`, `/matchmaking`, ledger | 🟡 | Standardize the LP table (columns, as-of, totals, export) |
| **Investments** (schedule, Deal IRR, ownership) | `/portfolio/fund/investments`, `/deals` | 🟡 | Add summary tiles + Deal IRR + ownership %, filters |
| **Cap table** (fully-diluted, financing history, **scenario modeling**) | `/dashboard/cap-table` | 🟡 | Add financing history, ownership %, scenario modeling, round badges |
| **Accounting / Journals / financial statements** | `/portfolio/fund/ledger`, `/economics` | 🟡 | Add journals, trial balance, balance sheet, statement of ops/cash flows |
| **Fund forecasting** | `/tools/vc-fund-model`, `/vc-performance` | 🟡 | Surface as a fund module, not just a calculator |
| **Fund Tax / SPVs** | — | ⬜ | New modules (Carta Fund ERP parity) |
| **KYC/AML**, capital calls, distributions | `/portfolio/fund/distributions`, `/calls` | 🟡 | Add KYC-lite (ties to §8 of persona plan), payments/"call capital" |
| **⌘K navigate** | — | ⬜ | Global command palette |
| **Docs & reports center, e-sign** | `/data-room`, `/documents`, legal docs | 🟡 | Consolidate a Reports & Documents hub |

**Cross-cutting building blocks (the real leverage):**
1. **DataTable kit** — a shared table with View/Filter/Columns/As-of/Export, sort, expandable rows, totals footer, sticky header. Powers Partners, Investments, Entities, Journals.
2. **Stage-pipeline + Task engine** — stages, per-entity progress, assignees, due/overdue, sub-steps. Powers Tax, closings, onboarding, deal flow.
3. **Metric tiles** — IRR/TVPI/DPI/RVPI/NAV/called-paid, positive/negative deltas.
4. **Entity switcher + ⌘K** — multi-entity nav (builds on the memberships/active-org foundation from Phase 0/1).
5. **Quick-Start action bar** on the dashboard.

---

## 4. Website redesign (carta.com-inspired)

Anker already has `/`, `/platform`, `/pricing`, `/newsroom`, `/apply`, `/contact`, nav + footer.

- **Serif display hero** option (add a serif face to the type system) for landing/section headlines; keep DM Sans/JetBrains for body/labels.
- **Persona/product mega-menu + footer**: "Anker for Founders / VCs / LPs" × products (Discover, Deal Flow, Fund OS, Cap Table, Outreach, Newsroom) — mono headers, accent square bullets.
- **Tabbed product-feature** section with a live metric card (reuse the app metric tiles).
- **Related resources** cards (pull from Newsroom) on a dotted grid.
- **Testimonials / logo wall** ("Trusted by N funds & founders").
- **Split login** treatment (promo panel + clean form) — optional.

---

## 5. Onboarding redesign

We currently ship the **Newsroom** style (editorial, tokens, vermilion/cobalt). Carta's onboarding-equivalent is its clean **app** style + serif accents. Options:
- **A — keep Newsroom, add serif headlines** (small change; aligns onboarding with a Carta-serif website).
- **B — restyle onboarding to the app "clean data" mode** (matches the in-app Carta feel the wizard leads into).
- **C — hybrid** (serif hero on Step 0 chooser; clean app-style wizard steps). *(Recommended.)*

*(Awaiting the cut-off end of your message — "redesigning the ui of the onboarding and …" — to pin this.)*

---

## 6. What already exists to build on

Phase 0 (just shipped) gives us **`users.user_type`/persona, `is_owner` owner tier, `organizations` + `memberships`** — the entity/multi-entity spine Carta's entity-switcher, fund-families, and per-entity tasks all need. The persona-onboarding doc (§3.1, §14) already specs org/fund linking and data scoping this plan depends on.

---

## 7. Design tokens to add

- **Serif display** face (e.g., a high-contrast transitional serif) as `--font-serif-display`, used only for marketing/hero + optional Step-0.
- Keep the **accent**: Carta orange ≈ our vermilion `#e5380f` already in use — unify as the brand accent; cobalt stays the secondary/VC accent.
- Semantic: **overdue/negative = red**, **positive delta = green/accent**, mono uppercase micro-labels (already in Newsroom).

---

## 8. Suggested phasing (pick where to start)

| # | Slice | Why first |
|---|---|---|
| **A** | **DataTable + Metric-tile kit** | Unlocks Partners/Investments/Entities/Journals at once; highest leverage |
| **B** | **Entity switcher + ⌘K + Dashboard Quick-Start** | The Carta "shell" feel; builds on Phase 0 memberships |
| **C** | **Stage-pipeline + Task engine** | Powers Tax/closings/onboarding/deal-flow workflows |
| **D** | **Website** serif hero + persona/product mega-nav + resources/testimonials |
| **E** | **Onboarding** restyle (A/B/C from §5) |
| **F** | **Cap table** upgrade (financing history, scenario modeling) |
| **G** | New modules: **Fund Tax, SPVs, Accounting/Journals, KYC/AML** |

---

### TL;DR
Carta = **serif-editorial marketing** + **clean data-dense app** (entity switcher, ⌘K, stage pipelines, filterable tables with as-of/export/totals, metric tiles, cap table + scenario modeling). Anker already has ~70% of the *modules* (portfolio/fund/*, deals, cap-table, ledger) but needs (1) a **shared DataTable + metric-tile + task-pipeline kit**, (2) the **entity-switcher/⌘K shell**, and (3) a **serif-accented website**. Onboarding gets a serif hero + clean-app wizard (hybrid). Everything rides the Phase 0 org/membership spine.
