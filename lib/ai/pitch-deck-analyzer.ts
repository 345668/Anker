/**
 * Pitch deck analyzer (provider-agnostic).
 *
 * Scores a deck across 8 standard investor lenses (clarity, problem,
 * solution, market, traction, team, business model, ask), each 0-10,
 * with a 1-2 sentence critique per lens and a list of "missing" items
 * (no team slide, no traction, no ask, etc.).
 *
 * Works with Ollama (text from pdf-parse) or Anthropic (PDF vision).
 */

import { extractPdfText } from "./pdf"
import { generate, resolveProvider } from "./provider"
import { analyzePdfDocuments, type PdfVisionFile } from "./pdf-vision"

export const DECK_DIMENSIONS = [
  { key: "clarity", label: "Clarity & narrative" },
  { key: "problem", label: "Problem framing" },
  { key: "solution", label: "Solution & differentiation" },
  { key: "market", label: "Market size (TAM/SAM/SOM)" },
  { key: "traction", label: "Traction & metrics" },
  { key: "team", label: "Team & founder-market fit" },
  { key: "business_model", label: "Business model & unit economics" },
  { key: "ask", label: "Ask & use of funds" },
] as const

export type DeckDimensionKey = (typeof DECK_DIMENSIONS)[number]["key"]

export interface DeckScores {
  scores: Record<DeckDimensionKey, number>
  comments: Record<DeckDimensionKey, string>
  overall: number // weighted average, 0-100
  grade: "A" | "B" | "C" | "D" | "F"
  missing: string[]
  strengths: string[]
  redFlags: string[]
  suggestedNextSteps: string[]
  notes: string
}

export interface AnalyzeArgs {
  filename: string
  pdfBase64?: string // for anthropic vision path
  pdfBuffer?: Buffer // for ollama path (will be text-extracted)
  preExtractedText?: string // skip PDF parse if already done
}

export async function analyzeDeck(args: AnalyzeArgs): Promise<DeckScores> {
  const provider = await resolveProvider()

  if (args.pdfBase64) {
    // Try cloud vision (Anthropic → OpenAI → Gemini). If none have a
    // usable key, analyzePdfDocuments returns error=null only when text
    // comes back, otherwise we fall through to the text/ollama path.
    const r = await analyzeWithCloudVision(args)
    // Only return early if cloud vision produced something other than the
    // generic failure fallback. The heuristic notes carry the reason.
    if (r.notes && !/^cloud-vision call failed/i.test(r.notes)) return r
    if (provider === "anthropic") return r // no further fallback when env says anthropic
  }

  // Local / fallback path: text-only
  let text = args.preExtractedText
  let pageCount = 0
  let imageOnlyPages = 0
  if (!text && args.pdfBuffer) {
    const parsed = await extractPdfText(args.pdfBuffer)
    text = parsed.text
    pageCount = parsed.pageCount
    imageOnlyPages = parsed.imageOnlyPages
  }
  if (!text) {
    return heuristicScores("No extractable text in this deck. " +
      "Likely an image-heavy deck — try Anthropic provider for vision support.")
  }

  if (provider === "ollama") {
    return analyzeWithOllama(args.filename, text, pageCount, imageOnlyPages)
  }

  // No AI — heuristic
  return heuristicScores("AI provider unavailable. Heuristic scores based on text length only.")
}

// ─── Anthropic path (PDF vision) ────────────────────────────────────────────
// Renamed from analyzeWithAnthropic — now walks Anthropic → OpenAI →
// Gemini, reading keys from the admin-managed router config with env
// fallback. Replaces a direct `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })`
// call that bypassed admin settings and 401'd whenever the env was "stub".
async function analyzeWithCloudVision(args: AnalyzeArgs): Promise<DeckScores> {
  const files: PdfVisionFile[] = []
  if (args.pdfBase64) {
    files.push({ name: args.filename, contentType: "application/pdf", base64: args.pdfBase64 })
  }
  const r = await analyzePdfDocuments(files, BUILD_PROMPT, {
    maxTokens: 1500,
    tag: "pitch-deck-analyzer",
  })
  if (r.error || !r.text) {
    console.error(`[pitch-deck-analyzer] vision failed (provider=${r.provider}): ${r.error}`)
    return heuristicScores(`Cloud-vision call failed: ${r.error ?? "no text"}.`)
  }
  return parseScoreResponse(r.text) ?? heuristicScores("Failed to parse AI response.")
}

// ─── Ollama path (extracted PDF text) ──────────────────────────────────────
async function analyzeWithOllama(
  filename: string,
  text: string,
  pageCount: number,
  imageOnlyPages: number,
): Promise<DeckScores> {
  const prompt =
    BUILD_PROMPT +
    `\n\nDeck filename: ${filename}` +
    `\nPage count: ${pageCount}` +
    `\nImage-only pages (no extractable text): ${imageOnlyPages}` +
    `\n\nDeck text (truncated to first 12,000 chars):\n${text.slice(0, 12000)}`
  const out = await generate(prompt, { maxTokens: 1400, temperature: 0.3, json: true, task: "deck_critique" })
  const parsed = parseScoreResponse(out)
  if (parsed) {
    if (imageOnlyPages > pageCount * 0.4) {
      parsed.notes = (parsed.notes ?? "") +
        ` [Note: ${imageOnlyPages}/${pageCount} pages were image-only — scores may understate visual decks.]`
    }
    return parsed
  }
  return heuristicScores("Local model output couldn't be parsed.")
}

