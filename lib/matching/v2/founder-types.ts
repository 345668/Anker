/**
 * Founder-side matchmaking types — mirrors LP types but from the
 * Startup → Investor direction.
 *
 * Scoring uses the same absolute-points pattern as the LP engine
 * (max ~118): every dimension contributes a fixed point range so the
 * model is interpretable.
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
  contacts: (ScoredInvestorEntity & { segments: InvestorSegment[] })[]
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
  confidence?: number // 0-1
  notes?: string // AI's explanation of what it pulled vs guessed
  extractedFrom?: string[] // file names AI extracted from (used by heuristic + AI paths)
}
