# 30 — AI observability: resolution provenance, refused picks, and the stream that records nothing

**Status:** design, 2026-09-28. Implements doc 29 §10, whose two bullets are the
whole of the requirement:

> - **Resolution provenance per call** — which of §5's four rules chose the model.
>   "Why did that answer?" is otherwise unanswerable once four rules exist.
> - **Rejected picks** — a count of user choices refused, by reason. A high count
>   means the catalogue and the UI disagree, which is N5 recurring.

Doc 29 phase 1 is done: a user's model pick is honoured, and a refused pick is
reported on both surfaces and shown in the composer. What is missing is the
ability to answer *how often any of that happens*. This document is the design
for that, and it changes shape twice against the obvious implementation, because
tracing the code first turned up two things §10 did not know.

---

## 1. What is actually running, verified 2026-09-28

| Claim | Evidence |
| --- | --- |
| Every blocking AI call is recorded, one row per chain attempt | `lib/ai/provider.ts:299-323` — `recordAiCall` inside the `for (const [attempt, p] of chain.entries())` loop |
| A kill-switched task records a row under a pseudo-provider | `lib/ai/provider.ts:257-261`, `provider: "disabled"` |
| Telemetry never throws, never blocks, stores no prompt text | `lib/ai/usage.ts:12-26`, and the write swallows its own errors at `:92-96` |
| The table is additive and documented per column | `scripts/migrations/2026-09-21-ai-call-log.sql`, `…-21b-ai-call-attribution.sql` |
| Attribution is partial by design, and the dashboard says so | `lib/ai/usage.ts:125-129`, `attributed` counted separately |
| **A streamed call records nothing at all** | `lib/ai/provider.ts:1008-1087` contains no `recordAiCall` |
| Provenance is not derivable from an existing column | `lib/ai/provider.ts:284` — `opts.provider` is set by user picks *and* by internal callers |
| Only three of §5's four rules exist today | rule 2, `surfaces[surface]`, is doc 29 phase 2 |

### 1.1 The finding that reorders this work — O1

`generateStream()` never calls `recordAiCall`. A streamed call that *works*
produces **zero rows** in `ai_calls`.

It records only when it gives up and falls back to the blocking path — at
`provider.ts:1015` (provider not streamable), `:1036` (no key), `:1054` (fetch
threw), `:1056` (bad response), `:1086` (stream opened but produced nothing) —
each of which calls `generate()`, which reaches `generateDetailed()`, which
records. Three consequences, in increasing order of how much they matter:

1. **The busiest surface is invisible.** `/api/anker/chat` is ANKER AI's *default*
   mode (doc 29 §9 phase 1 says exactly this, which is why phase 1 had to cover
   it), and it streams. Whenever it works, nothing is written.

2. **`aiUsageSummary` is computed over a biased population.** `failureRate`,
   `p50`/`p95` duration and the token totals (`usage.ts:153-161`) all describe
   blocking calls plus *failed* streams, and are presented as the platform's
   numbers.

3. **Streaming failures are recorded as successes of a different call shape.**
   The fallback is what writes the row, so a stream that died and was rescued
   appears as one ordinary blocking call that went fine. The streaming failure
   rate is therefore not merely unknown — it is actively misreported, and it
   looks best when streaming is at its worst.

This lands before provenance, not after. Provenance added to `generateDetailed`
alone would be provenance for the subset of traffic that is already visible,
which is the subset that needed it least.

### 1.2 Provenance must be passed, not inferred — O2

The tempting implementation is to derive the rule from what `generateDetailed`
already has: `opts.provider` set means a request pick, `cfg.providerOverride`
means the global break-glass, neither means the automatic chain.

