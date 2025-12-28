import { storage } from "../storage";
import { db } from "../db";
import { eq, isNull, or, sql } from "drizzle-orm";
import { investmentFirms, batchEnrichmentJobs, FIRM_CLASSIFICATIONS } from "@shared/schema";
import type { Investor, Contact, InvestmentFirm, EnrichmentJob, BatchEnrichmentJob } from "@shared/schema";

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
    
    const systemPrompt = `You are an expert venture capital analyst specializing in categorizing investment firms.
Your task is to:
1. Classify the investment firm into ONE of these categories: ${classificationsStr}
2. Fill in missing data fields based on available information

Always respond with valid JSON containing:
- firmClassification: string (one of the valid categories, or null if truly unknown)
- suggestedUpdates: object with field names and values to update (only fields with actual data to add)

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

    const existingData = {
      name: firm.name,
      description: firm.description,
      website: firm.website,
      type: firm.type,
      industry: firm.industry,
      location: firm.location || firm.hqLocation,
      stages: firm.stages,
      sectors: firm.sectors,
      aum: firm.aum,
      employeeRange: firm.employeeRange,
      customFields: firm.folkCustomFields,
    };

    const prompt = `Analyze this investment firm and classify it:
${JSON.stringify(existingData, null, 2)}

Based on the available data:
1. Determine the most appropriate classification from: ${classificationsStr}
2. Suggest any missing field values that can be reasonably inferred

Return JSON with firmClassification and suggestedUpdates.
Only include suggestedUpdates for fields where you have high confidence.
Available fields to update: description, type, industry, stages (array), sectors (array), aum`;

    try {
      const { content, tokensUsed } = await this.callMistral(prompt, systemPrompt);
      const parsed = JSON.parse(content);
      
      let classification = parsed.firmClassification;
      if (classification && !FIRM_CLASSIFICATIONS.includes(classification)) {
        classification = null;
      }
      
      return {
        firmClassification: classification,
        suggestedUpdates: parsed.suggestedUpdates || {},
        tokensUsed,
      };
    } catch (error) {
      console.error("Mistral classification error:", error);
      throw error;
    }
  }

  async startBatchEnrichment(
    userId: string,
    entityType: "firm" = "firm",
    enrichmentType: "classification" | "full_enrichment" = "classification",
    batchSize: number = 10,
    onlyUnclassified: boolean = true
  ): Promise<BatchEnrichmentJob> {
    let query = db.select({ count: sql<number>`count(*)` }).from(investmentFirms);
    
    if (onlyUnclassified) {
      query = query.where(or(isNull(investmentFirms.firmClassification), eq(investmentFirms.firmClassification, ""))) as any;
    }
    
    const [{ count }] = await query;
    const totalRecords = Number(count);
    const totalBatches = Math.ceil(totalRecords / batchSize);

    const [job] = await db.insert(batchEnrichmentJobs).values({
      entityType,
      enrichmentType,
      status: "pending",
      totalRecords,
      processedRecords: 0,
      successfulRecords: 0,
      failedRecords: 0,
      batchSize,
      currentBatch: 0,
      totalBatches,
      filterCriteria: { onlyUnclassified },
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
        if (filterCriteria?.onlyUnclassified) {
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
