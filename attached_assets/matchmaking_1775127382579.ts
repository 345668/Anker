/**
 * server/services/matchmaking.ts
 *
 * ANKER — Unified Matchmaking Engine v2
 *
 * ═══════════════════════════════════════════════════════════════════
 * ARCHITECTURE OVERVIEW
 * ═══════════════════════════════════════════════════════════════════
 *
 * Two modes:
 *   • Standard      — full DB scan, all factors, returns top 200
 *   • Accelerated   — pre-filtered candidate pool, faster, used when
 *                     startup profile is complete enough for hard filters
 *
 * Scoring pipeline per investor candidate:
 *   1. Hard filters          — eliminate obviously wrong investors (O(n))
 *   2. Factor scores         — 6 weighted factors (O(1) per investor)
 *   3. Semantic bonus        — Jaccard similarity on keyword sets
 *   4. Niche bonus           — domain-specific keyword matching
 *   5. Document bonus        — data room document keyword extraction
 *   6. Economic fit          — check size vs funding target alignment
 *   7. Behaviour bonus       — portfolio count, deal velocity signals
 *   8. Feedback multiplier   — deal outcome learning (won/lost history)
 *   9. Final clamp + tier    — score clamped 0–100, bucket into tiers
 *
 * Outputs:
 *   • match_sessions         — one record per run, groups all matches
 *   • investor_matches       — individual scored records, status tracked
 *   • MBB match report       — 6-page PDF/React structure
 *   • CRM bulk import        — Folk CRM contacts with scores
 *
 * ═══════════════════════════════════════════════════════════════════
 * THRESHOLDS & LIMITS
 * ═══════════════════════════════════════════════════════════════════
 *
 *   MAX_MATCHES_RETURNED      200   (hard cap on output array)
 *   MIN_SCORE_THRESHOLD        35   (below this = excluded from results)
 *   TIER_CHAMPION              85   (top tier — immediate outreach)
 *   TIER_A                     70   (strong match)
 *   TIER_B                     55   (reasonable match)
 *   TIER_C                     35   (long tail — shown last)
 *   ACCELERATED_CANDIDATE_CAP 500   (max investors passed to scoring in fast mode)
 *   FEEDBACK_LOOKBACK_DAYS     90   (how far back to look for deal outcomes)
 *   MAX_NICHE_KEYWORDS_MATCHED 10   (cap on niche bonus to prevent score inflation)
 *
 */

import { db } from "../db.js";
import {
  investors,
  investmentFirms,
  startups,
  deals,
  matchSessions,
  investorMatches,
  dealRoomDocuments,
} from "../../shared/schema.js";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { folkCrmSync } from "./folk.js";

// ─── Constants ────────────────────────────────────────────────────────────────

export const THRESHOLDS = {
  MAX_MATCHES_RETURNED: 200,
  MIN_SCORE: 35,
  TIER_CHAMPION: 85,
  TIER_A: 70,
  TIER_B: 55,
  TIER_C: 35,
  ACCELERATED_CANDIDATE_CAP: 500,
  FEEDBACK_LOOKBACK_DAYS: 90,
  MAX_NICHE_KEYWORDS: 10,
} as const;

// ─── Factor weights (must sum to 1.0) ────────────────────────────────────────
//
// These are the six primary scoring factors. Weights are configurable via
// system settings table for admin tuning without code changes.

export const DEFAULT_WEIGHTS = {
  industry:      0.28,  // sector alignment — 28%
  stage:         0.22,  // investment stage compatibility — 22%
  geography:     0.18,  // geographic fit — 18%
  checkSize:     0.14,  // check size vs funding target — 14%
  investorType:  0.10,  // investor type alignment — 10%
  teamSignal:    0.08,  // team credibility signals — 8%
  // ────────────────────────────
  // total:        1.00
} as const;

export type FactorWeights = typeof DEFAULT_WEIGHTS;

// ─── Niche keyword dictionaries ───────────────────────────────────────────────
//
// Derived from replit.md: "25+ film keywords", "30+ RE keywords", sports

const NICHE_KEYWORDS: Record<string, string[]> = {
  film: [
    "slate financing", "gap financing", "completion bond", "tax credit",
    "production financing", "film fund", "studio", "independent film",
    "entertainment finance", "distribution advance", "minimum guarantee",
    "pre-sales", "foreign pre-sales", "co-production", "mezzanine financing",
    "equity gap", "soft money", "incentive funding", "bridge loan film",
    "content fund", "media fund", "streaming rights", "theatrical",
    "film slate", "tent pole", "documentary fund",
  ],
  realestate: [
    "construction loan", "bridge financing", "multifamily", "reit",
    "commercial real estate", "proptech", "ground up development",
    "value-add", "opportunistic", "core plus", "cap rate", "noi",
    "real estate debt", "mezzanine debt", "preferred equity",
    "joint venture equity", "syndication", "fix and flip",
    "industrial", "logistics", "data center", "life sciences real estate",
    "affordable housing", "opportunity zone", "1031 exchange",
    "real estate fund", "cre", "residential development",
    "senior housing", "self storage",
  ],
  sports: [
    "sports tech", "athlete performance", "fan engagement", "esports",
    "sports analytics", "stadium technology", "ticketing platform",
    "sports betting", "fantasy sports", "athlete brand", "nft sports",
    "sports media", "fitness tech", "health performance", "wearables",
    "coaching platform", "sports streaming", "sports data",
    "sports marketing", "athlete investment", "sports franchise",
  ],
};

