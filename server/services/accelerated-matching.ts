import { db } from "../db";
import { 
  acceleratedMatchJobs, 
  investors, 
  startups, 
  investmentFirms,
  AcceleratedMatchJob 
} from "@shared/schema";
import { eq, desc, and, or, ilike, sql } from "drizzle-orm";
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
  const enrichedTeam = [];

  for (const member of team || []) {
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

    enrichedTeam.push(enrichedMember);
  }

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
    if (score.score >= 30) {
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

  const startupIndustries = startup.industries || [];
  const industryMatches = startupIndustries.filter(ind => {
    const indLower = ind.toLowerCase();
    const focusLower = investorFocus.toLowerCase();
    const sectorsStr = Array.isArray(investorSectors) ? investorSectors.join(" ").toLowerCase() : "";
    return focusLower.includes(indLower) || sectorsStr.includes(indLower);
  });

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

export async function runAcceleratedMatching(
  jobId: string,
  deckText: string,
  founderId: string
): Promise<void> {
  try {
    await updateJobProgress(jobId, "analyzing_deck", 10, "Analyzing pitch deck with AI...");
    broadcastNotification(founderId, {
      type: "accelerated_match",
      title: "Analyzing Pitch Deck",
      message: "AI is extracting key information from your deck...",
      resourceType: "accelerated_match",
      resourceId: jobId,
    });

    const extractedData = await analyzePitchDeckContent(deckText);
    await updateJobProgress(jobId, "analyzing_deck", 30, "Pitch deck analyzed", {
      extractedData: extractedData as any,
    });

    await updateJobProgress(jobId, "enriching_team", 40, "Enriching team profiles...");
    broadcastNotification(founderId, {
      type: "accelerated_match",
      title: "Enriching Profiles",
      message: "Researching your team backgrounds...",
      resourceType: "accelerated_match",
      resourceId: jobId,
    });

    const enrichedTeam = await enrichTeamProfiles(extractedData.team || []);
    await updateJobProgress(jobId, "enriching_team", 60, "Team profiles enriched", {
      enrichedTeam: enrichedTeam as any,
    });

    await updateJobProgress(jobId, "generating_matches", 70, "Matching with investors...");
    broadcastNotification(founderId, {
      type: "accelerated_match",
      title: "Finding Matches",
      message: "Searching for aligned investors in our database...",
      resourceType: "accelerated_match",
      resourceId: jobId,
    });

    const matchResults = await matchWithInvestors(extractedData, 30);
    
    await db.update(acceleratedMatchJobs)
      .set({
        status: "complete",
        progress: 100,
        currentStep: `Found ${matchResults.length} investor matches`,
        matchResults: matchResults as any,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(acceleratedMatchJobs.id, jobId));

    broadcastNotification(founderId, {
      type: "accelerated_match",
      title: "Matching Complete!",
      message: `Found ${matchResults.length} potential investors for your startup`,
      resourceType: "accelerated_match",
      resourceId: jobId,
    });

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
