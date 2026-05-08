/**
 * Fund-deck profile extraction.
 *
 * Mirror of `lib/matching/v2/document-extractor.ts` but for VC FUND decks
 * being shown to LPs (not startup decks shown to VCs).  Reads the fund's
 * pitch deck + supporting docs (DDQ, fund presentation, prior-fund
 * portfolio, GP bios) and returns a structured fund profile that can
 * pre-fill the LP-matchmaking form.
 *
 * Field set is shaped around what the LP-side matchmaker needs
 * (FundProfileV2): name + vehicle (Fund I/II/...), target raise, average
 * ticket, sectors / primary sectors, geography, GP bios, thesis keywords,
 * track record signals.
 *
 * Falls back to deterministic heuristics when no AI provider is wired.
 */

import Anthropic from "@anthropic-ai/sdk"
import { generate, resolveProvider } from "./provider"
import { extractPdfText } from "./pdf"

const ANTHROPIC_MODEL = "claude-sonnet-4-6"
const MAX_PDFS_PER_CALL = 5

let _client: Anthropic | null = null
function anthropicClient(): Anthropic | null {
  if (_client) return _client
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || key === "stub") return null
  _client = new Anthropic({ apiKey: key })
  return _client
}

export interface FileForFundExtraction {
  name: string
  contentType: string
  base64: string
  text?: string
}

/** Free-form vehicle label — Fund I, Fund II, Continuation Vehicle, SPV, etc. */
export type FundVehicle =
  | "fund_i"
  | "fund_ii"
  | "fund_iii"
  | "fund_iv"
  | "fund_v_plus"
  | "spv"
  | "continuation_vehicle"
  | "evergreen"
  | "other"

export interface ExtractedFundFields {
  name?: string
  vehicle?: FundVehicle
  fundNumber?: number // 1, 2, 3, ...
  oneLiner?: string
  description?: string
  /** Total target raise in USD */
  targetRaise?: number
  /** Average / typical anchor LP ticket size in USD */
  averageTicket?: number
  /** Min and max LP commitment in USD */
  minCommit?: number
  maxCommit?: number
  /** Where the GP / fund is HQ'd */
  headquartersLocation?: string
  /** Geographies the fund invests INTO */
  geographicFocus?: string[]
  /** Canonical sector tags */
  sectors?: string[]
  primarySector?: string
  /** Stage focus (pre-seed, seed, series-a, ...) */
  stages?: string[]
  /** Per-investment check size at portfolio level */
  investmentCheckMin?: number
  investmentCheckMax?: number
  /** Total portfolio size of the prior fund */
  priorPortfolioSize?: number
  /** Realised + unrealised performance signals */
  trackRecordSummary?: string
  topPortfolioCompanies?: string[]
  notableExits?: string[]
  /** Investment thesis bullets — short phrases */
  thesisKeywords?: string[]
  thesisStatement?: string
  /** GP names + 1-line bios */
  gpNames?: string[]
  gpBios?: string[]
  /** Years GPs have invested together as this team */
  teamYearsTogether?: number
  /** Management fee / carry / hurdle if disclosed */
  managementFeePct?: number
  carryPct?: number
  hurdlePct?: number
  /** Free-form summary fields */
  pitchDeckSummary?: string
  dataRoomSummary?: string
  /** Confidence + provenance */
  confidence?: number
  notes?: string
  extractedFrom?: string[]
}

/** Hints the user can provide to bias extraction */
export interface FundExtractionHints {
  fundName?: string
  gpEmail?: string
}

