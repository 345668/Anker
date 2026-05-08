#!/usr/bin/env node
/**
 * Import the "1,000 Venture Capital Firms" CSV into investment_firms +
 * investors.  Source: 8fundraising playbook bundle.
 *
 * Header row (row 3 of the file — first 2 are title rows):
 *   ,VC Firm,Website,Countries,Cities,Industries,Stages,Founded Year,
 *   Name of Founders,# of Investments,# of Exits,Min Check Size,
 *   Max Check Size,Funds Raised,Contact Information
 *
 * Per row:
 *   - upsert investment_firms (type='venture capital')
 *   - parse "Name of Founders" → comma-split → upsert one investor per
 *     name with title "Founder", linked via firm_id
 *   - tag both with source='csv:vcs-2026' so we can re-query / undo
 *
 * Idempotent.  Re-running is safe — stable IDs derived from
 * sha1(normalize(firm name)) and sha1(normalize(person name)|firmId).
 *
 * Usage:
 *   pnpm tsx scripts/import-vcs-1000.mjs            # uses env DATABASE_URL
 *   node scripts/import-vcs-1000.mjs <csv-path>     # custom path
 *
 * Default path: data/csv/vcs-1000.csv
 */
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
const require = createRequire(import.meta.url)
const { Client } = require("pg")
// SheetJS handles CSV parsing too — uses the same `xlsx` already in deps
const XLSX = require("xlsx")

const csvPath = process.argv[2] || path.resolve("data/csv/vcs-1000.csv")
const url = process.env.DATABASE_URL || "postgresql://anker:anker@localhost:5432/anker"

const SOURCE = "csv:vcs-2026"

const client = new Client({ connectionString: url })
await client.connect()
console.log(`[vcs-1000] connected to ${redact(url)}`)

const wb = XLSX.read(readFileSync(csvPath), { type: "buffer", cellDates: false, raw: false })
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false })
console.log(`[vcs-1000] ${rows.length} raw rows`)

// Find header row — the row whose 2nd cell equals "VC Firm"
let headerRow = -1
for (let i = 0; i < Math.min(10, rows.length); i++) {
  if (String(rows[i]?.[1] ?? "").trim().toLowerCase() === "vc firm") {
    headerRow = i
    break
  }
}
if (headerRow < 0) throw new Error("Could not find header row")
const header = rows[headerRow].map((h) => String(h).trim())
console.log(`[vcs-1000] header at row ${headerRow}, cols: ${header.length}`)
const COL = (name) => header.indexOf(name)

const idxName = COL("VC Firm")
const idxWeb = COL("Website")
const idxCountries = COL("Countries")
const idxCities = COL("Cities")
const idxIndustries = COL("Industries")
const idxStages = COL("Stages")
const idxFounded = COL("Founded Year")
const idxFounders = COL("Name of Founders")
const idxNumInv = COL("# of Investments")
const idxNumExit = COL("# of Exits")
const idxMinCheck = COL("Min Check Size")
const idxMaxCheck = COL("Max Check Size")
const idxFundsRaised = COL("Funds Raised")
const idxContact = COL("Contact Information")

let firmsInserted = 0
let firmsSkipped = 0
let firmsUpdated = 0
let investorsInserted = 0
let investorsSkipped = 0
const errors = []