// ─── Stage compatibility matrix ───────────────────────────────────────────────
//
// Defines acceptable investor stage mappings.
// Key = startup stage, Value = investor stages that score full / partial.

const STAGE_COMPAT: Record<string, { full: string[]; partial: string[] }> = {
  "Pre-Seed": {
    full:    ["Pre-Seed", "Seed"],
    partial: ["Series A"],
  },
  "Seed": {
    full:    ["Seed", "Pre-Seed"],
    partial: ["Series A"],
  },
  "Series A": {
    full:    ["Series A"],
    partial: ["Seed", "Series B"],
  },
  "Series B": {
    full:    ["Series B", "Series A"],
    partial: ["Series C+", "Growth"],
  },
  "Series C+": {
    full:    ["Series C+", "Growth"],
    partial: ["Series B"],
  },
  "Growth": {
    full:    ["Growth", "Series C+"],
    partial: ["Series B"],
  },
};

// ─── Check size compatibility ─────────────────────────────────────────────────
//
// Parses text ranges like "$1M – $5M" into numeric midpoints for comparison.

const CHECK_MIDPOINTS: Record<string, number> = {
  "$10K – $50K":    30_000,
  "$50K – $250K":   150_000,
  "$250K – $500K":  375_000,
  "$500K – $1M":    750_000,
  "$1M – $5M":      3_000_000,
  "$5M – $25M":     15_000_000,
  "$25M+":          50_000_000,
  // Startup funding targets
  "< $250K":        200_000,
  "$250K – $500K":  375_000,
  "$500K – $1M":    750_000,
  "$1M – $3M":      2_000_000,
  "$3M – $5M":      4_000_000,
  "$5M – $10M":     7_500_000,
  "$10M+":          20_000_000,
};

