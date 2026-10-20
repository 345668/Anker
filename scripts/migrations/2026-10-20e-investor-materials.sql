-- Materials, the NDA step and meeting requests (docs/architecture/68). Additive.
CREATE TABLE IF NOT EXISTS relationship_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL REFERENCES fund_relationships(id) ON DELETE CASCADE,
  fund_id text NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  document_id text NOT NULL,
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS relationship_materials_live_uq ON relationship_materials (relationship_id, document_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS relationship_materials_fund_idx ON relationship_materials (fund_id);

CREATE TABLE IF NOT EXISTS relationship_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL REFERENCES fund_relationships(id) ON DELETE CASCADE,
  fund_id text NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  proposed_by text NOT NULL CHECK (proposed_by IN ('investor', 'fund')),
  starts_at timestamptz,
  link text,
  note text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  CHECK (starts_at IS NOT NULL OR link IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS relationship_meetings_rel_idx ON relationship_meetings (relationship_id, created_at DESC);

ALTER TABLE fund_relationships
  ADD COLUMN IF NOT EXISTS nda_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS nda_text_hash text,
  ADD COLUMN IF NOT EXISTS nda_text text,
  ADD COLUMN IF NOT EXISTS nda_ip text,
  ADD COLUMN IF NOT EXISTS nda_agent_hash text;
