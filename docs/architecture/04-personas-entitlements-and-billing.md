# 04 — Personas, entitlements and billing

**Date:** 2026-09-21 · **Status:** design · **Amends:**
[00-persona-isolation.md](00-persona-isolation.md) §2.1 · **Spine:**
[00](00-persona-isolation.md)

Personas are now commercial products. A user buys access **per persona**, can
hold several at once, and can switch between them freely. This document
enumerates the user situations that must work, then designs the entitlement
model that serves all of them.

---

## 1. What exists today, measured

```sql
-- scripts/migrations/2026-08-17-billing.sql
CREATE TABLE billing_subscriptions (
  org_id text PRIMARY KEY,        -- ← one subscription per WORKSPACE
  stripe_subscription_id text UNIQUE,
  status text, plan text, price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean, ...
)
```

```ts
// lib/billing/stripe.ts:14 — three persona-agnostic plans
{ id: "starter", credits: 500 },
{ id: "pro",     credits: 5000 },
{ id: "scale",   credits: 25000 }
```

Two facts that shape everything below:

1. **Billing is already keyed by workspace, not by user.** `org_id` is the
   primary key. Since a workspace has exactly one persona (doc 00 §2.1), the
   schema *already* expresses "one subscription per persona per user". This is
   the single luckiest thing about the current state — the hard structural
   decision was made correctly and by accident.
2. **Nothing is enforced.** `planForPriceId()` maps a Stripe price to a plan
   name and stores it. No page, route or tool asks whether the workspace has an
   active subscription. There is no entitlement layer at all — only a record of
   what was purchased.

So the work is not "add billing". It is "add entitlements, and give plans a
persona dimension".

---

## 2. The user-possibility catalogue

The requirement is to cater for every case, so here they are, and each one
carries the constraint it imposes on the design.

### 2.1 Single persona

| # | Situation | Constraint imposed |
| --- | --- | --- |
| 1 | Founder raising a round | Baseline. One workspace, one subscription. |
| 2 | VC deploying a fund | Baseline. |
| 3 | LP allocating into funds | Needs doc 01 — cannot create a workspace today. |

### 2.2 Two personas

| # | Situation | Constraint imposed |
| --- | --- | --- |
| 4 | **VC raising for their own startup** — the case you named: a GP buys the founder tier to fundraise | Two workspaces, two subscriptions, one user. Switching must be instant and lossless. |
| 5 | **Founder who angel-invests** (founder + LP) | The LP side may be much smaller usage than the founder side — tiers must be independent, not bundled. |
| 6 | **GP who is also an LP in other funds** (very common) | Their VC workspace and LP workspace must not leak into each other; a GP's own fund data and their personal LP commitments are different confidentiality domains. |
| 7 | **Founder who later becomes a VC** (exited, raising fund I) | Persona added over time; the founder workspace must keep working and keep its history. |

### 2.3 All three

| # | Situation | Constraint imposed |
| --- | --- | --- |
| 8 | Founder + VC + LP | Three subscriptions. The switcher must stay legible at three, not become a wall. Pricing should acknowledge the third. |

### 2.4 Several workspaces of the *same* persona

| # | Situation | Constraint imposed |
| --- | --- | --- |
| 9 | Serial founder with two companies | Persona alone is not the key — `org_id` is. Two founder workspaces, two subscriptions. |
| 10 | VC managing Fund I and Fund II | Same. Likely wants one bill; see §5.4 (org groups). |
| 11 | Family office with several mandates | Same. |

**This is why entitlement cannot be `(user, persona) → plan`.** It must be
`org → plan`, with persona derived from the org. Any model keyed on persona
alone breaks at case 9, which is not an edge case.

### 2.5 Not the subscriber

| # | Situation | Constraint imposed |
| --- | --- | --- |
| 12 | **An LP invited into a fund's data room** | **Must be free.** The fund pays; the LP is a guest. If an invited LP hits a paywall, the fund's own product breaks. |
| 13 | A team member invited into a founder workspace (CFO, chief of staff) | Seat on the workspace's plan, not their own subscription. |
| 14 | An advisor with seats in several unrelated workspaces | Zero subscriptions of their own, several workspaces. Legitimate and must work. |
| 15 | A service provider / agency managing client workspaces | Same as 14 at scale. Billing stays with the client org. |