for (let i = headerRow + 1; i < rows.length; i++) {
  const r = rows[i]
  const name = String(r?.[idxName] ?? "").trim()
  if (!name || name.toLowerCase() === "vc firm") continue
  try {
    // ─── Firm ───────────────────────────────────────────────────────
    const country = pickFirst(r[idxCountries])
    const city = pickFirst(r[idxCities])
    const location = [city, country].filter(Boolean).join(", ") || null
    const sectors = csvSplit(r[idxIndustries])
    const stages = csvSplit(r[idxStages])
    const website = cleanWeb(r[idxWeb])
    const founded = parseIntOrNull(r[idxFounded])
    const minCheck = parseMoneyUsd(r[idxMinCheck])
    const maxCheck = parseMoneyUsd(r[idxMaxCheck])
    const aumRaw = String(r[idxFundsRaised] ?? "").trim() || null
    const aumUsd = parseMoneyUsd(aumRaw)
    const contactInfo = String(r[idxContact] ?? "").trim() || null
    const contactEmail = extractEmail(contactInfo)

    const firmId = stableId("ifm", "vc::" + normalize(name))
    const checkSizeRange = formatRange(minCheck, maxCheck)
    const description = [
      stages.length ? `Stages: ${stages.join(", ")}` : "",
      `Investments: ${parseIntOrNull(r[idxNumInv]) ?? "?"}`,
      `Exits: ${parseIntOrNull(r[idxNumExit]) ?? "?"}`,
      contactInfo ? `Contact: ${contactInfo}` : "",
    ].filter(Boolean).join(" · ")

    const existing = await client.query("SELECT id, source FROM investment_firms WHERE id = $1 LIMIT 1", [firmId])
    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO investment_firms (
           id, name, type, firm_classification, hq_location, location,
           website, sectors, description, typical_check_size, founded_year,
           source, created_at, updated_at
         ) VALUES (
           $1, $2, 'venture capital', 'venture capital', $3, $3,
           $4, $5::jsonb, $6, $7, $8,
           $9, NOW(), NOW()
         ) ON CONFLICT (id) DO NOTHING`,
        [firmId, name, location, website, JSON.stringify(sectors), description, checkSizeRange, founded, SOURCE],
      )
      firmsInserted++
    } else {
      // Refresh enrichment fields but preserve source / id
      await client.query(
        `UPDATE investment_firms SET
            name = $2, hq_location = COALESCE($3, hq_location),
            location = COALESCE($3, location), website = COALESCE($4, website),
            sectors = $5::jsonb, description = COALESCE($6, description),
            typical_check_size = COALESCE($7, typical_check_size),
            founded_year = COALESCE($8, founded_year),
            updated_at = NOW()
         WHERE id = $1`,
        [firmId, name, location, website, JSON.stringify(sectors), description, checkSizeRange, founded],
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
      if (stages.length) bioParts.push(`Stages: ${stages.join(", ")}`)
      if (checkSizeRange) bioParts.push(`Check: ${checkSizeRange}`)
      if (aumRaw) bioParts.push(`Firm AUM: ${aumRaw}`)
      bioParts.push(`Source: 8fundraising 1,000 VCs · 2026`)

      await client.query(
        `INSERT INTO investors (
           id, first_name, last_name, title, email, linkedin_url, person_linkedin_url,
           bio, investor_type, typical_check_size, typical_investment,
           firm_id, location, status, source, is_active, created_at, updated_at
         ) VALUES (
           $1, $2, $3, 'Founder', $4, NULL, NULL,
           $5, 'venture capital', $6, $6,
           $7, $8, 'identified', $9, true, NOW(), NOW()
         ) ON CONFLICT (id) DO NOTHING`,
        [
          invId, first, last, contactEmail,
          bioParts.join(" · "), checkSizeRange,
          firmId, location, SOURCE,
        ],
      )
      investorsInserted++
    }
  } catch (e) {
    errors.push({ row: i + 1, name, err: e.message })
    firmsSkipped++
    if (errors.length <= 5) console.error(`  [row ${i + 1}] ${name}: ${e.message}`)
  }
}

console.log(`\n[vcs-1000] FIRMS    : ${firmsInserted} new, ${firmsUpdated} updated, ${firmsSkipped} skipped (errors)`)
console.log(`[vcs-1000] FOUNDERS : ${investorsInserted} new, ${investorsSkipped} already-present`)
if (errors.length) console.log(`[vcs-1000] errors   : ${errors.length} (first 5 logged above)`)

const totals = await client.query(`
  SELECT
    (SELECT COUNT(*) FROM investment_firms WHERE source = $1) AS firms_csv,
    (SELECT COUNT(*) FROM investors        WHERE source = $1) AS inv_csv,
    (SELECT COUNT(*) FROM investment_firms) AS firms_total,
    (SELECT COUNT(*) FROM investors)        AS inv_total
`, [SOURCE])
const t = totals.rows[0]
console.log(`\n[vcs-1000] DONE`)
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
function pickFirst(s) {
  if (!s) return null
  return String(s).split(/[,;]/)[0].trim() || null
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
function parseMoneyUsd(v) {
  if (!v) return null
  const s = String(v).trim()
  if (!s || s.toLowerCase() === "n/a") return null
  // Examples: "$2,000,000", "€500,000", "$1.34B", "300K"
  const m = s.match(/([\d.,]+)\s*([kmbKMB])?/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ""))
  if (!Number.isFinite(n)) return null
  const unit = (m[2] || "").toLowerCase()
  if (unit === "k") return Math.round(n * 1_000)
  if (unit === "m") return Math.round(n * 1_000_000)
  if (unit === "b") return Math.round(n * 1_000_000_000)
  return Math.round(n)
}
function formatRange(min, max) {
  if (!min && !max) return null
  const fmt = (n) => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B`
                  : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
                  : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K`
                             : `$${n}`
  if (min && max && min !== max) return `${fmt(min)}–${fmt(max)}`
  return fmt(max ?? min)
}
function extractEmail(s) {
  if (!s) return null
  const m = String(s).match(/[\w.-]+@[\w.-]+\.[\w]+/)
  return m ? m[0].toLowerCase() : null
}
function splitName(name) {
  const parts = name.split(/\s+/)
  if (parts.length === 1) return [parts[0], ""]
  return [parts[0], parts.slice(1).join(" ")]
}
function redact(u) {
  return u.replace(/:\/\/[^@]+@/, "://***@")
}
