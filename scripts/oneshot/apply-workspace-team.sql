-- Use psql -X -v ON_ERROR_STOP=1 --single-transaction -f this-file.sql.
-- Review scripts/checks/workspace-team-preflight.sql first, with writers paused.
-- Both schema changes and their ledger entries commit together or roll back together.
\ir ../migrations/2026-09-13-workspace-team-lifecycle.sql
\ir ../migrations/2026-09-13-workspace-team-shared-records.sql

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  checksum text
);
-- The psql path records the exact filenames; checksums are left NULL.
INSERT INTO schema_migrations(filename) VALUES
 ('2026-09-13-workspace-team-lifecycle.sql'),
 ('2026-09-13-workspace-team-shared-records.sql')
ON CONFLICT(filename) DO NOTHING;
