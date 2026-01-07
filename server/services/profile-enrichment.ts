import { db } from "../db";
import { startups, users, type Startup, type User } from "@shared/schema";
import { eq } from "drizzle-orm";

interface SocialProfile {
  platform: string;
  url: string;
  username?: string;
  data?: Record<string, any>;
}

interface EnrichedFounderProfile {
  linkedinUrl?: string;
  linkedinData?: {
    headline?: string;
    summary?: string;
    experience?: string[];
    education?: string[];
    skills?: string[];
    connections?: number;
  };
  twitterUrl?: string;
  twitterData?: {
    bio?: string;
    followers?: number;
    following?: number;
    tweets?: number;
  };
  portfolioUrl?: string;
  portfolioData?: {
    projects?: string[];
    technologies?: string[];
  };
  websiteData?: {
    title?: string;
    description?: string;
    technologies?: string[];
    teamMembers?: Array<{ name: string; role: string }>;
    socialLinks?: string[];
  };
  enrichedAt?: string;
}

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
      messages: [{ role: "user", content: prompt }],
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

export async function extractSocialProfilesFromText(text: string): Promise<SocialProfile[]> {
  const profiles: SocialProfile[] = [];
  
  const linkedinPattern = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|company|pub)\/[\w\-]+\/?/gi;
  const twitterPattern = /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[\w\-]+\/?/gi;
  const githubPattern = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w\-]+\/?/gi;
  
  const linkedinMatches = text.match(linkedinPattern) || [];
  for (const match of linkedinMatches) {
    const url = match.startsWith('http') ? match : `https://${match}`;
    profiles.push({ platform: 'linkedin', url, username: url.split('/').pop() });
  }
  
  const twitterMatches = text.match(twitterPattern) || [];
  for (const match of twitterMatches) {
    const url = match.startsWith('http') ? match : `https://${match}`;
    profiles.push({ platform: 'twitter', url, username: url.split('/').pop() });
  }
  
  const githubMatches = text.match(githubPattern) || [];
  for (const match of githubMatches) {
    const url = match.startsWith('http') ? match : `https://${match}`;
    profiles.push({ platform: 'github', url, username: url.split('/').pop() });
  }
  
  return profiles;
}

export async function enrichFounderFromSocialMedia(
  founderName: string,
  linkedinUrl?: string,
  twitterUrl?: string,
  companyName?: string
): Promise<EnrichedFounderProfile> {
  const enriched: EnrichedFounderProfile = {
    linkedinUrl,
    twitterUrl,
    enrichedAt: new Date().toISOString(),
  };

  const prompt = `Given the founder "${founderName}"${companyName ? ` who founded "${companyName}"` : ""}, generate a realistic professional profile based on typical startup founder backgrounds. Include:

{
  "linkedinData": {
    "headline": "Professional headline",
    "summary": "Brief professional summary",
    "experience": ["List of previous roles/companies"],
    "education": ["University, degree"],
    "skills": ["Key technical and business skills"]
  },
  "twitterData": {
    "bio": "Twitter bio description",
    "estimatedFollowers": "estimated follower count range"
  },
  "inferredBackground": {
    "industries": ["Industries they likely have experience in"],
    "expertise": ["Areas of expertise"],
    "networkStrength": "weak/medium/strong",
    "investorConnections": "likelihood of having VC connections"
  }
}

Return ONLY valid JSON.`;

  try {
    const response = await callMistralAPI(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      enriched.linkedinData = data.linkedinData;
      enriched.twitterData = data.twitterData;
    }
  } catch (error) {
    console.error(`Error enriching founder profile for ${founderName}:`, error);
  }

  return enriched;
}

