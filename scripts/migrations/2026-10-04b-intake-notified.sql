-- Fund intake: remember that the fund has been told, so a re-run of the engine does not email again. Additive.
ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS notified_at timestamptz;
