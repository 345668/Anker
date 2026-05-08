/**
 * Investment-firm / investor enrichment.
 *
 * Inputs:  a thin DB row (firm_id or investor_id, plus whatever
 *          contact data is already there).
 * Process: 1. crawl the website (homepage + about + portfolio)
 *          2. local-AI extract structured fields
 *          3. write back the deltas, never overwriting non-null values
 *             unless `overwrite=true`
 *          4. record what we did so the admin UI can show a diff
 *
 * The extraction step uses the `enrich_extract` task tier, which the
 * model-router routes to the BALANCED model (qwen2.5:7b-instruct).
 *
 * No headless browser. No third-party data API. All inference local.
 */

import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"
import { crawlSite, type CleanedPage, type CrawlSiteResult } from "./web-crawler"

export interface EnrichmentInput {
  firmId?: string
  investorId?: string
  /** When set, overwrite non-null fields. Default: only fill empties. */
  overwrite?: boolean
  /** Cap on how many pages to crawl. Default 5. */
  maxPages?: number
}

export interface ExtractedFirmFields {
  description?: string
  sectors?: string[]
  stages?: string[]
  geographicFocus?: string[]
  hqLocation?: string
  checkSizeMin?: number          // USD
  checkSizeMax?: number          // USD
  /** Free text — sometimes deck says "$1-3M initial check" but a
   *  numeric range can't be parsed. */
  checkSizeRange?: string
  foundedYear?: number
  notablePortfolio?: string[]
  /** Free-form thesis / approach in 2-3 sentences. */
  thesisSummary?: string
  /** Plain-English firm type the model inferred — "venture capital",
   *  "family office", "accelerator", "corporate vc", etc. */
  firmType?: string
  /** Confidence 0..1. */
  confidence?: number
  /** Notes on what was unambiguous vs inferred. */
  notes?: string
}

export interface ExtractedInvestorFields {
  bio?: string
  title?: string
  sectors?: string[]
  stages?: string[]
  location?: string
  notablePortfolio?: string[]
  /** Free-form: angel / partner / principal / GP / scout. */
  investorType?: string
  confidence?: number
  notes?: string
}

export interface EnrichmentResult {
  kind: "firm" | "investor"
  id: string
  before: Record<string, any>
  after: Record<string, any>
  /** Field-level changes the writer applied. */
  changes: { field: string; from: any; to: any }[]
  /** Crawl bundle used for extraction (truncated for response payload). */
  crawl: {
    seed: string
    pages: { url: string; status: number; words: number; bytes: number }[]
    errors: { url: string; error: string }[]
  }
  /** Raw extracted JSON (for audit). */
  extracted: ExtractedFirmFields | ExtractedInvestorFields
  /** Provider info — "ollama:qwen2.5:7b" / "anthropic:..." / "heuristic". */
  generatedBy: string
  durationMs: number
}

const MAX_TEXT_FOR_AI = 18_000

// ─── Public entry points ───────────────────────────────────────────────
export async function enrichFirm(input: EnrichmentInput): Promise<EnrichmentResult> {
  const startedAt = Date.now()
  if (!input.firmId) throw new Error("firmId required")
  const [row] = await sql`SELECT * FROM investment_firms WHERE id = ${input.firmId} LIMIT 1`
  if (!row) throw new Error(`firm ${input.firmId} not found`)

  const seedUrl = pickFirmUrl(row)
  if (!seedUrl) {
    return emptyResult("firm", input.firmId, row, "no website on file", startedAt)
  }

  const crawl = await crawlSite(seedUrl, { maxPages: input.maxPages ?? 5, concurrency: 3 })
  const corpus = buildCorpus(crawl)
  if (!corpus) {
    return emptyResult("firm", input.firmId, row, "site returned no extractable text", startedAt, crawl)
  }

  const extracted = await extractFirmFields(corpus, row.name)
  const generatedBy = (extracted as any)._generatedBy ?? "heuristic"
  delete (extracted as any)._generatedBy

  const before = pickFirmEcho(row)
  const { changes, after } = mergeFirm(row, extracted, !!input.overwrite)
  if (changes.length > 0) {
    await applyFirmUpdate(input.firmId, after, changes)
  }
  return {
    kind: "firm", id: input.firmId, before, after, changes,
    crawl: summarizeCrawl(crawl),
    extracted, generatedBy,
    durationMs: Date.now() - startedAt,
  }
}