That is wrong. `opts.provider` is *also* how internal callers pin a provider for
their own reasons — that is its documented purpose (`provider.ts:46-50`, "letting
the UI pick … for one run"). Phase 1's honoured pick arrives the same way
(`app/api/anker/chat/route.ts:44`, `app/api/assistant/route.ts:61`). A row cannot
distinguish "a user chose Qwen" from "the extraction pipeline pins Qwen", and a
provenance column that conflates those answers the opposite of the question §10
asks.

So `resolution` is an explicit field the caller may set, with provider.ts
inferring the two cases it genuinely does own (`global`, `auto`).

### 1.3 Three rules, not four — O3

§10 says "which of §5's four rules chose the model". Rule 2 is
`surfaces[surface]`, which doc 29 phase 2 introduces and which does not exist
today. Recording an enum of four values now would mean one value that can never
appear, and an operator reading a dashboard cannot tell "never happens" from "not
built yet".

`resolution` is therefore **text, not a constrained type**, carrying the three
reachable values now, so phase 2 adds `surface` with no migration and no
deploy-ordering problem.

### 1.4 A refusal is per request; a row is per attempt — O4

`recordAiCall` fires once per chain attempt (`provider.ts:299-323`), and an agent
run makes many calls across many steps. Putting `requested_model` /
`rejection_reason` on every row and counting them would inflate one user refusal
by failover depth × agent step count — so §10's "count of user choices refused"
would be wrongest exactly when the platform is least healthy.

A refusal happens **once per request**, where `resolveModelChoice()` runs
(`app/api/anker/chat/route.ts:43`, `app/api/assistant/route.ts:60`). That is
where it gets recorded.

---

## 2. Data model

Three additive columns on `ai_calls`. No new table: a refusal is not a call to a
provider, and the table already has a convention for that.

```sql
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS resolution      text;
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS requested_model text;
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS streamed        boolean NOT NULL DEFAULT false;
```

| Column | Meaning | Null when |
| --- | --- | --- |
| `resolution` | Which of §5's rules chose the model: `request`, `global`, `auto`, and later `surface` | The row predates this change, or no model was chosen (`disabled`, `rejected`) |
| `requested_model` | The id the **user** asked for. Set only when a user expressed a preference, so `IS NOT NULL` is the population "a pick was made" | No user pick — most rows |
| `streamed` | The call was served by `generateStream` | Never; defaults false, which is true of every existing row |

**`provider = 'rejected'` for a refused pick**, following the `'disabled'`
precedent already in the table (`provider.ts:259`, and the migration comment that
explains why a suppressed call is separable from a failed one). A refusal is like
a kill switch and unlike a failure: no provider was asked, so counting it as an
outage would be a lie. On such a row `requested_model` is the refused id and
`error` is the reason (`unknown` / `not-conversational`), reusing the existing
short-reason column exactly as `'disabled'` reuses it.

**This creates a trap on the read side.** `usage.ts:154` counts failures as
`NOT ok AND provider <> 'disabled'`. A `'rejected'` row has `ok = false`, so
without a matching exclusion it inflates the failure rate — a silent,
plausible-looking regression in a number operators trust. The read change is part
of this slice, not a follow-up.

### 2.1 Existing rows are not backfilled

Every row written before this lands gets `resolution = NULL`. We do not know
which rule chose those models, and inventing a value would poison the first
dashboard that groups by it.

The precedent is already in the codebase: `attributed` exists because attribution
is partial, and the dashboard reports what fraction it covers rather than
implying totality (`usage.ts:125-129`). Provenance gets the same treatment — a
`provenanceKnown` count beside the breakdown, so a reader can see the window is
partly pre-migration.

---

## 3. Enforcement points

| Change | Where | Why there |
| --- | --- | --- |
| Record streamed calls (O1) | `lib/ai/provider.ts` `generateStream` | The only place that knows the stream's real outcome; its fallbacks already record themselves |
| `resolution` field on `GenerateOpts`, inferred `global`/`auto` | `lib/ai/provider.ts` | It owns the chain decision at `:282-288` |
| `resolution: "request"` on an honoured pick | both routes, beside the existing override | The route is the only layer that knows a *user* chose |
| Record a refusal, once | both routes, where `resolveModelChoice` returns `honoured: false` | Once per request by construction (O4) |
| Exclude `'rejected'` from failures; expose the new dimensions | `lib/ai/usage.ts` | Or the failure rate silently breaks (§2) |

`generateStream` must honour the module's three rules (`usage.ts:12-26`):
fire-and-forget, never throws, no prompt text. A streamed row is written once the
outcome is known — after the reader finishes or a fallback is chosen — not at
open, so `ok` and `durationMs` mean the same thing they mean on a blocking row.

---

## 4. Out of scope

- **The surface dimension** (doc 29 phase 2). `resolution = 'surface'` is
  reserved and unreachable until then; §1.3 is why that is safe.
- **Naming the substitute model in the composer's notice.** Doc 29 phase 1 left
  the notice saying "the default" because neither route knows what answered. This
  slice makes the model knowable in the record, but the notice needs it back *in
  the response*, which is a separate change to both routes' return shape. Worth
  doing next; not free, so not smuggled in here.
- **Money** (doc 29 phase 4). Tokens are already recorded; converting them to
  cost is that phase's decision.
- **Prompt or completion text.** Rule 3 of `usage.ts` stands, permanently.
- **A dashboard UI.** `/api/admin/ai-usage` gains the fields; rendering them is a
  separate, smaller piece once there is data worth looking at.

## 5. Acceptance

1. A streamed request that succeeds writes exactly one row with `streamed = true`
   and `ok = true` — today it writes none.
2. A streamed request that falls back is distinguishable from a blocking call: a
   `streamed` row with the failure, plus the fallback's own rows.
3. A user pick that is honoured writes rows with `resolution = 'request'` and
   `requested_model` set; the same call made by an internal caller pinning a
   provider writes `resolution = 'auto'`/`'global'` and no `requested_model`
   (this is O2, and is the assertion that would fail if provenance were inferred).
4. A refused pick writes exactly **one** row, `provider = 'rejected'`, with the
   reason in `error` — not one per attempt, and not one per agent step.
5. `failureRate` is unchanged by the presence of refused picks.
6. `aiUsageSummary` reports how much of the window has known provenance.

Each assertion is mutation-tested the way doc 29 phase 1's were: reverting the
line it guards must fail that test and only that test.

## 6. Migration path

One file, `scripts/migrations/2026-09-28-ai-call-provenance.sql`, additive, all
statements `IF NOT EXISTS`, no backfill (§2.1), safe to apply before the code
that writes the columns.

Run the **single file**, not `--all`:

```bash
node scripts/oneshot/run-migration.mjs scripts/migrations/2026-09-28-ai-call-provenance.sql
```

`pnpm migrate` is `run-migration.mjs --all` (`package.json:13`) and the ledger
reports already-applied work as pending, so `--all` would attempt unrelated
migrations. The runner reads `NEON_DATABASE_URL` / `DATABASE_URL` — **it targets
the live database, not a local one.** Applying this is a deliberate act, taken
with the owner, not a side effect of building.

Rollback: the columns are additive and nullable (`streamed` defaults false), so
older code ignores them and reverting the deploy needs no schema change.
