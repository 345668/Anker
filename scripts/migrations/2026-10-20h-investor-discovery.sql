-- Opt-in discoverability (docs/architecture/71). Additive. The platform flag is OFF.
-- The first investor migration pinned `discoverable` to false until this feature existed; it is released here (the platform flag still gates it).
ALTER TABLE investor_entities DROP CONSTRAINT IF EXISTS investor_entities_discoverable_check;
ALTER TABLE investor_entities ADD COLUMN IF NOT EXISTS discoverable_at timestamptz;
CREATE TABLE IF NOT EXISTS fund_connect_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id text NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES investor_entities(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'accepted', 'declined', 'withdrawn')),
  invited_by text NOT NULL,
  card jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  relationship_id uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS fund_connect_invites_live_uq ON fund_connect_invites (fund_id, entity_id) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS fund_connect_invites_entity_idx ON fund_connect_invites (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fund_connect_invites_fund_idx ON fund_connect_invites (fund_id, created_at DESC);
INSERT INTO platform_flags (key, enabled, rollout_pct, description) VALUES ('investor_discoverability', false, 100, 'Funds may find opt-in investor entities and invite them (docs/architecture/71). Off until counsel and the privacy notice cover it.') ON CONFLICT (key) DO NOTHING;
