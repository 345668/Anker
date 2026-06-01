/**
 * Layer 2 of the 8fundraising 4-layer outreach loop:
 * **personalized DM generation**, local-first.
 *
 * Inputs (per partner):
 *   - partner name / firm / title
 *   - founder one-liner + 1-3 concrete traction numbers
 *   - the partner's last 3-5 LinkedIn posts (text + timestamp), if known
 *   - "hook" suggestion from the discovery layer (optional)
 *
 * Output: a 4-step sequence following the playbook templates exactly:
 *   - day 0  connection request (≤280 chars, single hook from one specific post)
 *   - day 3  follow-up after accept (one concrete number + calendar link)
 *   - day 7  different-angle DM
 *   - day 14 close-the-loop
 *
 * Hard rules from the playbook (CLAUDE.md):
 *   - Never auto-send. Drafts only.
 *   - One hook per message. Single recent-post reference in the DM.
 *   - Day 0 ≤ 280 chars. Replies later ≤ 320 chars.
 *   - No em dashes. Use commas, colons, periods, or arrows.
 *   - No "I appreciate you taking the time" filler.
 *
 * Provider: Ollama (local) is the default per the user's request to use
 * local models in place of ChatGPT/Perplexity.  Anthropic path is a
 * fallback when the local model isn't loaded.
 */

import { generate, resolveProvider } from "./provider"

export interface PartnerPost {
  text: string
  /** ISO date or "2 days ago" — model uses this to gauge freshness */
  timestamp?: string
  url?: string
}

export interface FounderContext {
  /** Company / fund name doing the outreach */
  companyName: string
  /** One-sentence pitch */
  oneLiner: string
  /** 1-3 concrete numbers (revenue, users, growth, customers).  Each
   *  should read as a complete fact: "€280k MRR from 18 customers". */
  facts: string[]
  /** Optional founder name(s) */
  founderName?: string
  /** Calendar link inserted into day-3 follow-up */
  calendarUrl?: string
  /** Currency override — defaults to USD.  CLAUDE.md example uses EUR. */
  currency?: "USD" | "EUR" | "GBP"
}

export interface PartnerContext {
  firstName: string
  fullName: string
  title?: string
  firm: string
  /** A single recent post the day-0 DM should hook off. */
  primaryPost?: PartnerPost
  /** Up to 5 recent posts so the model can pick a different one for day-7. */
  recentPosts?: PartnerPost[]
  /** Pre-computed hook suggestion from the discovery layer. */
  recommendedHook?: string
}

export interface OutreachSequence {
  /** Day-0 connection request (≤280 chars). */
  day0: string
  /** Day-3 follow-up after accept. */
  day3: string
  /** Day-7 different-angle DM. */
  day7: string
  /** Day-14 close-the-loop. */
  day14: string
  /** Which post the day-0 hook used (so the UI can show the source). */
  day0HookSource?: PartnerPost
  /** Notes on cost / fallbacks. */
  notes?: string
}

const MAX_DAY0 = 280
const MAX_REPLY = 320

export async function generateOutreachSequence(
  founder: FounderContext,
  partner: PartnerContext,
): Promise<OutreachSequence> {
  const provider = await resolveProvider()
  if (provider === "none") {
    return heuristicFallback(founder, partner, "AI provider unavailable. Heuristic templates filled.")
  }

  const prompt = buildPrompt(founder, partner)
  let raw: string
  try {
    raw = await generate(prompt, { maxTokens: 700, temperature: 0.5, json: true, task: "dm_personalize" })
  } catch (e: any) {
    console.error("[dm-personalizer] generate failed:", e?.message)
    return heuristicFallback(founder, partner, `Generation failed (${e?.message ?? "unknown"}). Heuristic fallback.`)
  }

  const parsed = parseJson(raw)
  if (!parsed) {
    return heuristicFallback(founder, partner, "AI output couldn't be parsed. Heuristic fallback.")
  }

  return {
    day0: clamp(parsed.day0 ?? "", MAX_DAY0),
    day3: clamp(parsed.day3 ?? "", MAX_REPLY),
    day7: clamp(parsed.day7 ?? "", MAX_REPLY),
    day14: clamp(parsed.day14 ?? "", MAX_REPLY),
    day0HookSource: partner.primaryPost,
    notes: parsed.notes,
  }
}

/**
 * Generate sequences for many partners in parallel-but-rate-limited.
 * Default concurrency 4 to be friendly to local Ollama on a laptop.
 */
export async function generateOutreachSequencesBatch(
  founder: FounderContext,
  partners: PartnerContext[],
  concurrency = 4,
): Promise<{ partner: PartnerContext; sequence: OutreachSequence }[]> {
  const results: { partner: PartnerContext; sequence: OutreachSequence }[] = []
  let i = 0
  async function worker() {
    while (i < partners.length) {
      const idx = i++
      const p = partners[idx]
      try {
        const sequence = await generateOutreachSequence(founder, p)
        results[idx] = { partner: p, sequence }
      } catch (e: any) {
        results[idx] = {
          partner: p,
          sequence: heuristicFallback(founder, p, `Batch generation failed: ${e?.message ?? "unknown"}.`),
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, partners.length) }, worker))
  return results
}