export async function enrichInvestor(input: EnrichmentInput): Promise<EnrichmentResult> {
  const startedAt = Date.now()
  if (!input.investorId) throw new Error("investorId required")
  const [row] = await sql`SELECT * FROM investors WHERE id = ${input.investorId} LIMIT 1`
  if (!row) throw new Error(`investor ${input.investorId} not found`)

  // For an investor we crawl their LinkedIn-or-firm site, then use the
  // page text to enrich title / bio / sectors. LinkedIn anonymous access
  // is rate-limited; sites without auth often return a barebones page.
  const seedUrl = pickInvestorUrl(row)
  if (!seedUrl) {
    return emptyResult("investor", input.investorId, row, "no website / linkedin on file", startedAt)
  }

  const crawl = await crawlSite(seedUrl, { maxPages: input.maxPages ?? 3, concurrency: 2 })
  const corpus = buildCorpus(crawl)
  if (!corpus) {
    return emptyResult("investor", input.investorId, row, "site returned no extractable text", startedAt, crawl)
  }

  const extracted = await extractInvestorFields(corpus, displayInvestorName(row))
  const generatedBy = (extracted as any)._generatedBy ?? "heuristic"
  delete (extracted as any)._generatedBy

  const before = pickInvestorEcho(row)
  const { changes, after } = mergeInvestor(row, extracted, !!input.overwrite)
  if (changes.length > 0) {
    await applyInvestorUpdate(input.investorId, after, changes)
  }
  return {
    kind: "investor", id: input.investorId, before, after, changes,
    crawl: summarizeCrawl(crawl),
    extracted, generatedBy,
    durationMs: Date.now() - startedAt,
  }
}

// ─── AI extraction ─────────────────────────────────────────────────────
async function extractFirmFields(corpus: string, firmName: string): Promise<ExtractedFirmFields & { _generatedBy?: string }> {
  const prompt = `You are an investment-data analyst extracting structured fields from a venture firm's public website.

Firm name: ${firmName}

Pages crawled (joined):
"""
${corpus.slice(0, MAX_TEXT_FOR_AI)}
"""

Return STRICT JSON. Use null/omit when truly unknown — do NOT invent.

{
  "description": "<2-3 sentence elevator pitch>",
  "sectors": ["<lowercase canonical tags: ai/ml, fintech, climate, healthtech, deeptech, consumer, saas, biotech, ...>"],
  "stages": ["pre-seed" | "seed" | "series-a" | "series-b" | "series-c" | "growth"],
  "geographicFocus": ["<regions: us, eu, dach, gulf, latam, sea, ...>"],
  "hqLocation": "<city, state, country>",
  "checkSizeMin": <USD integer>,
  "checkSizeMax": <USD integer>,
  "checkSizeRange": "<exact phrase if present, else null>",
  "foundedYear": <integer>,
  "notablePortfolio": ["<portfolio company names — up to 8>"],
  "thesisSummary": "<2-3 sentence summary of investment thesis>",
  "firmType": "venture capital" | "family office" | "accelerator" | "corporate vc" | "incubator" | "fund of funds" | "angel syndicate" | "scout fund" | "other",
  "confidence": <0..1>,
  "notes": "<short note: what's unambiguous vs inferred>"
}

Output ONLY the JSON object. No prose, no markdown fences.`

  const text = await generate(prompt, { task: "enrich_extract", maxTokens: 1200, temperature: 0.2, json: true })
  const parsed = parseJson(text)
  if (!parsed) {
    return { confidence: 0.2, notes: "Extraction failed or model returned non-JSON.", _generatedBy: "heuristic" } as any
  }
  return { ...normalizeFirmExtracted(parsed), _generatedBy: "ollama:enrich_extract" } as any
}