// ─── Prompt + parser ────────────────────────────────────────────────────────
const BUILD_PROMPT = `You are an experienced seed/Series-A investor reviewing a pitch deck.

Score the deck on a strict 0-10 scale across these 8 dimensions:
- clarity: Is the narrative tight? Can you explain the company in one sentence after reading?
- problem: Is the problem real, painful, and specific?
- solution: Is the solution credible and differentiated?
- market: Is TAM/SAM/SOM stated and defensible?
- traction: Are metrics shown? Growth? Revenue? Customers? Logos?
- team: Founder-market fit? Prior wins? Why these people?
- business_model: How do they make money? Margins? Unit economics? Pricing?
- ask: Is the round size, use of funds, and runway clearly stated?

Then provide:
- overall: weighted average rounded to 0-100 (clarity 1.0×, problem 1.2×, solution 1.2×, market 1.0×, traction 1.5×, team 1.3×, business_model 1.0×, ask 0.8× — divided by sum of weights × 10)
- grade: A (≥85), B (70-84), C (55-69), D (40-54), F (<40)
- missing: array of strings — concrete things absent (e.g. "no traction slide", "no ask slide")
- strengths: 2-4 short phrases
- redFlags: 0-3 short phrases
- suggestedNextSteps: 3-5 actionable items the founder should do before sending to investors

Return ONLY a JSON object exactly like:
{
  "scores": { "clarity": 0, "problem": 0, "solution": 0, "market": 0, "traction": 0, "team": 0, "business_model": 0, "ask": 0 },
  "comments": { "clarity": "", "problem": "", "solution": "", "market": "", "traction": "", "team": "", "business_model": "", "ask": "" },
  "overall": 0,
  "grade": "A|B|C|D|F",
  "missing": [],
  "strengths": [],
  "redFlags": [],
  "suggestedNextSteps": [],
  "notes": ""
}

No markdown, no commentary outside the JSON.`

function parseScoreResponse(raw: string): DeckScores | null {
  if (!raw) return null
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  try {
    return normalize(JSON.parse(cleaned))
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) {
      try { return normalize(JSON.parse(m[0])) } catch { return null }
    }
    return null
  }
}

function normalize(raw: any): DeckScores {
  const scores: any = {}
  const comments: any = {}
  for (const d of DECK_DIMENSIONS) {
    const s = Number(raw?.scores?.[d.key])
    scores[d.key] = Number.isFinite(s) ? Math.max(0, Math.min(10, s)) : 0
    comments[d.key] = typeof raw?.comments?.[d.key] === "string" ? raw.comments[d.key] : ""
  }
  let overall = Number(raw?.overall)
  if (!Number.isFinite(overall)) {
    const w: Record<string, number> = {
      clarity: 1.0, problem: 1.2, solution: 1.2, market: 1.0,
      traction: 1.5, team: 1.3, business_model: 1.0, ask: 0.8,
    }
    const wsum = Object.values(w).reduce((a, b) => a + b, 0)
    overall = Math.round(
      (Object.entries(scores).reduce((s, [k, v]) => s + (w[k] ?? 1) * (v as number), 0) /
        (wsum * 10)) * 100,
    )
  }
  let grade: DeckScores["grade"]
  if (overall >= 85) grade = "A"
  else if (overall >= 70) grade = "B"
  else if (overall >= 55) grade = "C"
  else if (overall >= 40) grade = "D"
  else grade = "F"

  return {
    scores,
    comments,
    overall: Math.max(0, Math.min(100, Math.round(overall))),
    grade: typeof raw?.grade === "string" && /^[A-F]$/.test(raw.grade) ? raw.grade : grade,
    missing: Array.isArray(raw?.missing) ? raw.missing.filter((s: any) => typeof s === "string") : [],
    strengths: Array.isArray(raw?.strengths) ? raw.strengths.filter((s: any) => typeof s === "string") : [],
    redFlags: Array.isArray(raw?.redFlags) ? raw.redFlags.filter((s: any) => typeof s === "string") : [],
    suggestedNextSteps: Array.isArray(raw?.suggestedNextSteps) ? raw.suggestedNextSteps.filter((s: any) => typeof s === "string") : [],
    notes: typeof raw?.notes === "string" ? raw.notes : "",
  }
}

function heuristicScores(notes: string): DeckScores {
  const dims = Object.fromEntries(DECK_DIMENSIONS.map((d) => [d.key, 0])) as DeckScores["scores"]
  const cmts = Object.fromEntries(DECK_DIMENSIONS.map((d) => [d.key, ""])) as DeckScores["comments"]
  return {
    scores: dims, comments: cmts, overall: 0, grade: "F",
    missing: [], strengths: [], redFlags: [], suggestedNextSteps: [],
    notes,
  }
}
