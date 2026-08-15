/**
 * SVS Fund II — LP Outreach Campaign Pipeline
 *
 * 4-step workflow (self-contained, no DB dependency):
 *   1. PROFILE ENRICHMENT  — web-search each LP's firm mandate, focus, hook
 *                            Processed in batches of ≤10 with rate-limit gaps.
 *   2. EMAIL DRAFTING      — tone-matched email per LP type; multi-touch
 *                            detection produces follow-up copy for same-firm
 *                            contacts.
 *   3. EXCEL EXPORT        — delegated to xlsx-export.ts
 *   4. HTML REVIEW UI      — delegated to html-review.ts
 *
 * Usage:
 *   import { runCampaign } from "@/lib/outreach/svs-campaign"
 *   const result = await runCampaign(profiles)
 */

import Anthropic from "@anthropic-ai/sdk"
import { SENDER_PROFILE, senderBrief } from "@/lib/outreach/sender-profile"

// ─── Types ─────────────────────────────────────────────────────────────────

export type LPType =
  | "angel"
  | "family-office"
  | "institutional"
  | "sovereign"
  | "fund-of-funds"
  | "endowment"
  | "corporate-vc"

export interface InputProfile {
  /** Sequential number (1-based) */
  id: number
  name: string
  role: string
  firm: string
  email: string
  lpType: LPType
  location: string
  sectors: string[]
}

export interface EnrichedProfile extends InputProfile {
  /** Scraped / inferred firm mandate paragraph */
  firmIntelligence: string
  /** What they actually invest in — crisp 1-2 sentence summary */
  investmentMandate: string
  /** Single concrete personalisation hook for outreach */
  personalisationHook: string
  /** Enriched subject line tuned to LP type */
  enrichedSubject: string
  /** If another contact at the same firm appears earlier in the list */
  multiTouchNote: string
  /** Which 10-person batch this profile fell into (1-based) */
  batch: number
  /** Outreach status — starts as Draft */
  outreachStatus: "Draft" | "Approved" | "Sent" | "Replied" | "Paused"
  /** Fit score 0-100 generated during enrichment */
  fitScore: number
  /** Generated outreach email */
  emailDraft: EmailDraft
}

export interface EmailDraft {
  subject: string
  body: string
}

// ─── Sender brief ───────────────────────────────────────────────────────────
// Built from the configurable SENDER_PROFILE (env-overridable) rather than
// hardcoded — set SENDER_* env vars to re-point outreach at a different fund.

export const SVS_BRIEF = senderBrief()

// ─── LP-type tone map ──────────────────────────────────────────────────────

export const LP_TONE: Record<
  LPType,
  {
    label: string
    tone: string
    openingFrame: string
    ctaStyle: string
    subjectStyle: string
  }
