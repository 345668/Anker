-- Investor Update Builder (Metal gap #2) — compose periodic founder→investor
-- updates from platform data, recommend recipients, send, and track engagement.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS investor_updates (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      TEXT NOT NULL,
  title        TEXT,
  period       TEXT,                 -- e.g. "September 2026"
  body         TEXT,
  metrics      JSONB,                -- [{label, value}]
  asks         TEXT,                 -- the "asks / how you can help" line
  status       TEXT DEFAULT 'draft', -- draft | sent
  generated_by TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  sent_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS investor_update_recipients (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  update_id    TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  crm_entry_id TEXT,
  email        TEXT,
  name         TEXT,
  resend_id    TEXT,
  tracking_id  TEXT,
  sent_at      TIMESTAMPTZ,
  opened_at    TIMESTAMPTZ,
  open_count   INT DEFAULT 0,
  last_event   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investor_updates_user      ON investor_updates (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_update_recipients_update   ON investor_update_recipients (update_id);
CREATE INDEX IF NOT EXISTS idx_update_recipients_user     ON investor_update_recipients (user_id);
