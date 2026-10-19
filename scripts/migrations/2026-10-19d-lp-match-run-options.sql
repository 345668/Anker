-- LP matchmaking M5 (docs/architecture/63 section 5, history): a run remembers the options it was started with, so "run again with these settings" is exact.
ALTER TABLE lp_match_sessions ADD COLUMN IF NOT EXISTS run_options jsonb;
