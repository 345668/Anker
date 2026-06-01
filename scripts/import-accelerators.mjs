#!/usr/bin/env node
/**
 * Import the "+2,000 Accelerators & Incubators" CSV into investment_firms.
 * Source: 8fundraising playbook bundle.
 *
 * Header row is row 1 (no title rows on this sheet):
 *   Accelerator / Incubator,Website,Country,City,Industries,Founders,
 *   Founded Date,Number of Investments,Number of Exits
 *
 * Per row:
 *   - upsert investment_firms (type='accelerator')
 *   - founders → investors with title 'Founder'
 *   - tagged with source='csv:accelerators-2026'
 *
 * Idempotent — same stable-ID strategy as the VC importer.
 *
 * Usage:
 *   node scripts/import-accelerators.mjs            # default path
 *   node scripts/import-accelerators.mjs <csv-path>
 */
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
const require = createRequire(import.meta.url)
const { Client } = require("pg")
const XLSX = require("xlsx")

const csvPath = process.argv[2] || path.resolve("data/csv/accelerators.csv")
const url = process.env.DATABASE_URL || "postgresql://anker:anker@localhost:5432/anker"
const SOURCE = "csv:accelerators-2026"

const client = new Client({ connectionString: url })
await client.connect()
console.log(`[accelerators] connected to ${redact(url)}`)

const wb = XLSX.read(readFileSync(csvPath), { type: "buffer", cellDates: false, raw: false })
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false })
console.log(`[accelerators] ${rows.length} raw rows`)

const header = rows[0].map((h) => String(h).trim())
const COL = (name) => header.indexOf(name)
const idxName = COL("Accelerator / Incubator")
const idxWeb = COL("Website")
const idxCountry = COL("Country")
const idxCity = COL("City")
const idxIndustries = COL("Industries")
const idxFounders = COL("Founders")
const idxFounded = COL("Founded Date")
const idxNumInv = COL("Number of Investments")
const idxNumExit = COL("Number of Exits")

if (idxName < 0) throw new Error(`Header layout unexpected: ${header.join(" | ")}`)

let firmsInserted = 0, firmsUpdated = 0, firmsSkipped = 0
let investorsInserted = 0, investorsSkipped = 0
const errors = []

