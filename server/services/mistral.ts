import { storage } from "../storage";
import { db } from "../db";
import { eq, isNull, or, sql } from "drizzle-orm";
import { investmentFirms, investors, batchEnrichmentJobs, FIRM_CLASSIFICATIONS } from "@shared/schema";
import type { Investor, Contact, InvestmentFirm, EnrichmentJob, BatchEnrichmentJob } from "@shared/schema";
import { hunterService } from "./hunter";

const INVESTOR_STAGES = [
  "Pre-seed",
  "Seed", 
  "Series A",
  "Series B",
  "Series C",
  "Series D",
  "Growth",
  "Bridge"
] as const;

interface MistralResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface EnrichmentResult {
  suggestedUpdates: Record<string, any>;
  insights: string;
  confidence: number;
  tokensUsed: number;
}

class MistralEnrichmentService {
  private apiKey: string;
  private baseUrl = "https://api.mistral.ai/v1";
  private model = "mistral-large-latest";

  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY || "";
  }

  private async callMistral(prompt: string, systemPrompt: string): Promise<{ content: string; tokensUsed: number }> {
    if (!this.apiKey) {
      throw new Error("MISTRAL_API_KEY not configured");
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as MistralResponse;
    return {
      content: data.choices[0]?.message?.content || "{}",
      tokensUsed: data.usage?.total_tokens || 0,
    };
  }

  async enrichInvestor(investor: Investor): Promise<EnrichmentResult> {
    const systemPrompt = `You are an expert data analyst specializing in venture capital and investor research.
Your task is to analyze investor data and suggest improvements or missing information.
Always respond with valid JSON containing these fields:
- suggestedUpdates: object with field names as keys and suggested values
- insights: string with a brief analysis of the investor profile
- confidence: number 0-100 indicating confidence in suggestions
- missingCriticalFields: array of important fields that are missing`;

    const existingData = {
      name: `${investor.firstName || ""} ${investor.lastName || ""}`.trim(),
      email: investor.email,
      title: investor.title,
      company: investor.firmId ? "Has firm association" : null,
      linkedin: investor.linkedinUrl || investor.personLinkedinUrl,
      location: investor.location || investor.investorCountry,
      stages: investor.stages,
      sectors: investor.sectors,
      investorType: investor.investorType,
      bio: investor.bio,
    };

    const prompt = `Analyze this investor profile and suggest improvements:
${JSON.stringify(existingData, null, 2)}

Based on the available data, suggest:
1. Any fields that should be filled in based on patterns (e.g., if LinkedIn shows a title, suggest it)
2. Professional insights about this investor
3. Potential missing information that would be valuable

Return JSON with suggestedUpdates, insights, confidence, and missingCriticalFields.`;

    try {
      const { content, tokensUsed } = await this.callMistral(prompt, systemPrompt);
      const parsed = JSON.parse(content);
      
      return {
        suggestedUpdates: parsed.suggestedUpdates || {},
        insights: parsed.insights || "",
        confidence: parsed.confidence || 50,
        tokensUsed,
      };
    } catch (error) {
      console.error("Mistral enrichment error:", error);
      throw error;
    }
  }

  async findInvestorEmailWithHunter(investor: Investor): Promise<{
    email: string | null;
    linkedinUrl: string | null;
    phone: string | null;
    position: string | null;
  }> {
    const result = {
      email: null as string | null,
      linkedinUrl: null as string | null,
      phone: null as string | null,
      position: null as string | null,
    };

    if (!hunterService.isConfigured()) {
      return result;
    }

    try {
      let domain: string | null = null;
      
      if (investor.email) {
        domain = hunterService.extractDomainFromEmail(investor.email);
      }
      
      if (!domain && investor.linkedinUrl) {
        const companyMatch = investor.linkedinUrl.match(/linkedin\.com\/company\/([^\/\s?]+)/i);
        if (companyMatch) {
          const companySlug = companyMatch[1];
          const companyInfo = await hunterService.findCompany(`${companySlug}.com`);
          if (companyInfo?.domain) {
            domain = companyInfo.domain;
          }
        }
      }

      if (!domain) {
        const folkFields = investor.folkCustomFields as Record<string, any> | null;
        if (folkFields) {
          const website = folkFields.website || folkFields.company_website || folkFields.fund_website;
          if (website) {
            domain = hunterService.extractDomainFromUrl(website);
          }
        }
      }

      if (domain && investor.firstName && investor.lastName) {
        const hunterResult = await hunterService.findEmail(
          domain,
          investor.firstName,
          investor.lastName
        );

        if (hunterResult?.email) {
          result.email = hunterResult.email;
          result.position = hunterResult.position || null;
        }
      }

      if (result.email) {
        const personInfo = await hunterService.findPerson(result.email);
        if (personInfo) {
          result.linkedinUrl = personInfo.linkedin_url || null;
          result.phone = personInfo.phone_number || null;
          result.position = personInfo.position || result.position;
        }
      }
    } catch (error) {
      console.error("Hunter email lookup failed:", error);
    }

    return result;
  }

  async deepEnrichInvestor(investor: Investor): Promise<{ suggestedUpdates: Record<string, any>; fundingStage: string | null; tokensUsed: number; firmName: string | null }> {
    const hunterData = await this.findInvestorEmailWithHunter(investor);
    
    const hunterUpdates: Record<string, any> = {};
    if (hunterData.email && !investor.email) {
      hunterUpdates.email = hunterData.email;
    }
    if (hunterData.linkedinUrl && !investor.linkedinUrl && !investor.personLinkedinUrl) {
      hunterUpdates.personLinkedinUrl = hunterData.linkedinUrl;
    }
    if (hunterData.phone && !investor.phone) {
      hunterUpdates.phone = hunterData.phone;
    }
    if (hunterData.position && !investor.title) {
      hunterUpdates.title = hunterData.position;
    }

    const stagesStr = INVESTOR_STAGES.join(", ");
    
    const systemPrompt = `You are an expert venture capital data analyst specializing in investor research and data enrichment.
Your task is to analyze investor profiles and fill in missing information based on available data patterns.
You should be thorough and infer information from available custom fields, LinkedIn profiles, and other data.
Always respond with valid JSON containing:
- fundingStage: one of [${stagesStr}] or null if cannot be determined
- firmName: the investment firm/fund name this investor works at (extract from custom fields, email domain, LinkedIn, etc.) or null if not available
- suggestedUpdates: object with field names as keys and suggested values for ANY empty, null, or incomplete fields
For suggestedUpdates, focus on filling in missing data for these fields:
- bio: professional biography
- investorType: VC, Angel, Accelerator, Family Office, Corporate VC, etc.
- fundingStage: one of [${stagesStr}]
- stages: array of investment stages they invest in
- sectors: array of sectors/industries they focus on
- location: their location/city
- typicalInvestment: check size range like "$100K-$500K"
- fundHQ: fund headquarters location`;

    const existingData = {
      name: `${investor.firstName || ""} ${investor.lastName || ""}`.trim(),
      email: investor.email,
      title: investor.title,
      linkedin: investor.linkedinUrl || investor.personLinkedinUrl,
      location: investor.location,
      investorCountry: investor.investorCountry,
      hqLocation: investor.hqLocation,
      fundHQ: investor.fundHQ,
      stages: investor.stages,
      sectors: investor.sectors,
      investorType: investor.investorType,
      fundingStage: investor.fundingStage,
      typicalInvestment: investor.typicalInvestment,
      bio: investor.bio,
      totalInvestments: investor.totalInvestments,
      recentInvestments: investor.recentInvestments,
      folkCustomFields: investor.folkCustomFields,
    };

    const prompt = `Analyze this investor profile and fill in ALL missing or empty data:
${JSON.stringify(existingData, null, 2)}

Instructions:
1. Determine their primary funding stage from: ${stagesStr}
2. Look at folkCustomFields for additional information that can fill in missing data
3. Infer sectors/stages from any available data (fund focus, investment focus, etc.)
4. Generate a professional bio if missing
5. Standardize location data if available
6. Fill in investorType if it can be determined
7. Extract the investment firm/fund name from email domain, custom fields, LinkedIn company, or other data

Return JSON with:
- fundingStage: string (one of the valid stages) or null
- firmName: string (the investment firm/fund name) or null
- suggestedUpdates: object with field names and values for ALL missing/empty fields that can be reasonably inferred`;

    try {
      const { content, tokensUsed } = await this.callMistral(prompt, systemPrompt);
      const parsed = JSON.parse(content);
      
      let fundingStage = parsed.fundingStage;
      if (fundingStage && !INVESTOR_STAGES.includes(fundingStage)) {
        const normalizedStage = fundingStage.toLowerCase();
        if (normalizedStage.includes("pre-seed") || normalizedStage.includes("preseed")) {
          fundingStage = "Pre-seed";
        } else if (normalizedStage.includes("seed")) {
          fundingStage = "Seed";
        } else if (normalizedStage.includes("series a")) {
          fundingStage = "Series A";
        } else if (normalizedStage.includes("series b")) {
          fundingStage = "Series B";
        } else if (normalizedStage.includes("series c")) {
          fundingStage = "Series C";
        } else if (normalizedStage.includes("series d")) {
          fundingStage = "Series D";
        } else if (normalizedStage.includes("growth")) {
          fundingStage = "Growth";
        } else if (normalizedStage.includes("bridge")) {
          fundingStage = "Bridge";
        } else {
          fundingStage = null;
        }
      }
      
      const mistralUpdates = parsed.suggestedUpdates || {};
      const mergedUpdates = { ...mistralUpdates, ...hunterUpdates };
      const firmName = parsed.firmName || null;
      
      return {
        fundingStage,
        suggestedUpdates: mergedUpdates,
        tokensUsed,
        firmName,
      };
    } catch (error) {
      console.error("Mistral deep enrichment error:", error);
      if (Object.keys(hunterUpdates).length > 0) {
        return {
          fundingStage: null,
          suggestedUpdates: hunterUpdates,
          tokensUsed: 0,
          firmName: null,
        };
      }
      throw error;
    }
  }

  async enrichContact(contact: Contact): Promise<EnrichmentResult> {
    const systemPrompt = `You are an expert CRM data analyst.
Your task is to analyze contact data and suggest improvements.
Always respond with valid JSON containing:
- suggestedUpdates: object with field names as keys and suggested values
- insights: string with analysis of the contact
- confidence: number 0-100
- missingCriticalFields: array of important missing fields`;

    const existingData = {
      name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      title: contact.title,
      type: contact.type,
      linkedin: contact.linkedinUrl,
      notes: contact.notes,
      tags: contact.tags,
    };

    const prompt = `Analyze this contact profile and suggest improvements:
${JSON.stringify(existingData, null, 2)}

Suggest improvements and insights. Return JSON with suggestedUpdates, insights, confidence, and missingCriticalFields.`;

    try {
      const { content, tokensUsed } = await this.callMistral(prompt, systemPrompt);
      const parsed = JSON.parse(content);
      
      return {
        suggestedUpdates: parsed.suggestedUpdates || {},
        insights: parsed.insights || "",
        confidence: parsed.confidence || 50,
        tokensUsed,
      };
    } catch (error) {
      console.error("Mistral enrichment error:", error);
      throw error;
    }
  }

  async enrichFirm(firm: InvestmentFirm): Promise<EnrichmentResult> {
    const systemPrompt = `You are an expert venture capital analyst.
Your task is to analyze investment firm data and suggest improvements.
Always respond with valid JSON containing:
- suggestedUpdates: object with field names as keys and suggested values
- insights: string with analysis of the firm
- confidence: number 0-100
- missingCriticalFields: array of important missing fields`;

    const existingData = {
      name: firm.name,
      description: firm.description,
      website: firm.website,
      type: firm.type,
      location: firm.location || firm.hqLocation,
      stages: firm.stages,
      sectors: firm.sectors,
      aum: firm.aum,
      checkSizeMin: firm.checkSizeMin,
      checkSizeMax: firm.checkSizeMax,
    };

    const prompt = `Analyze this investment firm profile and suggest improvements:
${JSON.stringify(existingData, null, 2)}

Suggest improvements and insights. Return JSON with suggestedUpdates, insights, confidence, and missingCriticalFields.`;

    try {
      const { content, tokensUsed } = await this.callMistral(prompt, systemPrompt);
      const parsed = JSON.parse(content);
      
      return {
        suggestedUpdates: parsed.suggestedUpdates || {},
        insights: parsed.insights || "",
        confidence: parsed.confidence || 50,
        tokensUsed,
      };
    } catch (error) {
      console.error("Mistral enrichment error:", error);
      throw error;
    }
  }

  async createEnrichmentJob(
    entityType: "investor" | "contact" | "firm",
    entityId: string,
    enrichmentType: "full_profile" | "missing_fields" | "insights" = "full_profile"
  ): Promise<EnrichmentJob> {
    const job = await storage.createEnrichmentJob({
      entityType,
      entityId,
      enrichmentType,
      status: "pending",
    });

    this.processEnrichmentJob(job.id).catch(console.error);
    return job;
  }

  private async processEnrichmentJob(jobId: string): Promise<void> {
    try {
      await storage.updateEnrichmentJob(jobId, { status: "processing" });
      
      const job = await storage.getEnrichmentJobById(jobId);
      if (!job) throw new Error("Job not found");

      let result: EnrichmentResult;
      let inputData: Record<string, any> = {};

      switch (job.entityType) {
        case "investor": {
          const investor = await storage.getInvestorById(job.entityId);
          if (!investor) throw new Error("Investor not found");
          inputData = investor;
          result = await this.enrichInvestor(investor);
          break;
        }
        case "contact": {
          const contact = await storage.getContactById(job.entityId);
          if (!contact) throw new Error("Contact not found");
          inputData = contact;
          result = await this.enrichContact(contact);
          break;
        }
        case "firm": {
          const firm = await storage.getInvestmentFirmById(job.entityId);
          if (!firm) throw new Error("Firm not found");
          inputData = firm;
          result = await this.enrichFirm(firm);
          break;
        }
        default:
          throw new Error(`Unknown entity type: ${job.entityType}`);
      }

      await storage.updateEnrichmentJob(jobId, {
        status: "completed",
        inputData: inputData as Record<string, any>,
        outputData: { insights: result.insights, confidence: result.confidence } as Record<string, any>,
        suggestedUpdates: result.suggestedUpdates as Record<string, any>,
        tokensUsed: result.tokensUsed,
        modelUsed: this.model,
        completedAt: new Date(),
      } as any);

    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await storage.updateEnrichmentJob(jobId, {
        status: "failed",
        errorMessage: message,
      });
    }
  }

  async applyEnrichmentSuggestions(jobId: string, userId: string): Promise<void> {
    const job = await storage.getEnrichmentJobById(jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "completed") throw new Error("Job not completed");
    if (!job.suggestedUpdates || Object.keys(job.suggestedUpdates).length === 0) {
      throw new Error("No suggestions to apply");
    }

    switch (job.entityType) {
      case "investor":
        await storage.updateInvestor(job.entityId, job.suggestedUpdates);
        break;
      case "contact":
        await storage.updateContact(job.entityId, job.suggestedUpdates);
        break;
      case "firm":
        await storage.updateInvestmentFirm(job.entityId, job.suggestedUpdates);
        break;
    }

    await storage.updateEnrichmentJob(jobId, {
      appliedAt: new Date(),
      appliedBy: userId,
    });
  }

  async classifyAndEnrichFirm(firm: InvestmentFirm): Promise<{
    firmClassification: string | null;
    suggestedUpdates: Record<string, any>;
    tokensUsed: number;
  }> {
    const classificationsStr = FIRM_CLASSIFICATIONS.join(", ");
    const stagesStr = INVESTOR_STAGES.join(", ");
    
    const systemPrompt = `You are an expert venture capital and investment research analyst. Your task is to:
1. Classify the investment firm into ONE of these categories: ${classificationsStr}
2. FILL IN ALL MISSING DATA FIELDS with accurate, researched information

You have comprehensive knowledge about investment firms, family offices, VCs, and financial institutions worldwide.

IMPORTANT: Be proactive in filling in missing data. If you recognize the firm name, use your knowledge to fill in:
- description: A comprehensive 2-3 sentence professional description
- location/hqLocation: City, Country format (e.g., "Amsterdam, Netherlands")
- website: Official website URL if known
- aum: Assets under management if known (e.g., "$500M", "€2B")
- typicalCheckSize: Investment check size range (e.g., "$1M-$10M", "€500K-€5M")
- checkSizeMin/checkSizeMax: Numeric values in USD
- stages: Array of investment stages [${stagesStr}]
- sectors: Array of focus sectors (e.g., ["Technology", "Healthcare", "Fintech"])
- industry: Primary industry focus
- employeeRange: Team size range (e.g., "1-10", "11-50")
- foundationYear: Year founded as string
- linkedinUrl: Company LinkedIn URL
- twitterUrl: Company Twitter/X URL

For Family Offices specifically, also research:
- The founding family or principal
- Geographic investment focus
- Investment philosophy
- Notable portfolio companies

Always respond with valid JSON:
{
  "firmClassification": "one of the valid categories or null",
  "suggestedUpdates": {
    "fieldName": "value",
    ...
  },
  "confidence": 0-100,
  "researchNotes": "brief notes about what you found"
}

Classification guidelines:
- "Venture Capital" - Traditional VCs investing in startups
- "Corporate VC" - Investment arms of corporations
- "Family Office" - Wealth management for wealthy families
- "Bank" - Banking institutions with investment divisions
- "Institutional Investor" - Pension funds, insurance companies, endowments
- "Sovereign Wealth Fund" - Government-owned investment funds
- "Angel Investor" - Individual investors or angel groups
- "Asset & Wealth Manager" - Asset management firms
- "Fund of Funds" - Funds investing in other funds
- "Private Equity" - PE firms focused on later-stage/buyouts
- "Accelerator" - Startup accelerators and incubators`;

    // Collect all available data for enrichment context
    const existingData = {
      name: firm.name,
      description: firm.description || null,
      website: firm.website || null,
      type: firm.type || null,
      firmClassification: firm.firmClassification || null,
      industry: firm.industry || null,
      location: firm.location || null,
      hqLocation: firm.hqLocation || null,
      stages: firm.stages?.length ? firm.stages : null,
      sectors: firm.sectors?.length ? firm.sectors : null,
      aum: firm.aum || null,
      typicalCheckSize: firm.typicalCheckSize || null,
      checkSizeMin: firm.checkSizeMin || null,
      checkSizeMax: firm.checkSizeMax || null,
      employeeRange: firm.employeeRange || null,
      foundationYear: firm.foundationYear || null,
      linkedinUrl: firm.linkedinUrl || null,
      twitterUrl: firm.twitterUrl || null,
      portfolioCount: firm.portfolioCount || null,
      customFields: firm.folkCustomFields || null,
      emails: firm.emails || null,
      addresses: firm.addresses || null,
      urls: firm.urls || null,
    };

    // Identify which fields need enrichment
    const missingFields: string[] = [];
    if (!existingData.description) missingFields.push("description");
    if (!existingData.location && !existingData.hqLocation) missingFields.push("location");
    if (!existingData.website) missingFields.push("website");
    if (!existingData.aum) missingFields.push("aum");
    if (!existingData.typicalCheckSize) missingFields.push("typicalCheckSize");
    if (!existingData.stages?.length) missingFields.push("stages");
    if (!existingData.sectors?.length) missingFields.push("sectors");
    if (!existingData.employeeRange) missingFields.push("employeeRange");
    if (!existingData.foundationYear) missingFields.push("foundationYear");
    if (!existingData.linkedinUrl) missingFields.push("linkedinUrl");
    if (!existingData.industry) missingFields.push("industry");

    const prompt = `Analyze and FULLY ENRICH this investment firm data:

FIRM NAME: ${firm.name}

CURRENT DATA (null = missing, needs to be filled):
${JSON.stringify(existingData, null, 2)}

MISSING FIELDS TO FILL: ${missingFields.join(", ")}

INSTRUCTIONS:
1. Classify the firm using one of: ${classificationsStr}
2. Use your knowledge to fill in ALL missing fields listed above
3. For Family Offices: research the family history, investment focus, and geographic preferences
4. Be specific with locations (City, Country format)
5. Provide realistic AUM and check size estimates based on firm type and market
6. Include actual website URLs and LinkedIn URLs if you know them
7. For description, write a professional 2-3 sentence summary

Return comprehensive JSON with firmClassification, suggestedUpdates (for ALL missing fields you can fill), confidence, and researchNotes.`;

    try {
      const { content, tokensUsed } = await this.callMistral(prompt, systemPrompt);
      const parsed = JSON.parse(content);
      
      let classification = parsed.firmClassification;
      if (classification && !FIRM_CLASSIFICATIONS.includes(classification)) {
        // Try to normalize common variations
        const normalized = classification.toLowerCase();
        if (normalized.includes("family") && normalized.includes("office")) {
          classification = "Family Office";
        } else if (normalized.includes("venture")) {
          classification = "Venture Capital";
        } else if (normalized.includes("private equity") || normalized.includes("pe")) {
          classification = "Private Equity";
        } else if (normalized.includes("bank")) {
          classification = "Bank";
        } else if (normalized.includes("corporate")) {
          classification = "Corporate VC";
        } else if (normalized.includes("accelerator") || normalized.includes("incubator")) {
          classification = "Accelerator";
        } else if (normalized.includes("angel")) {
          classification = "Angel Investor";
        } else if (normalized.includes("sovereign")) {
          classification = "Sovereign Wealth Fund";
        } else if (normalized.includes("fund of funds")) {
          classification = "Fund of Funds";
        } else if (normalized.includes("institutional")) {
          classification = "Institutional Investor";
        } else if (normalized.includes("asset") || normalized.includes("wealth")) {
          classification = "Asset & Wealth Manager";
        } else {
          classification = null;
        }
      }
      
      // Clean up and validate suggested updates
      const suggestedUpdates = parsed.suggestedUpdates || {};
      
      // Validate and clean specific fields
      if (suggestedUpdates.stages && !Array.isArray(suggestedUpdates.stages)) {
        suggestedUpdates.stages = [suggestedUpdates.stages];
      }
      if (suggestedUpdates.sectors && !Array.isArray(suggestedUpdates.sectors)) {
        suggestedUpdates.sectors = [suggestedUpdates.sectors];
      }
      
      // Parse check size range if provided - handle different units for min/max
      if (suggestedUpdates.typicalCheckSize && !suggestedUpdates.checkSizeMin) {
        // Match patterns like "$500K-$2M", "€1M-€5M", "$100K - $500K"
        const checkSizeMatch = suggestedUpdates.typicalCheckSize.match(/[\$€£]?([\d.]+)\s*([MmKkBb])?\s*[-–to]+\s*[\$€£]?([\d.]+)\s*([MmKkBb])?/);
        if (checkSizeMatch) {
          const getMultiplier = (unit: string | undefined) => {
            if (!unit) return 1000000; // default to millions if no unit
            const u = unit.toLowerCase();
            if (u === 'b') return 1000000000;
            if (u === 'm') return 1000000;
            if (u === 'k') return 1000;
            return 1000000;
          };
          const minMultiplier = getMultiplier(checkSizeMatch[2]);
          const maxMultiplier = getMultiplier(checkSizeMatch[4] || checkSizeMatch[2]); // Use max unit or fall back to min unit
          suggestedUpdates.checkSizeMin = Math.round(parseFloat(checkSizeMatch[1]) * minMultiplier);
          suggestedUpdates.checkSizeMax = Math.round(parseFloat(checkSizeMatch[3]) * maxMultiplier);
        }
      }

      // Normalize location to hqLocation if location not set
      if (suggestedUpdates.location && !firm.hqLocation) {
        suggestedUpdates.hqLocation = suggestedUpdates.location;
      }
      
      return {
        firmClassification: classification,
        suggestedUpdates,
        tokensUsed,
      };
    } catch (error) {
      console.error("Mistral classification/enrichment error:", error);
      throw error;
    }
  }

  async startBatchEnrichment(
    userId: string,
    entityType: "firm" = "firm",
    enrichmentType: "classification" | "full_enrichment" = "classification",
    batchSize: number = 10,
    onlyUnclassified: boolean = true,
    onlyMissingData: boolean = false
  ): Promise<BatchEnrichmentJob> {
    let query = db.select({ count: sql<number>`count(*)` }).from(investmentFirms);
    
    if (onlyMissingData) {
      // Target firms with missing key data fields (not just unclassified)
      query = query.where(
        or(
          isNull(investmentFirms.firmClassification), 
          eq(investmentFirms.firmClassification, ""),
          isNull(investmentFirms.description),
          eq(investmentFirms.description, ""),
          isNull(investmentFirms.location),
          isNull(investmentFirms.hqLocation),
          isNull(investmentFirms.aum)
        )
      ) as any;
    } else if (onlyUnclassified) {
      query = query.where(or(isNull(investmentFirms.firmClassification), eq(investmentFirms.firmClassification, ""))) as any;
    }
    
    const [{ count }] = await query;
    const totalRecords = Number(count);
    const totalBatches = Math.ceil(totalRecords / batchSize);

    const [job] = await db.insert(batchEnrichmentJobs).values({
      entityType,
      enrichmentType: onlyMissingData ? "full_enrichment" : enrichmentType,
      status: "pending",
      totalRecords,
      processedRecords: 0,
      successfulRecords: 0,
      failedRecords: 0,
      batchSize,
      currentBatch: 0,
      totalBatches,
      filterCriteria: { onlyUnclassified, onlyMissingData },
      errorLog: [],
      totalTokensUsed: 0,
      modelUsed: this.model,
      createdBy: userId,
    }).returning();

    this.processBatchEnrichment(job.id).catch(console.error);
    
    return job;
  }

  async getBatchEnrichmentJob(jobId: string): Promise<BatchEnrichmentJob | null> {
    const [job] = await db.select().from(batchEnrichmentJobs).where(eq(batchEnrichmentJobs.id, jobId));
    return job || null;
  }

  async getActiveBatchJob(): Promise<BatchEnrichmentJob | null> {
    const [job] = await db.select()
      .from(batchEnrichmentJobs)
      .where(or(eq(batchEnrichmentJobs.status, "pending"), eq(batchEnrichmentJobs.status, "processing")))
      .limit(1);
    return job || null;
  }

  async cancelBatchJob(jobId: string): Promise<void> {
    await db.update(batchEnrichmentJobs)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(eq(batchEnrichmentJobs.id, jobId));
  }

  private async processBatchEnrichment(jobId: string): Promise<void> {
    try {
      await db.update(batchEnrichmentJobs)
        .set({ status: "processing", startedAt: new Date() })
        .where(eq(batchEnrichmentJobs.id, jobId));

      let job = await this.getBatchEnrichmentJob(jobId);
      if (!job) throw new Error("Job not found");

      const batchSize = job.batchSize || 10;
      let offset = 0;
      let processedRecords = 0;
      let successfulRecords = 0;
      let failedRecords = 0;
      let totalTokensUsed = 0;
      const errorLog: Array<{entityId: string; error: string}> = [];

      while (processedRecords < (job.totalRecords || 0)) {
        job = await this.getBatchEnrichmentJob(jobId);
        if (!job || job.status === "cancelled") {
          console.log("Batch job cancelled");
          return;
        }

        let firms: InvestmentFirm[];
        const filterCriteria = job.filterCriteria as Record<string, any> | null;
        if (filterCriteria?.onlyMissingData) {
          // Target firms with missing key data fields
          firms = await db.select()
            .from(investmentFirms)
            .where(
              or(
                isNull(investmentFirms.firmClassification), 
                eq(investmentFirms.firmClassification, ""),
                isNull(investmentFirms.description),
                eq(investmentFirms.description, ""),
                isNull(investmentFirms.location),
                isNull(investmentFirms.hqLocation),
                isNull(investmentFirms.aum)
              )
            )
            .limit(batchSize)
            .offset(offset);
        } else if (filterCriteria?.onlyUnclassified) {
          firms = await db.select()
            .from(investmentFirms)
            .where(or(isNull(investmentFirms.firmClassification), eq(investmentFirms.firmClassification, "")))
            .limit(batchSize)
            .offset(offset);
        } else {
          firms = await db.select()
            .from(investmentFirms)
            .limit(batchSize)
            .offset(offset);
        }

        if (firms.length === 0) break;

        for (const firm of firms) {
          try {
            const result = await this.classifyAndEnrichFirm(firm);
            
            const updates: Record<string, any> = {
              enrichmentStatus: "enriched",
              lastEnrichmentDate: new Date(),
              enrichmentError: null,
            };
            if (result.firmClassification) {
              updates.firmClassification = result.firmClassification;
            }
            if (result.suggestedUpdates && Object.keys(result.suggestedUpdates).length > 0) {
              Object.assign(updates, result.suggestedUpdates);
            }
            
            await db.update(investmentFirms)
              .set({ ...updates, updatedAt: new Date() })
              .where(eq(investmentFirms.id, firm.id));
            
            successfulRecords++;
            totalTokensUsed += result.tokensUsed;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            
            // Update firm with failed status
            await db.update(investmentFirms)
              .set({ 
                enrichmentStatus: "failed",
                lastEnrichmentDate: new Date(),
                enrichmentError: errorMessage,
                updatedAt: new Date()
              })
              .where(eq(investmentFirms.id, firm.id));
            
            failedRecords++;
            errorLog.push({
              entityId: firm.id,
              error: errorMessage
            });
          }
          
          processedRecords++;

          await db.update(batchEnrichmentJobs)
            .set({
              processedRecords,
              successfulRecords,
              failedRecords,
              totalTokensUsed,
              currentBatch: Math.floor(processedRecords / batchSize),
              errorLog: errorLog.slice(-100),
            })
            .where(eq(batchEnrichmentJobs.id, jobId));
          
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        offset += batchSize;
      }

      await db.update(batchEnrichmentJobs)
        .set({
          status: "completed",
          processedRecords,
          successfulRecords,
          failedRecords,
          totalTokensUsed,
          completedAt: new Date(),
        })
        .where(eq(batchEnrichmentJobs.id, jobId));

    } catch (error) {
      console.error("Batch enrichment error:", error);
      await db.update(batchEnrichmentJobs)
        .set({
          status: "failed",
          completedAt: new Date(),
        })
        .where(eq(batchEnrichmentJobs.id, jobId));
    }
  }

  async startInvestorBatchEnrichment(
    userId: string,
    batchSize: number = 10,
    onlyIncomplete: boolean = true
  ): Promise<BatchEnrichmentJob> {
    let query = db.select({ count: sql<number>`count(*)` }).from(investors);
    
    if (onlyIncomplete) {
      query = query.where(
        or(
          isNull(investors.enrichmentStatus),
          eq(investors.enrichmentStatus as any, ""),
          eq(investors.enrichmentStatus as any, "not_enriched")
        )
      ) as any;
    }
    
    const [{ count }] = await query;
    const totalRecords = Number(count);
    const totalBatches = Math.ceil(totalRecords / batchSize);

    const [job] = await db.insert(batchEnrichmentJobs).values({
      entityType: "investor",
      enrichmentType: "full_enrichment",
      status: "pending",
      totalRecords,
      processedRecords: 0,
      successfulRecords: 0,
      failedRecords: 0,
      batchSize,
      currentBatch: 0,
      totalBatches,
      filterCriteria: { onlyIncomplete },
      errorLog: [],
      totalTokensUsed: 0,
      modelUsed: this.model,
      createdBy: userId,
    }).returning();

    this.processInvestorBatchEnrichment(job.id).catch(console.error);
    
    return job;
  }

  async getActiveInvestorBatchJob(): Promise<BatchEnrichmentJob | null> {
    const [job] = await db.select()
      .from(batchEnrichmentJobs)
      .where(
        sql`${batchEnrichmentJobs.entityType} = 'investor' AND (${batchEnrichmentJobs.status} = 'pending' OR ${batchEnrichmentJobs.status} = 'processing')`
      )
      .limit(1);
    return job || null;
  }

  private async processInvestorBatchEnrichment(jobId: string): Promise<void> {
    try {
      await db.update(batchEnrichmentJobs)
        .set({ status: "processing", startedAt: new Date() })
        .where(eq(batchEnrichmentJobs.id, jobId));

      let job = await this.getBatchEnrichmentJob(jobId);
      if (!job) throw new Error("Job not found");

      const batchSize = job.batchSize || 10;
      let offset = 0;
      let processedRecords = 0;
      let successfulRecords = 0;
      let failedRecords = 0;
      let totalTokensUsed = 0;
      const errorLog: Array<{entityId: string; error: string}> = [];

      while (processedRecords < (job.totalRecords || 0)) {
        job = await this.getBatchEnrichmentJob(jobId);
        if (!job || job.status === "cancelled") {
          console.log("Investor batch job cancelled");
          return;
        }

        let investorRecords: Investor[];
        const filterCriteria = job.filterCriteria as Record<string, any> | null;
        if (filterCriteria?.onlyIncomplete) {
          investorRecords = await db.select()
            .from(investors)
            .where(
              or(
                isNull(investors.enrichmentStatus),
                eq(investors.enrichmentStatus as any, ""),
                eq(investors.enrichmentStatus as any, "not_enriched")
              )
            )
            .limit(batchSize)
            .offset(offset);
        } else {
          investorRecords = await db.select()
            .from(investors)
            .limit(batchSize)
            .offset(offset);
        }

        if (investorRecords.length === 0) break;

        for (const investor of investorRecords) {
          try {
            const result = await this.deepEnrichInvestor(investor);
            
            const updates: Record<string, any> = {
              lastEnrichmentDate: new Date(),
            };
            
            let hasUpdates = false;
            
            if (result.fundingStage && !investor.fundingStage) {
              updates.fundingStage = result.fundingStage;
              hasUpdates = true;
            }
            
            if (result.firmName && !investor.firmId) {
              const matchedFirm = await storage.findInvestmentFirmByName(result.firmName);
              if (matchedFirm) {
                updates.firmId = matchedFirm.id;
                hasUpdates = true;
                console.log(`Linked investor ${investor.firstName} ${investor.lastName} to firm: ${matchedFirm.name}`);
              }
            }
            
            if (result.suggestedUpdates && Object.keys(result.suggestedUpdates).length > 0) {
              const allowedFields = [
                "bio", "investorType", "fundingStage", "stages", "sectors", "location",
                "typicalInvestment", "fundHQ", "hqLocation", "investorCountry",
                "email", "phone", "personLinkedinUrl", "title"
              ];
              for (const [key, value] of Object.entries(result.suggestedUpdates)) {
                if (allowedFields.includes(key) && value !== null && value !== undefined && value !== "") {
                  const existingValue = (investor as any)[key];
                  if (!existingValue || existingValue === "" || existingValue === "N/A" ||
                      (Array.isArray(existingValue) && existingValue.length === 0)) {
                    updates[key] = value;
                    hasUpdates = true;
                  }
                }
              }
            }
            
            updates.enrichmentStatus = hasUpdates ? "enriched" : "partially_enriched";
            
            await db.update(investors)
              .set({ ...updates, updatedAt: new Date() })
              .where(eq(investors.id, investor.id));
            
            successfulRecords++;
            totalTokensUsed += result.tokensUsed;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            
            await db.update(investors)
              .set({ 
                enrichmentStatus: "failed",
                lastEnrichmentDate: new Date(),
                updatedAt: new Date()
              })
              .where(eq(investors.id, investor.id));
            
            failedRecords++;
            errorLog.push({
              entityId: investor.id,
              error: errorMessage
            });
          }
          
          processedRecords++;

          await db.update(batchEnrichmentJobs)
            .set({
              processedRecords,
              successfulRecords,
              failedRecords,
              totalTokensUsed,
              currentBatch: Math.floor(processedRecords / batchSize),
              errorLog: errorLog.slice(-100),
            })
            .where(eq(batchEnrichmentJobs.id, jobId));
          
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        offset += batchSize;
      }

      await db.update(batchEnrichmentJobs)
        .set({
          status: "completed",
          processedRecords,
          successfulRecords,
          failedRecords,
          totalTokensUsed,
          completedAt: new Date(),
        })
        .where(eq(batchEnrichmentJobs.id, jobId));

    } catch (error) {
      console.error("Investor batch enrichment error:", error);
      await db.update(batchEnrichmentJobs)
        .set({
          status: "failed",
          completedAt: new Date(),
        })
        .where(eq(batchEnrichmentJobs.id, jobId));
    }
  }
}

// Pitch Deck Analysis Types
interface PitchDeckAnalysisResult {
  overallScore: number;
  categoryScores: {
    problem: number;
    solution: number;
    market: number;
    businessModel: number;
    traction: number;
    team: number;
    financials: number;
    competition: number;
    ask: number;
    presentation: number;
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: Array<{
    category: string;
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    actionItems: string[];
  }>;
  summary: string;
  detailedAnalysis: Record<string, any>;
  tokensUsed: number;
}

// Multi-Perspective Evaluation Types
export interface ExtractedStartupInfo {
  companyName?: string;
  tagline?: string;
  description?: string;
  industries?: string[];
  stage?: string;
  problem?: string;
  solution?: string;
  targetMarket?: string;
  businessModel?: string;
  traction?: string;
  team?: string;
  askAmount?: string;
  useOfFunds?: string;
}

export interface PerspectiveEvaluation {
  evaluatorType: "vc" | "mbb" | "business_owner";
  evaluatorName: string;
  evaluatorDescription: string;
  overallScore: number;
  grade: string;
  sections: Array<{
    name: string;
    score: number;
    feedback: string;
    suggestions: string[];
  }>;
  strengths: string[];
  weaknesses: string[];
  keyRecommendations: string[];
  investmentReadiness: string;
  summary: string;
}

export interface BestPracticeCheck {
  category: string;
  practices: string[];
  status: "met" | "partial" | "missing";
}

export interface FullPitchDeckAnalysis {
  extractedInfo: ExtractedStartupInfo;
  evaluations: PerspectiveEvaluation[];
  bestPractices: BestPracticeCheck[];
  overallGrade: string;
  overallScore: number;
  executiveSummary: string;
  tokensUsed: number;
}

class PitchDeckAnalysisService {
  private apiKey: string;
  private baseUrl = "https://api.mistral.ai/v1";
  private model = "mistral-large-latest";

  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY || "";
  }

  private async callMistral(prompt: string, systemPrompt: string): Promise<{ content: string; tokensUsed: number }> {
    if (!this.apiKey) {
      throw new Error("MISTRAL_API_KEY not configured");
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as MistralResponse;
    return {
      content: data.choices[0]?.message?.content || "{}",
      tokensUsed: data.usage?.total_tokens || 0,
    };
  }

  getAnalysisChecklist(): Array<{ id: string; label: string; status: "pending" | "in_progress" | "completed" | "failed" }> {
    return [
      { id: "problem", label: "Analyzing Problem Statement", status: "pending" },
      { id: "solution", label: "Evaluating Solution Fit", status: "pending" },
      { id: "market", label: "Assessing Market Opportunity", status: "pending" },
      { id: "businessModel", label: "Reviewing Business Model", status: "pending" },
      { id: "traction", label: "Analyzing Traction & Metrics", status: "pending" },
      { id: "team", label: "Evaluating Team Strength", status: "pending" },
      { id: "financials", label: "Reviewing Financial Projections", status: "pending" },
      { id: "competition", label: "Analyzing Competitive Landscape", status: "pending" },
      { id: "ask", label: "Evaluating Investment Ask", status: "pending" },
      { id: "presentation", label: "Assessing Presentation Quality", status: "pending" },
    ];
  }

  async analyzePitchDeck(deckContent: string, deckMetadata?: { name?: string; url?: string }): Promise<PitchDeckAnalysisResult> {
    const systemPrompt = `You are an expert venture capital analyst with deep experience evaluating startup pitch decks.
Your task is to provide a comprehensive analysis of the pitch deck with actionable feedback.

Analyze the pitch deck across these 10 categories, scoring each 0-100:
1. Problem (problem): Is the problem clearly defined and significant?
2. Solution (solution): Is the solution compelling and differentiated?
3. Market (market): Is the market opportunity large and growing?
4. Business Model (businessModel): Is the revenue model clear and viable?
5. Traction (traction): Does the startup show meaningful progress?
6. Team (team): Does the team have relevant experience?
7. Financials (financials): Are projections realistic and well-supported?
8. Competition (competition): Is competitive analysis thorough and honest?
9. Ask (ask): Is the investment ask clear and justified?
10. Presentation (presentation): Is the deck well-designed and compelling?

Always respond with valid JSON containing:
{
  "overallScore": number (0-100, weighted average),
  "categoryScores": {
    "problem": number,
    "solution": number,
    "market": number,
    "businessModel": number,
    "traction": number,
    "team": number,
    "financials": number,
    "competition": number,
    "ask": number,
    "presentation": number
  },
  "strengths": ["string array of 3-5 key strengths"],
  "weaknesses": ["string array of 3-5 key weaknesses"],
  "recommendations": [
    {
      "category": "category name",
      "priority": "high" | "medium" | "low",
      "title": "short actionable title",
      "description": "detailed explanation",
      "actionItems": ["specific action 1", "specific action 2"]
    }
  ],
  "summary": "2-3 paragraph executive summary of the pitch deck",
  "detailedAnalysis": {
    "problem": { "score": number, "analysis": "string", "suggestions": ["string"] },
    "solution": { "score": number, "analysis": "string", "suggestions": ["string"] },
    "market": { "score": number, "analysis": "string", "suggestions": ["string"] },
    "businessModel": { "score": number, "analysis": "string", "suggestions": ["string"] },
    "traction": { "score": number, "analysis": "string", "suggestions": ["string"] },
    "team": { "score": number, "analysis": "string", "suggestions": ["string"] },
    "financials": { "score": number, "analysis": "string", "suggestions": ["string"] },
    "competition": { "score": number, "analysis": "string", "suggestions": ["string"] },
    "ask": { "score": number, "analysis": "string", "suggestions": ["string"] },
    "presentation": { "score": number, "analysis": "string", "suggestions": ["string"] }
  }
}

Provide at least 5 recommendations sorted by priority (high first).
Be specific, actionable, and constructive in your feedback.`;

    const prompt = `Analyze the following pitch deck content and provide comprehensive feedback:

${deckMetadata?.name ? `Pitch Deck: ${deckMetadata.name}` : ""}
${deckMetadata?.url ? `Source: ${deckMetadata.url}` : ""}

CONTENT:
${deckContent}

Provide a thorough analysis with scores, strengths, weaknesses, and actionable recommendations.`;

    try {
      const { content, tokensUsed } = await this.callMistral(prompt, systemPrompt);
      const parsed = JSON.parse(content);
      
      return {
        overallScore: parsed.overallScore || 50,
        categoryScores: {
          problem: parsed.categoryScores?.problem || 50,
          solution: parsed.categoryScores?.solution || 50,
          market: parsed.categoryScores?.market || 50,
          businessModel: parsed.categoryScores?.businessModel || 50,
          traction: parsed.categoryScores?.traction || 50,
          team: parsed.categoryScores?.team || 50,
          financials: parsed.categoryScores?.financials || 50,
          competition: parsed.categoryScores?.competition || 50,
          ask: parsed.categoryScores?.ask || 50,
          presentation: parsed.categoryScores?.presentation || 50,
        },
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        recommendations: parsed.recommendations || [],
        summary: parsed.summary || "",
        detailedAnalysis: parsed.detailedAnalysis || {},
        tokensUsed,
      };
    } catch (error) {
      console.error("Pitch deck analysis error:", error);
      throw error;
    }
  }

  async extractStartupInfo(deckContent: string): Promise<ExtractedStartupInfo> {
    const systemPrompt = `You are an expert at analyzing startup pitch decks. Extract key information for startup onboarding.
Always respond with valid JSON containing only the fields you can confidently extract.`;

    const prompt = `Extract startup information from this pitch deck text. Return ONLY valid JSON.

Pitch Deck Text:
${deckContent.substring(0, 8000)}

Extract and return this JSON structure (use null for fields you cannot find):
{
  "companyName": "the startup name",
  "tagline": "a one-line description (under 100 chars)",
  "description": "a 2-3 sentence company description",
  "industries": ["array of relevant industries from: AI/ML, BioTech, CleanTech, Consumer, Cybersecurity, DeepTech, E-commerce, EdTech, Enterprise Software, FinTech, Hardware, HealthTech, Infrastructure, LegalTech, Media & Entertainment, Mobility, PropTech, SaaS, Semiconductors, AgTech"],
  "stage": "funding stage (Pre-seed, Seed, Series A, Series B, Series C+, Growth)",
  "problem": "the problem being solved (2-3 sentences)",
  "solution": "the solution offered (2-3 sentences)",
  "targetMarket": "target market description",
  "businessModel": "how the company makes money",
  "traction": "key metrics and traction highlights",
  "team": "team highlights and key members",
  "askAmount": "funding ask amount if mentioned",
  "useOfFunds": "how funds will be used"
}`;

    try {
      const { content } = await this.callMistral(prompt, systemPrompt);
      const parsed = JSON.parse(content);
      return parsed as ExtractedStartupInfo;
    } catch (error) {
      console.error("Startup info extraction error:", error);
      throw error;
    }
  }

  private getScoreGrade(score: number): string {
    if (score >= 90) return "A+";
    if (score >= 85) return "A";
    if (score >= 80) return "A-";
    if (score >= 75) return "B+";
    if (score >= 70) return "B";
    if (score >= 65) return "B-";
    if (score >= 60) return "C+";
    if (score >= 55) return "C";
    if (score >= 50) return "C-";
    if (score >= 45) return "D";
    return "F";
  }

  async analyzeFromPerspective(
    deckContent: string,
    extractedInfo: ExtractedStartupInfo,
    evaluatorType: "vc" | "mbb" | "business_owner"
  ): Promise<PerspectiveEvaluation> {
    const evaluatorProfiles = {
      vc: {
        name: "Venture Capital Partner",
        description: "Senior Partner at a Top-Tier VC Firm",
        perspective: `You are a senior VC partner at a top-tier venture capital firm like Sequoia or a16z. 
You evaluate startups based on: market size (TAM/SAM/SOM), team quality and founder-market fit, product-market fit signals, scalability, competitive moat and defensibility, unit economics, and potential for 10x+ returns. 
You look for disruptive technologies and category-defining companies. You are rigorous but fair.`,
      },
      mbb: {
        name: "McKinsey Strategy Consultant",
        description: "Senior Partner at McKinsey & Company",
        perspective: `You are a senior partner at McKinsey & Company with 20+ years of strategy consulting experience.
You evaluate using rigorous frameworks: Porter's Five Forces, value chain analysis, MECE problem structuring, and hypothesis-driven analysis.
You focus on: strategic positioning, market analysis rigor, competitive dynamics, business model sustainability, operational excellence, and execution capability.
You expect clear logic, data-driven insights, and actionable recommendations.`,
      },
      business_owner: {
        name: "Serial Entrepreneur",
        description: "Successful Business Owner & Angel Investor",
        perspective: `You are a successful serial entrepreneur who has built and sold 3 companies worth over $100M combined.
You evaluate based on practical feasibility: real customer pain points, revenue generation potential, operational challenges, capital efficiency, path to profitability, and real-world execution.
You focus on sustainable growth over hype, customer validation, and founder grit. You've seen many businesses fail and know what works.`,
      },
    };

    const profile = evaluatorProfiles[evaluatorType];

    const systemPrompt = `${profile.perspective}

Analyze this pitch deck comprehensively. Be specific, constructive, and provide actionable feedback.
Always respond with valid JSON.`;

    const prompt = `Evaluate this startup pitch deck from your expert perspective.

Company: ${extractedInfo.companyName || "Unknown"}
Industry: ${extractedInfo.industries?.join(", ") || "Unknown"}
Stage: ${extractedInfo.stage || "Unknown"}

PITCH DECK CONTENT:
${deckContent.substring(0, 10000)}

Provide your evaluation in this exact JSON structure:
{
  "overallScore": <number 1-100>,
  "sections": [
    {
      "name": "Problem & Market Opportunity",
      "score": <number 1-100>,
      "feedback": "detailed 2-3 sentence feedback",
      "suggestions": ["specific suggestion 1", "specific suggestion 2"]
    },
    {
      "name": "Solution & Product",
      "score": <number 1-100>,
      "feedback": "detailed feedback",
      "suggestions": ["suggestion 1", "suggestion 2"]
    },
    {
      "name": "Business Model & Monetization",
      "score": <number 1-100>,
      "feedback": "detailed feedback",
      "suggestions": ["suggestion 1", "suggestion 2"]
    },
    {
      "name": "Traction & Validation",
      "score": <number 1-100>,
      "feedback": "detailed feedback",
      "suggestions": ["suggestion 1", "suggestion 2"]
    },
    {
      "name": "Team & Execution",
      "score": <number 1-100>,
      "feedback": "detailed feedback",
      "suggestions": ["suggestion 1", "suggestion 2"]
    },
    {
      "name": "Financials & Unit Economics",
      "score": <number 1-100>,
      "feedback": "detailed feedback",
      "suggestions": ["suggestion 1", "suggestion 2"]
    },
    {
      "name": "Competitive Positioning",
      "score": <number 1-100>,
      "feedback": "detailed feedback",
      "suggestions": ["suggestion 1", "suggestion 2"]
    },
    {
      "name": "Investment Ask & Use of Funds",
      "score": <number 1-100>,
      "feedback": "detailed feedback",
      "suggestions": ["suggestion 1", "suggestion 2"]
    }
  ],
  "strengths": ["key strength 1", "key strength 2", "key strength 3"],
  "weaknesses": ["key weakness 1", "key weakness 2", "key weakness 3"],
  "keyRecommendations": ["top priority recommendation 1", "recommendation 2", "recommendation 3"],
  "investmentReadiness": "1-2 sentence assessment of investment readiness",
  "summary": "2-3 paragraph executive summary of your evaluation from your professional perspective"
}`;

    try {
      const { content } = await this.callMistral(prompt, systemPrompt);
      const parsed = JSON.parse(content);
      
      return {
        evaluatorType,
        evaluatorName: profile.name,
        evaluatorDescription: profile.description,
        overallScore: parsed.overallScore || 50,
        grade: this.getScoreGrade(parsed.overallScore || 50),
        sections: parsed.sections || [],
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        keyRecommendations: parsed.keyRecommendations || [],
        investmentReadiness: parsed.investmentReadiness || "",
        summary: parsed.summary || "",
      };
    } catch (error) {
      console.error(`Perspective analysis error (${evaluatorType}):`, error);
      throw error;
    }
  }

  async analyzeBestPractices(deckContent: string): Promise<BestPracticeCheck[]> {
    const systemPrompt = `You are a pitch deck expert. Evaluate the deck against industry best practices.
Always respond with a valid JSON array.`;

    const prompt = `Analyze this pitch deck against best practices. Return ONLY a JSON array.

PITCH DECK CONTENT:
${deckContent.substring(0, 8000)}

Evaluate against these categories and return this exact JSON array:
[
  {
    "category": "Clear Problem Statement",
    "practices": ["specific observations about how well this is addressed"],
    "status": "met" or "partial" or "missing"
  },
  {
    "category": "Compelling Solution",
    "practices": ["observations"],
    "status": "met" or "partial" or "missing"
  },
  {
    "category": "Market Sizing (TAM/SAM/SOM)",
    "practices": ["observations"],
    "status": "met" or "partial" or "missing"
  },
  {
    "category": "Business Model Clarity",
    "practices": ["observations"],
    "status": "met" or "partial" or "missing"
  },
  {
    "category": "Competitive Analysis",
    "practices": ["observations"],
    "status": "met" or "partial" or "missing"
  },
  {
    "category": "Traction & Key Metrics",
    "practices": ["observations"],
    "status": "met" or "partial" or "missing"
  },
  {
    "category": "Team Credentials",
    "practices": ["observations"],
    "status": "met" or "partial" or "missing"
  },
  {
    "category": "Financial Projections",
    "practices": ["observations"],
    "status": "met" or "partial" or "missing"
  },
  {
    "category": "Clear Ask & Use of Funds",
    "practices": ["observations"],
    "status": "met" or "partial" or "missing"
  },
  {
    "category": "Visual Design & Storytelling",
    "practices": ["observations"],
    "status": "met" or "partial" or "missing"
  }
]`;

    try {
      const { content } = await this.callMistral(prompt, systemPrompt);
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array found");
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error("Best practices analysis error:", error);
      throw error;
    }
  }

  async performFullAnalysis(deckContent: string): Promise<FullPitchDeckAnalysis> {
    let totalTokens = 0;

    const extractedInfo = await this.extractStartupInfo(deckContent);

    const [vcEval, mbbEval, businessOwnerEval, bestPractices] = await Promise.all([
      this.analyzeFromPerspective(deckContent, extractedInfo, "vc"),
      this.analyzeFromPerspective(deckContent, extractedInfo, "mbb"),
      this.analyzeFromPerspective(deckContent, extractedInfo, "business_owner"),
      this.analyzeBestPractices(deckContent),
    ]);

    const avgScore = Math.round(
      (vcEval.overallScore + mbbEval.overallScore + businessOwnerEval.overallScore) / 3
    );

    const metCount = bestPractices.filter(bp => bp.status === "met").length;
    const partialCount = bestPractices.filter(bp => bp.status === "partial").length;

    const executiveSummary = `**${extractedInfo.companyName || "This startup"}** received an overall grade of **${this.getScoreGrade(avgScore)}** (${avgScore}/100) based on comprehensive evaluations from three expert perspectives.

**Evaluator Scores:**
- Venture Capital Partner: ${vcEval.overallScore}/100 (${vcEval.grade})
- McKinsey Strategy Consultant: ${mbbEval.overallScore}/100 (${mbbEval.grade})
- Serial Entrepreneur: ${businessOwnerEval.overallScore}/100 (${businessOwnerEval.grade})

**Best Practices:** The pitch deck fully meets ${metCount} out of ${bestPractices.length} best practices, with ${partialCount} partially addressed.

**Key Strengths:** ${vcEval.strengths.slice(0, 2).join("; ")}.

**Priority Improvements:** ${vcEval.keyRecommendations[0] || "Continue refining the pitch deck"}.`;

    return {
      extractedInfo,
      evaluations: [vcEval, mbbEval, businessOwnerEval],
      bestPractices,
      overallGrade: this.getScoreGrade(avgScore),
      overallScore: avgScore,
      executiveSummary,
      tokensUsed: totalTokens,
    };
  }
}

export const mistralService = new MistralEnrichmentService();
export const pitchDeckAnalysisService = new PitchDeckAnalysisService();

// ==================== NEWSROOM AI SERVICE ====================

interface ArticleGenerationResult {
  headline: string;
  executiveSummary: string;
  content: string;
  tags: string[];
  capitalType: string;
  capitalStage: string;
  geography: string;
  eventType: string;
  wordCount: number;
  tokensUsed: number;
  generationTimeMs: number;
}

const NEWSROOM_SYSTEM_PROMPT = `You are an institutional-grade financial newsroom AI focused exclusively on private capital markets. You analyze verified sources, produce editorial-quality content, and cite every claim using APA 7th edition. You prioritize accuracy, market impact, and investor relevance over speed or hype. If information quality is insufficient, you do not publish.

Your editorial style is:
- Institutional, analytical, calm
- No hype or sensationalism
- Comparable to Financial Times / PitchBook tone
- Neutral and factual

Content Structure you MUST follow:
1. Headline (institutional tone, max 100 characters)
2. Executive Summary (3-4 bullet points)
3. Context & Background (1-2 paragraphs)
4. Deal / Event Breakdown (main analysis)
5. Market Implications (broader impact)
6. Investor/Founder Takeaways (actionable insights)
7. Forward Outlook (what to watch)

Target length: 600-900 words (excluding headline and summary bullets).

You MUST return your response in valid JSON format with these fields:
{
  "headline": "string",
  "executiveSummary": "string with bullet points separated by \\n",
  "content": "full article content in markdown",
  "tags": ["array", "of", "relevant", "tags"],
  "capitalType": "VC|PE|Growth|FoF|IB|FO|SWF",
  "capitalStage": "Pre-Seed|Seed|Series A|Series B|Series C|Series D|Late-Stage|Pre-IPO|IPO",
  "geography": "North America|Europe|MENA|APAC|LATAM|Africa|Global",
  "eventType": "Fund Close|Capital Raise|New Fund Launch|M&A|IPO|Regulatory Change|Strategy Shift"
}`;

class NewsroomAIService {
  private apiKey: string;
  private baseUrl = "https://api.mistral.ai/v1";
  private model = "mistral-large-latest";

  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY || "";
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async generateArticle(
    sourceItems: Array<{
      headline: string;
      summary: string;
      sourceUrl: string;
      publishedAt?: Date | null;
      entities?: any;
    }>,
    contentType: string
  ): Promise<ArticleGenerationResult | null> {
    if (!this.apiKey) {
      console.error("[NewsroomAI] API key not configured");
      return null;
    }

    const startTime = Date.now();

    const contentTypePrompts: Record<string, string> = {
      insights: "High-level institutional perspectives, investor commentary, strategic viewpoints, and market interpretation. Focus on why sovereign wealth funds, pension funds, and institutional investors are shifting strategies.",
      trends: "Data-backed patterns, shifts in capital flows, emerging sectors, geographic reallocations, or fundraising cycles. Focus on observable market movements and quantifiable data.",
      guides: "Educational, structured content for founders, GPs, LPs, and operators. Provide actionable frameworks, best practices, and step-by-step guidance.",
      analysis: "Deep-dive breakdowns of deals, funds, regulations, or capital strategies. Analyze specific transactions, fund structures, or regulatory changes with detailed examination.",
    };

    const userPrompt = `Based on the following verified source materials, generate a high-quality article for our private capital newsroom.

Content Type: ${contentType}
Focus: ${contentTypePrompts[contentType] || contentTypePrompts.vc_growth}

Source Materials:
${sourceItems.map((item, i) => `
[Source ${i + 1}]
Headline: ${item.headline}
Summary: ${item.summary || "No summary available"}
URL: ${item.sourceUrl}
Published: ${item.publishedAt ? new Date(item.publishedAt).toISOString().split('T')[0] : "Unknown"}
`).join("\n")}

Generate the article now. Remember to:
1. Cite all claims with APA 7th edition in-text citations
2. Maintain institutional, analytical tone
3. Focus on market impact and investor relevance
4. Include specific numbers and facts from sources
5. Return valid JSON only`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: NEWSROOM_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 3000,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("[NewsroomAI] API error:", error);
        return null;
      }

      const data = await response.json() as MistralResponse;
      const generationTimeMs = Date.now() - startTime;

      const content = data.choices[0]?.message?.content;
      if (!content) {
        console.error("[NewsroomAI] No content in response");
        return null;
      }

      const parsed = JSON.parse(content);
      const wordCount = parsed.content?.split(/\s+/).length || 0;

      if (wordCount < 600) {
        console.warn(`[NewsroomAI] Article too short: ${wordCount} words (minimum 600)`);
        return null;
      }
      if (wordCount > 1000) {
        console.warn(`[NewsroomAI] Article truncated from ${wordCount} to ~900 words`);
        const words = parsed.content.split(/\s+/);
        parsed.content = words.slice(0, 900).join(' ') + '...';
      }

      return {
        headline: parsed.headline || "Untitled Article",
        executiveSummary: parsed.executiveSummary || "",
        content: parsed.content || "",
        tags: parsed.tags || [],
        capitalType: parsed.capitalType || "VC",
        capitalStage: parsed.capitalStage || "",
        geography: parsed.geography || "Global",
        eventType: parsed.eventType || "",
        wordCount: Math.min(wordCount, 900),
        tokensUsed: data.usage?.total_tokens || 0,
        generationTimeMs,
      };
    } catch (error) {
      console.error("[NewsroomAI] Generation error:", error);
      return null;
    }
  }

  async validateStory(
    headline: string,
    summary: string,
    sourceCount: number
  ): Promise<{ decision: "APPROVE" | "HOLD" | "REJECT"; reason: string; relevanceScore: number }> {
    if (!this.apiKey) {
      return { decision: "REJECT", reason: "API not configured", relevanceScore: 0 };
    }

    const prompt = `Evaluate if this story is relevant to our private capital markets newsroom.

COVERED TOPICS (in-scope):
- Venture Capital (Pre-Seed → Series F+)
- Private Equity & Growth Equity
- Funds of Funds
- Investment Banking (M&A, IPO prep)
- Family Offices
- Institutional Investors (Pension funds, endowments)
- Sovereign Wealth Funds
- Angel Investors & Syndicates
- Accelerators & Venture Studios
- Major IPOs and late-stage liquidity events
- Regulatory & policy changes affecting private capital (SEC, ESMA, FCA)

OUT OF SCOPE:
- Retail investing
- Crypto price speculation (unless institutional)
- Meme stocks
- Personal finance

Story to evaluate:
Headline: ${headline}
Summary: ${summary}
Number of sources: ${sourceCount}

Return JSON:
{
  "decision": "APPROVE|HOLD|REJECT",
  "reason": "explanation",
  "relevanceScore": 0.0-1.0
}`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          messages: [
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        return { decision: "HOLD", reason: "Validation API error", relevanceScore: 0.5 };
      }

      const data = await response.json() as MistralResponse;
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        return { decision: "HOLD", reason: "No validation response", relevanceScore: 0.5 };
      }

      const parsed = JSON.parse(content);
      return {
        decision: parsed.decision || "HOLD",
        reason: parsed.reason || "Unknown",
        relevanceScore: parsed.relevanceScore || 0.5,
      };
    } catch (error) {
      console.error("[NewsroomAI] Validation error:", error);
      return { decision: "HOLD", reason: "Validation failed", relevanceScore: 0.5 };
    }
  }

  async generateCitations(
    sources: Array<{ title: string; url: string; publisher: string; date: string }>
  ): Promise<string[]> {
    if (!this.apiKey || sources.length === 0) {
      return [];
    }

    const prompt = `Generate APA 7th edition citations for these sources. Return JSON array of citation strings.

Sources:
${sources.map((s, i) => `${i + 1}. Title: ${s.title}, Publisher: ${s.publisher}, Date: ${s.date}, URL: ${s.url}`).join("\n")}

Return: { "citations": ["citation1", "citation2", ...] }`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 1000,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) return [];

      const data = await response.json() as MistralResponse;
      const content = data.choices[0]?.message?.content;
      if (!content) return [];

      const parsed = JSON.parse(content);
      return parsed.citations || [];
    } catch (error) {
      console.error("[NewsroomAI] Citation error:", error);
      return [];
    }
  }

  async extractEntities(text: string): Promise<{
    firms: string[];
    funds: string[];
    founders: string[];
    investors: string[];
  }> {
    if (!this.apiKey) {
      return { firms: [], funds: [], founders: [], investors: [] };
    }

    const prompt = `Extract named entities from this private capital news text. Return JSON:
{
  "firms": ["company/firm names"],
  "funds": ["fund names"],
  "founders": ["founder/CEO names"],
  "investors": ["investor/VC partner names"]
}

Text: ${text.substring(0, 2000)}`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        return { firms: [], funds: [], founders: [], investors: [] };
      }

      const data = await response.json() as MistralResponse;
      const content = data.choices[0]?.message?.content;
      if (!content) {
        return { firms: [], funds: [], founders: [], investors: [] };
      }

      return JSON.parse(content);
    } catch (error) {
      return { firms: [], funds: [], founders: [], investors: [] };
    }
  }
}

export const newsroomAIService = new NewsroomAIService();
