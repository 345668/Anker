/**
 * AI-powered profile extraction from a pitch deck + data room files.
 *
 * Uses Claude's PDF input modality (vision + text) to read the deck and
 * supporting docs, then returns structured `ExtractedProfileFields`.
 *
 * Falls back to deterministic heuristics on the file names + raw text
 * when ANTHROPIC_API_KEY isn't set, so the workflow always returns
 * something usable.
 */

import { generate, resolveProvider } from "@/lib/ai/provider"
import { extractPdfText } from "@/lib/ai/pdf"
import { extractJsonObject } from "@/lib/ai/json-extract"
import { canonicalSectors, sectorProfile } from "../normalize/sectors"
import { normalizeStages } from "../normalize/stages"
import { resolveGeo, countryName } from "../normalize/geo"
import { parseMoneyRange } from "../normalize/money"
import { documentHash, extractOnce } from "./extraction-cache"
import { analyzePdfDocuments, resolveVisionProvider, type PdfVisionFile } from "@/lib/ai/pdf-vision"
import type { ExtractedProfileFields, StartupStage } from "./founder-types"

const MAX_PDFS_PER_CALL = 5

export interface FileForExtraction {
  name: string
  contentType: string // application/pdf, text/plain, etc.
  base64: string // base64-encoded content (PDFs only) or empty
  text?: string // extracted plain text (for non-PDFs or pre-extracted text)
}

/**
 * Extract a founder's profile from their documents.
 *
 * With `orgId`, the same bytes are extracted once per workspace and reused
 * (docs/architecture/21 §2) — the model rewrites its prose on every call, and
 * that prose is what the semantic query vector is built from, so re-running a
 * deck used to produce a different shortlist.
 */
export async function extractStartupProfile(
  pitchDeck: FileForExtraction | null,
  dataRoom: FileForExtraction[] = [],
  hints: { startupName?: string; founderEmail?: string; orgId?: string | null } = {},
): Promise<ExtractedProfileFields> {
  if (pitchDeck?.base64 && hints.orgId) {
    const { fields, cached } = await extractOnce(
      { scope: { orgId: hints.orgId }, hash: documentHash(pitchDeck.base64), kind: "startup" },
      () => extractStartupProfileUncached(pitchDeck, dataRoom, hints),
    )
    if (cached) console.log("[extract] reusing this workspace's earlier read of the same document")
    return fields
  }
  return extractStartupProfileUncached(pitchDeck, dataRoom, hints)
}