for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  const name = String(r?.[idxName] ?? "").trim()
  if (!name || name.toLowerCase() === "accelerator / incubator") continue
  try {
    const country = String(r[idxCountry] ?? "").trim() || null
    const city = String(r[idxCity] ?? "").trim() || null
    const location = [city, country].filter(Boolean).join(", ") || null
    const industries = String(r[idxIndustries] ?? "").trim()
    const isAgnostic = /agnostic/i.test(industries)
    const sectors = isAgnostic ? ["industry-agnostic"] : csvSplit(industries)
    const website = cleanWeb(r[idxWeb])
    const founded = parseIntOrNull(r[idxFounded])
    const numInv = parseIntOrNull(r[idxNumInv])
    const numExit = parseIntOrNull(r[idxNumExit])

    const firmId = stableId("ifm", "acc::" + normalize(name))
    const description = [
      `Accelerator / incubator${isAgnostic ? " (industry agnostic)" : ""}`,
      numInv != null ? `Investments: ${numInv}` : "",
      numExit != null ? `Exits: ${numExit}` : "",
    ].filter(Boolean).join(" · ")

    const existing = await client.query("SELECT 1 FROM investment_firms WHERE id = $1 LIMIT 1", [firmId])
    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO investment_firms (
           id, name, type, firm_classification, hq_location, location,
           website, sectors, description, founded_year,
           source, created_at, updated_at
         ) VALUES (
           $1, $2, 'accelerator', 'accelerator', $3, $3,
           $4, $5::jsonb, $6, $7,
           $8, NOW(), NOW()
         ) ON CONFLICT (id) DO NOTHING`,
        [firmId, name, location, website, JSON.stringify(sectors), description, founded, SOURCE],
      )
      firmsInserted++
    } else {
      await client.query(
        `UPDATE investment_firms SET
            name = $2, hq_location = COALESCE($3, hq_location),
            location = COALESCE($3, location), website = COALESCE($4, website),
            sectors = $5::jsonb, description = COALESCE($6, description),
            founded_year = COALESCE($7, founded_year), updated_at = NOW()
         WHERE id = $1`,
        [firmId, name, location, website, JSON.stringify(sectors), description, founded],
      )
      firmsUpdated++
    }

    // ─── Founders → investors ──────────────────────────────────────
    const founders = csvSplit(r[idxFounders])
    for (const fullName of founders) {
      const trimmed = fullName.trim()
      if (!trimmed) continue
      const [first, last] = splitName(trimmed)
      const stableKey = `${normalize(trimmed)}@${firmId}`
      const invId = stableId("inv", stableKey)
      const invExists = await client.query("SELECT 1 FROM investors WHERE id = $1 LIMIT 1", [invId])
      if (invExists.rows.length) { investorsSkipped++; continue }

      const bioParts = []
      if (sectors.length) bioParts.push(`Sectors: ${sectors.join(", ")}`)
      if (founded) bioParts.push(`Founded: ${founded}`)
      bioParts.push(`Source: 8fundraising 2,000+ accelerators · 2026`)

      await client.query(
        `INSERT INTO investors (
           id, first_name, last_name, title,
           bio, investor_type,
           firm_id, location, status, source, is_active, created_at, updated_at
         ) VALUES (
           $1, $2, $3, 'Founder',
           $4, 'accelerator',
           $5, $6, 'identified', $7, true, NOW(), NOW()
         ) ON CONFLICT (id) DO NOTHING`,
        [invId, first, last, bioParts.join(" · "), firmId, location, SOURCE],
      )
      investorsInserted++
    }
  } catch (e) {
    errors.push({ row: i + 1, name, err: e.message })
    firmsSkipped++
    if (errors.length <= 5) console.error(`  [row ${i + 1}] ${name}: ${e.message}`)
  }
}

console.log(`\n[accelerators] FIRMS    : ${firmsInserted} new, ${firmsUpdated} updated, ${firmsSkipped} skipped (errors)`)
console.log(`[accelerators] FOUNDERS : ${investorsInserted} new, ${investorsSkipped} already-present`)
if (errors.length) console.log(`[accelerators] errors  : ${errors.length} (first 5 logged above)`)

const totals = await client.query(`
  SELECT
    (SELECT COUNT(*) FROM investment_firms WHERE source = $1) AS firms_csv,
    (SELECT COUNT(*) FROM investors        WHERE source = $1) AS inv_csv,
    (SELECT COUNT(*) FROM investment_firms) AS firms_total,
    (SELECT COUNT(*) FROM investors)        AS inv_total
`, [SOURCE])
const t = totals.rows[0]
console.log(`\n[accelerators] DONE`)
console.log(`  firms in this batch     : ${t.firms_csv}`)
console.log(`  founders in this batch  : ${t.inv_csv}`)
console.log(`  firms total in DB       : ${t.firms_total}`)
console.log(`  contacts total in DB    : ${t.inv_total}`)

await client.end()

// ─── helpers ──────────────────────────────────────────────────────────────
function stableId(prefix, key) {
  const h = crypto.createHash("sha1").update(key).digest("hex").slice(0, 12)
  return `${prefix}_${h}`
}
function normalize(s) {
  return String(s || "").toLowerCase().trim().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "")
}
function csvSplit(s) {
  if (!s) return []
  return String(s).split(/[,;]/).map((x) => x.trim()).filter(Boolean)
}
function cleanWeb(s) {
  if (!s) return null
  s = String(s).trim()
  if (!s || s.toLowerCase() === "n/a") return null
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith("www.")) return "https://" + s
  return "https://" + s.replace(/^\/+/, "")
}
function parseIntOrNull(v) {
  if (v == null || v === "") return null
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10)
  return Number.isFinite(n) ? n : null
}
function splitName(name) {
  const parts = name.split(/\s+/)
  if (parts.length === 1) return [parts[0], ""]
  return [parts[0], parts.slice(1).join(" ")]
}
function redact(u) {
  return u.replace(/:\/\/[^@]+@/, "://***@")
}
