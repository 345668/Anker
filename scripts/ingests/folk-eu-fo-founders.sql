-- ============================================================================
-- Folk CRM export — European Family Offices' Founders (147 contacts)
-- ============================================================================
-- Curated by Philippe Masindet in Folk's "European Family Offices' Founders"
-- group.  No emails in the export (Folk withheld them); enrichment-driven
-- dedupe falls back to name + firm.
--
-- Run with:
--   psql "$DATABASE_URL" -f scripts/ingests/folk-eu-fo-founders.sql
--
-- Behaviour:
--   - Firms whose lower(trim(name)) match an existing investment_firms row
--     are SKIPPED — existing id/type/sectors/folk_id stay intact.
--   - New firms land with type='Family Office', location='<city>, <country>',
--     website from the source row when present.
--   - People are deduped by (firm_id, lower(first_name+last_name)) since
--     this Folk export carries no email addresses.
--   - All people tagged source='folk-european-family-offices-founders'.
--   - Wrapped in BEGIN / COMMIT.
-- ============================================================================

\timing on
\echo ''
\echo '── folk-eu-fo-founders ingest ──'

BEGIN;

DROP TABLE IF EXISTS _eufo_firms_in;
DROP TABLE IF EXISTS _eufo_investors_in;
CREATE TEMP TABLE _eufo_firms_in (
  name text, type text, location text, website text, source text
);
CREATE TEMP TABLE _eufo_investors_in (
  full_name text, first_name text, last_name text, firm_name text,
  title text, email text, linkedin text, location text, source text
);

\copy _eufo_firms_in     FROM 'scripts/ingests/folk-eu-fo-founders-firms.csv'     WITH (FORMAT csv, HEADER true)
\copy _eufo_investors_in FROM 'scripts/ingests/folk-eu-fo-founders-investors.csv' WITH (FORMAT csv, HEADER true)

\echo ''
\echo '── staged ──'
SELECT 'firms staged:     ' || count(*) FROM _eufo_firms_in;
SELECT 'investors staged: ' || count(*) FROM _eufo_investors_in;

-- 1. Insert new firms (skip case-insensitive name collisions)
WITH new_firms AS (
  INSERT INTO investment_firms (name, type, location, website, created_at)
  SELECT s.name, s.type, NULLIF(s.location, ''), NULLIF(s.website, ''), NOW()
  FROM _eufo_firms_in s
  WHERE NOT EXISTS (
    SELECT 1 FROM investment_firms f WHERE lower(trim(f.name)) = lower(trim(s.name))
  )
  RETURNING id, name
)
SELECT 'firms INSERTed:                 ' || count(*) FROM new_firms;
SELECT 'firms already in DB (skipped):  ' || count(*)
FROM _eufo_firms_in s
WHERE EXISTS (SELECT 1 FROM investment_firms f WHERE lower(trim(f.name)) = lower(trim(s.name)));

-- 2. Resolve firm_id for every staged investor
DROP TABLE IF EXISTS _eufo_resolved;
CREATE TEMP TABLE _eufo_resolved AS
SELECT i.*, f.id AS firm_id
FROM _eufo_investors_in i
LEFT JOIN investment_firms f ON lower(trim(f.name)) = lower(trim(i.firm_name));

SELECT 'investors with resolved firm_id: ' || count(*) FROM _eufo_resolved WHERE firm_id IS NOT NULL;
SELECT 'investors unresolved (skip):     ' || count(*) FROM _eufo_resolved WHERE firm_id IS NULL;

-- 3. Insert new people.  Dedupe by (firm_id, lowercase full name)
--    because the Folk export carries no emails.
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
  FROM _eufo_resolved r
  WHERE r.firm_id IS NOT NULL
    AND r.first_name IS NOT NULL AND r.first_name <> ''
    AND NOT EXISTS (
      SELECT 1 FROM investors x
      WHERE x.firm_id = r.firm_id
        AND lower(trim(coalesce(x.first_name,'') || ' ' || coalesce(x.last_name,''))) = lower(trim(r.full_name))
    )
  RETURNING id, first_name, last_name
)
SELECT 'investors INSERTed:              ' || count(*) FROM new_inv;
SELECT 'investors already in DB (skipped): ' || count(*)
FROM _eufo_resolved r
WHERE r.firm_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM investors x
    WHERE x.firm_id = r.firm_id
      AND lower(trim(coalesce(x.first_name,'') || ' ' || coalesce(x.last_name,''))) = lower(trim(r.full_name))
  );

\echo ''
\echo '── post-state ──'
SELECT 'investment_firms total:        ' || count(*) FROM investment_firms;
SELECT '  of which Family Office:      ' || count(*) FROM investment_firms WHERE lower(type) LIKE '%family%';
SELECT 'investors total:               ' || count(*) FROM investors;
SELECT '  with source=folk-eu-fo:       ' || count(*) FROM investors WHERE source = 'folk-european-family-offices-founders';

COMMIT;