async function extractStartupProfileUncached(
  pitchDeck: FileForExtraction | null,
  dataRoom: FileForExtraction[] = [],
  hints: { startupName?: string; founderEmail?: string } = {},
): Promise<ExtractedProfileFields> {
  const provider = await resolveProvider().catch(() => "none" as const)
  const docs: FileForExtraction[] = []
  if (pitchDeck) docs.push(pitchDeck)
  for (const d of dataRoom.slice(0, MAX_PDFS_PER_CALL - docs.length)) docs.push(d)
  if (!docs.length) return heuristicFallback(pitchDeck, dataRoom, hints)

  // ─── Cloud-vision path: Anthropic → OpenAI → Gemini.  Reads admin-managed
  // keys from the runtime config (system_settings.ai_router_v1) with env
  // fallback.  Previous version went straight to Anthropic via process.env
  // and silently returned the heuristic fallback when env was unset/stub.
  const visionProvider = await resolveVisionProvider().catch(() => "none" as const)
  if (provider === "anthropic" || visionProvider !== "none") {
    const files: PdfVisionFile[] = docs.map((d) => ({
      name: d.name,
      contentType: d.contentType,
      base64: d.base64,
      text: d.text,
    }))
    const r = await analyzePdfDocuments(files, buildPrompt(hints), {
      maxTokens: 6000,
      tag: "founder-document-extractor",
    })
    if (r.error || !r.text) {
      console.error(`[document-extractor] vision failed (provider=${r.provider}): ${r.error}`)
      return heuristicFallback(pitchDeck, dataRoom, hints)
    }
    const parsed = parseJsonFromResponse(r.text)
    if (parsed) {
      parsed.extractedFrom = docs.map((d) => d.name)
      return normalize(parsed)
    }
    return heuristicFallback(pitchDeck, dataRoom, hints)
  }

  // ─── Ollama path: extract PDF text server-side, then prompt the model ────
  // Local models don't have PDF vision. We extract text from each PDF
  // with `pdf-parse` and stitch it into the prompt. Files that already
  // shipped with `text` (TXT/CSV/MD) are used as-is.
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
            // Mostly image-only deck — note the limitation in the prompt
            body = (body || "") +
              `\n[note: ${parsed.imageOnlyPages}/${parsed.pageCount} pages had < 5 words — likely image-heavy]`
          }
        } catch (e) {
          console.error(`[document-extractor/pdf] ${d.name}:`, (e as Error).message)
        }
      }
      if (body) textBlobs.push(`--- ${d.name} ---\n${body.slice(0, 8000)}`)
    }
    if (!textBlobs.length) {
      return heuristicFallback(pitchDeck, dataRoom, hints)
    }
    const prompt = buildPrompt(hints) + "\n\nDOCUMENTS:\n\n" + textBlobs.join("\n\n")
    const text = await generate(prompt, { maxTokens: 1200, temperature: 0.2, json: true, task: "deck_extract" }).catch(() => "")
    const parsed = parseJsonFromResponse(text)
    if (parsed) {
      parsed.extractedFrom = docs.map((d) => d.name)
      return normalize(parsed)
    }
    return heuristicFallback(pitchDeck, dataRoom, hints)
  }

  return heuristicFallback(pitchDeck, dataRoom, hints)
}

function buildPrompt(hints: { startupName?: string; founderEmail?: string }): string {
  return `CRITICAL RULES — read these BEFORE doing anything else:
1. EVIDENCE-ONLY EXTRACTION. Every non-null field MUST be supported by an exact phrase from the documents below. If you cannot point to evidence in the source text for a field, return null. Do not infer, guess, or rely on patterns.
2. NEVER FABRICATE NAMES OR NUMBERS. If founder/team names, company name, dollar figures, dates, or metrics are not explicitly written in the documents, return null. Do not invent placeholder content.
3. FILENAME IS NOT EVIDENCE. The document filename tells you nothing about content. Do not infer the company name, date, or stage from it.
4. CONFIDENCE MUST REFLECT EVIDENCE. If you returned mostly nulls because the text is sparse or image-heavy, set confidence to 0.1-0.3. Reserve confidence > 0.7 for cases where you can quote specific phrases for the major fields.
5. IMAGE-HEAVY SOURCES. If the documents are tagged "[note: X pages had < 5 words ...]" return mostly nulls with confidence 0.1 and a note saying the deck was image-only.

You are an investment analyst reading a startup's pitch deck and data room. Extract the following fields as STRICT JSON. Use null/omit when unknown — do NOT guess.

Required JSON shape:
{
  "name": "<company name>",
  "oneLiner": "<one sentence>",
  "description": "<2-3 sentence elevator pitch>",
  "sectors": ["<canonical sector tags, lowercase>", ...],
  "primarySector": "<single most important sector>",
  "stage": "pre-seed" | "seed" | "series-a" | "series-b" | "series-c" | "growth" | "late-stage",
  "location": "<city, state, country>",
  "askAmount": <total round size in USD, integer>,
  "preMoneyValuation": <pre-money in USD, integer>,
  "checkSizeIdealMin": <ideal min check from a single investor, USD>,
  "checkSizeIdealMax": <ideal max check, USD>,
  "arr": <annual recurring revenue USD if SaaS>,
  "mrr": <monthly recurring revenue USD>,
  "growthRateMom": <month-over-month growth as a percentage, e.g. 12 for 12%>,
  "teamSize": <number of employees>,
  "foundedYear": <year founded>,
  "thesisKeywords": ["<3-8 keywords describing what the company does or its differentiation>", ...],
  "founderBios": ["<one-line bio per founder>", ...],
  "pitchDeckSummary": "<3-4 sentence narrative summary of the deck>",
  "dataRoomSummary": "<2-3 sentence summary of the supporting docs>",
  "instrument": "safe" | "priced-equity" | "convertible-note" | "other",
  "valuationCap": <valuation cap in USD, integer — for a SAFE or note>,
  "valuationCapType": "pre-money" | "post-money",
  "leadStatus": "needed" | "in-discussion" | "secured",
  "committedAmount": <USD already committed or soft-circled, integer>,
  "targetCloseDate": "<YYYY-MM-DD if the deck states a close date>",
  "geographyTargetRegions": ["<countries or regions the company sells to or wants investors from>", ...],
  "investorTypesWanted": ["<investor types the deck asks for, e.g. lead investor, strategic, angel>", ...],
  "businessModel": "<B2B | B2C | B2B2C | marketplace | other, with one clause of detail>",
  "customerSegment": "<who buys, in the deck's words>",
  "namedCustomers": ["<customers or partners named in the deck>", ...],
  "useOfFunds": "<one sentence on what the round pays for>",
  "competitors": ["<competitors named in the deck>", ...],
  "evidence": { "<field name>": "<the exact phrase from the document that supports it>", ... },
  "confidence": <0.0 to 1.0>,
  "notes": "<short note on what was unambiguous vs inferred>"
}

A SAFE's valuation cap is NOT a pre-money valuation: put it in valuationCap with its type, and leave preMoneyValuation null unless the deck states a priced pre-money.
Fill "evidence" for every non-null field you can quote. A field with no quotable evidence must be null.

${hints.startupName ? `Hint: company name is "${hints.startupName}".` : ""}
${hints.founderEmail ? `Hint: founder email "${hints.founderEmail}" — derive company domain if useful.` : ""}

Output ONLY the JSON object. No prose, no markdown fences.`
}

