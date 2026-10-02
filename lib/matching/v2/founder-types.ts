/**
 * Founder-side matchmaking types — mirrors LP types but from the
 * Startup → Investor direction.
 *
 * Scoring (v3, docs/architecture/11) is a normalised 0–100 score of
 * continuous components with gates; every component is recorded on the
 * result so each number can be explained.
 */

import type { PipelineStage, TierId } from "./types"

export const STARTUP_STAGES = [
  "pre-seed",
  "seed",
  "series-a",
  "series-b",
  "series-c",
  "growth",
  "late-stage",
] as const

export type StartupStage = (typeof STARTUP_STAGES)[number]

export const STAGE_LABELS: Record<StartupStage, string> = {
  "pre-seed": "Pre-seed",
  "seed": "Seed",
  "series-a": "Series A",
  "series-b": "Series B",
  "series-c": "Series C",
  "growth": "Growth",
  "late-stage": "Late stage",
}

export const ROUND_INSTRUMENTS = ["safe", "priced-equity", "convertible-note", "other"] as const
export type RoundInstrument = (typeof ROUND_INSTRUMENTS)[number]
export const LEAD_STATUSES = ["needed", "in-discussion", "secured"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

// ─── Startup profile (input to founder matching) ───────────────────────────
export interface StartupProfile {
  id: string
  name: string
  oneLiner?: string
  description?: string

  // Core matching inputs
  sectors: string[] // canonical sector tags
  primarySector?: string
  stage: StartupStage
  location: string | null
  geographyTargetRegions?: string[] // where founder wants investors (default = same region)

  // Round economics
  askAmount: number | null // dollars they want to raise
  preMoneyValuation: number | null
  checkSizeIdealMin: number | null // ideal check from a single investor
  checkSizeIdealMax: number | null

  // Traction & team
  arr?: number | null
  mrr?: number | null
  growthRateMom?: number | null // % month-over-month
  teamSize?: number | null
  foundedYear?: number | null

  // Free-text signals for thesis matching
  thesisKeywords: string[]
  founderBios?: string[]

  // Round terms and status (docs/architecture/14 §8)
  instrument?: RoundInstrument | null
  valuationCap?: number | null
  valuationCapType?: "pre-money" | "post-money" | null
  leadStatus?: LeadStatus | null
  committedAmount?: number | null
  targetCloseDate?: string | null

  // Targeting
  investorTypesWanted?: string[]
  investorTypesExcluded?: string[]
  /** Firm or person names never to suggest. */
  excludedInvestors?: string[]

  // Company context
  businessModel?: string | null
  customerSegment?: string | null
  namedCustomers?: string[]
  useOfFunds?: string | null
  competitors?: string[]

  // Document context (persisted summaries from extraction)
  pitchDeckSummary?: string | null
  dataRoomSummary?: string | null

  // Provenance
  extractedFrom?: string[] // file names AI extracted from
  manuallyEdited?: boolean
  createdAt?: string
  updatedAt?: string
}

// ─── Scored investor result ────────────────────────────────────────────────
export interface ScoredInvestorEntity {
  // Common
  id: string
  kind: "firm" | "person"
  name: string
  type: string // VC / Angel / Family Office / Accelerator / Corporate / etc.
  location: string
  sectors: string[]
  website: string | null
  linkedin: string | null

  // Person-specific
  title?: string | null
  email?: string | null
  emailVerified?: boolean
  bio?: string | null
  firmId?: string | null
  firmName?: string | null

  // Firm-specific
  aumRaw?: string | null
  checkSizeMin?: number | null
  checkSizeMax?: number | null
  portfolioCount?: number | null
  stages?: string[]

  // Scoring
  score: number
  tier: TierId
  factors: FounderFactorBreakdown
  reasons: string[]
  whyMatch: string // 1-sentence narrative
  tags: string[]

  // Workflow
  stage: PipelineStage

  // v3 (docs/architecture/11) — optional so older cached results still read
  /** Each component in [0, 1] and the points it earned. */
  components?: FounderComponents
  /** Gates and caps applied after the weighted sum, e.g. "champion_gate". */
  gates?: string[]
  investorClass?: string
  country?: string | null
  /** Email verification status (docs/architecture/13). */
  emailStatus?: "valid" | "risky" | "unknown" | "invalid" | null
  seniority?: number
  contactRank?: number
  /** Already in this workspace's CRM at "queued". */
  inCrm?: boolean
  /** Last investment we have evidence for, and the sentence it came from (doc 16). */
  lastInvestmentAt?: string | null
  lastInvestmentNote?: string | null
  /** The page the date was read from, so the claim can be checked (doc 16). */
  lastInvestmentSource?: string | null
}

/** v3 components: `value` in [0, 1], `points` its share of the 0–100 score. */
export interface FounderComponents {
  thesis: { value: number; points: number; sector: number; semantic: number | null; keywords: string[] }
  stage: { value: number; points: number }
  checkSize: { value: number; points: number; range: [number | null, number | null] | null }
  geography: { value: number; points: number }
  lead: { value: number; points: number }
  investorType: { value: number; points: number }
  quality: { value: number; points: number }
}

/** A firm with the people to contact there (docs/architecture/11 §5). */
export interface FirmGroup {
  firm: ScoredInvestorEntity & { segments: InvestorSegment[] }
  primary: ScoredInvestorEntity | null
  alternates: ScoredInvestorEntity[]
  /** "people" when the firm record was sparse and its partners carried the score. */
  scoreFrom: "firm" | "people"
  /** How many of the firm's people scored (before choosing three). */
  peopleScored: number
}

export interface FounderFactorBreakdown {
  sector: number // +8-25
  stage: number // +10-25
  checkSize: number // +5-20
  geography: number // +1-15
  investorType: number // +5-15
  thesis: number // +5-15
  contact: number // +2-3 (persons only)
  semantic: number // +0-18 (embedding similarity; 0 when embeddings absent)
}

// ─── Funnel + segments ─────────────────────────────────────────────────────
export interface FounderFunnel {
  firms: { label: string; count: number; pct: number; notes?: string }[]
  contacts: { label: string; count: number; pct: number; notes?: string }[]
}

export const INVESTOR_SEGMENTS = [
  "lead",          // can write the lead check; matches stage AND check size
  "follow_on",     // co-invests; smaller check than ask
  "warm_local",    // local + sector match (warm intro priority)
  "stage_match",   // stage match
  "sector_match",  // sector match
  "active_recent", // many recent investments
  "international", // outside founder's region
] as const

export type InvestorSegment = (typeof INVESTOR_SEGMENTS)[number]

export const INVESTOR_SEGMENT_META: Record<InvestorSegment, { label: string; rationale: string; priority: number }> = {
  lead: {
    label: "Lead Candidates",
    rationale: "Stage + check-size match. Can write the lead check. Highest priority outreach.",
    priority: 1,
  },
  warm_local: {
    label: "Local + Sector Match",
    rationale: "Within reach for in-person meetings. Warm-intro path likely.",
    priority: 2,
  },
  follow_on: {
    label: "Follow-on Candidates",
    rationale: "Co-invest profile. Round-fillers after the lead is set.",
    priority: 3,
  },
  stage_match: {
    label: "Stage Match",
    rationale: "Invests at this stage. Sector/check-size partial fit.",
    priority: 4,
  },
  sector_match: {
    label: "Sector Match",
    rationale: "Strong sector thesis fit even if stage is adjacent.",
    priority: 5,
  },
  active_recent: {
    label: "Recently Active",
    rationale: "High portfolio velocity — actively writing checks.",
    priority: 6,
  },
  international: {
    label: "International",
    rationale: "Outside founder's region — opportunistic.",
    priority: 7,
  },
}

// ─── Engine result ─────────────────────────────────────────────────────────
export interface FounderMatchingResult {
  sessionId: string
  startupProfileId: string
  startupName: string
  ranAt: string
  durationMs: number
  funnel: FounderFunnel
  totals: {
    rawFirms: number
    rawContacts: number
    qualifiedFirms: number
    qualifiedContacts: number
    contactsWithEmail: number
    leadCandidates: number
    duplicatesMerged: number
    aiEnrichmentsApplied: number
  }
  tierCounts: {
    firms: Record<TierId, number>
    contacts: Record<TierId, number>
  }
  segmentCounts: {
    firms: Record<InvestorSegment, number>
    contacts: Record<InvestorSegment, number>
  }
  firms: (ScoredInvestorEntity & { segments: InvestorSegment[] })[]
  /** One primary contact per firm group, then independent investors — never two people from one firm. */
  contacts: (ScoredInvestorEntity & { segments: InvestorSegment[] })[]

  // v3 — optional so results cached by v2 still read
  engineVersion?: string
  groups?: FirmGroup[]
  independents?: (ScoredInvestorEntity & { segments: InvestorSegment[] })[]
  semantic?: { status: "ok" | "unavailable"; reason: string | null; models: { firms: string | null; contacts: string | null } }
  exclusions?: { inCrm: number; excludedByFounder: number; suppressed: number; excludedTypes: number; declined: number; outsideSector?: number }
  /** Qualified before the result cap — the honest count. */
  qualifiedBeforeCap?: { groups: number; independents: number }
  emailVerification?: { checked: number; provider: number; providerConfigured: boolean }
  /** "expert" or "fitted:<id>" — the weights this run was ranked with (doc 17). */
  weightSource?: string
}

// ─── Document extraction result ────────────────────────────────────────────
export interface ExtractedProfileFields {
  name?: string
  oneLiner?: string
  description?: string
  sectors?: string[]
  primarySector?: string
  stage?: StartupStage
  location?: string
  askAmount?: number
  preMoneyValuation?: number
  checkSizeIdealMin?: number
  checkSizeIdealMax?: number
  arr?: number
  mrr?: number
  growthRateMom?: number
  teamSize?: number
  foundedYear?: number
  thesisKeywords?: string[]
  founderBios?: string[]
  pitchDeckSummary?: string
  dataRoomSummary?: string
  instrument?: RoundInstrument
  valuationCap?: number
  valuationCapType?: "pre-money" | "post-money"
  leadStatus?: LeadStatus
  committedAmount?: number
  targetCloseDate?: string
  geographyTargetRegions?: string[]
  investorTypesWanted?: string[]
  businessModel?: string
  customerSegment?: string
  namedCustomers?: string[]
  useOfFunds?: string
  competitors?: string[]
  /** Per field: the phrase in the deck that supports it (docs/architecture/14 §8). */
  evidence?: Record<string, string>
  confidence?: number // 0-1
  notes?: string // AI's explanation of what it pulled vs guessed
  extractedFrom?: string[] // file names AI extracted from (used by heuristic + AI paths)
}
