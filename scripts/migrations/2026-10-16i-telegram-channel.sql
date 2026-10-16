-- The Telegram channel for Anker AI and the Assistant (docs/architecture/57, slice T1). Additive. Message content is never stored in these tables: it lives once, in the workspace's chat.
CREATE TABLE IF NOT EXISTS telegram_links (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  org_id text NOT NULL,
  telegram_user_id bigint NOT NULL,
  chat_id bigint NOT NULL,
  telegram_username text,
  mode text NOT NULL DEFAULT 'read' CHECK (mode IN ('write', 'read')),
  -- pending: the person pressed Start in Telegram; it becomes active only when they approve the device in Anker.
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  anker_chat_id text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  confirmed_in_app_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- A Telegram account belongs to one live link at a time.
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_live_uq ON telegram_links (telegram_user_id) WHERE status IN ('pending', 'active', 'suspended');
CREATE INDEX IF NOT EXISTS telegram_links_user_idx ON telegram_links (user_id, status);
CREATE INDEX IF NOT EXISTS telegram_links_org_idx ON telegram_links (org_id, status);

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code_hash text PRIMARY KEY,
  user_id text NOT NULL,
  org_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_link_codes_user_idx ON telegram_link_codes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id bigint PRIMARY KEY,
  link_id text,
  org_id text,
  chat_id bigint,
  kind text NOT NULL DEFAULT 'text',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'dropped')),
  -- The update as received, encrypted, kept only until it is processed so a killed worker can be retried; wiped when the update finishes.
  payload_enc text,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS telegram_updates_status_idx ON telegram_updates (status, received_at);
CREATE INDEX IF NOT EXISTS telegram_updates_chat_idx ON telegram_updates (chat_id, update_id);

ALTER TABLE ai_subprocessors DROP CONSTRAINT IF EXISTS ai_subprocessors_role_check;
ALTER TABLE ai_subprocessors ADD CONSTRAINT ai_subprocessors_role_check CHECK (role IN ('ai_model', 'hosting', 'database', 'storage', 'email', 'payments', 'auth', 'self_hosted', 'messaging'));
INSERT INTO ai_subprocessors (slug, provider, role, purpose, region, region_basis, data_classes, active, public, notes) VALUES
  ('telegram', 'Telegram', 'messaging', 'Delivering messages between a person and the Anker bot, when they connect Telegram', 'unknown', 'inferred', ARRAY['messages','files','voice notes'], false, true, 'Not in use until the Telegram channel is switched on. Bot chats are not end-to-end encrypted.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO platform_flags (key, enabled, rollout_pct, description)
VALUES ('telegram_channel', false, 100, 'Doc 57: the customer Telegram channel (link a Telegram account to a workspace, ask Anker AI from a phone). Off: the bot answers that it is not available.')
ON CONFLICT (key) DO NOTHING;
UPDATE plan_catalog SET features = features || '{"channel_telegram":true}'::jsonb WHERE plan = 'internal';
