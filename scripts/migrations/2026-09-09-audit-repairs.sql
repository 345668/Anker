-- Apply before deploying the audit repair branch. Additive; no tenant data is reassigned.
CREATE TABLE IF NOT EXISTS onboarding_drafts (
  user_id text NOT NULL, persona text NOT NULL CHECK (persona IN ('founder','vc')),
  data jsonb NOT NULL DEFAULT '{}', step integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 0, completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, persona)
);
ALTER TABLE onboarding_drafts ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS outreach_reply_deliveries (
  reply_id uuid PRIMARY KEY, user_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('sending','sent','queued','failed')),
  approved_draft text NOT NULL, first_attempt_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), last_error text
);
ALTER TABLE outreach_reply_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_reply_deliveries ADD COLUMN IF NOT EXISTS outreach_message_id text;
CREATE UNIQUE INDEX IF NOT EXISTS outreach_reply_deliveries_message_idx
  ON outreach_reply_deliveries (outreach_message_id)
  WHERE outreach_message_id IS NOT NULL;
