# Anker — The AI Venture Operating System

### A Technical White Paper on the Architecture, Financial Engines, Quantitative Methods, and Workflows of the Anker Platform

**Version 1.0 · 2026-08 · an-ker.de**

---

> **A note on data integrity.** Every figure attributed to "the platform" in this
> paper is drawn from the live production database (Neon Postgres) at the time of
> writing, or from the source code. Where a number is a **target** rather than an
> achieved result, it is labelled *(target)*. Testimonial blocks are left as
> clearly-marked placeholders to be filled with verbatim, attributable quotes;
> no quotation in this paper should be treated as genuine until a named source
> has confirmed it in writing. Figures marked *[FIGURE]* indicate where a
> platform screenshot is to be inserted (asset path given); captions describe the
> exact view.

---

## Table of Contents

1. Abstract
2. Introduction & Market Position
3. System Architecture
4. Identity, Personas & Access Control
5. The Application Shell & Information Architecture
6. The Tier-1 Financial Engines
   - 6.1 The 409A / Option-Pricing-Model Valuation Engine
   - 6.2 The Loan-Servicing (Private-Credit) Engine
   - 6.3 The Share-Plans (Equity Vesting) Engine
7. Fund OS — Fund Administration & Performance Mathematics
8. The AI System — Model Router, Persona Agents & Tooling
9. Quantitative & Machine-Learning Methods
10. Core Workflows (Founder / VC / LP)
11. Billing, Credits & Metering
12. Security, Compliance & Auditability
13. Evaluation & Empirical Grounding
14. Practitioner Commentary (testimonial placeholders)
15. Roadmap
16. Appendix A — Formula Reference
17. Appendix B — Data Model & API Surface
18. Appendix C — README / Operator Guide

---

## 1. Abstract

Anker is a multi-persona **venture operating system**: a single web application
that a startup **founder** uses to raise a round, a **venture / fund general
partner (GP)** uses to source deals and run the back office, and a **limited
partner (LP)** uses to monitor their capital — each persona seeing a surface
scoped to their role but drawing on one shared data and intelligence layer.

Unlike a marketing site with a login, Anker embeds **institutional-grade
financial machinery** directly in the product: an option-pricing-model (OPM)
409A valuation engine, a private-credit loan-servicing engine with covenant
tracking, an equity share-plan engine with cliff-aware vesting, and a fund-
administration layer that computes the standard private-capital performance
metrics (TVPI, DPI, RVPI, MOIC, and money-weighted IRR) from a live ledger.
Around this sits an **AI layer** — a provider-agnostic model router feeding a
tool-calling agent that adapts into three distinct *persona copilots*, integrated
with the platform's own features — and a **semantic matching** subsystem over a
database of **47,275** investors and decision-makers.

This paper documents the system end-to-end: the architecture, the exact
mathematics behind each engine (with derivations), the machine-learning and
quantitative methods, the user workflows, and the security posture. It closes
with an honest empirical section grounded in the real production dataset.

---

## 2. Introduction & Market Position

### 2.1 The problem

The venture lifecycle is served by a patchwork of point tools: one product for
the cap table, another for the data room, a CRM for investor relationships, a
spreadsheet for the fund model, a separate portal for LP reporting, and nothing
that connects the founder raising capital to the investor deploying it. The data
that matters — who invests at what stage, what a company is worth, how a fund is
performing — is fragmented across these tools and across the boundary between the
two sides of the table.

Anker's thesis is that **the founder side and the fund side are the same graph**
— companies, investors, rounds, positions, and people — and that a single system
holding that graph can (a) remove the integration tax, and (b) apply intelligence
across the whole lifecycle rather than within a single silo.

*[FIGURE 1 — asset: `whitepaper-assets/fig01-home-light.png`]*
**Caption:** Anker marketing home in light mode. Editorial serif hero — *"Your
venture ready to build"* — over a generative particle field; primary CTAs
*Start Fundraising* / *See How It Works*; trust bar reading **40K+** HNWIs & LPs,
**50+** countries, **60K+** investors in database. Top navigation exposes
Products, Solutions, Resources, and Company menus.

### 2.2 Positioning

Anker positions itself honestly as **pre-seed-stage software building toward
Carta-class parity** across three suites:

| Suite | Audience | What it does |
|---|---|---|
| **Anker Founder Suite** | Founders | Find investors, model the round, share the data room |
| **Anker Fund OS** | VCs / GPs | Source deals, run fund admin, report to LPs |
| **Anker Investor Room** | LPs | Self-serve capital account, distributions, documents |

The three suites are not three products; they are three **views** of one graph,
selected by the viewer's *persona*. This is the organizing principle of the
entire system (§4).

