-- Talks between an investor and a fund (docs/architecture/65). Additive.
CREATE TABLE IF NOT EXISTS relationship_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL REFERENCES fund_relationships(id) ON DELETE CASCADE,
  fund_id text NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('investor', 'fund')),
  sender_user_id text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS relationship_messages_rel_idx ON relationship_messages (relationship_id, created_at);
ALTER TABLE fund_relationships
  ADD COLUMN IF NOT EXISTS investor_muted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fund_muted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_by text CHECK (blocked_by IN ('investor', 'fund')),
  ADD COLUMN IF NOT EXISTS investor_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS fund_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS nudged_at timestamptz,
  ADD COLUMN IF NOT EXISTS quiet_asked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
