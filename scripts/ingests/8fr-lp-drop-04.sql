-- ============================================================================
-- 8FUNDRAISING · LP DROP #04 — 150 US Family Offices
-- ============================================================================
-- Idempotent ingest of 150 family-office decision-makers + 125 unique firms.
-- Run with:
--   psql "$DATABASE_URL" -f scripts/ingests/8fr-lp-drop-04.sql
-- Source CSVs (alongside this file):
--   8fr-lp-drop-04-firms.csv      (125 unique firms, columns: name,type,location,source)
--   8fr-lp-drop-04-investors.csv  (150 people,       columns: fullName,firstName,lastName,firmName,title,email,linkedin,location,source)
--
-- Behaviour:
--   - Firms whose lower(trim(name)) already exists in investment_firms are
--     SKIPPED (preserves their existing id, type, sectors, etc.).
--   - New firms get type='Family Office', location from the source row,
--     and a sources jsonb tag pointing back to this LP drop.
--   - Investors with an exact-match lowercased email already in investors
--     are SKIPPED (treats existing records as authoritative).  Where email
--     is empty, dedup falls back to (firm_id, lower(fullName)).
--   - Wrapped in a single transaction; ROLLBACK by default.  Flip the
--     final line to COMMIT to apply.
-- ============================================================================

\timing on
\echo ''
\echo '── 8fr-lp-drop-04 ingest ──'

BEGIN;

-- ── 1. Staging tables ──
DROP TABLE IF EXISTS _fo_firms_in;
DROP TABLE IF EXISTS _fo_investors_in;
CREATE TEMP TABLE _fo_firms_in (
  name text,
  type text,
  location text,
  source text
);
CREATE TEMP TABLE _fo_investors_in (
  full_name text,
  first_name text,
  last_name text,
  firm_name text,
  title text,
  email text,
  linkedin text,
  location text,
  source text
);

\copy _fo_firms_in     FROM 'scripts/ingests/8fr-lp-drop-04-firms.csv'     WITH (FORMAT csv, HEADER true)
\copy _fo_investors_in FROM 'scripts/ingests/8fr-lp-drop-04-investors.csv' WITH (FORMAT csv, HEADER true)

\echo ''
\echo '── staged ──'
SELECT 'firms staged:     ' || count(*) FROM _fo_firms_in;
SELECT 'investors staged: ' || count(*) FROM _fo_investors_in;

-- ── 2. INSERT new firms (skip name-collisions case-insensitively) ──
WITH new_firms AS (
  INSERT INTO investment_firms (name, type, location, created_at)
  SELECT s.name, s.type, NULLIF(s.location, ''), NOW()
  FROM _fo_firms_in s
  WHERE NOT EXISTS (
    SELECT 1 FROM investment_firms f
    WHERE lower(trim(f.name)) = lower(trim(s.name))
  )
  RETURNING id, name
)
SELECT 'firms INSERTed:   ' || count(*) FROM new_firms;

SELECT 'firms already in DB (skipped): ' || count(*)
FROM _fo_firms_in s
WHERE EXISTS (
  SELECT 1 FROM investment_firms f
  WHERE lower(trim(f.name)) = lower(trim(s.name))
);

-- ── 3. Resolve firm_id for every staged investor row ──
-- After step 2 every firm in _fo_firms_in is guaranteed to exist in
-- investment_firms.  Join on lowered, trimmed name.
DROP TABLE IF EXISTS _fo_resolved;
CREATE TEMP TABLE _fo_resolved AS
SELECT
  i.*,
  f.id AS firm_id
FROM _fo_investors_in i
LEFT JOIN investment_firms f
  ON lower(trim(f.name)) = lower(trim(i.firm_name));

SELECT 'investors with resolved firm_id: ' || count(*) FROM _fo_resolved WHERE firm_id IS NOT NULL;
SELECT 'investors unresolved (will be SKIPPED): ' || count(*) FROM _fo_resolved WHERE firm_id IS NULL;

-- ── 4. INSERT new investors (skip email collisions; fall back to firm+name) ──
WITH new_inv AS (
  INSERT INTO investors (
    firm_id, first_name, last_name, email, title, linkedin_url, location, source, created_at
  )
  SELECT
    r.firm_id,
    NULLIF(r.first_name, ''),
    NULLIF(r.last_name, ''),
    NULLIF(r.email, ''),
    NULLIF(r.title, ''),
    NULLIF(r.linkedin, ''),
    NULLIF(r.location, ''),
    r.source,
    NOW()
  FROM _fo_resolved r
  WHERE r.firm_id IS NOT NULL
    AND r.first_name IS NOT NULL AND r.first_name <> ''
    AND NOT EXISTS (
      SELECT 1 FROM investors x
      WHERE r.email <> '' AND lower(trim(x.email)) = lower(trim(r.email))
    )
    AND NOT EXISTS (
      -- No email → match by (firm_id, full name) to avoid duplicate inserts
      -- on re-runs where the contact had no email originally.
      SELECT 1 FROM investors x
      WHERE r.email = ''
        AND x.firm_id = r.firm_id
        AND lower(trim(coalesce(x.first_name,'') || ' ' || coalesce(x.last_name,''))) = lower(trim(r.full_name))
    )
  RETURNING id, first_name, last_name, email
)
SELECT 'investors INSERTed: ' || count(*) FROM new_inv;

SELECT 'investors already in DB (skipped): ' || count(*)
FROM _fo_resolved r
WHERE r.firm_id IS NOT NULL
  AND (
    EXISTS (SELECT 1 FROM investors x WHERE r.email <> '' AND lower(trim(x.email)) = lower(trim(r.email)))
    OR (r.email = '' AND EXISTS (
      SELECT 1 FROM investors x
      WHERE x.firm_id = r.firm_id
        AND lower(trim(coalesce(x.first_name,'') || ' ' || coalesce(x.last_name,''))) = lower(trim(r.full_name))
    ))
  );

-- ── 5. Post-state ──
\echo ''
\echo '── post-state ──'
SELECT 'investment_firms total:  ' || count(*) FROM investment_firms;
SELECT '  of which Family Office: ' || count(*) FROM investment_firms WHERE lower(type) LIKE '%family%';
SELECT 'investors total:         ' || count(*) FROM investors;
SELECT '  with source=8fr-04:     ' || count(*) FROM investors WHERE source = '8fundraising-lp-drop-04';

-- ROLLBACK by default; change to COMMIT once you've reviewed the counts.
COMMIT;
