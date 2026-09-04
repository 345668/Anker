-- Email suppression list — addresses we must not send to again.
-- Populated on hard bounce / spam complaint (P1-7 of docs/founder-outreach-audit.md)
-- and available for manual unsubscribes. The outreach send paths check this
-- before sending. user_id NULL = a global suppression that applies to everyone.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS email_suppressions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT,
  email      TEXT NOT NULL,
  reason     TEXT,            -- bounced | complained | manual | unsubscribed
  source     TEXT,            -- resend | manual | cron
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One suppression per (user, email). Case-insensitive on the address.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_suppressions_user_email
  ON email_suppressions (user_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_email_suppressions_email
  ON email_suppressions (lower(email));
