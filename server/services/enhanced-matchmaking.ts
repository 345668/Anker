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

    const finalScore = Math.min(100, Math.round(baseScore * contextMultiplier * activityMultiplier));
    const reasons = this.generateReasons(breakdown, startup, investor, firm);

    return {
      investorId: investor?.id,
      firmId: firm?.id,
      score: finalScore,
      baseScore,
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
    if (!target) return 0.5;

    let checkMin = 0, checkMax = Infinity;
    
    if (firm?.checkSizeMin) checkMin = firm.checkSizeMin;
    if (firm?.checkSizeMax) checkMax = firm.checkSizeMax;
    
    if (firm?.typicalCheckSize) {
      const parsed = this.parseCheckSizeRange(firm.typicalCheckSize);
      if (parsed) {
        checkMin = parsed.min;
        checkMax = parsed.max;
      }
    }

    if (investor?.typicalInvestment) {
      const parsed = this.parseCheckSizeRange(investor.typicalInvestment);
      if (parsed) {
        checkMin = parsed.min;
        checkMax = parsed.max;
      }
    }

    if (checkMin === 0 && checkMax === Infinity) return 0.5;

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