// ─── prompt + parser ──────────────────────────────────────────────────────
function buildPrompt(founder: FounderContext, partner: PartnerContext): string {
  const post = partner.primaryPost
    ? `MOST RECENT POST by ${partner.firstName}${partner.primaryPost.timestamp ? ` (${partner.primaryPost.timestamp})` : ""}:\n"""\n${partner.primaryPost.text.slice(0, 1200)}\n"""`
    : "NO RECENT POST AVAILABLE — base the day-0 hook on the partner's firm + sector instead."

  const otherPosts = (partner.recentPosts ?? [])
    .filter((p) => p !== partner.primaryPost)
    .slice(0, 4)
    .map((p, i) => `POST ${i + 2}${p.timestamp ? ` (${p.timestamp})` : ""}:\n"""${p.text.slice(0, 800)}"""`)
    .join("\n\n")

  const facts = founder.facts.length
    ? founder.facts.map((f, i) => `  ${i + 1}. ${f}`).join("\n")
    : "  (no concrete numbers supplied — keep day-3 generic but specific to the company)"

  const cal = founder.calendarUrl ? founder.calendarUrl : "[CAL_LINK]"
  const currency = founder.currency ?? "USD"

  return `You are writing a 4-step LinkedIn outreach sequence from ${founder.companyName} to ${partner.fullName}${partner.title ? `, ${partner.title}` : ""} at ${partner.firm}.

FOUNDER CONTEXT
  Company: ${founder.companyName}
  One-liner: ${founder.oneLiner}
  Facts (use one per message, never the same fact twice):
${facts}
  Currency: ${currency}
  Calendar link: ${cal}

PARTNER CONTEXT
  Name: ${partner.fullName} (call them "${partner.firstName}")
  Firm: ${partner.firm}
  Title: ${partner.title ?? "—"}
  ${partner.recommendedHook ? `Suggested hook from discovery layer: "${partner.recommendedHook}"` : ""}

${post}

${otherPosts ? `OLDER POSTS (use one of these for the day-7 different-angle DM):\n\n${otherPosts}` : ""}

HARD RULES (from the playbook — violating any of these voids the message):
  - Day-0 connection request: STRICTLY <=280 characters including spaces.
  - Day-3 / day-7 / day-14 replies: STRICTLY <=320 characters each.
  - Single hook per message. Day-0 references ONE specific recent post.
  - Day-7 must use a DIFFERENT angle from day-0 (different post if possible, or a customer logo / data point).
  - Day-14 is a low-friction "close the loop" message; tone is graceful, not desperate. Reference one of their fund's recent investments or initiatives.
  - NEVER use em dashes (—). Use commas, colons, periods, or arrows ( → ).
  - NEVER write "I appreciate you taking the time" or any other filler phrase.
  - Match the partner's energy. If the post is technical, keep the DM technical.
  - Day-3 must include either the calendar link or a deck offer.

TEMPLATES (follow these structures, adapt the wording):
  Day 0   "[FirstName], your [post topic] thread mirrors what we saw building [Company]. [One-sentence pivot using the hook]. [One concrete number]. [Low-friction ask: 15-min walkthrough / deck / single question]."
  Day 3   "Thanks for connecting, [FirstName]. The reason I reached out: [one-line context]. We are seeing [one concrete metric or signal]. Quick deck attached / [calendar link]. Either works."
  Day 7   "[FirstName], one more data point that might be relevant to your [post topic / thesis]: [one specific customer or metric]. Worth a 15-min call?"
  Day 14  "[FirstName], no worries if this is not a fit right now. Will close the loop on my end. Best of luck on [their fund's recent investment or initiative], that one looked interesting."

Return ONLY this JSON object, no markdown, no commentary:
{
  "day0": "...",
  "day3": "...",
  "day7": "...",
  "day14": "...",
  "notes": "<1-line note on which post you hooked off and why>"
}`
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

function clamp(s: string, max: number): string {
  // Strip em dashes per playbook rule.
  const cleaned = String(s).replace(/—/g, ",").trim()
  if (cleaned.length <= max) return cleaned
  // Truncate at a word boundary to stay under the limit
  const cut = cleaned.slice(0, max - 1).replace(/\s\S*$/, "")
  return cut + "…"
}

// ─── Heuristic fallback (no AI, deterministic templates) ───────────────────
function heuristicFallback(
  f: FounderContext,
  p: PartnerContext,
  notes: string,
): OutreachSequence {
  const fact = f.facts[0] ?? ""
  const fact2 = f.facts[1] ?? f.facts[0] ?? ""
  const cal = f.calendarUrl ?? "[CAL_LINK]"
  const postTopic = p.primaryPost?.text
    ? snippet(p.primaryPost.text, 50)
    : `${p.firm}'s thesis`
  const day0 = clamp(
    `${p.firstName}, your post on ${postTopic} mirrors what we saw building ${f.companyName}. ${f.oneLiner}. ${fact}. Worth a 15-min walkthrough?`,
    MAX_DAY0,
  )
  const day3 = clamp(
    `Thanks for connecting, ${p.firstName}. The reason I reached out: ${f.oneLiner}. We are seeing ${fact}. Quick deck or ${cal}, either works.`,
    MAX_REPLY,
  )
  const day7 = clamp(
    `${p.firstName}, one more data point that might be relevant to your thesis: ${fact2}. Worth a 15-min call?`,
    MAX_REPLY,
  )
  const day14 = clamp(
    `${p.firstName}, no worries if this is not a fit right now. Will close the loop on my end. Best of luck on ${p.firm}'s recent work.`,
    MAX_REPLY,
  )
  return { day0, day3, day7, day14, day0HookSource: p.primaryPost, notes }
}

function snippet(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).replace(/\s\S*$/, "") + "…"
}
