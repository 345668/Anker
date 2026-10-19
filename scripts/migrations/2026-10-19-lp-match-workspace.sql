-- LP matchmaking, M1 (docs/architecture/63 section 7): runs belong to the workspace, record what the rules left out, and a fund can state its own rules.
-- Additive and repeatable. The UPDATEs only fill gaps and never remove a row.

ALTER TABLE lp_match_sessions
  ADD COLUMN IF NOT EXISTS org_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'page',
  ADD COLUMN IF NOT EXISTS exclusion_counts jsonb,
  ADD COLUMN IF NOT EXISTS total_firms_matched int,
  ADD COLUMN IF NOT EXISTS total_contacts_matched int,
  ADD COLUMN IF NOT EXISTS engine_version text,
  ADD COLUMN IF NOT EXISTS qualified_firms int,
  ADD COLUMN IF NOT EXISTS qualified_contacts int,
  ADD COLUMN IF NOT EXISTS filters_applied jsonb;

-- Existing runs: the workspace of the fund profile they were run for.
UPDATE lp_match_sessions s SET org_id = f.org_id
  FROM fund_profiles f WHERE s.org_id IS NULL AND f.id::text = s.fund_profile_id::text;

-- The raise path counts finished runs by these two columns, and the v2 engine never wrote them (so a finished v2 run looked empty).
UPDATE lp_match_sessions SET
  total_firms_matched = COALESCE(total_firms_matched, qualified_firms),
  total_contacts_matched = COALESCE(total_contacts_matched, qualified_contacts)
  WHERE engine_version = 'v2' AND (total_firms_matched IS NULL OR total_contacts_matched IS NULL);

CREATE INDEX IF NOT EXISTS lp_match_sessions_org_idx ON lp_match_sessions (org_id, created_at DESC);

-- The fund's own rules: who it may approach. Anker applies them; it does not decide eligibility (doc 63 section 4.2).
ALTER TABLE fund_profiles
  ADD COLUMN IF NOT EXISTS allowed_lp_classes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS excluded_jurisdictions jsonb DEFAULT '[]'::jsonb;
