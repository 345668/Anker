/**
 * Matchmaking Engine V2 — Unified rule-based investor-founder matching
 * No embeddings, no third-party AI calls. Pure deterministic multi-factor scoring.
 */

import { db } from "../db";
import {
  investors, investmentFirms, startups, dealRoomDocuments,
  matchSessions, investorMatches, dealFeedbackEvents,
} from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { folkService } from "./folk";

// ─── Scoring thresholds & tier labels ────────────────────────────────────────
const MIN_SCORE = 35;
const TIER_CHAMPION = 85;
const TIER_A = 70;
const TIER_B = 55;
const TIER_C = 35;
const MAX_MATCHES = 200;

// ─── Default factor weights ───────────────────────────────────────────────────
const DEFAULT_WEIGHTS: Record<string, number> = {
  industry: 0.30,
  stage: 0.22,
  geo: 0.15,
  checkSize: 0.13,
  investorType: 0.12,
  teamSignal: 0.08,
};

// ─── Stage mapping ────────────────────────────────────────────────────────────
const STAGE_ORDER: Record<string, number> = {
  "pre-seed": 1, "preseed": 1,
  "seed": 2,
  "series a": 3, "seriesa": 3,
  "series b": 4, "seriesb": 4,
  "series c": 5, "seriesc": 5,
  "growth": 6, "late stage": 6, "latestage": 6,
  "ipo": 7,
};

// ─── Check size parsing ───────────────────────────────────────────────────────
function parseCheckSizeRange(raw?: string | null): [number, number] | null {
  if (!raw) return null;
  const cleaned = raw.toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const patterns = [
    /\$?([\d.]+)k?m?[-–]([\d.]+)k?m?/,
    /upto\$?([\d.]+)([km]?)/i,
    /\$?([\d.]+)([km]?)\+/i,
  ];
  const mults: Record<string, number> = { k: 1000, m: 1_000_000, "": 1 };

  for (const p of patterns) {
    const m = cleaned.match(p);
    if (!m) continue;
    if (m[2] !== undefined && m[3] === undefined) {
      const v = parseFloat(m[1]) * (mults[m[2]] ?? 1);
      return [0, v];
    }
    const lo = parseFloat(m[1]);
    const hi = parseFloat(m[2]);
    if (isNaN(lo) || isNaN(hi)) continue;
    const mLo = cleaned.includes("m") ? 1_000_000 : cleaned.includes("k") ? 1000 : 1;
    return [lo * mLo, hi * mLo];
  }
  return null;
}

function checkSizeOverlap(a?: [number, number] | null, b?: [number, number] | null): number {
  if (!a || !b) return 0;
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  if (hi <= lo) return 0;
  const union = Math.max(a[1], b[1]) - Math.min(a[0], b[0]);
  return union > 0 ? (hi - lo) / union : 0;
}

// ─── Niche mappings ───────────────────────────────────────────────────────────
const FILM_KEYWORDS = ["film", "movie", "cinema", "entertainment", "media", "content", "production", "studio", "streaming", "animation"];
const REAL_ESTATE_KEYWORDS = ["real estate", "property", "proptech", "realestate", "reit", "residential", "commercial", "housing", "construction", "mortgage"];
const SPORTS_KEYWORDS = ["sports", "athletics", "fitness", "esports", "gaming", "wellness", "health tech"];

function detectNiche(text: string): string | null {
  const low = text.toLowerCase();
  if (FILM_KEYWORDS.some(k => low.includes(k))) return "film";
  if (REAL_ESTATE_KEYWORDS.some(k => low.includes(k))) return "realestate";
  if (SPORTS_KEYWORDS.some(k => low.includes(k))) return "sports";
  return null;
}

// ─── Jaccard similarity ───────────────────────────────────────────────────────
function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a.map(x => x.toLowerCase()));
  const sb = new Set(b.map(x => x.toLowerCase()));
  const intersection = [...sa].filter(x => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union > 0 ? intersection / union : 0;
}

