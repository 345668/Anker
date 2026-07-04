/**
 * Patch — LinkedIn connections table.
 *
 * Stores the user's 1st-degree LinkedIn connections extracted via the
 * Anker Chrome extension's "My Connections" flow (auto-scrolls the
 * mynetwork/connections page, extracts each row, batches to the
 * server).
 *
 * Distinct from crm_entries (which are outreach targets managed by
 * the fund team). A connection here is a person in the user's LinkedIn
 * graph; a CRM entry is someone they want to reach. The two link on
 * linkedin_url when a CRM row has one — surfaced in the Galaxy view.
 *
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-linkedin-connections-table.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("Creating linkedin_connections table…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS linkedin_connections (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id UUID NOT NULL,
      profile_slug  TEXT NOT NULL,
      profile_url   TEXT NOT NULL,
      full_name     TEXT,
      first_name    TEXT,
      last_name     TEXT,
      headline      TEXT,
      title         TEXT,
      firm          TEXT,
      firm_slug     TEXT,
      location      TEXT,
      image_url     TEXT,
      connected_at  DATE,
      first_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_meta      JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE (owner_user_id, profile_slug)
    )`
  await sql`CREATE INDEX IF NOT EXISTS linkedin_connections_owner_idx ON linkedin_connections(owner_user_id)`
  await sql`CREATE INDEX IF NOT EXISTS linkedin_connections_firm_idx  ON linkedin_connections(firm_slug) WHERE firm_slug IS NOT NULL`
  console.log("  OK  linkedin_connections + 2 indexes")
} catch (e) {
  console.error(`  ERR ${e.message}`)
  process.exit(1)
}

const cnt = await sql`
  SELECT COUNT(*) AS total,
         COUNT(DISTINCT owner_user_id) AS owners,
         COUNT(DISTINCT firm_slug) AS distinct_firms
    FROM linkedin_connections`
console.log(`\nlinkedin_connections: ${cnt[0].total} row(s), ${cnt[0].owners} owner(s), ${cnt[0].distinct_firms} distinct firm(s).`)
console.log("\nDone. Extension 'My Connections' capture + /dashboard/network Galaxy view will now persist.")
