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
import { analyzePdfDocuments, resolveVisionProvider, type PdfVisionFile } from "@/lib/ai/pdf-vision"
import type { ExtractedProfileFields, StartupStage } from "./founder-types"

const MAX_PDFS_PER_CALL = 5

export interface FileForExtraction {
  name: string
  contentType: string // application/pdf, text/plain, etc.
  base64: string // base64-encoded content (PDFs only) or empty
  text?: string // extracted plain text (for non-PDFs or pre-extracted text)
}

export async function extractStartupProfile(
  pitchDeck: FileForExtraction | null,
  dataRoom: FileForExtraction[] = [],
  hints: { startupName?: string; founderEmail?: string } = {},
): Promise<ExtractedProfileFields> {
  const provider = await resolveProvider()
  const docs: FileForExtraction[] = []
  if (pitchDeck) docs.push(pitchDeck)
  for (const d of dataRoom.slice(0, MAX_PDFS_PER_CALL - docs.length)) docs.push(d)
  if (!docs.length) return heuristicFallback(pitchDeck, dataRoom, hints)

  // ─── Cloud-vision path: Anthropic → OpenAI → Gemini.  Reads admin-managed
  // keys from the runtime config (system_settings.ai_router_v1) with env
  // fallback.  Previous version went straight to Anthropic via process.env
  // and silently returned the heuristic fallback when env was unset/stub.
  const visionProvider = await resolveVisionProvider()
  if (provider === "anthropic" || visionProvider !== "none") {
    const files: PdfVisionFile[] = docs.map((d) => ({
      name: d.name,
      contentType: d.contentType,
      base64: d.base64,
      text: d.text,
    }))
    const r = await analyzePdfDocuments(files, buildPrompt(hints), {
      maxTokens: 2000,
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
    const text = await generate(prompt, { maxTokens: 1200, temperature: 0.2, json: true, task: "deck_extract" })
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
  return `You are an investment analyst reading a startup's pitch deck and data room. Extract the following fields as STRICT JSON. Use null/omit when unknown — do NOT guess.

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
  "confidence": <0.0 to 1.0>,
  "notes": "<short note on what was unambiguous vs inferred>"
}

${hints.startupName ? `Hint: company name is "${hints.startupName}".` : ""}
${hints.founderEmail ? `Hint: founder email "${hints.founderEmail}" — derive company domain if useful.` : ""}

Output ONLY the JSON object. No prose, no markdown fences.`
}

function parseJsonFromResponse(text: string): any | null {
  if (!text) return null
  // Strip markdown fences if Claude added them
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // Try to extract first { ... } block
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) {
      try { return JSON.parse(m[0]) } catch { return null }
    }
    return null
  }
}

function normalize(raw: any): ExtractedProfileFields {
  const out: ExtractedProfileFields = {}
  if (typeof raw.name === "string") out.name = raw.name.trim()
  if (typeof raw.oneLiner === "string") out.oneLiner = raw.oneLiner.trim()
  if (typeof raw.description === "string") out.description = raw.description.trim()
  if (Array.isArray(raw.sectors)) out.sectors = raw.sectors.filter((s: any) => typeof s === "string")
  if (typeof raw.primarySector === "string") out.primarySector = raw.primarySector.toLowerCase()
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

// ─── Heuristic fallback (no AI key) ─────────────────────────────────────────
function heuristicFallback(
  pitchDeck: FileForExtraction | null,
  dataRoom: FileForExtraction[],
  hints: { startupName?: string; founderEmail?: string },
): ExtractedProfileFields {
  const fileNames = [pitchDeck?.name, ...dataRoom.map((d) => d.name)].filter(Boolean) as string[]
  const allText = [pitchDeck?.text, ...dataRoom.map((d) => d.text)].filter(Boolean).join("\n").slice(0, 8000)

  // Extract from email domain or filename
  let name = hints.startupName
  if (!name && hints.founderEmail) {
    const domain = hints.founderEmail.split("@")[1]
    if (domain) name = domain.split(".")[0]
  }
  if (!name && pitchDeck?.name) {
    name = pitchDeck.name.replace(/\.(pdf|pptx?|key)$/i, "").replace(/[-_]/g, " ").trim()
  }

  // Light keyword scan for sector
  const sectors: string[] = []
  const sectorMap: [RegExp, string][] = [
    [/\b(ai|artificial intelligence|machine learning|ml)\b/i, "ai/ml"],
    [/\bsaas\b|\benterprise software\b/i, "saas"],
    [/\bfintech\b|\bfinancial\b/i, "fintech"],
    [/\bhealthcare\b|\bhealth tech\b|\bdigital health\b/i, "healthcare"],
    [/\bedtech\b|\beducation\b/i, "edtech"],
    [/\bclimate\b|\bcleantech\b|\bsustainab/i, "climate"],
    [/\bconsumer\b|\bDTC\b|\bD2C\b/i, "consumer"],
    [/\bbiotech\b|\bbio /i, "biotech"],
  ]
  for (const [pat, tag] of sectorMap) {
    if (pat.test(allText) && !sectors.includes(tag)) sectors.push(tag)
  }

  // Crude $ amount extraction for ask
  let askAmount: number | undefined
  const askMatch = allText.match(/\$\s?(\d+(?:\.\d+)?)\s*(M|million|K|thousand)?/i)
  if (askMatch) {
    const n = parseFloat(askMatch[1])
    const unit = (askMatch[2] || "").toLowerCase()
    askAmount = unit.startsWith("k") || unit === "thousand" ? n * 1000 : (unit ? n * 1_000_000 : n)
  }

  // Stage detection
  let stage: StartupStage | undefined
  if (/\bpre-?seed\b/i.test(allText)) stage = "pre-seed"
  else if (/\bseed\b/i.test(allText)) stage = "seed"
  else if (/\bseries\s*a\b/i.test(allText)) stage = "series-a"
  else if (/\bseries\s*b\b/i.test(allText)) stage = "series-b"

  return {
    name,
    sectors: sectors.length ? sectors : undefined,
    primarySector: sectors[0],
    stage,
    askAmount,
    pitchDeckSummary: allText ? `Heuristic: extracted from ${fileNames.length} file(s) without AI.` : undefined,
    confidence: 0.3,
    notes: "AI extraction unavailable (no ANTHROPIC_API_KEY). Heuristic fallback — please review and edit.",
    extractedFrom: fileNames,
  }
}
