import { db } from "../db";
import { 
  startups, investors, investmentFirms, matches, interactionLogs, deals,
  dealRooms, dealRoomDocuments, startupDocuments,
  type Startup, type Investor, type InvestmentFirm, type Match, type InsertMatch, type Deal 
} from "@shared/schema";
import { eq, inArray, and, desc, sql, ne, or } from "drizzle-orm";

interface DataRoomContent {
  hasDocuments: boolean;
  pitchDeckContent?: string;
  financialsContent?: string;
  capTableContent?: string;
  otherContent?: string;
  allDocumentTypes: string[];
}

async function getDataRoomDocumentsForStartup(startupId: string): Promise<DataRoomContent> {
  const result: DataRoomContent = {
    hasDocuments: false,
    allDocumentTypes: [],
  };
  
  // First check for data room associated with startup
  const [room] = await db.select().from(dealRooms).where(eq(dealRooms.startupId, startupId)).limit(1);
  
  if (room) {
    const docs = await db.select().from(dealRoomDocuments).where(eq(dealRoomDocuments.roomId, room.id));
    if (docs.length > 0) {
      result.hasDocuments = true;
      for (const doc of docs) {
        if (doc.type) {
          result.allDocumentTypes.push(doc.type);
        }
        // Use document description and name for keyword matching
        const docText = [doc.description, doc.name].filter(Boolean).join(" ");
        if (docText) {
          switch (doc.type) {
            case "pitch_deck":
              result.pitchDeckContent = (result.pitchDeckContent || "") + " " + docText;
              break;
            case "financials":
              result.financialsContent = (result.financialsContent || "") + " " + docText;
              break;
            case "cap_table":
              result.capTableContent = (result.capTableContent || "") + " " + docText;
              break;
            default:
              result.otherContent = (result.otherContent || "") + " " + docText;
          }
        }
      }
    }
  }
  
  // Also check startup documents table for content
  const startupDocs = await db.select().from(startupDocuments).where(eq(startupDocuments.startupId, startupId));
  if (startupDocs.length > 0) {
    result.hasDocuments = true;
    for (const doc of startupDocs) {
      if (doc.type) {
        result.allDocumentTypes.push(doc.type);
      }
      if (doc.content) {
        switch (doc.type) {
          case "pitch_deck":
            result.pitchDeckContent = (result.pitchDeckContent || "") + " " + doc.content;
            break;
          case "financials":
            result.financialsContent = (result.financialsContent || "") + " " + doc.content;
            break;
          case "cap_table":
            result.capTableContent = (result.capTableContent || "") + " " + doc.content;
            break;
          default:
            result.otherContent = (result.otherContent || "") + " " + doc.content;
        }
      }
    }
  }
  
  return result;
}

function extractAdditionalKeywords(documentContent: DataRoomContent): string[] {
  const keywords: string[] = [];
  const allContent = [
    documentContent.pitchDeckContent,
    documentContent.financialsContent,
    documentContent.otherContent,
  ].filter(Boolean).join(" ").toLowerCase();
  
  if (!allContent) return keywords;
  
  // Industry keywords to detect
  const industryKeywords = [
    "fintech", "healthtech", "edtech", "proptech", "insurtech", "regtech",
    "saas", "b2b", "b2c", "marketplace", "platform", "ai", "ml", "machine learning",
    "blockchain", "crypto", "defi", "nft", "web3", "metaverse",
    "biotech", "medtech", "cleantech", "greentech", "agtech", "foodtech",
    "ecommerce", "retail", "logistics", "supply chain", "automotive",
    "gaming", "entertainment", "media", "social", "community",
    "cybersecurity", "security", "privacy", "data", "analytics",
    "hr", "recruiting", "talent", "workforce", "productivity",
    "construction", "real estate", "travel", "hospitality", "sports",
    "film", "movies", "production", "studios", "entertainment",
  ];
  
  for (const keyword of industryKeywords) {
    if (allContent.includes(keyword)) {
      keywords.push(keyword);
    }
  }
  
  return keywords;
}

interface MatchCriteria {
  location: number;
  industry: number;
  stage: number;
  investorType: number;
  checkSize: number;
}