function parseJsonFromResponse(text: string): any | null {
  return extractJsonObject(text, "founder-document-extractor")
}

function normalize(raw: any): ExtractedProfileFields {
  const out: ExtractedProfileFields = {}
  if (typeof raw.name === "string") out.name = raw.name.trim()
  if (typeof raw.oneLiner === "string") out.oneLiner = raw.oneLiner.trim()
  if (typeof raw.description === "string") out.description = raw.description.trim()
  // Sectors come from the vocabulary the scorer reads, in a stable order, so
  // the same deck cannot yield "saaS" once and "enterprise software" the next
  // (doc 21 §3). Generic markers and unknown labels are dropped, not invented.
  if (Array.isArray(raw.sectors)) {
    const listed = raw.sectors.filter((s: any) => typeof s === "string")
    const primary = typeof raw.primarySector === "string" ? raw.primarySector : null
    const snapped = canonicalSectors(listed, primary)
    if (snapped.length) out.sectors = snapped
  }
  if (typeof raw.primarySector === "string") {
    out.primarySector = canonicalSectors([raw.primarySector])[0] ?? raw.primarySector.toLowerCase()
  }
  if (typeof raw.stage === "string") out.stage = normalizeStage(raw.stage)
  if (typeof raw.location === "string") out.location = raw.location.trim()
  if (typeof raw.askAmount === "number") out.askAmount = Math.round(raw.askAmount)
  if (typeof raw.preMoneyValuation === "number") out.preMoneyValuation = Math.round(raw.preMoneyValuation)
  if (typeof raw.checkSizeIdealMin === "number") out.checkSizeIdealMin = Math.round(raw.checkSizeIdealMin)
  if (typeof raw.checkSizeIdealMax === "number") out.checkSizeIdealMax = Math.round(raw.checkSizeIdealMax)
  if (typeof raw.arr === "number") out.arr = Math.round(raw.arr)
  if (typeof raw.mrr === "number") out.mrr = Math.round(raw.mrr)
  if (typeof raw.growthRateMom === "number") out.growthRateMom = raw.growthRateMom
  if (typeof raw.teamSize === "number") out.teamSize = Math.round(raw.teamSize)
  if (typeof raw.foundedYear === "number") out.foundedYear = Math.round(raw.foundedYear)
  if (Array.isArray(raw.thesisKeywords)) out.thesisKeywords = raw.thesisKeywords.filter((s: any) => typeof s === "string")
  if (Array.isArray(raw.founderBios)) out.founderBios = raw.founderBios.filter((s: any) => typeof s === "string")
  if (typeof raw.pitchDeckSummary === "string") out.pitchDeckSummary = raw.pitchDeckSummary
  if (typeof raw.dataRoomSummary === "string") out.dataRoomSummary = raw.dataRoomSummary
  if (["safe", "priced-equity", "convertible-note", "other"].includes(raw.instrument)) out.instrument = raw.instrument
  if (typeof raw.valuationCap === "number") out.valuationCap = Math.round(raw.valuationCap)
  if (raw.valuationCapType === "pre-money" || raw.valuationCapType === "post-money") out.valuationCapType = raw.valuationCapType
  if (["needed", "in-discussion", "secured"].includes(raw.leadStatus)) out.leadStatus = raw.leadStatus
  if (typeof raw.committedAmount === "number") out.committedAmount = Math.round(raw.committedAmount)
  if (typeof raw.targetCloseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.targetCloseDate)) out.targetCloseDate = raw.targetCloseDate
  for (const key of ["geographyTargetRegions", "investorTypesWanted", "namedCustomers", "competitors"] as const) {
    if (Array.isArray(raw[key])) out[key] = raw[key].filter((s: any) => typeof s === "string" && s.trim()).slice(0, 25)
  }
  for (const key of ["businessModel", "customerSegment", "useOfFunds"] as const) {
    if (typeof raw[key] === "string" && raw[key].trim()) out[key] = raw[key].trim().slice(0, 2000)
  }
  if (raw.evidence && typeof raw.evidence === "object" && !Array.isArray(raw.evidence)) {
    const ev: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw.evidence)) if (typeof v === "string" && v.trim() && k.length <= 60) ev[k] = v.trim().slice(0, 500)
    if (Object.keys(ev).length) out.evidence = ev
  }
  if (typeof raw.confidence === "number") out.confidence = Math.max(0, Math.min(1, raw.confidence))
  if (typeof raw.notes === "string") out.notes = raw.notes
  return out
}

