-- Telegram channel: a workspace's own bot (docs/architecture/57 section 19). Additive; existing rows belong to the shared platform bot ('platform').
CREATE TABLE IF NOT EXISTS telegram_bots (
  id text PRIMARY KEY,
  org_id text NOT NULL UNIQUE,
  bot_user_id bigint NOT NULL UNIQUE,
  username text NOT NULL,
  token_enc text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS bot_id text NOT NULL DEFAULT 'platform';
DROP INDEX IF EXISTS telegram_links_live_uq;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_live_bot_uq ON telegram_links (bot_id, telegram_user_id) WHERE status IN ('pending', 'active', 'suspended');

ALTER TABLE telegram_link_codes ADD COLUMN IF NOT EXISTS bot_id text NOT NULL DEFAULT 'platform';

-- A Telegram update id is only unique within one bot.
ALTER TABLE telegram_updates ADD COLUMN IF NOT EXISTS bot_id text NOT NULL DEFAULT 'platform';
ALTER TABLE telegram_updates DROP CONSTRAINT IF EXISTS telegram_updates_pkey;
ALTER TABLE telegram_updates ADD PRIMARY KEY (bot_id, update_id);

-- So is a message id within one chat with one bot.
ALTER TABLE telegram_sent ADD COLUMN IF NOT EXISTS bot_id text NOT NULL DEFAULT 'platform';
ALTER TABLE telegram_sent DROP CONSTRAINT IF EXISTS telegram_sent_pkey;
ALTER TABLE telegram_sent ADD PRIMARY KEY (bot_id, chat_id, message_id);
