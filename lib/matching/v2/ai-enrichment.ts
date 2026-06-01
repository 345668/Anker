/**
 * AI enrichment layer (provider-agnostic).
 *
 * Generates a one-sentence "Why this LP" rationale per top-200 firms +
 * top-200 contacts. Uses whichever provider lib/ai/provider.ts resolves:
 *
 *   - anthropic  →  Claude Haiku 4.5 (cloud)
 *   - ollama     →  local model (default gemma2:2b, ~1.6 GB Metal-accel)
 *   - none       →  rule-based fallback (still produces text, just less varied)
 */

import { generateBatch, isAvailable, providerInfo } from "@/lib/ai/provider"
import type { FundProfileV2, ScoredContactV2, ScoredFirmV2 } from "./types"

const ENRICH_TOP_N = 200

export async function isAiAvailable(): Promise<boolean> {
  return isAvailable()
}

export { providerInfo }

export async function enrichFirmsWithRationales(
  firms: ScoredFirmV2[],
  fund: FundProfileV2,
  onProgress?: (processed: number) => void,
): Promise<{ enriched: number }> {
  const targets = firms.slice(0, ENRICH_TOP_N)
  if (!(await isAvailable()) || targets.length === 0) {
    for (const f of firms) f.whyThisLp = ruleBasedRationaleFirm(f)
    return { enriched: 0 }
  }
  const prompts = targets.map((f) => buildFirmRationalePrompt(f, fund))
  const results = await generateBatch(prompts, { maxTokens: 80, temperature: 0.4, task: "ai_rationale" }, 4, onProgress)
  let enriched = 0
  results.forEach((text, i) => {
    const cleaned = clean1Sentence(text)
    targets[i].whyThisLp = cleaned || ruleBasedRationaleFirm(targets[i])
    if (cleaned) enriched++
  })
  // Tail: rule-based for anything past top-N
  for (const f of firms.slice(ENRICH_TOP_N)) f.whyThisLp = ruleBasedRationaleFirm(f)
  return { enriched }
}

export async function enrichContactsWithRationales(
  contacts: ScoredContactV2[],
  fund: FundProfileV2,
  onProgress?: (processed: number) => void,
): Promise<{ enriched: number }> {
  const targets = contacts.slice(0, ENRICH_TOP_N)
  if (!(await isAvailable()) || targets.length === 0) {
    for (const c of contacts) c.whyThisLp = ruleBasedRationaleContact(c)
    return { enriched: 0 }
  }
  const prompts = targets.map((c) => buildContactRationalePrompt(c, fund))
  const results = await generateBatch(prompts, { maxTokens: 80, temperature: 0.4, task: "ai_rationale" }, 4, onProgress)
  let enriched = 0
  results.forEach((text, i) => {
    const cleaned = clean1Sentence(text)
    targets[i].whyThisLp = cleaned || ruleBasedRationaleContact(targets[i])
    if (cleaned) enriched++
  })
  for (const c of contacts.slice(ENRICH_TOP_N)) c.whyThisLp = ruleBasedRationaleContact(c)
  return { enriched }
}

// ─── Prompts ────────────────────────────────────────────────────────────────
function buildFirmRationalePrompt(f: ScoredFirmV2, fund: FundProfileV2): string {
  return `You are an LP analyst writing one-sentence pipeline rationales.

Fund: ${fund.name}
Fund thesis (sectors): ${fund.sectors.slice(0, 6).join(", ")}
Fund HQ: ${fund.headquartersLocation ?? "unknown"}
Fund target raise: ${fund.targetRaise ? `$${(fund.targetRaise / 1e6).toFixed(0)}M` : "unspecified"}

Prospect firm: ${f.name}
Type: ${f.type}
Location: ${f.location}
AUM: ${f.aumRaw ?? "unknown"}
Sectors: ${f.sectors.slice(0, 6).join(", ") || "n/a"}
Tags: ${f.tags.join(", ") || "none"}

Write ONE sentence (max 25 words) explaining why this firm is a fit as an LP for this fund. Reference at least one of: AUM/anchor capacity, sector overlap, geography, thesis fit. No hedging language. No quotes. Just the sentence.`
}

function buildContactRationalePrompt(ct: ScoredContactV2, fund: FundProfileV2): string {
  return `You are an LP analyst writing one-sentence pipeline rationales.

Fund: ${fund.name}
Fund thesis (sectors): ${fund.sectors.slice(0, 6).join(", ")}
Fund HQ: ${fund.headquartersLocation ?? "unknown"}

Prospect contact: ${ct.name}
Title: ${ct.title ?? "unknown"}
Type: ${ct.type}
Location: ${ct.location}
Email available: ${ct.emailVerified ? "yes" : "no"}
HNW signals: ${ct.hnwSignals.join(", ") || "none"}
Sectors: ${ct.sectors.slice(0, 6).join(", ") || "n/a"}

Write ONE sentence (max 25 words) explaining why this contact is a fit as an LP for this fund. Reference role/title, network, or signal. No hedging. No quotes.`
}

// ─── Rule-based fallback (always wires SOMETHING into whyThisLp) ────────────
function ruleBasedRationaleFirm(f: ScoredFirmV2): string {
  const bits: string[] = []
  if (f.isAnchor) bits.push(`${f.aumRaw ?? "$500M+"} anchor capacity`)
  if (f.tags.includes("SWEET")) bits.push("sweet-spot sector fit")
  else if (f.reasons.find((r) => r.toLowerCase().startsWith("sector"))) bits.push("sector overlap")
  if (f.tags.includes("LOCAL")) bits.push("local")
  if (f.tags.includes("UNI")) bits.push("university research focus")
  if (f.tags.includes("EM")) bits.push("emerging-manager program")
  if (f.tags.includes("STUDIO")) bits.push("venture studio familiarity")
  if (!bits.length) bits.push(`${f.type} matching fund thesis`)
  return capitalize(bits.join("; ")) + "."
}

function ruleBasedRationaleContact(ct: ScoredContactV2): string {
  const bits: string[] = []
  if (ct.tags.includes("FO")) bits.push("family office contact")
  if (ct.hnwSignals.length >= 2) bits.push(`HNW: ${ct.hnwSignals.slice(0, 2).join("/")}`)
  if (ct.tags.includes("LOCAL")) bits.push("local")
  if (ct.emailVerified) bits.push("verified email")
  if (ct.reasons.find((r) => r.toLowerCase().startsWith("sector"))) bits.push("sector fit")
  if (!bits.length) bits.push(ct.title ?? ct.type)
  return capitalize(bits.join("; ")) + "."
}

function capitalize(s: string): string {
  if (!s) return ""
  return s[0].toUpperCase() + s.slice(1)
}

function clean1Sentence(s: string): string {
  if (!s) return ""
  let out = s.replace(/^["'\s]+|["'\s]+$/g, "").replace(/^Sentence:\s*/i, "")
  // Remove leading "Why this LP:" or similar prefixes Ollama sometimes adds
  out = out.replace(/^(why this lp|rationale|answer)[:\-—]\s*/i, "")
  // Take first sentence if multiple
  const dot = out.indexOf(". ")
  if (dot > 0 && dot < 200) out = out.slice(0, dot + 1)
  // Cap at 250 chars
  if (out.length > 250) out = out.slice(0, 247).replace(/\s\S*$/, "") + "…"
  return out
}
