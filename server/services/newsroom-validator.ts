import { db } from "../db";
import { newsSourceItems, newsGenerationLogs } from "@shared/schema";
import type { NewsSourceItem } from "@shared/schema";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import { newsroomAIService } from "./mistral";

interface ValidationResult {
  decision: "APPROVE" | "HOLD" | "REJECT";
  reason: string;
  relevanceScore: number;
  duplicateOf?: string;
}

class SignalValidationAgent {
  private minSourcesRequired = 2;
  private freshnessHours = 72;
  private minRelevanceScore = 0.6;

  private extractTrigrams(text: string): Set<string> {
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const trigrams = new Set<string>();
    for (let i = 0; i <= normalized.length - 3; i++) {
      trigrams.add(normalized.substring(i, i + 3));
    }
    return trigrams;
  }

  private trigramSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const t of a) {
      if (b.has(t)) intersection++;
    }
    return (2 * intersection) / (a.size + b.size);
  }

  async checkSourceCorroboration(headline: string, itemId: string, sourceId?: string): Promise<{ count: number; distinctPublishers: number }> {
    const trigrams = this.extractTrigrams(headline);
    
    const freshnessThreshold = new Date();
    freshnessThreshold.setHours(freshnessThreshold.getHours() - 72);

    const recentItems = await db.select()
      .from(newsSourceItems)
      .where(gte(newsSourceItems.createdAt, freshnessThreshold))
      .limit(100);

    const corroboratingSources = new Set<string>();
    corroboratingSources.add(sourceId || "unknown");
    let corroboratingCount = 1;

    for (const item of recentItems) {
      if (item.id === itemId) continue;
      
      const itemTrigrams = this.extractTrigrams(item.headline);
      const similarity = this.trigramSimilarity(trigrams, itemTrigrams);
      
      if (similarity > 0.25) {
        corroboratingCount++;
        if (item.sourceId && !corroboratingSources.has(item.sourceId)) {
          corroboratingSources.add(item.sourceId);
        }
      }
    }

    return { 
      count: corroboratingCount, 
      distinctPublishers: corroboratingSources.size 
    };
  }

  async validateItem(item: NewsSourceItem): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      if (!item.headline) {
        return { decision: "REJECT", reason: "No headline", relevanceScore: 0 };
      }

      const publishedAt = item.publishedAt ? new Date(item.publishedAt) : new Date();
      const freshnessThreshold = new Date();
      freshnessThreshold.setHours(freshnessThreshold.getHours() - this.freshnessHours);
      
      if (publishedAt < freshnessThreshold) {
        return { decision: "REJECT", reason: `Story older than ${this.freshnessHours} hours`, relevanceScore: 0 };
      }

      const duplicateCheck = await this.checkForDuplicates(item.headline, item.id);
      if (duplicateCheck) {
        return { 
          decision: "REJECT", 
          reason: "Duplicate story detected", 
          relevanceScore: 0,
          duplicateOf: duplicateCheck,
        };
      }

      const corroboration = await this.checkSourceCorroboration(item.headline, item.id, item.sourceId);
      if (corroboration.distinctPublishers < this.minSourcesRequired) {
        await this.updateItemValidation(item.id, "hold", `Needs ${this.minSourcesRequired - corroboration.distinctPublishers} more distinct publisher sources`, 0.4);
        return { 
          decision: "HOLD", 
          reason: `Insufficient source corroboration (${corroboration.distinctPublishers}/${this.minSourcesRequired} distinct publishers required)`,
          relevanceScore: 0.4,
        };
      }

      const aiValidation = await newsroomAIService.validateStory(
        item.headline,
        item.summary || "",
        1
      );

      if (aiValidation.decision === "REJECT" || aiValidation.relevanceScore < this.minRelevanceScore) {
        await this.updateItemValidation(item.id, "rejected", aiValidation.reason, aiValidation.relevanceScore);
        return {
          decision: "REJECT",
          reason: aiValidation.reason,
          relevanceScore: aiValidation.relevanceScore,
        };
      }

      if (aiValidation.decision === "HOLD") {
        await this.updateItemValidation(item.id, "hold", aiValidation.reason, aiValidation.relevanceScore);
        return {
          decision: "HOLD",
          reason: aiValidation.reason,
          relevanceScore: aiValidation.relevanceScore,
        };
      }

      await this.updateItemValidation(item.id, "approved", aiValidation.reason, aiValidation.relevanceScore);
      
      await this.logAction(null, null, "signal_validation", "validate", "completed", {
        itemId: item.id,
        decision: "APPROVE",
        relevanceScore: aiValidation.relevanceScore,
        durationMs: Date.now() - startTime,
      });

      return {
        decision: "APPROVE",
        reason: aiValidation.reason,
        relevanceScore: aiValidation.relevanceScore,
      };
    } catch (error) {
      console.error("[ValidationAgent] Error:", error);
      return {
        decision: "HOLD",
        reason: "Validation error",
        relevanceScore: 0.5,
      };
    }
  }

  async validatePendingItems(limit: number = 20): Promise<{ validated: number; approved: number; rejected: number; held: number }> {
    const pendingItems = await db.select()
      .from(newsSourceItems)
      .where(eq(newsSourceItems.validationStatus, "pending"))
      .orderBy(desc(newsSourceItems.createdAt))
      .limit(limit);

    let approved = 0;
    let rejected = 0;
    let held = 0;

    for (const item of pendingItems) {
      const result = await this.validateItem(item);
      
      switch (result.decision) {
        case "APPROVE":
          approved++;
          break;
        case "REJECT":
          rejected++;
          break;
        case "HOLD":
          held++;
          break;
      }
    }

    return {
      validated: pendingItems.length,
      approved,
      rejected,
      held,
    };
  }

  private async checkForDuplicates(headline: string, excludeId: string): Promise<string | null> {
    const normalizedHeadline = headline.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const words = normalizedHeadline.split(/\s+/).filter(w => w.length > 3);
    
    if (words.length < 3) {
      return null;
    }

    const freshnessThreshold = new Date();
    freshnessThreshold.setHours(freshnessThreshold.getHours() - 72);

    const recentItems = await db.select()
      .from(newsSourceItems)
      .where(and(
        gte(newsSourceItems.createdAt, freshnessThreshold),
        eq(newsSourceItems.validationStatus, "approved")
      ))
      .limit(100);

    for (const item of recentItems) {
      if (item.id === excludeId) continue;
      
      const existingNormalized = item.headline.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      const existingWords = new Set(existingNormalized.split(/\s+/).filter(w => w.length > 3));
      
      let matchCount = 0;
      for (const word of words) {
        if (existingWords.has(word)) matchCount++;
      }
      
      const similarity = matchCount / Math.max(words.length, existingWords.size);
      if (similarity > 0.7) {
        return item.id;
      }
    }

    return null;
  }

  private async updateItemValidation(
    itemId: string,
    status: string,
    notes: string,
    relevanceScore: number
  ): Promise<void> {
    await db.update(newsSourceItems)
      .set({
        validationStatus: status,
        validationNotes: notes,
        relevanceScore,
        processedAt: new Date(),
      })
      .where(eq(newsSourceItems.id, itemId));
  }

  private async logAction(
    articleId: string | null,
    scheduledPostId: string | null,
    agentType: string,
    action: string,
    status: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      await db.insert(newsGenerationLogs).values({
        articleId,
        scheduledPostId,
        agentType,
        action,
        status,
        inputData: data,
        outputData: {},
        durationMs: data.durationMs || 0,
      });
    } catch (error) {
      console.error("[ValidationAgent] Failed to log action:", error);
    }
  }
}

export const signalValidationAgent = new SignalValidationAgent();
