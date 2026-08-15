/**
 * Summit Venture Studio Fund II — Email + LinkedIn DM Drafter
 *
 * draftEmail()   — generate one DraftedEmail from an EnrichedProfile.
 *                  Selects tone strategy by LP type, detects multi-touch,
 *                  calls Claude Sonnet for body + LinkedIn DM.
 *
 * draftAll()     — convenience wrapper to draft every enriched profile.
 *
 * Voice rules (Philippe's brief):
 *   - Relationship before transaction
 *   - Quiet credibility — one specific reason this LP was chosen
 *   - No em-dashes, no hype, no generic compliments
 *   - Concrete proof points only (Fund I $10M, 200+ uni partnerships, ~90% formation ownership)
 *   - One clear ask: 20-30 min intro call
 */

import Anthropic from "@anthropic-ai/sdk"
import type {
  EnrichedProfile,
  DraftedEmail,
  SenderBrief,
  ToneStrategy,
  LPType,
  PrimaryChannel,
} from "./types"
import { SENDER_PROFILE } from "./sender-profile"

// ─── Tone strategy map ────────────────────────────────────────────────────────

const TONE_MAP: Record<string, ToneStrategy> = {
  "Angel Investor": {
    label: "Angel Investor",
    tone: "warm, peer-to-peer, operator-to-operator. First name. Conversational but not casual.",
    openingFrame:
      "Open by referencing the personalisation hook — a sector overlap, a portfolio company they might know, or a formation-stage observation. Do not open with 'I hope this finds you well' or any filler.",
    ctaPhrase: "Open to a 20-minute call? No ask attached.",
    subjectStyle: "First-name subject, ≤7 words, no punctuation gimmicks",
    channel: "linkedin",
    dmMaxChars: 300,
  },
  "Angel Investor / HNW": {
    label: "HNW Angel",
    tone: "warm, peer-to-peer, operator-to-operator. First name.",
    openingFrame:
      "Reference the hook directly. Acknowledge their angel activity in the sector without flattering.",
    ctaPhrase: "Open to a 20-minute call? No ask attached.",
    subjectStyle: "First-name subject, ≤7 words",
    channel: "linkedin",
    dmMaxChars: 300,
  },
  Angel: {
    label: "Angel",
    tone: "warm, peer-to-peer. First name.",
    openingFrame: "Reference the hook directly.",
    ctaPhrase: "Open to a 20-minute call? No ask attached.",
    subjectStyle: "First-name subject, ≤7 words",
    channel: "linkedin",
    dmMaxChars: 300,
  },
  "Family Office": {
    label: "Family Office",
    tone: "quiet credibility-first, understated, relationship-oriented. Not name-first — lead with the firm context.",
    openingFrame:
      "Reference one specific reason this family office was selected — sector overlap, regional alignment, or deal-flow angle. Avoid hype. Emphasise discretion, alignment, and co-investment optionality.",
    ctaPhrase:
      "Happy to share a Fund II summary first, or jump on a brief call — whichever works better.",
    subjectStyle: "Firm-name or mandate-specific, ≤8 words, no exclamation",
    channel: "email",
    dmMaxChars: 280,
  },
  Endowment: {
    label: "Endowment",
    tone: "long-horizon, institutional, mission-consistent. Formal but not stiff.",
    openingFrame:
      "Frame the fund around long-term compounding and mission alignment with university research commercialisation. Reference the endowment's known focus area if available.",
    ctaPhrase:
      "I'd welcome the chance to share more — a brief call or a Fund II summary, whichever is more useful.",
    subjectStyle: "Mission + long-horizon language, ≤9 words",
    channel: "email",
    dmMaxChars: 280,
  },
  Institutional: {
    label: "Institutional",
    tone: "formal, data-driven, strategy-aligned. Reference proof points early.",
    openingFrame:
      "Open with the fund's quantitative proof points and strategy differentiation. Acknowledge their mandate explicitly. Reference portfolio fit.",
    ctaPhrase:
      "Happy to share a Fund II deck or schedule a brief introductory call.",
    subjectStyle: "Strategy-focused, fund name prominent, ≤9 words",
    channel: "email",
    dmMaxChars: 260,
  },
  "Fund of Funds": {
    label: "Fund of Funds",
    tone: "institutional, returns-focused, portfolio-construction-aware.",
    openingFrame:
      "Lead with Fund I track record and strategy differentiation vs traditional VC peers. Acknowledge they are evaluating many GPs — be specific about what makes this fund different.",
    ctaPhrase: "Happy to send a tear sheet or schedule an LP due-diligence call.",
    subjectStyle: "Returns + strategy, ≤9 words",
    channel: "email",
    dmMaxChars: 260,
  },
  "Sovereign Wealth Fund": {
    label: "Sovereign Wealth Fund",
    tone: "diplomatic, co-investment-forward, long-horizon.",
    openingFrame:
      "Lead with co-investment access and deal flow. Emphasise the fund's ability to syndicate. Reference geographic or thematic overlap with their mandate.",
    ctaPhrase:
      "I would welcome the opportunity to share materials or speak briefly.",
    subjectStyle: "Co-investment or mandate-specific, ≤9 words",
    channel: "email",
    dmMaxChars: 260,
  },
  "Corporate VC": {
    label: "Corporate VC",
    tone: "strategic-synergy-first, deal-flow-focused.",
    openingFrame:
      "Lead with strategic rationale — how portfolio companies could be customers, partners, or acquisition targets for their parent. Frame LP position as proprietary deal-flow access.",
    ctaPhrase: "Happy to set up a strategy call or share portfolio overviews.",
    subjectStyle: "Strategic angle prominent, ≤8 words",
    channel: "email",
    dmMaxChars: 270,
  },
  Pension: {
    label: "Pension Fund",
    tone: "conservative, long-duration, capital-preservation framing.",
    openingFrame:
      "Frame around the fund's milestone-gated deployment and 3-year exit cadence — shorter duration than traditional VC. Reference the university deal-flow as a structural de-risking mechanism.",
    ctaPhrase:
      "Happy to share a Fund II summary or schedule a brief introductory call.",
    subjectStyle: "Duration + de-risk language, ≤9 words",
    channel: "email",
    dmMaxChars: 260,
  },
}

