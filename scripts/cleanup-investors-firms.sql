-- Anker DB hygiene — fix-or-delete cleanup for investors + investment_firms.
--
-- IMPORTANT — what changed vs. v1 of this script:
--   The repeated-token pattern (e.g. "Jeff McDowell McDowell", "Flagship
--   Ventures Ventures", "Cynthia Ringo Ringo") is NOT junk — it's a
--   legitimate row whose last_name (or firm name) got duplicated during
--   an import pass.  v1 would have deleted ~12,453 real investors.  v2
--   FIXES those rows in place (strips the duplicated token) and only
--   DELETES rows that are genuinely unrecoverable.
--
-- USAGE
--   1. psql "$DATABASE_URL" -f scripts/cleanup-investors-firms.sql
--   2. Read the PREVIEW counts and 10-row samples.
--   3. To APPLY the changes, change the final line `ROLLBACK;` -> `COMMIT;`
--      and rerun.  Until then, nothing in your data is modified.
--   4. Backup tables are created BEFORE any UPDATE / DELETE.  Restore is:
--        INSERT INTO investors SELECT * FROM cleanup_bak_investors_<ts>
--        ON CONFLICT (id) DO NOTHING;
--
-- TWO OPERATIONS
--   FIX     — strip immediate duplicate tokens in last_name / first_name
--             (investors) and name (investment_firms).  Catches:
--               "Foo Foo"        -> "Foo"
--               "Foo Bar Bar"    -> "Foo Bar"
--               "Foo Foo Bar"    -> "Foo Bar"
--               "Foo Foo Foo"    -> "Foo"
--   DELETE  — only for genuinely-broken rows:
--               * Names with corrupt unicode (dagger / Latin-extended /
--                 currency symbols outside name use)
--               * Names with fewer than 2 letters total
--               * Exact duplicate (full_name + email) — keeps lowest id
--               * investment_firms with NULL / empty name
--               * investors with first_name = last_name AND no email
--                 (likely a single token mis-split into both columns)
--
-- =========================================================================

\timing on
\echo ''
\echo '────────────────────────────────────────────────────────────────────'
\echo '  Anker cleanup: investors + investment_firms'
\echo '────────────────────────────────────────────────────────────────────'

BEGIN;

-- Shared timestamp + backup tables.
CREATE TEMP TABLE _cleanup_meta AS
SELECT to_char(NOW(), 'YYYY_MM_DD_HH24MI') AS ts;

DO $$
DECLARE ts text;
BEGIN
  SELECT m.ts INTO ts FROM _cleanup_meta m LIMIT 1;
  EXECUTE format('CREATE TABLE IF NOT EXISTS cleanup_bak_investors_%s        (LIKE investors        INCLUDING ALL)', ts);
  EXECUTE format('CREATE TABLE IF NOT EXISTS cleanup_bak_investment_firms_%s (LIKE investment_firms INCLUDING ALL)', ts);
  RAISE NOTICE 'Backup table suffix: %', ts;
END $$;

-- =========================================================================
-- 1. INVESTORS — FIX (strip duplicated tokens) + DELETE (genuine junk)
-- =========================================================================

-- 1A. FIX-candidates: any row whose last_name or first_name has an
--     immediate token repeat.  Capture the cleaned values so we can
--     preview before applying.
CREATE TEMP TABLE _fix_investors AS
SELECT
  id,
  first_name,
  last_name,
  regexp_replace(first_name, '\m(\S+)(\s+\1)+\M', '\1', 'g') AS first_name_fixed,
  regexp_replace(last_name,  '\m(\S+)(\s+\1)+\M', '\1', 'g') AS last_name_fixed
FROM investors
WHERE first_name ~* '\m(\S+)\s+\1\M'
   OR last_name  ~* '\m(\S+)\s+\1\M';

\echo ''
\echo '─ Investors — repeated-token FIX preview ─'
SELECT COUNT(*) AS rows_to_fix FROM _fix_investors;

\echo ''
\echo '─ Investors — 10 sample fixes (before vs after) ─'
SELECT id,
       (coalesce(first_name,'')||' '||coalesce(last_name,''))                AS before_name,
       (coalesce(first_name_fixed,'')||' '||coalesce(last_name_fixed,''))    AS after_name
FROM _fix_investors
ORDER BY random()
LIMIT 10;

-- 1B. DELETE-candidates: genuine junk only.
CREATE TEMP TABLE _bad_investors AS
WITH base AS (
  SELECT id,
         COALESCE(NULLIF(trim(first_name),''),'') AS f,
         COALESCE(NULLIF(trim(last_name), ''),'') AS l,
         trim(COALESCE(first_name,'')||' '||COALESCE(last_name,'')) AS full_name,
         lower(trim(email)) AS norm_email
  FROM investors
),
duplicates AS (
  SELECT id
  FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY lower(trim(full_name)), norm_email
             ORDER BY id ASC
           ) AS rn
    FROM base
    WHERE full_name <> '' AND norm_email <> ''
  ) x
  WHERE x.rn > 1
)
SELECT b.id,
       CASE
         WHEN length(regexp_replace(b.full_name, '[^A-Za-z]', '', 'g')) < 2
                                                            THEN 'B: <2 letters'
         WHEN b.full_name ~ '[†¥Ł€◊⊙⋆ϕψξ⊕Θ]'                 THEN 'C: corrupt-character name'
         WHEN b.f <> '' AND b.l <> ''
              AND lower(b.f) = lower(b.l)
              AND b.norm_email = ''                         THEN 'D: first=last, no email'
         WHEN b.id IN (SELECT id FROM duplicates)            THEN 'E: duplicate name+email'
       END AS reason