*[FIGURE 2 — asset: `whitepaper-assets/fig02-products-megamenu.png`]*
**Caption:** The Products mega-menu on the marketing site. A left rail of suite
tabs (Founder Suite / Fund OS / Investor Room) drives a right panel of features
with one-line descriptions and a "Free for founders" feature card.

### 2.3 Scale of the underlying dataset

The investor-discovery surface is backed by a substantial real dataset — the
single largest asset in the system.

*[FIGURE 3 — asset: `whitepaper-assets/fig03-investor-database.png`]*
**Caption:** The public *Investor Database* page — *"Every active investor,
ranked for your round."* Headline stats: **18,000+** firms, **47,000+**
decision-makers, **84** geographies, **weekly** re-crawl/re-enrich. These are not
placeholder numbers: the production `investors` table holds **47,275** rows at
the time of writing.

---

## 3. System Architecture

### 3.1 Stack

Anker is a server-first **Next.js (App Router)** application written in
**TypeScript**, styled with **Tailwind CSS v4**, deployed on **Vercel**, and
backed by **Neon** (serverless Postgres). Authentication is delegated to
**Supabase Auth**. The package manager is **pnpm**. The AI layer is provider-
agnostic and routes across multiple LLM back-ends (§8).

```
┌──────────────────────────────────────────────────────────────┐
│                         Client (browser)                        │
│   React Server Components + Client Components (Tailwind v4)      │
└───────────────▲───────────────────────────────▲────────────────┘
                │  RSC payload / HTML             │  fetch (JSON)
┌───────────────┴───────────────────────────────┴────────────────┐
│                    Next.js App Router (Vercel)                   │
│   Server Components  │  Route Handlers (/api/*)  │  Middleware    │
│   ─ persona guards   │  ─ engines' REST surface  │  ─ auth        │
├─────────────────────────────────────────────────────────────────┤
│   lib/  — domain logic (pure math modules + DB-bound services)   │
│   ├─ modules/  opm-409a, loan-amortization, vesting, …           │
│   ├─ portfolio/ funds, investments, data-room, …                 │
│   ├─ ai/       model-router, embeddings, semantic-search, …      │
│   ├─ agents/   personas, outreach, portfolio-search, …           │
│   └─ billing/  stripe, billing, credit ledger                    │
├───────────────▲─────────────────────────────▲───────────────────┤
│   Supabase Auth │                Neon Postgres │  Stripe          │
│   (sessions)    │   (funds, investors, docs…)  │  (subscriptions) │
└─────────────────┴──────────────────────────────┴─────────────────┘
```

### 3.2 The pure-math / service split

A deliberate architectural decision underpins every financial engine: the
**mathematics is isolated in pure, dependency-free modules** (`lib/modules/*`)
that import no database driver. This yields three properties:

1. **Testability** — every formula can be exercised in isolation with known
   inputs and textbook expected outputs (see §6, §16).
2. **Isomorphic execution** — the identical function runs on the server (for
   authoritative computation and persistence) *and* in the browser client (for
   live "as-you-type" projections), guaranteeing the number the user sees while
   editing equals the number that gets stored.
3. **Auditability** — because the math never touches I/O, a reviewer can read a
   single file and verify a valuation or a vesting schedule without tracing
   through queries.

The **service layer** (`lib/portfolio/*`, `lib/modules/*-servicing.ts`) wraps the
pure math with persistence, scoping, and the *derived-value* discipline described
next.

### 3.3 The derived-value discipline

A recurring pattern: **quantities that can be computed are never hand-typed.**
A loan's outstanding balance is `principal − Σ principal_portion` over the
payment ledger; a grant's exercised total is `Σ quantity` over the exercise
ledger; a fund's called capital is the sum of capital-call line items. Each is
recomputed from its ledger after every mutation and cached in a column, rather
than being an independently-editable field that can drift from its constituents.
This eliminates an entire class of reconciliation bugs endemic to spreadsheet-
based fund and cap-table management.

---

## 4. Identity, Personas & Access Control

### 4.1 The persona model

Every navigable destination in Anker is tagged with the personas that may see it:
`personas: ["founder" | "vc" | "lp"]`. A signed-in user resolves to an **active
persona** via their workspace membership. A user with no membership, or a
**platform owner**, resolves to `null` — which the system treats as "sees
everything."

```ts
// app/dashboard/layout.tsx (paraphrased)
const owner   = isOwner(user.email)                       // top platform tier
const { active } = await resolveActiveMembership(user.id) // workspace membership
const persona = owner ? null : active?.persona ?? null    // null ⇒ unrestricted
```

### 4.2 Two platform tiers vs. workspace roles

Distinct from per-workspace roles, Anker has two **platform tiers**:

