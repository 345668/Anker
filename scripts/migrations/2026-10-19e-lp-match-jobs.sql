-- LP matchmaking M2 (docs/architecture/63 section 4.1): a run is a record from the moment it is asked for. It is queued, then running with a heartbeat and a progress report,
-- then completed or failed; a sweep takes up a run whose worker died. Everything the worker needs to (re)run it is on the row.
ALTER TABLE lp_match_sessions
  ADD COLUMN IF NOT EXISTS progress jsonb,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS inputs_hash text,
  ADD COLUMN IF NOT EXISTS notify jsonb,
  ADD COLUMN IF NOT EXISTS handed_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- The sweep looks only at runs that are not finished; the duplicate check looks up by hash.
CREATE INDEX IF NOT EXISTS lp_match_sessions_open_idx ON lp_match_sessions (status, heartbeat_at) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS lp_match_sessions_hash_idx ON lp_match_sessions (org_id, inputs_hash, created_at DESC) WHERE inputs_hash IS NOT NULL;
