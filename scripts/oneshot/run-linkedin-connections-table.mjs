/**
 * Patch — LinkedIn connections table.
 *
 * Stores the user's 1st-degree LinkedIn connections extracted via the
 * Anker Chrome extension's "My Connections" flow (auto-scrolls the
 * mynetwork/connections page, extracts each row, batches to the
 * server).
 *
 * Distinct from crm_entries. A connection here is a person in the user's
 * LinkedIn graph; a CRM entry is someone they want to reach. The two
 * link on linkedin_url when a CRM row has one — surfaced in the Galaxy
 * view.
 *
 * ── Defensive shape ─────────────────────────────────────────────────
 * Idempotent AND drift-safe: a v0 or partial earlier run may have left
 * a table with a different column layout. Rather than trust CREATE
 * TABLE IF NOT EXISTS to reconcile, we:
 *   1. Ensure the table exists (bare skeleton if new).
 *   2. ALTER TABLE ... ADD COLUMN IF NOT EXISTS for every column we
 *      need (safe if they already exist).
 *   3. CREATE UNIQUE INDEX and secondary indexes only after the columns
 *      are guaranteed present.
 *
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-linkedin-connections-table.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

// Helper: run a DDL string against Neon. The tagged-template form only
// takes template literals, so for dynamically-built ALTER statements we
// use sql.query() (Neon serverless supports both).
async function ddl(stmt) {
  if (typeof sql.query === "function") return sql.query(stmt)
  // Fallback: unsafe pass-through as a static template.
  return sql([stmt])
}

console.log("[1/4] Ensuring linkedin_connections table exists…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS linkedin_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    )`
  console.log("       OK  table exists (or created)")
} catch (e) {
  console.error(`       ERR ${e.message}`)
  process.exit(1)
}

console.log("[2/4] Ensuring every column exists…")
const columns = [
  ["owner_user_id", "UUID"],
  ["profile_slug",  "TEXT"],
  ["profile_url",   "TEXT"],
  ["full_name",     "TEXT"],
  ["first_name",    "TEXT"],
  ["last_name",     "TEXT"],
  ["headline",      "TEXT"],
  ["title",         "TEXT"],
  ["firm",          "TEXT"],
  ["firm_slug",     "TEXT"],
  ["location",      "TEXT"],
  ["image_url",     "TEXT"],
  ["connected_at",  "DATE"],
  ["first_seen",    "TIMESTAMPTZ NOT NULL DEFAULT NOW()"],
  ["last_seen",     "TIMESTAMPTZ NOT NULL DEFAULT NOW()"],
  ["raw_meta",      "JSONB NOT NULL DEFAULT '{}'::jsonb"],
]

for (const [name, decl] of columns) {
  try {
    await ddl(`ALTER TABLE linkedin_connections ADD COLUMN IF NOT EXISTS ${name} ${decl}`)
    console.log(`       OK  ${name.padEnd(15)} ${decl}`)
  } catch (e) {
    console.error(`       ERR ${name}: ${e.message}`)
    process.exit(1)
  }
}

console.log("[3/4] Ensuring indexes + uniqueness constraint…")
try {
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS linkedin_connections_owner_slug_uk
      ON linkedin_connections(owner_user_id, profile_slug)
      WHERE owner_user_id IS NOT NULL AND profile_slug IS NOT NULL`
  console.log("       OK  UNIQUE (owner_user_id, profile_slug)")

  await sql`CREATE INDEX IF NOT EXISTS linkedin_connections_owner_idx ON linkedin_connections(owner_user_id)`
  console.log("       OK  INDEX linkedin_connections(owner_user_id)")

  await sql`CREATE INDEX IF NOT EXISTS linkedin_connections_firm_idx ON linkedin_connections(firm_slug) WHERE firm_slug IS NOT NULL`
  console.log("       OK  INDEX linkedin_connections(firm_slug) WHERE NOT NULL")
} catch (e) {
  console.error(`       ERR ${e.message}`)
  process.exit(1)
}

console.log("[4/4] Verifying final schema…")
const cols = await sql`
  SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'linkedin_connections'
   ORDER BY ordinal_position`
console.log("")
console.log("Final schema of linkedin_connections:")
for (const c of cols) {
  console.log(`  ${String(c.column_name).padEnd(15)}  ${String(c.data_type).padEnd(28)}  ${c.is_nullable === "NO" ? "NOT NULL" : "NULL"}`)
}

const cnt = await sql`
  SELECT COUNT(*) AS total,
         COUNT(DISTINCT owner_user_id) AS owners,
         COUNT(DISTINCT firm_slug) AS distinct_firms
    FROM linkedin_connections`
console.log("")
console.log(`Row counts: ${cnt[0].total} total, ${cnt[0].owners} owner(s), ${cnt[0].distinct_firms} distinct firm(s).`)
console.log("")
console.log("Done. Extension 'My Connections' capture + /dashboard/network Galaxy view will now persist.")
