/**
 * Import a flat CSV of investor contacts into investors + investment_firms.
 *
 * Usage:
 *   DATABASE_URL=postgresql://… node scripts/import-investors-csv.mjs <csv>
 *
 * Schema expected:
 *   Name, Entity Type, Role/Authority, Managed AUM, Check Min (USD),
 *   Check Max (USD), Check Size, LinkedIn
 *
 * What it does, per row:
 *   1. Splits Name into first/last.
 *   2. Maps Entity Type → investor_type (canonical).
 *   3. Decides if Entity Type is a *named firm* (not a generic bucket) and,
 *      if so, upserts a row in investment_firms and links the investor
 *      via firm_id.
 *   4. Inserts (or skips on duplicate) into investors with:
 *        - title           = Role/Authority
 *        - linkedin_url    = LinkedIn (cleaned)
 *        - typical_check_size = "Check Size" string from the row
 *        - bio             = "AUM: …  ·  Source: VC-Focused Family Offices CSV"
 *   5. Reports counts.
 *
 * Idempotent on `linkedin_url` + `name` — safe to re-run.
 */
import { createRequire } from "node:module"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { Client } = require("pg")
const crypto = require("node:crypto")

const csvPath = process.argv[2]
if (!csvPath) { console.error("usage: node import-investors-csv.mjs <csv>"); process.exit(1) }

const url = process.env.DATABASE_URL || "postgresql://anker:anker@localhost:5432/anker"
const client = new Client({ connectionString: url })
await client.connect()
console.log("[import] connected")

// ─── parse CSV (handles quoted fields with commas) ─────────────────────────
function parseCsv(raw) {
  const rows = []
  let row = []
  let cell = ""
  let inQ = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (inQ) {
      if (c === '"' && raw[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') inQ = false
      else cell += c
    } else {
      if (c === '"') inQ = true
      else if (c === ",") { row.push(cell); cell = "" }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = "" }
      else if (c === "\r") { /* skip */ }
      else cell += c
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((v) => v && v.trim()))
}

const raw = fs.readFileSync(csvPath, "utf8")
const rows = parseCsv(raw)
const header = rows[0].map((h) => h.trim())
const COL = (name) => header.indexOf(name)
const idxName = COL("Name")
const idxEntity = COL("Entity Type")
const idxRole = COL("Role/Authority")
const idxAum = COL("Managed AUM")
const idxMin = COL("Check Min (USD)")
const idxMax = COL("Check Max (USD)")
const idxSize = COL("Check Size")
const idxLi = COL("LinkedIn")
if (idxName < 0) { console.error("Missing 'Name' column"); process.exit(1) }
console.log(`[import] ${rows.length - 1} rows to process`)

// ─── classify Entity Type → (investor_type, isNamedFirm) ───────────────────
const GENERIC_BUCKETS = new Set([
  "Private Capital",
  "Single Family Office",
  "Private Family Office",
  "Multi-Family Office",
  "Private Fund of Funds",
  "Institutional Investor",
  "Corporate Venture/Treasury",
])

function classify(entity) {
  const t = (entity ?? "").trim()
  // Map to the canonical `investor_type` taxonomy used by matching v2
  const lower = t.toLowerCase()
  let canonical = "other"
  if (lower.includes("family office")) canonical = "family office"
  else if (lower.includes("fund of funds")) canonical = "fund of funds"
  else if (lower.includes("corporate venture") || lower.includes("treasury")) canonical = "corporate venture"
  else if (lower.includes("institutional")) canonical = "institutional investor"
  else if (lower.includes("private capital")) canonical = "private capital"
  else canonical = "family office" // most named firms in this CSV ARE family offices
  const isNamedFirm = !GENERIC_BUCKETS.has(t) && t.length > 0 && t !== "Undisclosed"
  return { investorType: canonical, isNamedFirm, displayEntity: t }
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`
}

function cleanLi(li) {
  if (!li) return null
  const s = li.trim()
  if (!s || s.toLowerCase() === "n/a") return null
  // Convert bare handles ("karsten.obert") to a LinkedIn URL when possible
  if (/^https?:\/\//i.test(s)) return s
  if (s.toLowerCase().startsWith("linkedin.com/")) return "https://www." + s
  if (s.toLowerCase().startsWith("www.")) return "https://" + s
  // bare handle → assume /in/<handle>
  if (/^[a-z0-9._-]+$/i.test(s)) return `https://www.linkedin.com/in/${s}`
  return s
}

function splitName(name) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return [parts[0], ""]
  return [parts[0], parts.slice(1).join(" ")]
}

