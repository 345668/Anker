-- Per-applicant invitations for early access.
--
-- Registration was gated by ONE shared secret: /register?invite=<SIGNUP_INVITE_CODE>,
-- compared against an env var in /api/auth/sign-up. That made the lifecycle the
-- admin console needs impossible to express honestly:
--   • nothing linked a signup back to a request, so "accepted" could never be
--     observed — only asserted;
--   • one person's access could not be withdrawn without rotating the code for
--     everyone;
--   • the link was freely shareable, so "approve" gated nothing.
--
-- Each invitation now carries its own token. Only the SHA-256 hash is stored —
-- the raw token is shown once at mint, the same shape as mcp_tokens and
-- extension_tokens.
--
-- Tokens are SINGLE-USE and EMAIL-BOUND: redeeming requires the signup address
-- to match the invited one, and sets accepted_at, after which the token is
-- spent. A mistyped address therefore needs a fresh invite rather than silently
-- granting access to a different mailbox.
--
-- SIGNUP_INVITE_CODE keeps working as a fallback, so invitations already sent
-- are unaffected.

ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS invite_token_hash text;
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS invite_email_key  text;
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS invited_at        timestamptz;
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS accepted_at       timestamptz;
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS revoked_at        timestamptz;
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS approved_at       timestamptz;
-- Resend's id for the invitation email, so delivery reconciles through the
-- existing resend-sync path instead of a second mechanism.
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS invite_resend_id  text;
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS invite_error      text;

-- One live token per hash. Partial: most rows have none.
CREATE UNIQUE INDEX IF NOT EXISTS early_access_requests_invite_token_idx
  ON early_access_requests (invite_token_hash) WHERE invite_token_hash IS NOT NULL;

-- The admin console works the queue by state.
CREATE INDEX IF NOT EXISTS early_access_requests_status_idx
  ON early_access_requests (status, created_at DESC);

-- Constrain the lifecycle now that it is a real state machine. Existing rows
-- are all 'pending', so nothing is rejected by this.
ALTER TABLE early_access_requests DROP CONSTRAINT IF EXISTS early_access_requests_status_check;
ALTER TABLE early_access_requests ADD CONSTRAINT early_access_requests_status_check
  CHECK (status IN ('pending','approved','invited','accepted','declined','revoked'));
