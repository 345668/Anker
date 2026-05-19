/**
 * Layer 2 — email variant.  Mirrors dm-personalizer but optimized for
 * cold email instead of LinkedIn DMs.
 *
 * Output: a 4-step email sequence
 *   day0    cold opener      — subject + body
 *   day3    bump (threaded — reuses the same subject as "Re:")
 *   day7    different angle  — new subject OR threaded depending on bump
 *   day14   graceful close   — threaded, short
 *
 * Hard rules (cold-email best practice + the playbook):
 *   - Cold opener subject: 4-7 words, no punctuation tricks, lowercase OK.
 *   - Body: 70-120 words for day-0. Bumps shorter (≤60 words).
 *   - One concrete number per email. Never reuse the same number.
 *   - Single P.S. allowed on day-0; never on bumps.
 *   - NO em dashes. NO "I hope this email finds you well". NO
 *     "circling back".
 *   - Always include calendar link in day-0 P.S. and day-7.
 *
 * The output is plain text — the Resend sender converts to HTML and
 * injects tracking pixel + click-rewriting.
 */

import { generate, resolveProvider } from "./provider"
import type { FounderContext, PartnerContext, PartnerPost } from "./dm-personalizer"

export interface EmailMessage {
  /** Subject line.  Empty for threaded follow-ups (caller prepends "Re:" the prior). */
  subject: string
  /** Plain-text body — paragraphs separated by blank lines. */
  body: string
}

export interface EmailSequence {
  day0:  EmailMessage
  day3:  EmailMessage
  day7:  EmailMessage
  day14: EmailMessage
  day0HookSource?: PartnerPost
  /** Suggested subject the bumps should "Re:" — usually day0.subject. */
  threadSubject: string
  notes?: string
}

const MAX_SUBJECT = 80
const MAX_BODY_DAY0 = 900   // ~120 words
const MAX_BODY_BUMP = 480   // ~60 words

