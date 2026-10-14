# 52. Spec: credits for the Media Studio, and reference images

Status: **C1 (credits), C2 (SAIL) and C3 (reference images) built (section 12); a live check of reference images is still to do.** Builds on docs 41 (entitlements), 47 and 48 (the studio). Prompted by a customer workspace (Serian Media) hitting "Generation allowance reached: 3 active jobs, 20 requests per person daily and 30 per workspace" on 2026-10-14.

## 1. The problem, in what the code does today
- The only brake on generation is **inside the database function that reserves a job** (`reserve_ai_studio_job`): at most 30 jobs per workspace per day, 20 per person per day, and 3 active jobs per person. They are fixed numbers in SQL.
- It counts requests, not cost. A 3-cent image and a 15-second 1080p video use the same one of the 30 requests, so a customer is stopped long before the money matters, and an expensive video costs us far more than it counts.
- Nobody can change it for one customer without a migration. There is no way for support to reward a partner, give a trial more room, or see how much was used. The message the customer sees gives no way forward.
- Two workspaces use the studio today (28 and 18 jobs in all), so a change now touches few people.
- Separately, **images cannot be attached to guide a picture**. An image upload exists only for the edit models ("Image to edit") and for a video's start frame; a person writing an image prompt cannot attach a reference.

## 2. Credits
A **credit** is a unit of generation spend. **1 credit is about $0.001 of provider cost**, so 1,000 credits is about a dollar. The rates (section 3) are estimates chosen to sit slightly above what the provider charges, kept in a table so they can be corrected from real invoices without a release.

**The allowance.** Each workspace has a **daily allowance** shared by its members, **1,000 credits by default**. It resets at **00:00 UTC**. It is resolved the way every limit is (doc 41): the workspace's own override, else its plan, else the platform default; `null` means unlimited (the internal plan). The new limit key is `ai_studio_daily_credits`. A person's personal scope (an LP making their own media) has its own pool at the platform default.

**Bonus credits.** An operator can grant extra credits to a workspace in SAIL, with a reason and an optional expiry. They are spent **after** the day's allowance, do not reset at midnight, and are the way to reward a partner or compensate for a problem. **Version 1 has no expiry** (tracking a partly spent grant that expires is not worth the complexity); an operator takes unspent bonus credits back with a revoke.

**Plan defaults** (daily credits, set in `plan_catalog`; a workspace with no plan gets 1,000): `founder_explore` 1,000 · `starter` 1,000 · `founder_raise` 2,000 · `fund_studio` 3,000 · `founder_raise_plus` 4,000 · `pro` 5,000 · `design_partner` 5,000 · `fund_pro` 6,000 · `scale` 10,000 · `fund_institutional` 15,000 · `lp_access` 300 · `internal` unlimited. These line up with each plan's existing monthly AI-spend ceiling (for example 1,000 credits a day is about $30 a month of generation, against Founder Raise's $30).

## 3. What things cost
| What | Credits (default) |
|---|---|
| Image, standard (Qwen-Image 2.0, Plus; Wan 2.6 text-to-image) | 30 |
| Image, premium (Qwen-Image 2.0 Pro, Max; Wan 2.7 Image Pro) | 60 to 80 |
| Image, fast (Z-Image Turbo) | 10 |
| Image edit or with reference images (Qwen-Image Edit Plus, Max) | 40 / 80 |
| Video, Wan 2.7 | **50 per second at 720p, 100 per second at 1080p** |
| Video, HappyHorse 1.1 | 60 per second at 720p, 120 per second at 1080p |
| Spoken voice track | 10 per request (**not charged in version 1**: speech keeps its own separate daily allowance of voice requests, and moves to credits later) |
So a 5-second 720p Wan clip is 250 credits and a 10-second one is 500; a 15-second 1080p clip is 1,500 and needs a bigger allowance or a bonus. The estimate is shown **before** the person presses Generate. Rates live in `ai_studio_credit_rates` (model, resolution, per job or per second, credits, active) and SAIL can edit them. A request for a model with no rate is refused with a clear message, never charged zero.

