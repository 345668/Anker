import { db } from "../db";
import { newsScheduledPosts, newsArticles, newsSourceItems, newsGenerationLogs, NEWS_CONTENT_TYPES } from "@shared/schema";
import type { NewsScheduledPost, NewsSourceItem, NewsContentType } from "@shared/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { newsroomAIService } from "./mistral";
import { toZonedTime, fromZonedTime, format } from "date-fns-tz";

const BERLIN_TIMEZONE = "Europe/Berlin";

interface ScheduleSlot {
  time: string;
  contentType: NewsContentType;
}

// 4x daily posting schedule in CET Berlin timezone
// insights, trends, guides, analysis (replacing old categories)
const DAILY_SCHEDULE: ScheduleSlot[] = [
  { time: "08:00", contentType: "insights" },
  { time: "12:00", contentType: "trends" },
  { time: "15:00", contentType: "guides" },
  { time: "21:00", contentType: "analysis" },
];

function generateSlug(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 80)
    + "-" + Date.now().toString(36);
}

class NewsroomSchedulerService {
  // Get current time in Berlin CET timezone
  private getBerlinTime(date: Date = new Date()): Date {
    return toZonedTime(date, BERLIN_TIMEZONE);
  }

  // Get today's date string in Berlin timezone (YYYY-MM-DD)
  private getBerlinDateStr(date: Date = new Date()): string {
    const berlinTime = this.getBerlinTime(date);
    return format(berlinTime, "yyyy-MM-dd", { timeZone: BERLIN_TIMEZONE });
  }

  // Get current hour in Berlin timezone
  private getBerlinHour(date: Date = new Date()): number {
    const berlinTime = this.getBerlinTime(date);
    return berlinTime.getHours();
  }