export async function generateEmailSequence(
  founder: FounderContext,
  partner: PartnerContext,
): Promise<EmailSequence> {
  const provider = await resolveProvider()
  if (provider === "none") {
    return heuristicFallback(founder, partner, "AI provider unavailable. Heuristic templates filled.")
  }

  const prompt = buildPrompt(founder, partner)
  let raw: string
  try {
    raw = await generate(prompt, { maxTokens: 1200, temperature: 0.45, json: true, task: "dm_personalize" })
  } catch (e: any) {
    console.error("[email-personalizer] generate failed:", e?.message)
    return heuristicFallback(founder, partner, `Generation failed (${e?.message ?? "unknown"}). Heuristic fallback.`)
  }

  const parsed = parseJson(raw)
  if (!parsed) {
    return heuristicFallback(founder, partner, "AI output couldn't be parsed. Heuristic fallback.")
  }

  const day0Subject = clamp(parsed.day0?.subject ?? "", MAX_SUBJECT)
  return {
    day0:  { subject: day0Subject,                     body: clampBody(parsed.day0?.body  ?? "", MAX_BODY_DAY0) },
    day3:  { subject: clamp(parsed.day3?.subject  ?? "", MAX_SUBJECT), body: clampBody(parsed.day3?.body  ?? "", MAX_BODY_BUMP) },
    day7:  { subject: clamp(parsed.day7?.subject  ?? "", MAX_SUBJECT), body: clampBody(parsed.day7?.body  ?? "", MAX_BODY_BUMP) },
    day14: { subject: clamp(parsed.day14?.subject ?? "", MAX_SUBJECT), body: clampBody(parsed.day14?.body ?? "", MAX_BODY_BUMP) },
    day0HookSource: partner.primaryPost,
    threadSubject: day0Subject,
    notes: parsed.notes,
  }
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
    : "  (no concrete numbers supplied — keep day-0 generic but specific to the company)"

  const cal = founder.calendarUrl ? founder.calendarUrl : "[CAL_LINK]"
  const currency = founder.currency ?? "USD"

  return `You are writing a 4-step cold-EMAIL sequence from ${founder.companyName} to ${partner.fullName}${partner.title ? `, ${partner.title}` : ""} at ${partner.firm}.

CHANNEL: email (NOT LinkedIn).  We have their work address.

FOUNDER CONTEXT
  Company: ${founder.companyName}
  One-liner: ${founder.oneLiner}
  Facts (use one per email, never the same fact twice):
${facts}
  Currency: ${currency}
  Calendar link: ${cal}

PARTNER CONTEXT
  Name: ${partner.fullName} (call them "${partner.firstName}")
  Firm: ${partner.firm}
  Title: ${partner.title ?? "—"}
  ${partner.recommendedHook ? `Suggested hook from discovery layer: "${partner.recommendedHook}"` : ""}

${post}

${otherPosts ? `OLDER SIGNALS (use one of these for the day-7 different-angle email):\n\n${otherPosts}` : ""}

HARD RULES (cold-email best practice):
  - Day-0 subject: 4–7 words, lowercase OK, NO punctuation tricks (no "!", no "[invite]").
  - Day-0 body: 70–120 words.  3 short paragraphs:
      1) hook off ONE specific recent post / fund move (1-2 sentences)
      2) one-line bridge into ${founder.companyName} + ONE concrete number
      3) one-sentence CTA + "P.S. ${cal} if easier."
  - Day-3 bump: ≤60 words. SAME subject (will thread). Format: "Hi ${partner.firstName}, bumping this in case it got buried. One more datapoint: <new fact>. Worth 15 min?"
  - Day-7 different-angle: ≤60 words. NEW subject line (3-5 words, e.g. "${partner.firm} + [their portfolio company]"). Reference a DIFFERENT signal or one of their portfolio companies.
  - Day-14 close-the-loop: ≤40 words. SAME thread. Graceful, not desperate. ONE sentence acknowledging no-fit + one sentence congratulating them on their fund's recent move.
  - NEVER use em dashes (—). Use commas, colons, periods, or arrows ( → ).
  - NEVER write "I hope this finds you well" / "circling back" / "just bumping" / "synergies".
  - Sign off with "Best, [first-name-of-founder-or-blank]".  Do NOT include a signature block.
  - Output bodies as plain text.  Paragraph breaks = blank lines.  No markdown.

Return ONLY this JSON object, no markdown, no commentary:
{
  "day0":  { "subject": "...", "body": "..." },
  "day3":  { "subject": "Re: <copy day0.subject>", "body": "..." },
  "day7":  { "subject": "...", "body": "..." },
  "day14": { "subject": "Re: <copy day0.subject>", "body": "..." },
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
  const cleaned = String(s).replace(/—/g, ",").trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max - 1).replace(/\s\S*$/, "") + "…"
}
function clampBody(s: string, maxChars: number): string {
  // Strip em dashes everywhere; preserve paragraph breaks; trim ws.
  const cleaned = String(s).replace(/—/g, ",")
    .split(/\n{2,}/).map((p) => p.split("\n").map((l) => l.trim()).join(" ").trim()).filter(Boolean).join("\n\n")
  if (cleaned.length <= maxChars) return cleaned
  return cleaned.slice(0, maxChars - 1).replace(/\s\S*$/, "") + "…"
}

// ─── Heuristic fallback ───────────────────────────────────────────────
function heuristicFallback(
  f: FounderContext,
  p: PartnerContext,
  notes: string,
): EmailSequence {
  const fact = f.facts[0] ?? ""
  const fact2 = f.facts[1] ?? f.facts[0] ?? ""
  const cal = f.calendarUrl ?? "[CAL_LINK]"
  const topic = p.primaryPost?.text ? snippet(p.primaryPost.text, 40) : `${p.firm}'s thesis`
  const subject = clamp(`${p.firm.toLowerCase().split(/\s+/)[0] ?? "your fund"} + ${f.companyName.toLowerCase()}`, MAX_SUBJECT)

  const day0Body =
    `Hi ${p.firstName},\n\n` +
    `Your post on ${topic} mirrors what we saw building ${f.companyName}.\n\n` +
    `${f.oneLiner}. ${fact}.\n\n` +
    `Worth a 15-min walkthrough?\n\n` +
    `Best,\n\n` +
    `P.S. ${cal} if easier.`
  const day3Body =
    `Hi ${p.firstName}, bumping this in case it got buried. One more datapoint: ${fact2}. Worth 15 min?\n\nBest,`
  const day7Subject = clamp(`${p.firm} + ${f.companyName}`, MAX_SUBJECT)
  const day7Body =
    `Hi ${p.firstName}, different angle: ${fact2}. ${cal} if you want to dig in.\n\nBest,`
  const day14Body =
    `Hi ${p.firstName}, no worries if this isn't a fit right now. Will close the loop on my end. Best of luck on ${p.firm}'s recent work.\n\nBest,`

  return {
    day0:  { subject, body: clampBody(day0Body,  MAX_BODY_DAY0) },
    day3:  { subject: clamp(`Re: ${subject}`, MAX_SUBJECT), body: clampBody(day3Body, MAX_BODY_BUMP) },
    day7:  { subject: day7Subject, body: clampBody(day7Body, MAX_BODY_BUMP) },
    day14: { subject: clamp(`Re: ${subject}`, MAX_SUBJECT), body: clampBody(day14Body, MAX_BODY_BUMP) },
    day0HookSource: p.primaryPost,
    threadSubject: subject,
    notes,
  }
}

function snippet(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).replace(/\s\S*$/, "") + "…"
}
