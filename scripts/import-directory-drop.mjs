#!/usr/bin/env node
/**
 * Merge an investor-data drop into the directory (docs/architecture/24).
 *
 *   node scripts/import-directory-drop.mjs <files…>           # dry run
 *   node scripts/import-directory-drop.mjs --apply <files…>   # writes
 *
 * The rule the whole thing is built on:
 *
 *   Fill what is empty. Never overwrite what is there. Delete nothing.
 *
 * A drop of unknown provenance is evidence, not truth. These records are
 * already in CRM pipelines and saved match runs, so a value that conflicts
 * with an existing one is reported for a human to settle, not applied.
 */
import { createRequire } from "node:module"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const require = createRequire(import.meta.url)
const XLSX = require("xlsx")
const { neon } = require("@neondatabase/serverless")

import { pathToFileURL } from "node:url"

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const FILES = args.filter((a) => !a.startsWith("--"))
const BATCH = `drop:${new Date().toISOString().slice(0, 10)}`

// Connecting is deferred: the pure helpers above are imported by tests, and a
// module that exits on load cannot be tested at all.
let sql = null
const q = (text, values = []) => {
  if (!sql) {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
    if (!DB) throw new Error("set NEON_DATABASE_URL")
    sql = neon(DB)
  }
  return sql.query(text, values)
}

// ─── Normalisation — the same notion of "same" the scorer uses ──────────────