interface MatchResult {
  investorId?: string;
  firmId?: string;
  score: number;
  reasons: string[];
  breakdown: MatchCriteria;
}

const DEFAULT_WEIGHTS: MatchCriteria = {
  location: 0.20,
  industry: 0.30,
  stage: 0.25,
  investorType: 0.10,
  checkSize: 0.15,
};

const STAGE_MAPPING: Record<string, string[]> = {
  "pre-seed": ["Pre-Seed", "Pre-seed", "pre-seed", "Preseed", "preseed", "Angel", "angel"],
  "seed": ["Seed", "seed", "Seed-Stage", "Early-Stage"],
  "series-a": ["Series A", "series-a", "Series-A", "A"],
  "series-b": ["Series B", "series-b", "Series-B", "B"],
  "series-c": ["Series C", "series-c", "Series-C", "C"],
  "growth": ["Growth", "growth", "Late Stage", "late-stage"],
};

function normalizeStage(stage: string | null | undefined): string {
  if (!stage) return "";
  const lowerStage = stage.toLowerCase().trim();
  for (const [normalized, variants] of Object.entries(STAGE_MAPPING)) {
    if (variants.some(v => lowerStage.includes(v.toLowerCase()))) {
      return normalized;
    }
  }
  return lowerStage;
}

function normalizeLocation(location: string | null | undefined): string[] {
  if (!location) return [];
  const normalized = location.toLowerCase()
    .replace(/[,;\/]/g, "|")
    .split("|")
    .map(l => l.trim())
    .filter(Boolean);
  
  const expandedLocations: string[] = [...normalized];
  const locationMappings: Record<string, string[]> = {
    "san francisco": ["bay area", "sf", "silicon valley", "west coast", "california", "usa", "united states"],
    "new york": ["nyc", "ny", "east coast", "usa", "united states"],
    "london": ["uk", "united kingdom", "europe"],
    "berlin": ["germany", "europe"],
    "paris": ["france", "europe"],
    "singapore": ["asia", "southeast asia"],
    "hong kong": ["asia", "china"],
    "india": ["asia", "south asia", "bangalore", "mumbai", "delhi"],
    "global": ["worldwide", "international", "any"],
  };

  for (const loc of normalized) {
    for (const [key, aliases] of Object.entries(locationMappings)) {
      if (loc.includes(key) || aliases.some(a => loc.includes(a))) {
        expandedLocations.push(key, ...aliases);
      }
    }
  }
  
  return Array.from(new Set(expandedLocations));
}

function normalizeIndustry(industries: string[] | string | null | undefined): string[] {
  if (!industries) return [];
  const list = Array.isArray(industries) ? industries : [industries];
  return list.flatMap(i => 
    i.toLowerCase()
      .replace(/[,;&\/]/g, "|")
      .split("|")
      .map(s => s.trim())
      .filter(Boolean)
  );
}

function calculateLocationScore(
  startupLocation: string | null | undefined,
  investorLocations: string[] | string | null | undefined
): { score: number; matched: boolean; detail: string } {
  const startupLocs = normalizeLocation(startupLocation);
  const investorLocs = Array.isArray(investorLocations) 
    ? investorLocations.flatMap(l => normalizeLocation(l))
    : normalizeLocation(investorLocations as string);
  
  if (startupLocs.length === 0 || investorLocs.length === 0) {
    return { score: 0.5, matched: false, detail: "Location data incomplete" };
  }
  
  if (investorLocs.some(l => l === "global" || l === "worldwide" || l === "international")) {
    return { score: 1.0, matched: true, detail: "Global investor coverage" };
  }
  
  const overlap = startupLocs.filter(l => investorLocs.includes(l));
  if (overlap.length > 0) {
    const matchQuality = Math.min(1.0, 0.6 + (overlap.length * 0.1));
    return { score: matchQuality, matched: true, detail: `Location match: ${overlap.slice(0, 3).join(", ")}` };
  }
  
  return { score: 0.2, matched: false, detail: "Location mismatch" };
}