async function extractInvestorFields(corpus: string, name: string): Promise<ExtractedInvestorFields & { _generatedBy?: string }> {
  const prompt = `You are an investment-data analyst extracting structured fields about an individual investor from public web content.

Investor name: ${name}

Pages crawled:
"""
${corpus.slice(0, MAX_TEXT_FOR_AI)}
"""

Return STRICT JSON.  Use null/omit when truly unknown — do NOT invent.

{
  "bio": "<2-3 sentence professional bio>",
  "title": "<job title, e.g. 'Partner', 'Principal', 'GP'>",
  "sectors": ["<lowercase canonical tags>"],
  "stages": ["pre-seed" | "seed" | "series-a" | "series-b" | "series-c" | "growth"],
  "location": "<city, state, country>",
  "notablePortfolio": ["<companies they led / participated in — up to 8>"],
  "investorType": "angel" | "partner" | "principal" | "gp" | "scout" | "associate" | "other",
  "confidence": <0..1>,
  "notes": "<short note>"
}

Output ONLY the JSON object.`

  const text = await generate(prompt, { task: "enrich_extract", maxTokens: 900, temperature: 0.2, json: true })
  const parsed = parseJson(text)
  if (!parsed) {
    return { confidence: 0.2, notes: "Extraction failed or model returned non-JSON.", _generatedBy: "heuristic" } as any
  }
  return { ...normalizeInvestorExtracted(parsed), _generatedBy: "ollama:enrich_extract" } as any
}

// ─── helpers: corpus, JSON parse, normalisation, merge, persist ────────
function buildCorpus(c: CrawlSiteResult): string {
  // Prepend each page with its URL + a marker. The model uses these as
  // anchors when it reasons about which page said what.
  const parts: string[] = []
  for (const p of c.pages) {
    if (!p.text) continue
    parts.push(`--- ${p.metadata.title || p.finalUrl} (${p.finalUrl}) ---\n${p.text.slice(0, 12_000)}`)
  }
  return parts.join("\n\n").trim()
}

function summarizeCrawl(c: CrawlSiteResult): EnrichmentResult["crawl"] {
  return {
    seed: c.seed,
    pages: c.pages.map((p) => ({ url: p.finalUrl, status: p.status, words: p.wordCount, bytes: p.bytes })),
    errors: c.errors,
  }
}

function parseJson(raw: string): any | null {
  if (!raw) return null
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  try { return JSON.parse(cleaned) } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) } catch {}
  }
  return null
}

function normalizeFirmExtracted(raw: any): ExtractedFirmFields {
  const out: ExtractedFirmFields = {}
  if (typeof raw.description === "string") out.description = raw.description.trim()
  if (Array.isArray(raw.sectors)) out.sectors = raw.sectors.filter((s: any) => typeof s === "string").map((s: string) => s.toLowerCase().trim())
  if (Array.isArray(raw.stages)) out.stages = raw.stages.filter((s: any) => typeof s === "string").map((s: string) => s.toLowerCase().trim().replace(/\s+/g, "-"))
  if (Array.isArray(raw.geographicFocus)) out.geographicFocus = raw.geographicFocus.filter((s: any) => typeof s === "string").map((s: string) => s.toLowerCase().trim())
  if (typeof raw.hqLocation === "string") out.hqLocation = raw.hqLocation.trim()
  if (typeof raw.checkSizeMin === "number") out.checkSizeMin = Math.round(raw.checkSizeMin)
  if (typeof raw.checkSizeMax === "number") out.checkSizeMax = Math.round(raw.checkSizeMax)
  if (typeof raw.checkSizeRange === "string") out.checkSizeRange = raw.checkSizeRange.trim()
  if (typeof raw.foundedYear === "number") out.foundedYear = Math.round(raw.foundedYear)
  if (Array.isArray(raw.notablePortfolio)) out.notablePortfolio = raw.notablePortfolio.filter((s: any) => typeof s === "string").slice(0, 12)
  if (typeof raw.thesisSummary === "string") out.thesisSummary = raw.thesisSummary.trim()
  if (typeof raw.firmType === "string") out.firmType = raw.firmType.toLowerCase().trim()
  if (typeof raw.confidence === "number") out.confidence = Math.max(0, Math.min(1, raw.confidence))
  if (typeof raw.notes === "string") out.notes = raw.notes
  return out
}

function normalizeInvestorExtracted(raw: any): ExtractedInvestorFields {
  const out: ExtractedInvestorFields = {}
  if (typeof raw.bio === "string") out.bio = raw.bio.trim()
  if (typeof raw.title === "string") out.title = raw.title.trim()
  if (Array.isArray(raw.sectors)) out.sectors = raw.sectors.filter((s: any) => typeof s === "string").map((s: string) => s.toLowerCase().trim())
  if (Array.isArray(raw.stages)) out.stages = raw.stages.filter((s: any) => typeof s === "string").map((s: string) => s.toLowerCase().trim().replace(/\s+/g, "-"))
  if (typeof raw.location === "string") out.location = raw.location.trim()
  if (Array.isArray(raw.notablePortfolio)) out.notablePortfolio = raw.notablePortfolio.filter((s: any) => typeof s === "string").slice(0, 12)
  if (typeof raw.investorType === "string") out.investorType = raw.investorType.toLowerCase().trim()
  if (typeof raw.confidence === "number") out.confidence = Math.max(0, Math.min(1, raw.confidence))
  if (typeof raw.notes === "string") out.notes = raw.notes
  return out
}