const normPhrase = (s) => String(s ?? "").toLowerCase().normalize("NFKD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()

/** Legal suffixes and articles that do not distinguish one firm from another. */
const FIRM_NOISE = /\b(the|a|an|ltd|limited|llc|l l c|inc|incorporated|corp|corporation|plc|gmbh|ag|sa|sas|bv|nv|ab|oy|as|aps|spa|srl|lp|llp|partners|partner|ventures|venture|capital|management|advisors|advisers|group|holdings|fund|funds|investments|investment|family office|office)\b/g
const normFirm = (s) => normPhrase(s).replace(FIRM_NOISE, " ").replace(/\s+/g, " ").trim()

/** The last word of a location, with the common aliases folded together. */
export function countryTail(value) {
  const v = normPhrase(value)
  if (!v) return null
  if (/\b(usa|us|united states|u s a)\b/.test(v)) return "us"
  if (/\b(uk|united kingdom|great britain|gb)\b/.test(v)) return "uk"
  if (/\b(uae|united arab emirates)\b/.test(v)) return "uae"
  return v.split(" ").slice(-1)[0] || null
}

const normEmail = (s) => {
  const v = String(s ?? "").trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null
}

/** `https://www.acme.vc/about` → `acme.vc` */
export function hostOf(url) {
  const raw = String(url ?? "").trim()
  if (!raw) return null
  try {
    // Case-insensitively: a sheet that writes "HTTPS://ACME.VC" was being
    // prefixed again and read as the host "https", so the firm never matched.
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null
  } catch { return null }
}

/** `https://linkedin.com/in/Jane-Doe/` → `jane-doe` */
export function linkedinSlug(url) {
  const raw = String(url ?? "").trim()
  if (!raw) return null
  const m = raw.toLowerCase().match(/linkedin\.com\/(?:in|pub)\/([^/?#\s]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

const clean = (v) => {
  const s = String(v ?? "").trim()
  return s && !/^(n\/?a|none|unknown|-|—)$/i.test(s) ? s : null
}
const isEmpty = (v) => v === null || v === undefined || String(v).trim() === ""

/**
 * A firm name as a firm would write it.
 *
 * A "FIRM / KNOWN FOR" column describes a person — "Box (CEO)", "Clearco
 * (co-founder), angel" — and that is an employer and a role, not a company's
 * name. Take the company, drop the rest.
 */
export function cleanFirmName(value) {
  let v = String(value ?? "").trim()
  if (!v) return v
  v = v.split(/[,;]/)[0]                       // "Teachable (founder), Vibe Capital"
  v = v.replace(/\s*\([^)]*\)\s*$/g, "")       // "Box (CEO)"
  v = v.replace(/\s*[-–—]\s*(ceo|founder|co-?founder|partner|angel|investor)\b.*$/i, "")
  return v.trim()
}

/** A person's role, mistaken for a firm's classification. */
export const PERSON_ROLE = /^(vc |gp |lp )?(partner|angel|investor|founder|co-?founder|ceo|cto|principal|associate|director|manager|limited partner|general partner|advisor)s?$/i

// ─── Reading the sheets ─────────────────────────────────────────────────────

const HEADERISH = /(name|firm|company|email|website|url|linkedin|location|country|sector|stage|type|cheque|check|aum|title|role|institution|office)/i

/** Most files carry a banner above the real header, on rows 1–4. Find it. */
export function findHeaderRow(aoa) {
  for (let i = 0; i < Math.min(10, aoa.length); i++) {
    const cells = (aoa[i] ?? []).map((c) => String(c ?? "").trim()).filter(Boolean)
    if (cells.length >= 3 && cells.filter((c) => HEADERISH.test(c)).length >= 2) return i
  }
  return -1
}

/** Column aliases, so twelve spellings of "firm" read as one field. */
const FIELD = {
  fullName: [/^full ?name$/i, /^name$/i, /^contact$/i],
  firstName: [/^first ?_?name$/i],
  lastName: [/^last ?_?name$/i],
  title: [/^title$/i, /^role$/i, /^position$/i],
  firm: [/^firm$/i, /^company$/i, /^family office$/i, /^institution$/i, /^fund of funds$/i,
         /^corporate vc arm$/i, /^firm ?\/ ?known for$/i, /^organisation$/i, /^organization$/i],
  email: [/^e-?mail$/i],
  linkedin: [/^linked ?in$/i, /^linkedin_?url$/i],
  location: [/^location$/i, /^hq ?\/? ?city$/i, /^city$/i, /^hq$/i],
  country: [/^country$/i],
  type: [/^type$/i, /^investor ?type$/i, /^lp ?type$/i, /^firm ?type$/i],
  website: [/^website$/i, /^url$/i, /^site$/i],
  aum: [/^aum/i, /^assets/i],
  sectors: [/^sectors?$/i, /^industry$/i, /^primary sector$/i, /^investment focus$/i],
  stages: [/^stages?$/i],
  checkSize: [/^che(que|ck) ?size$/i, /^typical (che(que|ck)|investment)$/i],
  region: [/^region$/i],
  notes: [/^notes?$/i, /^why they'?re on the list$/i, /^focus & 2026 activity$/i],
}

function mapColumns(headers) {
  const out = {}
  headers.forEach((h, i) => {
    const name = String(h ?? "").trim()
    if (!name) return
    for (const [field, patterns] of Object.entries(FIELD)) {
      if (out[field] === undefined && patterns.some((p) => p.test(name))) { out[field] = i; return }
    }
  })
  return out
}

/**
 * Is this sheet a list of people or of firms?
 *
 * Decided per sheet, because per row it cannot be decided at all: "01
 * Ventures" and "Aaron Levie" are both two words. A sheet that names a
 * person's employer, title or email is a contact list; a sheet with only an
 * entity name and its attributes is a firm list.
 */
export function classifySheet(cols) {
  const namesAPerson = cols.firstName !== undefined
    || cols.title !== undefined || cols.email !== undefined || cols.firm !== undefined
  return namesAPerson && cols.fullName !== undefined ? "people"
    : cols.firstName !== undefined || cols.email !== undefined ? "people"
    : "firms"
}

/** Every data row of a file, as { …fields, _file, _sheet }. */
export function readRows(file) {
  const wb = XLSX.readFile(file)
  const rows = []
  for (const sheet of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, defval: "" })
    const hi = findHeaderRow(aoa)
    if (hi < 0) continue
    const cols = mapColumns(aoa[hi])
    if (cols.fullName === undefined && cols.firstName === undefined && cols.firm === undefined) continue
    const kind = classifySheet(cols)
    for (const raw of aoa.slice(hi + 1)) {
      const get = (f) => (cols[f] === undefined ? null : clean(raw[cols[f]]))
      const name = get("fullName") || [get("firstName"), get("lastName")].filter(Boolean).join(" ") || null
      const row = {
        name, title: get("title"), firm: get("firm"), email: normEmail(get("email")),
        linkedin: get("linkedin"), location: get("location") || get("country"),
        country: get("country"), type: get("type"), website: get("website"),
        aum: get("aum"), sectors: get("sectors"), stages: get("stages"),
        checkSize: get("checkSize"), notes: get("notes"),
        _file: path.basename(file), _sheet: sheet, _kind: kind,
      }
      // On a firm sheet the name column IS the firm.
      if (kind === "firms") { row.firm = row.firm || row.name; row.name = null }
      // A row is a person if it names one; otherwise it may still be a firm.
      if (!row.name && !row.firm) continue
      // "#" columns and totals rows leave a bare number as the name.
      if (row.name && /^\d+$/.test(row.name)) row.name = null
      if (!row.name && !row.firm) continue
      rows.push(row)
    }
  }
  return rows
}

/** Settled by the sheet the row came from (doc 24 §1). */
const isPerson = (r) => r._kind === "people" && !!r.name

// ─── The directory, indexed for matching ────────────────────────────────────

async function loadDirectory() {
  console.log("reading the directory…")
  const people = await q(`SELECT id, first_name, last_name, email, linkedin_url, person_linkedin_url,
                                 title, location, investor_type, firm_id, website, sectors, source
                            FROM investors`)
  const firms = await q(`SELECT id, name, website, hq_location, location, type, firm_classification,
                                aum, linkedin_url, sectors, source
                           FROM investment_firms`)

  const byEmail = new Map(), bySlug = new Map(), byNameFirm = new Map()
  for (const p of people) {
    const email = normEmail(p.email)
    if (email && !byEmail.has(email)) byEmail.set(email, p)
    const slug = linkedinSlug(p.linkedin_url) || linkedinSlug(p.person_linkedin_url)
    if (slug && !bySlug.has(slug)) bySlug.set(slug, p)
    const full = normPhrase(`${p.first_name ?? ""} ${p.last_name ?? ""}`)
    if (full) {
      const key = `${full}|${p.firm_id ?? ""}`
      if (!byNameFirm.has(key)) byNameFirm.set(key, p)
    }
  }

  const firmByHost = new Map(), firmByName = new Map(), firmByLoose = new Map()
  for (const f of firms) {
    const host = hostOf(f.website)
    if (host && !firmByHost.has(host)) firmByHost.set(host, f)
    const exact = normPhrase(f.name)
    if (exact && !firmByName.has(exact)) firmByName.set(exact, f)
    const loose = normFirm(f.name)
    const country = countryTail(f.hq_location || f.location)
    if (loose && country) {
      const key = `${loose}|${country}`
      if (!firmByLoose.has(key)) firmByLoose.set(key, f)
    }
  }
  console.log(`  ${people.length} people, ${firms.length} firms indexed`)
  return { people, firms, byEmail, bySlug, byNameFirm, firmByHost, firmByName, firmByLoose }
}

// ─── Merge decisions ────────────────────────────────────────────────────────

/**
 * What this row would change on an existing record.
 * Fill-only: an occupied field is a conflict, never an overwrite.
 */
/**
 * Do two values disagree, or is one simply more specific?
 *
 * "United States" against "San Francisco, USA" is not a contradiction, and
 * reporting it as one buries the handful that are. Compatible values are
 * left alone and not reported.
 */
/** "VC" and "Venture Capital" are the same claim spelled two ways. */
const TYPE_ALIASES = [
  /\b(vc|venture capital|venture capital firm|vc firm)\b/,
  /\b(cvc|corporate vc|corporate venture|corporate venture capital)\b/,
  /\b(fo|family office|single family office|sfo|multi family office|mfo)\b/,
  /\b(pe|private equity)\b/,
  /\b(fof|fund of funds|funds of funds)\b/,
  /\b(angel|angel investor|angel network)\b/,
]
function sameType(x, y) {
  for (const alias of TYPE_ALIASES) if (alias.test(x) && alias.test(y)) return true
  return false
}

function compatible(a, b) {
  const x = normPhrase(a), y = normPhrase(b)
  if (!x || !y || x === y) return true
  if (sameType(x, y)) return true
  if (x.includes(y) || y.includes(x)) return true
  const SYNONYMS = [
    /\b(usa|us|united states|u s a)\b/, /\b(uk|united kingdom|great britain|gb)\b/,
    /\b(uae|united arab emirates)\b/, /\b(netherlands|holland)\b/,
  ]
  const countryOf = (v) => {
    for (let i = 0; i < SYNONYMS.length; i++) if (SYNONYMS[i].test(v)) return `c${i}`
    return v.split(" ").slice(-1)[0]
  }
  // A country on one side and "city, country" on the other is not a conflict.
  return countryOf(x) === countryOf(y)
}

function diff(existing, incoming) {
  const fills = {}, conflicts = []
  for (const [column, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || value === "") continue
    if (isEmpty(existing[column])) fills[column] = value
    else if (!compatible(existing[column], value)) {
      conflicts.push({ column, existing: existing[column], incoming: value })
    }
  }
  return { fills, conflicts }
}

async function main() {
  const dir = await loadDirectory()
  const seenPerson = new Map(), seenFirm = new Map()
  const stats = {
    files: 0, rows: 0, people: 0, firms: 0,
    personMatched: 0, personNew: 0, personFilled: 0, personConflicts: 0, personDupInBatch: 0,
    firmMatched: 0, firmNew: 0, firmFilled: 0, firmConflicts: 0, firmDupInBatch: 0,
  }
  const conflictLog = []
  const perFile = []

  for (const file of FILES) {
    if (!/\.xlsx?$/i.test(file)) { console.log(`skipping (not a spreadsheet): ${path.basename(file)}`); continue }
    let rows
    try { rows = readRows(file) } catch (e) { console.log(`unreadable: ${path.basename(file)} — ${e.message}`); continue }
    stats.files++
    const f = { file: path.basename(file), rows: rows.length, people: 0, firms: 0, newPeople: 0, newFirms: 0, filled: 0, dup: 0, conflicts: 0 }

    for (const row of rows) {
      stats.rows++
      const person = isPerson(row)

      // ── the firm the row names, matched or created ──
      let firmId = null
      if (row.firm || (!person && row.name)) {
        const firmName = cleanFirmName(row.firm || row.name)
        if (!firmName) { if (!person) continue }
        const host = hostOf(row.website)
        const key = host || normFirm(firmName)
        if (!key) { /* nothing to match on */ }
        else if (seenFirm.has(key)) { firmId = seenFirm.get(key); stats.firmDupInBatch++; f.dup++ }
        else {
          const country = countryTail(row.location || row.country)
          const hit = (host && dir.firmByHost.get(host))
            || dir.firmByName.get(normPhrase(firmName))
            || (country ? dir.firmByLoose.get(`${normFirm(firmName)}|${country}`) : null)
          const incoming = {
            website: row.website, hq_location: row.location,
            // Only a firm sheet states a firm's type. On a contact sheet the
            // same column holds the person's role — "VC Partner" is not what
            // kind of firm this is.
            type: person ? null : row.type,
            aum: row.aum, linkedin_url: person ? null : row.linkedin,
          }
          if (hit) {
            stats.firmMatched++
            const { fills, conflicts } = diff(hit, incoming)
            if (Object.keys(fills).length) { stats.firmFilled++; f.filled++ }
            if (conflicts.length) {
              stats.firmConflicts += conflicts.length; f.conflicts += conflicts.length
              conflictLog.push({ kind: "firm", id: hit.id, name: hit.name, file: f.file, conflicts })
            }
            if (APPLY && Object.keys(fills).length) {
              const sets = Object.keys(fills).map((c, i) => `${c} = $${i + 2}`).join(", ")
              await q(`UPDATE investment_firms SET ${sets}, updated_at = now() WHERE id = $1`,
                      [hit.id, ...Object.values(fills)])
            }
            firmId = hit.id
          } else {
            stats.firmNew++; f.newFirms++
            firmId = crypto.randomUUID()
            if (APPLY) {
              await q(`INSERT INTO investment_firms (id, name, website, hq_location, location, type, aum,
                         linkedin_url, source, created_at, updated_at, metadata)
                       VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,now(),now(),$9::jsonb)`,
                      [firmId, cleanFirmName(firmName), row.website, row.location, person ? null : row.type, row.aum,
                       person ? null : row.linkedin, BATCH,
                       JSON.stringify({ imports: [{ batch: BATCH, file: f.file, at: new Date().toISOString() }] })])
            }
            dir.firmByName.set(normPhrase(firmName), { id: firmId, name: firmName })
            if (host) dir.firmByHost.set(host, { id: firmId, name: firmName })
          }
          if (key) seenFirm.set(key, firmId)
        }
        if (!person) { stats.firms++; f.firms++; continue }
      }

      if (!person) continue
      stats.people++; f.people++

      // ── the person ──
      const email = row.email
      const slug = linkedinSlug(row.linkedin)
      const full = normPhrase(row.name)
      const batchKey = email || (slug ? `li:${slug}` : `${full}|${normFirm(row.firm ?? "")}`)
      if (seenPerson.has(batchKey)) { stats.personDupInBatch++; f.dup++; continue }
      seenPerson.set(batchKey, true)

      const hit = (email && dir.byEmail.get(email))
        || (slug && dir.bySlug.get(slug))
        || (full && row.firm && firmId ? dir.byNameFirm.get(`${full}|${firmId}`) : null)

      const incoming = {
        email, title: row.title, linkedin_url: row.linkedin,
        location: row.location, investor_type: row.type, website: row.website,
      }

      if (hit) {
        stats.personMatched++
        const { fills, conflicts } = diff(hit, incoming)
        if (firmId && isEmpty(hit.firm_id)) fills.firm_id = firmId
        if (Object.keys(fills).length) { stats.personFilled++; f.filled++ }
        if (conflicts.length) {
          stats.personConflicts += conflicts.length; f.conflicts += conflicts.length
          conflictLog.push({ kind: "person", id: hit.id, name: `${hit.first_name ?? ""} ${hit.last_name ?? ""}`.trim(), file: f.file, conflicts })
        }
        if (APPLY && Object.keys(fills).length) {
          const sets = Object.keys(fills).map((c, i) => `${c} = $${i + 2}`).join(", ")
          await q(`UPDATE investors SET ${sets}, updated_at = now() WHERE id = $1`, [hit.id, ...Object.values(fills)])
        }
      } else {
        stats.personNew++; f.newPeople++
        const [first, ...rest] = row.name.split(/\s+/)
        const id = crypto.randomUUID()
        if (APPLY) {
          await q(`INSERT INTO investors (id, first_name, last_name, email, title, linkedin_url, person_linkedin_url,
                     location, investor_type, firm_id, website, source, is_active, created_at, updated_at, metadata)
                   VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,true,now(),now(),$12::jsonb)`,
                  [id, first, rest.join(" ") || null, email, row.title, row.linkedin, row.location,
                   row.type, firmId, row.website, BATCH,
                   JSON.stringify({ imports: [{ batch: BATCH, file: f.file, at: new Date().toISOString() }] })])
        }
        if (email) dir.byEmail.set(email, { id })
        if (slug) dir.bySlug.set(slug, { id })
      }
    }
    perFile.push(f)
  }

  // ─── Report ───────────────────────────────────────────────────────────────
  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN — nothing was written"}   batch ${BATCH}\n`)
  console.log("file                                               rows  people  firms  +people  +firms  filled   dup  conflict")
  for (const f of perFile) {
    console.log(`${f.file.slice(0, 47).padEnd(49)}${String(f.rows).padStart(5)}${String(f.people).padStart(8)}${String(f.firms).padStart(7)}${String(f.newPeople).padStart(9)}${String(f.newFirms).padStart(8)}${String(f.filled).padStart(8)}${String(f.dup).padStart(6)}${String(f.conflicts).padStart(10)}`)
  }
  console.log(`
people   matched ${stats.personMatched}   new ${stats.personNew}   filled ${stats.personFilled}   duplicate-in-batch ${stats.personDupInBatch}   conflicts ${stats.personConflicts}
firms    matched ${stats.firmMatched}   new ${stats.firmNew}   filled ${stats.firmFilled}   duplicate-in-batch ${stats.firmDupInBatch}   conflicts ${stats.firmConflicts}
rows read ${stats.rows} from ${stats.files} files`)

  if (conflictLog.length) {
    // Outside the repository: the report quotes directory records.
    const out = path.join(os.tmpdir(), `import-conflicts-${Date.now()}.json`)
    fs.writeFileSync(out, JSON.stringify(conflictLog, null, 1))
    console.log(`\n${conflictLog.length} record(s) disagree with the sheet. Nothing was overwritten.
Written to ${out} for review — see docs/architecture/24 §2.`)
  }
  if (!APPLY) console.log("\nRe-run with --apply to write.")
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (!FILES.length) {
    console.error("usage: node scripts/import-directory-drop.mjs [--apply] <files…>")
    process.exit(2)
  }
  main().catch((e) => { console.error("import failed:", e); process.exit(1) })
}