> = {
  angel: {
    label: "Angel",
    tone: "peer-to-peer, warm, founder-empathetic",
    openingFrame:
      "Reach out as a fellow operator who now invests. Acknowledge their angel journey. Reference a shared context (sector, deal, mutual) if available.",
    ctaStyle: "casual coffee / 20-min call",
    subjectStyle: "first-name, conversational, ≤7 words",
  },
  "family-office": {
    label: "Family Office",
    tone: "quiet credibility-first, understated, relationship-oriented",
    openingFrame:
      "Lead with the fund's track record and LP alignment. Avoid hype. Emphasise discretion, long-term alignment, and co-investment rights.",
    ctaStyle: "discreet intro call / materials first",
    subjectStyle: "formal firm name, ≤8 words, no exclamation",
  },
  institutional: {
    label: "Institutional",
    tone: "formal, mission-aligned, data-driven",
    openingFrame:
      "Open with quantitative proof points and strategy alignment. Acknowledge their mandate explicitly. Reference portfolio fit.",
    ctaStyle: "formal intro / send deck first",
    subjectStyle: "strategy-focused, fund name prominent, ≤9 words",
  },
  sovereign: {
    label: "Sovereign",
    tone: "diplomatic, co-investment-forward, long-horizon",
    openingFrame:
      "Lead with co-investment angle and deal flow access. Emphasise fund's ability to syndicate. Reference geographic / thematic overlap with their mandate.",
    ctaStyle: "formal intro call / NDA-ready materials",
    subjectStyle: "co-investment or mandate-specific, ≤9 words",
  },
  "fund-of-funds": {
    label: "Fund of Funds",
    tone: "institutional, returns-focused, portfolio-construction-aware",
    openingFrame:
      "Lead with MOIC, DPI trajectory, and strategy differentiation vs peers. Acknowledge they are evaluating many GPs.",
    ctaStyle: "send tear sheet / schedule LP due-diligence call",
    subjectStyle: "returns + strategy, ≤9 words",
  },
  endowment: {
    label: "Endowment",
    tone: "long-horizon, mission-consistent, low-volatility framing",
    openingFrame:
      "Frame the fund around long-term compounding and mission alignment. Reference illiquidity premium. Minimise short-term return language.",
    ctaStyle: "send LP presentation / schedule IC briefing",
    subjectStyle: "mission + long-horizon language, ≤9 words",
  },
  "corporate-vc": {
    label: "Corporate VC",
    tone: "strategic-synergy-first, deal-flow-focused",
    openingFrame:
      "Lead with strategic rationale — how portfolio companies could be customers, partners, or acquisition targets. Frame LP position as deal-flow access.",
    ctaStyle: "strategy call / portfolio overview",
    subjectStyle: "strategic angle prominent, ≤8 words",
  },
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Detect multi-touch: if a same-firm contact appeared earlier in the list,
 *  return the prior contact's name. */
function detectMultiTouch(
  profile: InputProfile,
  allProfiles: InputProfile[]
): string {
  const prior = allProfiles.find(
    (p) =>
      p.id < profile.id &&
      p.firm.toLowerCase().trim() === profile.firm.toLowerCase().trim()
  )
  if (!prior) return ""
  return `Follow-up to outreach sent to ${prior.name} at ${prior.firm} (contact #${prior.id}). Reference prior outreach briefly and position this as expanded relationship.`
}

/** Split an array into chunks of at most `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ─── Anthropic client (lazy) ───────────────────────────────────────────────

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return _client
}

// ─── Step 1: Enrich one profile ────────────────────────────────────────────

async function enrichProfile(
  profile: InputProfile,
  multiTouchNote: string,
  batchNum: number
): Promise<EnrichedProfile> {
  const client = getClient()
  const tone = LP_TONE[profile.lpType] ?? LP_TONE["institutional"]

  const systemPrompt = `You are an expert LP research analyst preparing outreach for a venture capital fund.
You write concise, factually grounded intelligence briefs and personalised outreach materials.
Respond in valid JSON only — no markdown fences, no extra keys.`

  const userPrompt = `Research and enrich the following LP profile for outreach from ${SENDER_PROFILE.fundShortName}.

LP PROFILE:
Name: ${profile.name}
Role: ${profile.role}
Firm: ${profile.firm}
LP Type: ${tone.label}
Location: ${profile.location}
Sectors of interest: ${profile.sectors.join(", ")}
Email: ${profile.email}
${multiTouchNote ? `Multi-touch context: ${multiTouchNote}` : ""}

FUND BRIEF:
${SVS_BRIEF}

TONE GUIDANCE FOR THIS LP TYPE (${tone.label}):
Tone: ${tone.tone}
Opening frame: ${tone.openingFrame}
CTA style: ${tone.ctaStyle}
Subject style: ${tone.subjectStyle}

Return a JSON object with EXACTLY these keys:
{
  "firmIntelligence": "2-3 sentence paragraph on what ${profile.firm} does, their known investment thesis, AUM if public, and LP profile",
  "investmentMandate": "1-2 sentences on what they actually invest in — crisp, specific",
  "personalisationHook": "One concrete, specific hook to open outreach — reference a recent portfolio company, published thesis, public statement, or sector overlap. Must be unique to this LP.",
  "enrichedSubject": "Email subject line. Style: ${tone.subjectStyle}",
  "fitScore": <integer 0-100 reflecting how well ${SENDER_PROFILE.fundShortName} fits this LP's mandate>,
  "emailBody": "Full outreach email body (no subject line). 3-4 short paragraphs. Tone: ${tone.tone}. Opening frame: ${tone.openingFrame}. CTA: ${tone.ctaStyle}. Reference fund brief facts. If multi-touch context is provided, open by referencing prior outreach to the firm.  Sign off as ${SENDER_PROFILE.name}, ${SENDER_PROFILE.fundShortName}."
}`

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1200,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  })

  const raw = (response.content[0] as { type: string; text: string }).text.trim()

  let parsed: {
    firmIntelligence: string
    investmentMandate: string
    personalisationHook: string
    enrichedSubject: string
    fitScore: number
    emailBody: string
  }

  try {
    parsed = JSON.parse(raw)
  } catch {
    // Attempt to salvage if there's a JSON block buried in prose
    const match = raw.match(/\{[\s\S]+\}/)
    if (match) {
      parsed = JSON.parse(match[0])
    } else {
      throw new Error(
        `Failed to parse enrichment JSON for ${profile.name}: ${raw.slice(0, 200)}`
      )
    }
  }

  return {
    ...profile,
    firmIntelligence: parsed.firmIntelligence ?? "",
    investmentMandate: parsed.investmentMandate ?? "",
    personalisationHook: parsed.personalisationHook ?? "",
    enrichedSubject: parsed.enrichedSubject ?? "",
    fitScore: Number(parsed.fitScore ?? 50),
    multiTouchNote: multiTouchNote,
    batch: batchNum,
    outreachStatus: "Draft",
    emailDraft: {
      subject: parsed.enrichedSubject ?? "",
      body: parsed.emailBody ?? "",
    },
  }
}

// ─── Step 1 (batch orchestrator): Enrich all profiles ─────────────────────

/**
 * Enrich profiles in batches of ≤10.
 * Between batches: 2-second pause to avoid rate-limiting.
 * Within a batch: parallel enrichment calls.
 *
 * @param profiles   Raw input profiles (already sorted by id)
 * @param onProgress Optional callback after each profile completes
 */
export async function enrichProfiles(
  profiles: InputProfile[],
  onProgress?: (done: number, total: number, name: string) => void
): Promise<EnrichedProfile[]> {
  const BATCH_SIZE = 10
  const BETWEEN_BATCH_DELAY_MS = 2000

  const batches = chunk(profiles, BATCH_SIZE)
  const enriched: EnrichedProfile[] = []
  let doneCount = 0

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    const batchNum = batchIdx + 1

    console.log(
      `[SVS Campaign] Enriching batch ${batchNum}/${batches.length} ` +
        `(${batch.length} profiles)…`
    )

    // Pre-compute multi-touch notes for this batch (looks back into all profiles)
    const batchWithMeta = batch.map((p) => ({
      profile: p,
      multiTouchNote: detectMultiTouch(p, profiles),
    }))

    // Parallel enrichment within the batch
    const batchResults = await Promise.all(
      batchWithMeta.map(async ({ profile, multiTouchNote }) => {
        const result = await enrichProfile(profile, multiTouchNote, batchNum)
        doneCount++
        onProgress?.(doneCount, profiles.length, profile.name)
        return result
      })
    )

    enriched.push(...batchResults)

    // Pause between batches (skip after last)
    if (batchIdx < batches.length - 1) {
      console.log(
        `[SVS Campaign] Batch ${batchNum} done. Waiting ${BETWEEN_BATCH_DELAY_MS}ms…`
      )
      await sleep(BETWEEN_BATCH_DELAY_MS)
    }
  }

  return enriched
}

