/**
 * Generic CSV → investment_firms / investors importer.
 *
 *   1. Parse the upload via SheetJS (handles CSV, XLSX, TSV).
 *   2. Auto-detect column names with a tolerant header matcher
 *      (e.g. accepts "Firm" / "VC Firm" / "Company" → name).
 *   3. Stable-id dedup via sha1(normalized name) so re-imports are no-ops.
 *   4. Bulk INSERT with ON CONFLICT DO NOTHING.
 *
 * The caller supplies a `kind` ("firm" | "investor") + `source` tag
 * (e.g. "csv:partner-list-2026"); the source tag lets the admin
 * later filter / undo a specific import.
 */

import * as XLSX from "xlsx"
import crypto from "node:crypto"
import { sql } from "@/lib/db"

export type ImportKind = "firm" | "investor"

export interface ImportInput {
  kind: ImportKind
  source: string
  /** Raw bytes of the upload — XLSX or CSV. */
  bytes: Uint8Array
  /** Optional explicit column mapping; otherwise auto-detected. */
  columns?: Partial<Record<CanonicalColumn, string>>
  /** Default firm type when no Type column exists.  e.g. "venture capital". */
  defaultFirmType?: string
  /** Cap on how many rows we attempt to import. */
  maxRows?: number
  /** Dry-run: parse + dedup + report, no writes. */
  dryRun?: boolean
}

export type CanonicalColumn =
  | "name"
  | "first_name"
  | "last_name"
  | "full_name"
  | "title"
  | "email"
  | "linkedin"
  | "website"
  | "country"
  | "city"
  | "location"
  | "type"
  | "stages"
  | "sectors"
  | "industries"
  | "founded"
  | "min_check"
  | "max_check"
  | "aum"
  | "description"
  | "founders"

const HEADER_ALIASES: Record<CanonicalColumn, string[]> = {
  name:        ["name", "firm", "vc firm", "company", "fund", "organisation", "organization"],
  first_name:  ["first name", "first_name", "firstname", "given name"],
  last_name:   ["last name", "last_name", "lastname", "surname", "family name"],
  full_name:   ["full name", "investor", "person", "contact", "contact (name / role)"],
  title:       ["title", "role", "position", "job title"],
  email:       ["email", "email address", "contact email"],
  linkedin:    ["linkedin", "linkedin url", "linkedin_url", "li", "li url"],
  website:     ["website", "url", "site", "homepage"],
  country:     ["country", "countries"],
  city:        ["city", "cities", "town"],
  location:    ["location", "hq", "hq location", "headquarters", "state / country"],
  type:        ["type", "firm type", "category"],
  stages:      ["stages", "stage", "investment stage"],
  sectors:     ["sectors", "industries", "sector", "industry", "investment focus", "focus"],
  industries:  ["industries", "industry"],
  founded:     ["founded", "founded year", "founded date", "year founded"],
  min_check:   ["min check size", "min check", "min_check", "minimum check"],
  max_check:   ["max check size", "max check", "max_check", "maximum check"],
  aum:         ["aum", "assets under management", "funds raised", "fund size"],
  description: ["description", "notes", "summary", "about"],
  founders:    ["founders", "founder", "name of founders", "team", "managing partners"],
}

export interface ImportReport {
  kind: ImportKind
  source: string
  rowsRead: number
  rowsParsed: number
  rowsSkipped: number
  firmsInserted: number
  firmsAlreadyPresent: number
  investorsInserted: number
  investorsAlreadyPresent: number
  /** Auto-detected mapping from canonical → header. */
  detectedColumns: Partial<Record<CanonicalColumn, string>>
  /** First N parse / insert errors for the UI to show. */
  errors: { row: number; error: string }[]
  durationMs: number
  dryRun: boolean
}