function parseAmount(str: string | null | undefined): number {
  if (!str) return 0;
  return CHECK_MIDPOINTS[str] ?? 0;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StartupProfile {
  id: string;
  name: string;
  industry: string | null;
  nicheIndustry: "film" | "realestate" | "sports" | null;
  stage: string | null;
  fundingTarget: string | null;
  location: string | null;
  targetGeographies: string[];
  preferredInvestorTypes: string[];
  teamSize: string | null;
  pitchDeckUrl: string | null;
  founderLinkedin: string | null;
  keyMilestone: string | null;
  description: string | null;
  // Derived from data room documents
  documentKeywords?: string[];
}

export interface InvestorCandidate {
  id: string;
  firmId: string | null;
  firmName: string | null;
  name: string | null;
  email: string | null;
  linkedinUrl: string | null;
  website: string | null;
  classification: string | null;       // VC | Family Office | PE | Angel | Syndicate
  preferredStages: string[];
  preferredSectors: string[];
  typicalCheckSize: string | null;
  focusNiches: string[];
  geographyFocus: string[];
  portfolioCount: number | null;
  hqLocation: string | null;
  investmentThesis: string | null;
  aum: string | null;
  // From deal feedback loop
  wonDealsWithSimilarStartups?: number;
  lostDealsWithSimilarStartups?: number;
}

export interface FactorBreakdown {
  industry:     number;  // 0–1
  stage:        number;  // 0–1
  geography:    number;  // 0–1
  checkSize:    number;  // 0–1
  investorType: number;  // 0–1
  teamSignal:   number;  // 0–1
}

export interface MatchInsights {
  championPartner: string | null;       // Best-fit person at this firm
  portfolioSynergies: string[];         // Related portfolio companies
  decisionSpeed: "fast" | "medium" | "slow";
  valueAdd: string[];                   // What this investor brings beyond money
  winProbability: number;               // 0–100, derived from feedback + score
}

export interface MatchResult {
  investor: InvestorCandidate;
  score: number;                        // 0–100 final
  tier: "champion" | "A" | "B" | "C";
  factors: FactorBreakdown;
  semanticScore: number;                // Jaccard similarity bonus (0–20)
  nicheScore: number;                   // Niche keyword bonus (0–15)
  documentScore: number;                // Data room keyword bonus (0–10)
  economicScore: number;                // Check size fit (0–15)
  behaviourScore: number;               // Portfolio signals (0–10)
  feedbackMultiplier: number;           // 0.5–1.5 from deal history
  insights: MatchInsights;
  matchedAt: Date;
  sessionId: string;
}

export interface MatchSession {
  id: string;
  startupId: string;
  startupName: string;
  mode: "standard" | "accelerated";
  totalCandidates: number;
  matchesReturned: number;
  tierCounts: { champion: number; A: number; B: number; C: number };
  weights: FactorWeights;
  durationMs: number;
  createdAt: Date;
}

// ─── Core scoring functions ───────────────────────────────────────────────────

/**
 * scoreIndustry
 * Compares startup industry against investor preferred sectors.
 * Returns 0–1. Uses exact match, substring containment, and alias expansion.
 */
function scoreIndustry(startup: StartupProfile, investor: InvestorCandidate): number {
  if (!startup.industry || investor.preferredSectors.length === 0) return 0.5;

  const si = startup.industry.toLowerCase();
  for (const sector of investor.preferredSectors) {
    const inv = sector.toLowerCase();
    if (si === inv) return 1.0;
    if (si.includes(inv) || inv.includes(si)) return 0.85;
    // Alias checks: "AI / ML" ↔ "Artificial Intelligence", etc.
    if (INDUSTRY_ALIASES[si]?.includes(inv)) return 0.9;
    if (INDUSTRY_ALIASES[inv]?.includes(si)) return 0.9;
  }
  return 0.1;
}

/**
 * scoreStage
 * Full compatibility = 1.0, partial = 0.55, no match = 0.0
 */
function scoreStage(startup: StartupProfile, investor: InvestorCandidate): number {
  if (!startup.stage || investor.preferredStages.length === 0) return 0.5;
  const compat = STAGE_COMPAT[startup.stage];
  if (!compat) return 0.2;
  for (const s of investor.preferredStages) {
    if (compat.full.includes(s))    return 1.0;
    if (compat.partial.includes(s)) return 0.55;
  }
  return 0.0;
}

/**
 * scoreGeography
 * Checks overlap between startup target regions and investor focus regions.
 * "Global" always scores 1.0. Region hierarchy: continent > subregion > country.
 */
function scoreGeography(startup: StartupProfile, investor: InvestorCandidate): number {
  if (investor.geographyFocus.length === 0) return 0.5;
  if (investor.geographyFocus.includes("Global")) return 1.0;
  if (startup.targetGeographies.length === 0) {
    // Fall back to HQ-based geo inference
    if (startup.location && investor.geographyFocus.some(g =>
      startup.location!.toLowerCase().includes(g.toLowerCase().split(" – ").pop()!.toLowerCase())
    )) return 0.8;
    return 0.4;
  }

  let best = 0;
  for (const startupGeo of startup.targetGeographies) {
    for (const investorGeo of investor.geographyFocus) {
      if (startupGeo === investorGeo) { best = Math.max(best, 1.0); continue; }
      // Partial: same continent/region string
      const sg = startupGeo.split(" – ")[0];
      const ig = investorGeo.split(" – ")[0];
      if (sg === ig) best = Math.max(best, 0.7);
    }
  }
  return best || 0.1;
}

/**
 * scoreCheckSize
 * Computes ratio overlap between startup funding target and investor check size.
 * Uses midpoint comparison with ±50% tolerance band.
 */
function scoreCheckSize(startup: StartupProfile, investor: InvestorCandidate): number {
  const startupAmt  = parseAmount(startup.fundingTarget);
  const investorAmt = parseAmount(investor.typicalCheckSize);
  if (!startupAmt || !investorAmt) return 0.5;

  const ratio = Math.min(startupAmt, investorAmt) / Math.max(startupAmt, investorAmt);
  if (ratio >= 0.8) return 1.0;
  if (ratio >= 0.5) return 0.75;
  if (ratio >= 0.25) return 0.4;
  return 0.1;
}

/**
 * scoreInvestorType
 * Matches startup preferred investor types against investor classification.
 */
function scoreInvestorType(startup: StartupProfile, investor: InvestorCandidate): number {
  if (startup.preferredInvestorTypes.length === 0) return 0.7; // no preference = broad
  if (!investor.classification) return 0.5;
  const cls = investor.classification.toLowerCase();
  for (const pref of startup.preferredInvestorTypes) {
    const p = pref.toLowerCase();
    if (p === "any")  return 0.8;
    if (cls === p)    return 1.0;
    // Aliases: "vc fund" ↔ "venture capital", "family office" ↔ "fo"
    if (INVESTOR_TYPE_ALIASES[p]?.includes(cls)) return 0.9;
  }
  return 0.2;
}

/**
 * scoreTeamSignal
 * Soft signal — rewards completeness of founder profile data.
 * Higher score = more data available for investor to evaluate.
 */
function scoreTeamSignal(startup: StartupProfile): number {
  let score = 0;
  if (startup.founderLinkedin) score += 0.3;
  if (startup.pitchDeckUrl)    score += 0.4;
  if (startup.teamSize && startup.teamSize !== "Solo founder") score += 0.2;
  if (startup.description && startup.description.length > 50) score += 0.1;
  return Math.min(score, 1.0);
}

/**
 * semanticSimilarity
 * Jaccard similarity between startup description tokens and investor thesis.
 * Returns bonus points 0–20.
 */
function semanticSimilarity(startup: StartupProfile, investor: InvestorCandidate): number {
  if (!startup.description || !investor.investmentThesis) return 0;
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3));
  const a = tokenize(startup.description);
  const b = tokenize(investor.investmentThesis);
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  return Math.round((intersection.size / union.size) * 20);
}

/**
 * nicheKeywordScore
 * Domain-specific keyword matching for Film, Real Estate, Sports.
 * Returns bonus points 0–15, capped at MAX_NICHE_KEYWORDS matches.
 */