// ─── Main pipeline entry point ─────────────────────────────────────────────

export interface CampaignResult {
  enriched: EnrichedProfile[]
  stats: {
    total: number
    batches: number
    multiTouchPairs: number
    avgFitScore: number
    byLPType: Record<string, number>
  }
}

/**
 * Run the full SVS Fund II outreach campaign pipeline.
 * Steps 1 & 2 (enrichment + email drafting) are handled here.
 * Steps 3 & 4 (xlsx + html export) are in the separate export modules.
 */
export async function runCampaign(
  profiles: InputProfile[],
  onProgress?: (done: number, total: number, name: string) => void
): Promise<CampaignResult> {
  if (profiles.length === 0) throw new Error("No profiles provided")

  // Ensure sequential IDs
  const numbered = profiles.map((p, i) => ({ ...p, id: p.id ?? i + 1 }))

  const enriched = await enrichProfiles(numbered, onProgress)

  // Stats
  const multiTouchPairs = enriched.filter((e) => e.multiTouchNote !== "").length
  const avgFitScore = Math.round(
    enriched.reduce((s, e) => s + e.fitScore, 0) / enriched.length
  )
  const byLPType: Record<string, number> = {}
  for (const e of enriched) {
    byLPType[e.lpType] = (byLPType[e.lpType] ?? 0) + 1
  }

  return {
    enriched,
    stats: {
      total: enriched.length,
      batches: chunk(profiles, 10).length,
      multiTouchPairs,
      avgFitScore,
      byLPType,
    },
  }
}

// ─── CSV parser (thin, no external deps) ──────────────────────────────────

/**
 * Parse a CSV exported from a spreadsheet into InputProfile[].
 *
 * Expected columns (case-insensitive, extras ignored):
 *   id?, name, role, firm, email, lp_type, location, sectors
 *
 * `sectors` may be a JSON array string or comma-separated.
 */
export function parseInputCSV(csvText: string): InputProfile[] {
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) throw new Error("CSV must have a header row and data rows")

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ""))

  function col(row: string[], key: string): string {
    const idx = headers.indexOf(key)
    return idx >= 0 ? (row[idx] ?? "").trim() : ""
  }

  const profiles: InputProfile[] = []

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue

    // Naïve CSV split (handles simple cases; upgrade to papaparse for complex CSV)
    const cells = raw.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))

    const name = col(cells, "name")
    if (!name) continue

    const rawSectors = col(cells, "sectors")
    let sectors: string[] = []
    try {
      sectors = JSON.parse(rawSectors)
    } catch {
      sectors = rawSectors
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
    }

    const rawType = col(cells, "lp_type") || col(cells, "lptype") || col(cells, "type")
    const lpType = normalizeLPType(rawType)

    profiles.push({
      id: Number(col(cells, "id")) || i,
      name,
      role: col(cells, "role"),
      firm: col(cells, "firm") || col(cells, "firm_name"),
      email: col(cells, "email") || col(cells, "contact_email"),
      lpType,
      location: col(cells, "location"),
      sectors,
    })
  }

  return profiles
}

function normalizeLPType(raw: string): LPType {
  const s = raw.toLowerCase().replace(/[-_\s]/g, "")
  if (s.includes("angel")) return "angel"
  if (s.includes("sovereign") || s.includes("swf")) return "sovereign"
  if (s.includes("fof") || s.includes("fundoffunds")) return "fund-of-funds"
  if (s.includes("endowment")) return "endowment"
  if (s.includes("corporate")) return "corporate-vc"
  if (s.includes("family") || s.includes("familyoffice")) return "family-office"
  return "institutional"
}