export async function importCsv(input: ImportInput): Promise<ImportReport> {
  const t0 = Date.now()
  const wb = XLSX.read(input.bytes, { type: "array", cellDates: false, raw: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: false })

  const detected = input.columns
    ? input.columns
    : detectColumns(rows[0] ? Object.keys(rows[0]) : [])

  const cap = Math.max(1, Math.min(50_000, input.maxRows ?? 5000))
  const errors: ImportReport["errors"] = []

  let rowsParsed = 0, rowsSkipped = 0
  let firmsInserted = 0, firmsAlreadyPresent = 0
  let investorsInserted = 0, investorsAlreadyPresent = 0

  for (let i = 0; i < Math.min(rows.length, cap); i++) {
    const r = rows[i]
    try {
      if (input.kind === "firm") {
        const out = parseFirmRow(r, detected, input)
        if (!out) { rowsSkipped++; continue }
        rowsParsed++
        if (input.dryRun) continue
        const id = stableId("ifm", out.dedupKey)
        const result = await upsertFirm(id, out, input.source)
        if (result === "inserted") firmsInserted++
        else firmsAlreadyPresent++

        // Founders → investors (when surfaced in the CSV)
        if (out.founders.length > 0 && !input.dryRun) {
          for (const fullName of out.founders) {
            const inv = parseFounderToInvestor(fullName, out, detected, r)
            if (!inv) continue
            const invId = stableId("inv", `${slug(fullName)}@${id}`)
            const r2 = await upsertInvestor(invId, inv, id, input.source)
            if (r2 === "inserted") investorsInserted++
            else investorsAlreadyPresent++
          }
        }
      } else {
        const out = parseInvestorRow(r, detected, input)
        if (!out) { rowsSkipped++; continue }
        rowsParsed++
        if (input.dryRun) continue
        const invId = stableId("inv", out.dedupKey)
        const result = await upsertInvestor(invId, out, null, input.source)
        if (result === "inserted") investorsInserted++
        else investorsAlreadyPresent++
      }
    } catch (e: any) {
      errors.push({ row: i + 2, error: e?.message ?? "parse failed" })
      rowsSkipped++
    }
  }

  return {
    kind: input.kind,
    source: input.source,
    rowsRead: rows.length,
    rowsParsed,
    rowsSkipped,
    firmsInserted,
    firmsAlreadyPresent,
    investorsInserted,
    investorsAlreadyPresent,
    detectedColumns: detected,
    errors: errors.slice(0, 30),
    durationMs: Date.now() - t0,
    dryRun: !!input.dryRun,
  }
}

// ─── header detection ──────────────────────────────────────────────────
function detectColumns(headers: string[]): Partial<Record<CanonicalColumn, string>> {
  const map: Partial<Record<CanonicalColumn, string>> = {}
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ")
  for (const h of headers) {
    const n = norm(h)
    for (const [canon, aliases] of Object.entries(HEADER_ALIASES) as [CanonicalColumn, string[]][]) {
      if (map[canon]) continue
      if (aliases.some((a) => norm(a) === n)) {
        map[canon] = h
        break
      }
    }
  }
  return map
}

// ─── row parsers ──────────────────────────────────────────────────────
interface ParsedFirm {
  name: string
  type: string
  website: string | null
  location: string | null
  description: string | null
  sectors: string[]
  stages: string[]
  founded: number | null
  aumRaw: string | null
  minCheck: number | null
  maxCheck: number | null
  founders: string[]
  dedupKey: string
}
function parseFirmRow(r: Record<string, any>, cols: Partial<Record<CanonicalColumn, string>>, input: ImportInput): ParsedFirm | null {
  const get = (c: CanonicalColumn): string => {
    const k = cols[c]
    return k ? String(r[k] ?? "").trim() : ""
  }
  const name = get("name")
  if (!name || /^\W*$/.test(name)) return null
  const country = get("country")
  const city = get("city")
  const location = get("location") || [city, country].filter(Boolean).join(", ") || null
  const sectors = csvSplit(get("sectors") || get("industries"))
  const stages = csvSplit(get("stages"))
  const founders = csvSplit(get("founders") || get("full_name"))
  return {
    name,
    type: (get("type") || input.defaultFirmType || "venture capital").toLowerCase(),
    website: cleanWeb(get("website")),
    location,
    description: get("description") || null,
    sectors,
    stages,
    founded: parseIntOrNull(get("founded")),
    aumRaw: get("aum") || null,
    minCheck: parseMoneyUsd(get("min_check")),
    maxCheck: parseMoneyUsd(get("max_check")),
    founders,
    dedupKey: `${input.source}::${slug(name)}`,
  }
}

interface ParsedInvestor {
  firstName: string
  lastName: string
  fullName: string
  title: string | null
  email: string | null
  linkedin: string | null
  location: string | null
  bio: string | null
  type: string
  dedupKey: string
}
function parseInvestorRow(r: Record<string, any>, cols: Partial<Record<CanonicalColumn, string>>, input: ImportInput): ParsedInvestor | null {
  const get = (c: CanonicalColumn): string => {
    const k = cols[c]
    return k ? String(r[k] ?? "").trim() : ""
  }
  const fullName = get("full_name") || [get("first_name"), get("last_name")].filter(Boolean).join(" ")
  if (!fullName) return null
  const [first, last] = splitName(fullName)
  const linkedin = cleanLi(get("linkedin"))
  const email = cleanEmail(get("email"))
  const country = get("country")
  const city = get("city")
  const location = get("location") || [city, country].filter(Boolean).join(", ") || null
  return {
    firstName: first,
    lastName: last,
    fullName,
    title: get("title") || null,
    email,
    linkedin,
    location,
    bio: get("description") || null,
    type: (get("type") || "angel").toLowerCase(),
    dedupKey: `${input.source}::${slug(fullName)}::${linkedin || email || ""}`,
  }
}