Cases 12–15 are the ones a naive "user must have a subscription" check breaks,
and they are common. **Entitlement attaches to the workspace, and membership
grants access to the workspace's entitlement.**

### 2.6 Lifecycle

| # | Situation | Constraint imposed |
| --- | --- | --- |
| 16 | Trial of one persona | **14 days, once per person.** Decided 2026-09-21. The trial attaches to the workspace that consumes it, but a person gets one — see §6.4. |
| 17 | Upgrade within a persona (starter → pro) | Immediate, prorated. |
| 18 | **Add a persona** (cross-sell) | The main growth path. Must not require a new account or a new login. |
| 19 | Downgrade one persona, keep another | Independent. Cancelling the VC plan must not touch the founder workspace. |
| 20 | Payment fails → past due | Grace, then read-only. Never silent data loss. |
| 21 | Cancel, then return months later | Data retained per policy and reactivation restores it. |
| 22 | Cancels the workspace they are *currently inside* | The switcher must not strand them on a dead page. |
| 23 | Annual vs monthly, per persona | Different billing intervals across a user's workspaces at once. |

---

## 3. The model

### 3.1 Four layers, cleanly separated

```
 Identity            one person, one login
    │
    ├── Membership   (user × org, with a role)           ← who may enter
    │
 Workspace (org)     exactly one persona                 ← what kind of thing it is
    │
 Subscription        one per workspace, a persona-tier   ← what was bought
    │
 Entitlement         resolved: features + limits         ← what may be done
```

Each arrow is a different question, and conflating any two of them produces one
of the broken cases in §2. The frequent mistake is folding Subscription into
Identity ("this user is a Pro user"), which breaks cases 9–15 simultaneously.

### 3.2 The amendment to doc 00

Doc 00 §2.1 says a user "can be acting as only one persona at a time". That
stays true and becomes more load-bearing: the active workspace determines the
persona, the scope key, **and now the entitlement**. One switch changes all
three together, which is what makes switching coherent rather than a set of
independent toggles that can disagree.

### 3.3 Entitlement resolution

```
resolveEntitlement(user, org) →
   1. membership(user, org)                     absent → no access at all
   2. subscription(org)                         absent → free tier for that persona
   3. status ∈ {active, trialing}               → plan features
      status = past_due                         → plan features, grace banner
      status ∈ {canceled, unpaid, incomplete}   → read-only
   4. guest override: lp_membership(user, org)  → free LP guest access (case 12)
   5. platform owner override                   → full access, audited
```

Resolved server-side, per request, cached for the request only. Never trusted
from a client, same rule as the scope key.

**Step 4 is the one that is easy to miss.** An LP invited to a fund's data room
has an `lp_membership`, no `membership`, and no subscription. They must reach
the data room and nothing else. Their entitlement comes from the *fund's*
subscription, not their own.

---

## 4. The plan matrix

Persona × tier, because a founder's "Pro" and a VC's "Pro" are different
products at different prices.

| | **Free / Guest** | **Starter** | **Growth** | **Scale** |
| --- | --- | --- | --- | --- |
| **Founder** | profile, 1 data room as guest | pipeline, CRM, 1 raise, basic outreach | + matching, deck analysis, LinkedIn, calls | + multi-entity, cap table, 409A, API |
| **VC** | — | 1 fund, portfolio, CRM | + LP matching, fund reporting, outreach | + multi-fund, LP portal, SPVs, API |
| **LP** | **guest access to any fund that invites them** | own workspace, commitments, documents | + fund discovery, diligence workspace, CRM | + multi-mandate, allocation modelling, API |

Notes on the shape:

- **LP Free is a real tier, not a trial.** Case 12 depends on it. An LP who is
  only ever a guest of paying funds pays nothing, forever, and that is correct:
  they are the fund's customer's counterparty.
