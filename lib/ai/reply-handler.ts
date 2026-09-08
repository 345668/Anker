/**
 * Layer 4 of the 8fundraising loop: **reply classifier + draft responder.**
 *
 * Inputs:
 *   - the partner's reply text
 *   - the original DM we sent (for context)
 *   - founder context (one-liner, facts, calendar link)
 *   - partner context (firm, title)
 *
 * Output:
 *   - classification: INTERESTED / INTERESTED_LATER / WRONG_FIT / WRONG_NOW / QUESTION
 *   - a single draft response under 320 chars
 *   - a recommended next stage transition for crm_entries
 *
 * The classifier deliberately mirrors the playbook prompt in
 * Section 6 of "Fundraising MCPs (Claude, ChatGPT, & Perplexity)".
 *
 * Local-first: routes through `lib/ai/provider.ts` so the same code path
 * works against Ollama (default) or Anthropic.
 */

import { generate, resolveProvider } from "./provider"

export type ReplyClass =
  | "INTERESTED"
  | "INTERESTED_LATER"
  | "WRONG_FIT"
  | "WRONG_NOW"
  | "QUESTION"

const ALL_CLASSES: ReplyClass[] = [
  "INTERESTED",
  "INTERESTED_LATER",
  "WRONG_FIT",
  "WRONG_NOW",
  "QUESTION",
]

/** Map a reply class to a recommended crm_entries.stage transition. */
export const STAGE_FOR_CLASS: Record<ReplyClass, string> = {
  INTERESTED: "meeting",        // booked / about to book
  INTERESTED_LATER: "responded", // keep them in the funnel for re-engagement
  WRONG_FIT: "passed",
  WRONG_NOW: "responded",
  QUESTION: "responded",
}

/** Optional re-engagement queue offset (days) for INTERESTED_LATER / WRONG_NOW. */
export const REENGAGE_OFFSET_DAYS: Partial<Record<ReplyClass, number>> = {
  INTERESTED_LATER: 90,
  WRONG_NOW: 120,
}

export interface ReplyContext {
  partnerName: string
  partnerFirm: string
  partnerTitle?: string
  ourOriginalDm: string
  theirReply: string
  founder: {
    companyName: string
    oneLiner: string
    facts: string[]
    calendarUrl?: string
  }
}

export interface ClassifiedReply {
  classification: ReplyClass
  /** Single draft response under 320 chars. */
  draft: string
  /** Recommended next crm stage. */
  recommendedStage: string
  /** Optional re-engagement date if class is *_LATER. ISO date. */
  reengageOnIso?: string
  /** Notes on what the model did. */
  notes?: string
  /** True when this draft is a booking ask (classification === INTERESTED). */
  isScheduling: boolean
  /** How the booking ask is made: a calendar link when the founder set one,
   *  otherwise a propose-times ask. Only meaningful when isScheduling. */
  bookingMethod: "calendar_link" | "propose_times"
}

const MAX_REPLY = 320

/** Fixed tail appended to an INTERESTED draft when the founder has no calendar link. */
const PROPOSE_TIMES_TAIL = " Would Tue or Wed afternoon work? Happy to send a couple of slots."

function bookingMethodFor(ctx: ReplyContext): "calendar_link" | "propose_times" {
  return ctx.founder.calendarUrl && ctx.founder.calendarUrl.trim() ? "calendar_link" : "propose_times"
}

/**
 * For INTERESTED drafts, GUARANTEE a concrete booking ask survives in the final
 * text — never trust the model (or the heuristic) to always include it. When a
 * calendar link is present it is protected: we trim the body sentence before the
 * link, never the link itself.
 */
