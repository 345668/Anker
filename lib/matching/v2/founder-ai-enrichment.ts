/**
 * AI rationales for founder → investor matching.
 *
 * founder-engine.ts has advertised "AI rationales" in its header since it was
 * written, and reported `aiEnrichmentsApplied: 0` as a literal rather than a
 * count, because there was no enrichment to count. The LP direction has had
 * this since v2 and defaults to on; the founder direction accepted an
 * `enableAi` option through the same shared schema and silently dropped it.
 *
 * The LP module cannot be reused directly: it is typed to ScoredFirmV2 /
 * FundProfileV2 and writes `whyThisLp`. This is the same shape pointed the
 * other way — a startup looking at investors, writing `whyMatch`.
 *
 * Same guarantees as the LP path, which matter more than the feature:
 *   - only the top N are enriched, because `ai_rationale` runs per result and
 *     a large run would otherwise make hundreds of model calls;
 *   - every failure, including a provider being absent entirely, falls back to
 *     the deterministic sentence rather than leaving a result blank;
 *   - the tail past N is deterministic by design, not by accident.
 */

import { generateBatch, isAvailable } from "@/lib/ai/provider"
import type { ScoredInvestorEntity, StartupProfile } from "./founder-types"

/** Enriched prefix. Matches the LP module — the cost is per result, and the
 *  results past this point are rarely read. */
const ENRICH_TOP_N = 25

const money = (n: number | null | undefined) =>
  n == null ? "unspecified" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`

function buildInvestorRationalePrompt(e: ScoredInvestorEntity, s: StartupProfile): string {
  return `You are an analyst advising a founder on which investors to approach.

Startup: ${s.name}
Stage: ${s.stage}
Sectors: ${s.sectors.slice(0, 6).join(", ") || "n/a"}
Location: ${s.location ?? "unknown"}
Raising: ${money(s.askAmount)}
Ideal check from one investor: ${money(s.checkSizeIdealMin)}–${money(s.checkSizeIdealMax)}

Investor: ${e.name}
Type: ${e.type}
Location: ${e.location}
Sectors: ${e.sectors.slice(0, 6).join(", ") || "n/a"}

Write ONE sentence (max 25 words) explaining why this investor is worth approaching for this round. Reference at least one of: stage fit, check size, sector thesis, geography. No hedging language. No quotes. Just the sentence.`
}

/** One sentence, no quotes, no preamble — the model is asked for this and does
 *  not always comply. */
function clean1Sentence(s: string): string {
  const text = String(s || "").trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, " ")
  if (!text) return ""
  const firstStop = text.search(/[.!?](\s|$)/)
  const sentence = firstStop === -1 ? text : text.slice(0, firstStop + 1)
  return sentence.length > 300 ? "" : sentence
}

/**
 * Fill `whyMatch` with a model-written sentence for the top N, deterministic
 * for the rest.
 *
 * @param fallback the deterministic sentence for an entity, used whenever the
 *   model is unavailable, fails, or returns something unusable. Passed in so
 *   this module does not duplicate the engine's rule-based wording.
 * @returns how many rationales the model actually produced — a count, not a
 *   constant.
 */
export async function enrichInvestorsWithRationales(
  entities: ScoredInvestorEntity[],
  startup: StartupProfile,
  fallback: (e: ScoredInvestorEntity) => string,
  onProgress?: (processed: number) => void,
): Promise<{ enriched: number }> {
  const targets = entities.slice(0, ENRICH_TOP_N)
  // No provider configured is the ordinary case for a self-hosted install, not
  // an error, and it must cost nothing.
  if (targets.length === 0 || !(await isAvailable().catch(() => false))) {
    for (const e of entities) e.whyMatch = fallback(e)
    return { enriched: 0 }
  }

  const prompts = targets.map((e) => buildInvestorRationalePrompt(e, startup))
  const results = await generateBatch(
    prompts,
    { maxTokens: 80, temperature: 0.4, task: "ai_rationale" },
    4,
    onProgress,
  ).catch(() => prompts.map(() => ""))

  let enriched = 0
  results.forEach((text, i) => {
    const cleaned = clean1Sentence(text)
    targets[i].whyMatch = cleaned || fallback(targets[i])
    if (cleaned) enriched++
  })
  for (const e of entities.slice(ENRICH_TOP_N)) e.whyMatch = fallback(e)
  return { enriched }
}

export { ENRICH_TOP_N, clean1Sentence, buildInvestorRationalePrompt }
