/**
 * Fund-deck analyzer (provider-agnostic).
 *
 * Mirror of `pitch-deck-analyzer.ts`, but the LENS is an LP reading a VC
 * fund's pitch deck — not an investor reading a startup deck.  Scores
 * across six dimensions tuned for emerging GPs (Fund I-IV):
 *
 *   1. gp_background          – team prior wins, founder-mode, network
 *   2. sector_focus           – clarity + edge inside the chosen sectors
 *   3. market_analysis        – TAM, structural shifts, evidence quality
 *   4. thesis_vs_trends       – does the thesis match where capital is
 *                                 actually flowing? Is timing right?
 *   5. unit_economics_check   – do the portfolio-level / fund-level
 *                                 economics make sense? Mgmt fee / carry,
 *                                 reserve ratio, expected MOIC math
 *   6. claims_verification    – which factual claims are independently
 *                                 verifiable vs unverifiable; flag anything
 *                                 that sounds inflated or contradicts
 *                                 publicly known data
 *
 * Each dimension scored 0-10 with a short critique.  Then overall (0-100,
 * weighted), grade A-F, missing items, GP strengths, red flags, and a
 * structured list of LP objections an analyst would raise on first call.
 */

import Anthropic from "@anthropic-ai/sdk"
import { extractPdfText } from "./pdf"
import { generate, resolveProvider } from "./provider"

export const FUND_DECK_DIMENSIONS = [
  { key: "gp_background", label: "GP background & team" },
  { key: "sector_focus", label: "Sector focus & edge" },
  { key: "market_analysis", label: "Market analysis quality" },
  { key: "thesis_vs_trends", label: "Thesis vs. market trends" },
  { key: "unit_economics_check", label: "Fund / portfolio unit economics" },
  { key: "claims_verification", label: "Claims & track-record verifiability" },
] as const

export type FundDeckDimensionKey = (typeof FUND_DECK_DIMENSIONS)[number]["key"]

/** A single factual claim found in the deck, with verifiability assessment. */
export interface ClaimCheck {
  claim: string
  category: "track_record" | "market_size" | "team_credential" | "portfolio_outcome" | "thesis_evidence" | "other"
  verifiable: "public" | "private_audit" | "unverifiable"
  /** plausible | suspicious | contradicted */
  status: "plausible" | "suspicious" | "contradicted"
  comment: string
}

export interface FundDeckScores {
  scores: Record<FundDeckDimensionKey, number>
  comments: Record<FundDeckDimensionKey, string>
  overall: number
  grade: "A" | "B" | "C" | "D" | "F"
  missing: string[]          // what's not in the deck that LPs will ask for
  strengths: string[]        // 2-4 short phrases
  redFlags: string[]         // 0-4 short phrases
  lpObjections: string[]     // 3-6 questions an LP analyst would raise
  claimsReviewed: ClaimCheck[]
  thesisAlignment: string    // 1-2 sentences on whether thesis lines up
                             // with current capital-flow / exit trends
  notes: string
  /** True when scoring used the emerging-manager calibration (Fund I-IV). */
  emergingManagerLens: boolean
}

export interface AnalyzeFundDeckArgs {
  filename: string
  pdfBase64?: string
  pdfBuffer?: Buffer
  preExtractedText?: string
  /** When true, scoring weights GP-background less harshly and gives more
   *  weight to thesis + sector edge. Default true for Fund I-IV.  */
  emergingManager?: boolean
  /** Optional context — fund name, vehicle, target raise. Helps the model
   *  ground the analysis. */
  context?: {
    name?: string
    vehicle?: string
    fundNumber?: number
    targetRaise?: number
    sectors?: string[]
  }
}

const ANTHROPIC_MODEL = "claude-sonnet-4-6"