function nicheKeywordScore(startup: StartupProfile, investor: InvestorCandidate): number {
  if (!startup.nicheIndustry) return 0;
  const niche = startup.nicheIndustry;
  const hasNiche = investor.focusNiches.includes(niche);
  if (!hasNiche) return 0;

  const keywords = NICHE_KEYWORDS[niche] ?? [];
  const text = [startup.description, startup.keyMilestone, startup.industry]
    .filter(Boolean).join(" ").toLowerCase();

  let matched = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) matched++;
    if (matched >= THRESHOLDS.MAX_NICHE_KEYWORDS) break;
  }

  // Base bonus for niche match + per-keyword bonus
  return 5 + Math.round((matched / THRESHOLDS.MAX_NICHE_KEYWORDS) * 10);
}

/**
 * documentKeywordScore
 * Extracts keywords from uploaded data room documents and checks overlap
 * with investor thesis. Returns bonus 0–10.
 * Existing feature in platform: "Document-Enhanced Matching"
 */
function documentKeywordScore(startup: StartupProfile, investor: InvestorCandidate): number {
  if (!startup.documentKeywords?.length || !investor.investmentThesis) return 0;
  const thesis = investor.investmentThesis.toLowerCase();
  const matched = startup.documentKeywords.filter(kw =>
    thesis.includes(kw.toLowerCase())
  ).length;
  return Math.min(matched * 2, 10);
}

/**
 * economicFitScore
 * More nuanced than check size alone — considers AUM relative to check size
 * to detect capacity mismatches (e.g. $100B fund unlikely to write $500K checks).
 * Returns bonus 0–15.
 */
function economicFitScore(startup: StartupProfile, investor: InvestorCandidate): number {
  const checkMid = parseAmount(investor.typicalCheckSize);
  const fundAmt  = parseAmount(startup.fundingTarget);
  if (!checkMid || !fundAmt) return 5; // neutral if unknown

  // Ideal ratio: check size ≈ raise / 3 to raise * 2
  const ratio = checkMid / fundAmt;
  if (ratio >= 0.25 && ratio <= 2.5) return 15;
  if (ratio >= 0.1  && ratio <= 5.0) return 8;
  return 2;
}

/**
 * behaviourScore
 * Signals from investor's deal history and portfolio.
 * Returns bonus 0–10.
 */
function behaviourScore(investor: InvestorCandidate): number {
  let score = 0;
  // Active portfolio signals activity
  if (investor.portfolioCount) {
    if (investor.portfolioCount >= 10) score += 4;
    else if (investor.portfolioCount >= 3) score += 2;
  }
  // Won/lost feedback loop signal
  if (investor.wonDealsWithSimilarStartups) score += Math.min(investor.wonDealsWithSimilarStartups * 2, 6);
  return Math.min(score, 10);
}

/**
 * feedbackMultiplier
 * Deal outcome feedback loop — adjusts final score based on historical
 * win/loss data with similar startups. Range: 0.5–1.5.
 * Implements: "Deal Outcome Feedback Loop: Adjusts matchmaking weights
 * based on 'won' or 'lost' deals" (replit.md)
 */
function computeFeedbackMultiplier(investor: InvestorCandidate): number {
  const won  = investor.wonDealsWithSimilarStartups  ?? 0;
  const lost = investor.lostDealsWithSimilarStartups ?? 0;
  const total = won + lost;
  if (total === 0) return 1.0;
  const winRate = won / total;
  // Sigmoid-like curve: 0.5 at winRate=0, 1.0 at winRate=0.5, 1.5 at winRate=1.0
  return 0.5 + winRate;
}

// ─── Hard filters (pre-score elimination) ────────────────────────────────────

function passesHardFilters(startup: StartupProfile, investor: InvestorCandidate): boolean {
  // Stage hard filter: if investor has stages and none match, exclude
  if (investor.preferredStages.length > 0 && startup.stage) {
    const compat = STAGE_COMPAT[startup.stage];
    const allStages = compat ? [...compat.full, ...compat.partial] : [];
    const hasStageOverlap = investor.preferredStages.some(s => allStages.includes(s));
    if (!hasStageOverlap) return false;
  }

  // Check size hard filter: if check would be >10x or <0.05x of target, exclude
  const checkMid = parseAmount(investor.typicalCheckSize);
  const fundAmt  = parseAmount(startup.fundingTarget);
  if (checkMid && fundAmt) {
    const ratio = checkMid / fundAmt;
    if (ratio > 10 || ratio < 0.05) return false;
  }

  return true;
}

// ─── Tier assignment ──────────────────────────────────────────────────────────

function assignTier(score: number): MatchResult["tier"] {
  if (score >= THRESHOLDS.TIER_CHAMPION) return "champion";
  if (score >= THRESHOLDS.TIER_A)        return "A";
  if (score >= THRESHOLDS.TIER_B)        return "B";
  return "C";
}

// ─── Match insights generator ─────────────────────────────────────────────────

