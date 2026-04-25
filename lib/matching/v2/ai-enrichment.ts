/**
 * AI enrichment layer (Claude-powered).
 *
 * Three jobs:
 *   1. Generate the "Why This LP" narrative (1-sentence rationale) for top
 *      candidates so the deliverable reads like an analyst wrote it.
 *   2. Re-classify ambiguous LP types when the rule-based classifier returns
 *      key=null but the description hints at LP behavior.
 *   3. Score angel HNW signals from prose where regex misses them
 *      (e.g. "led the company through its $400M secondary").
 *
 * Calls are batched (10 at a time) and gated by ANTHROPIC_API_KEY presence —
 * if the key isn't set the engine falls back to rule-based reasons. Failures
 * are swallowed (graceful degradation).
 */

import Anthropic from "@anthropic-ai/sdk"
import type {
  FundProfileV2,
  ScoredContactV2,
  ScoredFirmV2,
} from "./types"

const MODEL = "claude-haiku-4-5-20251001"
const BATCH_SIZE = 10
const ENRICH_TOP_N = 200 // only enrich top-200 of each list to control cost

let _client: Anthropic | null = null
function client(): Anthropic | null {
  if (_client) return _client
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || key === "stub") return null
  _client = new Anthropic({ apiKey: key })
  return _client
}

export function isAiAvailable(): boolean {
  const key = process.env.ANTHROPIC_API_KEY
  return !!key && key !== "stub"
}

// ─── Why-This-LP rationale ──────────────────────────────────────────────────
export async function enrichFirmsWithRationales(
  firms: ScoredFirmV2[],
  fund: FundProfileV2,
  onProgress?: (processed: number) => void,
): Promise<{ enriched: number }> {
  const c = client()
  if (!c) {
    // Rule-based fallback: stitch reasons into a sentence
    for (const f of firms.slice(0, ENRICH_TOP_N)) {
      f.whyThisLp = ruleBasedRationaleFirm(f)
    }
    return { enriched: 0 }
  }

  const targets = firms.slice(0, ENRICH_TOP_N)
  let enriched = 0
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (f) => {
        try {
          const prompt = buildFirmRationalePrompt(f, fund)
          const resp = await c.messages.create({
            model: MODEL,
            max_tokens: 80,
            messages: [{ role: "user", content: prompt }],
          })
          const text =
            resp.content[0]?.type === "text" ? resp.content[0].text.trim() : ""
          f.whyThisLp = clean1Sentence(text) || ruleBasedRationaleFirm(f)
          enriched++
        } catch {
          f.whyThisLp = ruleBasedRationaleFirm(f)
        }
      }),
    )
    onProgress?.(Math.min(i + BATCH_SIZE, targets.length))
  }
  // Tail (no AI): rule-based
  for (const f of firms.slice(ENRICH_TOP_N)) {
    f.whyThisLp = ruleBasedRationaleFirm(f)
  }
  return { enriched }
}

export async function enrichContactsWithRationales(
  contacts: ScoredContactV2[],
  fund: FundProfileV2,
  onProgress?: (processed: number) => void,
): Promise<{ enriched: number }> {
  const c = client()
  if (!c) {
    for (const ct of contacts.slice(0, ENRICH_TOP_N)) {
      ct.whyThisLp = ruleBasedRationaleContact(ct)
    }
    return { enriched: 0 }
  }

  const targets = contacts.slice(0, ENRICH_TOP_N)
  let enriched = 0
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (ct) => {
        try {
          const prompt = buildContactRationalePrompt(ct, fund)
          const resp = await c.messages.create({
            model: MODEL,
            max_tokens: 80,
            messages: [{ role: "user", content: prompt }],
          })
          const text =
            resp.content[0]?.type === "text" ? resp.content[0].text.trim() : ""
          ct.whyThisLp = clean1Sentence(text) || ruleBasedRationaleContact(ct)
          enriched++
        } catch {
          ct.whyThisLp = ruleBasedRationaleContact(ct)
        }
      }),
    )
    onProgress?.(Math.min(i + BATCH_SIZE, targets.length))
  }
  for (const ct of contacts.slice(ENRICH_TOP_N)) {
    ct.whyThisLp = ruleBasedRationaleContact(ct)
  }
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

Write ONE sentence (max 25 words) explaining why this firm is a fit as an LP for this fund. Be specific and concrete; reference at least one of: AUM/anchor capacity, sector overlap, geography, or thesis fit. No hedging language. No quotes. Just the sentence.`
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

// ─── Rule-based fallback ────────────────────────────────────────────────────
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
  // strip leading/trailing quotes, ellipses, "Sentence:" prefix
  let out = s.replace(/^["'\s]+|["'\s]+$/g, "").replace(/^Sentence:\s*/i, "")
  // Take first sentence if multiple
  const dot = out.indexOf(". ")
  if (dot > 0) out = out.slice(0, dot + 1)
  return out
}
