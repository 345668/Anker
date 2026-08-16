-- Share Plans engine: vesting-start / termination, an exercise ledger, and a
-- company-level option pool persisted server-side (was localStorage-only).

-- Grant-level vesting controls + cached exercised total (recomputed from the
-- ledger after every change, mirroring the loans outstanding pattern).
ALTER TABLE option_grants ADD COLUMN IF NOT EXISTS vesting_start date;
ALTER TABLE option_grants ADD COLUMN IF NOT EXISTS terminated_on date;
ALTER TABLE option_grants ADD COLUMN IF NOT EXISTS exercised_options integer NOT NULL DEFAULT 0;

-- Backfill vesting_start from grant_date for existing rows.
UPDATE option_grants SET vesting_start = grant_date WHERE vesting_start IS NULL;

-- Exercise events against a grant. Only vested-and-unexercised options may be
-- exercised; the app enforces that before inserting here.
CREATE TABLE IF NOT EXISTS grant_exercises (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  grant_id     text NOT NULL REFERENCES option_grants(id) ON DELETE CASCADE,
  exercised_on date NOT NULL DEFAULT CURRENT_DATE,
  quantity     integer NOT NULL DEFAULT 0,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_exercises_grant_idx ON grant_exercises (grant_id, exercised_on);

-- One authorized option pool per company.
CREATE TABLE IF NOT EXISTS option_pools (
  company_id text PRIMARY KEY,
  authorized integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
