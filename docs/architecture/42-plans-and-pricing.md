# 42. Plans and pricing: who pays, for what, and why

Status: proposal 2026-10-04, loaded into `plan_catalog` (editable in SAIL), **nothing assigned and no price published**. Every number below is a hypothesis to be tested, not a measured fact.
Builds on [37](37-anker-agentic-venture-erp.md) §7 and [41](41-tenant-lifecycle-and-entitlements.md).

## 1. What we know, and what we do not

Known (production, 2026-10-03/04): 14 workspaces (11 founder, 3 fund), about 2 monthly active users, **0 paying**, billing not live (webhook secret unset), two design partners onboarded as fund workspaces (Summit Venture Studio, Winner Capital)
and three founder decks in hand. AI cost per workspace is **unmeasured** (cost per call has been recorded only since 2026-10-03; the free-lane routing makes it near zero today). The founder-side loop has never been completed
by a real customer (0 replies, no mailbox connected). Not known: willingness to pay for anyone.

So the plan below is built to **learn price quickly while earning from the first customers**, not to maximise a spreadsheet.

## 2. The business logic

1. **Funds pay; founders are supply.** A fund's willingness to pay is set by the cost of the work it replaces (an analyst, a fund administrator, deal-flow triage: tens of thousands of euros a year), it buys by contract, and 200 funds can be reached
   by relationship. A founder raises for three to six months and then stops, with a wallet of hundreds, not thousands. Intake closes the loop: a free founder who applies to a paying fund's form is a lead the fund pays to see.
2. **A free founder tier is acquisition, not charity.** It costs a few dollars of AI a month at most, fills the directory-side data with real startups, and is the funnel into *Founder Raise*. Its limits (no outreach, three dollars of AI) keep it from
   becoming a free cold-email tool, which is also the legal risk we least want to carry.
3. **LPs are free.** They arrive through a fund; the fund's price carries them. Charging LPs would break the fund's reporting story.
4. **Price the value metric, cap the cost metric.** The thing that scales with value is seats and the volume of deal flow handled (applications a month); the thing that scales with our cost is AI spend, so it is capped inside each plan (about 15% of price at the cap, usually far less).
5. **Annual contracts at two months free** (price × 10) for funds; founders can pay monthly because raises are short.
6. **A design-partner programme before list prices.** Six free months for a few funds in return for weekly feedback, a named case study and an agreed conversion price. This buys evidence of value, which is worth more than early revenue.

## 3. The catalogue (EUR, excluding VAT)

| Plan | For | Month | Year | Includes | Main limits |
| --- | --- | --- | --- | --- | --- |
| Founder Explore | founders | 0 | 0 | assistant, matching, tools | AI $3, 1 seat, no outreach |
| **Founder Raise** | founders | 149 | 1,490 | + approval-gated outreach | AI $30, 3 seats, 50 sends/day |
| Founder Raise+ | founders | 349 | 3,490 | + LinkedIn campaigns | AI $90, 8 seats, 150 sends/day |
| Fund Studio | emerging managers, studios | 390 | 3,900 | deal pipeline, **inbound intake with the engine**, assistant, outreach, matching, tools | AI $60, 5 seats, 150 applications/month |
| **Fund Pro** | managers running a fund | 990 | 9,900 | + fund administration (ledger, calls, distributions, LP reporting, compliance, KYC), LinkedIn | AI $200, 15 seats, 600 applications/month |
| Fund Institutional | larger managers | contract, from about 2,500 | annual | + SPVs, security review, named contact | AI $800, 50 seats, 3,000 applications/month |
| LP access | limited partners | 0 | 0 | the LP portal and tools | read access |
| Design partner | 2 to 5 chosen funds | 0 for 6 months | | everything in Fund Pro | as Fund Pro |

The earlier placeholder plans (`starter`, `pro`, `scale`) are retired. Their flaw, found while testing, was that Starter switched off fund operations and with it a fund's own deal pipeline: modules are now split (`deals` is its own switch, in every fund plan).

## 4. Why these numbers

* **Fund Studio at 390** sits below the cost of one analyst-week a month and below the data-vendor tools a small manager already pays for; it is the plan intake sells.
* **Fund Pro at 990** replaces a fund administrator's reporting line for a small fund (administrators charge from a few thousand euros a quarter) while the ledger is deep enough to run a quarter-end (doc 37 §2.3).
* **Founder Raise at 149** is under what a founder spends on one data-vendor month or a deck designer's day, for a three-month need.
* **Gross margin:** AI at the cap is at most 15% of the price (Raise 30 of ~160 USD-equivalent is the worst case at 19% only if the cap is fully used; typical use is a small fraction), plus roughly 5 euros a month for the document converter and storage. At the caps every plan is above 75% gross margin; at typical use above 90%.

## 5. Scenarios (illustrative, to size the prize, not to forecast)

| In 12 months | Funds | Fund mix | Founders paying | ARR |
| --- | --- | --- | --- | --- |
| Slow | 5 | 3 Studio, 2 Pro | 15 Raise | about 41,000 |
| Base | 15 | 9 Studio, 5 Pro, 1 Institutional | 60 Raise, 10 Raise+ | about 175,000 |
| Strong | 40 | 22 Studio, 15 Pro, 3 Institutional | 150 Raise, 30 Raise+ | about 470,000 |

Funds carry about 70% of revenue in every scenario, which is why the roadmap (docs 37 and 39) leans on fund workflows and intake, and why founder outreach stays approval-gated and compliant.

## 6. How to learn price in the next 90 days

1. Run the **design-partner programme** with the two onboarded funds; agree in writing what they would pay on conversion, before the six months end (anchor: Studio 390 and Pro 990).
2. In every design-partner call ask the four price-sensitivity questions (too cheap to trust, a bargain, getting expensive, too expensive) and record the answers; five funds give a usable range.
3. Measure cost: 30 days of `ai_calls.cost_usd` per workspace now that it is recorded, then set the AI caps from observed use, not from this table.
4. Put **one founder cohort** on Raise at 149 and one at 99 (no discount codes, two prices) and watch conversion from Explore.
5. Do **not** publish prices on the site until two funds have said yes to a number.

## 7. Risks

| Risk | Answer |
| --- | --- |
| Funds will not pay a small studio price | The design-partner conversion test says so within a quarter; the catalogue is a table, not code |
| Founders use Explore for free forever | Explore's limits remove the cost; it only has to work as a funnel |
| AI cost spikes | Caps are enforced (monthly spend refuses further runs with a plain message); raise them per workspace in SAIL |
| A legal limit on cold outreach shrinks the founder product | Country gate and consent already enforced (doc 37 §8.3); the fund product does not depend on cold outreach |
| Pricing in EUR for US funds | Stripe supports both; add USD prices when the first US fund converts |

## 8. What changes in the product

`plan_catalog` carries persona, status, price and summary; the module split adds `deals`; SAIL shows the plan list with prices and hides retired plans; nothing is enforced until a plan is assigned (open by default). Stripe price ids are mapped when billing goes live (parked).