function getToneStrategy(lpType: LPType): ToneStrategy {
  return (
    TONE_MAP[lpType] ??
    TONE_MAP["Institutional"]!
  )
}

function inferChannel(lpType: LPType, tags: string): PrimaryChannel {
  const strategy = getToneStrategy(lpType)
  // If tags explicitly include EMAIL and no LINKEDIN, force email
  if (tags.includes("EMAIL") && !tags.includes("LI")) return "email"
  return strategy.channel
}

// ─── Anthropic client ─────────────────────────────────────────────────────────

let _client: Anthropic | null = null

function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

// ─── Draft one email ──────────────────────────────────────────────────────────

/**
 * Generate email body + LinkedIn DM for one enriched profile.
 * Uses claude-sonnet-4-6 for speed on this step.
 */
export async function draftEmail(
  profile: EnrichedProfile,
  brief: SenderBrief
): Promise<DraftedEmail> {
  const tone = getToneStrategy(profile.lpType)
  const channel = inferChannel(profile.lpType, profile.tags)

  const multiTouchNote = profile.isMultiTouch
    ? `MULTI-TOUCH: A prior contact at this firm is ${profile.multiTouchPriorContact}. Open the email by briefly referencing that prior outreach to the firm, then introduce yourself as an additional point of contact.`
    : ""

  const systemPrompt = `You are ${SENDER_PROFILE.name}, VP at ${SENDER_PROFILE.managerOrg}, writing personalised LP outreach emails.
VOICE RULES — follow these exactly:
${brief.voicePrinciples.map((v, i) => `${i + 1}. ${v}`).join("\n")}

Additional rules:
- Never use em-dashes (—). Use commas or a new sentence instead.
- No hype words: "excited", "thrilled", "passionate", "transformative", "game-changing"
- Maximum 3 short paragraphs in the email body
- LinkedIn DM must be ≤ ${tone.dmMaxChars} characters including spaces
- Respond in valid JSON only.`

  const userPrompt = `Draft outreach for this investor.

INVESTOR:
Name: ${profile.name}
Role: ${profile.titleRole}
LP Type: ${tone.label}
Location: ${profile.location}
Sectors: ${profile.sectors}

ENRICHMENT:
Firm Intelligence: ${profile.firmIntelligence}
Investment Mandate: ${profile.investmentMandate}
Personalisation Hook: ${profile.personalisationHook}
${multiTouchNote}

SENDER:
${brief.senderName}, ${brief.senderRole}
LinkedIn: ${brief.senderLinkedIn}

FUND: ${brief.fundName}
Thesis: ${brief.thesis}
Key facts:
- ${brief.differentiators.join("\n- ")}
LP quote: ${brief.lpQuote}

TONE: ${tone.tone}
Opening frame: ${tone.openingFrame}
CTA: ${tone.ctaPhrase}
Subject style: ${tone.subjectStyle}

Return JSON with EXACTLY these keys:
{
  "subject": "email subject line",
  "body": "full email body — 3 short paragraphs, sign off as ${brief.senderName}\\n${brief.senderRole}\\n${brief.senderLinkedIn}",
  "linkedInDM": "LinkedIn DM ≤ ${tone.dmMaxChars} chars — warm, name-first, reference the hook, end with the CTA",
  "voiceNotes": "one sentence explaining the tone choice for this LP type"
}`

  const resp = await client().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  })

  const raw = (resp.content[0] as Anthropic.TextBlock).text.trim()

  let parsed: {
    subject: string
    body: string
    linkedInDM: string
    voiceNotes: string
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]+\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? raw)
  } catch {
    // Fallback: use the personalisation hook as a minimal draft
    parsed = {
      subject: `Brief introduction — ${brief.fundName}`,
      body: `Hi ${profile.name.split(" ")[0]},\n\n${profile.personalisationHook}\n\nI'm ${brief.senderName}, ${brief.senderRole}. ${brief.thesis}\n\n${tone.ctaPhrase}\n\n${brief.senderName}\n${brief.senderRole}`,
      linkedInDM: `Hi ${profile.name.split(" ")[0]} — ${brief.senderName.split(" ")[0]} here, ${brief.senderRole}. ${profile.personalisationHook.slice(0, 120)}. ${tone.ctaPhrase}`.slice(0, tone.dmMaxChars),
      voiceNotes: `${tone.label} tone applied`,
    }
  }

  // Enforce DM character cap
  let dm = parsed.linkedInDM ?? ""
  if (dm.length > tone.dmMaxChars) dm = dm.slice(0, tone.dmMaxChars - 1) + "…"

  return {
    investorId: profile.id,
    name: profile.name,
    lpType: profile.lpType,
    email: profile.email,
    subject: parsed.subject ?? "",
    body: parsed.body ?? "",
    primaryChannel: channel,
    linkedInDM: dm,
    voiceNotes: parsed.voiceNotes ?? "",
    outreachStatus: "Draft",
  }
}

// ─── Draft all ────────────────────────────────────────────────────────────────

/**
 * Draft emails for all enriched profiles sequentially.
 * (Email drafting is fast enough — no need to batch-parallel.)
 */
export async function draftAll(
  profiles: EnrichedProfile[],
  brief: SenderBrief,
  onProgress?: (done: number, total: number, name: string) => void
): Promise<DraftedEmail[]> {
  const drafts: DraftedEmail[] = []

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i]!
    const draft = await draftEmail(p, brief)
    drafts.push(draft)
    onProgress?.(i + 1, profiles.length, p.name)
  }

  return drafts
}
