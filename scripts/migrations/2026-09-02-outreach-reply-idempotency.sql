-- Reply retrieval idempotency + provenance (P2-9 / P2-10 of the audit).
--   provider            — which mailbox provider ingested the reply (imap | gmail | manual)
--   provider_message_id — the RFC 2822 Message-ID (or provider id); the dedupe key
--   classified_at       — claim/lock timestamp so overlapping classify runs don't double-process
--
-- Replaces the fragile `notes LIKE '%[msgid:…]%'` dedupe with a real unique
-- index. Idempotent — safe to re-run.

ALTER TABLE outreach_replies ADD COLUMN IF NOT EXISTS provider            TEXT;
ALTER TABLE outreach_replies ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE outreach_replies ADD COLUMN IF NOT EXISTS classified_at       TIMESTAMPTZ;

-- One reply per (user, provider message-id). Partial: only rows that carry one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_replies_provider_msgid
  ON outreach_replies (user_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Speeds the classify claim (unclassified rows only).
CREATE INDEX IF NOT EXISTS idx_outreach_replies_classify_claim
  ON outreach_replies (received_at)
  WHERE classification IS NULL;
