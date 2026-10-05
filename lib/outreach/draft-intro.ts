/**
 * The intro-draft writer shared by the manual "Draft email" button and the Outreach drafter agent (docs/architecture/45 §6).
 * Pure apart from the injected model call: it builds the prompt, parses the answer and falls back to a plain template, so both callers
 * produce the same kind of draft. It never saves anything and never sends.
 */

export interface DraftEntry { display_name?: string | null; display_title?: string | null; display_type?: string | null; display_location?: string | null; why_match?: string | null; research_summary?: string | null }
export interface DraftFounder { companyName?: string; oneLiner?: string; facts?: string[]; founderName?: string; calendarUrl?: string }
export interface IntroDraft { subject: string; email: string; dm: string; usedModel: boolean }

export const firstWord = (s: string | null | undefined): string => (s || "").trim().split(/\s+/)[0] ?? ""

/** Pull the first balanced {...} JSON object out of a model response. */
export function extractJson(text: string): any | null {
  if (!text) return null
  const start = text.indexOf("{")
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === "{") depth++
    else if (ch === "}") { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)) } catch { return null } } }
  }
  return null
}

export function senderBlock(builtProfile: string | null | undefined, founder: DraftFounder): string {
  return [
    builtProfile && `SENDER PROFILE:\n${builtProfile}`,
    founder.companyName && `Company: ${founder.companyName}`,
    founder.oneLiner && `One-liner: ${founder.oneLiner}`,
    Array.isArray(founder.facts) && founder.facts.length ? `Facts:\n- ${founder.facts.join("\n- ")}` : null,
    founder.founderName && `Founder name: ${founder.founderName}`,
    founder.calendarUrl && `Calendar link: ${founder.calendarUrl}`,
  ].filter(Boolean).join("\n")
}

export function buildPrompt(entry: DraftEntry, sender: string, founder: DraftFounder): string {
  const investorBlock = [
    entry.display_name && `Name: ${entry.display_name}`, entry.display_title && `Title: ${entry.display_title}`, entry.display_type && `Type: ${entry.display_type}`,
    entry.display_location && `Location: ${entry.display_location}`, entry.why_match && `Why matched: ${entry.why_match}`,
    entry.research_summary && `Research brief:\n${entry.research_summary}`,
  ].filter(Boolean).join("\n")
  const firstName = firstWord(entry.display_name), cal = founder.calendarUrl || "a quick call"
  return `You are an expert fundraising copywriter. Draft outreach from a founder to an investor. Use the sender context and the investor research to make it specific — reference a real detail, not a generic compliment. No em-dashes. No hype words. One clear ask (a 15-minute call).

Return ONLY a JSON object, no prose around it:
{
  "subject": "email subject line, under 60 chars, specific not salesy",
  "email": "the email body, 90-150 words, greeting to '${firstName || "there"}', short paragraphs, one CTA referencing ${cal}, sign off with the founder name if known",
  "dm": "a LinkedIn DM under 300 characters, warmer and shorter than the email, one specific hook + one ask"
}

=== SENDER ===
${sender}

=== INVESTOR ===
${investorBlock || "(limited info — keep it honest and brief)"}`
}

export function fallbackDraft(entry: DraftEntry, founder: DraftFounder): { subject: string; email: string; dm: string } {
  const firstName = firstWord(entry.display_name), oneLiner = founder.oneLiner || "what we're building", company = founder.companyName || "our company"
  const sign = founder.founderName ? `\n\n${founder.founderName}` : ""
  return {
    subject: `${company} <> ${firstName || "you"}`,
    email: `Hi ${firstName || "there"},\n\n${oneLiner}. ${entry.why_match ? `I'm reaching out because ${entry.why_match.toLowerCase()}.` : "I think there may be a strong fit with your thesis."}\n\nWould you be open to a 15-minute call? ${founder.calendarUrl ? `Here's my calendar: ${founder.calendarUrl}` : "Happy to work around your schedule."}${sign}`,
    dm: `Hi ${firstName || "there"} — ${oneLiner}. ${entry.why_match ? "Looks like a fit with what you back." : ""} Open to a quick 15-min call?`.slice(0, 300),
  }
}

/** Turn a model answer (or none) into a draft. An unparseable or empty answer gives the plain template. */
export function parseDraft(text: string, entry: DraftEntry, founder: DraftFounder): IntroDraft {
  const p = extractJson(text)
  const subject = String(p?.subject ?? "").trim(), email = String(p?.email ?? "").trim(), dm = String(p?.dm ?? "").trim()
  if (!email) return { ...fallbackDraft(entry, founder), usedModel: false }
  return { subject: subject.slice(0, 200), email, dm: (dm || fallbackDraft(entry, founder).dm).slice(0, 600), usedModel: true }
}

/** The bounds a draft must meet before anything proposes to save it. Returns the reason it does not, or null. */
export function draftProblem(d: { subject: string; email: string; dm: string }): string | null {
  if (d.email.length < 40) return "the email is too short"
  if (d.email.length > 3000) return "the email is too long"
  if (!d.subject) return "no subject"
  if (!d.dm) return "no LinkedIn message"
  return null
}