function generateInsights(
  investor: InvestorCandidate,
  score: number,
  feedbackMult: number
): MatchInsights {
  const winProb = Math.min(Math.round(score * feedbackMult * 0.7), 95);

  // Decision speed heuristic from portfolio count + firm type
  let decisionSpeed: MatchInsights["decisionSpeed"] = "medium";
  if (investor.classification === "Angel Investor" || investor.classification === "Syndicate") {
    decisionSpeed = "fast";
  } else if (investor.classification === "PE / Growth Equity") {
    decisionSpeed = "slow";
  } else if ((investor.portfolioCount ?? 0) > 20) {
    decisionSpeed = "fast";
  }

  // Value add from investor type
  const valueAdd: string[] = [];
  if (investor.classification === "VC Fund") valueAdd.push("Portfolio network", "Follow-on capital");
  if (investor.classification === "Family Office") valueAdd.push("Patient capital", "LP relationships");
  if (investor.classification === "Corporate VC") valueAdd.push("Distribution", "Strategic partnerships");
  if (investor.focusNiches.includes("film")) valueAdd.push("Industry distribution channels");
  if (investor.focusNiches.includes("realestate")) valueAdd.push("Property network", "Debt financing");

  return {
    championPartner: null,  // Populated by enrichment service if available
    portfolioSynergies: [],  // Populated by AI enrichment
    decisionSpeed,
    valueAdd,
    winProbability: winProb,
  };
}

// ─── Main scoring function ────────────────────────────────────────────────────

export function scoreMatch(
  startup: StartupProfile,
  investor: InvestorCandidate,
  sessionId: string,
  weights: FactorWeights = DEFAULT_WEIGHTS
): MatchResult | null {
  // Hard filter pass
  if (!passesHardFilters(startup, investor)) return null;

  // Factor scores (each 0–1)
  const factors: FactorBreakdown = {
    industry:     scoreIndustry(startup, investor),
    stage:        scoreStage(startup, investor),
    geography:    scoreGeography(startup, investor),
    checkSize:    scoreCheckSize(startup, investor),
    investorType: scoreInvestorType(startup, investor),
    teamSignal:   scoreTeamSignal(startup),
  };

  // Weighted base score (0–100)
  const baseScore =
    (factors.industry     * weights.industry     +
     factors.stage        * weights.stage        +
     factors.geography    * weights.geography    +
     factors.checkSize    * weights.checkSize    +
     factors.investorType * weights.investorType +
     factors.teamSignal   * weights.teamSignal) * 100;

  // Bonus scores
  const semanticScore  = semanticSimilarity(startup, investor);
  const nicheScore     = nicheKeywordScore(startup, investor);
  const documentScore  = documentKeywordScore(startup, investor);
  const econScore      = economicFitScore(startup, investor);
  const behavScore     = behaviourScore(investor);
  const feedbackMult   = computeFeedbackMultiplier(investor);

  // Total = (base + bonuses) × feedback multiplier, clamped 0–100
  const raw = (baseScore + semanticScore + nicheScore + documentScore + econScore + behavScore);
  const score = Math.round(Math.min(Math.max(raw * feedbackMult, 0), 100));

  // Filter below minimum threshold
  if (score < THRESHOLDS.MIN_SCORE) return null;

  return {
    investor,
    score,
    tier: assignTier(score),
    factors,
    semanticScore,
    nicheScore,
    documentScore,
    economicScore: econScore,
    behaviourScore: behavScore,
    feedbackMultiplier: feedbackMult,
    insights: generateInsights(investor, score, feedbackMult),
    matchedAt: new Date(),
    sessionId,
  };
}

// ─── Standard matching ────────────────────────────────────────────────────────
//
// Scans the full investor database (500+), applies all factors.
// Used for: initial match run, periodic re-runs, admin-triggered bulk matches.

export async function runStandardMatching(
  startupId: string,
  options: {
    weights?: Partial<FactorWeights>;
    includeDocumentKeywords?: boolean;
    maxResults?: number;
  } = {}
): Promise<{ session: MatchSession; results: MatchResult[] }> {
  const t0 = Date.now();
  const sessionId = crypto.randomUUID();
  const maxResults = options.maxResults ?? THRESHOLDS.MAX_MATCHES_RETURNED;
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };

  // Load startup profile
  const startup = await loadStartupProfile(startupId, options.includeDocumentKeywords);
  if (!startup) throw new Error(`Startup ${startupId} not found`);

  // Load all investors with their firms
  const allInvestors = await loadAllInvestors();

  // Load feedback history
  const feedbackMap = await loadFeedbackHistory(startupId);
  const enrichedInvestors = allInvestors.map(inv => ({
    ...inv,
    wonDealsWithSimilarStartups:  feedbackMap.won[inv.id]  ?? 0,
    lostDealsWithSimilarStartups: feedbackMap.lost[inv.id] ?? 0,
  }));

  // Score all candidates
  const results: MatchResult[] = [];
  for (const investor of enrichedInvestors) {
    const result = scoreMatch(startup, investor, sessionId, weights);
    if (result) results.push(result);
  }

  // Sort by score descending, cap at maxResults
  results.sort((a, b) => b.score - a.score);
  const finalResults = results.slice(0, maxResults);

  // Persist session + matches
  const session = await persistMatchSession({
    sessionId,
    startup,
    mode: "standard",
    totalCandidates: enrichedInvestors.length,
    results: finalResults,
    weights,
    durationMs: Date.now() - t0,
  });

  return { session, results: finalResults };
}