  async createDailySchedule(date: Date = new Date()): Promise<number> {
    const dateStr = this.getBerlinDateStr(date);
    let created = 0;

    console.log(`[Scheduler] Creating daily schedule for ${dateStr} (CET Berlin)`);

    for (const slot of DAILY_SCHEDULE) {
      const existing = await db.select()
        .from(newsScheduledPosts)
        .where(and(
          eq(newsScheduledPosts.scheduledDate, dateStr),
          eq(newsScheduledPosts.slot, this.getSlotName(slot.time))
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(newsScheduledPosts).values({
          scheduledDate: dateStr,
          slot: this.getSlotName(slot.time),
          contentType: slot.contentType,
          status: "pending",
          generationAttempts: 0,
        });
        created++;
        console.log(`[Scheduler] Created slot: ${slot.time} CET - ${slot.contentType}`);
      }
    }

    return created;
  }

  private getSlotName(time: string): string {
    const slotNames: Record<string, string> = {
      "08:00": "morning_8am",
      "12:00": "noon_12pm",
      "15:00": "afternoon_3pm",
      "21:00": "evening_9pm",
    };
    return slotNames[time] || time;
  }

  async getNextPendingSlot(): Promise<NewsScheduledPost | null> {
    const now = new Date();
    const todayStr = this.getBerlinDateStr(now);
    const currentBerlinHour = this.getBerlinHour(now);
    
    console.log(`[Scheduler] Checking for pending slots at ${currentBerlinHour}:00 CET (${todayStr})`);
    
    const pendingSlots = await db.select()
      .from(newsScheduledPosts)
      .where(and(
        eq(newsScheduledPosts.scheduledDate, todayStr),
        eq(newsScheduledPosts.status, "pending")
      ))
      .orderBy(newsScheduledPosts.slot);

    for (const slot of pendingSlots) {
      const slotHour = this.getSlotHour(slot.slot);
      if (slotHour <= currentBerlinHour) {
        console.log(`[Scheduler] Found pending slot: ${slot.slot} (${slot.contentType}) - due at ${slotHour}:00 CET`);
        return slot;
      }
    }

    return null;
  }

  private getSlotHour(slotName: string): number {
    const hours: Record<string, number> = {
      "morning_8am": 8,
      "noon_12pm": 12,
      "afternoon_3pm": 15,
      "evening_9pm": 21,
    };
    return hours[slotName] || 0;
  }

  async processScheduledSlot(slot: NewsScheduledPost): Promise<boolean> {
    const startTime = Date.now();

    try {
      await db.update(newsScheduledPosts)
        .set({ status: "generating", generationAttempts: (slot.generationAttempts || 0) + 1 })
        .where(eq(newsScheduledPosts.id, slot.id));

      const allApprovedItems = await db.select()
        .from(newsSourceItems)
        .where(eq(newsSourceItems.validationStatus, "approved"))
        .orderBy(desc(newsSourceItems.relevanceScore), desc(newsSourceItems.createdAt))
        .limit(50);

      const matchedItems = this.filterByContentType(allApprovedItems, slot.contentType);
      
      if (matchedItems.length < 2) {
        await db.update(newsScheduledPosts)
          .set({ 
            status: "pending",
            skipReason: `Insufficient content-type matches (${matchedItems.length}/2 required for ${slot.contentType}) - holding for more sources` 
          })
          .where(eq(newsScheduledPosts.id, slot.id));
        
        console.log(`[Scheduler] Slot ${slot.slot} held: only ${matchedItems.length} matching sources for ${slot.contentType}`);
        return false;
      }

      const approvedItems = matchedItems.slice(0, 5);

      if (approvedItems.length === 0) {
        await db.update(newsScheduledPosts)
          .set({ 
            status: "pending", 
            skipReason: "No approved source items available - holding for more sources" 
          })
          .where(eq(newsScheduledPosts.id, slot.id));
        return false;
      }

      const sourceItems = approvedItems.map(item => ({
        headline: item.headline,
        summary: item.summary || "",
        sourceUrl: item.sourceUrl,
        publishedAt: item.publishedAt,
        entities: item.entities,
      }));

      const generatedArticle = await newsroomAIService.generateArticle(
        sourceItems,
        slot.contentType
      );

      if (!generatedArticle) {
        await db.update(newsScheduledPosts)
          .set({ 
            status: "pending",
            generationAttempts: (slot.generationAttempts || 0) + 1,
            skipReason: "AI generation failed or content quality check failed - will retry" 
          })
          .where(eq(newsScheduledPosts.id, slot.id));
        return false;
      }

      if (generatedArticle.wordCount < 600) {
        await db.update(newsScheduledPosts)
          .set({ 
            status: "pending",
            generationAttempts: (slot.generationAttempts || 0) + 1,
            skipReason: `Article too short (${generatedArticle.wordCount} words) - will retry` 
          })
          .where(eq(newsScheduledPosts.id, slot.id));
        return false;
      }

      const sources = approvedItems.map(item => ({
        title: item.headline,
        url: item.sourceUrl,
        publisher: "Source",
        date: item.publishedAt ? new Date(item.publishedAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        citation: `${item.headline}. Retrieved from ${item.sourceUrl}`,
      }));

      const [newArticle] = await db.insert(newsArticles).values({
        slug: generateSlug(generatedArticle.headline),
        headline: generatedArticle.headline,
        executiveSummary: generatedArticle.executiveSummary,
        content: generatedArticle.content,
        blogType: this.getBlogType(slot.contentType),
        capitalType: generatedArticle.capitalType,
        capitalStage: generatedArticle.capitalStage,
        geography: generatedArticle.geography,
        eventType: generatedArticle.eventType,
        tags: generatedArticle.tags,
        sources: sources,
        confidenceScore: 0.8,
        aiModel: "mistral",
        generationTimeMs: generatedArticle.generationTimeMs,
        wordCount: generatedArticle.wordCount,
        status: "published",
        publishedAt: new Date(),
        scheduledSlot: slot.slot,
        sourceItemIds: approvedItems.map(i => i.id),
      }).returning();

      await db.update(newsScheduledPosts)
        .set({ 
          status: "published",
          articleId: newArticle.id,
          publishedAt: new Date(),
        })
        .where(eq(newsScheduledPosts.id, slot.id));

      for (const item of approvedItems) {
        await db.update(newsSourceItems)
          .set({ validationStatus: "used" })
          .where(eq(newsSourceItems.id, item.id));
      }

      await this.logAction(newArticle.id, slot.id, "publisher", "publish", "completed", {
        headline: generatedArticle.headline,
        wordCount: generatedArticle.wordCount,
        tokensUsed: generatedArticle.tokensUsed,
        durationMs: Date.now() - startTime,
      });

      console.log(`[Scheduler] Published article: ${generatedArticle.headline}`);
      return true;
    } catch (error) {
      console.error("[Scheduler] Error processing slot:", error);
      await db.update(newsScheduledPosts)
        .set({ 
          status: "pending",
          skipReason: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(newsScheduledPosts.id, slot.id));
      return false;
    }
  }

  private getBlogType(contentType: string): string {
    // Direct mapping - new categories are the blog types
    const types: Record<string, string> = {
      insights: "Insights",
      trends: "Trends",
      guides: "Guides",
      analysis: "Analysis",
    };
    return types[contentType] || "Insights";
  }

  private filterByContentType(
    items: typeof newsSourceItems.$inferSelect[],
    contentType: string
  ): typeof newsSourceItems.$inferSelect[] {
    // New content categories with appropriate keywords for each type
    const contentTypeRules: Record<string, {
      requiredKeywords: string[];
      excludeKeywords: string[];
      minKeywordMatches: number;
    }> = {
      insights: {
        // Quick news bites, funding announcements, regulatory updates
        requiredKeywords: ["raised", "funding", "investment", "announces", "launches", "closes", "secured", "valued", "sec", "regulation", "compliance", "regulatory"],
        excludeKeywords: [],
        minKeywordMatches: 1,
      },
      trends: {
        // Market movements, emerging patterns, sector developments
        requiredKeywords: ["trend", "growth", "rising", "market", "sector", "industry", "emerging", "shifting", "momentum", "surge", "decline", "forecast"],
        excludeKeywords: [],
        minKeywordMatches: 1,
      },
      guides: {
        // Educational content, how-to, best practices
        requiredKeywords: ["how to", "guide", "best practice", "strategy", "playbook", "framework", "approach", "methodology", "steps", "tips", "lessons", "learn"],
        excludeKeywords: [],
        minKeywordMatches: 1,
      },
      analysis: {
        // Deep dives, market analysis, deal breakdowns
        requiredKeywords: ["analysis", "deep dive", "breakdown", "examination", "review", "assessment", "evaluation", "outlook", "comprehensive", "detailed", "m&a", "acquisition", "merger"],
        excludeKeywords: [],
        minKeywordMatches: 1,
      },
    };

    const rules = contentTypeRules[contentType] || contentTypeRules.insights;
    
    return items.filter(item => {
      const text = `${item.headline} ${item.summary || ""}`.toLowerCase();
      
      const excludeMatch = rules.excludeKeywords.some(kw => text.includes(kw));
      if (excludeMatch) return false;
      
      let matchCount = 0;
      for (const kw of rules.requiredKeywords) {
        if (text.includes(kw)) matchCount++;
      }
      
      const passes = matchCount >= rules.minKeywordMatches;
      
      if (passes) {
        console.log(`[Scheduler] Item matched ${contentType}: "${item.headline.substring(0, 60)}..." (${matchCount} keyword matches)`);
      }
      
      return passes;
    });
  }

  async runScheduledTasks(): Promise<{ slotsCreated: number; articlesPublished: number }> {
    const slotsCreated = await this.createDailySchedule();
    
    let articlesPublished = 0;
    let slot = await this.getNextPendingSlot();
    
    while (slot) {
      const success = await this.processScheduledSlot(slot);
      if (success) {
        articlesPublished++;
      }
      slot = await this.getNextPendingSlot();
    }

    return { slotsCreated, articlesPublished };
  }

  async getScheduleStatus(date?: Date): Promise<{
    date: string;
    slots: Array<{
      slot: string;
      contentType: string;
      status: string;
      articleId?: string;
      headline?: string;
    }>;
  }> {
    const dateStr = (date || new Date()).toISOString().split("T")[0];
    
    const slots = await db.select()
      .from(newsScheduledPosts)
      .where(eq(newsScheduledPosts.scheduledDate, dateStr))
      .orderBy(newsScheduledPosts.slot);

    const result = [];
    for (const slot of slots) {
      let headline: string | undefined;
      if (slot.articleId) {
        const [article] = await db.select()
          .from(newsArticles)
          .where(eq(newsArticles.id, slot.articleId))
          .limit(1);
        headline = article?.headline;
      }

      result.push({
        slot: slot.slot,
        contentType: slot.contentType,
        status: slot.status || "pending",
        articleId: slot.articleId || undefined,
        headline,
      });
    }

    return { date: dateStr, slots: result };
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
        tokensUsed: data.tokensUsed || null,
      });
    } catch (error) {
      console.error("[Scheduler] Failed to log action:", error);
    }
  }
}

export const newsroomScheduler = new NewsroomSchedulerService();
