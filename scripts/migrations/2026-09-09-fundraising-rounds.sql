-- Private founder rounds within an authenticated workspace. A board belongs to
-- one round so its un-denominated historical checks cannot acquire two currencies.
CREATE TABLE IF NOT EXISTS fundraising_rounds (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  board_id text NOT NULL REFERENCES crm_boards(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  target numeric NOT NULL CHECK (target >= 0),
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, board_id)
);
CREATE INDEX IF NOT EXISTS fundraising_rounds_scope_idx ON fundraising_rounds(user_id, org_id);
