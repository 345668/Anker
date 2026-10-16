-- Post-deploy smoke test results (docs/architecture/59 R6). Platform data: a commit, a pass or fail, the names of the checks that failed. No customer data.
CREATE TABLE IF NOT EXISTS smoke_runs (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  sha text,
  base_url text,
  ok boolean NOT NULL,
  skipped integer NOT NULL DEFAULT 0,
  failures jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS smoke_runs_created_idx ON smoke_runs (created_at DESC);