export async function analyzeFundDeck(args: AnalyzeFundDeckArgs): Promise<FundDeckScores> {
  const provider = await resolveProvider()
  // Default lens: emerging-manager when fundNumber is unset, 0, or <= 4.
  // Caller can override explicitly via args.emergingManager.
  const emergingManager =
    args.emergingManager !== undefined
      ? args.emergingManager
      : !args.context?.fundNumber || (args.context?.fundNumber ?? 1) <= 4

  if (provider === "anthropic" && args.pdfBase64) {
    return analyzeWithAnthropic(args, emergingManager)
  }

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
    return heuristicScores(
      "No extractable text in this deck. Likely image-heavy — try Anthropic provider for vision support.",
      emergingManager,
    )
  }

  if (provider === "ollama") {
    return analyzeWithOllama(args.filename, text, pageCount, imageOnlyPages, emergingManager, args.context)
  }

  return heuristicScores("AI provider unavailable. Heuristic scores based on text length only.", emergingManager)
}

// ─── Anthropic path (PDF vision) ────────────────────────────────────────────
async function analyzeWithAnthropic(
  args: AnalyzeFundDeckArgs,
  emergingManager: boolean,
): Promise<FundDeckScores> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  try {
    const resp = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: args.pdfBase64! },
              title: args.filename,
            } as any,
            { type: "text", text: buildPrompt(emergingManager, args.context) },
          ],
        },
      ],
    })
    const text = resp.content[0]?.type === "text" ? resp.content[0].text : ""
    return parseScoreResponse(text, emergingManager) ??
      heuristicScores("Failed to parse AI response.", emergingManager)
  } catch (e) {
    console.error("[fund-deck-analyzer/anthropic] error:", (e as Error).message)
    return heuristicScores("Anthropic call failed.", emergingManager)
  }
}

// ─── Ollama path (extracted PDF text) ──────────────────────────────────────
async function analyzeWithOllama(
  filename: string,
  text: string,
  pageCount: number,
  imageOnlyPages: number,
  emergingManager: boolean,
  context?: AnalyzeFundDeckArgs["context"],
): Promise<FundDeckScores> {
  const prompt =
    buildPrompt(emergingManager, context) +
    `\n\nDeck filename: ${filename}` +
    `\nPage count: ${pageCount}` +
    `\nImage-only pages (no extractable text): ${imageOnlyPages}` +
    `\n\nDeck text (truncated to first 14,000 chars):\n${text.slice(0, 14000)}`
  const out = await generate(prompt, { maxTokens: 2200, temperature: 0.3, json: true, task: "fund_critique" })
  const parsed = parseScoreResponse(out, emergingManager)
  if (parsed) {
    if (imageOnlyPages > pageCount * 0.4) {
      parsed.notes =
        (parsed.notes ?? "") +
        ` [Note: ${imageOnlyPages}/${pageCount} pages were image-only — scores may understate visual decks.]`
    }
    return parsed
  }
  return heuristicScores("Local model output couldn't be parsed.", emergingManager)
}