## 4. How a charge works
- **Charged at reservation, in the same database step that creates the job**, under the workspace lock the reservation already takes, so two people cannot spend the same credits. Not enough credits: **HTTP 402**, and the message says what is missing: "This needs 250 credits; 90 are left today. They reset at 00:00 UTC. Ask your administrator for more, or choose a smaller option."
- The day's allowance is used first, then bonus credits. Each charge writes a row in an **append-only ledger** (`ai_studio_credit_ledger`: workspace, person, job, kind `spend`, `refund`, `grant`, `revoke`, `adjust`, credits, source `daily` or `bonus`, reason, actor, expiry, time). The balance is always derived from the ledger, never stored.
- **Refunds.** A job that ends `failed`, `blocked` or `canceled` before producing anything is refunded once (a unique key on the job and kind makes a repeat harmless). An `uncertain` job (the provider may have charged us) stays charged until it settles. A job that completes keeps its charge.
- **What stays.** The cap of 3 active jobs per person (it protects the provider queue, not the budget), plus a **backstop of 300 jobs a day per workspace** against a runaway script. The 20 and 30 request caps are removed.
- **The API.** `GET /api/anker/studio` returns `credits`: `{ allowance, usedToday, bonus, remaining, resetsAt, unlimited }`. A refused POST returns the same block so the screen can update.

## 5. In the studio
A credits line in the header ("Credits today: 640 of 1,000 · bonus 200 · resets in 6 h"); the Generate button shows its cost ("Generate · 250 credits") and is disabled with the reason when it cannot be afforded; the refusal message above; a low-credits hint at 20%. Accessible text for all of it, and the same on a phone.

## 6. In SAIL
On a workspace's page, a **Studio credits** panel: the effective daily allowance and where it comes from (override, plan or default), used today, bonus balance, the last 7 days, and the recent ledger. Operator actions, each needing a reason of at least 10 characters, an audit entry and a line in the workspace's own access log (the pattern of doc 41):
- **Grant bonus credits** (1 to 100,000, no expiry in version 1). Admin role. Above 20,000, superadmin.
- **Revoke** unspent bonus credits.
- **Set the daily allowance** for this workspace (or clear it to fall back to the plan).
- **Change the plan** (the existing control). Upgrading a tier changes the allowance immediately.
- A platform-level **rates** screen to edit the table in section 3.

## 7. Reference images
- A person can **attach up to 3 images** to an image prompt. They are sent to the provider with the prompt, as the edit models already accept. The prompt is written as "use the pose of image 1 and the colours of image 2".
- Models that take references: **Qwen-Image Edit Plus and Max**, up to 3 each. **Wan 2.7 Image Pro is left out until its handling of input images is checked against the live API**; the catalogue has one number per model (`refs`) to turn it on. The picker marks them. If a person attaches images while a text-only model is chosen, the studio **switches to Qwen-Image Edit Plus** and says so; the API refuses the combination with a clear message.
- New field `referenceAssetIds` (up to 3 asset ids the person owns). `sourceAssetId` stays for start frames and single edits. The provider receives `[image1, image2, image3, text]`.
- **Provider access.** Today one short-lived link is made per job for its one source image. A job with several images keeps **one** token; the link route accepts an asset id that is the job's source or one of its listed references and nothing else.
- Uploads reuse the existing route (images under 3 MB, signature checked, SVG refused). The page says the images are sent to the generation provider, and warns not to attach images of people who have not agreed.

## 8. Tests
Cost function (every model and resolution, durations, no zero); allowance resolution (override, plan, default, unlimited); charge order (daily then bonus); the reset at midnight UTC; a charge refused for lack of credits with the exact message; two simultaneous requests cannot overspend; refund once for failed, blocked and canceled jobs, none for uncertain, none for completed; bonus expiry; SAIL grants need a reason and the right role and write an audit entry; reference-image validation (count, ownership, model support, auto-switch); one token serves exactly the listed assets; tenant isolation of the ledger; the existing studio tests unchanged.

