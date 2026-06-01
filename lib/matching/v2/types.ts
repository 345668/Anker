/**
 * LP Matchmaking v2 — shared types.
 *
 * Built to match the SVS Fund II scoring methodology with an absolute-points
 * scoring model. Each dimension contributes a fixed point range; the sum is
 * the entity's raw score. This makes the model interpretable — you can read a
 * score and reconstruct exactly which dimensions contributed.
 */

// ─── Pipeline stage enum (richer than the old `status`) ─────────────────────
export const PIPELINE_STAGES = [
  "identified", // engine surfaced as qualified
  "researched", // human reviewed
  "contacted", // outreach sent
  "responded", // they replied
  "meeting", // call/meeting booked
  "diligence", // they're reading the deck / DDQ
  "soft_circle", // verbal commit
  "committed", // term sheet / sub doc signed
  "wired", // money in
  "declined", // pass
  "lost", // no response after follow-ups
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

export const STAGE_LABELS: Record<PipelineStage, string> = {
  identified: "Identified",
  researched: "Researched",
  contacted: "Contacted",
  responded: "Responded",
  meeting: "Meeting Booked",
  diligence: "In Diligence",
  soft_circle: "Soft Circle",
  committed: "Committed",
  wired: "Wired",
  declined: "Declined",
  lost: "Lost",
}

export const STAGE_TONE: Record<PipelineStage, "neutral" | "active" | "hot" | "won" | "lost"> = {
  identified: "neutral",
  researched: "neutral",
  contacted: "active",
  responded: "active",
  meeting: "hot",
  diligence: "hot",
  soft_circle: "hot",
  committed: "won",
  wired: "won",
  declined: "lost",
  lost: "lost",
}

// ─── Segments (per SVS methodology) ─────────────────────────────────────────
export const OUTREACH_SEGMENTS = [
  "local",
  "fund_i_reup",
  "anchor",
  "university",
  "emerging_manager",
  "fo_with_email",
  "fund_of_funds",
  "international",
] as const

export type OutreachSegment = (typeof OUTREACH_SEGMENTS)[number]

export const SEGMENT_META: Record<OutreachSegment, { label: string; rationale: string; priority: number }> = {
  local: {
    label: "Local LPs",
    rationale: "In-person meetings within 2 weeks. Highest conversion probability.",
    priority: 1,
  },
  fund_i_reup: {
    label: "Fund I Re-ups",
    rationale: "Existing LPs from prior fund. Highest known signal.",
    priority: 2,
  },
  anchor: {
    label: "Anchor Candidates",
    rationale: "$500M+ AUM. Capacity to write the lead check.",
    priority: 3,
  },
  university: {
    label: "University Endowments",
    rationale: "Strategic LPs who understand the model natively.",
    priority: 4,
  },
  emerging_manager: {
    label: "Emerging Manager Programs",
    rationale: "Institutions that allocate to first-time GPs. Highest fit conversion.",
    priority: 5,
  },
  fo_with_email: {
    label: "Family Offices (with email)",
    rationale: "FO contacts ready for immediate outreach.",
    priority: 6,
  },
  fund_of_funds: {
    label: "US Fund of Funds",
    rationale: "Professional fund allocators.",
    priority: 7,
  },
  international: {
    label: "International LPs",
    rationale: "DACH, Gulf, Italy, Canada, UK, other.",
    priority: 8,
  },
}

// ─── Tier model (matches SVS doc thresholds) ────────────────────────────────
export const TIER_DEFINITIONS = [
  { id: "champion", label: "Champion", min: 80, tone: "won" as const },
  { id: "priority_a", label: "Priority A", min: 60, tone: "hot" as const },
  { id: "priority_b", label: "Priority B", min: 40, tone: "active" as const },
  { id: "prospect_c", label: "Prospect C", min: 20, tone: "neutral" as const },
] as const

export type TierId = (typeof TIER_DEFINITIONS)[number]["id"]

export function tierFor(score: number): TierId {
  for (const t of TIER_DEFINITIONS) if (score >= t.min) return t.id
  return "prospect_c"
}

// ─── Scoring factor breakdown ───────────────────────────────────────────────
export interface FactorBreakdown {
  lpType: number
  aum: number
  sector: number
  geography: number
  thesis: number
  contact: number
}

// ─── Fund profile passed into the engine ────────────────────────────────────
export interface FundProfileV2 {
  id: string
  name: string
  fundNumber?: number // 1, 2, 3 (for Fund I re-up tagging)
  targetRaise: number | null // dollars
  averageTicket: number | null // expected anchor check size
  sectors: string[] // canonical sector tags
  primarySectors?: string[] // gets +20 sweet-spot bonus when overlap
  geographicFocus: string[] // ['us', 'dach', 'gulf', ...]
  headquartersLocation: string | null
  thesisKeywords: string[] // free-text signals to scan bios for
  scoringMode?: "svs_absolute" | "weighted_normalized" // default svs_absolute
  fundIPriorLpFirmIds?: string[] // for fund_i_reup tagging
  fundIPriorContactEmails?: string[]
}

// ─── Scored entity outputs ──────────────────────────────────────────────────
export interface ScoredFirmV2 {
  firmId: string
  name: string
  normalizedName: string
  type: string
  location: string
  aumRaw: string | null
  aumUsd: number | null
  sectors: string[]
  website: string | null
  linkedin: string | null
  description: string | null
  // scoring
  score: number
  tier: TierId
  factors: FactorBreakdown
  reasons: string[]
  whyThisLp: string // AI-generated 1-sentence narrative (or rule-based fallback)
  tags: string[]
  segments: OutreachSegment[]
  // workflow
  stage: PipelineStage
  isAnchor: boolean
}

export interface ScoredContactV2 {
  investorId: string
  name: string
  title: string | null
  type: string
  location: string
  email: string | null
  emailVerified: boolean
  linkedin: string | null
  sectors: string[]
  bio: string | null
  // scoring
  score: number
  tier: TierId
  factors: FactorBreakdown
  reasons: string[]
  whyThisLp: string
  tags: string[]
  segments: OutreachSegment[]
  // workflow
  stage: PipelineStage
  // angel specifics
  isHnwAngel: boolean
  hnwSignals: string[]
}

// ─── Funnel data (matches the methodology funnel table) ────────────────────
export interface FunnelStage {
  label: string
  count: number
  pct: number // % of raw
  notes?: string
}

export interface MatchingFunnel {
  firms: FunnelStage[]
  contacts: FunnelStage[]
}

// ─── Engine result ──────────────────────────────────────────────────────────
export interface MatchingResultV2 {
  sessionId: string
  fundProfileId: string
  fundName: string
  ranAt: string // ISO
  durationMs: number
  funnel: MatchingFunnel
  totals: {
    rawFirms: number
    rawContacts: number
    qualifiedFirms: number
    qualifiedContacts: number
    contactsWithEmail: number
    anchorCandidates: number
    duplicatesMerged: number
    aiEnrichmentsApplied: number
  }
  tierCounts: {
    firms: Record<TierId, number>
    contacts: Record<TierId, number>
  }
  segmentCounts: {
    firms: Record<OutreachSegment, number>
    contacts: Record<OutreachSegment, number>
  }
  firms: ScoredFirmV2[]
  contacts: ScoredContactV2[]
}

// ─── Progress event for streaming ───────────────────────────────────────────
export type ProgressEvent =
  | { phase: "loading"; message: string }
  | { phase: "filtering"; total: number; passed: number }
  | { phase: "scoring"; total: number; processed: number; entity: "firms" | "contacts" }
  | { phase: "ai_enrichment"; total: number; processed: number }
  | { phase: "deduplication"; merged: number }
  | { phase: "segmentation"; segment: OutreachSegment; count: number }
  | { phase: "done"; result: MatchingResultV2 }
  | { phase: "error"; error: string }