function parseFounderToInvestor(fullName: string, firm: ParsedFirm, _cols: any, _r: any): ParsedInvestor | null {
  const trimmed = fullName.trim()
  if (!trimmed) return null
  const [first, last] = splitName(trimmed)
  return {
    firstName: first,
    lastName: last,
    fullName: trimmed,
    title: "Founder",
    email: null,
    linkedin: null,
    location: firm.location,
    bio: firm.sectors.length ? `Sectors: ${firm.sectors.join(", ")}` : null,
    type: firm.type,
    dedupKey: `${slug(trimmed)}@${firm.dedupKey}`,
  }
}

// ─── DB writers ───────────────────────────────────────────────────────
async function upsertFirm(id: string, p: ParsedFirm, source: string): Promise<"inserted" | "exists"> {
  const exists = await sql`SELECT 1 FROM investment_firms WHERE id = ${id} LIMIT 1`
  if ((exists as any[]).length) return "exists"
  const checkRange = formatRange(p.minCheck, p.maxCheck)
  await sql`
    INSERT INTO investment_firms (
      id, name, type, firm_classification, hq_location, location,
      website, sectors, description, typical_check_size, founded_year,
      source, created_at, updated_at
    ) VALUES (
      ${id}, ${p.name}, ${p.type}, ${p.type}, ${p.location}, ${p.location},
      ${p.website}, ${JSON.stringify(p.sectors)}::jsonb, ${p.description},
      ${checkRange}, ${p.founded}, ${source}, NOW(), NOW()
    ) ON CONFLICT (id) DO NOTHING
  `
  return "inserted"
}

async function upsertInvestor(invId: string, p: ParsedInvestor, firmId: string | null, source: string): Promise<"inserted" | "exists"> {
  const exists = await sql`SELECT 1 FROM investors WHERE id = ${invId} LIMIT 1`
  if ((exists as any[]).length) return "exists"
  await sql`
    INSERT INTO investors (
      id, first_name, last_name, title, email, linkedin_url, person_linkedin_url,
      bio, investor_type, firm_id, location, status, source, is_active,
      created_at, updated_at
    ) VALUES (
      ${invId}, ${p.firstName}, ${p.lastName}, ${p.title},
      ${p.email}, ${p.linkedin}, ${p.linkedin},
      ${p.bio}, ${p.type}, ${firmId}, ${p.location},
      'identified', ${source}, true, NOW(), NOW()
    ) ON CONFLICT (id) DO NOTHING
  `
  return "inserted"
}

// ─── helpers ──────────────────────────────────────────────────────────
function stableId(prefix: string, key: string): string {
  return `${prefix}_${crypto.createHash("sha1").update(key).digest("hex").slice(0, 12)}`
}
function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "")
}
function csvSplit(s: string): string[] {
  if (!s) return []
  return s.split(/[,;]/).map((x) => x.trim()).filter(Boolean)
}
function cleanWeb(s: string): string | null {
  if (!s) return null
  s = s.trim()
  if (!s || s.toLowerCase() === "n/a") return null
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith("www.")) return "https://" + s
  return "https://" + s.replace(/^\/+/, "")
}
function cleanLi(s: string): string | null {
  if (!s) return null
  s = s.trim()
  if (!s || s.toLowerCase() === "n/a") return null
  if (/^https?:\/\//i.test(s)) return s
  return "https://www.linkedin.com/in/" + s.replace(/^\/+/, "").replace(/^in\//, "")
}
function cleanEmail(s: string): string | null {
  if (!s) return null
  s = s.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null
}
function parseIntOrNull(v: any): number | null {
  if (v == null || v === "") return null
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10)
  return Number.isFinite(n) ? n : null
}
function parseMoneyUsd(v: any): number | null {
  if (!v) return null
  const s = String(v).trim()
  if (!s || s.toLowerCase() === "n/a") return null
  const m = s.match(/([\d.,]+)\s*([kmbKMB])?/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ""))
  if (!Number.isFinite(n)) return null
  const u = (m[2] || "").toLowerCase()
  if (u === "k") return Math.round(n * 1_000)
  if (u === "m") return Math.round(n * 1_000_000)
  if (u === "b") return Math.round(n * 1_000_000_000)
  return Math.round(n)
}
function formatRange(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B`
                            : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
                            : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K`
                            : `$${n}`
  if (min && max && min !== max) return `${fmt(min)}–${fmt(max)}`
  return fmt((max ?? min) as number)
}
function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return [parts[0], ""]
  return [parts[0], parts.slice(1).join(" ")]
}