- **Owner** — top tier; full platform oversight (admin console, aggregate views,
  the "Pitch us" submissions inbox), but *firewalled from tenant private records*
  at the data-access layer by design.
- **Admin** — staff operators with access to `/dashboard/admin/*`.
  `owner ⊃ admin`.

Route protection is centralized in a server guard that **fails safe** and always
lets owners through:

```ts
export async function requirePersona(allowed: Persona[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  if (isOwner(user.email)) return                 // owner bypass
  const { active } = await resolveActiveMembership(user.id)
  const persona = active?.persona ?? null
  if (persona === null || allowed.includes(persona)) return
  redirect(persona === "lp" ? "/lp" : "/dashboard")
}
```

### 4.3 Registration & login

Registration is **invite-only and fails closed**: the sign-up route requires a
token matching a server-side `SIGNUP_INVITE_CODE` secret; if no code is
configured, *nobody* can register. Accounts are created through Supabase's admin
API with the email pre-confirmed (immediate sign-in, no confirmation email) and
mirrored into a Neon `profiles` row. Login uses Supabase password auth, returns a
deliberately generic *"Invalid email or password"* (no user enumeration), and —
following a security review documented in §12 — redirects only to **internal
paths**, closing a post-login open-redirect vector.

---

## 5. The Application Shell & Information Architecture

The in-app shell was rebuilt to be the *logged-in continuation of the marketing
site* rather than a different-feeling product. A single **navigation taxonomy**
(`lib/nav/taxonomy.ts`) is the source of truth for both the public site and the
app, so the two can never drift: the suite names, the wording, and the grouping
are identical on both sides of the login.

The redesigned shell provides:

- A **website-style top bar** with a persona-scoped **Products mega-menu** (suite
  highlights), primary links, and a persona switcher for owners.
- A **contextual left rail** carrying the full grouped destination set for the
  active suite — the density answer for GPs, who have ~28 destinations.
- A **command palette (⌘K)** that derives its entries from the same taxonomy,
  persona-scoped, searchable by description (typing *"vesting"* finds Share
  Plans, *"409a"* finds the valuation engine), making it the power-user spine.
- A **mobile** treatment: a bottom tab bar plus a full-screen sheet.

*[FIGURE 4 — asset: `whitepaper-assets/fig04-app-shell.png`]*
**Caption:** The in-app shell (Fund OS persona). Top bar with the outline brand
mark, Products/Relationships/AI, ⌘K search, theme toggle, and the user menu; the
contextual left rail lists the fund's ~28 destinations grouped under Source &
Match, Relationships, Fund OS, Fund Services, and Studio.

Page chrome follows the site's editorial system: **serif display titles**
(Fraunces), **mono uppercase eyebrows** with a small square accent bullet, and a
muted body — e.g. a page titled *"Fund administration, done right."*

---

## 6. The Tier-1 Financial Engines

Anker's differentiator is that these are **real engines**, not forms. Each ships
as a pure-math module verified against textbook results, a server service that
persists and scopes, a REST surface, and a detail UI that projects live.

### 6.1 The 409A / Option-Pricing-Model Valuation Engine

A 409A valuation sets the fair market value (FMV) of a company's **common** stock
— the basis for option strike prices — typically well below the preferred price
paid by investors, because common stock lacks the liquidation and other
preferences of preferred. Anker computes this with the **Option Pricing Model
(OPM)**, the market-standard back-solve method, treating each class of equity as
a **call option** on the company's total equity value.

#### 6.1.1 Black–Scholes as the primitive

The OPM prices equity claims as European call options on total equity value `S`
struck at each **breakpoint**. The Black–Scholes call price is

$$
C(S,K,\sigma,r,T) = S\,\Phi(d_1) - K e^{-rT}\,\Phi(d_2),
$$

$$
d_1 = \frac{\ln(S/K) + (r + \tfrac{1}{2}\sigma^2)T}{\sigma\sqrt{T}},
\qquad
d_2 = d_1 - \sigma\sqrt{T},
$$

where `S` = total equity value, `K` = strike (a breakpoint), `σ` = equity
volatility, `r` = risk-free rate, `T` = years to a liquidity event, and `Φ` is
the standard-normal CDF. Anker implements `Φ` with the **Abramowitz–Stegun**
rational approximation (max abs error ≈ 7.5·10⁻⁸), so no numerical library is
required and the module stays pure. A boundary property used as a unit test:
`C(S, 0) = S` and `C(0, K) = 0`.

#### 6.1.2 Two-class waterfall & breakpoints

With one round of preferred (liquidation preference `LP`, `p` = preferred %
ownership fully-diluted) and common, total equity value `W` is allocated across
**two breakpoints**:

