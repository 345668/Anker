-- Restore drills (docs/architecture/59 R4). One row per drill: counts and timings only, never row content. Additive; idempotent.
CREATE TABLE IF NOT EXISTS restore_drills (
  id              BIGSERIAL PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  branch_age_min  INTEGER NOT NULL,
  seconds         INTEGER,
  passed          BOOLEAN NOT NULL,
  tables_checked  INTEGER NOT NULL DEFAULT 0,
  tables_off      INTEGER NOT NULL DEFAULT 0,
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- per table: production count, restored count, tolerance; the failure message
  run_by          TEXT
);
CREATE INDEX IF NOT EXISTS idx_restore_drills_time ON restore_drills (started_at DESC);
