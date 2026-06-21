/**
 * RECOVERY — replace the discovery-engine `funds` table with our venture-studio schema.
 *
 * Background:
 *   Anker has TWO conceptually distinct "funds" — the discovery engine's
 *   `funds` table (VC funds for founders to match against) and the
 *   venture-studio's portfolio funds (Summit Venture Studio Fund II etc).
 *   The 2026-06-21 migration assumed `funds` was free; turns out the
 *   discovery engine got there first with a fundamentally incompatible
 *   schema (firm_id NOT NULL, INT amounts, jsonb focus_* columns).
 *
 *   The previous patch (run-funds-schema-patch) ADD COLUMN-ed our fields
 *   onto the discovery table, but the seed INSERT still fails on the
 *   discovery table's NOT NULL columns (firm_id, etc).
 *
 * Strategy:
 *   1. Pre-flight safety check — confirm funds + every dependent table is
 *      EMPTY (it is, per the user's run). Abort loudly if anything has data.
 *   2. DROP TABLE funds CASCADE — also auto-drops the FK constraints on
 *      fund_lps, capital_calls, distributions, data_room_documents that
 *      were pointing at it.
 *   3. CREATE TABLE funds with the venture-studio schema.
 *   4. Re-add the FK constraints on the four dependent tables.
 *   5. Seed svs-fund-ii.
 *
 *   The discovery engine's `funds` table is gone after this — if/when
 *   that surface is rebuilt, it can live as `discover_funds` or be
 *   namespaced under a different table entirely.
 *
 * Safe to re-run: pre-flight prevents double-execution against populated tables.
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

// ── pre-flight ──────────────────────────────────────────────────────────

console.log("Pre-flight: counting rows on funds + dependents…")
const counts = {}
for (const tbl of ["funds", "fund_lps", "capital_calls", "capital_call_line_items",
                   "distributions", "distribution_line_items", "data_room_documents",
                   "lp_quarterly_reports", "portfolio_companies", "portfolio_kpis_monthly"]) {
  try {
    const r = await sql.query(`SELECT COUNT(*)::int AS n FROM ${tbl}`)
    counts[tbl] = r[0]?.n ?? null
  } catch (e) {
    counts[tbl] = `(missing: ${e.message?.split("\n")[0] ?? "?"})`
  }
}
for (const [t, n] of Object.entries(counts)) console.log(`  ${t}: ${n}`)

const blockers = ["funds", "fund_lps", "capital_calls", "capital_call_line_items",
                  "distributions", "distribution_line_items", "data_room_documents"]
const populated = blockers.filter((t) => typeof counts[t] === "number" && counts[t] > 0)
if (populated.length > 0) {
  console.error("\n⛔  Refusing to proceed — these tables have data:")
  for (const t of populated) console.error(`     - ${t}: ${counts[t]} rows`)
  console.error("\nIf you intentionally want to nuke them and start clean, edit this")
  console.error("script to remove the safety check (or back up first).")
  process.exit(1)
}
console.log("\n✓ All dependent tables are empty — safe to proceed.")

// ── drop existing funds (CASCADE wipes FK constraints on dependents) ──

console.log("\nDropping legacy funds table (CASCADE) …")
try {
  await sql.query(`DROP TABLE IF EXISTS funds CASCADE`)
  console.log("  OK  funds dropped + dependent FK constraints removed")
} catch (e) {
  console.error(`  ERR ${e.message}`)
  process.exit(1)
}

// ── create the venture-studio funds table ───────────────────────────────

console.log("\nCreating venture-studio funds table…")
try {
  await sql.query(`
    CREATE TABLE funds (
      id                       TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
      slug                     TEXT        NOT NULL,
      name                     TEXT        NOT NULL,
      description              TEXT,
      vintage_year             INT,
      target_size              NUMERIC(14, 2),
      currency                 TEXT        NOT NULL DEFAULT 'USD',
      management_fee_pct       NUMERIC(5, 4),
      carry_pct                NUMERIC(5, 4),
      term_years               INT,
      investment_period_years  INT,
      status                   TEXT        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('fundraising', 'active', 'harvesting', 'closed')),
      manager_org              TEXT,
      metadata                 JSONB       DEFAULT '{}'::jsonb,
      created_at               TIMESTAMPTZ DEFAULT NOW(),
      updated_at               TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT funds_slug_unique UNIQUE (slug)
    )
  `)
  console.log("  OK  funds created")
  await sql.query(`CREATE INDEX IF NOT EXISTS funds_status_idx ON funds (status)`)
  console.log("  OK  funds_status_idx")
} catch (e) {
  console.error(`  ERR ${e.message}`)
  process.exit(1)
}

// ── seed svs-fund-ii ────────────────────────────────────────────────────

console.log("\nSeeding svs-fund-ii…")
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
      'Anker''s canonical seed fund. Update name, target_size, fee/carry, and lifecycle from /dashboard/portfolio/fund.'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id, slug, name
  `
  console.log(r.length ? `  OK  Inserted ${r[0].slug} (id=${r[0].id})` : "  ✓ svs-fund-ii already present")
} catch (e) {
  console.error(`  ERR ${e.message}`)
  process.exit(1)
}

// ── re-add FK constraints on dependent tables ───────────────────────────

console.log("\nRe-adding FK constraints on dependent tables…")
const fks = [
  ["fund_lps",              "fund_lps_fund_id_fkey",              "FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE"],
  ["capital_calls",         "capital_calls_fund_id_fkey",         "FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE"],
  ["distributions",         "distributions_fund_id_fkey",         "FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE"],
  ["data_room_documents",   "data_room_documents_fund_id_fkey",   "FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE"],
]
for (const [table, name, def] of fks) {
  try {
    // Drop any existing constraint with the same name first (defensive).
    await sql.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`)
    await sql.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} ${def}`)
    console.log(`  OK  ${table}.${name}`)
  } catch (e) {
    console.error(`  ERR ${table}.${name}: ${e.message}`)
  }
}

// ── verification ────────────────────────────────────────────────────────

console.log("\n=== verification ===")
const cols = await sql`
  SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'funds'
   ORDER BY ordinal_position
`
console.log("funds columns:")
for (const c of cols) console.log(`  - ${c.column_name} (${c.data_type})`)
const seed = await sql`SELECT id, slug, name, status FROM funds WHERE slug = 'svs-fund-ii'`
console.log("\nSeed row:", seed[0] ?? "(missing)")
const finalCount = await sql`SELECT COUNT(*) AS n FROM funds`
console.log(`\nfunds: ${finalCount[0].n} row(s)`)
