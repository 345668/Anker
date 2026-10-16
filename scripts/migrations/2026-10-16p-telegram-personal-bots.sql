-- Telegram: a member's own bot, beside the workspace bot (docs/architecture/57 section 20). Additive; existing rows are workspace bots (user_id NULL).
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE telegram_bots DROP CONSTRAINT IF EXISTS telegram_bots_org_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_bots_workspace_uq ON telegram_bots (org_id) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_bots_member_uq ON telegram_bots (org_id, user_id) WHERE user_id IS NOT NULL;
