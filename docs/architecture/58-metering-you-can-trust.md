# 58. Spec: metering you can trust (cost record, one `meter`, one gate)

Status: **spec. Nothing is built.** Implements doc 37 section 5.5 and 7.3 (gap G11, ordering item 3 of section 19.2), re-scoped after measuring production on 2026-10-16. Builds on 41 (entitlements), 42 (plans), 46 (send limits), 52 (studio credits), 56 (alerts) and 57 (Telegram, which adds paid speech calls).

## 1. What production shows (2026-10-16, last 30 days)
Doc 37 said "nothing debits credits". That is out of date in one way and worse in another.
- **The gate exists.** `assertAllowed`, `assertWithinLimit("ai_spend_usd_month")` and the studio's own credit check are called by the assistant, the studio, agents, intake, convert and sends.
- **But the number it reads is mostly missing.** `ai_calls` has 3,290 calls; **175 (5%) carry a cost** and **518 (16%) carry a workspace**. The monthly spend limit sums `cost_usd` per workspace, so a workspace could use a lot and the limit would see almost none of it.
- **Why the cost is missing:**
  - 1,174 calls to `mistral-small-latest`, 93 to `glm-5.2` and a few others have **no price in the model catalog**, so `costOf` returns null.
  - 1,747 `qwen-flash` calls have a price but **1,349 of them have no token counts** (the provider did not return usage on that path), so the cost is null.
  - Of the 3,290 calls, 2,549 are the `ai_rationale` background task and 169 are `enrich_extract`: **platform jobs with no workspace**, which is correct to be unattributed to a customer but is currently indistinguishable from a bug.
- **Whole classes of paid calls never reach `ai_calls`:** speech to text (Telegram voice notes and Halyard), text to speech (spoken replies, studio voice), embeddings, PDF vision/OCR, and image/video generation (the studio has its own credit table, 47 jobs, in different units). Doc 57 T3/T4 added the first two at user-chosen volume, capped only by a count.
- **There is no cost per job.** Doc 37 7.3 step 2 (cost of a matching run, an LP report) cannot be answered.
- Total recorded spend is **$1.03 in 30 days**. The free tier is doing the work today, so nothing is wrong yet. It becomes wrong the day a paying customer is on a plan with a limit.

**The conclusion:** do not build a credit currency for text. A dollar allowance already exists as an entitlement. Make the dollar number true, add the missing meters, and put one gate in front of everything. Build a prepaid credit ledger only when a customer needs prepaid packs (section 8).

## 2. Principles
1. **An unpriced call is a visible fault, not a zero.** Every call ends with a cost, an estimated cost, or a loud "unpriced" mark that an alert counts.
2. **Every cost has an owner:** `workspace:<id>` or `platform:<job>`. Null is not allowed.
3. **List price versus bill.** We record the list price of the model used (conservative, already the rule in `costOf`). Free-tier use is flagged `free_lane` so the real bill can be reconciled monthly, but the customer's allowance counts list price, so a plan means the same thing whichever lane served it.
4. **One gate, one meter** for everything with a unit cost: `can()` before, `meter()` after.
5. **Degrade, don't break.** Exhausted allowance means the free lane or a plain-words message (doc 37 5.5), never an error page.
6. **Metering never blocks the work it measures.** A failed insert is logged and counted; the call's result is returned.

## 3. The cost record (M1)
- **Model price table** `model_prices` (model id, provider, unit price in/out per million tokens, other unit prices, `effective_from`, source note), editable in SAIL, seeded from `model-catalog.ts`. The catalog stays as the list of known models; prices move to the table so a change needs no deploy. Unknown model: the call records `cost_state = 'unpriced'` and the alert in section 7 fires.
- **Token fallback.** When the provider returns no usage, estimate tokens (characters / 4 in, characters / 4 out) and record `cost_state = 'estimated'`. Real usage records `'exact'`. The monthly limit counts all three.
- **Owner column.** `ai_calls.cost_center text NOT NULL DEFAULT 'unknown'` with values `workspace:<id>` / `platform:<job>`; background tasks (`ai_rationale`, `enrich_extract`, directory jobs) are tagged at the call site. `workspace_id` stays.
- **Backfill** (additive, one migration): re-price existing rows that have tokens and a now-known model; mark the rest `unpriced`/`estimated`. Never rewrite a row that already has an exact cost.
- Acceptance: on a replay of the last 30 days, `unpriced` is under 1% and every row has a cost center.

