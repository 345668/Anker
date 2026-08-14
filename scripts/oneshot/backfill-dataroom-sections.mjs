/** Backfill data_room_documents.section from legacy category (fund room). Idempotent. */
import { neon } from "@neondatabase/serverless"
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

// Mirror of lib/dataroom/taxonomy.ts FUND_SECTIONS category → section map.
const CATEGORY_TO_SECTION = {
  subscription: "formation",
  policy: "formation",
  capital_call: "capital_calls",
  distribution: "distributions",
  quarterly_letter: "reporting",
  financials: "reporting",
  k1: "tax",
  other: "ir",
}

let updated = 0
for (const [category, section] of Object.entries(CATEGORY_TO_SECTION)) {
  const res = await sql`
    UPDATE data_room_documents
    SET section = ${section}
    WHERE room_type = 'fund' AND section IS NULL AND category = ${category}
  `
  const n = res.length ?? 0 // neon returns rows for RETURNING; count via separate query below
}

// Report post-state.
const counts = await sql`
  SELECT section, COUNT(*)::int AS n
  FROM data_room_documents
  WHERE room_type = 'fund'
  GROUP BY section ORDER BY n DESC
`
const nullLeft = await sql`SELECT COUNT(*)::int AS n FROM data_room_documents WHERE room_type='fund' AND section IS NULL`
console.log("Fund docs by section:")
for (const r of counts) console.log(`  ${r.section ?? "(null)"} → ${r.n}`)
console.log(`Remaining unsectioned fund docs: ${nullLeft[0]?.n ?? 0}`)
console.log("Backfill complete.")