function parseInt0(v) {
  const n = Number((v ?? "").toString().replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

// ─── ensure idempotency: investors get a stable id from (linkedin || name) ──
function stableId(prefix, key) {
  const h = crypto.createHash("sha1").update(key).digest("hex").slice(0, 12)
  return `${prefix}_${h}`
}

let firmsInserted = 0
let firmsSkipped = 0
let investorsInserted = 0
let investorsSkipped = 0
const firmIds = new Map() // firm name → id

// Pre-create or look up firms
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  const c = classify(r[idxEntity])
  if (!c.isNamedFirm) continue
  const firmName = r[idxEntity].trim()
  if (firmIds.has(firmName)) continue
  const exist = await client.query("SELECT id FROM investment_firms WHERE LOWER(name) = LOWER($1) LIMIT 1", [firmName])
  if (exist.rows.length) {
    firmIds.set(firmName, exist.rows[0].id)
    firmsSkipped++
  } else {
    const id = stableId("ifm", firmName.toLowerCase())
    await client.query(
      `INSERT INTO investment_firms (id, name, type, firm_classification, source, created_at)
       VALUES ($1, $2, $3, $4, 'csv:vc-fo-2026', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, firmName, c.investorType, c.investorType],
    )
    firmIds.set(firmName, id)
    firmsInserted++
  }
}
console.log(`[import] firms: ${firmsInserted} inserted · ${firmsSkipped} already present`)

// Insert investors
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  const fullName = (r[idxName] ?? "").trim()
  if (!fullName) continue
  const c = classify(r[idxEntity])
  const li = cleanLi(r[idxLi])
  const [first, last] = splitName(fullName)
  const role = (r[idxRole] ?? "").trim() || null
  const aum = (r[idxAum] ?? "").trim() || null
  const checkMin = parseInt0(r[idxMin])
  const checkMax = parseInt0(r[idxMax])
  const checkSize = (r[idxSize] ?? "").trim() || null

  const stableKey = (li || fullName).toLowerCase()
  const id = stableId("inv", stableKey)
  const firmId = c.isNamedFirm ? firmIds.get(r[idxEntity].trim()) : null

  // Skip if already present (idempotent)
  const exists = await client.query("SELECT 1 FROM investors WHERE id = $1 LIMIT 1", [id])
  if (exists.rows.length) { investorsSkipped++; continue }

  const bioParts = []
  if (aum) bioParts.push(`AUM: ${aum}`)
  if (checkSize) bioParts.push(`Typical check: ${checkSize}`)
  bioParts.push("Source: VC-Focused Family Offices · 2026")
  const bio = bioParts.join(" · ")

  await client.query(
    `INSERT INTO investors (
        id, first_name, last_name, title, linkedin_url, person_linkedin_url,
        bio, investor_type, typical_check_size, typical_investment,
        firm_id, status, source, is_active, created_at, updated_at
     ) VALUES (
        $1, $2, $3, $4, $5, $5,
        $6, $7, $8, $8,
        $9, 'identified', 'csv:vc-fo-2026', true, NOW(), NOW()
     ) ON CONFLICT (id) DO NOTHING`,
    [id, first, last, role, li, bio, c.investorType, checkSize, firmId],
  )
  investorsInserted++
}
console.log(`[import] investors: ${investorsInserted} inserted · ${investorsSkipped} already present`)

// Final tallies
const totals = await client.query(
  `SELECT
     (SELECT COUNT(*) FROM investors) AS investors,
     (SELECT COUNT(*) FROM investors WHERE source = 'csv:vc-fo-2026') AS investors_from_csv,
     (SELECT COUNT(*) FROM investment_firms) AS firms,
     (SELECT COUNT(*) FROM investment_firms WHERE source = 'csv:vc-fo-2026') AS firms_from_csv`
)
console.log("\n[import] DONE")
console.log("  investors total            :", totals.rows[0].investors)
console.log("  investors from this CSV    :", totals.rows[0].investors_from_csv)
console.log("  firms total                :", totals.rows[0].firms)
console.log("  firms from this CSV        :", totals.rows[0].firms_from_csv)

await client.end()
