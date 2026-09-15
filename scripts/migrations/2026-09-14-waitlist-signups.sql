-- Prerequisite: 2026-08-31-early-access-requests.sql. Apply in a transaction.
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS email_key TEXT;
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS consent_version TEXT;
-- Keep legacy history; only the canonical row receives the unique key.
WITH ranked AS (
  SELECT id, lower(btrim(email)) normalized,
    row_number() OVER (PARTITION BY lower(btrim(email))
      ORDER BY (status='invited') DESC NULLS LAST, created_at, id) position
  FROM early_access_requests WHERE btrim(email) <> ''
)
UPDATE early_access_requests e SET email_key = r.normalized FROM ranked r
WHERE e.id = r.id AND r.position = 1 AND e.email_key IS NULL
  AND NOT EXISTS (SELECT 1 FROM early_access_requests existing WHERE existing.email_key = r.normalized);
CREATE UNIQUE INDEX IF NOT EXISTS early_access_requests_email_key_unique ON early_access_requests(email_key);
-- Public clients must not enumerate access requests. The trusted server writes.
ALTER TABLE early_access_requests ENABLE ROW LEVEL SECURITY;