function pickFirmUrl(row: any): string | null {
  return (row.website || row.url || null) ?? null
}
function pickInvestorUrl(row: any): string | null {
  return (row.linkedin_url || row.person_linkedin_url || null) ?? null
}
function displayInvestorName(row: any): string {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.id
}

/** Echo of fields we'll consider for the firm diff. */
function pickFirmEcho(row: any) {
  return {
    name: row.name, type: row.type, firm_type: row.firm_type,
    description: row.description,
    sectors: row.sectors,
    stages: row.stages,
    geographic_focus: row.geographic_focus,
    hq_location: row.hq_location,
    check_size_min: row.check_size_min,
    check_size_max: row.check_size_max,
    check_size_range: row.check_size_range,
    founded_year: row.founded_year,
    portfolio_count: row.portfolio_count,
  }
}
function pickInvestorEcho(row: any) {
  return {
    title: row.title, bio: row.bio, sectors: row.sectors, stages: row.stages,
    location: row.location, investor_type: row.investor_type,
  }
}

function mergeFirm(row: any, ext: ExtractedFirmFields, overwrite: boolean) {
  const after: Record<string, any> = pickFirmEcho(row)
  const changes: { field: string; from: any; to: any }[] = []
  function maybeSet(field: string, dbField: string, value: any) {
    if (value == null) return
    if (Array.isArray(value) && value.length === 0) return
    if (typeof value === "string" && value.trim() === "") return
    const current = (row as any)[dbField]
    const currentEmpty = isEmpty(current)
    if (!currentEmpty && !overwrite) return
    if (sameNormalized(current, value)) return
    after[dbField] = value
    changes.push({ field, from: current, to: value })
  }
  maybeSet("description", "description", ext.description)
  maybeSet("sectors", "sectors", ext.sectors)
  maybeSet("stages", "stages", ext.stages)
  maybeSet("geographicFocus", "geographic_focus", ext.geographicFocus)
  maybeSet("hqLocation", "hq_location", ext.hqLocation)
  maybeSet("checkSizeMin", "check_size_min", ext.checkSizeMin)
  maybeSet("checkSizeMax", "check_size_max", ext.checkSizeMax)
  maybeSet("checkSizeRange", "check_size_range", ext.checkSizeRange)
  maybeSet("foundedYear", "founded_year", ext.foundedYear)
  if (ext.firmType) {
    const cur = row.type ?? row.firm_type
    if (isEmpty(cur) || overwrite) {
      after.type = ext.firmType
      after.firm_type = ext.firmType
      if (!sameNormalized(cur, ext.firmType)) changes.push({ field: "firmType", from: cur, to: ext.firmType })
    }
  }
  return { changes, after }
}

function mergeInvestor(row: any, ext: ExtractedInvestorFields, overwrite: boolean) {
  const after: Record<string, any> = pickInvestorEcho(row)
  const changes: { field: string; from: any; to: any }[] = []
  function maybeSet(field: string, dbField: string, value: any) {
    if (value == null) return
    if (Array.isArray(value) && value.length === 0) return
    if (typeof value === "string" && value.trim() === "") return
    const current = (row as any)[dbField]
    const currentEmpty = isEmpty(current)
    if (!currentEmpty && !overwrite) return
    if (sameNormalized(current, value)) return
    after[dbField] = value
    changes.push({ field, from: current, to: value })
  }
  maybeSet("title", "title", ext.title)
  maybeSet("bio", "bio", ext.bio)
  maybeSet("sectors", "sectors", ext.sectors)
  maybeSet("stages", "stages", ext.stages)
  maybeSet("location", "location", ext.location)
  maybeSet("investorType", "investor_type", ext.investorType)
  return { changes, after }
}