// ─── Data interfaces ──────────────────────────────────────────────────────────
export interface MatchStartup {
  id: string;
  name: string;
  industry: string | null;
  nicheIndustry: string | null;
  stage: string | null;
  location: string | null;
  fundingTarget: string | null;
  targetAmount: number | null;
  targetGeographies: string[];
  preferredInvestorTypes: string[];
  industries: string[];
  teamSize: number | null;
  pitchDeckUrl: string | null;
  founderLinkedin: string | null;
  keyMilestone: string | null;
}

export interface MatchInvestor {
  id: string;
  name: string;
  email: string | null;
  linkedinUrl: string | null;
  firmId: string | null;
  firmName: string | null;
  firmWebsite: string | null;
  firmType: string | null;
  firmHq: string | null;
  firmAum: string | null;
  preferredStages: string[];
  preferredSectors: string[];
  focusNiches: string[];
  geographyFocus: string[];
  typicalCheckSize: string | null;
  portfolioCount: number | null;
  investmentThesis: string | null;
  leadInvestments: number | null;
  totalInvestments: number | null;
}

export interface ScoreBreakdown {
  total: number;
  tier: "champion" | "A" | "B" | "C";
  tierLabel: string;
  factorIndustry: number;
  factorStage: number;
  factorGeo: number;
  factorCheckSize: number;
  factorInvestorType: number;
  factorTeamSignal: number;
  semanticScore: number;
  nicheScore: number;
  documentScore: number;
  economicScore: number;
  behaviourScore: number;
  feedbackMultiplier: number;
  winProbability: number;
  decisionSpeed: "fast" | "medium" | "slow";
  valueAdd: string[];
}

// ─── Load startup profile ─────────────────────────────────────────────────────
async function loadStartupProfile(startupId: string): Promise<MatchStartup | null> {
  const [s] = await db.select().from(startups).where(eq(startups.id, startupId)).limit(1);
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    industry: (s.industries as string[] | null)?.[0] ?? null,
    nicheIndustry: (s as any).nicheIndustry ?? null,
    stage: s.stage ?? null,
    location: s.location ?? null,
    fundingTarget: (s as any).fundingTarget ?? null,
    targetAmount: s.targetAmount ?? null,
    targetGeographies: ((s as any).targetGeographies as string[] | null) ?? [],
    preferredInvestorTypes: ((s as any).preferredInvestorTypes as string[] | null) ?? [],
    industries: (s.industries as string[] | null) ?? [],
    teamSize: s.teamSize ?? null,
    pitchDeckUrl: s.pitchDeckUrl ?? null,
    founderLinkedin: (s as any).founderLinkedin ?? s.linkedinUrl ?? null,
    keyMilestone: (s as any).keyMilestone ?? null,
  };
}

// ─── Load all investors ───────────────────────────────────────────────────────
async function loadAllInvestors(): Promise<MatchInvestor[]> {
  const rows = await db
    .select({
      id: investors.id,
      firstName: investors.firstName,
      lastName: investors.lastName,
      email: investors.email,
      linkedinUrl: investors.linkedinUrl,
      firmId: investors.firmId,
      stages: investors.stages,
      sectors: investors.sectors,
      typicalInvestment: investors.typicalInvestment,
      totalInvestments: investors.totalInvestments,
      numLeadInvestments: investors.numLeadInvestments,
      bio: investors.bio,
      investorType: investors.investorType,
      // V2 new fields
      preferredStages: (investors as any).preferredStages,
      preferredSectors: (investors as any).preferredSectors,
      typicalCheckSize: (investors as any).typicalCheckSize,
      focusNiches: (investors as any).focusNiches,
      geographyFocus: (investors as any).geographyFocus,
      portfolioCount: (investors as any).portfolioCount,
      investmentThesis: (investors as any).investmentThesis,
      // Firm fields
      firmName: investmentFirms.name,
      firmWebsite: investmentFirms.website,
      firmType: investmentFirms.type,
      firmClassification: (investmentFirms as any).firmClassification,
      firmHq: investmentFirms.hqLocation,
      firmAum: investmentFirms.aum,
    })
    .from(investors)
    .leftJoin(investmentFirms, eq(investors.firmId, investmentFirms.id))
    .where(eq(investors.isActive, true));

  return rows.map(r => ({
    id: r.id,
    name: `${r.firstName ?? ""}${r.lastName ? " " + r.lastName : ""}`.trim() || "Unknown",
    email: r.email ?? null,
    linkedinUrl: r.linkedinUrl ?? null,
    firmId: r.firmId ?? null,
    firmName: r.firmName ?? null,
    firmWebsite: r.firmWebsite ?? null,
    firmType: r.firmClassification ?? r.firmType ?? r.investorType ?? null,
    firmHq: r.firmHq ?? null,
    firmAum: r.firmAum ?? null,
    preferredStages: (r.preferredStages as string[] | null) ?? (r.stages as string[] | null) ?? [],
    preferredSectors: (r.preferredSectors as string[] | null) ?? (r.sectors as string[] | null) ?? [],
    focusNiches: (r.focusNiches as string[] | null) ?? [],
    geographyFocus: (r.geographyFocus as string[] | null) ?? [],
    typicalCheckSize: (r.typicalCheckSize as string | null) ?? r.typicalInvestment ?? null,
    portfolioCount: (r.portfolioCount as number | null) ?? r.totalInvestments ?? null,
    investmentThesis: (r.investmentThesis as string | null) ?? r.bio ?? null,
    leadInvestments: r.numLeadInvestments ?? null,
    totalInvestments: r.totalInvestments ?? null,
  }));
}

