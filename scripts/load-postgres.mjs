/**
 * Native Postgres loader (used by `docker compose run loader`).
 *
 * Same logic as load-local-db.mjs but writes to a real Postgres at
 * DATABASE_URL instead of PGlite. Uses the `pg` driver via dynamic
 * import so it doesn't need to be a top-level dep.
 */
import { createRequire } from "node:module"
import path from "node:path"
import fs from "node:fs"
import { fileURLToPath } from "node:url"
const require = createRequire(import.meta.url)
const XLSX = require("xlsx")
const { Client } = require("pg")

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const MIGRATION_PATH = path.join(ROOT, "scripts/migrations/2026-04-25-matching-v2.sql")

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error("DATABASE_URL is required")
  process.exit(1)
}

const FIRMS = process.env.FIRMS_XLSX || process.argv[2]
const INVESTORS = process.env.INVESTORS_XLSX || process.argv[3]
if (!FIRMS || !INVESTORS) {
  console.error("Usage: DATABASE_URL=... node load-postgres.mjs <firms.xlsx> <investors.xlsx>")
  process.exit(1)
}

const client = new Client({ connectionString: dbUrl })
await client.connect()
console.log("[load-pg] connected to", dbUrl.replace(/:[^:@]+@/, ":***@"))

// Same SCHEMA + load-local-db.mjs but using `pg` instead of PGlite.
// We re-use the SQL by extracting it.
const SCHEMA = fs.readFileSync(path.join(ROOT, "scripts/load-local-db.mjs"), "utf8")
  .split("const SCHEMA = `")[1]
  .split("`\n")[0]

console.log("[load-pg] applying base schema…")
await client.query(SCHEMA)

if (fs.existsSync(MIGRATION_PATH)) {
  console.log("[load-pg] applying v2 migration…")
  await client.query(fs.readFileSync(MIGRATION_PATH, "utf8"))
}

// Demo fund profiles (same two as PGlite)
console.log("[load-pg] seeding demo fund profiles…")
await client.query(
  `INSERT INTO fund_profiles (id, name, target_raise, sectors, primary_sectors, geographic_focus, headquarters_location, thesis_keywords, average_ticket, fund_number, is_active)
   VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9,$10,$11)
   ON CONFLICT (id) DO NOTHING`,
  ["fp_svs_fund_ii_demo", "SVS Fund II (Demo)", 40000000,
   JSON.stringify(["healthcare","edtech","saas","ai/ml","deep tech","life sciences","sportstech"]),
   JSON.stringify(["healthcare","edtech"]),
   JSON.stringify(["us","utah","mountain_west","dach","gulf","italy","canada"]),
   "Lehi, Utah, United States",
   JSON.stringify(["university","venture studio","emerging manager","tech transfer","micro-PE","acquisition"]),
   8000000, 2, true],
)
await client.query(
  `INSERT INTO fund_profiles (id, name, target_raise, sectors, primary_sectors, geographic_focus, headquarters_location, thesis_keywords, average_ticket, fund_number, is_active)
   VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9,$10,$11)
   ON CONFLICT (id) DO NOTHING`,
  ["fp_winner_capital_demo", "Winner Capital (Demo)", 5000000,
   JSON.stringify(["consumer","ai/ml","fintech","healthtech","saas","consumer technology"]),
   JSON.stringify(["consumer","ai/ml"]),
   JSON.stringify(["us","canada","dach"]),
   "New York, United States",
   JSON.stringify(["consumer ai","first-time fund","emerging manager"]),
   200000, 1, true],
)

// Load firms + investors via pg COPY-style multi-row INSERT (same approach
// as load-local-db.mjs)
const FIRM_COLS = ["id","name","description","website","logo","type","aum","location","stages","sectors","check_size_min","check_size_max","portfolio_count","linkedin_url","twitter_url","created_at","folk_id","folk_workspace_id","folk_list_ids","folk_updated_at","source","updated_at","hq_location","industry","emails","phones","addresses","urls","funding_raised","last_funding_date","foundation_year","employee_range","status","folk_custom_fields","url_1","url_2","firm_classification","typical_check_size","enrichment_status","last_enrichment_date","enrichment_error","logo_url"]
const INV_COLS = ["id","user_id","firm_id","first_name","last_name","email","phone","title","linkedin_url","twitter_url","avatar","bio","stages","sectors","location","is_active","created_at","updated_at","folk_id","source","folk_workspace_id","folk_list_ids","folk_updated_at","person_linkedin_url","investor_type","investor_state","investor_country","fund_hq","hq_location","funding_stage","typical_investment","num_lead_investments","total_investments","recent_investments","status","website","folk_custom_fields","address","enrichment_status","last_enrichment_date","investment_thesis","preferred_stages","preferred_sectors","typical_check_size","focus_niches","geography_focus","portfolio_count"]

await loadXlsx(client, FIRMS, "investment_firms", FIRM_COLS)
await loadXlsx(client, INVESTORS, "investors", INV_COLS)

const f = await client.query("SELECT COUNT(*) FROM investment_firms")
const i = await client.query("SELECT COUNT(*) FROM investors")
console.log(`\n[load-pg] DONE  firms=${f.rows[0].count}  investors=${i.rows[0].count}`)
await client.end()

async function loadXlsx(client, file, table, cols) {
  console.log(`\n[load-pg] reading ${file}…`)
  const wb = XLSX.readFile(file)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true })
  console.log(`[load-pg] ${rows.length} rows → ${table}`)

  const jsonCols = new Set(["stages","sectors","folk_list_ids","emails","phones","addresses","urls","folk_custom_fields","recent_investments","preferred_stages","preferred_sectors","focus_niches","geography_focus"])
  const boolCols = new Set(["is_active"])
  const intCols = new Set(["check_size_min","check_size_max","portfolio_count","foundation_year","num_lead_investments","total_investments"])

  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const values = []
    const placeholders = []
    let p = 1
    for (const row of batch) {
      const ph = []
      for (const col of cols) {
        let v = row[col]
        if (v === undefined) v = null
        if (v != null && jsonCols.has(col)) {
          if (typeof v === "object") v = JSON.stringify(v)
          else if (typeof v === "string") {
            try { JSON.parse(v) } catch { v = JSON.stringify([v]) }
          }
        }
        if (v != null && boolCols.has(col)) v = v === true || v === "true" || v === 1 || v === "1"
        if (v != null && intCols.has(col)) {
          const n = Number(v); v = Number.isFinite(n) ? Math.trunc(n) : null
        }
        ph.push(`$${p++}`)
        values.push(v)
      }
      placeholders.push(`(${ph.join(",")})`)
    }
    await client.query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES ${placeholders.join(",")} ON CONFLICT (id) DO NOTHING`,
      values,
    )
    inserted += batch.length
    if (inserted % 5000 === 0 || inserted === rows.length) {
      process.stdout.write(`\r  ${inserted}/${rows.length}`)
    }
  }
  process.stdout.write("\n")
}