## 9. Slices
1. **C1, credits core:** migration (ledger, rates, limit key, plan defaults), the charge in the reservation, refunds, the credits block in the API, the studio header, cost on the button.
2. **C2, SAIL:** the panel and actions, the rates screen.
3. **C3, reference images:** schema, provider mapping, token route, picker and strip in the studio.
Each slice is tested and deployed on its own.

## 10. Decisions for the founder (defaults chosen; change any)
1. **Pool per workspace** (shared by members), not per person. A per-person share can be added later.
2. **Daily reset at 00:00 UTC.**
3. **Bonus credits do not reset daily and do not expire** (revoke takes back what is unspent).
4. **The credit values in section 3** are estimates to be compared with real invoices after a week.
5. **Existing customers** (no plan) all start at 1,000 credits a day.

## 11. Not in scope
Selling credit packs (a top-up purchase through billing is the natural next step); per-person quotas; metering other AI features with credits (the assistant keeps its monthly USD ceiling); refunding a completed job that the person dislikes.

## 12. Build status (2026-10-14)
**C1, the credits core, is built, tested and applied to production** (migration `2026-10-14-ai-studio-credits`).
- `credit-cost.ts` (pure, used by the browser too) and `credits.ts`: the price list (14 default rates, overridden by the `ai_studio_credit_rates` table), the allowance (plan or override, `-1` unlimited, else 1,000), the derived balance, and the refund sweep.
- `reserve_ai_studio_job_v2`: the reservation and the charge in one step under the workspace lock; outcomes `ok`, `replay`, `credits`, `active`, `backstop`. The old function remains, unused. The caps of 30 and 20 requests a day are gone; the 3 running jobs per person and a backstop of 300 a day stay.
- Refunds: a job that ends failed, blocked or canceled gets its credits back once (a unique key), by the request that ended it and by a sweep in the minute cron; an uncertain job stays charged until it settles; a refund counts against the day of the spend.
- `GET /api/anker/studio` returns `credits` and `rates`. The studio shows "Credits today: 640 of 1,000 · bonus 200", a progress bar, the reset time, the price on the Generate button, and disables it with the exact reason when it cannot be paid. A refusal is HTTP 402 with the message of section 4.
- Every plan has its daily allowance (section 2); a workspace with no plan (both current studio users) gets 1,000. 21 new tests plus the 38 existing studio tests; the whole suite passes (1,616).
**Not built yet:** C2 (SAIL panel and rates screen, so for now an operator cannot grant bonus credits except in the database) and C3 (reference images).

**C2, SAIL (2026-10-14), live in SAIL.** `lib/studio-credits.ts` and two pages. A workspace's **Studio credits** page shows the daily allowance and where it comes from (this workspace, its plan or the default), used today, the bonus balance, the last 7 days and the recent ledger, and lets an admin **give bonus credits** (1 to 100,000; above 20,000 needs a superadmin) or **take back** unspent ones. Every action needs a reason of at least 10 characters, is audited, and is written to the workspace's own access log. The **daily allowance** is the new "AI Studio credits per day" limit on the plan and overrides form (blank follows the plan; "unlimited" is stored as -1, because an absent limit means the 1,000 default). A **Studio price list** page (Governance) edits the rates with a reason and an audit of the before and after. 11 tests; SAIL's 95 pass.

**C3, reference images (2026-10-14), built and tested.** `referenceAssetIds` (up to 3) on image requests; `refs` per model in the catalogue (the two Qwen edit models: 3); the provider receives the images first, in order, then the prompt; one link token per job and the link route serves only the assets that job lists (a stray image of the same person, a request with no asset, or the wrong token each get 404); an image to edit still works the old way. The studio has a **Reference images** strip (add up to 3, remove, numbered 1 to 3 to match the prompt), switches to Qwen-Image Edit Plus when images are attached to a model that cannot use them and says so, and blocks the button with the reason if the person picks such a model afterwards. Reusing a past creation restores its references. **Not yet done:** a live generation with three real images to confirm the provider's output, and the Wan 2.7 Image Pro check above.