function ensureBookingAsk(
  draft: string,
  ctx: ReplyContext,
  method: "calendar_link" | "propose_times",
): string {
  const base = clampReply(draft)
  if (method === "calendar_link") {
    const url = ctx.founder.calendarUrl!.trim()
    if (base.includes(url)) return base
    const tail = ` Grab a time: ${url}`
    if (base.length + tail.length <= MAX_REPLY) return (base + tail).trim()
    // Protect the link: trim the body to make room for the link tail.
    const room = MAX_REPLY - tail.length
    if (room <= 0) return clampReply(`Grab a time: ${url}`)
    const trimmed = base.slice(0, room).replace(/\s\S*$/, "").trimEnd()
    return (trimmed + tail).trim()
  }
  // propose_times — skip if the draft already proposes a concrete time/slot.
  if (/\b(mon|tue|wed|thu|fri|slot|time|window|afternoon|morning|calendar|book a)\b/i.test(base)) return base
  if (base.length + PROPOSE_TIMES_TAIL.length <= MAX_REPLY) return (base + PROPOSE_TIMES_TAIL).trim()
  const room = MAX_REPLY - PROPOSE_TIMES_TAIL.length
  const trimmed = base.slice(0, Math.max(0, room)).replace(/\s\S*$/, "").trimEnd()
  return (trimmed + PROPOSE_TIMES_TAIL).trim()
}

export async function classifyAndDraftReply(
  ctx: ReplyContext,
): Promise<ClassifiedReply> {
  const provider = await resolveProvider()
  if (provider === "none") {
    return heuristicFallback(ctx, "AI provider unavailable. Heuristic classification only.")
  }
  const prompt = buildPrompt(ctx)
  let raw: string
  try {
    raw = await generate(prompt, { maxTokens: 400, temperature: 0.4, json: true, task: "reply_classify" })
  } catch (e: any) {
    console.error("[reply-handler] generate failed:", e?.message)
    return heuristicFallback(ctx, `Generation failed (${e?.message ?? "unknown"}).`)
  }
  const parsed = parseJson(raw)
  if (!parsed) return heuristicFallback(ctx, "AI output couldn't be parsed.")

  const cls = normalizeClass(parsed.classification)
  const isScheduling = cls === "INTERESTED"
  const bookingMethod = bookingMethodFor(ctx)
  const draft = isScheduling
    ? ensureBookingAsk(parsed.draft ?? "", ctx, bookingMethod)
    : clampReply(parsed.draft ?? "")
  const reengage = REENGAGE_OFFSET_DAYS[cls]
  return {
    classification: cls,
    draft,
    recommendedStage: STAGE_FOR_CLASS[cls],
    reengageOnIso: reengage
      ? new Date(Date.now() + reengage * 86_400_000).toISOString().slice(0, 10)
      : undefined,
    notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
    isScheduling,
    bookingMethod,
  }
}

