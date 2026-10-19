-- LP matchmaking M3 and M4 (docs/architecture/63 sections 4.4, 4.5): every match says what is known and what is not, and a person's verdicts are kept.
ALTER TABLE lp_firm_matches
  ADD COLUMN IF NOT EXISTS gaps jsonb,
  ADD COLUMN IF NOT EXISTS confidence text;
ALTER TABLE lp_contact_matches
  ADD COLUMN IF NOT EXISTS gaps jsonb,
  ADD COLUMN IF NOT EXISTS confidence text;
ALTER TABLE lp_match_sessions
  ADD COLUMN IF NOT EXISTS confidence_counts jsonb,
  ADD COLUMN IF NOT EXISTS parent_session_id uuid;

-- A verdict on one suggested LP. The workspace's label for "is this a fit", kept for the evaluation in section 8 and, when asked, as "never suggest again".
CREATE TABLE IF NOT EXISTS lp_match_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id uuid,
  match_kind text NOT NULL CHECK (match_kind IN ('firm', 'contact')),
  match_id text,
  entity_key text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('fit', 'not_a_fit', 'already_known', 'wrong_data')),
  reason text,
  note text,
  never_again boolean NOT NULL DEFAULT false,
  match_score numeric,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lp_match_feedback_org_idx ON lp_match_feedback (org_id, entity_key, created_at DESC);