// ─── Prompt + parser ────────────────────────────────────────────────────────
function buildPrompt(emergingManager: boolean, context?: AnalyzeFundDeckArgs["context"]): string {
  const lensNote = emergingManager
    ? "Apply the EMERGING-MANAGER lens (Fund I-IV). Calibrate gp_background generously — solo GPs and first-time funds rarely show institutional track records. Weight sector_focus, thesis_vs_trends and unit_economics_check more heavily. Penalise unverifiable claims more strictly."
    : "Apply the ESTABLISHED-MANAGER lens (Fund V+). Expect institutional reporting (DPI, TVPI, MOIC, IRR by vintage), audited LP letters, and named LPs. Penalise missing performance disclosure heavily."

  const ctx = context
    ? `Context provided by the user (use this to ground your analysis but verify against the deck): ${JSON.stringify(context)}.`
    : ""

  return `You are a senior LP analyst at a fund-of-funds reviewing a venture-capital fund's pitch deck. ${ctx} ${lensNote}

Score the deck on a strict 0-10 scale across these 6 dimensions:

1. gp_background: Track record, prior fund performance (DPI / TVPI / IRR / MOIC), notable exits, founder-network signal, founder-mode vs. analyst-mode, GP team cohesion. Where they're emerging, weight operating background, references, prior angel investments, and named portfolio companies.
2. sector_focus: Is the sector focus crisp? Do the GPs have proprietary edge in those sectors (operator background, deep network, technical depth)? Or is this a generalist fund pretending to specialise?
3. market_analysis: Quality of TAM / SAM / SOM. Are the structural shifts named (e.g. AI-native software, energy transition, defense onshoring)? Cited evidence vs. handwaving? Counter-positioning vs. incumbents?
4. thesis_vs_trends: Does the investment thesis line up with where capital and exits are actually flowing in 2025-2026? Is the timing window right? Is the thesis defensible against the obvious counter-thesis?
5. unit_economics_check: Do the FUND economics work? Mgmt fee rate, carry, hurdle, fund size, average check, expected ownership %, reserve ratio, expected number of investments, expected MOIC and the math behind it. Sanity-check: e.g. a $50M fund with $1M average check needs 50 investments, not 15.
6. claims_verification: Walk through the deck's factual claims (track record metrics, market sizes, team credentials, portfolio outcomes). For each, decide if it's publicly verifiable, requires private audit, or unverifiable. Flag anything that sounds inflated, contradicts publicly known data, or relies on selective baselines (cherry-picked vintages, paper markups, undisclosed co-investors).

Then provide:
- overall: weighted average rounded to 0-100. Weights:
    ${emergingManager
      ? "gp_background 1.0×, sector_focus 1.4×, market_analysis 1.1×, thesis_vs_trends 1.5×, unit_economics_check 1.2×, claims_verification 1.4× (sum 7.6)"
      : "gp_background 1.5×, sector_focus 1.0×, market_analysis 1.0×, thesis_vs_trends 1.2×, unit_economics_check 1.2×, claims_verification 1.5× (sum 7.4)"}
  Compute as (sum(weight × score) / (sum_of_weights × 10)) × 100.
- grade: A (≥85), B (70-84), C (55-69), D (40-54), F (<40)
- missing: array of strings — concrete things absent that LPs will ask for (e.g. "no DDQ section on portfolio construction", "no fund model showing reserve strategy", "no named anchor LP", "no GP commit %")
- strengths: 2-4 short phrases capturing what's compelling
- redFlags: 0-4 short phrases — anything an LP committee would object to
- lpObjections: 3-6 specific questions an LP analyst would ask on the first call (be sharp; these should be the questions that actually decide the meeting)
- claimsReviewed: an ARRAY of objects, each:
    { "claim": "<the exact phrase or paraphrase from the deck>",
      "category": "track_record" | "market_size" | "team_credential" | "portfolio_outcome" | "thesis_evidence" | "other",
      "verifiable": "public" | "private_audit" | "unverifiable",
      "status": "plausible" | "suspicious" | "contradicted",
      "comment": "<1 sentence — what makes this plausible / suspicious / contradicted>" }
  Aim for 4-10 of the most important claims.
- thesisAlignment: 1-2 sentences on whether the thesis aligns with current 2025-2026 capital flows and exit trends
- notes: short overall note

Return ONLY a JSON object:
{
  "scores": { "gp_background": 0, "sector_focus": 0, "market_analysis": 0, "thesis_vs_trends": 0, "unit_economics_check": 0, "claims_verification": 0 },
  "comments": { "gp_background": "", "sector_focus": "", "market_analysis": "", "thesis_vs_trends": "", "unit_economics_check": "", "claims_verification": "" },
  "overall": 0,
  "grade": "A|B|C|D|F",
  "missing": [],
  "strengths": [],
  "redFlags": [],
  "lpObjections": [],
  "claimsReviewed": [],
  "thesisAlignment": "",
  "notes": ""
}

No markdown, no commentary outside the JSON.`
}