## 4. One meter for everything else (M2)
- Table `usage_events` (id, org or platform owner, `unit`, `qty`, `unit_cost`, `cost_usd`, `cost_state`, `source` = task or route, `ref` = run id, job id or update id, `created_at`). Append-only, no content, registered for tenant export and erasure (anonymised like `ai_calls`).
- `meter(owner, unit, qty, ref)` computes cost from `model_prices`/a `unit_prices` row and inserts. Units: `asr_second`, `tts_char`, `embed_token`, `vision_page`, `image`, `video_second`, `sms`/`email` only if they ever cost.
- Wired at the existing choke points, one line each: `transcribeAudio`, `speakLine`, `embeddings.ts`, `pdf-vision.ts`/`pdf-ocr.ts`, the studio service (which keeps its own credits and also writes a `usage_events` row so unit economics see it).
- `usageThisMonth` becomes the sum of `ai_calls` and `usage_events` for the workspace. The Telegram daily counts of doc 57 stay as the abuse limit; the dollars now also count toward the monthly allowance.

## 5. One gate (M3)
- `can(orgId, capability, { estimate })` wraps today's `assertAllowed` + `assertWithinLimit`: lifecycle, feature switch, and **remaining monthly allowance against an estimate** (a deck analysis estimates from page count; a voice note from its duration; a chat turn from a fixed small number), so one big job cannot overshoot by a lot.
- **Degrade rules**, one table: chat and drafting fall to the free lane; speech, vision and embeddings stop with a one-line message and a link to usage; studio keeps its credits; sends keep their own limits (doc 46).
- **Warnings at 80% and 100%** of the allowance: an in-app banner (and a Telegram note for linked devices that opted in), once per threshold per month, via the existing notification path.
- **Usage page for the workspace** ("Used $X of $Y this month, by area") and a **SAIL Unit economics page**: cost per workspace, per task and per completed job (matching run, LP report, voice note), margin against plan price, free-lane share, and the reconciliation line (list price versus provider bill, entered monthly by the founder).

## 6. Cost per job (M3, small)
`run_id`/`ref` already tie calls to runs. A view `job_costs` groups calls and usage events by run id and job type and reports p50/p95 per job type. This is the number doc 42 needs before any usage-based price is published.

## 7. Alerts (doc 56 engine, M1)
New rules: **cost coverage** (share of last-24h calls with an exact or estimated cost under 95%, warn), **unpriced model** (any `unpriced` call, warn, runbook "add the price in SAIL"), **uncosted route** (a metered route logged nothing for 7 days while its cron or feature is on, info), **workspace at 100%** (info to the operator, so a customer hitting the wall is known).

## 8. Credit ledger: not now
A prepaid ledger (`credit_ledger`: grants, debits, expiries, rollover) is needed only if a customer wants prepaid packs, rollover, or usage priced in a unit other than dollars. None does. The studio already has its own credits, and the dollar allowance covers the rest. **Trigger to build:** a paying customer asks for prepaid usage, or plan design (doc 42) moves from "AI included up to $X" to sold credit packs. Then `credit_ledger` is added beside `usage_events`, and `meter()` debits it. Nothing in M1 to M3 blocks that.

## 9. Tests
Pricing: known model exact, unknown model unpriced, missing tokens estimated, free-lane flagged. Every call site gets an owner. `meter()` per unit with a fixture price. `usageThisMonth` sums both tables. Gate: estimate over remaining refuses; exactly at the limit; unlimited (-1/null); degrade table per capability. Warning once per threshold per month. Metering failure does not fail the call. Erasure and export cover `usage_events` and `model_prices` is platform data. Backfill idempotent.

## 10. Slices
- **M1 (about 2 days):** `model_prices` + SAIL editor, estimate fallback, cost center, backfill, cost-coverage and unpriced alerts. This alone makes the existing monthly limit tell the truth.
- **M2 (about 2 days):** `usage_events`, `meter()`, wiring for ASR, TTS, embeddings, vision, studio; `usageThisMonth` merge.
- **M3 (about 3 days):** estimate-based `can()`, degrade table, 80/100% warnings, workspace usage page, SAIL Unit economics and `job_costs`.
- **M4 (not built):** credit ledger, on the trigger in section 8.

## 11. Decisions for the founder (defaults chosen; change any)
1. **Allowance counts list price even on the free lane** (default yes: a plan means the same thing whichever lane serves it; the free lane then shows up as margin).
2. **Estimated costs count toward the limit** (default yes; the safe direction).
3. **Warn at 80% and 100%**; hard stop only for speech/vision/embeddings, free-lane fallback for chat (default as in section 5).
4. **No credit currency for text now** (default yes; section 8).
5. **Reconciliation:** you enter the provider bill monthly in SAIL (default; no billing-API integration).

## 12. Not in scope
Publishing usage-based prices (needs M3 numbers first, doc 37 7.3); invoicing from usage; per-seat cost allocation; metering of the Halyard desktop app's local models; changing any plan limit.