- **[0, LP)** — only preferred participates (it takes its preference first).
- **[LP, CP)** — only common participates (preferred has been satisfied but has
  not yet converted).
- **[CP, ∞)** — pro-rata to all, where the **conversion point** `CP = LP / p` is
  the value at which preferred is indifferent between its preference and
  converting to common.

Each interval's value to a class is the difference of two Black–Scholes calls
struck at the interval's endpoints (a *call spread*), which is exactly how option
math partitions payoff regions. The **common** allocation is therefore

$$
V_{\text{common}}(W) = \big[C(W, LP) - C(W, CP)\big] \;+\; (1-p)\,C(W, CP).
$$

#### 6.1.3 The back-solve

The observed recent-round **preferred price** implies the market's view of total
equity value. Anker solves for the `W` such that the OPM-allocated value of
preferred equals `preferredShares × recentPrice`:

$$
\text{find } W \;\text{s.t.}\; V_{\text{preferred}}(W) = \text{prefShares}\times
\text{recentPrice},
$$

via **bisection** (robust, monotone objective, no derivative needed) to a tight
tolerance. The per-share common FMV is then `V_common(W*) / commonShares`,
optionally reduced by a **discount for lack of marketability (DLOM)**.

#### 6.1.4 Worked verification

For a company with **8,000,000** common and **2,000,000** preferred at a recent
preferred price of **$1.00** (σ = 0.6, r = 0.04, T = 4, DLOM off), the back-solve
recovers a total equity value at which preferred is worth exactly **$2,000,000**,
and the common FMV solves to **≈ $0.4441** — i.e. common is marked at ≈ **44%**
of the preferred price, the expected discount for a two-class structure at this
maturity. This is the module's canonical regression test.