// ─── prompt + parser ──────────────────────────────────────────────────────
function buildPrompt(ctx: ReplyContext): string {
  const cal = ctx.founder.calendarUrl ?? "[CAL_LINK]"
  const facts = ctx.founder.facts.length
    ? ctx.founder.facts.map((f, i) => `  ${i + 1}. ${f}`).join("\n")
    : "  (no concrete facts supplied — keep the draft generic but not vague)"

  return `You are the response handler for an outreach campaign run by ${ctx.founder.companyName}. The partner ${ctx.partnerName}${ctx.partnerTitle ? ` (${ctx.partnerTitle})` : ""} at ${ctx.partnerFirm} just replied to our outreach DM.

OUR ORIGINAL DM:
"""
${ctx.ourOriginalDm}
"""

THEIR REPLY:
"""
${ctx.theirReply}
"""

FOUNDER CONTEXT
  Company: ${ctx.founder.companyName}
  One-liner: ${ctx.founder.oneLiner}
  Facts (use at most one in the draft):
${facts}
  Calendar link: ${cal}

CLASSIFICATION RULES — pick exactly ONE label:
  - INTERESTED: wants more, asking for a call, deck, or further conversation NOW
  - INTERESTED_LATER: positive but engagement window is later (defined timing, e.g. "ping me in Q3")
  - WRONG_FIT: clearly not their thesis, mandate, geography, or stage. Polite no.
  - WRONG_NOW: timing issue but they hint it might fit later
  - QUESTION: asked a specific question first that needs a substantive answer

DRAFT RULES (hard):
  - Under 320 characters total, including spaces.
  - Match their energy. Do NOT over-pitch a soft yes.
  - Include exactly ONE concrete next step:
      INTERESTED         → calendar link OR deck offer
      INTERESTED_LATER   → confirm the window, propose a re-ping date
      WRONG_FIT          → graceful close, ask for a referral if natural
      WRONG_NOW          → confirm the timing, propose a re-ping date
      QUESTION           → answer the question in 1-2 sentences plus calendar link
  - NEVER write "I appreciate you taking the time" or any other filler
  - NEVER use em dashes (—). Use commas, colons, periods, or arrows ( → ).
  - Same brand voice as the original DM.

Return ONLY this JSON object (no markdown, no commentary):
{
  "classification": "INTERESTED" | "INTERESTED_LATER" | "WRONG_FIT" | "WRONG_NOW" | "QUESTION",
  "draft": "<draft response, <=320 chars>",
  "notes": "<short note on what signals you used to classify>"
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

function normalizeClass(s: any): ReplyClass {
  const upper = String(s ?? "").toUpperCase().replace(/[\s-]+/g, "_")
  if ((ALL_CLASSES as string[]).includes(upper)) return upper as ReplyClass
  // Common aliases
  if (upper === "INTERESTED_NOW") return "INTERESTED"
  if (upper === "NOT_INTERESTED" || upper === "PASS" || upper === "DECLINE") return "WRONG_FIT"
  if (upper === "BAD_TIMING" || upper === "TOO_EARLY" || upper === "TOO_LATE") return "WRONG_NOW"
  if (upper === "ASKED_QUESTION") return "QUESTION"
  return "QUESTION" // safest default — assumes the reply needs a substantive answer
}

function clampReply(s: string): string {
  const cleaned = String(s).replace(/—/g, ",").trim()
  if (cleaned.length <= MAX_REPLY) return cleaned
  const cut = cleaned.slice(0, MAX_REPLY - 1).replace(/\s\S*$/, "")
  return cut + "…"
}

// ─── Heuristic fallback (no AI) ───────────────────────────────────────────
function heuristicFallback(ctx: ReplyContext, notes: string): ClassifiedReply {
  const reply = ctx.theirReply.toLowerCase()
  let cls: ReplyClass = "QUESTION"
  if (/\b(yes|sure|happy to|let'?s talk|book|calendar|interested|sounds good)\b/.test(reply)) cls = "INTERESTED"
  else if (/\b(later|q[1-4]|next quarter|next year|after|when)\b/.test(reply)) cls = "INTERESTED_LATER"
  else if (/\b(not (a|the) fit|pass|decline|outside our|not for us)\b/.test(reply)) cls = "WRONG_FIT"
  else if (/\b(too early|too late|wrong (stage|timing)|not right now)\b/.test(reply)) cls = "WRONG_NOW"
  else if (/\?/.test(reply)) cls = "QUESTION"

  const cal = ctx.founder.calendarUrl ?? "[CAL_LINK]"
  // INTERESTED's booking ask is added by ensureBookingAsk below, so its base
  // draft deliberately omits the calendar link (avoids a stray [CAL_LINK]).
  const drafts: Record<ReplyClass, string> = {
    INTERESTED: `Great, would love to walk you through it. ${ctx.founder.facts[0] ?? ctx.founder.oneLiner}`,
    INTERESTED_LATER: `Got it. I will reconnect when the timing fits. Anchor for me: ${ctx.founder.facts[0] ?? ctx.founder.oneLiner}.`,
    WRONG_FIT: `Understood, thanks for the quick read. If anyone in your network is closer to ${ctx.founder.companyName}'s space, an intro would be welcome.`,
    WRONG_NOW: `Makes sense. I will check back at the right window. For context: ${ctx.founder.facts[0] ?? ctx.founder.oneLiner}.`,
    QUESTION: `Quick answer: ${ctx.founder.oneLiner}. Happy to walk through it: ${cal}.`,
  }
  const reengage = REENGAGE_OFFSET_DAYS[cls]
  const isScheduling = cls === "INTERESTED"
  const bookingMethod = bookingMethodFor(ctx)
  const draft = isScheduling
    ? ensureBookingAsk(drafts[cls], ctx, bookingMethod)
    : clampReply(drafts[cls])
  return {
    classification: cls,
    draft,
    recommendedStage: STAGE_FOR_CLASS[cls],
    reengageOnIso: reengage
      ? new Date(Date.now() + reengage * 86_400_000).toISOString().slice(0, 10)
      : undefined,
    notes,
    isScheduling,
    bookingMethod,
  }
}
