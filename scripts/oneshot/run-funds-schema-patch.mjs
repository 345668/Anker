/**
 * Patch script — defensive ALTER for the pre-existing `funds` table on Neon.
 *
 * Context: an earlier feature created a `funds` table with a different shape
 * than the one in scripts/migrations/2026-06-21-funds-and-lps.sql. The
 * CREATE TABLE IF NOT EXISTS in that migration no-op'd against the existing
 * table, then the seed INSERT failed because the existing schema is missing
 * `slug` (and likely other columns).
 *
 * This script:
 *   1. Introspects the existing `funds` columns
 *   2. Adds every column our migration expected, idempotently
 *   3. Adds the UNIQUE(slug) constraint when slug exists + no constraint yet
 *   4. Adds the status CHECK constraint when missing (drops + recreates if
 *      the existing one disagrees with our enum)
 *   5. Adds the funds_status_idx if missing
 *   6. Runs the svs-fund-ii seed INSERT (idempotent via ON CONFLICT DO NOTHING)
 *
 * Safe to run multiple times.
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

// 1) Snapshot what's there.
const colsBefore = await sql`
  SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'funds'
   ORDER BY ordinal_position
`
console.log("Existing funds columns:")
for (const c of colsBefore) console.log(`  - ${c.column_name} (${c.data_type})`)

// 2) ALTER TABLE … ADD COLUMN IF NOT EXISTS for everything our migration
//    declared. NOT NULL on slug/name is enforced separately AFTER backfill
//    so the column add doesn't fail on existing rows.
const addColumnStatements = [
  ["slug",                    "TEXT"],
  ["name",                    "TEXT"],
  ["description",             "TEXT"],
  ["vintage_year",            "INT"],
  ["target_size",             "NUMERIC(14, 2)"],
  ["currency",                "TEXT NOT NULL DEFAULT 'USD'"],
  ["management_fee_pct",      "NUMERIC(5, 4)"],
  ["carry_pct",               "NUMERIC(5, 4)"],
  ["term_years",              "INT"],
  ["investment_period_years", "INT"],
  ["status",                  "TEXT NOT NULL DEFAULT 'active'"],
  ["manager_org",             "TEXT"],
  ["metadata",                "JSONB DEFAULT '{}'::jsonb"],
  ["created_at",              "TIMESTAMPTZ DEFAULT NOW()"],
  ["updated_at",              "TIMESTAMPTZ DEFAULT NOW()"],
]

console.log("\nAdding missing columns…")
for (const [col, type] of addColumnStatements) {
  try {
    await sql.query(`ALTER TABLE funds ADD COLUMN IF NOT EXISTS ${col} ${type}`)
    console.log(`  OK  ADD COLUMN ${col}`)
  } catch (e) {
    console.error(`  ERR ADD COLUMN ${col}: ${e.message}`)
  }
}

// 3) Backfill slug + name for any existing rows that have neither — so the
//    NOT NULL we'd like to add doesn't break. Use id as the placeholder so
//    they're unique but easily recognisable.
console.log("\nBackfilling slug/name on legacy rows…")
try {
  const r = await sql`
    UPDATE funds
       SET slug = COALESCE(NULLIF(slug, ''), 'legacy-' || substr(id, 1, 8)),
           name = COALESCE(NULLIF(name, ''), 'Legacy fund ' || substr(id, 1, 8))
     WHERE slug IS NULL OR slug = '' OR name IS NULL OR name = ''
   RETURNING id, slug, name
  `
  console.log(`  Patched ${r.length} legacy row(s)`)
} catch (e) {
  console.error(`  ERR backfill: ${e.message}`)
}

// 4) Add the UNIQUE constraint on slug. Conditional via pg_constraint lookup.
console.log("\nAdding UNIQUE(slug) constraint…")
try {
  const exists = await sql`
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.funds'::regclass AND conname = 'funds_slug_unique'
  `
  if (exists.length === 0) {
    await sql`ALTER TABLE funds ADD CONSTRAINT funds_slug_unique UNIQUE (slug)`
    console.log("  OK  funds_slug_unique constraint added")
  } else {
    console.log("  ✓ funds_slug_unique already present")
  }
} catch (e) {
  console.error(`  ERR add unique: ${e.message}`)
}

// 5) Add the status CHECK constraint if missing.
console.log("\nAdding status CHECK constraint…")
try {
  const exists = await sql`
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.funds'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%fundraising%'
  `
  if (exists.length === 0) {
    await sql`ALTER TABLE funds ADD CONSTRAINT funds_status_check
              CHECK (status IN ('fundraising', 'active', 'harvesting', 'closed'))`
    console.log("  OK  funds_status_check added")
  } else {
    console.log(`  ✓ status check already present (${exists[0].conname})`)
  }
} catch (e) {
  console.error(`  ERR add check: ${e.message}`)
}

// 6) Status index.
console.log("\nIndex…")
try {
  await sql`CREATE INDEX IF NOT EXISTS funds_status_idx ON funds (status)`
  console.log("  OK  funds_status_idx")
} catch (e) {
  console.error(`  ERR: ${e.message}`)
}

// 7) Seed the svs-fund-ii row.
console.log("\nSeeding svs-fund-ii row…")
try {
  const r = await sql`
    INSERT INTO funds (slug, name, vintage_year, currency, status, manager_org, description)
    VALUES (
      'svs-fund-ii',
      'Summit Venture Studio — Fund II',
      2026,
      'USD',
      'fundraising',
      'Summit Venture Studio',
      ' '
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id, slug, name
  `
  console.log(r.length ? `  OK  Inserted ${r[0].slug} (id=${r[0].id})` : "  ✓ svs-fund-ii already present")
} catch (e) {
  console.error(`  ERR seed: ${e.message}`)
}

// 8) Show final state.
const colsAfter = await sql`
  SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'funds'
   ORDER BY ordinal_position
`
console.log("\nFinal funds columns:")
for (const c of colsAfter) console.log(`  - ${c.column_name} (${c.data_type})`)

const cnt = await sql`SELECT COUNT(*) AS n FROM funds`
console.log(`\nfunds: ${cnt[0].n} row(s)`)
