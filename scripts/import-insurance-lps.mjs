/**
 * Import the LPconf "Private Markets LP Database – 100 Insurance Companies"
 * spreadsheet into investment_firms + investors.
 *
 *   row 0  : title
 *   row 1  : subtitle
 *   row 2  : column headers
 *   row 3+ : either a region divider ("UNITED STATES (35 LPs)") OR an LP row
 *
 * Per LP row:
 *   - upsert into investment_firms (type='insurance company')
 *   - parse "Contact (Name / Role)" → first/last name + title
 *   - upsert into investors with the contact info, linked via firm_id
 *   - tag both with source='csv:lp-insurance-2026' for re-querying
 *
 * Idempotent via stable IDs derived from sha1(firm name) / sha1(linkedin|email|name).
 */
import { createRequire } from "node:module"
import path from "node:path"
const require = createRequire(import.meta.url)
const XLSX = require("xlsx")
const { Client } = require("pg")
const crypto = require("node:crypto")

const xlsxPath = process.argv[2]
if (!xlsxPath) { console.error("usage: node import-insurance-lps.mjs <xlsx>"); process.exit(1) }

const url = process.env.DATABASE_URL || "postgresql://anker:anker@localhost:5432/anker"
const client = new Client({ connectionString: url })
await client.connect()
console.log("[import] connected")

const wb = XLSX.readFile(xlsxPath)
const arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false })
console.log(`[import] ${arr.length} raw rows`)

// Header row is row 2 in this sheet
const headerRow = arr[2].map((h) => String(h).trim())
const COL = (name) => headerRow.indexOf(name)
const idxName = COL("LP Name")
const idxType = COL("Type")
const idxLoc = COL("State / Country")
const idxCheck = COL("Check Size ($M)")
const idxFocus = COL("Investment Focus")
const idxContact = COL("Contact (Name / Role)")
const idxLi = COL("LinkedIn")
const idxWeb = COL("Website")
const idxEmail = COL("Email")
const idxNotes = COL("Notes")
console.log(`[import] headers found at indices: name=${idxName} type=${idxType} loc=${idxLoc}`)

function stableId(prefix, key) {
  const h = crypto.createHash("sha1").update(key).digest("hex").slice(0, 12)
  return `${prefix}_${h}`
}

function cleanLi(s) {
  if (!s) return null
  s = String(s).trim()
  if (!s || s.toLowerCase() === "n/a") return null
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith("www.")) return "https://" + s
  return "https://www.linkedin.com/in/" + s.replace(/^\/+/, "").replace(/^in\//, "")
}

function cleanWeb(s) {
  if (!s) return null
  s = String(s).trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  return "https://" + s
}

function cleanEmail(s) {
  if (!s) return null
  s = String(s).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null
}

/**
 * Split "Brian Funk / President, MetLife Investment Management" into:
 *   { name: "Brian Funk", title: "President, MetLife Investment Management" }
 * Some cells are just a name with no slash; some are blank.
 */
function parseContact(raw) {
  if (!raw) return { name: null, title: null }
  const s = String(raw).trim()
  if (!s) return { name: null, title: null }
  const slash = s.indexOf("/")
  if (slash > 0) {
    return { name: s.slice(0, slash).trim(), title: s.slice(slash + 1).trim() }
  }
  return { name: s, title: null }
}

function splitName(name) {
  if (!name) return [null, null]
  const parts = name.split(/\s+/)
  if (parts.length === 1) return [parts[0], ""]
  return [parts[0], parts.slice(1).join(" ")]
}

/** Skip the title rows + region dividers (those rows have empty type/email cells). */
function isLpRow(row) {
  const lpName = String(row[idxName] ?? "").trim()
  const type = String(row[idxType] ?? "").trim()
  if (!lpName) return false
  // Section headers like "UNITED STATES (35 LPs)" have no type cell
  if (!type) return false
  // Header row repetition guard
  if (lpName === "LP Name") return false
  return true
}

let firmsInserted = 0
let firmsSkipped = 0
let contactsInserted = 0
let contactsSkipped = 0
let regionTracker = null

