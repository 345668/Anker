-- Telegram channel T3 (docs/architecture/57): what a person said or sent, held for an hour while they choose what to do with it. Additive.
-- The text is encrypted, belongs to one device, is deleted when the person decides, and is swept after an hour. It is never kept beyond that unless the person saves it as a call note.
CREATE TABLE IF NOT EXISTS telegram_pending (
  id text PRIMARY KEY,
  link_id text NOT NULL,
  org_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('voice', 'file')),
  title text NOT NULL,
  text_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);
CREATE INDEX IF NOT EXISTS telegram_pending_expiry_idx ON telegram_pending (expires_at);
CREATE INDEX IF NOT EXISTS telegram_pending_link_idx ON telegram_pending (link_id, created_at DESC);
