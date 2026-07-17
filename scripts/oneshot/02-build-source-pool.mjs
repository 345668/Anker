/**
 * Phase 1 · Build source pool for the July 16 IP webinar campaign.
 *
 * Unions three sources into one deduped XLSX:
 *   - investors table (Neon)
 *   - crm_entries table (Neon)
 *   - anker-network-*.xlsx (LinkedIn export)
 *
 * Dedupe order: linkedin_url → normalized(name+firm) → email.
 *
 * Usage:
 *   NEON_DATABASE_URL='postgresql://…' \
 *     node scripts/oneshot/02-build-source-pool.mjs \
 *       ~/Downloads/anker-network-2026-07-11.xlsx
 *
 * Output: source-pool.xlsx in cwd. Every row has a `source` column so we
 * know where the contact came from (neon-investors, neon-crm, linkedin-export).
 */
import { neon } from "@neondatabase/serverless"
import ExcelJS from "exceljs"
import { readFile } from "node:fs/promises"

const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const networkXlsx = process.argv[2]
if (!networkXlsx) { console.error("Usage: node 02-build-source-pool.mjs <path/to/anker-network-*.xlsx>"); process.exit(1) }

const sql = neon(url)

const norm = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ")
const normUrl = (s) => norm(s).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")

console.log("→ Pulling investors from Neon…")
const investors = await sql`
  SELECT id::text, name, email, linkedin_url, title, firm, tags,
         COALESCE(metadata->>'lp_type', 'investor')  AS lp_type,
         COALESCE(metadata->>'sectors', '')         AS sectors,
         COALESCE(metadata->>'location', '')        AS location
  FROM investors
  WHERE name IS NOT NULL
`
console.log(`  ${investors.length} rows`)

console.log("→ Pulling crm_entries from Neon…")
const crmRows = await sql`
  SELECT id::text,
         COALESCE(display_name, linkedin_data->>'name') AS name,
         display_email                                  AS email,
         display_linkedin                               AS linkedin_url,
         linkedin_data->>'title'                        AS title,
         linkedin_data->>'company'                      AS firm,
         linkedin_data->>'headline'                     AS headline,
         stage
  FROM crm_entries
  WHERE display_name IS NOT NULL OR linkedin_data IS NOT NULL
`
console.log(`  ${crmRows.length} rows`)

console.log(`→ Reading LinkedIn network export: ${networkXlsx}`)
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(networkXlsx)
const ws = wb.worksheets[0]
const headers = ws.getRow(1).values.map((v) => (v ? v.toString().trim() : ""))
const idx = (name) => headers.indexOf(name)
const networkRows = []
ws.eachRow({ includeEmpty: false }, (row, n) => {
  if (n === 1) return
  const v = row.values
  networkRows.push({
    source: "linkedin-export",
    name: v[idx("name")] || null,
    linkedin_url: v[idx("linkedin_url")] || null,
    headline: v[idx("headline")] || null,
    firm: v[idx("company")] || null,
    title: v[idx("title")] || null,
    location: v[idx("location")] || null,
    degree: v[idx("degree")] || null,
    previous_firm: v[idx("previous_company")] || null,
    previous_title: v[idx("previous_title")] || null,
  })
})
console.log(`  ${networkRows.length} rows`)

console.log("→ Deduping (linkedin_url → name+firm → email)…")
const pool = new Map()  // key → merged row
const upsert = (row, source) => {
  const key1 = row.linkedin_url ? `li:${normUrl(row.linkedin_url)}` : null
  const key2 = row.name ? `n:${norm(row.name)}|f:${norm(row.firm)}` : null
  const key3 = row.email ? `e:${norm(row.email)}` : null
  const key = key1 || key2 || key3 || `x:${Math.random()}`
  const existing = pool.get(key) || {}
  const merged = {
    ...existing,
    ...Object.fromEntries(Object.entries(row).filter(([, v]) => v)),
    sources: Array.from(new Set([...(existing.sources || []), source])),
  }
  pool.set(key, merged)
}
for (const r of investors) upsert(r, "neon-investors")
for (const r of crmRows) upsert(r, "neon-crm")
for (const r of networkRows) upsert(r, "linkedin-export")

const rows = Array.from(pool.values())
console.log(`  ${rows.length} unique contacts after dedupe`)

// Write out
console.log("→ Writing source-pool.xlsx…")
const out = new ExcelJS.Workbook()
const outWs = out.addWorksheet("Pool")
const cols = ["name", "email", "linkedin_url", "firm", "title", "headline",
              "lp_type", "sectors", "location", "tags", "degree",
              "previous_firm", "previous_title", "sources", "stage"]
outWs.addRow(cols)
for (const r of rows) {
  outWs.addRow(cols.map((c) => {
    const v = r[c]
    if (Array.isArray(v)) return v.join(", ")
    return v ?? ""
  }))
}
outWs.getRow(1).font = { bold: true }
await out.xlsx.writeFile("source-pool.xlsx")
console.log(`✓ source-pool.xlsx written (${rows.length} rows)`)

// Summary of coverage
const counts = { withEmail: 0, withLinkedin: 0, withBoth: 0, withNeither: 0 }
for (const r of rows) {
  const hasE = !!r.email
  const hasL = !!r.linkedin_url
  if (hasE && hasL) counts.withBoth++
  else if (hasE) counts.withEmail++
  else if (hasL) counts.withLinkedin++
  else counts.withNeither++
}
console.log("\nCoverage:")
console.log(`  email + linkedin: ${counts.withBoth}`)
console.log(`  email only:       ${counts.withEmail}`)
console.log(`  linkedin only:    ${counts.withLinkedin}`)
console.log(`  neither:          ${counts.withNeither}`)
