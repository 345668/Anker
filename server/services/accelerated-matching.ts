import { db } from "../db";
import { 
  acceleratedMatchJobs, 
  investors, 
  startups, 
  investmentFirms,
  AcceleratedMatchJob 
} from "@shared/schema";
import { eq, desc, and, or, ilike, sql, inArray } from "drizzle-orm";
import { wsNotificationService } from "./websocket";

async function callMistralAPI(prompt: string): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY not configured");
  }

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mistral-large-latest",
      messages: [
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

function broadcastNotification(userId: string, notification: any) {
  wsNotificationService.sendNotification(userId, notification);
}

interface ExtractedDeckData {
  problem?: string;
  solution?: string;
  market?: string;
  businessModel?: string;
  traction?: string;
  team?: Array<{
    name?: string;
    role?: string;
    linkedinUrl?: string;
    background?: string;
  }>;
  competitors?: string[];
  askAmount?: string;
  useOfFunds?: string;
  websiteUrl?: string;
  companyName?: string;
  industries?: string[];
  stage?: string;
  location?: string;
}

interface MatchResult {
  investorId?: string;
  investorName?: string;
  investorEmail?: string;
  firmName?: string;
  matchScore?: number;
  matchReasons?: string[];
  investorProfile?: Record<string, any>;
}

export async function createAcceleratedMatchJob(
  founderId: string,
  startupId?: string,
  pitchDeckUrl?: string
): Promise<AcceleratedMatchJob> {
  const [job] = await db.insert(acceleratedMatchJobs).values({
    founderId,
    startupId,
    pitchDeckUrl,
    status: "pending",
    progress: 0,
    currentStep: "Initializing...",
  }).returning();

  return job;
}

export async function updateJobProgress(
  jobId: string,
  status: string,
  progress: number,
  currentStep: string,
  additionalData?: Partial<AcceleratedMatchJob>
): Promise<void> {
  await db.update(acceleratedMatchJobs)
    .set({
      status,
      progress,
      currentStep,
      updatedAt: new Date(),
      ...additionalData,
    })
    .where(eq(acceleratedMatchJobs.id, jobId));
}

export async function getJobById(jobId: string): Promise<AcceleratedMatchJob | null> {
  const [job] = await db.select()
    .from(acceleratedMatchJobs)
    .where(eq(acceleratedMatchJobs.id, jobId))
    .limit(1);
  return job || null;
}

export async function getJobsForUser(userId: string): Promise<AcceleratedMatchJob[]> {
  return db.select()
    .from(acceleratedMatchJobs)
    .where(eq(acceleratedMatchJobs.founderId, userId))
    .orderBy(desc(acceleratedMatchJobs.createdAt));
}

export async function analyzePitchDeckContent(deckText: string): Promise<ExtractedDeckData> {
  const prompt = `Analyze this pitch deck content and extract structured information. Return a JSON object with the following fields:

{
  "companyName": "The company name",
  "problem": "The problem being solved",
  "solution": "The solution/product",
  "market": "Target market and market size",
  "businessModel": "How the company makes money",
  "traction": "Current traction, metrics, customers",
  "team": [
    {
      "name": "Team member name",
      "role": "Their role/title",
      "linkedinUrl": "LinkedIn URL if mentioned",
      "background": "Brief background"
    }
  ],
  "competitors": ["List of competitors"],
  "askAmount": "Funding amount being raised",
  "useOfFunds": "How funds will be used",
  "websiteUrl": "Company website if mentioned",
  "industries": ["Relevant industries/sectors"],
  "stage": "Company stage (Pre-seed, Seed, Series A, etc.)",
  "location": "Company location if mentioned"
}

Pitch deck content:
${deckText}

Return ONLY valid JSON, no explanations.`;

  try {
    const response = await callMistralAPI(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {};
  } catch (error) {
    console.error("Error analyzing pitch deck:", error);
    return {};
  }
}

export async function enrichTeamProfiles(
  team: Array<{ name?: string; role?: string; linkedinUrl?: string; background?: string }>
): Promise<Array<{
  name?: string;
  role?: string;
  linkedinUrl?: string;
  linkedinData?: {
    headline?: string;
    experience?: string[];
    education?: string[];
    skills?: string[];
  };
  twitterUrl?: string;
  otherProfiles?: string[];
}>> {
  if (!team || team.length === 0) {
    return [];
  }

  console.log(`[Accelerated Matching] Enriching ${team.length} team profiles in parallel...`);
  const startTime = Date.now();

  const enrichmentPromises = team.map(async (member) => {
    const enrichedMember: any = {
      name: member.name,
      role: member.role,
      linkedinUrl: member.linkedinUrl,
    };

    if (member.name) {
      const prompt = `Given the founder/team member "${member.name}" who works as "${member.role || 'team member'}" with background "${member.background || 'not specified'}", generate a brief professional profile summary. Return JSON:
{
  "headline": "Professional headline",
  "experience": ["Previous relevant experience"],
  "education": ["Education background"],
  "skills": ["Key skills"],
  "suggestedLinkedinSearch": "Search query to find them on LinkedIn"
}
Return ONLY valid JSON.`;

      try {
        const response = await callMistralAPI(prompt);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          enrichedMember.linkedinData = {
            headline: data.headline,
            experience: data.experience,
            education: data.education,
            skills: data.skills,
          };
        }
      } catch (error) {
        console.error(`Error enriching profile for ${member.name}:`, error);
      }
    }

    return enrichedMember;
  });

  const enrichedTeam = await Promise.all(enrichmentPromises);
  console.log(`[Accelerated Matching] Team enrichment completed in ${Date.now() - startTime}ms`);
  
  return enrichedTeam;
}

export async function matchWithInvestors(
  extractedData: ExtractedDeckData,
  limit: number = 20
): Promise<MatchResult[]> {
  const allInvestors = await db.select()
    .from(investors)
    .where(eq(investors.isActive, true))
    .limit(500);

  if (allInvestors.length === 0) {
    return [];
  }

  const startupProfile = {
    companyName: extractedData.companyName,
    industries: extractedData.industries || [],
    stage: extractedData.stage,
    location: extractedData.location,
    problem: extractedData.problem,
    solution: extractedData.solution,
    market: extractedData.market,
    traction: extractedData.traction,
    askAmount: extractedData.askAmount,
  };

  const matches: MatchResult[] = [];

  for (const investor of allInvestors) {
    const score = calculateInvestorMatch(startupProfile, investor);
    // Include all matches above 20% threshold for broader discovery
    if (score.score >= 20) {
      matches.push({
        investorId: investor.id,
        investorName: `${investor.firstName || ''} ${investor.lastName || ''}`.trim(),
        investorEmail: investor.email || undefined,
        firmName: investor.folkCustomFields?.["Managing Organization"] as string || undefined,
        matchScore: score.score,
        matchReasons: score.reasons,
        investorProfile: {
          id: investor.id,
          firstName: investor.firstName,
          lastName: investor.lastName,
          email: investor.email,
          title: investor.title,
          investorType: investor.investorType,
          stages: investor.stages,
          sectors: investor.sectors,
          location: investor.location,
          folkCustomFields: investor.folkCustomFields,
        },
      });
    }
  }

  matches.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  return matches.slice(0, limit);
}

function calculateInvestorMatch(
  startup: {
    companyName?: string;
    industries?: string[];
    stage?: string;
    location?: string;
    problem?: string;
    solution?: string;
  },
  investor: any
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const investorFocus = investor.folkCustomFields?.["Investment Focus"] as string || "";
  const investorSectors = investor.folkCustomFields?.["Fund focus"] as string[] || investor.sectors || [];
  const investorStages = investor.folkCustomFields?.["Fund stage"] as string[] || investor.stages || [];
  const investorLocation = investor.folkCustomFields?.["Preferred Geography"] as string || investor.location || "";

  // Niche industry aliases for better matching
  const industryAliases: Record<string, string[]> = {
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
    "fintech": ["financial", "finance", "payments", "banking", "insurtech"],
    "saas": ["software", "enterprise", "b2b", "cloud"],
    "ai": ["artificial intelligence", "machine learning", "ml", "deep learning"],
    "healthcare": ["health", "healthtech", "biotech", "medtech", "digital health"],
    "climate": ["cleantech", "sustainability", "renewable", "energy", "green"],
  };

  const startupIndustries = startup.industries || [];
  const focusLower = investorFocus.toLowerCase();
  const sectorsStr = Array.isArray(investorSectors) ? investorSectors.join(" ").toLowerCase() : "";
  
  // Check for direct matches and alias matches
  const industryMatches: string[] = [];
  
  for (const ind of startupIndustries) {
    const indLower = ind.toLowerCase();
    
    // Direct match
    if (focusLower.includes(indLower) || sectorsStr.includes(indLower)) {
      industryMatches.push(ind);
      continue;
    }
    
    // Check alias matches
    for (const [category, aliases] of Object.entries(industryAliases)) {
      const allTerms = [category, ...aliases];
      const startupHasAlias = allTerms.some(term => indLower.includes(term) || term.includes(indLower));
      const investorHasAlias = allTerms.some(term => focusLower.includes(term) || sectorsStr.includes(term));
      
      if (startupHasAlias && investorHasAlias) {
        industryMatches.push(`${ind} (via ${category})`);
        break;
      }
    }
  }

  if (industryMatches.length > 0) {
    score += 35;
    reasons.push(`Industry match: ${industryMatches.join(", ")}`);
  }

  if (startup.stage && investorStages.length > 0) {
    const stageLower = startup.stage.toLowerCase();
    const matchingStage = investorStages.find((s: string) => 
      s.toLowerCase().includes(stageLower) || stageLower.includes(s.toLowerCase())
    );
    if (matchingStage) {
      score += 25;
      reasons.push(`Stage match: ${matchingStage}`);
    }
  }

  if (startup.location && investorLocation) {
    const locationLower = startup.location.toLowerCase();
    const investorLocLower = investorLocation.toLowerCase();
    if (
      investorLocLower.includes(locationLower) ||
      locationLower.includes(investorLocLower) ||
      investorLocLower.includes("global") ||
      investorLocLower.includes("united states")
    ) {
      score += 20;
      reasons.push(`Geographic fit: ${investorLocation}`);
    }
  }

  if (investor.investorType) {
    score += 10;
    reasons.push(`Active investor: ${investor.investorType}`);
  }

  if (investor.email) {
    score += 10;
    reasons.push("Direct contact available");
  }

  return { score: Math.min(score, 100), reasons };
}

async function matchWithFirms(
  extractedData: ExtractedDeckData,
  limit: number = 30
): Promise<Array<{
  firmId: string;
  firmName: string;
  matchScore: number;
  matchReasons: string[];
  firmProfile: Record<string, any>;
}>> {
  const allFirms = await db.select()
    .from(investmentFirms)
    .limit(500);

  if (allFirms.length === 0) {
    console.log("[Accelerated Matching] No investment firms found in database");
    return [];
  }

  console.log(`[Accelerated Matching] Evaluating ${allFirms.length} investment firms...`);

  const startupProfile = {
    industries: extractedData.industries || [],
    stage: extractedData.stage,
    location: extractedData.location,
  };

  const firmMatches: Array<{
    firmId: string;
    firmName: string;
    matchScore: number;
    matchReasons: string[];
    firmProfile: Record<string, any>;
  }> = [];

  for (const firm of allFirms) {
    const score = calculateFirmMatch(startupProfile, firm);
    if (score.score >= 25) {
      firmMatches.push({
        firmId: firm.id,
        firmName: firm.name,
        matchScore: score.score,
        matchReasons: score.reasons,
        firmProfile: {
          id: firm.id,
          name: firm.name,
          type: firm.type,
          stages: firm.stages,
          sectors: firm.sectors,
          location: firm.location,
          website: firm.website,
          typicalCheckSize: firm.typicalCheckSize,
        },
      });
    }
  }

  firmMatches.sort((a, b) => b.matchScore - a.matchScore);
  console.log(`[Accelerated Matching] Found ${firmMatches.length} matching firms`);
  return firmMatches.slice(0, limit);
}

function calculateFirmMatch(
  startup: {
    industries?: string[];
    stage?: string;
    location?: string;
  },
  firm: any
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const firmSectors = firm.sectors || [];
  const firmStages = firm.stages || [];
  const firmLocation = firm.location || "";
  const firmName = (firm.name || "").toLowerCase();
  // Safely access folkCustomFields (may not exist on all firms)
  const firmFocus = (firm.folkCustomFields?.["Fund focus"] as string) || "";

  // Niche industry aliases for better matching (same as calculateInvestorMatch)
  const industryAliases: Record<string, string[]> = {
    "entertainment": [
      "film", "movie", "movies", "cinema", "motion picture", "production", "studio",
      "streaming", "content", "media", "tv", "television", "video", "animation",
      "documentary", "theatrical", "distribution", "post-production", "vfx",
      "entertainment finance", "film financing", "slate financing", "gap financing",
      "completion bond", "tax credit", "film fund", "media fund", "content fund",
      "independent film", "indie film", "feature film", "series", "episodic"
    ],
    "real estate": [
      "property", "properties", "realty", "real-estate", "commercial real estate",
      "residential", "multifamily", "industrial", "retail real estate", "office",
      "hospitality", "hotel", "mixed-use", "development", "construction",
      "construction loan", "bridge loan", "mezzanine", "mortgage", "reit",
      "land", "affordable housing", "senior housing", "student housing",
      "self-storage", "data center", "logistics", "warehouse", "flex space"
    ],
    "fintech": ["financial", "finance", "payments", "banking", "insurtech"],
    "healthcare": ["health", "healthtech", "biotech", "medtech", "digital health"],
    "climate": ["cleantech", "sustainability", "renewable", "energy", "green"],
  };

  // Industry matching - check sectors, focus, and firm name with alias support
  const startupIndustries = startup.industries || [];
  const sectorsStr = Array.isArray(firmSectors) ? firmSectors.join(" ").toLowerCase() : "";
  const focusLower = firmFocus.toLowerCase();
  
  const industryMatches: string[] = [];
  
  for (const ind of startupIndustries) {
    const indLower = ind.toLowerCase();
    
    // Direct match
    if (sectorsStr.includes(indLower) || focusLower.includes(indLower) || firmName.includes(indLower)) {
      industryMatches.push(ind);
      continue;
    }
    
    // Check alias matches
    for (const [category, aliases] of Object.entries(industryAliases)) {
      const allTerms = [category, ...aliases];
      const startupHasAlias = allTerms.some(term => indLower.includes(term) || term.includes(indLower));
      const firmHasAlias = allTerms.some(term => sectorsStr.includes(term) || focusLower.includes(term) || firmName.includes(term));
      
      if (startupHasAlias && firmHasAlias) {
        industryMatches.push(`${ind} (via ${category})`);
        break;
      }
    }
  }

  if (industryMatches.length > 0) {
    score += 40;
    reasons.push(`Sector focus: ${industryMatches.join(", ")}`);
  } else if (firmSectors.length === 0) {
    // If no sectors defined, give partial score (generalist firm assumption)
    score += 15;
    reasons.push("Generalist firm");
  }

  // Stage matching
  if (startup.stage && firmStages.length > 0) {
    const stageLower = startup.stage.toLowerCase();
    const matchingStage = firmStages.find((s: string) => 
      s.toLowerCase().includes(stageLower) || stageLower.includes(s.toLowerCase())
    );
    if (matchingStage) {
      score += 30;
      reasons.push(`Stage: ${matchingStage}`);
    }
  } else if (firmStages.length === 0) {
    // If no stages defined, give partial score
    score += 10;
  }

  // Location matching
  if (startup.location && firmLocation) {
    const locationLower = startup.location.toLowerCase();
    const firmLocLower = firmLocation.toLowerCase();
    if (
      firmLocLower.includes(locationLower) ||
      locationLower.includes(firmLocLower) ||
      firmLocLower.includes("global") ||
      firmLocLower.includes("worldwide") ||
      firmLocLower.includes("united states") ||
      firmLocLower.includes("usa")
    ) {
      score += 20;
      reasons.push(`Geography: ${firmLocation}`);
    }
  } else if (!firmLocation) {
    // No location restriction means potentially global
    score += 10;
  }

  // Firm type bonus
  if (firm.type) {
    score += 10;
    reasons.push(`${firm.type}`);
  }

  return { score: Math.min(score, 100), reasons };
}

async function matchInvestorsFromFirms(
  extractedData: ExtractedDeckData,
  matchedFirmIds: string[],
  limit: number = 30
): Promise<MatchResult[]> {
  const matchedFirmSet = new Set(matchedFirmIds);
  const matches: MatchResult[] = [];
  
  const startupProfile = {
    companyName: extractedData.companyName,
    industries: extractedData.industries || [],
    stage: extractedData.stage,
    location: extractedData.location,
    problem: extractedData.problem,
    solution: extractedData.solution,
    market: extractedData.market,
    traction: extractedData.traction,
    askAmount: extractedData.askAmount,
  };

  // Step 1: First, get investors from matched firms (these get priority)
  if (matchedFirmIds.length > 0) {
    const firmInvestors = await db.select()
      .from(investors)
      .where(
        and(
          eq(investors.isActive, true),
          inArray(investors.firmId, matchedFirmIds)
        )
      )
      .limit(200);
    
    console.log(`[Accelerated Matching] Found ${firmInvestors.length} investors from matched firms`);
    
    for (const investor of firmInvestors) {
      let baseScore = calculateInvestorMatch(startupProfile, investor);
      // Significant boost for being at a matched firm
      baseScore.score = Math.min(100, baseScore.score + 20);
      baseScore.reasons.unshift("Works at matched firm");
      
      // Lower threshold for investors at matched firms
      if (baseScore.score >= 20) {
        matches.push({
          investorId: investor.id,
          investorName: `${investor.firstName || ''} ${investor.lastName || ''}`.trim(),
          investorEmail: investor.email || undefined,
          firmName: (investor.folkCustomFields?.["Managing Organization"] as string) || undefined,
          matchScore: baseScore.score,
          matchReasons: baseScore.reasons,
          investorProfile: {
            id: investor.id,
            firstName: investor.firstName,
            lastName: investor.lastName,
            email: investor.email,
            title: investor.title,
            investorType: investor.investorType,
            stages: investor.stages,
            sectors: investor.sectors,
            location: investor.location,
            firmId: investor.firmId,
            folkCustomFields: investor.folkCustomFields,
          },
        });
      }
    }
  }

  // Step 2: If we don't have enough matches, get more investors (without firm restriction)
  const remainingSlots = limit - matches.length;
  if (remainingSlots > 0) {
    const existingIds = new Set(matches.map(m => m.investorId));
    
    const otherInvestors = await db.select()
      .from(investors)
      .where(eq(investors.isActive, true))
      .limit(300);
    
    console.log(`[Accelerated Matching] Evaluating ${otherInvestors.length} additional investors...`);
    
    for (const investor of otherInvestors) {
      if (existingIds.has(investor.id)) continue; // Skip already matched
      
      let baseScore = calculateInvestorMatch(startupProfile, investor);
      
      // Use standard threshold for non-firm investors
      if (baseScore.score >= 30) {
        matches.push({
          investorId: investor.id,
          investorName: `${investor.firstName || ''} ${investor.lastName || ''}`.trim(),
          investorEmail: investor.email || undefined,
          firmName: (investor.folkCustomFields?.["Managing Organization"] as string) || undefined,
          matchScore: baseScore.score,
          matchReasons: baseScore.reasons,
          investorProfile: {
            id: investor.id,
            firstName: investor.firstName,
            lastName: investor.lastName,
            email: investor.email,
            title: investor.title,
            investorType: investor.investorType,
            stages: investor.stages,
            sectors: investor.sectors,
            location: investor.location,
            firmId: investor.firmId,
            folkCustomFields: investor.folkCustomFields,
          },
        });
      }
    }
  }

  matches.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  console.log(`[Accelerated Matching] Found ${matches.length} total matching investors`);
  return matches.slice(0, limit);
}

interface UploadedDocument {
  type: string;
  name: string;
  text: string;
  size: number;
}

export async function runAcceleratedMatching(
  jobId: string,
  deckText: string,
  founderId: string,
  documents?: UploadedDocument[]
): Promise<void> {
  const pipelineStart = Date.now();
  console.log(`[Accelerated Matching] Starting pipeline for job ${jobId}`);
  
  try {
    // Get the job to check for linked startup
    const job = await getJobById(jobId);
    let startupData: ExtractedDeckData | null = null;
    
    // If a startup is linked, load its data to supplement extracted deck data
    if (job?.startupId) {
      const [linkedStartup] = await db.select()
        .from(startups)
        .where(eq(startups.id, job.startupId))
        .limit(1);
      
      if (linkedStartup) {
        console.log(`[Accelerated Matching] Found linked startup: ${linkedStartup.name}`);
        startupData = {
          companyName: linkedStartup.name,
          industries: linkedStartup.industries || [],
          stage: linkedStartup.stage || undefined,
          location: linkedStartup.location || undefined,
          problem: linkedStartup.description || undefined,
          solution: linkedStartup.tagline || undefined,
        };
      }
    }

    // Combine all document texts for enhanced analysis
    let combinedText = deckText;
    const docTypes: string[] = [];
    if (documents && documents.length > 0) {
      console.log(`[Accelerated Matching] Processing ${documents.length} additional documents`);
      for (const doc of documents) {
        if (doc.text && doc.type !== "pitch_deck") {
          combinedText += `\n\n--- ${doc.type.toUpperCase().replace('_', ' ')} (${doc.name}) ---\n${doc.text}`;
          docTypes.push(doc.type);
        }
      }
      console.log(`[Accelerated Matching] Document types included: ${docTypes.join(', ')}`);
    }

    // Step 1: Analyze documents
    const docLabel = documents && documents.length > 1 ? `${documents.length} documents` : "pitch deck";
    await updateJobProgress(jobId, "analyzing_deck", 10, `Analyzing ${docLabel} with AI...`);
    broadcastNotification(founderId, {
      type: "accelerated_match",
      title: "Analyzing Documents",
      message: `AI is extracting key information from ${docLabel}...`,
      resourceType: "accelerated_match",
      resourceId: jobId,
    });

    console.log(`[Accelerated Matching] Step 1: Analyzing documents (${combinedText.length} chars total)...`);
    const deckAnalysisStart = Date.now();
    let extractedData = await analyzePitchDeckContent(combinedText);
    console.log(`[Accelerated Matching] Document analysis completed in ${Date.now() - deckAnalysisStart}ms`);
    
    // Merge with linked startup data (startup data takes precedence if deck extraction is incomplete)
    if (startupData) {
      extractedData = {
        ...extractedData,
        companyName: extractedData.companyName || startupData.companyName,
        industries: (extractedData.industries && extractedData.industries.length > 0) 
          ? extractedData.industries 
          : startupData.industries,
        stage: extractedData.stage || startupData.stage,
        location: extractedData.location || startupData.location,
        problem: extractedData.problem || startupData.problem,
        solution: extractedData.solution || startupData.solution,
        market: extractedData.market || startupData.market,
      };
      console.log(`[Accelerated Matching] Merged with startup data`);
    }
    
    console.log(`[Accelerated Matching] Final data: industries=${JSON.stringify(extractedData.industries)}, stage=${extractedData.stage}, location=${extractedData.location}`);
    
    await updateJobProgress(jobId, "analyzing_deck", 25, "Pitch deck analyzed", {
      extractedData: extractedData as any,
    });

    // Step 2: Match with Investment Firms first
    await updateJobProgress(jobId, "matching_firms", 35, "Matching with investment firms...");
    broadcastNotification(founderId, {
      type: "accelerated_match",
      title: "Finding Firms",
      message: "Searching for aligned investment firms...",
      resourceType: "accelerated_match",
      resourceId: jobId,
    });

    console.log(`[Accelerated Matching] Step 2: Matching with investment firms...`);
    const firmMatchStart = Date.now();
    const firmMatches = await matchWithFirms(extractedData, 50);
    console.log(`[Accelerated Matching] Firm matching completed in ${Date.now() - firmMatchStart}ms, found ${firmMatches.length} matching firms`);
    
    await updateJobProgress(jobId, "matching_firms", 55, `Found ${firmMatches.length} matching firms`);

    // Step 3: Match with Investors (prioritizing those from matched firms)
    await updateJobProgress(jobId, "matching_investors", 65, "Matching with investors...");
    broadcastNotification(founderId, {
      type: "accelerated_match",
      title: "Finding Investors",
      message: "Searching for aligned investors...",
      resourceType: "accelerated_match",
      resourceId: jobId,
    });

    console.log(`[Accelerated Matching] Step 3: Matching with investors...`);
    const investorMatchStart = Date.now();
    const matchedFirmIds = firmMatches.map(f => f.firmId);
    const investorMatches = await matchInvestorsFromFirms(extractedData, matchedFirmIds, 30);
    console.log(`[Accelerated Matching] Investor matching completed in ${Date.now() - investorMatchStart}ms, found ${investorMatches.length} investors`);
    
    // Enrich investor results with firm name if they work at a matched firm
    const firmNameMap = new Map(firmMatches.map(f => [f.firmId, f.firmName]));
    const enrichedResults = investorMatches.map(inv => {
      const investorFirmId = inv.investorProfile?.firmId;
      const matchedFirmName = investorFirmId ? firmNameMap.get(investorFirmId) : undefined;
      return {
        ...inv,
        // Override firmName with matched firm name if available
        firmName: matchedFirmName || inv.firmName,
      };
    });

    // Combine firm and investor matches in the results
    // Format firm matches to be compatible with MatchResult schema
    const firmResults = firmMatches.map(f => ({
      investorId: undefined,
      investorName: f.firmName,
      firmName: f.firmName,
      matchScore: f.matchScore,
      matchReasons: f.matchReasons,
      investorProfile: undefined,
      firmProfile: f.firmProfile,
      isFirmMatch: true,
    }));

    // Return both firm matches and investor matches
    const allResults = [...enrichedResults, ...firmResults];

    await db.update(acceleratedMatchJobs)
      .set({
        status: "complete",
        progress: 100,
        currentStep: `Found ${firmMatches.length} firms and ${investorMatches.length} investors`,
        matchResults: allResults as any,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(acceleratedMatchJobs.id, jobId));

    broadcastNotification(founderId, {
      type: "accelerated_match",
      title: "Matching Complete!",
      message: `Found ${firmMatches.length} firms and ${investorMatches.length} investors for your startup`,
      resourceType: "accelerated_match",
      resourceId: jobId,
    });

    console.log(`[Accelerated Matching] Pipeline completed in ${Date.now() - pipelineStart}ms total`);

  } catch (error) {
    console.error("Accelerated matching error:", error);
    await db.update(acceleratedMatchJobs)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        updatedAt: new Date(),
      })
      .where(eq(acceleratedMatchJobs.id, jobId));

    broadcastNotification(founderId, {
      type: "accelerated_match",
      title: "Matching Failed",
      message: "There was an error processing your pitch deck",
      resourceType: "accelerated_match",
      resourceId: jobId,
    });
  }
}

export async function verifyJobOwnership(jobId: string, userId: string): Promise<boolean> {
  const job = await getJobById(jobId);
  return job?.founderId === userId;
}