// ─── Load document keywords for a startup ────────────────────────────────────
async function loadDocumentKeywords(startupId: string): Promise<string[]> {
  const docs = await db
    .select({ keywords: (dealRoomDocuments as any).extractedKeywords, text: dealRoomDocuments.extractedText })
    .from(dealRoomDocuments)
    .where(eq((dealRoomDocuments as any).startupId, startupId));

  const keywords: string[] = [];
  for (const d of docs) {
    if (Array.isArray(d.keywords)) keywords.push(...d.keywords);
    if (d.text) {
      const words = d.text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
      keywords.push(...words.slice(0, 50));
    }
  }
  return [...new Set(keywords)];
}

// ─── Load feedback multiplier map ────────────────────────────────────────────
async function loadFeedbackMap(startupId: string): Promise<Map<string, number>> {
  const events = await db
    .select()
    .from(dealFeedbackEvents)
    .where(eq(dealFeedbackEvents.startupId, startupId));

  const map = new Map<string, number>();
  for (const e of events) {
    const cur = map.get(e.investorId) ?? 1.0;
    map.set(e.investorId, e.outcome === "won" ? cur * 1.15 : cur * 0.85);
  }
  return map;
}

// ─── Core scoring function ────────────────────────────────────────────────────
function scoreInvestor(
  startup: MatchStartup,
  investor: MatchInvestor,
  docKeywords: string[],
  feedbackMap: Map<string, number>,
  weights: Record<string, number> = DEFAULT_WEIGHTS,
): ScoreBreakdown {
  // --- Factor 1: Industry (0–100) ---
  let factorIndustry = 0;
  if (investor.preferredSectors.length > 0 && startup.industries.length > 0) {
    factorIndustry = Math.round(jaccard(startup.industries, investor.preferredSectors) * 100);
    // Exact match bonus
    const indsLower = startup.industries.map(s => s.toLowerCase());
    const sectorsLower = investor.preferredSectors.map(s => s.toLowerCase());
    if (indsLower.some(i => sectorsLower.includes(i))) factorIndustry = Math.min(100, factorIndustry + 20);
  } else if (investor.preferredSectors.length === 0) {
    factorIndustry = 50; // Agnostic investor partial credit
  }

  // --- Factor 2: Stage (0–100) ---
  let factorStage = 0;
  const sStage = (startup.stage ?? "").toLowerCase().replace(/\s+/g, " ");
  if (investor.preferredStages.length > 0 && sStage) {
    const iStages = investor.preferredStages.map(s => s.toLowerCase().replace(/\s+/g, " "));
    if (iStages.includes(sStage)) {
      factorStage = 100;
    } else {
      // Adjacent stage partial credit
      const startupOrder = STAGE_ORDER[sStage] ?? 0;
      const bestAdjacent = iStages.reduce((best, s) => {
        const ord = STAGE_ORDER[s] ?? 0;
        const dist = Math.abs(ord - startupOrder);
        return dist < best ? dist : best;
      }, 99);
      if (bestAdjacent === 1) factorStage = 60;
      else if (bestAdjacent === 2) factorStage = 30;
    }
  } else if (investor.preferredStages.length === 0) {
    factorStage = 50;
  }

  // --- Factor 3: Geography (0–100) ---
  let factorGeo = 0;
  const sLoc = (startup.location ?? "").toLowerCase();
  const sGeos = startup.targetGeographies.map(g => g.toLowerCase());
  if (investor.geographyFocus.length > 0) {
    const iGeos = investor.geographyFocus.map(g => g.toLowerCase());
    const overlap = [...sGeos, sLoc].some(g => iGeos.some(ig => ig.includes(g) || g.includes(ig)));
    if (overlap) factorGeo = 100;
    else if (iGeos.includes("global") || iGeos.includes("worldwide")) factorGeo = 70;
    else {
      // Continent match
      const regionMatch = (a: string, b: string) => {
        const regions = [
          ["usa", "us", "united states", "america", "north america"],
          ["europe", "uk", "france", "germany", "spain"],
          ["africa", "nigeria", "kenya", "ghana"],
          ["asia", "india", "china", "singapore", "japan"],
          ["latam", "brazil", "latin america"],
          ["mena", "middle east", "uae", "saudi"],
        ];
        return regions.some(r => r.some(x => a.includes(x)) && r.some(x => b.includes(x)));
      };
      const regionOverlap = [...sGeos, sLoc].some(g => iGeos.some(ig => regionMatch(g, ig)));
      factorGeo = regionOverlap ? 40 : 10;
    }
  } else {
    factorGeo = 50; // geo-agnostic
  }

  // --- Factor 4: Check Size (0–100) ---
  let factorCheckSize = 0;
  const startupRange = parseCheckSizeRange(startup.fundingTarget ?? (startup.targetAmount ? `$${startup.targetAmount}` : null));
  const investorRange = parseCheckSizeRange(investor.typicalCheckSize);
  if (startupRange && investorRange) {
    factorCheckSize = Math.round(checkSizeOverlap(startupRange, investorRange) * 100);
    if (factorCheckSize === 0) {
      // Soft tolerance: within 2x
      const ratio = Math.max(startupRange[0], investorRange[0]) / Math.max(Math.min(startupRange[1], investorRange[1]), 1);
      if (ratio < 2) factorCheckSize = 30;
    }
  } else {
    factorCheckSize = 40; // unknown → partial
  }

  // --- Factor 5: Investor Type (0–100) ---
  let factorInvestorType = 0;
  if (startup.preferredInvestorTypes.length > 0 && investor.firmType) {
    const typeLower = investor.firmType.toLowerCase();
    const prefLower = startup.preferredInvestorTypes.map(t => t.toLowerCase());
    if (prefLower.some(p => typeLower.includes(p) || p.includes(typeLower))) {
      factorInvestorType = 100;
    } else {
      // Partial credit for related types
      const vcFamily = ["vc", "venture", "venture capital", "cvc", "micro vc"];
      const peFamily = ["pe", "private equity", "growth equity"];
      const angelFamily = ["angel", "hni", "family office", "uhnwi"];
      const typeFamily = [vcFamily, peFamily, angelFamily];
      const iFamily = typeFamily.find(f => f.some(x => typeLower.includes(x)));
      const pFamily = typeFamily.find(f => prefLower.some(p => f.some(x => x.includes(p) || p.includes(x))));
      factorInvestorType = iFamily && pFamily && iFamily === pFamily ? 60 : 20;
    }
  } else if (startup.preferredInvestorTypes.length === 0) {
    factorInvestorType = 60; // no preference stated
  } else {
    factorInvestorType = 30;
  }

  // --- Factor 6: Team Signal (0–100) ---
  let factorTeamSignal = 0;
  if (startup.teamSize && startup.teamSize >= 3) factorTeamSignal += 30;
  if (startup.founderLinkedin) factorTeamSignal += 25;
  if (startup.pitchDeckUrl) factorTeamSignal += 25;
  if (startup.keyMilestone) factorTeamSignal += 20;
  factorTeamSignal = Math.min(100, factorTeamSignal);

  // --- Weighted base score ---
  const baseScore =
    factorIndustry * weights.industry +
    factorStage * weights.stage +
    factorGeo * weights.geo +
    factorCheckSize * weights.checkSize +
    factorInvestorType * weights.investorType +
    factorTeamSignal * weights.teamSignal;

  // --- Bonus scores (capped to prevent gaming) ---

  // Semantic: keyword overlap between startup industries + docs and investor thesis
  let semanticScore = 0;
  if (investor.investmentThesis && (startup.industries.length > 0 || docKeywords.length > 0)) {
    const thesisWords = investor.investmentThesis.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
    const startupWords = [
      ...startup.industries.map(i => i.toLowerCase()),
      ...docKeywords.slice(0, 30),
    ];
    const j = jaccard(startupWords, thesisWords);
    semanticScore = Math.round(j * 15); // max 15 bonus points
  }

  // Niche score: domain-specific bonus
  let nicheScore = 0;
  const detectedNiche = startup.nicheIndustry ?? detectNiche(startup.industries.join(" "));
  if (detectedNiche) {
    const iNiche = investor.focusNiches.map(n => n.toLowerCase());
    const iThesis = (investor.investmentThesis ?? "").toLowerCase();
    const niches = detectedNiche === "film" ? FILM_KEYWORDS : detectedNiche === "realestate" ? REAL_ESTATE_KEYWORDS : SPORTS_KEYWORDS;
    if (iNiche.some(n => niches.includes(n)) || niches.some(n => iThesis.includes(n))) {
      nicheScore = 12;
    }
  }

  // Document score: doc keywords vs investor sectors
  let documentScore = 0;
  if (docKeywords.length > 0 && investor.preferredSectors.length > 0) {
    const j = jaccard(docKeywords.slice(0, 50), investor.preferredSectors);
    documentScore = Math.round(j * 10);
  }

  // Economic fit: portfolio size indicator
  let economicScore = 0;
  if (investor.portfolioCount !== null) {
    if (investor.portfolioCount >= 5 && investor.portfolioCount <= 50) economicScore = 5;
    else if (investor.portfolioCount > 50) economicScore = 3;
    else economicScore = 2;
  }

  // Behaviour: lead investor signal
  let behaviourScore = 0;
  if (investor.leadInvestments && investor.leadInvestments > 0) {
    const leadRatio = (investor.totalInvestments ?? 1) > 0
      ? investor.leadInvestments / (investor.totalInvestments ?? 1)
      : 0;
    behaviourScore = Math.round(leadRatio * 8);
  }

  // Feedback multiplier
  const feedbackMultiplier = feedbackMap.get(investor.id) ?? 1.0;

  // Final score
  const bonusTotal = semanticScore + nicheScore + documentScore + economicScore + behaviourScore;
  let total = Math.round((baseScore + bonusTotal) * feedbackMultiplier);
  total = Math.min(100, Math.max(0, total));

  // Tier assignment
  let tier: "champion" | "A" | "B" | "C";
  let tierLabel: string;
  if (total >= TIER_CHAMPION) { tier = "champion"; tierLabel = "Champion Partner"; }
  else if (total >= TIER_A) { tier = "A"; tierLabel = "Strong Fit"; }
  else if (total >= TIER_B) { tier = "B"; tierLabel = "Potential Fit"; }
  else { tier = "C"; tierLabel = "Exploratory"; }

  // Win probability (rough heuristic)
  const winProbability = Math.min(95, Math.round(total * 0.7 + (feedbackMultiplier - 1) * 20));

  // Decision speed based on lead investments ratio
  let decisionSpeed: "fast" | "medium" | "slow" = "medium";
  if (investor.leadInvestments && investor.totalInvestments) {
    const r = investor.leadInvestments / investor.totalInvestments;
    if (r > 0.5) decisionSpeed = "fast";
    else if (r < 0.2) decisionSpeed = "slow";
  }

  // Value-add signals
  const valueAdd: string[] = [];
  if (investor.portfolioCount && investor.portfolioCount > 20) valueAdd.push("Large Network");
  if (investor.leadInvestments && investor.leadInvestments > 5) valueAdd.push("Active Lead");
  if (nicheScore > 0) valueAdd.push("Domain Expert");
  if (factorGeo >= 80) valueAdd.push("Local Presence");

  return {
    total,
    tier,
    tierLabel,
    factorIndustry,
    factorStage,
    factorGeo,
    factorCheckSize,
    factorInvestorType,
    factorTeamSignal,
    semanticScore,
    nicheScore,
    documentScore,
    economicScore,
    behaviourScore,
    feedbackMultiplier,
    winProbability,
    decisionSpeed,
    valueAdd,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export interface MatchOptions {
  mode?: "standard" | "accelerated";
  weights?: Record<string, number>;
  minScore?: number;
  maxResults?: number;
}

export interface MatchResult {
  sessionId: string;
  startupName: string;
  totalCandidates: number;
  matchesReturned: number;
  durationMs: number;
  tierCounts: { champion: number; A: number; B: number; C: number };
  matches: Array<MatchInvestor & ScoreBreakdown & { matchId: string }>;
}

export async function runMatchmakingV2(
  startupId: string,
  options: MatchOptions = {},
): Promise<MatchResult> {
  const startTime = Date.now();
  const mode = options.mode ?? "standard";
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) };
  const minScore = options.minScore ?? MIN_SCORE;
  const maxResults = options.maxResults ?? MAX_MATCHES;

  // Load data in parallel
  const [startup, allInvestors, docKeywords, feedbackMap] = await Promise.all([
    loadStartupProfile(startupId),
    loadAllInvestors(),
    loadDocumentKeywords(startupId),
    loadFeedbackMap(startupId),
  ]);

  if (!startup) throw new Error(`Startup ${startupId} not found`);

  const totalCandidates = allInvestors.length;

  // Score all investors
  const scored = allInvestors
    .map(inv => {
      const breakdown = scoreInvestor(startup, inv, docKeywords, feedbackMap, weights);
      return { ...inv, ...breakdown };
    })
    .filter(r => r.total >= minScore)
    .sort((a, b) => b.total - a.total)
    .slice(0, maxResults);

  const tierCounts = { champion: 0, A: 0, B: 0, C: 0 };
  for (const m of scored) {
    tierCounts[m.tier as keyof typeof tierCounts]++;
  }

  const durationMs = Date.now() - startTime;

  // Create session
  const sessionId = `ms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(matchSessions).values({
    id: sessionId,
    startupId: startup.id,
    startupName: startup.name,
    mode,
    totalCandidates,
    matchesReturned: scored.length,
    tierCounts,
    weights,
    durationMs,
    source: mode,
    totalMatches: scored.length,
  });

  // Persist individual match records
  if (scored.length > 0) {
    const matchRows = scored.map(m => ({
      id: `im_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      sessionId,
      startupId: startup.id,
      startupName: startup.name,
      investorId: m.id,
      investorName: m.name,
      investorEmail: m.email,
      investorLinkedin: m.linkedinUrl,
      firmId: m.firmId,
      firmName: m.firmName,
      firmWebsite: m.firmWebsite,
      score: m.total,
      tier: m.tier,
      tierLabel: m.tierLabel,
      factorIndustry: m.factorIndustry,
      factorStage: m.factorStage,
      factorGeo: m.factorGeo,
      factorCheckSize: m.factorCheckSize,
      factorInvestorType: m.factorInvestorType,
      factorTeamSignal: m.factorTeamSignal,
      semanticScore: m.semanticScore,
      nicheScore: m.nicheScore,
      documentScore: m.documentScore,
      economicScore: m.economicScore,
      behaviourScore: m.behaviourScore,
      feedbackMultiplier: m.feedbackMultiplier,
      winProbability: m.winProbability,
      decisionSpeed: m.decisionSpeed,
      valueAdd: m.valueAdd,
      status: "pending",
    }));

    // Batch insert in chunks of 100
    for (let i = 0; i < matchRows.length; i += 100) {
      await db.insert(investorMatches).values(matchRows.slice(i, i + 100));
    }
  }

  return {
    sessionId,
    startupName: startup.name,
    totalCandidates,
    matchesReturned: scored.length,
    durationMs,
    tierCounts,
    matches: scored.map((m, idx) => ({
      ...m,
      matchId: `im_${idx}`,
    })),
  };
}