> **Caveat (stated in the product's own methodology writeup):** the two-class OPM
> is appropriate for a single preferred series with a non-participating
> preference. Multi-series stacks, participating preferred, and safe-harbor
> reliance require a fuller waterfall and an independent appraisal.

*[FIGURE 5 — asset: `whitepaper-assets/fig05-409a-detail.png`]*
**Caption:** The 409A engine detail view — common FMV updates live as OPM inputs
are typed; a breakpoint-allocation table shows the value assigned to each class
across the [0, LP), [LP, CP), [CP, ∞) intervals; a methodology writeup and a
downloadable board-approval report round it out.

### 6.2 The Loan-Servicing (Private-Credit) Engine

For funds that extend venture debt or run credit strategies, Anker services loans
end-to-end: schedule generation, interest accrual, a payment ledger with an
interest-first split, and covenant tracking.

#### 6.2.1 Amortization

The engine supports four structures. For a fully-amortizing loan, the **level
payment** `A` on principal `P`, periodic rate `i = APR/f` (frequency `f`), over
`n` periods is the standard annuity formula:

$$
A = P \cdot \frac{i\,(1+i)^n}{(1+i)^n - 1}.
$$

Each period splits into `interest_t = i · balance_{t-1}` and
`principal_t = A − interest_t`, with `balance_t = balance_{t-1} − principal_t`.
Interest-only-with-balloon pays `i · P` each period and `P` at maturity; a bullet
pays all principal and accrued interest at a single maturity; a revolving line
accrues on the drawn balance with no fixed schedule.

**Verification:** $100,000 at 12% APR over 12 monthly periods yields a level
payment of **$8,884.88**, matching the textbook annuity value.

#### 6.2.2 Accrual & the interest-first ledger

Between scheduled payments, interest accrues on an **Actual/365** basis:

$$
\text{accrued} = \text{balance}\times \text{APR}\times \frac{\Delta_{\text{days}}}{365}.
$$

When a payment is recorded, the engine computes accrued interest since the last
payment, applies the payment **interest-first**, and books the remainder to
principal — then recomputes the outstanding balance from the ledger
(§3.3). Covenants (financial, reporting, affirmative, negative) are tracked with
status (ok / at-risk / breached / waived) and a tested-at date.

*[FIGURE 6 — asset: `whitepaper-assets/fig06-loan-detail.png`]*
**Caption:** Loan-servicing detail — summary tiles (principal, outstanding, rate,
accrued interest, interest paid), a repayment-progress bar, editable terms that
re-project the amortization schedule, the payment ledger with live interest/
principal split, and the covenant tracker.

### 6.3 The Share-Plans (Equity Vesting) Engine

The founder-side equity engine models option pools, grants, and **vesting** with
cliff semantics, plus an exercise ledger.

#### 6.3.1 Vesting mathematics

For a grant of `N` options with vesting start `t_0`, total vest `M` months, and
cliff `c` months, the vested count at a reference date with `m` whole months of
credited service is

$$
\text{vested}(m) =
\begin{cases}
0 & m < c \\[4pt]
\min\!\Big(N,\ \big\lfloor N \cdot \tfrac{\min(m, M)}{M}\big\rfloor\Big) & m \ge c
\end{cases}
$$

i.e. nothing vests before the cliff; at the cliff, the elapsed fraction vests **at
once** (the standard 12-of-48 ⇒ 25% jump); thereafter it accrues straight-line to
100% at `M`. **Termination freezes** the clock: credited service is capped at the
termination date and anything unvested is forfeited. Exercisable options are
`max(0, vested − exercised)` (no early exercise), and the exercise ledger drives
the derived exercised total (§3.3).

**Verification:** 48,000 options, 48-month vest, 12-month cliff: 0 vested at
month 11; **12,000** (25%) at month 12; **24,000** at month 24; capped at
**48,000** past month 48; a termination at month 30 freezes the total at
**30,000**.

*[FIGURE 7 — asset: `whitepaper-assets/fig07-share-plans-detail.png`]*
**Caption:** Grant detail — granted/vested/unvested/exercised/exercisable tiles,
dual progress bars (vesting and exercise), editable terms that re-project a
48-row monthly vesting schedule with the cliff row highlighted, an exercise
ledger, and a cap-table contribution summary.

---

## 7. Fund OS — Fund Administration & Performance Mathematics

Fund OS is the GP's back office: investments, capital calls, distributions, NAV,
LP capital accounts, financial reporting, and the standard performance metrics.

### 7.1 The performance metric suite

Given committed, called (paid-in), distributed, and residual (NAV) capital, Anker
computes the private-capital canon:

$$
\text{DPI} = \frac{\text{Distributions}}{\text{Paid-in}},\quad
\text{RVPI} = \frac{\text{NAV}}{\text{Paid-in}},\quad
\text{TVPI} = \text{DPI} + \text{RVPI} = \frac{\text{Distributions}+\text{NAV}}{\text{Paid-in}}.
$$

Gross **MOIC** on a position is `(realized + unrealized) / invested cost`.

### 7.2 Money-weighted return (IRR)

The fund's **IRR** is the money-weighted rate `x` solving the net-present-value
identity over dated cash flows `CF_k` at times `t_k` (years):

$$
\sum_{k} \frac{CF_k}{(1+x)^{t_k}} = 0,
$$

where calls are negative and distributions plus terminal NAV are positive. Because
`NPV(x)` is monotone in the region of interest, the root is found numerically
(Newton–Raphson with a bisection fallback for robustness when cash flows are
irregular). NAV of record is the sum of position **fair values**, which flow from
the Valuations engine (§6.1's cousin — position marks by method and as-of date).

### 7.3 Distribution waterfall

Carried-interest distributions follow the fund's waterfall (return of capital →
preferred return / hurdle → GP catch-up → carry split). The economics module
models fee schedules, quarterly accruals, and the waterfall so that LP and GP
splits reconcile to the ledger rather than being asserted.

### 7.4 Pacing & forecasting

The Fund Forecasting surface projects deployment **pacing**, reserve policy, and
projected returns — the portfolio-construction analogue of a position-sizing
strategy: given fund size, target number of initial checks, reserve ratio, and a
pacing curve, it schedules capital deployment and reserve follow-ons over the
investment period.

*[FIGURE 8 — asset: `whitepaper-assets/fig08-fund-os.png`]*
**Caption:** Fund OS overview for *Summit Venture Studio — Fund II* — the fund
profile, a "Fund workspace" card grid (Deals, Investments, Economics, Ledger,
Plan, Syndication, Management co., LP imports, Legal, Assessment), rollup tiles,
and the LP subscription funnel.

---

## 8. The AI System — Model Router, Persona Agents & Tooling

### 8.1 Provider-agnostic model router

Anker's AI is not tied to a single vendor. A **model router** abstracts across
providers (Anthropic Claude, and via the DashScope gateway Qwen 3.x, GLM, DeepSeek,
Kimi, and others), selecting a model per task tier (e.g. a `deep_research` tier
for agentic reasoning) with automatic fallback when a provider or task is
unavailable. The chat surfaces expose the model catalog so a user can pin a
specific model.

### 8.2 The tool-calling agent loop

The assistant is an **autonomous agent** that reasons in steps, emitting exactly
one JSON action per step — either a tool call or a final answer — over a catalog
of platform-integrated tools (CRM operations, deal pipeline, LinkedIn intro
paths, the outreach inbox, LP matchmaking, thesis scoring, firm enrichment, web
search/crawl, and document/spreadsheet generation). The loop batches work (e.g.
scoring many investors in one bounded call rather than one call per investor) to
respect provider quotas, and pre-processes uploaded files (PDF text extraction,
image OCR/vision) into the agent's context.

### 8.3 Persona agents

The assistant **adapts into three distinct agents** by the active persona, each
with its own role, tool scope, and integrated feature set derived from the shared
navigation taxonomy (so the agent's knowledge of "what it can do" never drifts
from what the persona can actually reach):

| Agent | Persona | Bias |
|---|---|---|
| **Founder Copilot** | founder | Investor discovery, warm-intro paths, pitch & data-room prep, cap-table/dilution, runway |
| **Fund Copilot** | vc | Deal sourcing & IC prep, thesis scoring, LP matchmaking, portfolio monitoring, back office |
| **Investor Copilot** | lp | Capital-account summaries, call/distribution explanations, documents, fund performance |

The active persona is injected into the system prompt along with the persona's
real platform destinations, and the chat UI surfaces persona-specific suggested
tasks. Owners default to the Fund Copilot (fullest toolset).

*[FIGURE 9 — asset: `whitepaper-assets/fig09-assistant.png`]*
**Caption:** The AI Assistant rendered as the Fund Copilot — an eyebrow reading
*"AI Agent · Fund Copilot"*, a serif *"Fund Copilot"* title with its tagline, and
persona-specific suggestion chips (score firms against a thesis, match the fund to
LPs, summarize the pipeline, draft an LP update).

---

## 9. Quantitative & Machine-Learning Methods

This section documents the modelling methods actually present in the platform.
It deliberately does **not** report market-trading backtests or return figures for
a strategy the platform does not run; the quantitative core of Anker is
**derivatives-style valuation, credit modelling, portfolio construction, and
semantic ranking**, and those are what is described.

### 9.1 Semantic investor matching (the ranking model)

Discovery ranks **47,275** investors for a given company/thesis. The method is
**embedding-based semantic retrieval**, not keyword search:

1. **Encoding.** A company/thesis and each investor profile are encoded to dense
   vectors `u, v ∈ ℝ^d` by an embedding model (`lib/ai/embeddings`), stored in
   Postgres (pgvector).
2. **Similarity.** Fit is scored by **cosine similarity**
   $$\text{sim}(u,v) = \frac{u\cdot v}{\lVert u\rVert\,\lVert v\rVert}.$$
3. **Structured filters.** Semantic score is combined with hard filters — stage,
   geography, check size, sector, recent activity — and with **warm-intro path**
   signals from the relationship graph (a shortest-path over LinkedIn
   connections), so the final ranking blends *fit* and *reachability*.

Because the encoding is semantic, a thesis phrased in prose retrieves investors
whose behavior matches, not merely those whose profile shares keywords.

### 9.2 Thesis scoring & firm enrichment

Beyond retrieval, a **scoring** tool grades a set of firms against a thesis
(bounded batches, ≤ 40 per call), and an **enrichment** tool fills thin firm
records from public sources. These are LLM-in-the-loop operations with rate-
limited failover, producing exportable spreadsheets rather than opaque scores.

### 9.3 Option-pricing math as the derivatives core

The 409A engine (§6.1) *is* the platform's derivatives-pricing model: it treats
each equity class as a call option and prices call spreads across breakpoints
with Black–Scholes. This is the same mathematics used to price options in public
markets, applied to private equity structures — the closest and most rigorous
"trading-math" surface in the product, and one whose outputs are legally
consequential (they set strike prices).

### 9.4 Credit & portfolio-construction modelling

The loan engine (§6.2) models amortization and accrual — deterministic
fixed-income mathematics. Fund Forecasting (§7.4) is a portfolio-construction
model: it is to a fund what a position-sizing/pacing strategy is to a book —
deciding how much to deploy, when, and how much to reserve.

### 9.5 On "trading strategies"

Anker is a venture operating system, not a trading system, and this paper will
not manufacture a strategy or a backtest to fit a narrative. The honest mapping
is: **option pricing** (§6.1, §9.3) is the derivatives math; **credit servicing**
(§6.2) is the fixed-income math; **pacing/reserves** (§7.4) is the portfolio-
construction math; **IRR/TVPI/DPI** (§7) is the performance math; **semantic
ranking** (§9.1) is the ML. If a market-facing quantitative strategy is added in
future, its methodology and *out-of-sample* results would be documented here with
the same rigor — and never before they exist.

---

## 10. Core Workflows

### 10.1 Founder — raise the round

1. **Discover / Find Investors** — upload a deck; the matching model (§9.1) ranks
   investors by fit and surfaces warm-intro paths.
2. **Model** — Cap Table (dilution across rounds), 409A (§6.1), Share Plans
   (§6.3), Runway.
3. **Raise Pipeline** — track the round by stage (soft-circled / committed).
4. **Data Room** — a 12-section diligence taxonomy with completeness tracking and
   watermarked, tokenized, expiring share links with view analytics.
5. **Outreach** — the agent drafts and the founder sends.

### 10.2 VC / GP — source deals and run the fund

Deal Flow → IC → close into positions (Fund OS); LP Matchmaking (fund→LP scoring);
back office (capital calls, distributions, SPVs, KYC/AML, fund tax, contracts,
compliance); reporting (financial reporting, tear sheets, data explorer);
monitoring (portfolio KPIs, valuations, forecasting).

### 10.3 LP — stay informed

The Investor Room self-serve portal: capital account (committed / called /
distributed / NAV), distribution & call notices addressed to the LP, and
documents (statements, letters, K-1s). Platform owners may enter the portal in an
explicit, badged **oversight** mode.

*[FIGURE 10 — asset: `whitepaper-assets/fig10-lp-portal.png`]*
**Caption:** The LP Investor Room — branded header with an owner-oversight badge
and a link back to the platform, a sub-nav (Capital account / Distributions /
Documents), and the LP's capital-account summary.

---

## 11. Billing, Credits & Metering

Anker meters usage through a **Stripe** integration (test-mode connected at time
of writing). The design keeps the app's read path off Stripe: a webhook mirrors
subscription state into local tables (`billing_customers`, `billing_subscriptions`),
and an append-only **credit ledger** (`billing_credit_ledger`) records grants
(plan allotments, top-ups) and consumption (AI-router spend); the balance is the
running sum. Three plans are defined — **Starter / Pro / Scale** — with monthly AI-
credit allotments granted on each paid invoice. The Stripe client is loaded lazily
and gated on configuration, so the app builds and runs whether or not billing is
switched on.

---

## 12. Security, Compliance & Auditability

- **Authentication** — Supabase sessions; invite-only, fail-closed registration;
  generic login errors (no user enumeration).
- **Open-redirect remediation** — a security review found that the post-login
  destination (`?next=`) was applied without validation, allowing
  `?next=https://evil.com` to redirect a freshly-authenticated user off-site
  (CWE-601). Both the login page and the OAuth callback now accept **internal
  paths only**.
- **Owner→tenant firewall** — platform owners see aggregate/existence data, not
  tenant private records, enforced structurally (owner status creates no
  membership; tenant reads require one). A single, explicit, logged exception
  grants owner oversight of the LP portal.
- **Immutable audit log** — an append-only `audit_events` trail (actor, action,
  target, metadata, IP, user-agent) with a filterable, paginated admin feed;
  writes are best-effort so auditing never breaks the action it records.
- **Compliance register** — a Fund OS surface enumerating the regulatory
  obligations a U.S. VC fund faces (SEC filings, securities, tax, fund reporting)
  and flagging what applies to the fund's profile.

---

## 13. Evaluation & Empirical Grounding

This section reports **only** what the production system actually contains.

### 13.1 Dataset (production, at time of writing)

| Asset | Count | Notes |
|---|---:|---|
| Investors / decision-makers | **47,275** | The core discovery dataset; matches the "47,000+" public figure |
| Contacts | **1,378** | Relationship graph nodes |
| News articles (published) | **88** | Newsroom / venture-insights content |
| Funds | **1** | Summit Venture Studio — Fund II (the canonical fund) |
| LPs on the fund | **8** | Capital accounts |
| Investment positions | **8** | NAV of record |
| Founder submissions assessed | **6** | Inbound "Pitch us" applications to date |

### 13.2 Engine correctness (regression suite)

The financial engines are validated against textbook expected values, run against
the live database round-trip:

| Engine | Test | Expected | Result |
|---|---|---|---|
| 409A / OPM | 8M common / 2M pref @ $1 | preferred solves to $2.00M; common ≈ $0.4441 | ✅ |
| Loan amortization | $100k, 12% APR, 12 mo | level payment $8,884.88 | ✅ |
| Vesting | 48k / 48mo / 12mo cliff @ 24mo | 24,000 vested; freeze@30mo ⇒ 30,000 | ✅ |
| Billing ledger | +5,000 then −120 | balance 4,880 | ✅ |

### 13.3 On "100+ startups assessed"

The production `founder_submissions` table currently holds **6** inbound
applications. A claim of *"100+ startups assessed"* is therefore **not** supported
by the platform's own records and is presented here, if at all, only as a
**target** for the assessment pipeline — never as an achieved result. The
assessment *capability* (a structured, multi-field fund-strength and company
assessment framework) exists and is documented; the *volume* is what it is. This
distinction is deliberate: a research paper that inflates its own evaluation set
is not a research paper.

---

## 14. Practitioner Commentary

> **These blocks are placeholders.** Anker's authors have **not** verified any of
> the quotations below, and none should be published until a **named source has
> supplied and approved the exact wording in writing**. Fabricating a testimonial
> — especially one attributed to a real institution or an identifiable individual
> — would be misinformation and is out of scope for this document. To complete
> this section, replace each block with a verbatim, attributable quote and obtain
> the source's written consent to be named.

**On the Fund OS back office —**
> *[Placeholder — verbatim quote to be supplied and approved by a named GP at a
> venture fund. Include: name, title, firm, date.]*

**On investor discovery & matching —**
> *[Placeholder — verbatim quote to be supplied and approved by a named
> allocator or family-office principal. Include: name, title, entity, date.]*

**On the quantitative / valuation engines —**
> *[Placeholder — verbatim quote to be supplied and approved by a named finance
> academic or practitioner. Include: name, title, institution, date; if the
> source has media appearances, cite the specific program and air date rather
> than paraphrasing.]*

> **Method for collecting these:** send the relevant section (e.g. §6.1 for the
> valuation engine) to the source, ask for a one- to three-sentence on-the-record
> reaction, capture it verbatim, and record their written consent. Only then does
> the quote belong in the paper.

---

## 15. Roadmap

- **Multi-fund & multi-series** — generalize the single canonical fund to
  multiple funds and extend the OPM to multi-series / participating-preferred
  waterfalls.
- **Rate limiting & password policy** — add rate limiting to the auth routes and
  strengthen the password policy (a noted, non-blocking recommendation from §12).
- **Deeper analytics** — extend the pipeline analytics with fundraising-funnel and
  portfolio-performance dimensions drawn from real fund data.
- **Assessment volume** — grow the founder-submission and assessment corpus so a
  future evaluation section can report results, not targets.
- **Billing go-live** — configure the production webhook secret and environment,
  and enable metered AI credits.

---

## 16. Appendix A — Formula Reference

**Black–Scholes call.** `C = SΦ(d₁) − Ke^{−rT}Φ(d₂)`,
`d₁ = [ln(S/K) + (r + σ²/2)T]/(σ√T)`, `d₂ = d₁ − σ√T`.

**OPM common allocation.**
`V_common(W) = [C(W,LP) − C(W,CP)] + (1−p)·C(W,CP)`, `CP = LP/p`.

**409A back-solve.** find `W*` s.t. `V_pref(W*) = prefShares·recentPrice` (bisection);
`commonFMV = V_common(W*) / commonShares · (1 − DLOM)`.

**Level loan payment.** `A = P·i(1+i)ⁿ / [(1+i)ⁿ − 1]`, `i = APR/f`.

**Actual/365 accrual.** `accrued = balance · APR · Δdays/365`.

**Vesting.** `vested(m) = 0` if `m < c`, else `min(N, ⌊N·min(m,M)/M⌋)`;
`exercisable = max(0, vested − exercised)`.

**Fund metrics.** `DPI = D/PI`, `RVPI = NAV/PI`, `TVPI = (D+NAV)/PI`,
`MOIC = (realized+unrealized)/cost`.

**IRR.** solve `Σ CF_k/(1+x)^{t_k} = 0` (Newton–Raphson + bisection fallback).

**Cosine similarity.** `sim(u,v) = (u·v)/(‖u‖‖v‖)`.

---

## 17. Appendix B — Data Model & API Surface (selected)

**Engines.** `option_grants`, `grant_exercises`, `option_pools` (share plans);
`loans`, `loan_payments`, `loan_covenants` (credit); `valuations_409a`
(OPM inputs + derived FMV/equity value); `funds`, `fund_lps`, `investments`,
capital calls/distributions (Fund OS).

**Platform.** `investors` (47,275), `contacts`, `founder_submissions`,
`news_articles`, `profiles`, `audit_events`, `billing_*`.

**REST (selected).** `/api/valuations-409a/[id]` (GET/PATCH compute+save);
`/api/loans/[id]` (+ `/payments`, `/covenants`); `/api/share-plans/[id]`
(+ `/exercises`, `/pool`); `/api/billing/{checkout,portal,webhook}`;
`/api/assistant` (persona-scoped agent); `/api/admin/audit`.

---

## 18. Appendix C — README / Operator Guide

A standalone operator README accompanies this paper as `README.anker.md`
(quick-start, environment variables, migrations, and the engine/AI/billing map).

---

*End of white paper. Figures marked [FIGURE n] are to be inserted from
`docs/whitepaper-assets/`; testimonials in §14 are placeholders pending named,
consented sources; all counts in §13 reflect the production database at the time
of writing.*
