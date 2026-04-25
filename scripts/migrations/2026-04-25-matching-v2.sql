-- ─────────────────────────────────────────────────────────────────────────
-- Matching v2 schema migration.
--
-- Adds the columns the v2 engine writes that the original v1 schema didn't
-- have: funnel_data, segment_counts, ai_enrichments_applied, duplicates_merged,
-- engine_version on the session table; firm_aum_usd, why_this_lp, segments,
-- stage, owner on lp_firm_matches; why_this_lp, segments, hnw_signals,
-- stage, owner on lp_contact_matches.
--
-- Plus a new lp_match_audit table for stage-change history, and new optional
-- columns on fund_profiles for primary_sectors, fund_number, average_ticket,
-- and fund-I re-up tracking.
--
-- All columns are added IF NOT EXISTS so this is idempotent and safe to
-- run on a v1 database.
-- ─────────────────────────────────────────────────────────────────────────

-- ─── lp_match_sessions ─────────────────────────────────────────────────────
ALTER TABLE lp_match_sessions ADD COLUMN IF NOT EXISTS funnel_data JSONB;
ALTER TABLE lp_match_sessions ADD COLUMN IF NOT EXISTS segment_counts JSONB;
ALTER TABLE lp_match_sessions ADD COLUMN IF NOT EXISTS ai_enrichments_applied INT DEFAULT 0;
ALTER TABLE lp_match_sessions ADD COLUMN IF NOT EXISTS duplicates_merged INT DEFAULT 0;
ALTER TABLE lp_match_sessions ADD COLUMN IF NOT EXISTS engine_version TEXT DEFAULT 'v1';

-- ─── lp_firm_matches ───────────────────────────────────────────────────────
ALTER TABLE lp_firm_matches ADD COLUMN IF NOT EXISTS firm_aum_usd FLOAT8;
ALTER TABLE lp_firm_matches ADD COLUMN IF NOT EXISTS why_this_lp TEXT;
ALTER TABLE lp_firm_matches ADD COLUMN IF NOT EXISTS segments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE lp_firm_matches ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'identified';
ALTER TABLE lp_firm_matches ADD COLUMN IF NOT EXISTS owner TEXT;

CREATE INDEX IF NOT EXISTS lp_firm_matches_session_score_idx
  ON lp_firm_matches (session_id, score DESC);
CREATE INDEX IF NOT EXISTS lp_firm_matches_stage_idx
  ON lp_firm_matches (fund_profile_id, stage);

-- ─── lp_contact_matches ────────────────────────────────────────────────────
ALTER TABLE lp_contact_matches ADD COLUMN IF NOT EXISTS why_this_lp TEXT;
ALTER TABLE lp_contact_matches ADD COLUMN IF NOT EXISTS segments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE lp_contact_matches ADD COLUMN IF NOT EXISTS hnw_signals JSONB DEFAULT '[]'::jsonb;
ALTER TABLE lp_contact_matches ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'identified';
ALTER TABLE lp_contact_matches ADD COLUMN IF NOT EXISTS owner TEXT;

CREATE INDEX IF NOT EXISTS lp_contact_matches_session_score_idx
  ON lp_contact_matches (session_id, score DESC);
CREATE INDEX IF NOT EXISTS lp_contact_matches_stage_idx
  ON lp_contact_matches (fund_profile_id, stage);

-- ─── fund_profiles ─────────────────────────────────────────────────────────
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS fund_number INT;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS average_ticket NUMERIC;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS primary_sectors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS fund_i_prior_lp_firm_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS fund_i_prior_contact_emails JSONB DEFAULT '[]'::jsonb;

-- ─── lp_match_audit (new) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lp_match_audit (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('firm', 'contact')),
  prev_stage TEXT,
  new_stage TEXT NOT NULL,
  notes TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lp_match_audit_match_idx
  ON lp_match_audit (match_id, created_at DESC);
