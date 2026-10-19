-- LP matchmaking M2: two requests for the same run at the same moment (a double click) must become one run. The check-then-insert in the service is not enough on its own;
-- the database allows one open (queued or running) run per workspace and set of inputs.
CREATE UNIQUE INDEX IF NOT EXISTS lp_match_sessions_open_uq ON lp_match_sessions (org_id, inputs_hash) WHERE status IN ('queued', 'running');
