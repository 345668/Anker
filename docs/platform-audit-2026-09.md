# Anker platform audit — September 2026

Scope: what the marketing site advertises vs. what is actually implemented, plus
whether the workflows and UI genuinely accelerate the VC / founder / LP jobs we
claim to own. All numbers below were measured against the live Neon database and
the repo on `main` @ `a4a8a93` — not estimated.

---

## Verdict in one paragraph

**The engineering is far stronger than the go-to-market is honest, and the
product is far broader than it is activated.** Anker has genuinely serious
infrastructure — an event-sourced double-entry fund GL, real Newton-Raphson
IRR, a Black-Scholes OPM 409A backsolve, 236 tables, 363 API routes, 151
dashboard pages with almost no mock data. That is not a demo. But three things
undercut it: (1) the landing page makes several claims that are factually
wrong and at least two that carry legal risk; (2) ~66 built pages — including
all three features shipped this week — are unreachable from the in-app
navigation; (3) the core tables of the VC and LP products are empty, meaning
the workflows have never been run end to end. The bottleneck is **not** more
features. It is truth in marketing, discoverability, and activation.

---

## 1. Advertised vs. implemented

### 1.1 Headline metrics (`components/landing/metrics-section.tsx`)

| Advertised | Measured | Verdict |
|---|---|---|
| **60,000** investors in database | `investors` = **47,275** | ❌ Overstated ~27% |
| **20,000** investment firms & VCs | `investment_firms` = **18,982** | ✅ Fair (rounds up) |
| **40,000** HNWIs & Limited Partners | LP/angel/FO-type = **7,228** + `businessmen` 922 ≈ **8,150** | ❌ **Overstated ~5×** |
| **50+** countries covered | 252 distinct `investor_country`, 41,358 rows filled | ✅ True (understated) |

The LP/HNWI number is the most serious. We sell an LP product to LP-literate
buyers; a 5× inflation on the one number they can sanity-check is the fastest
way to lose the room. The honest, still-impressive line is
**"47k investors · 19k firms · 250+ countries."**

Note the nav string "Search 60k+ investors & firms" (`lib/nav/taxonomy.ts:66`)
is *defensible* as a combined figure (47,275 + 18,982 = 66,257) — but the
metrics section presents 60,000 as investors **alone** and then adds firms
separately, which double-counts.

### 1.2 Data integrations — the biggest gap

`components/landing/integrations-section.tsx` displays twelve provider logos as
"data sources". Code search across `lib/` and `app/`:

| Provider | Files implementing it |
|---|---|
| PitchBook, SEC/EDGAR, CB Insights, Preqin, Dealroom, Tracxn, Mattermark, Owler, PrivCo | **0** |
| Crunchbase | 4 — but all are a `crunchbase_url` column + a crawler-exclusion regex |
| AngelList | 1 — the *name of a financial-model template* |
| LinkedIn | ✅ Real (the LinkedOut extension suite) |

**Eleven of twelve are decorative.** Only LinkedIn is a real integration. A
marquee of logos a buyer reads as "connected" is the single highest-risk item
on the site — it is the kind of claim that surfaces in diligence.

**Fix:** relabel the section honestly — "Coverage aggregated across public and
partner sources" — or move the logos behind a "Roadmap" heading. Keep LinkedIn
where it is; it's earned.

### 1.3 Security & compliance claims — legal exposure

`security-section.tsx:30` lists as **certifications**:
`["SOC 2", "GDPR", "256-bit SSL", "2FA", "SSO"]`, and
`product-mockups.tsx:220` renders **"SOC 2 Type II — Certified"** with a green
check and a "SOC 2" badge.

- **SOC 2 Type II "Certified"** — no audit artifact in the repo. If we do not
  hold a current Type II report, this must come down today. It is a specific,
  falsifiable claim about a third-party attestation.
