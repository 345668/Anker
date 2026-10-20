-- Teams on an investor entity (docs/architecture/69). Additive. Investor-owned.
CREATE TABLE IF NOT EXISTS investor_entity_members (
  entity_id uuid NOT NULL REFERENCES investor_entities(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('can_act', 'can_view')),
  added_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, user_id)
);
CREATE INDEX IF NOT EXISTS investor_entity_members_user_idx ON investor_entity_members (user_id);
CREATE TABLE IF NOT EXISTS investor_entity_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES investor_entities(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('can_act', 'can_view')),
  invited_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS investor_entity_invites_open_uq ON investor_entity_invites (entity_id, lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS investor_entity_invites_email_idx ON investor_entity_invites (lower(email));
CREATE TABLE IF NOT EXISTS investor_entity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES investor_entities(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS investor_entity_events_entity_idx ON investor_entity_events (entity_id, at DESC);