function calculateIndustryScore(
  startupIndustries: string[] | null | undefined,
  investorSectors: string[] | null | undefined,
  investorFocus?: string | null
): { score: number; matched: boolean; detail: string } {
  const startupSectors = normalizeIndustry(startupIndustries);
  let investorInterests = normalizeIndustry(investorSectors);
  
  if (investorFocus) {
    investorInterests = [...investorInterests, ...normalizeIndustry(investorFocus)];
  }
  
  if (startupSectors.length === 0 || investorInterests.length === 0) {
    return { score: 0.5, matched: false, detail: "Industry data incomplete" };
  }
  
  if (investorInterests.some(i => i === "agnostic" || i === "generalist")) {
    return { score: 0.85, matched: true, detail: "Sector-agnostic investor" };
  }
  
  const industryAliases: Record<string, string[]> = {
    "fintech": ["financial", "finance", "payments", "banking", "insurtech"],
    "saas": ["software", "enterprise", "b2b", "cloud"],
    "ai": ["artificial intelligence", "machine learning", "ml", "deep learning", "analytics"],
    "healthcare": ["health", "healthtech", "biotech", "medtech", "digital health"],
    "consumer": ["b2c", "retail", "e-commerce", "ecommerce", "marketplace"],
    "crypto": ["blockchain", "web3", "defi", "nft"],
    "entertainment": [
      "film", "movie", "movies", "cinema", "motion picture", "production", "studio",
      "streaming", "content", "media", "tv", "television", "video", "animation",
      "documentary", "theatrical", "distribution", "post-production", "vfx",
      "entertainment finance", "film financing", "slate financing", "gap financing",
      "completion bond", "tax credit", "film fund", "media fund", "content fund",
      "independent film", "indie film", "feature film", "series", "episodic",
      "music", "gaming", "esports", "sports media", "live events"
    ],
    "real estate": [
      "property", "properties", "realty", "real-estate", "commercial real estate",
      "residential", "multifamily", "industrial", "retail real estate", "office",
      "hospitality", "hotel", "mixed-use", "development", "construction",
      "construction loan", "bridge loan", "mezzanine", "mortgage", "reit",
      "land", "affordable housing", "senior housing", "student housing",
      "self-storage", "data center", "logistics", "warehouse", "flex space",
      "ground-up", "value-add", "core", "core-plus", "opportunistic",
      "private equity real estate", "real estate debt", "infrastructure",
      "proptech", "property technology", "contech", "construction tech"
    ],
    "climate": ["cleantech", "sustainability", "renewable", "energy", "green", "carbon", "esg"],
    "food": ["foodtech", "agtech", "agriculture", "beverage", "cpg", "restaurant"],
    "mobility": ["transportation", "automotive", "ev", "electric vehicle", "logistics", "supply chain"],
    "edtech": ["education", "learning", "training", "ed-tech", "online learning"],
    "proptech": ["property technology", "real estate tech", "retech", "contech"],
  };
  
  let matchedSectors: string[] = [];
  for (const startupSector of startupSectors) {
    for (const investorInterest of investorInterests) {
      if (startupSector === investorInterest) {
        matchedSectors.push(startupSector);
        continue;
      }
      for (const [key, aliases] of Object.entries(industryAliases)) {
        const allVariants = [key, ...aliases];
        if (allVariants.some(v => startupSector.includes(v)) && 
            allVariants.some(v => investorInterest.includes(v))) {
          matchedSectors.push(key);
        }
      }
    }
  }
  
  matchedSectors = Array.from(new Set(matchedSectors));
  if (matchedSectors.length > 0) {
    const matchQuality = Math.min(1.0, 0.6 + (matchedSectors.length * 0.15));
    return { 
      score: matchQuality, 
      matched: true, 
      detail: `Industry match: ${matchedSectors.slice(0, 3).join(", ")}` 
    };
  }
  
  return { score: 0.1, matched: false, detail: "Industry mismatch" };
}