function normalizeStage(s: string): StartupStage | undefined {
  const lower = s.toLowerCase().trim().replace(/\s+/g, "-")
  const valid: StartupStage[] = ["pre-seed", "seed", "series-a", "series-b", "series-c", "growth", "late-stage"]
  for (const v of valid) {
    if (lower === v || lower === v.replace("-", "")) return v
  }
  // Tolerate "preseed", "series_a", etc.
  if (lower.includes("pre")) return "pre-seed"
  if (lower === "a") return "series-a"
  if (lower === "b") return "series-b"
  if (lower === "c") return "series-c"
  return undefined
}

// ─── Heuristic fallback (no AI key) — docs/architecture/22 ──────────────────

/** Words that are capitalised in a deck without being the company's name. */
const NAME_STOPWORDS = new Set([
  "the", "and", "for", "our", "we", "a", "an", "in", "of", "to", "with", "why", "how", "what",
  "team", "market", "problem", "solution", "product", "traction", "vision", "mission", "ask",
  "raising", "seed", "pre", "series", "round", "safe", "cap", "revenue", "arr", "mrr", "gtm",
  "roadmap", "appendix", "confidential", "overview", "summary", "company", "inc", "llc", "ltd",
  "investment", "opportunity", "deck", "page", "million", "billion", "usd", "eur",
])