- **VC has no free tier.** There is no equivalent of "invited as a guest" for a
  GP; a VC workspace is always something someone bought.
- **Credits are orthogonal.** `billing_credit_ledger` already exists and meters
  AI spend. Each tier grants an allotment; top-ups are separate. Keep this —
  it is the mechanism that stops a frontier-model default from becoming an
  unbounded bill (the `ai_rationale` risk from the assistant audit).

### 4.1 Multi-persona pricing

Three independent subscriptions is the honest default, and it will feel
punitive at case 8. Two mechanisms, both worth having:

- **Second-persona discount.** A percentage off any additional workspace
  subscription on the same billing account. Implemented as a Stripe coupon
  applied at checkout when the customer already has an active subscription.
- **Bundle price.** An explicit "all three" SKU for the case-8 user.

Both are Stripe configuration plus one check at checkout. Neither changes the
entitlement model, which is the point: **pricing experiments must not require
schema changes.**

---

## 5. Schema

### 5.1 What stays

`billing_customers`, `billing_subscriptions`, `billing_credit_ledger` — all
keyed by `org_id`, all correct as they are.

### 5.2 What is added

```sql
-- Plans become persona-aware. Today `plan` is a bare string ('pro') with no
-- way to tell a founder Pro from a VC Pro.
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS persona text;
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS tier text;
-- plan stays as the raw Stripe-derived id for audit; persona+tier is the
-- resolved pair the app reasons about.

-- The trial this workspace is running, if any (case 16).
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- One trial per person, ever. The row is the fact that a person has used
-- theirs; it records which workspace consumed it so support can answer "when
-- and on what". A person with no row here has a trial available.
--
-- Keyed on user_id rather than on the billing account deliberately: a person
-- can create a second Stripe customer trivially, and the point of the limit is
-- the person, not the card.
CREATE TABLE IF NOT EXISTS billing_trials (
  user_id    text PRIMARY KEY,
  org_id     text NOT NULL,          -- the workspace that consumed it
  persona    text NOT NULL,          -- which product they evaluated
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at    timestamptz NOT NULL
);

-- Grace period before read-only (case 20). Explicit rather than computed, so
-- support can extend one account without a code change.
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS grace_until timestamptz;

-- Several workspaces, one bill (cases 10, 11).
CREATE TABLE IF NOT EXISTS billing_account_orgs (
  stripe_customer_id text NOT NULL,
  org_id             text NOT NULL,
  PRIMARY KEY (stripe_customer_id, org_id)
);
```

### 5.3 The plan catalogue

`BILLING_PLANS` becomes persona-keyed:

```ts
export const PLANS: Record<Persona, PlanDef[]> = {
  founder: [
    { tier: "free",    priceEnv: null,                          credits: 0,     features: [...] },
    { tier: "starter", priceEnv: "STRIPE_PRICE_FOUNDER_STARTER", credits: 500,   features: [...] },
    { tier: "growth",  priceEnv: "STRIPE_PRICE_FOUNDER_GROWTH",  credits: 2500,  features: [...] },
    { tier: "scale",   priceEnv: "STRIPE_PRICE_FOUNDER_SCALE",   credits: 10000, features: [...] },
  ],
  vc:  [ /* no free tier */ ],
  lp:  [ /* free tier is guest access */ ],
}
```

`planForPriceId()` returns `{ persona, tier }` instead of a bare string, so a
webhook can no longer store a plan without knowing which product it belongs to.

### 5.4 Billing accounts

`billing_account_orgs` lets one Stripe customer own several workspaces — a VC
with Fund I and Fund II, or a user consolidating all three personas onto one
card. Subscriptions remain per workspace; only the payment relationship is
shared. This keeps cancellation granular (case 19) while making the invoice
singular.

---

## 6. Lifecycle

### 6.1 Subscription state machine