// ─── Get session with matches ─────────────────────────────────────────────────
export async function getSessionWithMatches(sessionId: string) {
  const [session] = await db
    .select()
    .from(matchSessions)
    .where(eq(matchSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  const matches = await db
    .select()
    .from(investorMatches)
    .where(eq(investorMatches.sessionId, sessionId))
    .orderBy(sql`${investorMatches.score} DESC`);

  return { session, matches };
}

// ─── Get all sessions for a startup ──────────────────────────────────────────
export async function getSessionsForStartup(startupId: string) {
  return db
    .select()
    .from(matchSessions)
    .where(eq(matchSessions.startupId, startupId))
    .orderBy(sql`${matchSessions.createdAt} DESC`);
}

// ─── Update match status ──────────────────────────────────────────────────────
export async function updateMatchStatus(
  matchId: string,
  status: string,
  notes?: string,
) {
  await db
    .update(investorMatches)
    .set({ status, statusNotes: notes, statusUpdatedAt: new Date() })
    .where(eq(investorMatches.id, matchId));
}

// ─── Import matches to Folk CRM ───────────────────────────────────────────────
export async function importMatchesToCRM(
  sessionId: string,
  tierFilter?: string[],
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let query = db
    .select()
    .from(investorMatches)
    .where(eq(investorMatches.sessionId, sessionId));

  const allMatches = await query;
  const filtered = tierFilter
    ? allMatches.filter(m => tierFilter.includes(m.tier))
    : allMatches;

  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const m of filtered) {
    try {
      const [firstName, ...rest] = (m.investorName ?? "Unknown").split(" ");
      const lastName = rest.join(" ") || undefined;

      const person = await folkService.createPerson({
        firstName,
        lastName: lastName ?? "",
        emails: m.investorEmail ? [{ value: m.investorEmail, type: "work" }] : [],
        linkedinUrl: m.investorLinkedin ?? undefined,
        customFields: {
          matchScore: String(m.score),
          tier: m.tier,
          startupName: m.startupName ?? "",
          sessionId: m.sessionId,
          winProbability: String(m.winProbability ?? 0),
        },
      } as any);

      await db
        .update(investorMatches)
        .set({ folkContactId: person.id, status: "in_crm", statusUpdatedAt: new Date() })
        .where(eq(investorMatches.id, m.id));

      imported++;
    } catch (err: any) {
      failed++;
      errors.push(`${m.investorName}: ${err?.message ?? "unknown error"}`);
    }
  }

  return { imported, failed, errors };
}

// ─── Record deal feedback ─────────────────────────────────────────────────────
export async function recordDealFeedback(
  investorId: string,
  startupId: string,
  outcome: "won" | "lost",
  sessionId?: string,
) {
  await db.insert(dealFeedbackEvents).values({
    id: `df_${Date.now()}`,
    investorId,
    startupId,
    sessionId: sessionId ?? null,
    outcome,
  });
}

// ─── Generate MBB-style match report data ─────────────────────────────────────
export async function getMatchReportData(sessionId: string) {
  const result = await getSessionWithMatches(sessionId);
  if (!result) return null;
  const { session, matches } = result;

  const tiers = {
    champion: matches.filter(m => m.tier === "champion"),
    A: matches.filter(m => m.tier === "A"),
    B: matches.filter(m => m.tier === "B"),
    C: matches.filter(m => m.tier === "C"),
  };

  const avgScore = matches.length
    ? Math.round(matches.reduce((s, m) => s + m.score, 0) / matches.length)
    : 0;

  const topMatches = matches.slice(0, 10);

  // Sector distribution
  const firmTypes: Record<string, number> = {};
  for (const m of matches) {
    const t = (m as any).firmName ?? "Unknown";
    firmTypes[t] = (firmTypes[t] ?? 0) + 1;
  }

  return {
    session,
    summary: {
      totalMatches: matches.length,
      avgScore,
      tierCounts: session.tierCounts ?? { champion: tiers.champion.length, A: tiers.A.length, B: tiers.B.length, C: tiers.C.length },
    },
    tiers,
    topMatches,
    firmTypes,
  };
}