for (let i = 3; i < arr.length; i++) {
  const row = arr[i]
  // Track region from divider rows (e.g. "UNITED STATES (35 LPs)")
  const lpName = String(row[idxName] ?? "").trim()
  const isDivider = lpName && !row[idxType]
  if (isDivider && /\(\d+\s*LPs?\)/i.test(lpName)) {
    regionTracker = lpName.replace(/\s*\(\d+\s*LPs?\)\s*$/i, "").trim()
    continue
  }
  if (!isLpRow(row)) continue

  const firmName = lpName
  const location = String(row[idxLoc] ?? "").trim() || regionTracker || null
  const checkSize = String(row[idxCheck] ?? "").trim() || null
  const focus = String(row[idxFocus] ?? "").trim() || null
  const website = cleanWeb(row[idxWeb])
  const notes = String(row[idxNotes] ?? "").trim() || null

  const sectorsArr = focus
    ? focus.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    : []

  // ─── Upsert firm ───────────────────────────────────────────────────────
  const firmId = stableId("ifm", "insurance::" + firmName.toLowerCase())
  const firmExists = await client.query("SELECT 1 FROM investment_firms WHERE id = $1 LIMIT 1", [firmId])
  if (firmExists.rows.length) {
    firmsSkipped++
  } else {
    await client.query(
      `INSERT INTO investment_firms (
         id, name, type, firm_classification, hq_location, location,
         website, sectors, description, typical_check_size,
         source, created_at, updated_at
       ) VALUES (
         $1, $2, 'insurance company', 'insurance company', $3, $3,
         $4, $5::jsonb, $6, $7,
         'csv:lp-insurance-2026', NOW(), NOW()
       ) ON CONFLICT (id) DO NOTHING`,
      [firmId, firmName, location, website, JSON.stringify(sectorsArr), notes, checkSize],
    )
    firmsInserted++
  }

  // ─── Optional contact (person) ─────────────────────────────────────────
  const { name: contactName, title } = parseContact(row[idxContact])
  const linkedin = cleanLi(row[idxLi])
  const email = cleanEmail(row[idxEmail])
  if (!contactName) continue

  const [first, last] = splitName(contactName)
  const stableKey = (linkedin || email || `${contactName}@${firmName}`).toLowerCase()
  const invId = stableId("inv", stableKey)
  const invExists = await client.query("SELECT 1 FROM investors WHERE id = $1 LIMIT 1", [invId])
  if (invExists.rows.length) {
    contactsSkipped++
    continue
  }

  const bioParts = []
  if (checkSize) bioParts.push(`Typical check: ${checkSize}`)
  if (focus) bioParts.push(`Focus: ${focus}`)
  if (notes) bioParts.push(notes)
  bioParts.push("Source: LPconf 100 Insurance Companies · 2026")
  const bio = bioParts.join(" · ")

  await client.query(
    `INSERT INTO investors (
        id, first_name, last_name, title, email, linkedin_url, person_linkedin_url,
        bio, investor_type, typical_check_size, typical_investment,
        firm_id, location, status, source, is_active, created_at, updated_at
     ) VALUES (
        $1, $2, $3, $4, $5, $6, $6,
        $7, 'insurance company', $8, $8,
        $9, $10, 'identified', 'csv:lp-insurance-2026', true, NOW(), NOW()
     ) ON CONFLICT (id) DO NOTHING`,
    [invId, first, last, title, email, linkedin, bio, checkSize, firmId, location],
  )
  contactsInserted++
}

console.log(`\n[import] firms     : ${firmsInserted} inserted · ${firmsSkipped} already present`)
console.log(`[import] contacts  : ${contactsInserted} inserted · ${contactsSkipped} already present`)

const totals = await client.query(`
  SELECT
    (SELECT COUNT(*) FROM investment_firms WHERE source = 'csv:lp-insurance-2026') AS firms_csv,
    (SELECT COUNT(*) FROM investors        WHERE source = 'csv:lp-insurance-2026') AS inv_csv,
    (SELECT COUNT(*) FROM investment_firms) AS firms_total,
    (SELECT COUNT(*) FROM investors)        AS inv_total
`)
console.log("\n[import] DONE")
console.log("  firms in this batch     :", totals.rows[0].firms_csv)
console.log("  contacts in this batch  :", totals.rows[0].inv_csv)
console.log("  firms total in DB       :", totals.rows[0].firms_total)
console.log("  contacts total in DB    :", totals.rows[0].inv_total)

await client.end()
