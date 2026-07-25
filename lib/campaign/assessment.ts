/**
 * Conservative investor-readiness gate. Given the extracted startup profile,
 * an LLM scores readiness 0–100 across a fixed rubric and returns a verdict.
 * The gate is deliberately STRICT: we only run outreach when we're confident it
 * will land well, because a weak send burns investor goodwill (our scarcest
 * asset). Below the threshold → decline with specific, constructive feedback and
 * NO investor is ever contacted.
 *
 * Threshold is env-tunable (CAMPAIGN_READINESS_THRESHOLD, default 62). The
 * decision is fully automatic (locked decision, CAMPAIGN_ENGINE_PLAN.md §9).
 */
import { generateDetailed } from "@/lib/ai/provider"
import { extractJsonObject } from "@/lib/ai/json-extract"
import type { ExtractedProfileFields } from "@/lib/matching/v2/founder-types"

export const READINESS_THRESHOLD = Number(process.env.CAMPAIGN_READINESS_THRESHOLD) || 62

export interface ReadinessAssessment {
  score: number // 0–100
  verdict: "proceed" | "decline"
  summary: string
  strengths: string[]
  gaps: string[] // constructive, founder-facing
  usedAi: boolean
}

interface RubricInput {
  startupName: string
  oneLiner?: string | null
  sectors?: string[]
  stage?: string | null
  raiseAmount?: number | null
  extracted: ExtractedProfileFields
  formTraction?: Record<string, any>
  /** Cutoff to apply; falls back to the env default when omitted. */
  threshold?: number
}

function buildPrompt(input: RubricInput): string {
  const e = input.extracted
  return `You are a disciplined pre-seed/seed investment screener for a venture outreach firm.
You decide whether a startup is READY for us to run warm, personalized outreach to investors on its behalf.
Be CONSERVATIVE. We would rather decline a borderline company than send a weak deal to our investor network.

Score 0–100 on this rubric (weight in brackets):
- Team & founder credibility [25]
- Market size & clarity of problem [20]
- Product & differentiation [20]
- Traction / evidence of demand [20]
- Deck completeness & fundraising clarity (ask, use of funds) [15]

Company: ${input.startupName}
One-liner: ${input.oneLiner || e.oneLiner || "(none)"}
Sectors: ${(input.sectors || e.sectors || []).join(", ") || "(unknown)"}
Stage: ${input.stage || e.stage || "(unknown)"}
Raising: ${input.raiseAmount ?? e.askAmount ?? "(unknown)"}
ARR/MRR: ${e.arr ?? "?"} / ${e.mrr ?? "?"}  Growth MoM%: ${e.growthRateMom ?? "?"}  Team size: ${e.teamSize ?? "?"}
Deck summary: ${(e.pitchDeckSummary || "").slice(0, 1200) || "(no deck text extracted)"}
Data-room summary: ${(e.dataRoomSummary || "").slice(0, 600) || "(none)"}
Extraction confidence: ${e.confidence ?? "?"}
Founder-provided details (from the application form — treat these as RELIABLE, first-party evidence, equal to the deck):
${String((input.formTraction as any)?.narrative || "").slice(0, 1500) || "(none provided)"}
Founder-reported numbers: ${JSON.stringify({
    arr: e.arr, mrr: e.mrr, growthMoM: e.growthRateMom, teamSize: e.teamSize,
    marketSize: (input.formTraction as any)?.marketSize,
    businessModel: (input.formTraction as any)?.businessModel,
  }).slice(0, 500)}

Return ONLY JSON:
{
  "score": <int 0-100>,
  "summary": "<one sentence, neutral>",
  "strengths": ["<short>", "..."],
  "gaps": ["<specific, constructive, actionable — what to fix before re-applying>", "..."]
}
IMPORTANT: Score based on the SUBSTANCE across BOTH the deck AND the founder-provided form details. If the deck couldn't be parsed but the founder supplied problem, market, traction, team, and the ask on the form, judge those on their merits — do NOT auto-fail for "no deck text". Only treat a genuine absence of information (deck unreadable AND form fields empty) as a critical gap.`
}

export async function assessReadiness(input: RubricInput): Promise<ReadinessAssessment> {
  const threshold = input.threshold ?? READINESS_THRESHOLD
  const res = await generateDetailed(buildPrompt(input), {
    maxTokens: 900,
    temperature: 0.2,
    json: true,
    task: "campaign_readiness",
  })

  if (res.error || !res.text) {
    // Fail SAFE: no AI signal → do not auto-send. Decline with a generic,
    // honest gap so a human can revisit rather than blasting investors.
    return {
      score: 0,
      verdict: "decline",
      summary: "We couldn't complete an automated assessment of this submission.",
      strengths: [],
      gaps: [
        "We couldn't fully read your deck automatically. Please ensure it's a text-based PDF (not scanned images) with a clear problem, market, team, traction, and the ask.",
      ],
      usedAi: false,
    }
  }

  const parsed = extractJsonObject(res.text, "campaign_readiness") as any
  const score = clampScore(parsed?.score)
  const gaps: string[] = Array.isArray(parsed?.gaps) ? parsed.gaps.filter((g: any) => typeof g === "string").slice(0, 6) : []
  const strengths: string[] = Array.isArray(parsed?.strengths) ? parsed.strengths.filter((s: any) => typeof s === "string").slice(0, 6) : []

  return {
    score,
    verdict: score >= threshold ? "proceed" : "decline",
    summary: typeof parsed?.summary === "string" ? parsed.summary : "",
    strengths,
    gaps: gaps.length ? gaps : ["Sharpen the problem, market, traction, and the ask in your deck."],
    usedAi: true,
  }
}

function clampScore(v: any): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}