function isEmpty(v: any): boolean {
  if (v == null) return true
  if (typeof v === "string") return v.trim() === ""
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === "object") return Object.keys(v).length === 0
  return false
}
function sameNormalized(a: any, b: any): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim()
  return a === b
}

// ─── DB writers (only touch fields that actually changed) ──────────────
async function applyFirmUpdate(id: string, after: Record<string, any>, changes: { field: string; from: any; to: any }[]) {
  const fields = changes.map((c) => c.field)
  const setSectors = fields.includes("sectors")
  const setStages = fields.includes("stages")
  const setGeo = fields.includes("geographicFocus")
  await sql`
    UPDATE investment_firms SET
      description       = COALESCE(${after.description ?? null}, description),
      sectors           = CASE WHEN ${setSectors} THEN ${JSON.stringify(after.sectors ?? [])}::jsonb ELSE sectors END,
      stages            = CASE WHEN ${setStages} THEN ${JSON.stringify(after.stages ?? [])}::jsonb ELSE stages END,
      geographic_focus  = CASE WHEN ${setGeo}    THEN ${JSON.stringify(after.geographic_focus ?? [])}::jsonb ELSE geographic_focus END,
      hq_location       = COALESCE(${after.hq_location ?? null}, hq_location),
      check_size_min    = COALESCE(${after.check_size_min ?? null}, check_size_min),
      check_size_max    = COALESCE(${after.check_size_max ?? null}, check_size_max),
      check_size_range  = COALESCE(${after.check_size_range ?? null}, check_size_range),
      founded_year      = COALESCE(${after.founded_year ?? null}, founded_year),
      type              = COALESCE(${after.type ?? null}, type),
      firm_type         = COALESCE(${after.firm_type ?? null}, firm_type),
      updated_at        = NOW()
    WHERE id = ${id}
  `
}

async function applyInvestorUpdate(id: string, after: Record<string, any>, changes: { field: string; from: any; to: any }[]) {
  const fields = changes.map((c) => c.field)
  const setSectors = fields.includes("sectors")
  const setStages = fields.includes("stages")
  await sql`
    UPDATE investors SET
      title         = COALESCE(${after.title ?? null}, title),
      bio           = COALESCE(${after.bio ?? null}, bio),
      sectors       = CASE WHEN ${setSectors} THEN ${JSON.stringify(after.sectors ?? [])}::jsonb ELSE sectors END,
      stages        = CASE WHEN ${setStages}  THEN ${JSON.stringify(after.stages ?? [])}::jsonb  ELSE stages  END,
      location      = COALESCE(${after.location ?? null}, location),
      investor_type = COALESCE(${after.investor_type ?? null}, investor_type),
      updated_at    = NOW()
    WHERE id = ${id}
  `
}

function emptyResult(
  kind: "firm" | "investor",
  id: string,
  row: any,
  reason: string,
  startedAt: number,
  crawl?: CrawlSiteResult,
): EnrichmentResult {
  const before = kind === "firm" ? pickFirmEcho(row) : pickInvestorEcho(row)
  return {
    kind, id, before, after: before, changes: [],
    crawl: crawl ? summarizeCrawl(crawl) : { seed: "", pages: [], errors: [] },
    extracted: { confidence: 0, notes: reason } as any,
    generatedBy: "skipped",
    durationMs: Date.now() - startedAt,
  }
}

// ─── candidate finder for the bulk UI ──────────────────────────────────
export async function findEnrichmentCandidates(opts: { kind: "firm" | "investor"; limit?: number } = { kind: "firm" }) {
  const cap = Math.max(1, Math.min(500, opts.limit ?? 100))
  if (opts.kind === "firm") {
    return await sql`
      SELECT id, name, type, website, hq_location, sectors, description
      FROM investment_firms
      WHERE website IS NOT NULL
        AND (
          description IS NULL OR description = ''
          OR sectors IS NULL OR sectors::text = '[]' OR sectors::text = 'null'
          OR hq_location IS NULL OR hq_location = ''
        )
      ORDER BY updated_at ASC NULLS FIRST
      LIMIT ${cap}
    `
  } else {
    return await sql`
      SELECT id, first_name, last_name, title, bio, linkedin_url, location
      FROM investors
      WHERE linkedin_url IS NOT NULL
        AND (bio IS NULL OR bio = '' OR title IS NULL OR title = '')
      ORDER BY updated_at ASC NULLS FIRST
      LIMIT ${cap}
    `
  }
}