export async function extractFundProfile(
  pitchDeck: FileForFundExtraction | null,
  dataRoom: FileForFundExtraction[] = [],
  hints: FundExtractionHints = {},
): Promise<ExtractedFundFields> {
  const provider = await resolveProvider()
  const docs: FileForFundExtraction[] = []
  if (pitchDeck) docs.push(pitchDeck)
  for (const d of dataRoom.slice(0, MAX_PDFS_PER_CALL - docs.length)) docs.push(d)
  if (!docs.length) return heuristicFallback(pitchDeck, dataRoom, hints)

  // ─── Anthropic path: PDF vision modality ─────────────────────────────────
  if (provider === "anthropic") {
    const c = anthropicClient()
    if (!c) return heuristicFallback(pitchDeck, dataRoom, hints)
    const content: any[] = []
    for (const d of docs) {
      if (d.contentType === "application/pdf" && d.base64) {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: d.base64 },
          title: d.name,
        })
      } else if (d.text) {
        content.push({ type: "text", text: `--- ${d.name} ---\n${d.text}` })
      }
    }
    if (!content.length) return heuristicFallback(pitchDeck, dataRoom, hints)
    content.push({ type: "text", text: buildPrompt(hints) })
    try {
      const resp = await c.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 2200,
        messages: [{ role: "user", content }],
      })
      const text = resp.content[0]?.type === "text" ? resp.content[0].text : ""
      const parsed = parseJsonFromResponse(text)
      if (parsed) {
        parsed.extractedFrom = docs.map((d) => d.name)
        return normalize(parsed)
      }
    } catch (e: any) {
      console.error("[fund-deck-extractor/anthropic] failed:", e?.message ?? e)
    }
    return heuristicFallback(pitchDeck, dataRoom, hints)
  }

  // ─── Ollama path: extract PDF text server-side, then prompt the model ────
  if (provider === "ollama") {
    const textBlobs: string[] = []
    for (const d of docs) {
      let body = d.text
      if (!body && d.contentType === "application/pdf" && d.base64) {
        try {
          const buf = Buffer.from(d.base64, "base64")
          const parsed = await extractPdfText(buf)
          body = parsed.text
          if (!body || parsed.imageOnlyPages > parsed.pageCount * 0.7) {
            body =
              (body || "") +
              `\n[note: ${parsed.imageOnlyPages}/${parsed.pageCount} pages had < 5 words — likely image-heavy]`
          }
        } catch (e) {
          console.error(`[fund-deck-extractor/pdf] ${d.name}:`, (e as Error).message)
        }
      }
      if (body) textBlobs.push(`--- ${d.name} ---\n${body.slice(0, 8000)}`)
    }
    if (!textBlobs.length) {
      return heuristicFallback(pitchDeck, dataRoom, hints)
    }
    const prompt = buildPrompt(hints) + "\n\nDOCUMENTS:\n\n" + textBlobs.join("\n\n")
    const text = await generate(prompt, { maxTokens: 1500, temperature: 0.2, json: true, task: "deck_extract" })
    const parsed = parseJsonFromResponse(text)
    if (parsed) {
      parsed.extractedFrom = docs.map((d) => d.name)
      return normalize(parsed)
    }
    return heuristicFallback(pitchDeck, dataRoom, hints)
  }

  return heuristicFallback(pitchDeck, dataRoom, hints)
}

