-- Telegram channel T4 (docs/architecture/57): spoken replies, the daily brief, /forget, and the audio length used for the daily audio allowance. Additive.
ALTER TABLE telegram_updates ADD COLUMN IF NOT EXISTS units integer;
ALTER TABLE telegram_prefs ADD COLUMN IF NOT EXISTS voice_replies boolean NOT NULL DEFAULT false;
ALTER TABLE telegram_prefs ADD COLUMN IF NOT EXISTS daily_brief boolean NOT NULL DEFAULT false;
ALTER TABLE telegram_prefs ADD COLUMN IF NOT EXISTS last_brief_on date;
-- Ids of the messages in a private chat (the person's and the bot's), kept 48 hours, so /forget can delete them. No text is kept here.
CREATE TABLE IF NOT EXISTS telegram_sent (
  chat_id bigint NOT NULL,
  message_id bigint NOT NULL,
  org_id text,
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'incoming', 'voice_reply', 'file')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS telegram_sent_org_kind_idx ON telegram_sent (org_id, kind, sent_at DESC);