function parseScoreResponse(raw: string, emergingManager: boolean): FundDeckScores | null {
  if (!raw) return null
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  try {
    return normalize(JSON.parse(cleaned), emergingManager)
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return normalize(JSON.parse(m[0]), emergingManager)
      } catch {
        return null
      }
    }
    return null
  }
}

function normalize(raw: any, emergingManager: boolean): FundDeckScores {
  const scores: any = {}
  const comments: any = {}
  for (const d of FUND_DECK_DIMENSIONS) {
    const s = Number(raw?.scores?.[d.key])
    scores[d.key] = Number.isFinite(s) ? Math.max(0, Math.min(10, s)) : 0
    comments[d.key] = typeof raw?.comments?.[d.key] === "string" ? raw.comments[d.key] : ""
  }
  let overall = Number(raw?.overall)
  if (!Number.isFinite(overall)) {
    const w: Record<FundDeckDimensionKey, number> = emergingManager
      ? { gp_background: 1.0, sector_focus: 1.4, market_analysis: 1.1, thesis_vs_trends: 1.5, unit_economics_check: 1.2, claims_verification: 1.4 }
      : { gp_background: 1.5, sector_focus: 1.0, market_analysis: 1.0, thesis_vs_trends: 1.2, unit_economics_check: 1.2, claims_verification: 1.5 }
    const wsum = Object.values(w).reduce((a, b) => a + b, 0)
    overall = Math.round(
      (Object.entries(scores).reduce((sum, [k, v]) => sum + (w[k as FundDeckDimensionKey] ?? 1) * (v as number), 0) /
        (wsum * 10)) * 100,
    )
  }
  let grade: FundDeckScores["grade"]
  if (overall >= 85) grade = "A"
  else if (overall >= 70) grade = "B"
  else if (overall >= 55) grade = "C"
  else if (overall >= 40) grade = "D"
  else grade = "F"

  const claims: ClaimCheck[] = Array.isArray(raw?.claimsReviewed)
    ? raw.claimsReviewed
        .filter((c: any) => c && typeof c.claim === "string")
        .map((c: any) => ({
          claim: String(c.claim),
          category: validateCategory(c.category),
          verifiable: validateVerifiable(c.verifiable),
          status: validateStatus(c.status),
          comment: typeof c.comment === "string" ? c.comment : "",
        }))
    : []

  return {
    scores,
    comments,
    overall: Math.max(0, Math.min(100, Math.round(overall))),
    grade: typeof raw?.grade === "string" && /^[A-F]$/.test(raw.grade) ? (raw.grade as any) : grade,
    missing: Array.isArray(raw?.missing) ? raw.missing.filter((s: any) => typeof s === "string") : [],
    strengths: Array.isArray(raw?.strengths) ? raw.strengths.filter((s: any) => typeof s === "string") : [],
    redFlags: Array.isArray(raw?.redFlags) ? raw.redFlags.filter((s: any) => typeof s === "string") : [],
    lpObjections: Array.isArray(raw?.lpObjections) ? raw.lpObjections.filter((s: any) => typeof s === "string") : [],
    claimsReviewed: claims,
    thesisAlignment: typeof raw?.thesisAlignment === "string" ? raw.thesisAlignment : "",
    notes: typeof raw?.notes === "string" ? raw.notes : "",
    emergingManagerLens: emergingManager,
  }
}

function validateCategory(c: any): ClaimCheck["category"] {
  const ok: ClaimCheck["category"][] = ["track_record", "market_size", "team_credential", "portfolio_outcome", "thesis_evidence", "other"]
  return (ok as string[]).includes(c) ? (c as ClaimCheck["category"]) : "other"
}
function validateVerifiable(v: any): ClaimCheck["verifiable"] {
  const ok: ClaimCheck["verifiable"][] = ["public", "private_audit", "unverifiable"]
  return (ok as string[]).includes(v) ? (v as ClaimCheck["verifiable"]) : "unverifiable"
}
function validateStatus(s: any): ClaimCheck["status"] {
  const ok: ClaimCheck["status"][] = ["plausible", "suspicious", "contradicted"]
  return (ok as string[]).includes(s) ? (s as ClaimCheck["status"]) : "plausible"
}

