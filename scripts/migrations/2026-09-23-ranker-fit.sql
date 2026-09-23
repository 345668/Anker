-- The learned ranker (docs/architecture/17): let the evidence in, and give the
-- fits somewhere to live.

-- 1. match_outcome_events has been refusing every founder run's evidence.
--
-- saveRun (lib/matching/v2/founder-runs.ts) writes source = 'founder_match',
-- but the CHECK from 2026-07-24 lists four sources and not that one. Every
-- match_shown insert therefore failed, and the caller's .catch swallowed it to
-- a console warning — which is why doc 17 §6 counted 0 events. The recording
-- was never the thing that was missing.
ALTER TABLE match_outcome_events DROP CONSTRAINT IF EXISTS match_outcome_events_source_check;
ALTER TABLE match_outcome_events ADD CONSTRAINT match_outcome_events_source_check
  CHECK (source IN ('crm_entry', 'lp_firm_match', 'lp_contact_match', 'outreach', 'founder_match'));

-- 2. matching_weight_history predates this repo's migrations — it exists in the
-- database but has never been defined here, so a fresh environment could not
-- build it. This is the definition, written to match what is already there.
CREATE TABLE IF NOT EXISTS matching_weight_history (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id          text,
  weights          jsonb NOT NULL,
  previous_weights jsonb,
  trigger_type     text,
  signal_counts    jsonb,
  is_active        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- Columns the platform-wide fit needs (also applied by 2026-09-23-listings-activity-ranker.sql).
ALTER TABLE matching_weight_history
  ADD COLUMN IF NOT EXISTS scope   text,
  ADD COLUMN IF NOT EXISTS metrics jsonb,
  ADD COLUMN IF NOT EXISTS engine  text;
ALTER TABLE matching_weight_history ALTER COLUMN user_id DROP NOT NULL;

-- One active row per engine is read on every matching run.
CREATE INDEX IF NOT EXISTS matching_weight_history_active_idx
  ON matching_weight_history (engine, is_active, created_at DESC);

-- Label assembly joins results to the founder's own CRM rows.
CREATE INDEX IF NOT EXISTS crm_entries_user_firm_idx ON crm_entries (user_id, firm_id);
CREATE INDEX IF NOT EXISTS crm_entries_user_investor_idx ON crm_entries (user_id, investor_id);