// ─── Prompt + parser ───────────────────────────────────────────────────────
function buildPrompt(hints: FundExtractionHints): string {
  return `You are an LP analyst reading a venture capital FUND's pitch deck and DDQ. Extract the following fields as STRICT JSON. Use null/omit when unknown — do NOT guess. The deck is from a GP raising capital from LPs.

Required JSON shape:
{
  "name": "<fund name (e.g. 'Acme Ventures Fund II')>",
  "vehicle": "fund_i" | "fund_ii" | "fund_iii" | "fund_iv" | "fund_v_plus" | "spv" | "continuation_vehicle" | "evergreen" | "other",
  "fundNumber": <integer — 1 for Fund I, 2 for Fund II, etc., or null for non-numbered vehicles>,
  "oneLiner": "<one sentence about the fund's strategy>",
  "description": "<2-3 sentence elevator pitch>",
  "targetRaise": <total target fund size in USD, integer>,
  "averageTicket": <average / typical LP ticket in USD>,
  "minCommit": <minimum LP commitment in USD>,
  "maxCommit": <max LP commitment in USD if disclosed>,
  "headquartersLocation": "<city, state, country of the GP>",
  "geographicFocus": ["<regions the FUND invests INTO, lowercase tags: us, eu, dach, gulf, latam, sea, ...>"],
  "sectors": ["<canonical sector tags, lowercase: ai/ml, fintech, climate, healthtech, deeptech, ...>"],
  "primarySector": "<single most prominent sector>",
  "stages": ["pre-seed", "seed", "series-a", "series-b", "growth"],
  "investmentCheckMin": <min initial investment per portfolio company in USD>,
  "investmentCheckMax": <max initial investment per portfolio company in USD>,
  "priorPortfolioSize": <number of portfolio companies in prior fund(s)>,
  "trackRecordSummary": "<1-2 sentence summary of DPI / TVPI / IRR / notable exits if disclosed; otherwise summarise prior-fund performance qualitatively>",
  "topPortfolioCompanies": ["<up to 8 portfolio company names from prior funds>"],
  "notableExits": ["<exit name + outcome if stated, e.g. 'Stripe — 12x'>"],
  "thesisStatement": "<the fund's investment thesis in 1-2 sentences>",
  "thesisKeywords": ["<3-8 short phrases describing the thesis>"],
  "gpNames": ["<full names of general partners>"],
  "gpBios": ["<one-line bio per GP — prior firm, exit, or area of expertise>"],
  "teamYearsTogether": <integer years the GP team has invested together>,
  "managementFeePct": <e.g. 2.0 for 2%>,
  "carryPct": <e.g. 20 for 20%>,
  "hurdlePct": <e.g. 8 for 8% if a preferred return is mentioned>,
  "pitchDeckSummary": "<3-4 sentence narrative summary of the deck>",
  "dataRoomSummary": "<2-3 sentence summary of the supporting docs (DDQ, performance, term sheet, etc.)>",
  "confidence": <0.0 to 1.0 — how confident you are in the extraction overall>,
  "notes": "<short note on what was unambiguous vs inferred; flag any unverifiable claims>"
}

${hints.fundName ? `Hint: fund name is "${hints.fundName}".` : ""}
${hints.gpEmail ? `Hint: GP email "${hints.gpEmail}" — derive firm domain if useful.` : ""}

Be strict about facts. If the deck says "first close", that's still Fund I unless explicitly Fund II. If a number is given as a range ("$50-75M"), use the midpoint. If a metric is for a PRIOR fund, surface it in trackRecordSummary, not as targetRaise.

Output ONLY the JSON object. No prose, no markdown fences.`
}

function parseJsonFromResponse(text: string): any | null {
  if (!text) return null
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {
        return null
      }
    }
    return null
  }
}

