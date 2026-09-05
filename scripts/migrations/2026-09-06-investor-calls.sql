-- Call / Meeting Intelligence (Metal gap #1) — capture investor call transcripts
-- and extract summary, sentiment, objections, next steps, and a draft follow-up.
-- Feeds the existing outreach engine (draft follow-up → outreach_messages).
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS investor_calls (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id           TEXT NOT NULL,
  crm_entry_id      TEXT,                    -- link to the investor in the CRM
  title             TEXT,
  investor_name     TEXT,
  occurred_at       TIMESTAMPTZ,
  transcript        TEXT,
  -- AI analysis --------------------------------------------------------------
  summary           TEXT,
  sentiment         TEXT,                    -- positive | neutral | negative | mixed
  interest_level    TEXT,                    -- high | medium | low
  objections        JSONB,                   -- [{objection, response}]
  next_steps        JSONB,                   -- [text]
  key_questions     JSONB,                   -- [text]
  draft_followup    TEXT,
  recommended_stage TEXT,
  generated_by      TEXT,
  analyzed_at       TIMESTAMPTZ,
  status            TEXT DEFAULT 'new',       -- new | analyzed | archived
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investor_calls_user ON investor_calls (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investor_calls_crm  ON investor_calls (crm_entry_id);
