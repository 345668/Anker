-- LP matchmaking M6 (docs/architecture/63 sections 4.3 and 8): scoring factors that are computed and stored for every match but do not change the order until they have been measured
-- and a person has promoted them; and the workspace's labelled set to measure them against.

-- The platform's list of extra factors and where each stands. 'shadow' = computed and stored, changes nothing; 'promoted' = adds weight x value (0 to 1) points to the score;
-- 'retired' = no longer computed. The evidence is the evaluation the decision was made on.
CREATE TABLE IF NOT EXISTS lp_scoring_factors (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'shadow' CHECK (status IN ('shadow', 'promoted', 'retired')),
  weight numeric NOT NULL CHECK (weight >= 0 AND weight <= 15),
  decided_by text,
  decided_at timestamptz,
  note text,
  evidence jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO lp_scoring_factors (key, label, description, weight) VALUES
  ('recent_activity', 'Recent investing activity', 'The firm made an investment in the last year or two (from its directory record).', 6),
  ('emerging_manager_appetite', 'Emerging-manager appetite', 'The firm or person describes backing first-time or emerging fund managers. Applies to a fund that is a first or second fund.', 5),
  ('relationship_proximity', 'Relationship proximity', 'The firm was an LP in an earlier fund, someone on the team is connected to the firm or person, or the team already has a warm contact there.', 8),
  ('data_confidence', 'Data confidence', 'How much of the match rests on facts the directory actually holds.', 4)
ON CONFLICT (key) DO NOTHING;

-- What each match was worth under each factor, and the score before any promoted factor was added.
ALTER TABLE lp_firm_matches ADD COLUMN IF NOT EXISTS base_score numeric, ADD COLUMN IF NOT EXISTS shadow_factors jsonb;
ALTER TABLE lp_contact_matches ADD COLUMN IF NOT EXISTS base_score numeric, ADD COLUMN IF NOT EXISTS shadow_factors jsonb;

-- A workspace's own judgement of which LPs are right for a fund: the labelled set the factors are measured against.
CREATE TABLE IF NOT EXISTS lp_eval_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fund_profile_id text,
  entity_key text NOT NULL,
  label text NOT NULL CHECK (label IN ('fit', 'not_fit')),
  source text NOT NULL DEFAULT 'founder_set',
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, entity_key, source)
);
CREATE INDEX IF NOT EXISTS lp_eval_labels_org_idx ON lp_eval_labels (org_id, fund_profile_id);