function calculateStageScore(
  startupStage: string | null | undefined,
  investorStages: string[] | null | undefined,
  fundingStage?: string | null
): { score: number; matched: boolean; detail: string } {
  const normalizedStartupStage = normalizeStage(startupStage);
  
  let investorStageList: string[] = [];
  if (investorStages && Array.isArray(investorStages)) {
    investorStageList = investorStages.map(s => normalizeStage(s));
  }
  if (fundingStage) {
    investorStageList.push(normalizeStage(fundingStage));
  }
  investorStageList = Array.from(new Set(investorStageList.filter(Boolean)));
  
  if (!normalizedStartupStage || investorStageList.length === 0) {
    return { score: 0.5, matched: false, detail: "Stage data incomplete" };
  }
  
  if (investorStageList.includes(normalizedStartupStage)) {
    return { score: 1.0, matched: true, detail: `Stage match: ${startupStage}` };
  }
  
  const stageOrder = ["pre-seed", "seed", "series-a", "series-b", "series-c", "growth"];
  const startupIndex = stageOrder.indexOf(normalizedStartupStage);
  if (startupIndex !== -1) {
    for (const investorStage of investorStageList) {
      const investorIndex = stageOrder.indexOf(investorStage);
      if (investorIndex !== -1) {
        const distance = Math.abs(startupIndex - investorIndex);
        if (distance === 1) {
          return { score: 0.6, matched: true, detail: "Adjacent stage (may stretch)" };
        }
      }
    }
  }
  
  return { score: 0.1, matched: false, detail: "Stage mismatch" };
}

function calculateCheckSizeScore(
  targetAmount: number | null | undefined,
  checkSizeMin: number | null | undefined,
  checkSizeMax: number | null | undefined,
  typicalCheckSize?: string | null
): { score: number; matched: boolean; detail: string } {
  if (!targetAmount) {
    return { score: 0.5, matched: false, detail: "Funding target not specified" };
  }
  
  if (checkSizeMin && checkSizeMax) {
    if (targetAmount >= checkSizeMin && targetAmount <= checkSizeMax * 2) {
      return { score: 1.0, matched: true, detail: "Check size in range" };
    }
    if (targetAmount >= checkSizeMin * 0.5 && targetAmount <= checkSizeMax * 3) {
      return { score: 0.6, matched: true, detail: "Check size partially matches" };
    }
    return { score: 0.2, matched: false, detail: "Check size out of range" };
  }
  
  if (typicalCheckSize) {
    const parsed = parseCheckSizeRange(typicalCheckSize);
    if (parsed) {
      if (targetAmount >= parsed.min && targetAmount <= parsed.max * 2) {
        return { score: 0.9, matched: true, detail: "Typical check size aligns" };
      }
    }
  }
  
  return { score: 0.5, matched: false, detail: "Check size data incomplete" };
}

function parseCheckSizeRange(text: string): { min: number; max: number } | null {
  const cleanText = text.replace(/[,$]/g, "").toLowerCase();
  const ranges = cleanText.match(/(\d+(?:\.\d+)?)\s*[k|m]?(?:\s*[-to]+\s*)?(\d+(?:\.\d+)?)\s*[k|m]?/i);
  
  if (ranges) {
    const multiplier = (val: string) => {
      if (val.includes("m")) return 1000000;
      if (val.includes("k")) return 1000;
      return 1;
    };
    const minStr = ranges[1] || "0";
    const maxStr = ranges[2] || ranges[1] || "0";
    const min = parseFloat(minStr) * (cleanText.includes("m") ? 1000000 : (cleanText.includes("k") ? 1000 : 1));
    const max = parseFloat(maxStr) * (cleanText.includes("m") ? 1000000 : (cleanText.includes("k") ? 1000 : 1));
    return { min, max: max || min * 10 };
  }
  
  return null;
}