- **2FA** — 1 file matches `mfa|two.factor|totp`. Not a shipped feature.
- **SSO/SAML** — 2 files. Not a shipped enterprise feature.
- **GDPR compliant** — defensible as a posture claim, not a certification.
- **Encryption / audit log** — ✅ real (`audit_events`, 9 files touching encryption).

Presenting 2FA and SSO in a list headed "certifications" reads as "we have
these." We largely don't.

### 1.4 Unsupported performance statistics

`developers-section.tsx` advertises: `92%` match accuracy, `3.2x` faster intros,
`1000+` decks analyzed, `47%` higher response, `2.4x`, `6 weeks`.

| Claim | Evidence available |
|---|---|
| 1000+ decks analyzed | `pitch_deck_analyses` = **1** |
| 92% match accuracy | 217 `match_outcome_events`; no accuracy computation exists |
| 47% higher response / 3.2× / 2.4× | 286 sent messages, no control group, no baseline |

None of these are currently measurable, let alone measured. Testimonials carry
roles ("Managing Partner") but no named individuals — safer, but still
presented as real customer quotes.

**Fix:** replace invented ratios with numbers we can actually stand behind from
the DB (47k investors, 19k firms, 250+ countries, 12.5k CRM relationships).
Real and verifiable beats big and invented.

---

## 2. Built but unreachable — the discoverability failure

`lib/nav/taxonomy.ts` has **two** navigation structures:
- `SUITES` — the *marketing* mega-menu
- `APP_NAV` — the *in-app* left rail, which also feeds the ⌘K command palette

**The three features shipped this week are in `SUITES` only, not `APP_NAV`:**

```
/dashboard/signals  → referenced in: lib/nav/taxonomy.ts (only)
/dashboard/calls    → referenced in: lib/nav/taxonomy.ts (only)
/dashboard/updates  → referenced in: lib/nav/taxonomy.ts (only)
```

A signed-in founder **cannot navigate to Market Signals, Call Intelligence, or
Investor Updates at all** — not from the rail, not from ⌘K, not from any link in
the app. The commit that claimed to "surface them in the Founder Suite nav"
added them to the marketing menu only. This is the single highest-ROI fix on
this list: three lines in `APP_NAV`.

**Broader orphan count: 66 non-admin pages** exist but are absent from `APP_NAV`.
In fairness, most are legitimate hub-and-spoke children — `/dashboard/portfolio/fund`
does link to `calls`, `distributions`, `investments`, `ledger`, `legal`, `plan`,
`assessment`, `deals`; `/dashboard/tools` indexes its 11 calculators. Those are
fine. The genuine problems are:

- **Unreachable new features** — signals, calls, updates (above)
- **Apparent legacy duplicates** competing with the canonical surface:
  `/dashboard/pipeline` vs `/dashboard/fundraising/pipeline`;
  `/dashboard/deals` vs `/dashboard/portfolio/fund/deals`;
  `/dashboard/investors` vs `/dashboard/discover`;
  `/dashboard/pitch-deck` vs `/dashboard/decks`;
  `/dashboard/send-center` vs `/dashboard/outreach`
- **`/dashboard/settings` is orphaned from the rail** — a core destination

### 2.1 A live bug found during the audit

`app/api/signals/route.ts:27` personalizes the feed by reading the founder's
sector:

```sql
SELECT industry FROM companies WHERE user_id = ... -- table does not exist
```

There is **no `companies` table** in the database (the founder entity is
`startups`, and its column is `niche_industry`, not `industry`). The query is
wrapped in `try/catch`, so it fails silently on every request. **Market Signals
never personalizes to the founder's sector** — every user sees the same generic
feed. Silent-catch made a broken feature look like a working one.

---

## 3. What is genuinely strong

Worth stating plainly, because the marketing undersells the actual moat:

- **Fund general ledger** (`lib/portfolio/fund-ledger.ts`) — event-sourced,
  code-defined 14-account venture chart, idempotent `rebuildJournal()` that
  re-derives auto entries while preserving manual ones. This is a correct
  answer to Neon's lack of cross-statement transactions, and it is better
  engineering than most fund-admin startups ship.
