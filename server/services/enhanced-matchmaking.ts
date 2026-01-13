import { db } from "../db";
import { 
  startups, investors, investmentFirms, matches, interactionLogs,
  type Startup, type Investor, type InvestmentFirm, type Match, type InsertMatch 
} from "@shared/schema";
import { eq, inArray, and, desc, sql, gte, isNotNull, or, ne } from "drizzle-orm";

interface EnhancedMatchCriteria {
  semanticFit: number;
  stageCompatibility: number;
  economicFit: number;
  geographicPracticality: number;
  investorBehavior: number;
  investorTypeLogic: number;
  networkWarmth: number;
}

type IndustryDomain = 
  | 'film' | 'real_estate' | 'biotech' | 'medtech' | 'deeptech' | 'saas' | 'cpg'
  | 'fashion' | 'beauty' | 'food_beverage' | 'manufacturing' | 'logistics'
  | 'cleantech' | 'sustainable_materials' | 'fintech' | 'wealth_management'
  | 'enterprise_saas' | 'digital_health' | 'gaming' | 'edtech' | 'govtech' | 'cybersecurity'
  | 'general';

interface DomainSpecificScore {
  domain: IndustryDomain;
  domainScore: number;
  domainMultiplier: number;
  domainReasons: string[];
}

// Film/Movies Capital Intent Types
const FILM_CAPITAL_INTENTS = [
  'single-picture', 'slate-financing', 'gap-financing', 'bridge-financing',
  'ip-acquisition', 'library-roll-up', 'production-equity', 'studio-equity',
  'film-infrastructure', 'film-tech', 'media-tech', 'content-fund'
];

// Film Deal Structures
const FILM_DEAL_STRUCTURES = [
  'senior-debt', 'mezzanine', 'structured-credit', 'preferred-equity',
  'common-equity', 'revenue-participation', 'convertible', 'tax-credit',
  'presales', 'mg-discounting'
];

// Film Genres
const FILM_GENRES = [
  'prestige-drama', 'horror', 'thriller', 'comedy', 'action',
  'family', 'animation', 'documentary', 'genre-agnostic'
];

// Real Estate Property Types
const RE_PROPERTY_TYPES = [
  'residential', 'commercial', 'industrial', 'mixed-use', 'reit',
  'development', 'multifamily', 'retail', 'office', 'hospitality'
];

// Real Estate Deal Stages
const RE_DEAL_STAGES = [
  'pre-development', 'development', 'construction', 'stabilized',
  'bridge-financing', 'acquisition', 'value-add', 'ground-up'
];

// Deal Structure Compatibility Matrix for Film
const FILM_STRUCTURE_MATRIX: Record<string, Record<string, number>> = {
  'senior-debt': { 'debt': 1.0, 'revenue': 0, 'equity': 0, 'preferred': 0 },
  'revenue-participation': { 'debt': 0.6, 'revenue': 1.0, 'equity': 0.7, 'preferred': 0.7 },
  'preferred-equity': { 'debt': 0, 'revenue': 0.7, 'equity': 0.7, 'preferred': 1.0 },
  'common-equity': { 'debt': 0, 'revenue': 0, 'equity': 1.0, 'preferred': 0.7 },
};

interface EnhancedMatchResult {
  investorId?: string;
  firmId?: string;
  score: number;
  baseScore: number;
  contextMultiplier: number;
  activityMultiplier: number;
  reasons: string[];
  breakdown: EnhancedMatchCriteria;
  passedHardConstraints: boolean;
  constraintFailures: string[];
}

interface InvestorBehaviorMetrics {
  responseRate: number;
  avgTimeToResponse: number;
  acceptanceRate: number;
  lastActiveDate: Date | null;
  totalInvestments: number;
  investmentsInSector: number;
}

interface EconomicProfile {
  fundSize: number | null;
  targetOwnership: number | null;
  followOnCapacity: boolean;
  leadPreference: "lead" | "follow" | "both" | null;
  portfolioConcentration: number;
}

const ENHANCED_WEIGHTS: EnhancedMatchCriteria = {
  semanticFit: 0.35,
  stageCompatibility: 0.20,
  economicFit: 0.15,
  geographicPracticality: 0.10,
  investorBehavior: 0.10,
  investorTypeLogic: 0.05,
  networkWarmth: 0.05,
};

const STAGE_HIERARCHY = ["pre-seed", "seed", "series-a", "series-b", "series-c", "growth", "late-stage"];

const STAGE_ALIASES: Record<string, string[]> = {
  "pre-seed": ["Pre-Seed", "Pre-seed", "pre-seed", "Preseed", "preseed", "Angel", "angel", "Idea", "idea"],
  "seed": ["Seed", "seed", "Seed-Stage", "Early-Stage", "Early Stage"],
  "series-a": ["Series A", "series-a", "Series-A", "A", "A Round"],
  "series-b": ["Series B", "series-b", "Series-B", "B", "B Round"],
  "series-c": ["Series C", "series-c", "Series-C", "C", "C Round", "Series C+"],
  "growth": ["Growth", "growth", "Late Stage", "late-stage", "Expansion"],
  "late-stage": ["Late Stage", "late-stage", "Pre-IPO", "pre-ipo", "Mezzanine"],
};

class EnhancedMatchmakingService {
  
