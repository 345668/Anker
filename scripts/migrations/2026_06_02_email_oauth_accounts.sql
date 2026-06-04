-- Stores OAuth-connected email senders (Gmail, later Outlook/etc.).
-- Each user can connect multiple mailboxes; the SVS campaign sends from
-- pj@summitventurestudio.com (Philippe's Folk-synced Gmail) so every send
-- shows up in Folk via the mailbox's IMAP sync.
CREATE TABLE IF NOT EXISTS email_oauth_accounts (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         text NOT NULL,
  provider        text NOT NULL CHECK (provider IN ('gmail','outlook')),
  email           text NOT NULL,
  display_name    text,
  refresh_token   text NOT NULL,
  access_token    text,
  expires_at      timestamptz,
  scopes          text[] NOT NULL DEFAULT '{}',
  is_default      boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','error')),
  last_error      text,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, email)
);
CREATE INDEX IF NOT EXISTS email_oauth_accounts_user_idx
  ON email_oauth_accounts (user_id, provider);

-- Per-campaign default-sender override.  null = use Resend (existing behaviour).
ALTER TABLE outreach_campaigns
  ADD COLUMN IF NOT EXISTS default_send_provider text
    CHECK (default_send_provider IN ('resend','gmail') OR default_send_provider IS NULL),
  ADD COLUMN IF NOT EXISTS default_send_account_id text;

COMMENT ON COLUMN outreach_campaigns.default_send_provider IS
  'When set, every send for this campaign uses this provider (resend or gmail). null = legacy Resend behaviour.';
COMMENT ON COLUMN outreach_campaigns.default_send_account_id IS
  'When provider=gmail, the email_oauth_accounts.id to send through. Required for gmail sends; ignored otherwise.';
