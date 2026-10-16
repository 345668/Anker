-- Data-subject requests for directory persons (docs/architecture/54, slice D3). Additive.
CREATE TABLE IF NOT EXISTS dsar_requests (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('access', 'rectification', 'erasure', 'restriction', 'objection')),
  status text NOT NULL DEFAULT 'verifying' CHECK (status IN ('received', 'verifying', 'verified', 'in_progress', 'done', 'refused', 'expired')),
  requester_email_hash text NOT NULL,
  -- Encrypted JSON { email, linkedin, note }: kept only so we can reply; wiped 30 days after the request closes.
  details_enc text,
  verify_token_hash text,
  verify_expires_at timestamptz,
  verified_at timestamptz,
  due_at timestamptz NOT NULL,
  extended_to timestamptz,
  extension_reason text,
  handled_by text,
  -- Counts only, never content.
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  refusal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  details_wiped_at timestamptz
);
CREATE INDEX IF NOT EXISTS dsar_requests_status_idx ON dsar_requests (status, due_at);
CREATE INDEX IF NOT EXISTS dsar_requests_email_idx ON dsar_requests (requester_email_hash, kind) WHERE closed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dsar_requests_token_uq ON dsar_requests (verify_token_hash) WHERE verify_token_hash IS NOT NULL;

-- A restricted person is kept but excluded from matching, discovery and outreach.
ALTER TABLE investors ADD COLUMN IF NOT EXISTS restricted_at timestamptz;
