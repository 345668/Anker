-- LP write-back: let an LP acknowledge a capital call (intent to wire) and
-- confirm receipt of a distribution. Nullable timestamp — null = not yet acted.
ALTER TABLE capital_call_line_items
  ADD COLUMN IF NOT EXISTS lp_acknowledged_at timestamptz;

ALTER TABLE distribution_line_items
  ADD COLUMN IF NOT EXISTS lp_confirmed_at timestamptz;
