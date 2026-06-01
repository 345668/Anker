/**
 * Summit Venture Studio Fund II — Outreach Pipeline Shared Types
 *
 * Matches the exact column schema of SVS_Fund_II_Curated_Outreach.xlsx
 * (sheet: "Curated Profiles") plus enrichment & draft fields added
 * by the pipeline.
 */

// ─── LP Type ─────────────────────────────────────────────────────────────────

export type LPType =
  | "Angel Investor"
  | "Angel Investor / HNW"
  | "Angel"
  | "Family Office"
  | "Endowment"
  | "Institutional"
  | "Fund of Funds"
  | "Sovereign Wealth Fund"
  | "Corporate VC"
  | "Pension"
  | "Insurance"
  | string // catch-all for unknown tags

export type Tier = 1 | 2 | 3

export type OutreachStatus =
  | "Draft"
  | "Approved"
  | "Sent"
  | "Replied"
  | "Bounced"
  | "Paused"

export type PrimaryChannel = "linkedin" | "email" | "dual" | "skip"

// ─── Raw profile (direct from Excel / CSV) ───────────────────────────────────

/**
 * One row from the "Curated Profiles" sheet.
 * All columns are nullable — sourced from crawl/enrichment so
 * some cells may be empty.
 */
export interface InvestorProfile {
  /** Row number in the sheet (#) */
  id: number
  tier: Tier
  /** Pre-computed match score 0–100 from the original sheet */
  score: number
  name: string
  /** Title or Role as scraped */
  titleRole: string
  lpType: LPType
  /** Space-separated tags e.g. "HNW-Angel, UNI, EMAIL" */
  tags: string
  location: string
  email: string
  linkedin: string
  /** Comma-separated sector labels */
  sectors: string
  /** Human-written reason this contact was selected */
  whyThisContact: string
  /** Best-guess firm website */
  inferredWebsite: string
  /** "ok" | "error" | "" */
  crawlStatus: string
  websiteTitle: string
  /** Extracted investment focus from site crawl */
  investmentFocusExtracted: string
  metaDescription: string
  otherEmailsOnSite: string
  crawlPathsTried: string
}

// ─── Enriched profile (after Anthropic enrichment step) ──────────────────────

export interface EnrichedProfile extends InvestorProfile {
  /** Firm intelligence paragraph (2-3 sentences) */
  firmIntelligence: string
  /** Crisp mandate summary (1-2 sentences) */
  investmentMandate: string
  /** Single concrete personalisation hook for outreach */
  personalisationHook: string
  /** Whether another contact at the same firm appears earlier in the list */
  isMultiTouch: boolean
  /** Name of prior contact at same firm (if multi-touch) */
  multiTouchPriorContact: string
  /** Which 10-profile batch this record belongs to (1-based) */
  batch: number
}

// ─── Drafted email ───────────────────────────────────────────────────────────

export interface DraftedEmail {
  investorId: number
  name: string
  lpType: LPType
  email: string
  subject: string
  body: string
  primaryChannel: PrimaryChannel
  linkedInDM: string
  /** Voice notes / rationale for the tone chosen */
  voiceNotes: string
  outreachStatus: OutreachStatus
}

// ─── Sender brief ────────────────────────────────────────────────────────────

export interface SenderBrief {
  senderName: string
  senderRole: string
  senderLinkedIn: string
  senderTagline: string
  senderBackground: string

  fundName: string
  fundURL: string
  fundHQ: string
  fundVehicle: string
  fundTarget: string
  fundMinimum: string
  fundUnitPrice: string
  fundISize: string
  fundIClose: string
  fundIStatus: string

  model: string
  thesis: string
  differentiators: string[]
  lpQuote: string
  voicePrinciples: string[]
}

// ─── Pipeline result ─────────────────────────────────────────────────────────

export interface PipelineResult {
  enriched: EnrichedProfile[]
  drafts: DraftedEmail[]
  stats: PipelineStats
  /** ISO timestamp of pipeline run */
  generatedAt: string
}

export interface PipelineStats {
  total: number
  batches: number
  multiTouchCount: number
  avgScore: number
  byLPType: Record<string, number>
  byTier: Record<number, number>
  byChannel: Record<PrimaryChannel, number>
  /** Profiles with score >= 60 */
  tier1Count: number
}

// ─── Runtime config ──────────────────────────────────────────────────────────

export interface PipelineConfig {
  /** Max profiles per enrichment batch (hard cap = 10) */
  batchSize?: number
  /** Milliseconds to wait between enrichment batches */
  batchDelayMs?: number
  /** Anthropic model for enrichment */
  enrichmentModel?: string
  /** Anthropic model for email drafting */
  draftModel?: string
  /** Output directory for xlsx + html */
  outputDir?: string
  /** Limit to first N profiles (useful for testing) */
  limit?: number
}

// ─── Tone strategy (internal, used by emailDrafter) ──────────────────────────

export interface ToneStrategy {
  label: string
  tone: string
  openingFrame: string
  ctaPhrase: string
  subjectStyle: string
  channel: PrimaryChannel
  /** Max LinkedIn DM length */
  dmMaxChars: number
}
