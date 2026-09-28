-- Provenance and refused picks for ai_calls. Doc 30; implements doc 29 §10.
--
-- Two questions the table could not answer. "Why did that model answer?" —
-- because the user picked it, because an admin pinned a provider globally, or
-- because the automatic chain chose. And "how often is a user's pick refused?",
-- which is the number that says whether the model catalogue and the picker have
-- drifted apart.
--
-- A third thing turned up while tracing the code for the first two, and it is
-- the reason this migration also adds `streamed`: generateStream() never
-- recorded anything. A streamed call that SUCCEEDED wrote no row at all, so the
-- busiest surface in the platform (/api/anker/chat, ANKER AI's default mode) was
-- absent from this table whenever it worked, and a stream that failed and was
-- rescued by the blocking fallback was recorded as one ordinary call that went
-- fine. Without a flag, fixing that would make streamed and blocking calls
-- indistinguishable and the old rows retroactively ambiguous.

-- Which of doc 29 §5's resolution rules chose the model.
--
-- TEXT, deliberately, not an enum or a CHECK: only three of the four rules exist
-- today ('request', 'global', 'auto'). 'surface' arrives with doc 29 phase 2, and
-- a constrained type would either need a migration in lockstep with that deploy,
-- or would carry a value that can never appear — which an operator cannot
-- distinguish from one that simply never happens.
--
-- Null for every row written before this lands. NOT backfilled: we do not know
-- which rule chose those models, and a guess would poison the first dashboard
-- that groups by this column. lib/ai/usage.ts reports how much of a window has
-- known provenance, the same way it already reports what fraction of rows carry
-- attribution.
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS resolution text;

-- The model id the USER asked for, set only when a user actually expressed a
-- preference. So `requested_model IS NOT NULL` is exactly the population "a pick
-- was made", which is the denominator for the refusal rate.
--
-- Distinct from `model`, which is what answered. On an honoured pick they match;
-- on a refused one `model` is what the router chose instead (or null, when the
-- refusal is recorded before any provider is asked) and this column is the id
-- that was turned down.
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS requested_model text;

-- The call was served by generateStream rather than the blocking path.
--
-- Defaults false, which is true of every existing row: nothing streamed was ever
-- recorded, so there is no row for which false is a lie.
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS streamed boolean NOT NULL DEFAULT false;

-- A refused pick is written as provider = 'rejected', following the 'disabled'
-- pseudo-provider this table already uses for a call a kill switch stopped. The
-- reason ('unknown' / 'not-conversational') goes in `error`, exactly as a
-- suppressed call puts 'task disabled by admin' there.
--
-- Both are alike in the way that matters: no provider was asked, so neither is
-- an outage. lib/ai/usage.ts must exclude 'rejected' from its failure count for
-- the same reason it already excludes 'disabled' — a refusal that counted as a
-- failure would inflate the failure rate with something that is working as
-- designed.
--
-- Partial index: refusals are a small fraction of rows and are always read as
-- "how many, by reason, in this window".
CREATE INDEX IF NOT EXISTS ai_calls_rejected_idx
  ON ai_calls (created_at DESC) WHERE provider = 'rejected';

-- Provenance is read as a grouping over a time window.
CREATE INDEX IF NOT EXISTS ai_calls_resolution_idx
  ON ai_calls (resolution, created_at DESC) WHERE resolution IS NOT NULL;
