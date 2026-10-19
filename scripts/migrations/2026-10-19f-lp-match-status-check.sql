-- A run can now be queued before it starts (docs/architecture/63 M2). A database built from the repository's migrations has a status check that only allows running, completed and failed
-- (2026-09-11-matching-profile-contract.sql); the production table never had it. Make the rule the same everywhere.
ALTER TABLE lp_match_sessions DROP CONSTRAINT IF EXISTS lp_match_sessions_status_check;
ALTER TABLE lp_match_sessions ADD CONSTRAINT lp_match_sessions_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed'));
