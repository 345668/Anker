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
            
            const updates: Record<string, any> = {};
            if (result.firmClassification) {
              updates.firmClassification = result.firmClassification;
            }
            if (result.suggestedUpdates && Object.keys(result.suggestedUpdates).length > 0) {
              Object.assign(updates, result.suggestedUpdates);
            }
            
            if (Object.keys(updates).length > 0) {
              await db.update(investmentFirms)
                .set({ ...updates, updatedAt: new Date() })
                .where(eq(investmentFirms.id, firm.id));
            }
            
            successfulRecords++;
            totalTokensUsed += result.tokensUsed;
          } catch (error) {
            failedRecords++;
            errorLog.push({
              entityId: firm.id,
              error: error instanceof Error ? error.message : "Unknown error"
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

export const mistralService = new MistralEnrichmentService();
