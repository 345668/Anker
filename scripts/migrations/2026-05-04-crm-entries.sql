-- Outreach CRM — entries promoted from a shortlist xlsx upload.
--
-- Workflow:
--   1. Matchmaking run produces an xlsx shortlist.  Every row has a
--      leftmost "Contact" column (boolean, default TRUE) + rightmost
--      "Anker ID" column.
--   2. User downloads, unchecks rows they do NOT want to contact,
--      uploads the edited xlsx.
--   3. Server reads each sheet, finds rows where Contact=TRUE, looks
--      up the underlying record by Anker ID, and inserts a row here
--      with stage='queued'.
--
-- Subsequent stage transitions (queued → contacted → responded → ...)
-- are handled by /api/lp/pipeline/stage and the kanban view.

CREATE TABLE IF NOT EXISTS crm_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  -- Provenance
  source TEXT NOT NULL CHECK (source IN ('lp_matching', 'founder_matching', 'manual')),
  source_session_id TEXT,
  -- What we're tracking. Either firm-level OR person-level (both can be set).
  firm_id TEXT,
  investor_id TEXT,
  -- Display fields denormalised so the CRM still shows useful rows even if
  -- the linked firm/investor row gets cleaned up.
  display_name TEXT NOT NULL,
  display_title TEXT,
  display_email TEXT,
  display_linkedin TEXT,
  display_location TEXT,
  display_type TEXT,
  display_score INT,
  display_tier TEXT,
  why_match TEXT,
  -- Stage of the outreach
  stage TEXT NOT NULL DEFAULT 'queued',
  notes TEXT,
  owner TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- An entry is uniquely identified by user + source + entity.  Re-uploading
  -- the same row is a no-op (or refreshes the display fields).
  UNIQUE (user_id, source, firm_id, investor_id)
);

CREATE INDEX IF NOT EXISTS crm_entries_user_stage_idx ON crm_entries (user_id, stage);
CREATE INDEX IF NOT EXISTS crm_entries_session_idx    ON crm_entries (source, source_session_id);
CREATE INDEX IF NOT EXISTS crm_entries_firm_idx       ON crm_entries (firm_id);
CREATE INDEX IF NOT EXISTS crm_entries_investor_idx   ON crm_entries (investor_id);