```
                  ┌──────────┐
   checkout  ───▶ │ trialing │ ──trial ends, paid──┐
                  └────┬─────┘                     ▼
                       │ trial ends, unpaid   ┌─────────┐
                       ▼                      │ active  │◀── payment recovers ─┐
                  ┌─────────┐                 └────┬────┘                      │
                  │ expired │◀── grace ends ──┐    │ payment fails             │
                  └─────────┘                 │    ▼                           │
                       ▲                      │ ┌──────────┐  grace window   ──┘
                       │                      └─│ past_due │
        cancel at period end                    └──────────┘
                       │
                  ┌──────────┐
                  │ canceled │ ── reactivate (data intact within retention) ──▶ active
                  └──────────┘
```

### 6.2 What each state permits

| State | Read | Write | AI / credits | Outreach send |
| --- | --- | --- | --- | --- |
| `trialing` (14 days) | yes | yes | trial allotment | yes |
| `active` | yes | yes | plan allotment | yes |
| `past_due` (in grace) | yes | yes | **paused** | **paused** |
| `expired` / `canceled` | yes | **no** | no | no |
| beyond retention | export only | no | no | no |

Two deliberate choices:

- **Credits and outreach pause before writes do.** They cost real money and
  reach third parties. A lapsed account should not be sending email on a card
  that is declining.
- **Read never disappears at the cliff.** A user whose card expires while
  travelling must not find their cap table gone. Read-only, with an export, for
  the full retention window.

### 6.4 Trials — 14 days, once per person

**Decided 2026-09-21.** A person gets one 14-day trial across the whole
platform, not one per persona and not one per workspace.

```
checkout(persona, tier)
  └─ billing_trials row exists for this user?
       no  → trial_ends_at = now() + 14 days, insert billing_trials row, status = trialing
       yes → no trial; card charged at the start of the first period
```

The trial attaches to whichever workspace consumes it, and the
`billing_trials` row is what makes it once-per-person rather than
once-per-workspace. Deleting the workspace does not return the trial.

**The consequence, stated plainly:** a founder who trials and later wants to
evaluate the VC product pays from day one on that second workspace. That is the
trade — it closes the "three free months per person" hole at the cost of making
the second persona a colder sell. Two mitigations, neither of which reopens the
hole:

- The **second-persona discount** (§4.1) is the cross-sell incentive instead of
  a second trial.
- A **refund window** on a first period, granted by support, covers the genuine
  "this was not what I expected" case without being an entitlement anyone can
  plan around.

Support can grant an exception by deleting the `billing_trials` row, which is
deliberately a manual act with an audit trail rather than a self-serve button.

### 6.3 Upgrades, downgrades, adding a persona

| Action | Effect | Timing |
| --- | --- | --- |
| Upgrade tier | new features immediately, prorated charge | immediate |
| Downgrade tier | at period end; features that exceed the new tier become read-only, never deleted | period end |
| Add persona | new workspace + new subscription; second-persona discount applies | immediate |
| Remove persona | cancel that workspace's subscription only; other workspaces untouched | period end |

**Downgrade must never delete.** A founder dropping from Scale to Starter keeps
their cap table; it becomes read-only with an upgrade prompt. Deleting data on
downgrade turns a billing event into a data-loss event.

---

## 7. Switching personas

The experience that makes multi-persona ownership feel like one product.

```
┌─ Workspace switcher ────────────────────┐
│  FOUNDER                                │
│   ● Acme Inc.            Growth         │
│   ○ Beta Labs            Starter        │
│  VC                                     │
│   ○ Northwind Fund I     Scale          │
│   ○ Northwind Fund II    Scale          │
│  LP                                     │
│   ○ Family office        Starter        │
│  GUEST                                  │
│   ○ Someone's Fund III   (invited)      │
│  ─────────────────────────────────────  │
│   + Add a workspace                     │
└─────────────────────────────────────────┘
```

Grouped by persona, tier visible, guest memberships shown and labelled as such
so a user is never confused about which of their capacities they are in.

**Switching sets three things atomically:** active workspace → scope key →
entitlement. They cannot disagree, because they are derived from one value.

