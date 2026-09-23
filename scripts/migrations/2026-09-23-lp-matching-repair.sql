-- Make the LP matching tables match the engine that writes to them
-- (docs/architecture/18 §1).
--
-- Both LP engines score correctly and then throw on their first insert: the
-- session table is missing 15 of the 19 columns v2 writes, lp_firm_matches 17
-- of 25, lp_contact_matches 17 of 25. 2026-04-25-matching-v2.sql was written
-- for this and never applied (schema_migrations is empty), and it is not
-- sufficient on its own — it assumes a v1 baseline that already had
-- fund_profile_id, firm_type, tags, reasons and the factor columns, which this
-- database never had.
--
-- Every statement is additive and idempotent. Nothing is dropped: the v1
-- columns (status, notes, reasoning, tier_label, factor_stage,
-- factor_fund_size, factor_track_record, firm_match_id, contact_id,
-- is_decision_maker) stay because other routes still read them. All three
-- tables are empty, so no data is rewritten.

-- ─── lp_match_sessions ──────────────────────────────────────────────────────
ALTER TABLE lp_match_sessions
  ADD COLUMN IF NOT EXISTS fund_name              text,
  ADD COLUMN IF NOT EXISTS total_firms_scored     int,
  ADD COLUMN IF NOT EXISTS total_contacts_scored  int,
  ADD COLUMN IF NOT EXISTS qualified_firms        int,
  ADD COLUMN IF NOT EXISTS qualified_contacts     int,
  ADD COLUMN IF NOT EXISTS contacts_with_email    int,
  ADD COLUMN IF NOT EXISTS anchor_candidates      int,
  ADD COLUMN IF NOT EXISTS tier_counts            jsonb,
  ADD COLUMN IF NOT EXISTS duration_ms            int,
  ADD COLUMN IF NOT EXISTS user_id                text,
  ADD COLUMN IF NOT EXISTS funnel_data            jsonb,
  ADD COLUMN IF NOT EXISTS segment_counts         jsonb,
  ADD COLUMN IF NOT EXISTS ai_enrichments_applied int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicates_merged      int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engine_version         text DEFAULT 'v1';

-- ─── lp_firm_matches ────────────────────────────────────────────────────────
ALTER TABLE lp_firm_matches
  ADD COLUMN IF NOT EXISTS fund_profile_id        text,
  ADD COLUMN IF NOT EXISTS firm_type              text,
  ADD COLUMN IF NOT EXISTS firm_location          text,
  ADD COLUMN IF NOT EXISTS firm_aum               text,
  ADD COLUMN IF NOT EXISTS firm_aum_usd           float8,
  ADD COLUMN IF NOT EXISTS firm_sectors           text,
  ADD COLUMN IF NOT EXISTS firm_website           text,
  ADD COLUMN IF NOT EXISTS firm_linkedin          text,
  ADD COLUMN IF NOT EXISTS tags                   jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reasons                jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS why_this_lp            text,
  ADD COLUMN IF NOT EXISTS factor_lp_type         int,
  ADD COLUMN IF NOT EXISTS factor_aum             int,
  ADD COLUMN IF NOT EXISTS factor_geo             int,
  ADD COLUMN IF NOT EXISTS factor_thesis_signals  int,
  ADD COLUMN IF NOT EXISTS segments               jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stage                  text DEFAULT 'identified',
  ADD COLUMN IF NOT EXISTS expected_ticket_usd    float8,
  ADD COLUMN IF NOT EXISTS owner                  text;

-- ─── lp_contact_matches ─────────────────────────────────────────────────────
ALTER TABLE lp_contact_matches
  ADD COLUMN IF NOT EXISTS fund_profile_id        text,
  ADD COLUMN IF NOT EXISTS investor_id            text,
  ADD COLUMN IF NOT EXISTS contact_type           text,
  ADD COLUMN IF NOT EXISTS contact_location       text,
  ADD COLUMN IF NOT EXISTS contact_sectors        text,
  ADD COLUMN IF NOT EXISTS tier                   text,
  ADD COLUMN IF NOT EXISTS tags                   jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reasons                jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS why_this_lp            text,
  ADD COLUMN IF NOT EXISTS factor_lp_type         int,
  ADD COLUMN IF NOT EXISTS factor_sector          int,
  ADD COLUMN IF NOT EXISTS factor_geo             int,
  ADD COLUMN IF NOT EXISTS factor_thesis_signals  int,
  ADD COLUMN IF NOT EXISTS factor_contact_quality int,
  -- A person at a known LP firm inherits that firm's capacity (doc 19 §4);
  -- without this the inherited score is computed and then thrown away.
  ADD COLUMN IF NOT EXISTS factor_capacity        int,
  ADD COLUMN IF NOT EXISTS expected_ticket_usd    float8,
  ADD COLUMN IF NOT EXISTS segments               jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hnw_signals            jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stage                  text DEFAULT 'identified',
  ADD COLUMN IF NOT EXISTS owner                  text;

-- ─── Factor scale ───────────────────────────────────────────────────────────
-- v1 stored factors as fractions in numeric(5,4) — a maximum of 9.9999. v2
-- scores factors 0–100, so writing one overflows the column. The rest of the
-- factor columns this engine writes are int; factor_sector is the one that
-- predates it. The table is empty, so the type is changed rather than scaled.
ALTER TABLE lp_firm_matches
  ALTER COLUMN factor_sector TYPE int USING round(COALESCE(factor_sector, 0))::int;

-- ─── Directory keys ─────────────────────────────────────────────────────────
-- firm_id and contact_id were uuid, but investment_firms.id and investors.id
-- are varchar: 18,871 of 18,982 firm ids are uuid-shaped and 111 are not
-- ("ifm_6daa3b486b99"), and 289 of 47,275 investor ids likewise. A uuid column
-- cannot hold them, and since the insert is batched, one such firm fails the
-- whole batch. The column follows the directory, not the other way round.
ALTER TABLE lp_firm_matches    ALTER COLUMN firm_id    TYPE text USING firm_id::text;
ALTER TABLE lp_contact_matches ALTER COLUMN contact_id TYPE text USING contact_id::text;

-- ─── How these are read ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS lp_firm_matches_session_score_idx    ON lp_firm_matches (session_id, score DESC);
CREATE INDEX IF NOT EXISTS lp_firm_matches_stage_idx            ON lp_firm_matches (fund_profile_id, stage);
CREATE INDEX IF NOT EXISTS lp_contact_matches_session_score_idx ON lp_contact_matches (session_id, score DESC);
CREATE INDEX IF NOT EXISTS lp_contact_matches_stage_idx         ON lp_contact_matches (fund_profile_id, stage);
CREATE INDEX IF NOT EXISTS lp_match_sessions_fund_idx           ON lp_match_sessions (fund_profile_id, created_at DESC);

-- Stage history, as 2026-04-25 intended it.
CREATE TABLE IF NOT EXISTS lp_match_audit (
  id         text PRIMARY KEY,
  match_id   text NOT NULL,
  match_type text NOT NULL CHECK (match_type IN ('firm', 'contact')),
  from_stage text,
  to_stage   text,
  actor      text,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lp_match_audit_match_idx ON lp_match_audit (match_type, match_id, created_at DESC);