function calculateInvestorTypeScore(
  startupStage: string | null | undefined,
  investorType: string | null | undefined
): { score: number; matched: boolean; detail: string } {
  if (!investorType) {
    return { score: 0.5, matched: false, detail: "Investor type unknown" };
  }
  
  const normalizedType = investorType.toLowerCase();
  const normalizedStage = normalizeStage(startupStage);
  
  const typeStageAffinity: Record<string, string[]> = {
    "angel": ["pre-seed", "seed"],
    "accelerator": ["pre-seed", "seed"],
    "venture capital": ["seed", "series-a", "series-b"],
    "vc": ["seed", "series-a", "series-b"],
    "private equity": ["series-c", "growth"],
    "pe": ["series-c", "growth"],
    "corporate vc": ["series-a", "series-b", "series-c"],
    "cvc": ["series-a", "series-b", "series-c"],
    "family office": ["seed", "series-a", "series-b", "series-c"],
  };
  
  for (const [type, stages] of Object.entries(typeStageAffinity)) {
    if (normalizedType.includes(type) && stages.includes(normalizedStage)) {
      return { score: 1.0, matched: true, detail: `${investorType} typically invests at ${startupStage}` };
    }
  }
  
  return { score: 0.5, matched: false, detail: "Neutral investor type fit" };
}