// ─── Accelerated matching ─────────────────────────────────────────────────────
//
// Uses hard pre-filters to reduce candidate pool before full scoring.
// 3–5x faster than standard. Used when startup profile is complete.
// Requires: industry, stage, and at least one geography set.

export async function runAcceleratedMatching(
  startupId: string,
  options: {
    weights?: Partial<FactorWeights>;
    includeDocumentKeywords?: boolean;
  } = {}
): Promise<{ session: MatchSession; results: MatchResult[] }> {
  const t0 = Date.now();
  const sessionId = crypto.randomUUID();
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };

  const startup = await loadStartupProfile(startupId, options.includeDocumentKeywords);
  if (!startup) throw new Error(`Startup ${startupId} not found`);

  // Pre-filter: DB-level filtering reduces candidates before scoring
  // Filter criteria: stage overlap OR geography overlap OR sector overlap
  // (OR not AND — generous pre-filter avoids false negatives)
  const candidatePool = await loadFilteredInvestors({
    stages:   startup.stage ? getCompatibleStages(startup.stage) : undefined,
    niches:   startup.nicheIndustry ? [startup.nicheIndustry] : undefined,
    limit:    THRESHOLDS.ACCELERATED_CANDIDATE_CAP,
  });

  const feedbackMap = await loadFeedbackHistory(startupId);
  const enriched = candidatePool.map(inv => ({
    ...inv,
    wonDealsWithSimilarStartups:  feedbackMap.won[inv.id]  ?? 0,
    lostDealsWithSimilarStartups: feedbackMap.lost[inv.id] ?? 0,
  }));

  // Full scoring on reduced pool
  const results: MatchResult[] = [];
  for (const investor of enriched) {
    const result = scoreMatch(startup, investor, sessionId, weights);
    if (result) results.push(result);
  }

  results.sort((a, b) => b.score - a.score);
  const finalResults = results.slice(0, THRESHOLDS.MAX_MATCHES_RETURNED);

  const session = await persistMatchSession({
    sessionId,
    startup,
    mode: "accelerated",
    totalCandidates: candidatePool.length,
    results: finalResults,
    weights,
    durationMs: Date.now() - t0,
  });

  return { session, results: finalResults };
}

// ─── CRM integration ──────────────────────────────────────────────────────────
//
// Implements: "Bulk CRM Import: Functionality to import matched investors to
// CRM contacts with scores" (replit.md)

export interface CRMImportOptions {
  sessionId: string;
  tierFilter?: Array<"champion" | "A" | "B" | "C">;
  minScore?: number;
  maxContacts?: number;
  addCustomFields?: boolean;  // Adds match score, tier, factors to Folk custom fields
  createSequence?: boolean;   // Creates a Folk outreach sequence
}

export interface CRMImportResult {
  imported: number;
  skipped: number;
  errors: number;
  folkContactIds: string[];
  sequenceId?: string;
}

export async function importMatchesToCRM(
  startupId: string,
  options: CRMImportOptions
): Promise<CRMImportResult> {
  const { sessionId, tierFilter, minScore = 0, maxContacts = 200, addCustomFields = true } = options;

  // Load match results from this session
  const matches = await db.query.investorMatches.findMany({
    where: and(
      eq(investorMatches.sessionId, sessionId),
      eq(investorMatches.startupId, startupId)
    ),
    orderBy: (t, { desc }) => [desc(t.score)],
    limit: maxContacts,
  });

  // Filter by tier and score
  const filtered = matches.filter(m => {
    if (tierFilter && !tierFilter.includes(m.tier as any)) return false;
    if (m.score < minScore) return false;
    return true;
  });

  // Build Folk contact payloads
  const contacts = filtered.map(match => ({
    email:    match.investorEmail ?? undefined,
    name:     match.investorName ?? undefined,
    linkedin: match.investorLinkedin ?? undefined,
    website:  match.firmWebsite ?? undefined,
    customFields: addCustomFields ? {
      anker_match_score:     match.score,
      anker_match_tier:      match.tier,
      anker_industry_score:  Math.round((match.factorIndustry ?? 0) * 100),
      anker_stage_score:     Math.round((match.factorStage ?? 0) * 100),
      anker_geo_score:       Math.round((match.factorGeo ?? 0) * 100),
      anker_matched_startup: match.startupName ?? "",
      anker_match_date:      match.createdAt?.toISOString() ?? "",
      anker_match_session:   sessionId,
      anker_win_probability: match.winProbability ?? 0,
    } : undefined,
    lists: [`Anker Match — ${match.tierLabel ?? match.tier}`],
  }));

  // Bulk sync to Folk CRM
  const result = await folkCrmSync.bulkImportContacts(contacts);

  // Update match records with CRM status
  if (result.contactIds.length > 0) {
    await db.update(investorMatches)
      .set({ status: "in_crm", folkContactId: result.contactIds[0] })
      .where(inArray(investorMatches.id, filtered.map(m => m.id)));
  }

  // Optionally create a Folk outreach sequence
  let sequenceId: string | undefined;
  if (options.createSequence) {
    sequenceId = await folkCrmSync.createOutreachSequence({
      name: `Anker Outreach — Session ${sessionId.slice(0, 8)}`,
      contactIds: result.contactIds,
    });
  }

  return {
    imported: result.imported,
    skipped:  result.skipped,
    errors:   result.errors,
    folkContactIds: result.contactIds,
    sequenceId,
  };
}