- **409A via OPM backsolve** (`lib/modules/opm-409a.ts`) — two-class
  Black-Scholes breakpoint model with DLOM, running client-side. Real
  valuation work, not a form.
- **Real IRR/XIRR** — Newton-Raphson/bisection across 7 tool engines.
- **Approval-gated outreach** — LinkedIn + email, deliverability, suppression
  lists, and a human gate that never auto-sends. Genuinely differentiated and
  the right compliance posture.
- **Implementation quality** — only 2 files in the whole dashboard match
  mock/placeholder patterns. The surfaces are real code, not shells.

---

## 4. Does it accelerate the three jobs?

### Founder — **strongest, and now a closed loop** ✅
The chain is complete: discover → match → outreach → classified reply →
guaranteed booking ask → call → Call Intelligence → investor update. Plus a real
equity suite (cap table, share plans, 409A, compensation). This is a credible
"founder powerhouse."
**Blockers:** the three newest links are invisible (§2); sector personalization
is dead (§2.1); `decks` = 0, `data_room_files` = 0 — the Studio side is unused.

### VC / Fund admin — **deepest engineering, thinnest usage** ⚠️
Fund OS + Fund services span capital calls, distributions, GL, NAV, fees, KYC/AML,
fund tax, SPVs, loan ops, contracts, compliance. Some real exercise exists
(`fund_lps` 8, `capital_calls` 4, `distributions` 3, `valuation_snapshots` 8).

> **CORRECTED 2026-09-08 after investigation. The original finding here was
> wrong** — it read `fund_investments` (0 rows), which turns out to be an
> **orphan table with zero code references**. The live data is in `investments`
> (8 rows, $3,363,448 cost basis), which `listInvestments()` → the ledger reads
> correctly. There was no missing cost basis, and LP-facing DPI/TVPI are
> computed in `capital-account.ts` from source tables, **not** from the GL, so
> they were never "structurally wrong" as originally claimed. Two real issues
> did surface underneath, below.

**Real issue A — the ledger had never been materialized (FIXED).**
`journal_entries` and `journal_lines` were **completely empty**. The GL is an
idempotent event-sourced projection, but `rebuildJournal()` was reachable only
through an admin-gated `POST .../ledger/rebuild` — nothing ever called it. Any
fund therefore rendered a blank ledger and empty statements until someone knew
to press "Rebuild". The read path now materializes on first read (guarded to
the empty case, so it can never clobber existing or manual entries).
Verified against the live fund: **13 entries** (8 `investment_close`, 5
`valuation`, 1 `realized`) and a trial balance that nets to **exactly zero**
(DR 6,174,190.00 = CR 6,174,190.00).

**Real issue B — capital calls and distributions have no line items (OPEN).**
`capital_calls` (4) and `distributions` (3) exist as *headers*, but
`capital_call_line_items` and `distribution_line_items` are **empty**. Both the
GL and LP capital accounts book from line items, not headers, so:
  - the GL has no contributed capital and no distributions — Cash sits at
    **−3,363,448** (investments were funded by cash that was never called in)
  - LP capital accounts show no contributions or distributions, leaving
    **DPI and TVPI null** in the Investor Room

This is a **data** gap, not a code gap: `createCall()` correctly synthesises a
line item per non-transferred LP, so these records were seeded straight into
the tables, bypassing the creation path. Fixing it needs a backfill that
allocates each existing call/distribution across the 8 `fund_lps`.

Also empty: `ic_memos` 0, `ic_votes` 0, `deals` 0, `spvs` 0,
`portfolio_companies` 0, `valuations_409a` 0. The IC workflow — the thing that
makes "Deal Flow & IC" a product — has never been run.