function normalize(raw: any): ExtractedFundFields {
  const out: ExtractedFundFields = {}
  if (typeof raw.name === "string") out.name = raw.name.trim()
  if (typeof raw.vehicle === "string") out.vehicle = normalizeVehicle(raw.vehicle)
  if (typeof raw.fundNumber === "number") out.fundNumber = Math.round(raw.fundNumber)
  if (typeof raw.oneLiner === "string") out.oneLiner = raw.oneLiner.trim()
  if (typeof raw.description === "string") out.description = raw.description.trim()
  if (typeof raw.targetRaise === "number") out.targetRaise = Math.round(raw.targetRaise)
  if (typeof raw.averageTicket === "number") out.averageTicket = Math.round(raw.averageTicket)
  if (typeof raw.minCommit === "number") out.minCommit = Math.round(raw.minCommit)
  if (typeof raw.maxCommit === "number") out.maxCommit = Math.round(raw.maxCommit)
  if (typeof raw.headquartersLocation === "string")
    out.headquartersLocation = raw.headquartersLocation.trim()
  if (Array.isArray(raw.geographicFocus))
    out.geographicFocus = raw.geographicFocus
      .filter((s: any) => typeof s === "string")
      .map((s: string) => s.toLowerCase().trim())
  if (Array.isArray(raw.sectors))
    out.sectors = raw.sectors
      .filter((s: any) => typeof s === "string")
      .map((s: string) => s.toLowerCase().trim())
  if (typeof raw.primarySector === "string") out.primarySector = raw.primarySector.toLowerCase().trim()
  if (Array.isArray(raw.stages))
    out.stages = raw.stages
      .filter((s: any) => typeof s === "string")
      .map((s: string) => s.toLowerCase().trim().replace(/\s+/g, "-"))
  if (typeof raw.investmentCheckMin === "number") out.investmentCheckMin = Math.round(raw.investmentCheckMin)
  if (typeof raw.investmentCheckMax === "number") out.investmentCheckMax = Math.round(raw.investmentCheckMax)
  if (typeof raw.priorPortfolioSize === "number") out.priorPortfolioSize = Math.round(raw.priorPortfolioSize)
  if (typeof raw.trackRecordSummary === "string") out.trackRecordSummary = raw.trackRecordSummary
  if (Array.isArray(raw.topPortfolioCompanies))
    out.topPortfolioCompanies = raw.topPortfolioCompanies.filter((s: any) => typeof s === "string")
  if (Array.isArray(raw.notableExits))
    out.notableExits = raw.notableExits.filter((s: any) => typeof s === "string")
  if (typeof raw.thesisStatement === "string") out.thesisStatement = raw.thesisStatement
  if (Array.isArray(raw.thesisKeywords))
    out.thesisKeywords = raw.thesisKeywords.filter((s: any) => typeof s === "string")
  if (Array.isArray(raw.gpNames)) out.gpNames = raw.gpNames.filter((s: any) => typeof s === "string")
  if (Array.isArray(raw.gpBios)) out.gpBios = raw.gpBios.filter((s: any) => typeof s === "string")
  if (typeof raw.teamYearsTogether === "number") out.teamYearsTogether = Math.round(raw.teamYearsTogether)
  if (typeof raw.managementFeePct === "number") out.managementFeePct = raw.managementFeePct
  if (typeof raw.carryPct === "number") out.carryPct = raw.carryPct
  if (typeof raw.hurdlePct === "number") out.hurdlePct = raw.hurdlePct
  if (typeof raw.pitchDeckSummary === "string") out.pitchDeckSummary = raw.pitchDeckSummary
  if (typeof raw.dataRoomSummary === "string") out.dataRoomSummary = raw.dataRoomSummary
  if (typeof raw.confidence === "number") out.confidence = Math.max(0, Math.min(1, raw.confidence))
  if (typeof raw.notes === "string") out.notes = raw.notes
  return out
}

function normalizeVehicle(s: string): FundVehicle | undefined {
  const lower = s.toLowerCase().trim().replace(/\s+/g, "_").replace(/-/g, "_")
  const valid: FundVehicle[] = [
    "fund_i", "fund_ii", "fund_iii", "fund_iv", "fund_v_plus",
    "spv", "continuation_vehicle", "evergreen", "other",
  ]
  if ((valid as string[]).includes(lower)) return lower as FundVehicle
  if (/^fund[_-]?(1|i|one)$/.test(lower)) return "fund_i"
  if (/^fund[_-]?(2|ii|two)$/.test(lower)) return "fund_ii"
  if (/^fund[_-]?(3|iii|three)$/.test(lower)) return "fund_iii"
  if (/^fund[_-]?(4|iv|four)$/.test(lower)) return "fund_iv"
  if (/^fund[_-]?[5-9]/.test(lower)) return "fund_v_plus"
  if (/spv|special.purpose/.test(lower)) return "spv"
  if (/continuation/.test(lower)) return "continuation_vehicle"
  if (/evergreen/.test(lower)) return "evergreen"
  return undefined
}