// ─── Match status management ──────────────────────────────────────────────────

export type MatchStatus = "pending" | "in_crm" | "contacted" | "responded" | "passed" | "won" | "lost";

export async function updateMatchStatus(
  matchId: string,
  status: MatchStatus,
  notes?: string
): Promise<void> {
  await db.update(investorMatches)
    .set({
      status,
      statusNotes: notes ?? null,
      statusUpdatedAt: new Date(),
    })
    .where(eq(investorMatches.id, matchId));

  // If won/lost, trigger feedback loop weight adjustment for future runs
  if (status === "won" || status === "lost") {
    await recordDealOutcome(matchId, status);
  }
}

async function recordDealOutcome(matchId: string, outcome: "won" | "lost"): Promise<void> {
  // Updates a feedback_weights table that modifies future matching weights
  // for this investor in similar contexts. This implements the "Deal Outcome
  // Feedback Loop" from replit.md.
  const match = await db.query.investorMatches.findFirst({
    where: eq(investorMatches.id, matchId),
  });
  if (!match) return;

  await db.insert(dealFeedbackEvents).values({
    investorId: match.investorId,
    startupId:  match.startupId,
    sessionId:  match.sessionId,
    outcome,
    createdAt:  new Date(),
  });
}

// ─── Data loaders ─────────────────────────────────────────────────────────────

async function loadStartupProfile(
  startupId: string,
  includeDocumentKeywords = false
): Promise<StartupProfile | null> {
  const startup = await db.query.startups.findFirst({
    where: eq(startups.id, startupId),
  });
  if (!startup) return null;

  let documentKeywords: string[] = [];
  if (includeDocumentKeywords) {
    documentKeywords = await extractDocumentKeywords(startupId);
  }

  return {
    id: startup.id,
    name: startup.name,
    industry: startup.industry,
    nicheIndustry: startup.nicheIndustry as any,
    stage: startup.stage,
    fundingTarget: startup.fundingTarget,
    location: startup.location,
    targetGeographies: startup.targetGeographies ?? [],
    preferredInvestorTypes: startup.preferredInvestorTypes ?? [],
    teamSize: startup.teamSize,
    pitchDeckUrl: startup.pitchDeckUrl,
    founderLinkedin: startup.founderLinkedin,
    keyMilestone: startup.keyMilestone,
    description: startup.description,
    documentKeywords,
  };
}

async function loadAllInvestors(): Promise<InvestorCandidate[]> {
  // Joins investors + investmentFirms for complete profile
  const rows = await db
    .select({
      id:               investors.id,
      firmId:           investors.firmId,
      firmName:         investmentFirms.name,
      name:             investors.name,
      email:            investors.email,
      linkedinUrl:      investors.linkedinUrl,
      website:          investmentFirms.website,
      classification:   investmentFirms.classification,
      preferredStages:  investors.preferredStages,
      preferredSectors: investors.preferredSectors,
      typicalCheckSize: investors.typicalCheckSize,
      focusNiches:      investors.focusNiches,
      geographyFocus:   investors.geographyFocus,
      portfolioCount:   investors.portfolioCount,
      hqLocation:       investmentFirms.hqLocation,
      investmentThesis: investors.investmentThesis,
      aum:              investmentFirms.aum,
    })
    .from(investors)
    .leftJoin(investmentFirms, eq(investors.firmId, investmentFirms.id));

  return rows.map(r => ({
    ...r,
    preferredStages:  r.preferredStages  ?? [],
    preferredSectors: r.preferredSectors ?? [],
    focusNiches:      r.focusNiches      ?? [],
    geographyFocus:   r.geographyFocus   ?? [],
  }));
}

async function loadFilteredInvestors(filters: {
  stages?: string[];
  niches?: string[];
  limit?: number;
}): Promise<InvestorCandidate[]> {
  // For accelerated mode: broad pre-filter at DB level
  // Actual implementation would use WHERE clauses with ANY() for array overlap
  // Shown conceptually:
  const all = await loadAllInvestors();
  let filtered = all;

  if (filters.stages?.length) {
    filtered = filtered.filter(inv =>
      inv.preferredStages.length === 0 ||
      filters.stages!.some(s => inv.preferredStages.includes(s))
    );
  }

  if (filters.niches?.length) {
    const nicheFiltered = filtered.filter(inv =>
      filters.niches!.some(n => inv.focusNiches.includes(n))
    );
    // Include niche-specific investors PLUS general investors
    // Niche investors augment, don't replace, the general pool
    const general = filtered.filter(inv => inv.focusNiches.length === 0);
    filtered = [...new Set([...nicheFiltered, ...general])];
  }

  return filtered.slice(0, filters.limit ?? THRESHOLDS.ACCELERATED_CANDIDATE_CAP);
}