function heuristicScores(notes: string, emergingManager: boolean): FundDeckScores {
  const dims = Object.fromEntries(FUND_DECK_DIMENSIONS.map((d) => [d.key, 0])) as FundDeckScores["scores"]
  const cmts = Object.fromEntries(FUND_DECK_DIMENSIONS.map((d) => [d.key, ""])) as FundDeckScores["comments"]
  return {
    scores: dims,
    comments: cmts,
    overall: 0,
    grade: "F",
    missing: [],
    strengths: [],
    redFlags: [],
    lpObjections: [],
    claimsReviewed: [],
    thesisAlignment: "",
    notes,
    emergingManagerLens: emergingManager,
  }
}

// ─── Markdown report builder for docx export ───────────────────────────────
export function fundDeckScoresToMarkdown(
  s: FundDeckScores,
  meta: { fundName?: string; filename?: string; vehicle?: string },
): string {
  const lines: string[] = []
  const title = meta.fundName ? `${meta.fundName} — LP Analyst Deck Review` : "LP Analyst Deck Review"
  lines.push(`# ${title}`)
  if (meta.filename) lines.push(`*Source: ${meta.filename}*`)
  if (meta.vehicle) lines.push(`*Vehicle: ${meta.vehicle}*`)
  lines.push("")
  lines.push(`**Overall: ${s.overall}/100 · Grade ${s.grade}** ` +
    `(${s.emergingManagerLens ? "emerging-manager lens" : "established-manager lens"})`)
  lines.push("")

  lines.push("## Dimension scores")
  lines.push("")
  lines.push("| Dimension | Score | Comment |")
  lines.push("| --- | ---: | --- |")
  for (const d of FUND_DECK_DIMENSIONS) {
    const sc = s.scores[d.key]
    const c = (s.comments[d.key] ?? "").replace(/\|/g, "\\|")
    lines.push(`| ${d.label} | ${sc}/10 | ${c} |`)
  }
  lines.push("")

  if (s.thesisAlignment) {
    lines.push("## Thesis vs. market trends")
    lines.push(s.thesisAlignment)
    lines.push("")
  }

  if (s.strengths.length) {
    lines.push("## Strengths")
    for (const x of s.strengths) lines.push(`- ${x}`)
    lines.push("")
  }
  if (s.redFlags.length) {
    lines.push("## Red flags")
    for (const x of s.redFlags) lines.push(`- ${x}`)
    lines.push("")
  }
  if (s.missing.length) {
    lines.push("## What's missing — LPs will ask")
    for (const x of s.missing) lines.push(`- ${x}`)
    lines.push("")
  }
  if (s.lpObjections.length) {
    lines.push("## Likely first-call LP objections")
    for (const x of s.lpObjections) lines.push(`- ${x}`)
    lines.push("")
  }

  if (s.claimsReviewed.length) {
    lines.push("## Claims review")
    lines.push("")
    lines.push("| Claim | Category | Verifiable | Status | Comment |")
    lines.push("| --- | --- | --- | --- | --- |")
    for (const c of s.claimsReviewed) {
      const claim = c.claim.replace(/\|/g, "\\|").slice(0, 220)
      const comment = c.comment.replace(/\|/g, "\\|").slice(0, 220)
      lines.push(`| ${claim} | ${c.category} | ${c.verifiable} | ${c.status} | ${comment} |`)
    }
    lines.push("")
  }

  if (s.notes) {
    lines.push("## Notes")
    lines.push(s.notes)
  }

  return lines.join("\n")
}
