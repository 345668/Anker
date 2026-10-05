-- Send authorizations (docs/architecture/46 §3): a person approves exact messages to exact recipients from a named mailbox; an executor sends them later.
-- ids are text like the rest of the outreach tables; org_id is organizations.id.
CREATE TABLE IF NOT EXISTS send_authorizations (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          text NOT NULL,
  sender_user_id  text NOT NULL,
  provider        text NOT NULL CHECK (provider IN ('resend','gmail')),
  account_id      text,
  source          text NOT NULL CHECK (source IN ('manual_single','manual_batch','proposal','reply','platform_wave')),
  proposal_id     text,
  approved_by     text NOT NULL,
  approved_at     timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  digest          text NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired','completed')),
  revoked_by      text,
  revoked_at      timestamptz,
  revoke_reason   text,
  summary         jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS send_authorizations_org_idx ON send_authorizations (org_id, approved_at DESC);
CREATE INDEX IF NOT EXISTS send_authorizations_active_idx ON send_authorizations (status, expires_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS send_items (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  authorization_id    text NOT NULL REFERENCES send_authorizations(id) ON DELETE CASCADE,
  org_id              text NOT NULL,
  message_id          text NOT NULL,
  crm_entry_id        text,
  recipients          jsonb NOT NULL,
  recipient_country   text,
  content_hash        text NOT NULL,
  send_after          timestamptz NOT NULL DEFAULT now(),
  status              text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','sending','sent','blocked','skipped','failed','revoked','expired','unknown')),
  reason              text,
  idempotency_key     text NOT NULL,
  provider_id         text,
  provider_message_id text,
  attempts            int NOT NULL DEFAULT 0,
  claimed_at          timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (authorization_id, message_id)
);
-- A message is in at most one live authorization.
CREATE UNIQUE INDEX IF NOT EXISTS send_items_live_message_idx ON send_items (message_id) WHERE status IN ('approved','sending');
CREATE INDEX IF NOT EXISTS send_items_due_idx ON send_items (send_after) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS send_items_auth_idx ON send_items (authorization_id, status);

INSERT INTO platform_flags (key, enabled, rollout_pct, description) VALUES
  ('outreach_sending_paused', false, 100, 'Stops the send executor for every workspace: authorized mail waits, nothing goes')
ON CONFLICT (key) DO NOTHING;