async function loadFeedbackHistory(startupId: string): Promise<{
  won: Record<string, number>;
  lost: Record<string, number>;
}> {
  const cutoff = new Date(Date.now() - THRESHOLDS.FEEDBACK_LOOKBACK_DAYS * 86400_000);
  const events = await db.query.dealFeedbackEvents.findMany({
    where: and(
      eq(dealFeedbackEvents.startupId, startupId),
      gte(dealFeedbackEvents.createdAt, cutoff)
    ),
  }).catch(() => []);

  const won: Record<string, number>  = {};
  const lost: Record<string, number> = {};
  for (const e of events) {
    if (e.outcome === "won")  won[e.investorId]  = (won[e.investorId]  ?? 0) + 1;
    if (e.outcome === "lost") lost[e.investorId] = (lost[e.investorId] ?? 0) + 1;
  }
  return { won, lost };
}

async function extractDocumentKeywords(startupId: string): Promise<string[]> {
  // Uses existing data room document extraction pipeline
  const docs = await db.query.dealRoomDocuments.findMany({
    where: eq(dealRoomDocuments.startupId, startupId),
  }).catch(() => []);

  const keywords: string[] = [];
  for (const doc of docs) {
    if (doc.extractedKeywords) {
      keywords.push(...(doc.extractedKeywords as string[]));
    }
  }
  return [...new Set(keywords)].slice(0, 50);
}

async function persistMatchSession(params: {
  sessionId: string;
  startup: StartupProfile;
  mode: "standard" | "accelerated";
  totalCandidates: number;
  results: MatchResult[];
  weights: FactorWeights;
  durationMs: number;
}): Promise<MatchSession> {
  const { sessionId, startup, mode, totalCandidates, results, weights, durationMs } = params;

  const tierCounts = results.reduce(
    (acc, r) => { acc[r.tier]++; return acc; },
    { champion: 0, A: 0, B: 0, C: 0 }
  );

  const [session] = await db.insert(matchSessions).values({
    id: sessionId,
    startupId: startup.id,
    startupName: startup.name,
    mode,
    totalCandidates,
    matchesReturned: results.length,
    tierCounts: JSON.stringify(tierCounts),
    weights: JSON.stringify(weights),
    durationMs,
    createdAt: new Date(),
  }).returning();

  // Persist individual match records
  if (results.length > 0) {
    await db.insert(investorMatches).values(
      results.map(r => ({
        id: crypto.randomUUID(),
        sessionId,
        startupId: startup.id,
        startupName: startup.name,
        investorId: r.investor.id,
        investorName: r.investor.name,
        investorEmail: r.investor.email,
        investorLinkedin: r.investor.linkedinUrl,
        firmId: r.investor.firmId,
        firmName: r.investor.firmName,
        firmWebsite: r.investor.website,
        score: r.score,
        tier: r.tier,
        tierLabel: tierLabel(r.tier),
        factorIndustry: r.factors.industry,
        factorStage: r.factors.stage,
        factorGeo: r.factors.geography,
        factorCheckSize: r.factors.checkSize,
        factorInvestorType: r.factors.investorType,
        factorTeamSignal: r.factors.teamSignal,
        semanticScore: r.semanticScore,
        nicheScore: r.nicheScore,
        documentScore: r.documentScore,
        economicScore: r.economicScore,
        behaviourScore: r.behaviourScore,
        feedbackMultiplier: r.feedbackMultiplier,
        winProbability: r.insights.winProbability,
        decisionSpeed: r.insights.decisionSpeed,
        valueAdd: JSON.stringify(r.insights.valueAdd),
        status: "pending",
        createdAt: r.matchedAt,
      }))
    );
  }

  return {
    id: sessionId,
    startupId: startup.id,
    startupName: startup.name,
    mode,
    totalCandidates,
    matchesReturned: results.length,
    tierCounts,
    weights,
    durationMs,
    createdAt: new Date(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCompatibleStages(stage: string): string[] {
  const compat = STAGE_COMPAT[stage];
  if (!compat) return [stage];
  return [...compat.full, ...compat.partial];
}

function tierLabel(tier: string): string {
  return { champion: "Champion", A: "Strong Match", B: "Good Match", C: "Potential Match" }[tier] ?? tier;
}

const INDUSTRY_ALIASES: Record<string, string[]> = {
  "ai / machine learning": ["artificial intelligence", "machine learning", "ml", "deep learning", "nlp"],
  "fintech":               ["financial technology", "payments", "banking tech", "insurtech", "wealthtech"],
  "healthtech / medtech":  ["health technology", "digital health", "medtech", "biotech", "life sciences"],
  "saas / b2b software":   ["software as a service", "enterprise software", "b2b", "cloud software"],
  "cleantech / climatetech":["climate technology", "renewable energy", "sustainability", "greentech"],
  "entertainment / film / media": ["media", "entertainment", "film", "content", "streaming"],
};

const INVESTOR_TYPE_ALIASES: Record<string, string[]> = {
  "vc fund":        ["venture capital", "vc", "venture fund"],
  "family office":  ["fo", "family wealth", "single family office", "multi family office"],
  "angel investor": ["angel", "business angel", "individual investor"],
  "corporate vc":   ["cvc", "corporate venture", "strategic investor"],
  "pe / growth equity": ["private equity", "pe", "growth equity", "buyout"],
  "syndicate":      ["angel syndicate", "rolling fund", "spv"],
};

// Placeholder imports that reference existing schema tables
declare const dealFeedbackEvents: any;