### LP — **the weakest leg by a wide margin** ❌
Only **3 pages** (`/lp`, `/lp/distributions`, `/lp/documents`) against 9 founder
and ~20 VC destinations. `lp_entities` = 0, one portal token issued.
**There is no LP onboarding at all** — `app/onboarding/` has `founder` and `vc`
only. We market "Anker Investor Room" as a third pillar; it is currently a
read-only appendix to Fund OS. For a true "LP powerhouse" the missing pieces
are: LP onboarding, commitment/subscription flow, capital-account drill-down,
document watermarking evidence, and self-serve K-1 access.

### Cross-persona — the actual moat, currently unexploited
The unique asset is that founders, VCs, and LPs are on **one** platform:
`founder_submissions` (8) → `deal_opportunities` (9) → IC → portfolio → LP
reporting. That full loop has never completed once (`ic_memos` = 0,
`fund_investments` = 0). Nobody else can build this loop; we've built the pipes
and not yet run water through them.

---

## 5. Activation: the real bottleneck

Empty core tables, measured today:

```
portfolio_companies 0   deals 0        spvs 0            valuations_409a 0
data_room_files 0       decks 0        investor_matches 0 ic_memos 0
lp_entities 0           fund_investments 0                introductions 0
billing_subscriptions 0 subscribers 0  early_access_requests 0
investor_calls 0        investor_updates 0
```

Two immediate implications:

1. **`billing_subscriptions` = 0** — Stripe is wired but nobody is paying. No
   revenue signal exists to prioritize against.
2. **`early_access_requests` = 0** — the early-access form we shipped has
   captured **zero** submissions. Given the page is live and polished, this
   should be verified end-to-end; a silent write failure would look exactly
   like this.

We have built roughly three products' worth of surface area with roughly one
product's worth of usage. Every additional feature widens this gap.

---

## 6. Prioritized recommendations

### P0 — this week (truth + reachability)
1. **Take down or substantiate the SOC 2 Type II "Certified" claim.** Legal risk.
2. **Fix the LP/HNWI metric** 40,000 → ~8,000, and investors 60,000 → 47,275.
3. **Relabel the integrations marquee** — 11 of 12 are not connected.
4. **Add `signals`, `calls`, `updates` to `APP_NAV`** — 3 lines; unlocks a
   week's shipped work that is currently invisible.
5. **Remove 2FA/SSO from the certifications list** (or ship them).
6. **Fix `app/api/signals/route.ts:27`** — query `startups.niche_industry`, and
   log the catch instead of swallowing it.

### P1 — this month (make one loop real)
7. **Verify the early-access form writes**, then instrument it.
8. ~~Investigate `fund_investments` = 0~~ — **done, and the finding was wrong**
   (orphan table; see §4). Two follow-ups replaced it:
   a. ✅ Ledger now materializes on first read; trial balance verified to zero.
   b. ⬜ **Backfill call/distribution line items** so contributed capital reaches
      the GL and LP capital accounts stop reporting null DPI/TVPI.
   c. ⬜ **Drop the orphan `fund_investments` table** (0 rows, 0 code references)
      so it cannot mislead the next audit.
9. **Run one complete cross-persona loop with real data** — submission → IC memo
   → investment → valuation → capital call → distribution → LP statement. This
   will surface more truth than any further feature work.
10. **Replace invented performance stats** with DB-derived facts.
11. **Retire or redirect the legacy duplicate routes** (§2).

### P2 — the quarter (close the LP leg)
12. **LP onboarding flow** — the clearest structural hole in the three-persona thesis.
13. **LP commitment/subscription workflow** to make `lp_entities` non-zero.
14. **Instrument activation** — which of the 151 pages are actually opened? Without
    this we cannot decide what to cut, and the surface will keep growing.

---

## Bottom line

Anker does not have a capability problem. It has a **credibility problem in the
marketing layer, a discoverability problem in the navigation layer, and an
activation problem in the data layer** — in that order of urgency. The
engineering underneath (GL, OPM, IRR, approval-gated outreach) is strong enough
to sell honestly. The fastest path to a genuine "VC + founder + LP powerhouse"
is not the next engine; it is making the existing ones true, reachable, and used.
