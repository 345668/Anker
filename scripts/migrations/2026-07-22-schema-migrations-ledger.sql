-- Migrations ledger.
--
-- Until now nothing recorded which of scripts/migrations/*.sql had been
-- applied to which database. That gap is exactly how the 2026-07-17 set
-- shipped in code days before its tables existed on Neon. This table is the
-- source of truth for "what has run here"; run-migration.mjs writes a row
-- after each file it applies and skips files already present.

create table if not exists schema_migrations (
  filename     text primary key,
  applied_at   timestamptz not null default now(),
  -- Best-effort checksum of the file at apply time. Lets a later `status`
  -- check warn if a recorded migration's contents changed on disk.
  checksum     text
);
