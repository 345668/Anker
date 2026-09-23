-- Listing opt-ins (doc 15), investor activity capture (doc 16) and the
-- learned ranker's store (doc 17). Additive only.

-- ─── Founder listing: a company listing belongs to the workspace ────────────
ALTER TABLE startups
  ADD COLUMN IF NOT EXISTS org_id         text,
  ADD COLUMN IF NOT EXISTS listed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS listed_by      text,
  ADD COLUMN IF NOT EXISTS listing_source text;
CREATE INDEX IF NOT EXISTS startups_org_idx ON startups (org_id);
CREATE INDEX IF NOT EXISTS startups_public_idx ON startups (is_public) WHERE is_public;

-- Existing rows predate workspaces: attach each to the company workspace its
-- founder owns, when there is exactly one.
UPDATE startups s SET org_id = o.id
  FROM organizations o
 WHERE s.org_id IS NULL AND o.kind = 'company' AND o.owner_user_id = s.founder_id;

-- ─── Fund listing ───────────────────────────────────────────────────────────
ALTER TABLE funds
  ADD COLUMN IF NOT EXISTS listed_for_lps_at timestamptz,
  ADD COLUMN IF NOT EXISTS listed_for_lps_by text;

-- ─── Investor activity (doc 16 §2) ──────────────────────────────────────────
ALTER TABLE investment_firms
  ADD COLUMN IF NOT EXISTS last_investment_at   date,
  ADD COLUMN IF NOT EXISTS last_investment_note text,
  ADD COLUMN IF NOT EXISTS activity_source_url  text,
  ADD COLUMN IF NOT EXISTS activity_checked_at  timestamptz;
CREATE INDEX IF NOT EXISTS investment_firms_activity_idx ON investment_firms (activity_checked_at NULLS FIRST);

-- ─── Learned ranker (doc 17 §4) ─────────────────────────────────────────────
ALTER TABLE matching_weight_history
  ADD COLUMN IF NOT EXISTS scope       text,
  ADD COLUMN IF NOT EXISTS metrics     jsonb,
  ADD COLUMN IF NOT EXISTS engine      text;
ALTER TABLE matching_weight_history ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS matching_weight_history_active_idx
  ON matching_weight_history (engine, is_active, created_at DESC);