  async runEnhancedMatching(
    startupId: string,
    options: {
      limit?: number;
      includeInactiveInvestors?: boolean;
      minScore?: number;
    } = {}
  ): Promise<EnhancedMatchResult[]> {
    const { limit = 50, includeInactiveInvestors = false, minScore = 20 } = options;

    const [startup] = await db.select().from(startups).where(eq(startups.id, startupId)).limit(1);
    if (!startup) {
      throw new Error(`Startup not found: ${startupId}`);
    }

    const firms = await db.select().from(investmentFirms);
    const allInvestors = await db.select().from(investors);
    
    const results: EnhancedMatchResult[] = [];

    for (const firm of firms) {
      const result = await this.scoreMatch(startup, null, firm, includeInactiveInvestors);
      if (result.passedHardConstraints && result.score >= minScore) {
        results.push(result);
      }
    }

    for (const investor of allInvestors) {
      if (investor.firmId) continue;
      const result = await this.scoreMatch(startup, investor, null, includeInactiveInvestors);
      if (result.passedHardConstraints && result.score >= minScore) {
        results.push(result);
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private async scoreMatch(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null,
    includeInactive: boolean
  ): Promise<EnhancedMatchResult> {
    const constraintResult = this.checkHardConstraints(startup, investor, firm, includeInactive);
    
    if (!constraintResult.passed) {
      return {
        investorId: investor?.id,
        firmId: firm?.id,
        score: 0,
        baseScore: 0,
        contextMultiplier: 1,
        activityMultiplier: 1,
        reasons: [],
        breakdown: this.emptyBreakdown(),
        passedHardConstraints: false,
        constraintFailures: constraintResult.failures,
      };
    }

    const breakdown = await this.calculateBreakdown(startup, investor, firm);
    const baseScore = this.calculateBaseScore(breakdown);
    const contextMultiplier = this.calculateContextMultiplier(startup, investor, firm);
    const activityMultiplier = await this.calculateActivityMultiplier(investor, firm);

    // Apply domain-specific scoring for Film and Real Estate
    const domainResult = this.applyDomainScoring(startup, investor, firm, baseScore, breakdown);
    
    // If domain scoring rejected the match (multiplier = 0), fail it
    if (domainResult.domainResult && domainResult.domainResult.domainMultiplier === 0) {
      return {
        investorId: investor?.id,
        firmId: firm?.id,
        score: 0,
        baseScore: 0,
        contextMultiplier: 1,
        activityMultiplier: 1,
        reasons: domainResult.domainResult.domainReasons,
        breakdown,
        passedHardConstraints: false,
        constraintFailures: domainResult.domainResult.domainReasons,
      };
    }

    const finalScore = domainResult.domainResult 
      ? Math.min(100, Math.round(domainResult.score * contextMultiplier * activityMultiplier))
      : Math.min(100, Math.round(baseScore * contextMultiplier * activityMultiplier));
    
    const baseReasons = this.generateReasons(breakdown, startup, investor, firm);
    const reasons = domainResult.domainResult 
      ? [...domainResult.domainResult.domainReasons, ...baseReasons]
      : baseReasons;

    return {
      investorId: investor?.id,
      firmId: firm?.id,
      score: finalScore,
      baseScore: domainResult.domainResult ? domainResult.score : baseScore,
      contextMultiplier,
      activityMultiplier,
      reasons,
      breakdown,
      passedHardConstraints: true,
      constraintFailures: [],
    };
  }

  private checkHardConstraints(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null,
    includeInactive: boolean
  ): { passed: boolean; failures: string[] } {
    const failures: string[] = [];

    const checkSizeOverlap = this.calculateCheckSizeOverlap(startup, investor, firm);
    if (checkSizeOverlap < 0.1) {
      failures.push("Check size mismatch: less than 10% overlap");
    }

    const stageDistance = this.getStageDistance(startup, investor, firm);
    if (stageDistance > 1) {
      failures.push(`Stage mismatch: ${stageDistance} levels apart`);
    }

    if (!includeInactive && firm) {
      const lastUpdated = firm.updatedAt || firm.createdAt;
      if (lastUpdated) {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        if (new Date(lastUpdated) < sixMonthsAgo) {
          failures.push("Investor inactive for 6+ months");
        }
      }
    }

    const geographicExclusion = this.checkGeographicExclusion(startup, investor, firm);
    if (geographicExclusion) {
      failures.push(`Geographic exclusion: ${geographicExclusion}`);
    }

    return { passed: failures.length === 0, failures };
  }

  private calculateCheckSizeOverlap(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    const target = startup.targetAmount ? startup.targetAmount : null;
    if (!target) return 0;

    let checkMin = 0, checkMax = Infinity;
    let hasCheckSizeData = false;
    
    if (firm?.checkSizeMin) {
      checkMin = firm.checkSizeMin;
      hasCheckSizeData = true;
    }
    if (firm?.checkSizeMax) {
      checkMax = firm.checkSizeMax;
      hasCheckSizeData = true;
    }
    
    if (firm?.typicalCheckSize) {
      const parsed = this.parseCheckSizeRange(firm.typicalCheckSize);
      if (parsed) {
        checkMin = parsed.min;
        checkMax = parsed.max;
        hasCheckSizeData = true;
      }
    }

    if (investor?.typicalInvestment) {
      const parsed = this.parseCheckSizeRange(investor.typicalInvestment);
      if (parsed) {
        checkMin = parsed.min;
        checkMax = parsed.max;
        hasCheckSizeData = true;
      }
    }

    if (!hasCheckSizeData) return 0;

    const targetMin = target * 0.5;
    const targetMax = target * 1.5;

    const overlapStart = Math.max(checkMin, targetMin);
    const overlapEnd = Math.min(checkMax, targetMax);
    
    if (overlapStart >= overlapEnd) return 0;
    
    const overlapRange = overlapEnd - overlapStart;
    const totalRange = Math.max(checkMax - checkMin, targetMax - targetMin);
    
    return Math.min(1, overlapRange / totalRange);
  }

  private parseCheckSizeRange(checkSize: string): { min: number; max: number } | null {
    const normalized = checkSize.toLowerCase().replace(/,/g, '');
    
    const rangeMatch = normalized.match(/\$?([\d.]+)\s*[mk]?\s*[-–to]+\s*\$?([\d.]+)\s*([mk])?/i);
    if (rangeMatch) {
      let min = parseFloat(rangeMatch[1]);
      let max = parseFloat(rangeMatch[2]);
      const multiplier = rangeMatch[3]?.toLowerCase();
      
      if (multiplier === 'm') {
        min *= 1000000;
        max *= 1000000;
      } else if (multiplier === 'k') {
        min *= 1000;
        max *= 1000;
      }
      
      if (normalized.includes('m') && !rangeMatch[3]) {
        min *= 1000000;
        max *= 1000000;
      } else if (normalized.includes('k') && !rangeMatch[3]) {
        min *= 1000;
        max *= 1000;
      }
      
      return { min, max };
    }

    const singleMatch = normalized.match(/\$?([\d.]+)\s*([mk])?/i);
    if (singleMatch) {
      let value = parseFloat(singleMatch[1]);
      const multiplier = singleMatch[2]?.toLowerCase();
      
      if (multiplier === 'm') value *= 1000000;
      else if (multiplier === 'k') value *= 1000;
      else if (normalized.includes('m')) value *= 1000000;
      else if (normalized.includes('k')) value *= 1000;
      
      return { min: value * 0.5, max: value * 1.5 };
    }

    return null;
  }

  private getStageDistance(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    const startupStage = this.normalizeStage(startup.stage);
    const startupIndex = STAGE_HIERARCHY.indexOf(startupStage);
    if (startupIndex === -1) return 0;

    let investorStages: string[] = [];
    
    if (firm?.stages) {
      investorStages = (firm.stages as string[]).map(s => this.normalizeStage(s));
    }
    if (investor?.fundingStage) {
      investorStages.push(this.normalizeStage(investor.fundingStage));
    }

    if (investorStages.length === 0) return 0;

    let minDistance = Infinity;
    for (const stage of investorStages) {
      const index = STAGE_HIERARCHY.indexOf(stage);
      if (index !== -1) {
        minDistance = Math.min(minDistance, Math.abs(startupIndex - index));
      }
    }

    return minDistance === Infinity ? 0 : minDistance;
  }

  private normalizeStage(stage: string | null | undefined): string {
    if (!stage) return "";
    const lower = stage.toLowerCase().trim();
    for (const [normalized, aliases] of Object.entries(STAGE_ALIASES)) {
      if (aliases.some(a => lower.includes(a.toLowerCase()))) {
        return normalized;
      }
    }
    return lower;
  }

  private checkGeographicExclusion(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): string | null {
    return null;
  }

  private async calculateBreakdown(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): Promise<EnhancedMatchCriteria> {
    const semanticFit = this.calculateSemanticFit(startup, investor, firm);
    const stageCompatibility = this.calculateStageCompatibility(startup, investor, firm);
    const economicFit = this.calculateEconomicFit(startup, investor, firm);
    const geographicPracticality = this.calculateGeographicPracticality(startup, investor, firm);
    const investorBehavior = await this.calculateInvestorBehaviorScore(investor, firm);
    const investorTypeLogic = this.calculateInvestorTypeLogic(startup, investor, firm);
    const networkWarmth = this.calculateNetworkWarmth(startup, investor, firm);

    return {
      semanticFit,
      stageCompatibility,
      economicFit,
      geographicPracticality,
      investorBehavior,
      investorTypeLogic,
      networkWarmth,
    };
  }

  private calculateSemanticFit(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    const startupText = this.buildStartupTextProfile(startup);
    const investorText = this.buildInvestorTextProfile(investor, firm);

    if (!startupText || !investorText) return 50;

    const startupTokens = this.tokenize(startupText);
    const investorTokens = this.tokenize(investorText);

    const similarity = this.calculateJaccardSimilarity(startupTokens, investorTokens);
    
    const bonusScore = this.calculateThesisBonuses(startup, investor, firm);
    
    return Math.min(100, Math.round((similarity * 70) + bonusScore));
  }

  private buildStartupTextProfile(startup: Startup): string {
    const parts: string[] = [];
    if (startup.industries && Array.isArray(startup.industries)) {
      parts.push(...(startup.industries as string[]));
    }
    if (startup.description) parts.push(startup.description);
    if (startup.stage) parts.push(startup.stage);
    if (startup.location) parts.push(startup.location);
    return parts.join(' ').toLowerCase();
  }

  private buildInvestorTextProfile(investor: Investor | null, firm: InvestmentFirm | null): string {
    const parts: string[] = [];
    
    if (firm) {
      if (firm.description) parts.push(firm.description);
      if (firm.industry) parts.push(firm.industry);
      if (firm.sectors && Array.isArray(firm.sectors)) {
        parts.push(...(firm.sectors as string[]));
      }
      if (firm.type) parts.push(firm.type);
    }
    
    if (investor) {
      if (investor.bio) parts.push(investor.bio);
      if (investor.investorType) parts.push(investor.investorType);
      if (investor.title) parts.push(investor.title);
    }
    
    return parts.join(' ').toLowerCase();
  }

  private tokenize(text: string): string[] {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall'];
    const stopWordsSet = new Set(stopWords);
    
    const words = text
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWordsSet.has(w));

    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]}_${words[i + 1]}`);
    }

    const allTokens = words.concat(bigrams);
    const uniqueTokens: string[] = [];
    const seen = new Set<string>();
    for (const token of allTokens) {
      if (!seen.has(token)) {
        seen.add(token);
        uniqueTokens.push(token);
      }
    }
    return uniqueTokens;
  }

  private calculateJaccardSimilarity(arr1: string[], arr2: string[]): number {
    if (arr1.length === 0 || arr2.length === 0) return 0;
    
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    
    const intersectionCount = arr1.filter(x => set2.has(x)).length;
    const unionCount = new Set([...arr1, ...arr2]).size;
    
    return intersectionCount / unionCount;
  }

  private calculateThesisBonuses(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    let bonus = 0;

    const thesisPatterns: Record<string, string[]> = {
      "film_finance": ["film", "movie", "entertainment", "content", "media", "studio", "production", "slate", "gap financing", "completion bond"],
      "real_estate": ["real estate", "property", "commercial", "residential", "multifamily", "construction", "development", "reit"],
      "deeptech": ["deeptech", "deep tech", "ai", "machine learning", "robotics", "quantum", "biotech", "hardware"],
      "climate": ["climate", "cleantech", "sustainability", "renewable", "carbon", "energy", "esg"],
      "fintech": ["fintech", "payments", "banking", "insurance", "lending", "defi", "crypto"],
    };

    const startupText = this.buildStartupTextProfile(startup).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    for (const [thesis, keywords] of Object.entries(thesisPatterns)) {
      const startupMatches = keywords.filter(k => startupText.includes(k)).length;
      const investorMatches = keywords.filter(k => investorText.includes(k)).length;
      
      if (startupMatches > 0 && investorMatches > 0) {
        bonus += Math.min(15, (startupMatches + investorMatches) * 3);
      }
    }

    return Math.min(30, bonus);
  }

  private calculateStageCompatibility(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    const distance = this.getStageDistance(startup, investor, firm);
    
    if (distance === 0) return 100;
    if (distance === 1) return 70;
    if (distance === 2) return 40;
    return 20;
  }

  private calculateEconomicFit(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    let score = 50;

    const checkOverlap = this.calculateCheckSizeOverlap(startup, investor, firm);
    score = 30 + (checkOverlap * 70);

    if (firm?.aum) {
      const aumValue = parseFloat(firm.aum.replace(/[^0-9.]/g, ''));
      const target = startup.targetAmount || 0;
      
      if (aumValue > 0 && target > 0) {
        const ratio = target / aumValue;
        if (ratio < 0.01) score = Math.min(score, 60);
        else if (ratio > 0.1) score = Math.min(score, 50);
      }
    }

    return Math.round(score);
  }

  private calculateGeographicPracticality(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    const startupLocation = (startup.location || '').toLowerCase();
    let investorLocations: string[] = [];

    if (firm?.hqLocation) investorLocations.push(firm.hqLocation.toLowerCase());
    if (firm?.location) investorLocations.push(firm.location.toLowerCase());
    if (investor?.location) investorLocations.push(investor.location.toLowerCase());

    if (!startupLocation || investorLocations.length === 0) return 50;

    const globalTerms = ['global', 'worldwide', 'international', 'any'];
    if (investorLocations.some(l => globalTerms.some(g => l.includes(g)))) {
      return 100;
    }

    const regionMappings: Record<string, string[]> = {
      "europe": ["uk", "united kingdom", "germany", "france", "netherlands", "spain", "italy", "sweden", "denmark", "norway", "finland", "belgium", "austria", "switzerland", "ireland", "portugal", "poland", "eu", "european"],
      "north america": ["usa", "united states", "us", "canada", "mexico", "american"],
      "asia": ["china", "japan", "korea", "india", "singapore", "hong kong", "taiwan", "thailand", "vietnam", "indonesia", "malaysia", "philippines", "asian"],
      "middle east": ["uae", "dubai", "saudi", "qatar", "israel", "bahrain", "kuwait", "oman"],
    };

    for (const [region, countries] of Object.entries(regionMappings)) {
      const startupInRegion = countries.some(c => startupLocation.includes(c)) || startupLocation.includes(region);
      const investorInRegion = investorLocations.some(l => 
        countries.some(c => l.includes(c)) || l.includes(region)
      );
      
      if (startupInRegion && investorInRegion) return 90;
    }

    for (const invLoc of investorLocations) {
      if (startupLocation.includes(invLoc) || invLoc.includes(startupLocation)) {
        return 100;
      }
    }

    return 30;
  }

  private async calculateInvestorBehaviorScore(
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): Promise<number> {
    let score = 70;

    if (firm) {
      if (firm.portfolioCount && firm.portfolioCount > 0) {
        score += Math.min(15, firm.portfolioCount);
      }
      
      const lastUpdated = firm.updatedAt || firm.createdAt;
      if (lastUpdated) {
        const daysSinceUpdate = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate < 30) score += 15;
        else if (daysSinceUpdate < 90) score += 10;
        else if (daysSinceUpdate > 180) score -= 10;
      }
    }

    if (investor) {
      if (investor.email) score += 5;
      if (investor.linkedinUrl) score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private calculateInvestorTypeLogic(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    const startupStage = this.normalizeStage(startup.stage);
    const investorType = firm?.type || investor?.investorType || '';

    const stageTypeAffinity: Record<string, Record<string, number>> = {
      "pre-seed": { "Angel": 100, "Family Office": 80, "VC": 60, "Accelerator": 100 },
      "seed": { "Angel": 80, "Family Office": 85, "VC": 90, "Accelerator": 70 },
      "series-a": { "VC": 100, "Family Office": 75, "PE": 50, "CVC": 80 },
      "series-b": { "VC": 100, "Growth Equity": 80, "PE": 70, "CVC": 85 },
      "series-c": { "VC": 80, "Growth Equity": 100, "PE": 90, "CVC": 75 },
      "growth": { "Growth Equity": 100, "PE": 95, "VC": 60, "Hedge Fund": 70 },
    };

    const affinities = stageTypeAffinity[startupStage];
    if (!affinities) return 50;

    for (const [type, score] of Object.entries(affinities)) {
      if (investorType.toLowerCase().includes(type.toLowerCase())) {
        return score;
      }
    }

    return 50;
  }

  private calculateNetworkWarmth(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    return 50;
  }

  private calculateBaseScore(breakdown: EnhancedMatchCriteria): number {
    return Math.round(
      breakdown.semanticFit * ENHANCED_WEIGHTS.semanticFit +
      breakdown.stageCompatibility * ENHANCED_WEIGHTS.stageCompatibility +
      breakdown.economicFit * ENHANCED_WEIGHTS.economicFit +
      breakdown.geographicPracticality * ENHANCED_WEIGHTS.geographicPracticality +
      breakdown.investorBehavior * ENHANCED_WEIGHTS.investorBehavior +
      breakdown.investorTypeLogic * ENHANCED_WEIGHTS.investorTypeLogic +
      breakdown.networkWarmth * ENHANCED_WEIGHTS.networkWarmth
    );
  }

  private calculateContextMultiplier(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    let multiplier = 1.0;
    const startupStage = this.normalizeStage(startup.stage);

    if (startupStage === 'pre-seed' || startupStage === 'seed') {
      const hasLocalMatch = this.calculateGeographicPracticality(startup, investor, firm) > 70;
      if (hasLocalMatch) multiplier *= 1.1;
    }

    const investorType = firm?.type || investor?.investorType || '';
    if (investorType.toLowerCase().includes('family office')) {
      multiplier *= 1.05;
    }

    const startupIndustry = (startup.industries ? (startup.industries as string[]).join(' ') : '').toLowerCase();
    const nicheIndustries = ['film', 'movie', 'entertainment', 'real estate', 'sports'];
    if (nicheIndustries.some(n => startupIndustry.includes(n))) {
      const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();
      if (nicheIndustries.some(n => investorText.includes(n))) {
        multiplier *= 1.15;
      }
    }

    return Math.min(1.5, multiplier);
  }

  private async calculateActivityMultiplier(
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): Promise<number> {
    let multiplier = 1.0;

    if (firm) {
      const hasWebsite = !!firm.website;
      const hasDescription = !!firm.description && firm.description.length > 50;
      const hasSectors = firm.sectors && (firm.sectors as string[]).length > 0;
      
      const completeness = [hasWebsite, hasDescription, hasSectors].filter(Boolean).length;
      multiplier += completeness * 0.05;
    }

    if (investor) {
      if (investor.linkedinUrl) multiplier += 0.05;
      if (investor.email) multiplier += 0.05;
    }

    return Math.min(1.3, multiplier);
  }

  private generateReasons(
    breakdown: EnhancedMatchCriteria,
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): string[] {
    const reasons: string[] = [];

    if (breakdown.semanticFit >= 70) {
      reasons.push("Strong thesis alignment");
    } else if (breakdown.semanticFit >= 50) {
      reasons.push("Moderate sector fit");
    }

    if (breakdown.stageCompatibility >= 90) {
      reasons.push("Perfect stage match");
    } else if (breakdown.stageCompatibility >= 70) {
      reasons.push("Compatible investment stage");
    }

    if (breakdown.economicFit >= 80) {
      reasons.push("Check size aligned with target");
    }

    if (breakdown.geographicPracticality >= 80) {
      reasons.push("Geographic alignment");
    }

    if (breakdown.investorBehavior >= 80) {
      reasons.push("Active investor profile");
    }

    if (breakdown.investorTypeLogic >= 80) {
      reasons.push("Investor type fits stage");
    }

    const investorName = firm?.name || `${investor?.firstName || ''} ${investor?.lastName || ''}`.trim();
    if (investorName && reasons.length === 0) {
      reasons.push(`Potential match with ${investorName}`);
    }

    return reasons;
  }

  private emptyBreakdown(): EnhancedMatchCriteria {
    return {
      semanticFit: 0,
      stageCompatibility: 0,
      economicFit: 0,
      geographicPracticality: 0,
      investorBehavior: 0,
      investorTypeLogic: 0,
      networkWarmth: 0,
    };
  }

  // ==================== DOMAIN DETECTION ====================

  private detectDomain(startup: Startup): IndustryDomain {
    const industries = (startup.industries as string[] || []).map(i => i.toLowerCase());
    const description = (startup.description || '').toLowerCase();
    const combined = industries.join(' ') + ' ' + description;

    // Domain definitions with strong keywords (instant match) and supporting keywords (require 2+)
    const domainDefinitions: { domain: IndustryDomain; strong: string[]; keywords: string[] }[] = [
      // Healthcare & Life Sciences (highest priority)
      { domain: 'biotech', strong: ['biotech', 'biotechnology', 'gene therapy', 'crispr', 'mrna', 'cell therapy', 'gene editing'], 
        keywords: ['pharmaceutical', 'drug discovery', 'clinical trial', 'preclinical', 'therapeutic', 'biologics', 'oncology', 'rare disease', 'immunotherapy'] },
      { domain: 'medtech', strong: ['medtech', 'medical device', 'medical devices', 'diagnostics'], 
        keywords: ['healthcare device', 'clinical', 'diagnostic', 'wearable health', 'surgical', 'implant', 'imaging'] },
      { domain: 'digital_health', strong: ['digital health', 'telehealth', 'telemedicine', 'mental health app', 'wellness tech'], 
        keywords: ['health app', 'fitness app', 'patient', 'remote care', 'health platform', 'therapy app'] },
      
      // Technology
      { domain: 'cybersecurity', strong: ['cybersecurity', 'cyber security', 'infosec', 'threat detection', 'security software'], 
        keywords: ['security', 'encryption', 'compliance', 'privacy', 'vulnerability', 'penetration testing', 'soc', 'siem'] },
      { domain: 'deeptech', strong: ['deep tech', 'deeptech', 'web3', 'blockchain', 'defi', 'cryptocurrency', 'quantum'], 
        keywords: ['artificial intelligence', 'machine learning', 'robotics', 'autonomous', 'iot', 'protocol', 'decentralized', 'smart contract'] },
      { domain: 'fintech', strong: ['fintech', 'insurtech', 'neobank', 'digital banking', 'payment platform', 'crypto exchange'], 
        keywords: ['payment', 'lending', 'insurance tech', 'trading', 'wealth', 'banking', 'financial services', 'regtech'] },
      { domain: 'saas', strong: ['saas', 'software as a service', 'vertical saas', 'b2b saas', 'enterprise saas'], 
        keywords: ['subscription', 'arr', 'mrr', 'recurring revenue', 'cloud software', 'platform'] },
      { domain: 'enterprise_saas', strong: ['enterprise software', 'erp', 'hr tech', 'collaboration software', 'productivity tools'], 
        keywords: ['enterprise', 'workflow', 'automation', 'crm', 'hrm', 'project management'] },
      
      // Consumer & Retail
      { domain: 'cpg', strong: ['cpg', 'consumer packaged goods', 'fmcg', 'consumer goods', 'household products'], 
        keywords: ['beverage', 'food and beverage', 'personal care', 'household', 'plant-based', 'dtc', 'direct to consumer'] },
      { domain: 'fashion', strong: ['fashion', 'apparel', 'footwear', 'clothing brand', 'sustainable fashion'], 
        keywords: ['clothing', 'shoes', 'accessories', 'textile', 'designer', 'streetwear', 'luxury fashion'] },
      { domain: 'beauty', strong: ['beauty', 'skincare', 'cosmetics', 'clean beauty', 'personal care brand'], 
        keywords: ['makeup', 'haircare', 'wellness', 'beauty brand', 'self-care', 'grooming'] },
      
      // Media & Entertainment
      { domain: 'film', strong: ['film', 'movie', 'cinema', 'slate financing', 'theatrical', 'film production'], 
        keywords: ['entertainment', 'production', 'studio', 'streaming', 'content', 'media', 'screenplay'] },
      { domain: 'gaming', strong: ['gaming', 'esports', 'game studio', 'video game', 'interactive media'], 
        keywords: ['game', 'player', 'console', 'mobile gaming', 'pc gaming', 'metaverse', 'virtual world'] },
      
      // Real Assets
      { domain: 'real_estate', strong: ['real estate', 'multifamily', 'reit', 'property development', 'proptech'], 
        keywords: ['property', 'residential', 'commercial', 'industrial', 'construction', 'bridge loan', 'mezzanine'] },
      { domain: 'cleantech', strong: ['cleantech', 'clean energy', 'renewable energy', 'solar', 'wind energy', 'climate tech'], 
        keywords: ['sustainability', 'carbon', 'green energy', 'battery', 'ev', 'energy storage', 'carbon capture'] },
      { domain: 'sustainable_materials', strong: ['sustainable materials', 'circular economy', 'bioplastics', 'recycling tech'], 
        keywords: ['sustainable packaging', 'biodegradable', 'upcycling', 'waste', 'materials science'] },
      
      // Industrial & Logistics
      { domain: 'manufacturing', strong: ['manufacturing', 'industrial tech', 'smart factory', 'additive manufacturing', '3d printing'], 
        keywords: ['robotics', 'automation', 'factory', 'production', 'industrial', 'machinery'] },
      { domain: 'logistics', strong: ['logistics', 'supply chain', 'fleet management', 'delivery tech', 'mobility'], 
        keywords: ['shipping', 'freight', 'warehouse', 'last mile', 'transportation', 'trucking', 'fleet'] },
      
      // Food & Hospitality
      { domain: 'food_beverage', strong: ['restaurant tech', 'ghost kitchen', 'food tech', 'food delivery', 'food platform'], 
        keywords: ['restaurant', 'cuisine', 'catering', 'hospitality', 'food service', 'kitchen'] },
      
      // Other Specialized
      { domain: 'edtech', strong: ['edtech', 'education technology', 'learning platform', 'online learning', 'e-learning'], 
        keywords: ['education', 'learning', 'training', 'school', 'university', 'student', 'curriculum', 'lms'] },
      { domain: 'govtech', strong: ['govtech', 'civic tech', 'smart city', 'government tech', 'public sector'], 
        keywords: ['government', 'civic', 'public services', 'municipal', 'regulatory', 'compliance'] },
      { domain: 'wealth_management', strong: ['wealth management', 'robo-advisor', 'portfolio management', 'asset management'], 
        keywords: ['investment', 'wealth', 'portfolio', 'financial advisor', 'retirement', 'pension'] },
    ];

    // Check each domain in priority order
    for (const { domain, strong, keywords } of domainDefinitions) {
      const hasStrong = strong.some(k => combined.includes(k));
      const keywordScore = keywords.filter(k => combined.includes(k)).length;
      if (hasStrong || keywordScore >= 2) return domain;
    }

    return 'general';
  }

  private detectInvestorDomain(
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): IndustryDomain {
    const text = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    // Same domain definitions as startup detection for consistency
    const domainKeywords: { domain: IndustryDomain; keywords: string[] }[] = [
      { domain: 'biotech', keywords: ['biotech', 'biotechnology', 'pharmaceutical', 'drug', 'gene therapy', 'crispr', 'mrna', 'oncology', 'therapeutic', 'clinical trial', 'life science'] },
      { domain: 'medtech', keywords: ['medtech', 'medical device', 'diagnostics', 'healthcare device', 'surgical', 'wearable health'] },
      { domain: 'digital_health', keywords: ['digital health', 'telehealth', 'telemedicine', 'mental health', 'wellness', 'health app', 'remote care'] },
      { domain: 'cybersecurity', keywords: ['cybersecurity', 'cyber security', 'infosec', 'security', 'encryption', 'threat detection'] },
      { domain: 'deeptech', keywords: ['deep tech', 'deeptech', 'web3', 'blockchain', 'ai', 'artificial intelligence', 'machine learning', 'robotics', 'quantum', 'defi', 'crypto'] },
      { domain: 'fintech', keywords: ['fintech', 'insurtech', 'neobank', 'digital banking', 'payment', 'lending', 'insurance tech', 'trading'] },
      { domain: 'saas', keywords: ['saas', 'software', 'software as a service', 'b2b', 'enterprise saas', 'vertical saas', 'subscription', 'arr', 'platform'] },
      { domain: 'enterprise_saas', keywords: ['enterprise software', 'erp', 'hr tech', 'collaboration', 'productivity', 'workflow', 'automation', 'crm'] },
      { domain: 'cpg', keywords: ['cpg', 'consumer packaged goods', 'fmcg', 'consumer goods', 'beverage', 'food', 'personal care', 'dtc', 'direct to consumer'] },
      { domain: 'fashion', keywords: ['fashion', 'apparel', 'footwear', 'clothing', 'textile', 'luxury', 'streetwear'] },
      { domain: 'beauty', keywords: ['beauty', 'skincare', 'cosmetics', 'clean beauty', 'makeup', 'haircare', 'grooming'] },
      { domain: 'film', keywords: ['film', 'movie', 'entertainment', 'media', 'content', 'production', 'slate', 'studio', 'theatrical', 'streaming'] },
      { domain: 'gaming', keywords: ['gaming', 'esports', 'game studio', 'video game', 'interactive', 'mobile gaming'] },
      { domain: 'real_estate', keywords: ['real estate', 'property', 'residential', 'commercial', 'multifamily', 'construction', 'reit', 'proptech'] },
      { domain: 'cleantech', keywords: ['cleantech', 'clean energy', 'renewable', 'solar', 'wind', 'climate', 'sustainability', 'carbon', 'ev', 'battery'] },
      { domain: 'sustainable_materials', keywords: ['sustainable materials', 'circular economy', 'bioplastics', 'recycling', 'packaging', 'waste'] },
      { domain: 'manufacturing', keywords: ['manufacturing', 'industrial', 'smart factory', 'additive manufacturing', '3d printing', 'robotics', 'automation'] },
      { domain: 'logistics', keywords: ['logistics', 'supply chain', 'fleet', 'delivery', 'mobility', 'shipping', 'freight', 'warehouse'] },
      { domain: 'food_beverage', keywords: ['restaurant', 'ghost kitchen', 'food tech', 'food delivery', 'hospitality', 'cuisine', 'catering'] },
      { domain: 'edtech', keywords: ['edtech', 'education', 'learning', 'training', 'school', 'university', 'lms', 'e-learning'] },
      { domain: 'govtech', keywords: ['govtech', 'civic tech', 'smart city', 'government', 'public sector', 'municipal'] },
      { domain: 'wealth_management', keywords: ['wealth management', 'robo-advisor', 'portfolio', 'asset management', 'investment management'] },
    ];

    for (const { domain, keywords } of domainKeywords) {
      const score = keywords.filter(k => text.includes(k)).length;
      if (score >= 2) return domain;
    }

    return 'general';
  }

  // ==================== FILM/MOVIES SCORING ====================

  private calculateFilmDomainScore(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): DomainSpecificScore {
    const reasons: string[] = [];
    let baseScore = 50;
    let multiplier = 1.0;

    const investorDomain = this.detectInvestorDomain(investor, firm);
    if (investorDomain !== 'film') {
      return { domain: 'film', domainScore: 30, domainMultiplier: 0.6, domainReasons: ['Investor not focused on film/entertainment'] };
    }

    // Capital Intent Matching
    const capitalIntentMatch = this.matchFilmCapitalIntent(startup, investor, firm);
    if (capitalIntentMatch === 'exact') {
      multiplier *= 1.25;
      reasons.push('Exact capital intent match');
      baseScore += 20;
    } else if (capitalIntentMatch === 'adjacent') {
      multiplier *= 0.85;
      reasons.push('Adjacent capital intent');
      baseScore += 10;
    } else {
      multiplier *= 0.40;
      reasons.push('Capital intent mismatch');
    }

    // Risk Profile Alignment
    const riskAlignment = this.matchFilmRiskProfile(startup, investor, firm);
    if (riskAlignment === 'aligned') {
      multiplier *= 1.15;
      reasons.push('Risk profile aligned');
      baseScore += 15;
    } else if (riskAlignment === 'misaligned') {
      multiplier *= 0.70;
      reasons.push('Risk profile mismatch');
      baseScore -= 10;
    }

    // Deal Structure Compatibility
    const structureScore = this.matchFilmDealStructure(startup, investor, firm);
    if (structureScore >= 0.9) {
      multiplier *= 1.20;
      reasons.push('Fully compatible deal structure');
      baseScore += 15;
    } else if (structureScore >= 0.6) {
      multiplier *= 0.80;
      reasons.push('Partial structure compatibility');
    } else if (structureScore > 0) {
      multiplier *= 0.60;
      reasons.push('Structure compatibility concerns');
      baseScore -= 10;
    } else {
      return { domain: 'film', domainScore: 0, domainMultiplier: 0, domainReasons: ['Incompatible deal structure - auto-reject'] };
    }

    // Genre Efficiency Multipliers
    const genreMultiplier = this.calculateFilmGenreEfficiency(startup);
    multiplier *= genreMultiplier.multiplier;
    if (genreMultiplier.reason) reasons.push(genreMultiplier.reason);

    // Activity Check - Film deals in last 24 months
    const hasRecentFilmDeals = this.checkRecentFilmActivity(investor, firm);
    if (hasRecentFilmDeals) {
      multiplier *= 1.10;
      reasons.push('Active in film deals recently');
    } else {
      multiplier *= 0.75;
      reasons.push('No recent film deal activity');
    }

    const finalScore = Math.min(100, Math.round(baseScore * multiplier));
    return { domain: 'film', domainScore: finalScore, domainMultiplier: multiplier, domainReasons: reasons };
  }

  private matchFilmCapitalIntent(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): 'exact' | 'adjacent' | 'mismatch' {
    const startupText = (startup.description || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const intents = {
      'single-picture': ['single film', 'one picture', 'feature film', 'single project'],
      'slate-financing': ['slate', 'multiple films', 'film slate', 'portfolio of films'],
      'gap-financing': ['gap', 'bridge', 'gap financing', 'completion financing'],
      'ip-acquisition': ['ip', 'intellectual property', 'library', 'rights acquisition'],
      'production-equity': ['production', 'equity', 'producer', 'production company'],
      'studio-equity': ['studio', 'major studio', 'mini-major'],
      'film-infrastructure': ['infrastructure', 'studio facility', 'post-production'],
      'film-tech': ['technology', 'tech', 'vfx', 'streaming tech', 'distribution tech']
    };

    let startupIntent = 'general';
    let investorIntent = 'general';

    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some(k => startupText.includes(k))) startupIntent = intent;
      if (keywords.some(k => investorText.includes(k))) investorIntent = intent;
    }

    if (startupIntent === investorIntent && startupIntent !== 'general') return 'exact';
    
    const adjacentPairs = [
      ['single-picture', 'slate-financing'],
      ['gap-financing', 'production-equity'],
      ['ip-acquisition', 'production-equity'],
      ['studio-equity', 'production-equity']
    ];
    
    for (const pair of adjacentPairs) {
      if ((pair[0] === startupIntent && pair[1] === investorIntent) ||
          (pair[1] === startupIntent && pair[0] === investorIntent)) {
        return 'adjacent';
      }
    }

    return investorIntent === 'general' ? 'adjacent' : 'mismatch';
  }

  private matchFilmRiskProfile(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): 'aligned' | 'neutral' | 'misaligned' {
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();
    const startupText = (startup.description || '').toLowerCase();

    const preservationKeywords = ['preservation', 'yield', 'stable', 'low risk', 'secured'];
    const aggressiveKeywords = ['asymmetric', 'high risk', 'upside', 'speculative', 'high return'];

    const investorPreservation = preservationKeywords.some(k => investorText.includes(k));
    const investorAggressive = aggressiveKeywords.some(k => investorText.includes(k));
    const startupHighRisk = ['development', 'first-time', 'debut', 'indie'].some(k => startupText.includes(k));
    const startupLowRisk = ['presales', 'guaranteed', 'tax credit', 'completion bond'].some(k => startupText.includes(k));

    if (investorPreservation && startupHighRisk) return 'misaligned';
    if (investorAggressive && startupLowRisk) return 'neutral';
    if ((investorPreservation && startupLowRisk) || (investorAggressive && startupHighRisk)) return 'aligned';

    return 'neutral';
  }

  private matchFilmDealStructure(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();
    const startupText = (startup.description || '').toLowerCase();

    // Detect what structure the startup is offering
    const detectStartupStructure = (text: string): string | null => {
      if (text.includes('senior debt') || text.includes('senior loan')) return 'senior-debt';
      if (text.includes('revenue') || text.includes('participation') || text.includes('royalty')) return 'revenue-participation';
      if (text.includes('preferred equity') || text.includes('preferred')) return 'preferred-equity';
      if (text.includes('equity') || text.includes('ownership') || text.includes('common')) return 'common-equity';
      if (text.includes('debt') || text.includes('loan')) return 'senior-debt';
      return null;
    };

    // Detect what structure the investor prefers
    const detectInvestorPreference = (text: string): string | null => {
      if (text.includes('debt') || text.includes('loan') || text.includes('lending')) return 'debt';
      if (text.includes('revenue') || text.includes('participation') || text.includes('royalty')) return 'revenue';
      if (text.includes('preferred')) return 'preferred';
      if (text.includes('equity') || text.includes('ownership')) return 'equity';
      return null;
    };

    const startupStructure = detectStartupStructure(startupText);
    const investorPreference = detectInvestorPreference(investorText);

    // If we can't detect structures, return a neutral score (not auto-reject)
    if (!startupStructure || !investorPreference) return 0.7;

    // Use the FILM_STRUCTURE_MATRIX for compatibility
    const matrixRow = FILM_STRUCTURE_MATRIX[startupStructure];
    if (!matrixRow) return 0.6; // Unknown structure, partial penalty

    const compatibilityScore = matrixRow[investorPreference];
    
    // Auto-reject: compatibility score of 0 means incompatible
    if (compatibilityScore === 0) {
      return 0; // This will trigger auto-reject in calling function
    }

    // Return the matrix score (1.0 = fully compatible, 0.6-0.7 = partial)
    return compatibilityScore;
  }

  private calculateFilmGenreEfficiency(startup: Startup): { multiplier: number; reason: string | null } {
    const text = (startup.description || '').toLowerCase();
    
    if (text.includes('horror') || text.includes('thriller')) {
      return { multiplier: 1.10, reason: 'Horror/thriller (efficient genre)' };
    }
    if (text.includes('prestige') || text.includes('drama') || text.includes('arthouse')) {
      if (!text.includes('presale') && !text.includes('distribution')) {
        return { multiplier: 0.90, reason: 'Prestige drama without presales (higher risk)' };
      }
    }
    if (text.includes('documentary') && (text.includes('grant') || text.includes('foundation'))) {
      return { multiplier: 1.05, reason: 'Documentary with grants attached' };
    }
    
    return { multiplier: 1.0, reason: null };
  }

  private checkRecentFilmActivity(investor: Investor | null, firm: InvestmentFirm | null): boolean {
    const text = this.buildInvestorTextProfile(investor, firm).toLowerCase();
    return text.includes('recent') || text.includes('active') || text.includes('portfolio');
  }

  // ==================== REAL ESTATE SCORING ====================

  private calculateRealEstateDomainScore(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): DomainSpecificScore {
    const reasons: string[] = [];
    let score = 0;
    let multiplier = 1.0;

    const investorDomain = this.detectInvestorDomain(investor, firm);
    if (investorDomain !== 'real_estate') {
      return { domain: 'real_estate', domainScore: 30, domainMultiplier: 0.6, domainReasons: ['Investor not focused on real estate'] };
    }

    // Property Type Fit (30%)
    const propertyTypeScore = this.matchREPropertyType(startup, investor, firm);
    score += propertyTypeScore * 0.30;
    if (propertyTypeScore >= 80) reasons.push('Strong property type alignment');

    // Stage/Deal Type (25%)
    const stageScore = this.matchREDealStage(startup, investor, firm);
    score += stageScore * 0.25;
    if (stageScore >= 80) reasons.push('Deal stage compatibility');

    // Geography (20%)
    const geoScore = this.calculateREGeography(startup, investor, firm);
    score += geoScore * 0.20;
    if (geoScore >= 80) reasons.push('Geographic market alignment');

    // Check Size (15%) - Real Estate requires ≥50% overlap
    const checkSizeOverlap = this.calculateCheckSizeOverlap(startup, investor, firm);
    if (checkSizeOverlap < 0.50) {
      return { domain: 'real_estate', domainScore: 0, domainMultiplier: 0, 
        domainReasons: ['Check size overlap below 50% threshold - auto-reject'] };
    }
    score += (checkSizeOverlap * 100) * 0.15;
    if (checkSizeOverlap >= 0.8) reasons.push('Check size well aligned');

    // Investor Type (10%)
    const typeScore = this.matchREInvestorType(startup, investor, firm);
    score += typeScore * 0.10;
    if (typeScore >= 80) reasons.push('Investor type fits deal');

    // Deal Structure Multiplier
    const structureMultiplier = this.calculateREStructureMultiplier(startup, investor, firm);
    multiplier *= structureMultiplier.multiplier;
    if (structureMultiplier.reason) reasons.push(structureMultiplier.reason);

    // Activity Multiplier
    if (this.checkRecentREActivity(investor, firm)) {
      multiplier *= 1.10;
      reasons.push('Active in real estate deals');
    }

    const finalScore = Math.min(100, Math.round(score * multiplier));
    return { domain: 'real_estate', domainScore: finalScore, domainMultiplier: multiplier, domainReasons: reasons };
  }

  private matchREPropertyType(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    const startupText = ((startup.industries as string[] || []).join(' ') + ' ' + (startup.description || '')).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const propertyTypes = {
      'residential': ['residential', 'housing', 'homes', 'apartments'],
      'commercial': ['commercial', 'office', 'retail', 'shopping'],
      'industrial': ['industrial', 'warehouse', 'logistics', 'manufacturing'],
      'multifamily': ['multifamily', 'multi-family', 'apartment complex'],
      'mixed-use': ['mixed-use', 'mixed use', 'live-work'],
      'hospitality': ['hotel', 'hospitality', 'resort', 'lodging'],
      'development': ['development', 'ground-up', 'new construction']
    };

    let startupTypes: string[] = [];
    let investorTypes: string[] = [];

    for (const [type, keywords] of Object.entries(propertyTypes)) {
      if (keywords.some(k => startupText.includes(k))) startupTypes.push(type);
      if (keywords.some(k => investorText.includes(k))) investorTypes.push(type);
    }

    if (startupTypes.length === 0 || investorTypes.length === 0) return 60;

    const exactMatch = startupTypes.some(t => investorTypes.includes(t));
    if (exactMatch) return 100;

    return 50;
  }

  private matchREDealStage(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    const startupText = (startup.description || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const stages = {
      'pre-development': ['pre-development', 'entitlement', 'planning', 'zoning'],
      'construction': ['construction', 'building', 'ground-up'],
      'stabilized': ['stabilized', 'cash-flowing', 'income-producing', 'occupied'],
      'bridge': ['bridge', 'transitional', 'value-add'],
      'acquisition': ['acquisition', 'purchase', 'buying']
    };

    let startupStage = 'general';
    let investorStage = 'general';

    for (const [stage, keywords] of Object.entries(stages)) {
      if (keywords.some(k => startupText.includes(k))) startupStage = stage;
      if (keywords.some(k => investorText.includes(k))) investorStage = stage;
    }

    if (startupStage === investorStage && startupStage !== 'general') return 100;
    if (investorStage === 'general') return 70;

    const adjacent = [
      ['pre-development', 'construction'],
      ['construction', 'bridge'],
      ['bridge', 'stabilized'],
      ['acquisition', 'value-add']
    ];

    for (const pair of adjacent) {
      if ((pair[0] === startupStage && pair[1] === investorStage) ||
          (pair[1] === startupStage && pair[0] === investorStage)) {
        return 80;
      }
    }

    return 40;
  }

  private calculateREGeography(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    const startupLocation = (startup.location || '').toLowerCase();
    const investorLocation = (firm?.hqLocation || firm?.location || investor?.location || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    if (investorText.includes('global') || investorText.includes('nationwide')) return 100;

    if (!startupLocation || !investorLocation) return 70;

    const extractCity = (loc: string) => loc.split(',')[0].trim();
    const extractCountry = (loc: string) => {
      const parts = loc.split(',');
      return parts[parts.length - 1].trim();
    };

    if (extractCity(startupLocation) === extractCity(investorLocation)) return 100;
    if (extractCountry(startupLocation) === extractCountry(investorLocation)) return 80;

    return 50;
  }

  private matchREInvestorType(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): number {
    const investorType = (firm?.type || investor?.investorType || '').toLowerCase();
    const startupText = (startup.description || '').toLowerCase();

    const typeAffinity: Record<string, string[]> = {
      'vc': ['early', 'development', 'proptech', 'technology'],
      'family office': ['flexible', 'bridge', 'development', 'stabilized'],
      'pe': ['stabilized', 'large', 'portfolio', 'value-add'],
      'debt fund': ['debt', 'loan', 'bridge', 'mezzanine'],
      'reit': ['stabilized', 'income', 'cash-flowing', 'portfolio']
    };

    for (const [type, keywords] of Object.entries(typeAffinity)) {
      if (investorType.includes(type)) {
        if (keywords.some(k => startupText.includes(k))) return 100;
        return 60;
      }
    }

    return 50;
  }

  private calculateREStructureMultiplier(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): { multiplier: number; reason: string | null } {
    const startupText = (startup.description || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const startupOffersEquity = startupText.includes('equity') || startupText.includes('ownership');
    const startupOffersDebt = startupText.includes('debt') || startupText.includes('loan');
    const investorPrefersDebt = investorText.includes('debt') || investorText.includes('lending');
    const investorPrefersEquity = investorText.includes('equity') || investorText.includes('ownership');

    if (startupOffersEquity && investorPrefersDebt && !investorPrefersEquity) {
      return { multiplier: 0.6, reason: 'Structure mismatch: equity offered, debt preferred' };
    }
    if (startupOffersDebt && investorPrefersEquity && !investorPrefersDebt) {
      return { multiplier: 0.8, reason: 'Structure mismatch: debt offered, equity preferred' };
    }

    return { multiplier: 1.0, reason: null };
  }

  private checkRecentREActivity(investor: Investor | null, firm: InvestmentFirm | null): boolean {
    const text = this.buildInvestorTextProfile(investor, firm).toLowerCase();
    return text.includes('active') || text.includes('recent') || text.includes('portfolio');
  }

  // ==================== BIOTECH SCORING ====================

  private calculateBiotechDomainScore(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): DomainSpecificScore {
    const reasons: string[] = [];
    let score = 0;
    let multiplier = 1.0;

    const investorDomain = this.detectInvestorDomain(investor, firm);
    if (investorDomain !== 'biotech' && investorDomain !== 'general') {
      return { domain: 'biotech', domainScore: 25, domainMultiplier: 0.5, 
        domainReasons: ['Investor not focused on biotech/life sciences'] };
    }

    // Technology / Science Fit (30%)
    const scienceFit = this.matchBiotechScienceFit(startup, investor, firm);
    score += scienceFit * 0.30;
    if (scienceFit >= 80) reasons.push('Strong science/technology alignment');

    // Stage / Development Phase (25%)
    const stageScore = this.matchBiotechStage(startup, investor, firm);
    score += stageScore * 0.25;
    if (stageScore >= 80) reasons.push('Development stage compatible');

    // Market / Indication (15%)
    const marketScore = this.matchBiotechMarket(startup, investor, firm);
    score += marketScore * 0.15;
    if (marketScore >= 80) reasons.push('Therapeutic area alignment');

    // Check Size (15%)
    const checkSizeOverlap = this.calculateCheckSizeOverlap(startup, investor, firm);
    if (checkSizeOverlap < 0.25) {
      return { domain: 'biotech', domainScore: 0, domainMultiplier: 0, 
        domainReasons: ['Check size overlap below 25% threshold'] };
    }
    score += (checkSizeOverlap * 100) * 0.15;
    if (checkSizeOverlap >= 0.7) reasons.push('Check size well aligned');

    // Investor Type (10%)
    const typeScore = this.matchBiotechInvestorType(startup, investor, firm);
    score += typeScore * 0.10;
    if (typeScore >= 80) reasons.push('Investor type fits biotech stage');

    // Deal Structure (5%)
    const structureScore = this.matchBiotechDealStructure(startup, investor, firm);
    score += structureScore * 0.05;

    // Activity bonus (not weighted, just a multiplier)
    if (this.checkRecentBiotechActivity(investor, firm)) {
      multiplier *= 1.10;
      reasons.push('Active in life science deals');
    }

    // Research vs Non-research weighting adjustment
    const isResearchBased = this.isResearchBasedBiotech(startup);
    if (isResearchBased && scienceFit >= 70) {
      multiplier *= 1.05;
      reasons.push('Research-based biotech with strong science fit');
    }

    const finalScore = Math.min(100, Math.round(score * multiplier));
    return { domain: 'biotech', domainScore: finalScore, domainMultiplier: multiplier, domainReasons: reasons };
  }

  private matchBiotechScienceFit(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = ((startup.industries as string[] || []).join(' ') + ' ' + (startup.description || '')).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const technologies = {
      'gene-therapy': ['gene therapy', 'gene editing', 'crispr', 'cas9', 'rna'],
      'cell-therapy': ['cell therapy', 'car-t', 'stem cell', 'regenerative'],
      'antibody': ['antibody', 'bispecific', 'ado', 'immunotherapy'],
      'small-molecule': ['small molecule', 'compound', 'chemistry'],
      'platform': ['platform', 'discovery platform', 'drug discovery'],
      'mrna': ['mrna', 'rna therapeutics', 'lipid nanoparticle']
    };

    let startupTech: string[] = [];
    let investorTech: string[] = [];

    for (const [tech, keywords] of Object.entries(technologies)) {
      if (keywords.some(k => startupText.includes(k))) startupTech.push(tech);
      if (keywords.some(k => investorText.includes(k))) investorTech.push(tech);
    }

    if (startupTech.length === 0 || investorTech.length === 0) return 60;
    
    const exactMatch = startupTech.some(t => investorTech.includes(t));
    if (exactMatch) return 100;

    return 50;
  }

  private matchBiotechStage(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupStage = (startup.stage || '').toLowerCase();
    const startupText = (startup.description || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const stageMapping: Record<string, string[]> = {
      'research': ['preclinical', 'research', 'discovery', 'early research'],
      'preclinical': ['preclinical', 'pre-clinical', 'ind-enabling'],
      'phase1': ['phase 1', 'phase i', 'clinical phase 1'],
      'phase2': ['phase 2', 'phase ii', 'clinical phase 2'],
      'phase3': ['phase 3', 'phase iii', 'pivotal'],
      'commercial': ['commercial', 'approved', 'marketed', 'revenue']
    };

    let startupPhase = 'general';
    let investorPhase = 'general';

    for (const [phase, keywords] of Object.entries(stageMapping)) {
      if (keywords.some(k => startupText.includes(k) || startupStage.includes(k))) startupPhase = phase;
      if (keywords.some(k => investorText.includes(k))) investorPhase = phase;
    }

    if (startupPhase === investorPhase && startupPhase !== 'general') return 100;
    if (investorPhase === 'general') return 70;

    const adjacentStages = [
      ['research', 'preclinical'],
      ['preclinical', 'phase1'],
      ['phase1', 'phase2'],
      ['phase2', 'phase3'],
      ['phase3', 'commercial']
    ];

    for (const pair of adjacentStages) {
      if ((pair.includes(startupPhase) && pair.includes(investorPhase))) {
        return 80;
      }
    }

    return 40;
  }

  private matchBiotechMarket(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = ((startup.industries as string[] || []).join(' ') + ' ' + (startup.description || '')).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const indications = {
      'oncology': ['oncology', 'cancer', 'tumor', 'immuno-oncology'],
      'rare-disease': ['rare disease', 'orphan', 'genetic disorder'],
      'neurology': ['neurology', 'cns', 'neurodegenerative', 'alzheimer', 'parkinson'],
      'immunology': ['immunology', 'autoimmune', 'inflammation'],
      'infectious': ['infectious disease', 'antiviral', 'vaccine', 'antibacterial'],
      'metabolic': ['metabolic', 'diabetes', 'obesity', 'cardiovascular']
    };

    let startupIndications: string[] = [];
    let investorIndications: string[] = [];

    for (const [indication, keywords] of Object.entries(indications)) {
      if (keywords.some(k => startupText.includes(k))) startupIndications.push(indication);
      if (keywords.some(k => investorText.includes(k))) investorIndications.push(indication);
    }

    if (startupIndications.length === 0 || investorIndications.length === 0) return 60;
    
    const exactMatch = startupIndications.some(i => investorIndications.includes(i));
    if (exactMatch) return 100;

    return 50;
  }

  private matchBiotechInvestorType(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const investorType = (firm?.type || investor?.investorType || '').toLowerCase();
    const startupStage = (startup.stage || '').toLowerCase();
    const startupText = (startup.description || '').toLowerCase();

    const isEarlyStage = startupStage.includes('seed') || startupStage.includes('pre') || 
      startupText.includes('preclinical') || startupText.includes('discovery');
    const isLateStage = startupText.includes('phase 3') || startupText.includes('commercial');

    if (investorType.includes('corporate') || investorType.includes('strategic')) {
      return isEarlyStage ? 90 : 100;
    }
    if (investorType.includes('vc') || investorType.includes('venture')) {
      return isEarlyStage ? 100 : 80;
    }
    if (investorType.includes('angel')) {
      return isEarlyStage ? 90 : 50;
    }
    if (investorType.includes('family office')) {
      return isLateStage ? 100 : 80;
    }
    if (investorType.includes('pe') || investorType.includes('private equity')) {
      return isLateStage ? 100 : 40;
    }

    return 60;
  }

  private matchBiotechDealStructure(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = (startup.description || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const structures = ['equity', 'convertible', 'royalty', 'co-development', 'licensing'];
    
    let startupStructures: string[] = [];
    let investorStructures: string[] = [];

    for (const structure of structures) {
      if (startupText.includes(structure)) startupStructures.push(structure);
      if (investorText.includes(structure)) investorStructures.push(structure);
    }

    if (startupStructures.length === 0 || investorStructures.length === 0) return 70;
    
    const match = startupStructures.some(s => investorStructures.includes(s));
    return match ? 100 : 50;
  }

  private checkRecentBiotechActivity(investor: Investor | null, firm: InvestmentFirm | null): boolean {
    const text = this.buildInvestorTextProfile(investor, firm).toLowerCase();
    return text.includes('active') || text.includes('recent') || text.includes('portfolio') ||
      text.includes('invested') || text.includes('backed');
  }

  private isResearchBasedBiotech(startup: Startup): boolean {
    const text = (startup.description || '').toLowerCase();
    return text.includes('research') || text.includes('discovery') || text.includes('preclinical') ||
      text.includes('platform') || text.includes('novel');
  }

  // ==================== MEDTECH SCORING ====================

  private calculateMedtechDomainScore(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): DomainSpecificScore {
    const reasons: string[] = [];
    let score = 0;
    let multiplier = 1.0;

    const investorDomain = this.detectInvestorDomain(investor, firm);
    if (investorDomain !== 'medtech' && investorDomain !== 'biotech' && investorDomain !== 'general') {
      return { domain: 'medtech', domainScore: 25, domainMultiplier: 0.5, 
        domainReasons: ['Investor not focused on medical technology'] };
    }

    // Technology Fit (25%)
    const techFit = this.matchMedtechTechnology(startup, investor, firm);
    score += techFit * 0.25;
    if (techFit >= 80) reasons.push('Strong technology alignment');

    // Stage / Regulatory Phase (25%)
    const stageScore = this.matchMedtechStage(startup, investor, firm);
    score += stageScore * 0.25;
    if (stageScore >= 80) reasons.push('Regulatory stage compatible');

    // Market / Use Case (20%)
    const marketScore = this.matchMedtechMarket(startup, investor, firm);
    score += marketScore * 0.20;
    if (marketScore >= 80) reasons.push('Target market alignment');

    // Check Size (15%)
    const checkSizeOverlap = this.calculateCheckSizeOverlap(startup, investor, firm);
    if (checkSizeOverlap < 0.20) {
      return { domain: 'medtech', domainScore: 0, domainMultiplier: 0, 
        domainReasons: ['Check size overlap below threshold'] };
    }
    score += (checkSizeOverlap * 100) * 0.15;
    if (checkSizeOverlap >= 0.7) reasons.push('Check size aligned');

    // Investor Type (10%)
    const typeScore = this.matchMedtechInvestorType(startup, investor, firm);
    score += typeScore * 0.10;
    if (typeScore >= 80) reasons.push('Investor type fits medtech');

    // Activity (5%)
    if (this.checkRecentMedtechActivity(investor, firm)) {
      multiplier *= 1.08;
      reasons.push('Active in healthcare/medtech');
      score += 5;
    }

    const finalScore = Math.min(100, Math.round(score * multiplier));
    return { domain: 'medtech', domainScore: finalScore, domainMultiplier: multiplier, domainReasons: reasons };
  }

  private matchMedtechTechnology(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = ((startup.industries as string[] || []).join(' ') + ' ' + (startup.description || '')).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const technologies = {
      'devices': ['medical device', 'implant', 'surgical', 'orthopedic', 'cardiovascular device'],
      'diagnostics': ['diagnostics', 'diagnostic', 'testing', 'assay', 'lab'],
      'digital-health': ['digital health', 'health tech', 'telemedicine', 'telehealth', 'remote monitoring'],
      'wearables': ['wearable', 'sensor', 'monitoring device', 'smart'],
      'imaging': ['imaging', 'radiology', 'mri', 'ct scan', 'ultrasound'],
      'robotics': ['surgical robot', 'robotics', 'automation']
    };

    let startupTech: string[] = [];
    let investorTech: string[] = [];

    for (const [tech, keywords] of Object.entries(technologies)) {
      if (keywords.some(k => startupText.includes(k))) startupTech.push(tech);
      if (keywords.some(k => investorText.includes(k))) investorTech.push(tech);
    }

    if (startupTech.length === 0 || investorTech.length === 0) return 60;
    
    const exactMatch = startupTech.some(t => investorTech.includes(t));
    if (exactMatch) return 100;

    return 50;
  }

  private matchMedtechStage(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = (startup.description || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const stages = {
      'concept': ['concept', 'prototype', 'development'],
      'preclinical': ['preclinical', 'bench testing', 'animal studies'],
      'clinical': ['clinical trial', 'human study', 'fda trial'],
      'clearance': ['510k', 'pma', 'de novo', 'ce mark', 'regulatory clearance'],
      'commercial': ['commercial', 'fda cleared', 'approved', 'selling', 'revenue']
    };

    let startupStage = 'general';
    let investorStage = 'general';

    for (const [stage, keywords] of Object.entries(stages)) {
      if (keywords.some(k => startupText.includes(k))) startupStage = stage;
      if (keywords.some(k => investorText.includes(k))) investorStage = stage;
    }

    if (startupStage === investorStage && startupStage !== 'general') return 100;
    if (investorStage === 'general') return 70;

    return 50;
  }

  private matchMedtechMarket(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = ((startup.industries as string[] || []).join(' ') + ' ' + (startup.description || '')).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const markets = {
      'hospital': ['hospital', 'acute care', 'inpatient'],
      'outpatient': ['outpatient', 'clinic', 'ambulatory'],
      'home': ['home care', 'home health', 'consumer', 'patient home'],
      'lab': ['laboratory', 'clinical lab', 'diagnostic lab'],
      'surgical': ['surgical', 'operating room', 'procedure']
    };

    let startupMarkets: string[] = [];
    let investorMarkets: string[] = [];

    for (const [market, keywords] of Object.entries(markets)) {
      if (keywords.some(k => startupText.includes(k))) startupMarkets.push(market);
      if (keywords.some(k => investorText.includes(k))) investorMarkets.push(market);
    }

    if (startupMarkets.length === 0 || investorMarkets.length === 0) return 60;
    
    const exactMatch = startupMarkets.some(m => investorMarkets.includes(m));
    if (exactMatch) return 100;

    return 50;
  }

  private matchMedtechInvestorType(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const investorType = (firm?.type || investor?.investorType || '').toLowerCase();
    const startupText = (startup.description || '').toLowerCase();

    const isEarlyStage = startupText.includes('prototype') || startupText.includes('development') ||
      startupText.includes('concept');
    const isCommercial = startupText.includes('commercial') || startupText.includes('revenue') ||
      startupText.includes('cleared');

    if (investorType.includes('vc') || investorType.includes('venture')) {
      return isEarlyStage ? 100 : 80;
    }
    if (investorType.includes('strategic') || investorType.includes('corporate')) {
      return isCommercial ? 100 : 70;
    }
    if (investorType.includes('pe')) {
      return isCommercial ? 100 : 40;
    }

    return 60;
  }

  private checkRecentMedtechActivity(investor: Investor | null, firm: InvestmentFirm | null): boolean {
    const text = this.buildInvestorTextProfile(investor, firm).toLowerCase();
    return text.includes('healthcare') || text.includes('medical') || text.includes('active');
  }

  // ==================== DEEP TECH / WEB3 SCORING ====================

  private calculateDeeptechDomainScore(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): DomainSpecificScore {
    const reasons: string[] = [];
    let score = 0;
    let multiplier = 1.0;

    const investorDomain = this.detectInvestorDomain(investor, firm);
    if (investorDomain !== 'deeptech' && investorDomain !== 'general') {
      return { domain: 'deeptech', domainScore: 25, domainMultiplier: 0.5, 
        domainReasons: ['Investor not focused on deep tech/Web3'] };
    }

    // Technology Fit (35%)
    const techFit = this.matchDeeptechTechnology(startup, investor, firm);
    score += techFit * 0.35;
    if (techFit >= 80) reasons.push('Strong technology thesis alignment');

    // Stage (20%)
    const stageScore = this.matchDeeptechStage(startup, investor, firm);
    score += stageScore * 0.20;
    if (stageScore >= 80) reasons.push('Development stage compatible');

    // Market / Use Case (15%)
    const marketScore = this.matchDeeptechMarket(startup, investor, firm);
    score += marketScore * 0.15;
    if (marketScore >= 80) reasons.push('Target market alignment');

    // Check Size (15%)
    const checkSizeOverlap = this.calculateCheckSizeOverlap(startup, investor, firm);
    if (checkSizeOverlap < 0.15) {
      return { domain: 'deeptech', domainScore: 0, domainMultiplier: 0, 
        domainReasons: ['Check size mismatch'] };
    }
    score += (checkSizeOverlap * 100) * 0.15;
    if (checkSizeOverlap >= 0.7) reasons.push('Check size aligned');

    // Investor Type (10%)
    const typeScore = this.matchDeeptechInvestorType(startup, investor, firm);
    score += typeScore * 0.10;
    if (typeScore >= 80) reasons.push('Investor type fits deep tech');

    // Deal Structure (5%)
    const structureScore = this.matchDeeptechDealStructure(startup, investor, firm);
    score += structureScore * 0.05;

    // Activity (bonus)
    if (this.checkRecentDeeptechActivity(investor, firm)) {
      multiplier *= 1.12;
      reasons.push('Active in deep tech/crypto investments');
    }

    const finalScore = Math.min(100, Math.round(score * multiplier));
    return { domain: 'deeptech', domainScore: finalScore, domainMultiplier: multiplier, domainReasons: reasons };
  }

  private matchDeeptechTechnology(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = ((startup.industries as string[] || []).join(' ') + ' ' + (startup.description || '')).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const technologies = {
      'ai-ml': ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'llm'],
      'blockchain': ['blockchain', 'distributed ledger', 'consensus', 'smart contract'],
      'web3': ['web3', 'decentralized', 'defi', 'dao', 'nft'],
      'quantum': ['quantum', 'quantum computing', 'qubit'],
      'robotics': ['robotics', 'autonomous', 'automation', 'drone'],
      'iot': ['iot', 'internet of things', 'sensor network', 'edge computing'],
      'crypto': ['cryptocurrency', 'token', 'bitcoin', 'ethereum', 'crypto']
    };

    let startupTech: string[] = [];
    let investorTech: string[] = [];

    for (const [tech, keywords] of Object.entries(technologies)) {
      if (keywords.some(k => startupText.includes(k))) startupTech.push(tech);
      if (keywords.some(k => investorText.includes(k))) investorTech.push(tech);
    }

    if (startupTech.length === 0 || investorTech.length === 0) return 55;
    
    const exactMatch = startupTech.some(t => investorTech.includes(t));
    if (exactMatch) return 100;

    const adjacent = [
      ['ai-ml', 'robotics'],
      ['blockchain', 'web3'],
      ['blockchain', 'crypto'],
      ['web3', 'crypto'],
      ['ai-ml', 'quantum']
    ];

    for (const pair of adjacent) {
      if (startupTech.some(t => pair.includes(t)) && investorTech.some(t => pair.includes(t))) {
        return 80;
      }
    }

    return 45;
  }

  private matchDeeptechStage(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupStage = (startup.stage || '').toLowerCase();
    const startupText = (startup.description || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const stages = {
      'research': ['research', 'lab', 'prototype', 'proof of concept'],
      'mvp': ['mvp', 'beta', 'pilot', 'early product'],
      'growth': ['scaling', 'growth', 'expansion', 'series'],
      'production': ['production', 'deployed', 'enterprise', 'revenue']
    };

    let startupPhase = 'general';
    let investorPhase = 'general';

    for (const [phase, keywords] of Object.entries(stages)) {
      if (keywords.some(k => startupText.includes(k) || startupStage.includes(k))) startupPhase = phase;
      if (keywords.some(k => investorText.includes(k))) investorPhase = phase;
    }

    if (startupPhase === investorPhase && startupPhase !== 'general') return 100;
    if (investorPhase === 'general') return 70;

    return 50;
  }

  private matchDeeptechMarket(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = ((startup.industries as string[] || []).join(' ') + ' ' + (startup.description || '')).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const markets = {
      'fintech': ['fintech', 'finance', 'payments', 'banking', 'defi'],
      'enterprise': ['enterprise', 'saas', 'b2b', 'business'],
      'infrastructure': ['infrastructure', 'protocol', 'layer 1', 'layer 2'],
      'consumer': ['consumer', 'retail', 'b2c', 'gaming'],
      'industrial': ['industrial', 'manufacturing', 'supply chain', 'logistics']
    };

    let startupMarkets: string[] = [];
    let investorMarkets: string[] = [];

    for (const [market, keywords] of Object.entries(markets)) {
      if (keywords.some(k => startupText.includes(k))) startupMarkets.push(market);
      if (keywords.some(k => investorText.includes(k))) investorMarkets.push(market);
    }

    if (startupMarkets.length === 0 || investorMarkets.length === 0) return 55;
    
    const exactMatch = startupMarkets.some(m => investorMarkets.includes(m));
    if (exactMatch) return 100;

    return 50;
  }

  private matchDeeptechInvestorType(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const investorType = (firm?.type || investor?.investorType || '').toLowerCase();
    const startupText = (startup.description || '').toLowerCase();

    const isEarlyStage = startupText.includes('seed') || startupText.includes('prototype') ||
      startupText.includes('research');

    if (investorType.includes('vc') || investorType.includes('venture')) {
      return 100;
    }
    if (investorType.includes('angel')) {
      return isEarlyStage ? 95 : 70;
    }
    if (investorType.includes('corporate')) {
      return 85;
    }
    if (investorType.includes('family office')) {
      return 75;
    }

    return 60;
  }

  private matchDeeptechDealStructure(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = (startup.description || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const structures = ['equity', 'token', 'saft', 'safe', 'convertible', 'revenue share'];
    
    let startupStructures: string[] = [];
    let investorStructures: string[] = [];

    for (const structure of structures) {
      if (startupText.includes(structure)) startupStructures.push(structure);
      if (investorText.includes(structure)) investorStructures.push(structure);
    }

    if (startupStructures.length === 0 || investorStructures.length === 0) return 70;
    
    const match = startupStructures.some(s => investorStructures.includes(s));
    return match ? 100 : 50;
  }

  private checkRecentDeeptechActivity(investor: Investor | null, firm: InvestmentFirm | null): boolean {
    const text = this.buildInvestorTextProfile(investor, firm).toLowerCase();
    return text.includes('crypto') || text.includes('web3') || text.includes('ai') || 
      text.includes('active') || text.includes('portfolio');
  }

  // ==================== VERTICAL SAAS SCORING ====================

  private calculateSaasDomainScore(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): DomainSpecificScore {
    const reasons: string[] = [];
    let score = 0;
    let multiplier = 1.0;

    const investorDomain = this.detectInvestorDomain(investor, firm);
    if (investorDomain !== 'saas' && investorDomain !== 'general') {
      return { domain: 'saas', domainScore: 25, domainMultiplier: 0.5, 
        domainReasons: ['Investor not focused on SaaS/software'] };
    }

    // Technology / Product Fit (30%)
    const techFit = this.matchSaasTechnology(startup, investor, firm);
    score += techFit * 0.30;
    if (techFit >= 80) reasons.push('Strong vertical SaaS alignment');

    // Stage / Company Maturity (25%)
    const stageScore = this.matchSaasStage(startup, investor, firm);
    score += stageScore * 0.25;
    if (stageScore >= 80) reasons.push('Stage compatibility');

    // Market / Vertical Alignment (15%)
    const marketScore = this.matchSaasMarket(startup, investor, firm);
    score += marketScore * 0.15;
    if (marketScore >= 80) reasons.push('Vertical market fit');

    // Check Size (15%)
    const checkSizeOverlap = this.calculateCheckSizeOverlap(startup, investor, firm);
    if (checkSizeOverlap < 0.25) {
      return { domain: 'saas', domainScore: 0, domainMultiplier: 0, 
        domainReasons: ['Check size overlap below 25% threshold'] };
    }
    score += (checkSizeOverlap * 100) * 0.15;
    if (checkSizeOverlap >= 0.7) reasons.push('Check size aligned');

    // Investor Type (10%)
    const typeScore = this.matchSaasInvestorType(startup, investor, firm);
    score += typeScore * 0.10;
    if (typeScore >= 80) reasons.push('Investor type fits SaaS');

    // Deal Structure (5%)
    const structureScore = this.matchSaasDealStructure(startup, investor, firm);
    score += structureScore * 0.05;

    // Activity Layer
    if (this.checkRecentSaasActivity(investor, firm)) {
      multiplier *= 1.10;
      reasons.push('Active in SaaS investments');
    }

    const finalScore = Math.min(100, Math.round(score * multiplier));
    return { domain: 'saas', domainScore: finalScore, domainMultiplier: multiplier, domainReasons: reasons };
  }

  private matchSaasTechnology(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = ((startup.industries as string[] || []).join(' ') + ' ' + (startup.description || '')).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const verticals = {
      'fintech': ['fintech', 'financial', 'payments', 'banking', 'lending', 'insurance'],
      'healthtech': ['healthtech', 'healthcare', 'health tech', 'patient', 'clinical'],
      'proptech': ['proptech', 'real estate tech', 'property tech', 'construction tech'],
      'edtech': ['edtech', 'education', 'learning', 'school', 'training'],
      'hrtech': ['hrtech', 'hr tech', 'human resources', 'workforce', 'recruiting'],
      'martech': ['martech', 'marketing tech', 'advertising', 'analytics'],
      'legaltech': ['legaltech', 'legal tech', 'law', 'compliance'],
      'logistics': ['logistics', 'supply chain', 'shipping', 'fulfillment']
    };

    let startupVerticals: string[] = [];
    let investorVerticals: string[] = [];

    for (const [vertical, keywords] of Object.entries(verticals)) {
      if (keywords.some(k => startupText.includes(k))) startupVerticals.push(vertical);
      if (keywords.some(k => investorText.includes(k))) investorVerticals.push(vertical);
    }

    if (startupVerticals.length === 0 || investorVerticals.length === 0) return 60;
    
    const exactMatch = startupVerticals.some(v => investorVerticals.includes(v));
    if (exactMatch) return 100;

    return 50;
  }

  private matchSaasStage(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupStage = (startup.stage || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const stages = {
      'seed': ['seed', 'pre-seed', 'early'],
      'series-a': ['series a', 'series-a', 'early growth'],
      'series-b': ['series b', 'series-b', 'growth'],
      'series-c': ['series c', 'series-c', 'late growth'],
      'late': ['late stage', 'scale', 'pre-ipo']
    };

    let startupPhase = 'general';
    let investorPhase = 'general';

    for (const [phase, keywords] of Object.entries(stages)) {
      if (keywords.some(k => startupStage.includes(k))) startupPhase = phase;
      if (keywords.some(k => investorText.includes(k))) investorPhase = phase;
    }

    if (startupPhase === investorPhase && startupPhase !== 'general') return 100;
    if (investorPhase === 'general') return 70;

    const adjacentStages = [
      ['seed', 'series-a'],
      ['series-a', 'series-b'],
      ['series-b', 'series-c'],
      ['series-c', 'late']
    ];

    for (const pair of adjacentStages) {
      if (pair.includes(startupPhase) && pair.includes(investorPhase)) {
        return 80;
      }
    }

    return 40;
  }

  private matchSaasMarket(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = ((startup.industries as string[] || []).join(' ') + ' ' + (startup.description || '')).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const markets = {
      'enterprise': ['enterprise', 'large business', 'fortune 500'],
      'smb': ['smb', 'small business', 'mid-market'],
      'vertical': ['vertical saas', 'industry-specific', 'niche'],
      'horizontal': ['horizontal', 'general purpose', 'cross-industry']
    };

    let startupMarkets: string[] = [];
    let investorMarkets: string[] = [];

    for (const [market, keywords] of Object.entries(markets)) {
      if (keywords.some(k => startupText.includes(k))) startupMarkets.push(market);
      if (keywords.some(k => investorText.includes(k))) investorMarkets.push(market);
    }

    if (startupMarkets.length === 0 || investorMarkets.length === 0) return 60;
    
    const exactMatch = startupMarkets.some(m => investorMarkets.includes(m));
    if (exactMatch) return 100;

    return 50;
  }

  private matchSaasInvestorType(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const investorType = (firm?.type || investor?.investorType || '').toLowerCase();
    const startupStage = (startup.stage || '').toLowerCase();

    const isEarlyStage = startupStage.includes('seed') || startupStage.includes('series a');
    const isLateStage = startupStage.includes('series c') || startupStage.includes('growth');

    if (investorType.includes('vc') || investorType.includes('venture')) {
      return 100;
    }
    if (investorType.includes('corporate')) {
      return 90;
    }
    if (investorType.includes('angel')) {
      return isEarlyStage ? 95 : 60;
    }
    if (investorType.includes('pe')) {
      return isLateStage ? 100 : 50;
    }
    if (investorType.includes('family office')) {
      return 80;
    }

    return 60;
  }

  private matchSaasDealStructure(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = (startup.description || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const structures = ['equity', 'convertible', 'safe', 'revenue share', 'arr'];
    
    let startupStructures: string[] = [];
    let investorStructures: string[] = [];

    for (const structure of structures) {
      if (startupText.includes(structure)) startupStructures.push(structure);
      if (investorText.includes(structure)) investorStructures.push(structure);
    }

    if (startupStructures.length === 0 || investorStructures.length === 0) return 70;
    
    const match = startupStructures.some(s => investorStructures.includes(s));
    return match ? 100 : 50;
  }

  private checkRecentSaasActivity(investor: Investor | null, firm: InvestmentFirm | null): boolean {
    const text = this.buildInvestorTextProfile(investor, firm).toLowerCase();
    return text.includes('saas') || text.includes('software') || text.includes('active') ||
      text.includes('portfolio') || text.includes('b2b');
  }

  // ==================== CPG SCORING ====================

  private calculateCpgDomainScore(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null
  ): DomainSpecificScore {
    const reasons: string[] = [];
    let score = 0;
    let multiplier = 1.0;

    const investorDomain = this.detectInvestorDomain(investor, firm);
    if (investorDomain !== 'cpg' && investorDomain !== 'general') {
      return { domain: 'cpg', domainScore: 25, domainMultiplier: 0.5, 
        domainReasons: ['Investor not focused on CPG/consumer brands'] };
    }

    // Product Category Fit (30%)
    const categoryFit = this.matchCpgCategory(startup, investor, firm);
    score += categoryFit * 0.30;
    if (categoryFit >= 80) reasons.push('Strong product category alignment');

    // Stage / Company Maturity (25%)
    const stageScore = this.matchCpgStage(startup, investor, firm);
    score += stageScore * 0.25;
    if (stageScore >= 80) reasons.push('Stage compatibility');

    // Distribution Channel Fit (15%)
    const channelScore = this.matchCpgDistribution(startup, investor, firm);
    score += channelScore * 0.15;
    if (channelScore >= 80) reasons.push('Distribution channel fit');

    // Check Size (15%)
    const checkSizeOverlap = this.calculateCheckSizeOverlap(startup, investor, firm);
    if (checkSizeOverlap < 0.25) {
      return { domain: 'cpg', domainScore: 0, domainMultiplier: 0, 
        domainReasons: ['Check size overlap below 25% threshold'] };
    }
    score += (checkSizeOverlap * 100) * 0.15;
    if (checkSizeOverlap >= 0.7) reasons.push('Check size aligned');

    // Investor Type (10%)
    const typeScore = this.matchCpgInvestorType(startup, investor, firm);
    score += typeScore * 0.10;
    if (typeScore >= 80) reasons.push('Investor type fits CPG');

    // Deal Structure (5%)
    const structureScore = this.matchCpgDealStructure(startup, investor, firm);
    score += structureScore * 0.05;

    // Activity Layer
    if (this.checkRecentCpgActivity(investor, firm)) {
      multiplier *= 1.08;
      reasons.push('Active in CPG investments');
    }

    const finalScore = Math.min(100, Math.round(score * multiplier));
    return { domain: 'cpg', domainScore: finalScore, domainMultiplier: multiplier, domainReasons: reasons };
  }

  private matchCpgCategory(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = ((startup.industries as string[] || []).join(' ') + ' ' + (startup.description || '')).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const categories = {
      'food': ['food', 'snacks', 'meals', 'grocery', 'organic', 'plant-based'],
      'beverage': ['beverage', 'drinks', 'coffee', 'tea', 'juice', 'alcohol', 'spirits'],
      'personal-care': ['personal care', 'beauty', 'skincare', 'cosmetics', 'wellness'],
      'household': ['household', 'cleaning', 'home care', 'laundry'],
      'pet': ['pet', 'pet food', 'pet care', 'animal'],
      'baby': ['baby', 'infant', 'kids', 'children']
    };

    let startupCategories: string[] = [];
    let investorCategories: string[] = [];

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(k => startupText.includes(k))) startupCategories.push(category);
      if (keywords.some(k => investorText.includes(k))) investorCategories.push(category);
    }

    if (startupCategories.length === 0 || investorCategories.length === 0) return 60;
    
    const exactMatch = startupCategories.some(c => investorCategories.includes(c));
    if (exactMatch) return 100;

    return 50;
  }

  private matchCpgStage(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupStage = (startup.stage || '').toLowerCase();
    const startupText = (startup.description || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const stages = {
      'seed': ['seed', 'pre-launch', 'concept', 'early'],
      'growth': ['growth', 'scaling', 'expanding'],
      'commercial': ['commercial', 'retail', 'national', 'revenue']
    };

    let startupPhase = 'general';
    let investorPhase = 'general';

    for (const [phase, keywords] of Object.entries(stages)) {
      if (keywords.some(k => startupStage.includes(k) || startupText.includes(k))) startupPhase = phase;
      if (keywords.some(k => investorText.includes(k))) investorPhase = phase;
    }

    if (startupPhase === investorPhase && startupPhase !== 'general') return 100;
    if (investorPhase === 'general') return 70;

    return 50;
  }

  private matchCpgDistribution(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = ((startup.industries as string[] || []).join(' ') + ' ' + (startup.description || '')).toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const channels = {
      'dtc': ['dtc', 'direct to consumer', 'd2c', 'ecommerce', 'e-commerce', 'online'],
      'retail': ['retail', 'grocery', 'supermarket', 'store', 'shelf'],
      'wholesale': ['wholesale', 'distribution', 'b2b'],
      'international': ['international', 'global', 'export']
    };

    let startupChannels: string[] = [];
    let investorChannels: string[] = [];

    for (const [channel, keywords] of Object.entries(channels)) {
      if (keywords.some(k => startupText.includes(k))) startupChannels.push(channel);
      if (keywords.some(k => investorText.includes(k))) investorChannels.push(channel);
    }

    if (startupChannels.length === 0 || investorChannels.length === 0) return 60;
    
    const exactMatch = startupChannels.some(c => investorChannels.includes(c));
    if (exactMatch) return 100;

    // DTC and ecommerce are adjacent
    if ((startupChannels.includes('dtc') && investorChannels.includes('retail')) ||
        (startupChannels.includes('retail') && investorChannels.includes('dtc'))) {
      return 85;
    }

    return 50;
  }

  private matchCpgInvestorType(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const investorType = (firm?.type || investor?.investorType || '').toLowerCase();
    const startupStage = (startup.stage || '').toLowerCase();

    const isEarlyStage = startupStage.includes('seed') || startupStage.includes('early');
    const isCommercial = startupStage.includes('growth') || startupStage.includes('commercial');

    if (investorType.includes('vc') || investorType.includes('venture')) {
      return isEarlyStage ? 100 : 80;
    }
    if (investorType.includes('pe')) {
      return isCommercial ? 100 : 50;
    }
    if (investorType.includes('strategic') || investorType.includes('corporate')) {
      return 95;
    }
    if (investorType.includes('angel')) {
      return isEarlyStage ? 90 : 60;
    }
    if (investorType.includes('family office')) {
      return 80;
    }

    return 60;
  }

  private matchCpgDealStructure(startup: Startup, investor: Investor | null, firm: InvestmentFirm | null): number {
    const startupText = (startup.description || '').toLowerCase();
    const investorText = this.buildInvestorTextProfile(investor, firm).toLowerCase();

    const structures = ['equity', 'convertible', 'revenue share', 'royalty', 'co-brand'];
    
    let startupStructures: string[] = [];
    let investorStructures: string[] = [];

    for (const structure of structures) {
      if (startupText.includes(structure)) startupStructures.push(structure);
      if (investorText.includes(structure)) investorStructures.push(structure);
    }

    if (startupStructures.length === 0 || investorStructures.length === 0) return 70;
    
    const match = startupStructures.some(s => investorStructures.includes(s));
    return match ? 100 : 50;
  }

  private checkRecentCpgActivity(investor: Investor | null, firm: InvestmentFirm | null): boolean {
    const text = this.buildInvestorTextProfile(investor, firm).toLowerCase();
    return text.includes('cpg') || text.includes('consumer') || text.includes('food') ||
      text.includes('beverage') || text.includes('brand') || text.includes('active');
  }

  // ==================== DOMAIN INTEGRATION ====================

  // Weight configurations for each domain based on master table
  private readonly DOMAIN_WEIGHTS: Record<IndustryDomain, { semantic: number; stage: number; market: number; checkSize: number; investorType: number; dealStructure: number }> = {
    film: { semantic: 0.25, stage: 0.20, market: 0.20, checkSize: 0.15, investorType: 0.10, dealStructure: 0.10 },
    real_estate: { semantic: 0.30, stage: 0.25, market: 0.20, checkSize: 0.15, investorType: 0.10, dealStructure: 0.00 },
    biotech: { semantic: 0.30, stage: 0.25, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    medtech: { semantic: 0.25, stage: 0.25, market: 0.20, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    deeptech: { semantic: 0.35, stage: 0.20, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    saas: { semantic: 0.30, stage: 0.25, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    cpg: { semantic: 0.30, stage: 0.25, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    fashion: { semantic: 0.30, stage: 0.25, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    beauty: { semantic: 0.30, stage: 0.25, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    food_beverage: { semantic: 0.30, stage: 0.20, market: 0.20, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    manufacturing: { semantic: 0.30, stage: 0.20, market: 0.15, checkSize: 0.20, investorType: 0.10, dealStructure: 0.05 },
    logistics: { semantic: 0.30, stage: 0.20, market: 0.15, checkSize: 0.20, investorType: 0.10, dealStructure: 0.05 },
    cleantech: { semantic: 0.30, stage: 0.25, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    sustainable_materials: { semantic: 0.30, stage: 0.25, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    fintech: { semantic: 0.30, stage: 0.20, market: 0.20, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    wealth_management: { semantic: 0.30, stage: 0.20, market: 0.20, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    enterprise_saas: { semantic: 0.30, stage: 0.25, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    digital_health: { semantic: 0.30, stage: 0.25, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    gaming: { semantic: 0.35, stage: 0.20, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    edtech: { semantic: 0.30, stage: 0.25, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    govtech: { semantic: 0.30, stage: 0.20, market: 0.20, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    cybersecurity: { semantic: 0.30, stage: 0.25, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
    general: { semantic: 0.35, stage: 0.20, market: 0.15, checkSize: 0.15, investorType: 0.10, dealStructure: 0.05 },
  };

  private calculateGenericDomainScore(
    domain: IndustryDomain,
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null,
    breakdown: EnhancedMatchCriteria
  ): DomainSpecificScore {
    const reasons: string[] = [];
    const weights = this.DOMAIN_WEIGHTS[domain];
    let multiplier = 1.0;

    // Check investor domain compatibility
    const investorDomain = this.detectInvestorDomain(investor, firm);
    if (investorDomain !== domain && investorDomain !== 'general') {
      return { domain, domainScore: 30, domainMultiplier: 0.6, 
        domainReasons: [`Investor not focused on ${this.getDomainLabel(domain)}`] };
    }

    // Calculate weighted score using breakdown components
    let score = 0;
    score += breakdown.semanticFit * weights.semantic;
    score += breakdown.stageCompatibility * weights.stage;
    score += breakdown.geographicPracticality * weights.market;
    score += breakdown.economicFit * weights.checkSize;
    score += breakdown.investorTypeLogic * weights.investorType;
    score += 70 * weights.dealStructure; // Default deal structure score

    // Add domain-specific reasons based on scores
    if (breakdown.semanticFit >= 80) reasons.push(`Strong ${this.getDomainLabel(domain)} focus alignment`);
    if (breakdown.stageCompatibility >= 80) reasons.push('Stage compatibility');
    if (breakdown.economicFit >= 70) reasons.push('Check size aligned');

    // Activity bonus
    if (breakdown.investorBehavior >= 80) {
      multiplier *= 1.1;
      reasons.push(`Active in ${this.getDomainLabel(domain)} deals`);
    }

    const finalScore = Math.min(100, Math.round(score * multiplier));
    return { domain, domainScore: finalScore, domainMultiplier: multiplier, domainReasons: reasons };
  }

  private getDomainLabel(domain: IndustryDomain): string {
    const labels: Record<IndustryDomain, string> = {
      film: 'Film/Entertainment', real_estate: 'Real Estate', biotech: 'Biotech',
      medtech: 'MedTech', deeptech: 'Deep Tech/Web3', saas: 'Vertical SaaS',
      cpg: 'CPG', fashion: 'Fashion/Apparel', beauty: 'Beauty/Personal Care',
      food_beverage: 'Food & Beverage', manufacturing: 'Manufacturing',
      logistics: 'Logistics/Mobility', cleantech: 'CleanTech', 
      sustainable_materials: 'Sustainable Materials', fintech: 'FinTech',
      wealth_management: 'Wealth Management', enterprise_saas: 'Enterprise SaaS',
      digital_health: 'Digital Health', gaming: 'Gaming/eSports', edtech: 'EdTech',
      govtech: 'GovTech', cybersecurity: 'Cybersecurity', general: 'General',
    };
    return labels[domain] || 'General';
  }

  private applyDomainScoring(
    startup: Startup,
    investor: Investor | null,
    firm: InvestmentFirm | null,
    baseScore: number,
    breakdown: EnhancedMatchCriteria
  ): { score: number; domainResult: DomainSpecificScore | null } {
    const domain = this.detectDomain(startup);

    // Use specialized scoring for complex domains
    if (domain === 'film') {
      const filmResult = this.calculateFilmDomainScore(startup, investor, firm);
      if (filmResult.domainMultiplier === 0) return { score: 0, domainResult: filmResult };
      const blendedScore = Math.round((baseScore * 0.4 + filmResult.domainScore * 0.6));
      return { score: blendedScore, domainResult: filmResult };
    }

    if (domain === 'real_estate') {
      const reResult = this.calculateRealEstateDomainScore(startup, investor, firm);
      if (reResult.domainMultiplier === 0) return { score: 0, domainResult: reResult };
      const blendedScore = Math.round((baseScore * 0.4 + reResult.domainScore * 0.6));
      return { score: blendedScore, domainResult: reResult };
    }

    if (domain === 'biotech') {
      const biotechResult = this.calculateBiotechDomainScore(startup, investor, firm);
      if (biotechResult.domainMultiplier === 0) return { score: 0, domainResult: biotechResult };
      const blendedScore = Math.round((baseScore * 0.4 + biotechResult.domainScore * 0.6));
      return { score: blendedScore, domainResult: biotechResult };
    }

    if (domain === 'medtech') {
      const medtechResult = this.calculateMedtechDomainScore(startup, investor, firm);
      if (medtechResult.domainMultiplier === 0) return { score: 0, domainResult: medtechResult };
      const blendedScore = Math.round((baseScore * 0.4 + medtechResult.domainScore * 0.6));
      return { score: blendedScore, domainResult: medtechResult };
    }

    if (domain === 'deeptech') {
      const deeptechResult = this.calculateDeeptechDomainScore(startup, investor, firm);
      if (deeptechResult.domainMultiplier === 0) return { score: 0, domainResult: deeptechResult };
      const blendedScore = Math.round((baseScore * 0.4 + deeptechResult.domainScore * 0.6));
      return { score: blendedScore, domainResult: deeptechResult };
    }

    if (domain === 'saas') {
      const saasResult = this.calculateSaasDomainScore(startup, investor, firm);
      if (saasResult.domainMultiplier === 0) return { score: 0, domainResult: saasResult };
      const blendedScore = Math.round((baseScore * 0.4 + saasResult.domainScore * 0.6));
      return { score: blendedScore, domainResult: saasResult };
    }

    if (domain === 'cpg') {
      const cpgResult = this.calculateCpgDomainScore(startup, investor, firm);
      if (cpgResult.domainMultiplier === 0) return { score: 0, domainResult: cpgResult };
      const blendedScore = Math.round((baseScore * 0.4 + cpgResult.domainScore * 0.6));
      return { score: blendedScore, domainResult: cpgResult };
    }

    // Use generic scoring for all other domains
    if (domain !== 'general') {
      const domainResult = this.calculateGenericDomainScore(domain, startup, investor, firm, breakdown);
      if (domainResult.domainMultiplier === 0) return { score: 0, domainResult };
      const blendedScore = Math.round((baseScore * 0.4 + domainResult.domainScore * 0.6));
      return { score: blendedScore, domainResult };
    }

    return { score: baseScore, domainResult: null };
  }

  async compareWithBaseline(startupId: string): Promise<{
    enhanced: EnhancedMatchResult[];
    comparison: {
      avgScoreDiff: number;
      rankChanges: number;
      newMatches: number;
      droppedMatches: number;
    };
  }> {
    const enhanced = await this.runEnhancedMatching(startupId, { limit: 100 });
    
    return {
      enhanced,
      comparison: {
        avgScoreDiff: 0,
        rankChanges: 0,
        newMatches: enhanced.length,
        droppedMatches: 0,
      },
    };
  }
}

export const enhancedMatchmakingService = new EnhancedMatchmakingService();