**"+ Add a workspace"** is the cross-sell path (case 18): choose persona →
choose tier → checkout → workspace created. One flow, no new account.

### 7.1 Case 22 — cancelling the workspace you are in

On cancellation the app switches the active workspace to the user's next
entitled one and says so. If there is none, it lands on the account page with
the export option visible. Never a dead page, never a redirect into another
persona's surface (doc 02 forbids it, and this is exactly where it would be
tempting).

---

## 8. Enforcement

Four points, in order of trust:

1. **`requireEntitlement(feature)`** in route handlers and server components.
   One function, mirroring `requireScope()`. Returns the entitlement or throws
   a typed error the UI renders as an upgrade prompt rather than an error page.
2. **Feature flags resolved from the plan**, not hardcoded per page, so adding
   a tier is a catalogue change and not a diff across forty files.
3. **Credit ledger** for metered AI, already present. The AI call recorder
   (added 2026-09-21) now makes spend per workspace visible, which is what
   makes metering trustworthy enough to bill against.
4. **Client-side gating for presentation only.** A locked feature may be
   visible and greyed — that is good cross-sell — but the server decides.

### 8.1 The rule that prevents the worst bug

> **Entitlement failures must never be silent, and must never fall back to
> "allow".**

A resolution that cannot determine the entitlement returns *no access*, not
full access. The audit finding that made this worth writing down: the AI router
currently fails open in the other direction (an untagged task escapes every
kill switch), and the same shape of mistake in billing means giving away the
product.

---

## 9. Risks and open decisions

- **Pricing is not a schema decision, and must not become one.** Everything in
  §4 is a catalogue and Stripe configuration. If a pricing experiment needs a
  migration, the model is wrong.
- **Case 12 is load-bearing and easy to break.** Any entitlement check written
  as "does this user have a subscription" breaks every invited LP, every team
  seat, and every advisor. The check is always *workspace* entitlement plus
  membership.
- **Seats are not modelled here.** Cases 13–15 assume a workspace plan covers
  its members. Per-seat pricing is a real option and a separate design; the
  schema above does not preclude it (`memberships` already exists to count).
- **Guest LP scale.** A fund with 200 LPs creates 200 free users. Fine
  commercially — they are the fund's LPs, and some become case 3 — but it means
  free accounts will outnumber paid ones, and anything priced per user rather
  than per workspace will look alarming for no real reason.
- **One trial per person makes the second persona a colder sell.** Settled
  deliberately (§6.4): 14 days, once. The risk moves from revenue leakage to
  conversion friction on the cross-sell, which the second-persona discount is
  meant to carry. Worth measuring — if add-a-persona conversion is poor, the
  discount is the lever to pull, not the trial.
- **Trial limit is keyed on the person, and a person can make another account.**
  `billing_trials.user_id` stops the honest case, not a determined one. Email
  verification already gates signup; anything stronger (device, payment
  fingerprint) costs more in false positives than the fourteen days are worth.
- **Proration across personas.** Stripe handles proration within a
  subscription. Moving *between* personas is not an upgrade — it is a new
  subscription and a cancellation, and should be presented as such rather than
  dressed up as a switch.

## 10. Build order

1. **Persona-aware plan catalogue** (§5.3) and `persona`/`tier` on
   `billing_subscriptions`. No behaviour change; webhooks start recording which
   product was bought.
2. **`requireEntitlement()` + feature map** (§8). Still no gates applied —
   resolution first, so it can be verified against real subscriptions before
   anything is locked.
3. **Apply gates**, starting with the expensive surfaces: AI, outreach send,
   matching runs.
4. **Lifecycle states** — grace, read-only, retention (§6.2).
5. **The switcher and the add-a-workspace flow** (§7), which is where the
   cross-sell revenue actually is.
6. **Billing accounts and multi-persona discounts** (§5.4, §4.1).

Steps 1–2 are safe to do immediately and make everything after them
verifiable. Step 3 is the first one a user can feel, and should not ship until
the usage panel shows entitlement resolution working on real traffic.