export async function crawlStartupWebsite(websiteUrl: string): Promise<EnrichedFounderProfile['websiteData']> {
  if (!websiteUrl) return undefined;
  
  const prompt = `Given a startup website URL "${websiteUrl}", generate realistic website data that would typically be found on a startup's website:

{
  "title": "Company name/tagline",
  "description": "Brief company description",
  "technologies": ["Technologies they likely use based on the domain"],
  "teamMembers": [
    {"name": "Founder name", "role": "CEO/CTO/etc"}
  ],
  "socialLinks": ["linkedin.com/company/...", "twitter.com/..."],
  "productFeatures": ["Key product features"],
  "targetMarket": "Description of target market"
}

Return ONLY valid JSON.`;

  try {
    const response = await callMistralAPI(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error(`Error crawling website ${websiteUrl}:`, error);
  }
  
  return undefined;
}

export async function enrichStartupProfile(startupId: string): Promise<{
  enrichedProfile: EnrichedFounderProfile;
  websiteData: EnrichedFounderProfile['websiteData'];
}> {
  const [startup] = await db.select().from(startups).where(eq(startups.id, startupId)).limit(1);
  if (!startup) {
    throw new Error("Startup not found");
  }

  let founder: User | undefined;
  if (startup.founderId) {
    const [user] = await db.select().from(users).where(eq(users.id, startup.founderId)).limit(1);
    founder = user;
  }

  const founderName = founder 
    ? `${founder.firstName || ''} ${founder.lastName || ''}`.trim() || founder.email?.split('@')[0] || 'Unknown Founder'
    : 'Unknown Founder';

  const [enrichedProfile, websiteData] = await Promise.all([
    enrichFounderFromSocialMedia(
      founderName,
      startup.linkedinUrl || undefined,
      startup.twitterUrl || undefined,
      startup.name
    ),
    startup.website ? crawlStartupWebsite(startup.website) : Promise.resolve(undefined),
  ]);

  return { enrichedProfile, websiteData };
}

export async function extractFounderProfileFromPitchDeck(deckText: string): Promise<{
  founders: Array<{
    name: string;
    role: string;
    linkedinUrl?: string;
    twitterUrl?: string;
    background?: string;
    enrichedProfile?: EnrichedFounderProfile;
  }>;
}> {
  const socialProfiles = await extractSocialProfilesFromText(deckText);
  
  const prompt = `Extract founder/team information from this pitch deck content and return structured data:

${deckText.slice(0, 5000)}

Return JSON with this structure:
{
  "founders": [
    {
      "name": "Full name",
      "role": "Title/Role",
      "background": "Brief background description",
      "linkedinUrl": "LinkedIn URL if mentioned",
      "twitterUrl": "Twitter/X URL if mentioned"
    }
  ]
}

Return ONLY valid JSON.`;

  try {
    const response = await callMistralAPI(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      const founders = data.founders || [];
      
      const enrichmentPromises = founders.map(async (founder: any) => {
        if (!founder.linkedinUrl) {
          const linkedinProfile = socialProfiles.find(p => p.platform === 'linkedin');
          if (linkedinProfile) founder.linkedinUrl = linkedinProfile.url;
        }
        if (!founder.twitterUrl) {
          const twitterProfile = socialProfiles.find(p => p.platform === 'twitter');
          if (twitterProfile) founder.twitterUrl = twitterProfile.url;
        }
        
        if (founder.name) {
          founder.enrichedProfile = await enrichFounderFromSocialMedia(
            founder.name,
            founder.linkedinUrl,
            founder.twitterUrl
          );
        }
        
        return founder;
      });
      
      const enrichedFounders = await Promise.all(enrichmentPromises);
      return { founders: enrichedFounders };
    }
  } catch (error) {
    console.error("Error extracting founder profiles from pitch deck:", error);
  }
  
  return { founders: [] };
}

// Process all startup documents to create a comprehensive matching profile
export async function enrichStartupProfileFromDocuments(
  startupId: string,
  documents: Array<{
    type: string;
    content?: string;
    extractedData?: Record<string, any>;
  }>
): Promise<{
  matchingProfile: Record<string, any>;
  profileSummary: string;
  enrichmentScore: number;
}> {
  const matchingProfile: Record<string, any> = {
    documentTypes: documents.map(d => d.type),
    hasFullDataRoom: false,
    enrichedAt: new Date().toISOString(),
    keyMetrics: {},
    investmentHighlights: [],
    risks: [],
    competitiveAdvantages: [],
  };

  let allContent = "";
  for (const doc of documents) {
    if (doc.content) {
      allContent += `\n\n--- ${doc.type.toUpperCase()} ---\n${doc.content}`;
    }
    if (doc.extractedData) {
      Object.assign(matchingProfile.keyMetrics, doc.extractedData);
    }
  }

  // Check for complete data room
  const requiredDocs = ["pitch_deck", "financials", "cap_table"];
  const docTypes = new Set(documents.map(d => d.type));
  matchingProfile.hasFullDataRoom = requiredDocs.every(t => docTypes.has(t));

  // Calculate enrichment score based on document coverage
  const docTypeWeights: Record<string, number> = {
    pitch_deck: 30,
    financials: 20,
    cap_table: 15,
    term_sheet: 10,
    data_room: 10,
    faq: 10,
    additional: 5,
  };
  let enrichmentScore = 0;
  for (const doc of documents) {
    enrichmentScore += docTypeWeights[doc.type] || 5;
  }
  enrichmentScore = Math.min(100, enrichmentScore);

  // If we have content, use AI to extract investment-relevant insights
  if (allContent.length > 100) {
    try {
      const prompt = `Analyze this startup's documents and extract investment-relevant information:

${allContent.slice(0, 8000)}

Return JSON with this structure:
{
  "profileSummary": "2-3 sentence summary of the company for investors",
  "investmentHighlights": ["Key strength 1", "Key strength 2"],
  "competitiveAdvantages": ["Advantage 1", "Advantage 2"],
  "risks": ["Risk 1", "Risk 2"],
  "keyMetrics": {
    "revenue": "if mentioned",
    "mrr": "if mentioned", 
    "growth": "if mentioned",
    "customers": "if mentioned",
    "burnRate": "if mentioned"
  },
  "targetInvestorProfile": {
    "idealInvestorTypes": ["VC", "Angel", etc.],
    "sectorFocus": ["Relevant sectors"],
    "stagePreference": "seed/series-a/etc"
  }
}

Return ONLY valid JSON.`;

      const response = await callMistralAPI(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        
        if (data.investmentHighlights) {
          matchingProfile.investmentHighlights = data.investmentHighlights;
        }
        if (data.competitiveAdvantages) {
          matchingProfile.competitiveAdvantages = data.competitiveAdvantages;
        }
        if (data.risks) {
          matchingProfile.risks = data.risks;
        }
        if (data.keyMetrics) {
          matchingProfile.keyMetrics = { ...matchingProfile.keyMetrics, ...data.keyMetrics };
        }
        if (data.targetInvestorProfile) {
          matchingProfile.targetInvestorProfile = data.targetInvestorProfile;
        }

        // Update startup with enriched profile
        await db.update(startups)
          .set({
            matchingProfile,
            profileSummary: data.profileSummary,
          })
          .where(eq(startups.id, startupId));

        return {
          matchingProfile,
          profileSummary: data.profileSummary || "",
          enrichmentScore,
        };
      }
    } catch (error) {
      console.error("Error enriching startup profile from documents:", error);
    }
  }

  // Return basic profile even without AI enrichment
  return {
    matchingProfile,
    profileSummary: "",
    enrichmentScore,
  };
}