FROM base b
WHERE
     length(regexp_replace(b.full_name, '[^A-Za-z]', '', 'g')) < 2
  OR b.full_name ~ '[†¥Ł€◊⊙⋆ϕψξ⊕Θ]'
  OR (b.f <> '' AND b.l <> '' AND lower(b.f) = lower(b.l) AND b.norm_email = '')
  OR b.id IN (SELECT id FROM duplicates);

\echo ''
\echo '─ Investors — DELETE preview by reason ─'
SELECT reason, COUNT(*) AS rows
FROM _bad_investors
GROUP BY reason
ORDER BY rows DESC;

\echo ''
\echo '─ Investors — 10 sample rows that would be DELETED ─'
SELECT bi.id, bi.reason,
       trim(coalesce(i.first_name,'') || ' ' || coalesce(i.last_name,'')) AS name,
       i.email
FROM _bad_investors bi
JOIN investors i ON i.id = bi.id
ORDER BY random()
LIMIT 10;

-- 1C. Backup, then apply FIX + DELETE.
DO $$
DECLARE ts text;
BEGIN
  SELECT m.ts INTO ts FROM _cleanup_meta m LIMIT 1;
  EXECUTE format(
    'INSERT INTO cleanup_bak_investors_%s
       SELECT * FROM investors
       WHERE id IN (SELECT id FROM _fix_investors)
          OR id IN (SELECT id FROM _bad_investors)',
    ts
  );
END $$;

UPDATE investors AS i
SET first_name = f.first_name_fixed,
    last_name  = f.last_name_fixed,
    updated_at = NOW()
FROM _fix_investors f
WHERE i.id = f.id
  AND (i.first_name IS DISTINCT FROM f.first_name_fixed
       OR i.last_name  IS DISTINCT FROM f.last_name_fixed);

DELETE FROM investors WHERE id IN (SELECT id FROM _bad_investors);

\echo ''
\echo '─ Investors — total AFTER pending changes ─'
SELECT COUNT(*) AS investors_remaining FROM investors;

-- =========================================================================
-- 2. INVESTMENT FIRMS
-- =========================================================================

CREATE TEMP TABLE _fix_firms AS
SELECT id, name, regexp_replace(name, '\m(\S+)(\s+\1)+\M', '\1', 'g') AS name_fixed
FROM investment_firms
WHERE name ~* '\m(\S+)\s+\1\M';

\echo ''
\echo '─ Firms — repeated-token FIX preview ─'
SELECT COUNT(*) AS rows_to_fix FROM _fix_firms;

\echo ''
\echo '─ Firms — 10 sample fixes (before vs after) ─'
SELECT id, name AS before_name, name_fixed AS after_name
FROM _fix_firms
ORDER BY random()
LIMIT 10;

CREATE TEMP TABLE _bad_firms AS
WITH base AS (
  SELECT id, COALESCE(NULLIF(trim(name),''),'') AS n
  FROM investment_firms
),
duplicates AS (
  SELECT id
  FROM (
    SELECT id, row_number() OVER (PARTITION BY lower(trim(n)) ORDER BY id ASC) AS rn
    FROM base
    WHERE n <> ''
  ) x
  WHERE x.rn > 1
)
SELECT b.id,
       CASE
         WHEN b.n = ''                                                 THEN 'F: empty name'
         WHEN length(regexp_replace(b.n, '[^A-Za-z]', '', 'g')) < 2    THEN 'B: <2 letters'
         WHEN b.n ~ '[†¥Ł€◊⊙⋆ϕψξ⊕Θ]'                                  THEN 'C: corrupt-character name'
         WHEN b.id IN (SELECT id FROM duplicates)                      THEN 'E: duplicate name'
       END AS reason
FROM base b
WHERE
     b.n = ''
  OR length(regexp_replace(b.n, '[^A-Za-z]', '', 'g')) < 2
  OR b.n ~ '[†¥Ł€◊⊙⋆ϕψξ⊕Θ]'
  OR b.id IN (SELECT id FROM duplicates);

\echo ''
\echo '─ Firms — DELETE preview by reason ─'
SELECT reason, COUNT(*) AS rows
FROM _bad_firms
GROUP BY reason
ORDER BY rows DESC;

\echo ''
\echo '─ Firms — 10 sample rows that would be DELETED ─'
SELECT bf.id, bf.reason, f.name
FROM _bad_firms bf
JOIN investment_firms f ON f.id = bf.id
ORDER BY random()
LIMIT 10;

DO $$
DECLARE ts text;
BEGIN
  SELECT m.ts INTO ts FROM _cleanup_meta m LIMIT 1;
  EXECUTE format(
    'INSERT INTO cleanup_bak_investment_firms_%s
       SELECT * FROM investment_firms
       WHERE id IN (SELECT id FROM _fix_firms)
          OR id IN (SELECT id FROM _bad_firms)',
    ts
  );
END $$;

UPDATE investment_firms AS f
SET name = x.name_fixed,
    updated_at = NOW()
FROM _fix_firms x
WHERE f.id = x.id
  AND f.name IS DISTINCT FROM x.name_fixed;

DELETE FROM investment_firms WHERE id IN (SELECT id FROM _bad_firms);

\echo ''
\echo '─ Firms — total AFTER pending changes ─'
SELECT COUNT(*) AS firms_remaining FROM investment_firms;

-- =========================================================================
-- DECISION GATE
-- =========================================================================
-- Nothing has actually been saved yet — we are inside a BEGIN that is
-- about to ROLLBACK.  The preview lines above are all you needed to see.
--
-- To APPLY:   change the LAST line `ROLLBACK;` -> `COMMIT;` and rerun.
-- To ABORT:   keep `ROLLBACK;` (the default).

ROLLBACK;
-- COMMIT;