// ─── Heuristic fallback (no AI) ─────────────────────────────────────────────
function heuristicFallback(
  pitchDeck: FileForFundExtraction | null,
  dataRoom: FileForFundExtraction[],
  hints: FundExtractionHints,
): ExtractedFundFields {
  const fileNames = [pitchDeck?.name, ...dataRoom.map((d) => d.name)].filter(Boolean) as string[]
  const allText =
    [pitchDeck?.text, ...dataRoom.map((d) => d.text)].filter(Boolean).join("\n").slice(0, 10000) || ""

  let name = hints.fundName
  if (!name && pitchDeck?.name) {
    name = pitchDeck.name.replace(/\.(pdf|pptx?|key)$/i, "").replace(/[-_]/g, " ").trim()
  }

  // Detect fund vehicle from name + text
  let vehicle: FundVehicle | undefined
  let fundNumber: number | undefined
  const numMatch = (name ?? "").match(/fund\s*(i{1,4}|v|\d+)\b/i) ?? allText.match(/fund\s+(i{1,4}|v|\d+)\b/i)
  if (numMatch) {
    const tok = numMatch[1].toLowerCase()
    if (tok === "i" || tok === "1") { vehicle = "fund_i"; fundNumber = 1 }
    else if (tok === "ii" || tok === "2") { vehicle = "fund_ii"; fundNumber = 2 }
    else if (tok === "iii" || tok === "3") { vehicle = "fund_iii"; fundNumber = 3 }
    else if (tok === "iv" || tok === "4") { vehicle = "fund_iv"; fundNumber = 4 }
    else if (/^[5-9]$/.test(tok) || tok === "v") { vehicle = "fund_v_plus"; fundNumber = parseInt(tok) || 5 }
  }

  // Sectors keyword scan
  const sectors: string[] = []
  const map: [RegExp, string][] = [
    [/\b(ai|artificial intelligence|machine learning|ml)\b/i, "ai/ml"],
    [/\b(fintech|financial)\b/i, "fintech"],
    [/\b(climate|cleantech|sustainab)/i, "climate"],
    [/\b(health\s*tech|digital health|healthcare)\b/i, "healthtech"],
    [/\b(deep\s*tech|hardware|robotics)\b/i, "deeptech"],
    [/\b(biotech|life sciences)\b/i, "biotech"],
    [/\b(consumer|DTC|D2C)\b/i, "consumer"],
    [/\b(enterprise\s*software|saas|b2b)\b/i, "saas"],
  ]
  for (const [pat, tag] of map) {
    if (pat.test(allText) && !sectors.includes(tag)) sectors.push(tag)
  }

  // Target raise — first $XM after "fund" / "raise" / "target"
  let targetRaise: number | undefined
  const raiseMatch = allText.match(/(?:target|raise|fund\s+size|seeking)[^$]{0,40}\$\s?(\d+(?:\.\d+)?)\s*(M|million|B|billion)?/i)
  if (raiseMatch) {
    const n = parseFloat(raiseMatch[1])
    const unit = (raiseMatch[2] || "M").toLowerCase()
    targetRaise = unit.startsWith("b") ? n * 1_000_000_000 : n * 1_000_000
  }

  // Stages
  const stages: string[] = []
  if (/\bpre-?seed\b/i.test(allText)) stages.push("pre-seed")
  if (/\bseed\b/i.test(allText)) stages.push("seed")
  if (/\bseries\s*a\b/i.test(allText)) stages.push("series-a")
  if (/\bseries\s*b\b/i.test(allText)) stages.push("series-b")

  return {
    name,
    vehicle,
    fundNumber,
    sectors: sectors.length ? sectors : undefined,
    primarySector: sectors[0],
    stages: stages.length ? stages : undefined,
    targetRaise,
    pitchDeckSummary: allText
      ? `Heuristic: extracted from ${fileNames.length} file(s) without AI.`
      : undefined,
    confidence: 0.25,
    notes: "AI extraction unavailable (no provider configured). Heuristic fallback — please review and edit every field.",
    extractedFrom: fileNames,
  }
}