export async function generateMatchesForStartup(
  startupId: string,
  weights: MatchCriteria = DEFAULT_WEIGHTS,
  limit: number = 50
): Promise<MatchResult[]> {
  const [startup] = await db.select().from(startups).where(eq(startups.id, startupId)).limit(1);
  if (!startup) {
    throw new Error("Startup not found");
  }

  // Fetch data room documents for enhanced matching
  const documentContent = await getDataRoomDocumentsForStartup(startupId);
  const documentKeywords = extractAdditionalKeywords(documentContent);
  
  // Combine startup industries with document-extracted keywords
  const enhancedIndustries = [
    ...(startup.industries || []),
    ...documentKeywords,
  ];

  const allInvestors = await db.select().from(investors).where(eq(investors.isActive, true));
  const allFirms = await db.select().from(investmentFirms);
  
  const firmMap = new Map(allFirms.map(f => [f.id, f]));
  
  const existingMatches = await db.select()
    .from(matches)
    .where(eq(matches.startupId, startupId));
  const existingMatchIds = new Set(existingMatches.map(m => `${m.investorId || ""}-${m.firmId || ""}`));
  
  const results: MatchResult[] = [];
  
  for (const investor of allInvestors) {
    const firm = investor.firmId ? firmMap.get(investor.firmId) : undefined;
    const matchKey = `${investor.id}-${firm?.id || ""}`;
    
    if (existingMatchIds.has(matchKey)) continue;
    
    const investorLocations = investor.location 
      ? [investor.location, ...(firm?.location ? [firm.location] : [])]
      : (firm?.location ? [firm.location] : []);
    
    const locationResult = calculateLocationScore(
      startup.location,
      investorLocations.length > 0 ? investorLocations : 
        (investor.folkCustomFields?.["Preferred Geography"] as string) ||
        (investor.folkCustomFields?.["Location"] as string[])
    );
    
    // Use enhanced industries (including document-extracted keywords) for matching
    const industryResult = calculateIndustryScore(
      enhancedIndustries,
      [...(investor.sectors || []), ...(firm?.sectors || [])],
      investor.folkCustomFields?.["Investment Focus"] as string ||
        firm?.folkCustomFields?.["Fund focus"] as string
    );
    
    const stageResult = calculateStageScore(
      startup.stage,
      [...(investor.stages || []), ...(firm?.stages || [])],
      investor.fundingStage || investor.folkCustomFields?.["Stage"] as string
    );
    
    const checkSizeResult = calculateCheckSizeScore(
      startup.targetAmount,
      firm?.checkSizeMin,
      firm?.checkSizeMax,
      investor.typicalInvestment || firm?.typicalCheckSize
    );
    
    const typeResult = calculateInvestorTypeScore(
      startup.stage,
      investor.investorType || firm?.type
    );
    
    const weightedScore = Math.round(
      (locationResult.score * weights.location +
       industryResult.score * weights.industry +
       stageResult.score * weights.stage +
       checkSizeResult.score * weights.checkSize +
       typeResult.score * weights.investorType) * 100
    );
    
    const reasons: string[] = [];
    if (industryResult.matched) reasons.push(industryResult.detail);
    if (stageResult.matched) reasons.push(stageResult.detail);
    if (locationResult.matched) reasons.push(locationResult.detail);
    if (checkSizeResult.matched) reasons.push(checkSizeResult.detail);
    if (typeResult.matched) reasons.push(typeResult.detail);
    
    // Include all matches above 20% threshold
    if (weightedScore >= 20 || reasons.length >= 1) {
      results.push({
        investorId: investor.id,
        firmId: firm?.id,
        score: weightedScore,
        reasons,
        breakdown: {
          location: Math.round(locationResult.score * 100),
          industry: Math.round(industryResult.score * 100),
          stage: Math.round(stageResult.score * 100),
          investorType: Math.round(typeResult.score * 100),
          checkSize: Math.round(checkSizeResult.score * 100),
        },
      });
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  
  return results.slice(0, limit);
}

export async function saveMatchResults(
  startupId: string,
  matchResults: MatchResult[]
): Promise<Match[]> {
  if (matchResults.length === 0) return [];
  
  const insertData: (typeof matches.$inferInsert)[] = matchResults.map(result => ({
    startupId,
    investorId: result.investorId || null,
    firmId: result.firmId || null,
    matchScore: result.score,
    matchReasons: result.reasons,
    status: "suggested",
    metadata: { breakdown: result.breakdown },
    sentimentAnalysis: null,
    userFeedback: null,
    contactId: null,
    founderNotes: null,
    predictedInterest: null,
  }));
  
  const inserted = await db.insert(matches).values(insertData).returning();
  return inserted;
}

export async function getMatchesForUser(userId: string): Promise<Match[]> {
  const userStartups = await db.select()
    .from(startups)
    .where(eq(startups.founderId, userId));
  
  if (userStartups.length === 0) return [];
  
  const startupIds = userStartups.map(s => s.id);
  
  const userMatches = await db.select()
    .from(matches)
    .where(inArray(matches.startupId, startupIds))
    .orderBy(desc(matches.matchScore));
    
  return userMatches;
}

export async function verifyMatchOwnership(matchId: string, userId: string): Promise<boolean> {
  const [match] = await db.select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
    
  if (!match) return false;
  
  const [startup] = await db.select()
    .from(startups)
    .where(eq(startups.id, match.startupId))
    .limit(1);
    
  return startup?.founderId === userId;
}

export async function updateMatchStatus(
  matchId: string,
  status: string,
  feedback?: { rating?: string; reason?: string }
): Promise<Match | null> {
  const updateData: Record<string, any> = {
    status,
    updatedAt: new Date(),
  };
  
  if (feedback) {
    updateData.userFeedback = {
      rating: feedback.rating,
      reason: feedback.reason,
      timestamp: new Date().toISOString(),
    };
  }
  
  const [updated] = await db.update(matches)
    .set(updateData)
    .where(eq(matches.id, matchId))
    .returning();
  
  return updated || null;
}

export async function adjustWeightsFromFeedback(
  userId: string
): Promise<MatchCriteria> {
  const userStartups = await db.select()
    .from(startups)
    .where(eq(startups.founderId, userId));
  
  if (userStartups.length === 0) return DEFAULT_WEIGHTS;
  
  const startupIds = userStartups.map(s => s.id);
  
  // Get matches with user feedback
  const userMatches = await db.select()
    .from(matches)
    .where(
      and(
        inArray(matches.startupId, startupIds),
        ne(matches.status, "suggested")
      )
    );
  
  // Get completed deals (won or lost) for these startups
  const completedDeals = await db.select()
    .from(deals)
    .where(
      and(
        inArray(deals.startupId, startupIds),
        or(eq(deals.status, "won"), eq(deals.status, "lost"))
      )
    );
  
  // Identify positive signals: saved/contacted matches + won deals
  const positiveMatches = userMatches.filter(m => 
    m.status === "saved" || m.status === "contacted" || m.status === "converted" ||
    (m.userFeedback as any)?.rating === "positive"
  );
  
  // Find matches linked to won deals (strongest positive signal)
  const wonDeals = completedDeals.filter(d => d.status === "won");
  const wonDealInvestorIds = wonDeals.map(d => d.investorId).filter(Boolean);
  const wonDealFirmIds = wonDeals.map(d => d.firmId).filter(Boolean);
  
  // Matches connected to won deals get extra weight
  const wonDealMatches = userMatches.filter(m => 
    (m.investorId && wonDealInvestorIds.includes(m.investorId)) ||
    (m.firmId && wonDealFirmIds.includes(m.firmId))
  );
  
  // Negative signals: passed matches + lost deals
  const negativeMatches = userMatches.filter(m => 
    m.status === "passed" || (m.userFeedback as any)?.rating === "negative"
  );
  
  const lostDeals = completedDeals.filter(d => d.status === "lost");
  const lostDealInvestorIds = lostDeals.map(d => d.investorId).filter(Boolean);
  const lostDealFirmIds = lostDeals.map(d => d.firmId).filter(Boolean);
  
  const lostDealMatches = userMatches.filter(m => 
    (m.investorId && lostDealInvestorIds.includes(m.investorId)) ||
    (m.firmId && lostDealFirmIds.includes(m.firmId))
  );
  
  // Combine all signals with weights: won deals (3x), positive matches (1x), lost deals (-1x), negative matches (-0.5x)
  const allSignals = [
    ...wonDealMatches.map(m => ({ match: m, weight: 3 })),
    ...positiveMatches.map(m => ({ match: m, weight: 1 })),
    ...lostDealMatches.map(m => ({ match: m, weight: -1 })),
    ...negativeMatches.map(m => ({ match: m, weight: -0.5 })),
  ];
  
  if (allSignals.length < 3) return DEFAULT_WEIGHTS;
  
  // Calculate weighted averages for each factor
  const weightedBreakdown = {
    location: 0,
    industry: 0,
    stage: 0,
    investorType: 0,
    checkSize: 0,
  };
  
  let totalWeight = 0;
  for (const { match, weight } of allSignals) {
    const breakdown = (match.metadata as any)?.breakdown;
    if (breakdown && weight > 0) { // Only use positive signals for weight learning
      weightedBreakdown.location += (breakdown.location || 50) * weight;
      weightedBreakdown.industry += (breakdown.industry || 50) * weight;
      weightedBreakdown.stage += (breakdown.stage || 50) * weight;
      weightedBreakdown.investorType += (breakdown.investorType || 50) * weight;
      weightedBreakdown.checkSize += (breakdown.checkSize || 50) * weight;
      totalWeight += weight;
    }
  }
  
  if (totalWeight === 0) return DEFAULT_WEIGHTS;
  
  // Normalize to get percentages
  const avgLocation = weightedBreakdown.location / totalWeight;
  const avgIndustry = weightedBreakdown.industry / totalWeight;
  const avgStage = weightedBreakdown.stage / totalWeight;
  const avgInvestorType = weightedBreakdown.investorType / totalWeight;
  const avgCheckSize = weightedBreakdown.checkSize / totalWeight;
  
  const total = avgLocation + avgIndustry + avgStage + avgInvestorType + avgCheckSize;
  
  // Blend learned weights with default weights (70% learned, 30% default) for stability
  const blendFactor = 0.7;
  return {
    location: (avgLocation / total) * blendFactor + DEFAULT_WEIGHTS.location * (1 - blendFactor),
    industry: (avgIndustry / total) * blendFactor + DEFAULT_WEIGHTS.industry * (1 - blendFactor),
    stage: (avgStage / total) * blendFactor + DEFAULT_WEIGHTS.stage * (1 - blendFactor),
    investorType: (avgInvestorType / total) * blendFactor + DEFAULT_WEIGHTS.investorType * (1 - blendFactor),
    checkSize: (avgCheckSize / total) * blendFactor + DEFAULT_WEIGHTS.checkSize * (1 - blendFactor),
  };
}

/**
 * Process deal outcome and update related match records
 * Called when a deal status changes to 'won' or 'lost'
 */
export async function processDealOutcomeFeedback(
  deal: Deal
): Promise<void> {
  if (deal.status !== "won" && deal.status !== "lost") return;
  
  const isPositive = deal.status === "won";
  
  // Must have a startup to correlate matches
  if (!deal.startupId) {
    console.log("[Matchmaking] Deal has no startupId, skipping feedback processing");
    return;
  }
  
  // Build conditions for investor/firm match (at least one needed)
  const investorOrFirmConditions: any[] = [];
  if (deal.investorId) {
    investorOrFirmConditions.push(eq(matches.investorId, deal.investorId));
  }
  if (deal.firmId) {
    investorOrFirmConditions.push(eq(matches.firmId, deal.firmId));
  }
  
  // If no investor or firm on deal, we can't correlate to matches
  if (investorOrFirmConditions.length === 0) {
    console.log("[Matchmaking] Deal has no investorId or firmId, skipping feedback processing");
    return;
  }
  
  // Build the WHERE clause safely based on number of conditions
  let whereClause;
  const startupCondition = eq(matches.startupId, deal.startupId);
  
  if (investorOrFirmConditions.length === 1) {
    // Single condition - combine with startup using AND
    whereClause = and(startupCondition, investorOrFirmConditions[0]);
  } else {
    // Multiple conditions - use OR for investor/firm, AND with startup
    whereClause = and(startupCondition, or(...investorOrFirmConditions));
  }
  
  // Find matching records
  const relatedMatches = await db.select()
    .from(matches)
    .where(whereClause);
  
  if (relatedMatches.length === 0) {
    console.log(`[Matchmaking] No related matches found for deal ${deal.id}`);
    return;
  }
  
  // Update match status and feedback based on deal outcome
  for (const match of relatedMatches) {
    const existingFeedback = match.userFeedback as any;
    
    // Preserve existing feedback and merge with deal outcome
    const feedback = {
      ...(existingFeedback || {}),
      rating: isPositive ? "positive" : "negative",
      reason: `Deal ${deal.title} ${isPositive ? "closed successfully" : "was passed"}`,
      timestamp: new Date().toISOString(),
      dealId: deal.id,
      dealOutcome: deal.status,
    };
    
    // Only update status to converted for won deals; don't downgrade existing statuses
    const newStatus = isPositive ? "converted" : match.status;
    
    await db.update(matches)
      .set({
        status: newStatus,
        userFeedback: feedback,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, match.id));
  }
  
  console.log(`[Matchmaking] Processed ${deal.status} deal outcome for ${relatedMatches.length} related matches`);
}

export async function getTopStartupsForInvestor(
  investorId: string,
  limit: number = 20
): Promise<Array<{ startup: Startup; score: number; reasons: string[] }>> {
  const [investor] = await db.select()
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);
  
  if (!investor) {
    throw new Error("Investor not found");
  }
  
  const firm = investor.firmId 
    ? (await db.select().from(investmentFirms).where(eq(investmentFirms.id, investor.firmId)))[0]
    : undefined;
  
  const allStartups = await db.select()
    .from(startups)
    .where(eq(startups.isPublic, true));
  
  const results: Array<{ startup: Startup; score: number; reasons: string[] }> = [];
  
  for (const startup of allStartups) {
    const investorLocations = investor.location 
      ? [investor.location, ...(firm?.location ? [firm.location] : [])]
      : (firm?.location ? [firm.location] : []);
    
    const locationResult = calculateLocationScore(
      startup.location,
      investorLocations.length > 0 ? investorLocations : 
        (investor.folkCustomFields?.["Preferred Geography"] as string)
    );
    
    const industryResult = calculateIndustryScore(
      startup.industries,
      [...(investor.sectors || []), ...(firm?.sectors || [])],
      investor.folkCustomFields?.["Investment Focus"] as string
    );
    
    const stageResult = calculateStageScore(
      startup.stage,
      [...(investor.stages || []), ...(firm?.stages || [])],
      investor.fundingStage
    );
    
    const score = Math.round(
      (locationResult.score * 0.2 +
       industryResult.score * 0.4 +
       stageResult.score * 0.4) * 100
    );
    
    const reasons: string[] = [];
    if (industryResult.matched) reasons.push(industryResult.detail);
    if (stageResult.matched) reasons.push(stageResult.detail);
    if (locationResult.matched) reasons.push(locationResult.detail);
    
    if (score >= 50 || reasons.length >= 2) {
      results.push({ startup, score, reasons });
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
