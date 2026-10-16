-- Directory identity hashes and tombstones (docs/architecture/54, slice D2). Additive.
-- Hashes are keyed (HMAC-SHA-256) and filled by the directory-maintenance job, never in SQL, so the key stays out of the database.
ALTER TABLE investors ADD COLUMN IF NOT EXISTS email_hash text;
ALTER TABLE investors ADD COLUMN IF NOT EXISTS linkedin_hashes text[];
ALTER TABLE investors ADD COLUMN IF NOT EXISTS hashed_at timestamptz;
-- True when a withdrawn source hid the row (is_active was switched off by SAIL); restoring the source switches exactly these rows back on.
ALTER TABLE investors ADD COLUMN IF NOT EXISTS hidden_by_source boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS investors_email_hash_idx ON investors (email_hash) WHERE email_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS investors_linkedin_hashes_idx ON investors USING gin (linkedin_hashes);
CREATE INDEX IF NOT EXISTS investors_unhashed_idx ON investors (id) WHERE hashed_at IS NULL;

CREATE TABLE IF NOT EXISTS directory_tombstones (
  id bigserial PRIMARY KEY,
  email_hash text,
  linkedin_hash text,
  -- NULL: applies to every source (erasure, objection). Set: applies only to rows from that source (a withdrawn batch).
  source text,
  reason text NOT NULL CHECK (reason IN ('erasure', 'objection', 'batch_withdrawn', 'bounce_hard')),
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CHECK (email_hash IS NOT NULL OR linkedin_hash IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS directory_tombstones_email_idx ON directory_tombstones (email_hash) WHERE email_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS directory_tombstones_linkedin_idx ON directory_tombstones (linkedin_hash) WHERE linkedin_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS directory_tombstones_batch_email_uq ON directory_tombstones (source, email_hash) WHERE source IS NOT NULL AND email_hash IS NOT NULL AND linkedin_hash IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS directory_tombstones_batch_li_uq ON directory_tombstones (source, linkedin_hash) WHERE source IS NOT NULL AND linkedin_hash IS NOT NULL AND email_hash IS NULL;

-- One canary value written under the production key. A process holding a different key (a laptop, a rotated secret) must refuse to hash rather than write hashes that never match.
CREATE TABLE IF NOT EXISTS directory_hash_meta (k text PRIMARY KEY, v text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE directory_sources ADD COLUMN IF NOT EXISTS purged_at timestamptz;