/**
 * The company's own name, taken from the document.
 *
 * A deck prints its name on nearly every page, so the most frequent
 * distinctive token is a good reading — and unlike a model, it cannot invent
 * one. Falls back to the file's own name (doc 22 §3).
 */
export function nameFromText(text: string, fileNames: string[] = []): string | undefined {
  const counts = new Map<string, { n: number; display: string }>()
  for (const raw of text.match(/\b[A-Z][A-Za-z0-9&.'-]{1,24}\b/g) ?? []) {
    const key = raw.toLowerCase().replace(/[.'-]+$/, "")
    if (key.length < 2 || NAME_STOPWORDS.has(key) || /^\d+$/.test(key)) continue
    const seen = counts.get(key)
    if (seen) seen.n++
    else counts.set(key, { n: 1, display: raw })
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0]
  // One mention is a word in a sentence; a name recurs.
  if (best && best.n >= 3) return best.display
  const file = fileNames[0]?.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim()
  return file || undefined
}

/**
 * The sectors a deck is actually about, by how persistently it says them.
 *
 * Scanning 16,000 characters in one pass turns every incidental word into a
 * claimed sector — one mention of nutrition and a device makes a
 * sports-technology deck "foodtech, iot, legaltech". A sector the company is
 * built on recurs across its pages; a passing mention does not. So the text is
 * read in slices and the groups are ranked by how many slices name them.
 */
export function sectorsByPersistence(text: string, limit = 4): string[] {
  const SLICES = 16
  const size = Math.max(1, Math.ceil(text.length / SLICES))
  const counts = new Map<string, number>()
  for (let i = 0; i < text.length; i += size) {
    for (const group of new Set(sectorProfile(text.slice(i, i + size)).groups)) {
      counts.set(group, (counts.get(group) ?? 0) + 1)
    }
  }
  if (!counts.size) return []
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const strongest = ranked[0][1]
  return ranked
    // Keep what the deck returns to: at least a third as often as its main
    // subject, or named in more than one slice.
    .filter(([, n], i) => i === 0 || n > 1 || n >= strongest / 3)
    .slice(0, limit)
    .map(([group]) => group)
}

/** The document's own sentences — the fallback quotes, it never writes (doc 22 §3). */
export function sentencesFrom(text: string, count: number, minLength = 40): string[] {
  const out: string[] = []
  // A PDF wraps lines wherever the page ended, so a single newline inside a
  // paragraph is a line break, not a sentence break. Rejoin those first, and
  // keep blank lines as the real separators.
  const flowed = text
    .replace(/\r/g, "")
    .replace(/([^.!?:;\n])\n(?=[a-z(])/g, "$1 ")
    .replace(/\n{2,}/g, "\n")
  for (const raw of flowed.split(/(?<=[.!?])\s+|\n+/)) {
    const line = raw.replace(/\s+/g, " ").trim()
    if (line.length < minLength || line.length > 320) continue
    // Skip page furniture, print headers and all-caps banners. A deck that is
    // a print-to-PDF carries "9/21/26, 1:41 PM …" on every page.
    if (/^(page|slide|confidential|appendix)\b/i.test(line)) continue
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}[,\s]/.test(line)) continue
    if (/\b\d{1,2}\s?:\s?\d{2}\s?(am|pm)\b/i.test(line)) continue
    if (/^https?:\/\//i.test(line) || /^\S+\.(com|io|ai|co|org)\b/i.test(line)) continue
    if (line === line.toUpperCase() && line.length > 12) continue
    // A quote that does not finish a thought is not a quote.
    if (!/[.!?]$/.test(line)) continue
    // PDF text extraction leaves spacing artefacts — "…insu !" — where a word
    // was split across a line. A sentence does not have a space before its
    // full stop, and does not end on a truncated word.
    if (/\s[.!?]$/.test(line)) continue
    out.push(line)
    if (out.length >= count) break
  }
  return out
}

/**
 * The amount a deck states next to a phrase, using the platform's own parser.
 *
 * A single line often carries two figures — "RAISING $1MM. SAFE, $8MM
 * POST-MONEY VAL CAP" is both the ask and the valuation — so the amount
 * closest to the matching phrase wins rather than the line's smallest.
 */
function amountNear(text: string, patterns: RegExp[]): number | undefined {
  for (const line of text.split(/\n+/)) {
    const hit = patterns.map((p) => line.search(p)).filter((i) => i >= 0).sort((a, b) => a - b)[0]
    if (hit === undefined) continue
    const amounts: { value: number; at: number }[] = []
    for (const m of line.matchAll(/[€$£]?\s?\d[\d,.]*\s*(?:mm|bn|[kmbt])\b|[€$£]\s?\d[\d,.]*/gi)) {
      const range = parseMoneyRange(m[0])
      const value = range?.max ?? range?.min
      if (value && value > 0) amounts.push({ value, at: m.index ?? 0 })
    }
    if (!amounts.length) continue
    amounts.sort((a, b) => Math.abs(a.at - hit) - Math.abs(b.at - hit))
    return Math.round(amounts[0].value)
  }
  return undefined
}

async function heuristicFallback(
  pitchDeck: FileForExtraction | null,
  dataRoom: FileForExtraction[],
  hints: { startupName?: string; founderEmail?: string },
): Promise<ExtractedProfileFields> {
  const fileNames = [pitchDeck?.name, ...dataRoom.map((d) => d.name)].filter(Boolean) as string[]
  const texts = await Promise.all([pitchDeck, ...dataRoom].filter(Boolean).map(async d => {
    if (d!.text) return d!.text
    if (d!.contentType === "application/pdf" && d!.base64) {
      try { return (await extractPdfText(Buffer.from(d!.base64, "base64"))).text } catch { return "" }
    }
    return ""
  }))
  const allText = texts.join("\n").slice(0, 16000)

  // Every field below comes from a normaliser the scorer already trusts, so a
  // heuristic profile and an AI one speak the same vocabulary (doc 22 §2).
  const persistent = sectorsByPersistence(allText)
  // The head of the list is the market the company is in, not the technology
  // it uses: "data" recurs in a sports deck without making it a data company.
  const leadVertical = persistent.find((g) => sectorProfile([g]).verticals.length > 0)
  const sectors = canonicalSectors(persistent, leadVertical ?? persistent[0] ?? null)
  const stage = normalizeStages(allText)[0]
  const geo = resolveGeo(allText)
  const askAmount = amountNear(allText, [/\braising\b/i, /\bseeking\b/i, /\bround size\b/i, /\btarget raise\b/i, /\bthe ask\b/i])
  const preMoneyValuation = amountNear(allText, [/\bpre-?money\b/i, /\bvaluation\b/i, /\bval\.? cap\b/i, /\bpost-?money\b/i])
  const quoted = sentencesFrom(allText, 4)

  return {
    name: hints.startupName || nameFromText(allText, fileNames),
    sectors: sectors.length ? sectors : undefined,
    primarySector: sectors[0],
    stage: stage as StartupStage | undefined,
    location: geo.country ? countryName(geo.country) ?? undefined : undefined,
    askAmount,
    preMoneyValuation,
    // Quoted from the deck, never composed: a heuristic that writes prose is
    // a heuristic that lies (doc 22 §3).
    oneLiner: quoted[0],
    description: quoted.slice(1).join(" ") || undefined,
    thesisKeywords: sectors.length ? sectors : undefined,
    pitchDeckSummary: allText ? `Read from ${fileNames.length} file(s) without AI: ${quoted.length} quoted passages.` : undefined,
    confidence: 0.3,
    notes: "AI extraction was unavailable or unsuccessful. These values were read from the document's own text — quoted, never composed. Check every one before matching.",
    extractedFrom: fileNames,
  }
}
