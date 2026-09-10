-- Existing unscoped records stay personal until their owner explicitly assigns them.
ALTER TABLE investor_calls ADD COLUMN IF NOT EXISTS org_id text REFERENCES organizations(id);
ALTER TABLE investor_calls ADD COLUMN IF NOT EXISTS persona text;
ALTER TABLE investor_calls ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'paste';
ALTER TABLE investor_calls ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE investor_calls ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE investor_calls ADD COLUMN IF NOT EXISTS analysis_error text;
ALTER TABLE investor_calls ADD COLUMN IF NOT EXISTS analysis_started_at timestamptz;
ALTER TABLE investor_calls ADD COLUMN IF NOT EXISTS analysis_run_id text;
ALTER TABLE investor_calls ADD COLUMN IF NOT EXISTS outreach_message_id text;
ALTER TABLE investor_calls ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE investor_calls ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS investor_calls_workspace ON investor_calls(user_id, org_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS investor_calls_import ON investor_calls(user_id, org_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS call_sync_devices (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days',
  revoked_at timestamptz,
  last_seen_at timestamptz
);
