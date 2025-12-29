import { db } from "../db";
import { newsScheduledPosts, newsArticles, newsSourceItems, newsGenerationLogs } from "@shared/schema";
import type { NewsScheduledPost, NewsSourceItem } from "@shared/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { newsroomAIService } from "./mistral";

interface ScheduleSlot {
  time: string;
  contentType: string;
}

const DAILY_SCHEDULE: ScheduleSlot[] = [
  { time: "08:00", contentType: "macro_regulatory" },
  { time: "12:00", contentType: "vc_growth" },
  { time: "15:00", contentType: "pe_ib_ma" },
  { time: "21:00", contentType: "editorial_deep_dive" },
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
  async createDailySchedule(date: Date = new Date()): Promise<number> {
    const dateStr = date.toISOString().split("T")[0];
    let created = 0;

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
    const todayStr = now.toISOString().split("T")[0];
    const currentHour = now.getHours();
    
    const pendingSlots = await db.select()
      .from(newsScheduledPosts)
      .where(and(
        eq(newsScheduledPosts.scheduledDate, todayStr),
        eq(newsScheduledPosts.status, "pending")
      ))
      .orderBy(newsScheduledPosts.slot);

    for (const slot of pendingSlots) {
      const slotHour = this.getSlotHour(slot.slot);
      if (slotHour <= currentHour) {
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
    const types: Record<string, string> = {
      macro_regulatory: "Insights",
      vc_growth: "Trends",
      pe_ib_ma: "Analysis",
      editorial_deep_dive: "Guides",
    };
    return types[contentType] || "Insights";
  }

  private filterByContentType(
    items: typeof newsSourceItems.$inferSelect[],
    contentType: string
  ): typeof newsSourceItems.$inferSelect[] {
    const contentTypeRules: Record<string, {
      requiredKeywords: string[];
      excludeKeywords: string[];
      minKeywordMatches: number;
    }> = {
      macro_regulatory: {
        requiredKeywords: ["sec", "regulation", "policy", "federal reserve", "interest rate", "inflation", "gdp", "monetary policy", "fiscal", "treasury", "compliance", "regulatory", "central bank", "fed ", "esma", "fca", "dodd-frank", "antitrust"],
        excludeKeywords: ["series a", "series b", "series c", "startup", "unicorn", "funding round", "venture"],
        minKeywordMatches: 2,
      },
      vc_growth: {
        requiredKeywords: ["series a", "series b", "series c", "series d", "seed round", "venture capital", "venture-backed", "vc firm", "startup funding", "growth equity", "fundraising", "pre-seed", "valuation", "unicorn", "funding round", "raised $", "investment round", "early-stage"],
        excludeKeywords: ["private equity", "buyout", "lbo", "leveraged buyout"],
        minKeywordMatches: 1,
      },
      pe_ib_ma: {
        requiredKeywords: ["private equity", "buyout", "acquisition", "merger", "m&a", "lbo", "leveraged", "portfolio company", "exit", "ipo", "investment banking", "deal value", "transaction", "pe firm", "secondary", "sponsor-backed"],
        excludeKeywords: ["series a", "series b", "seed", "venture capital", "vc firm"],
        minKeywordMatches: 1,
      },
      editorial_deep_dive: {
        requiredKeywords: ["analysis", "trend", "outlook", "forecast", "strategy", "insight", "market overview", "industry", "sector report", "quarterly", "annual review", "deep dive", "comprehensive"],
        excludeKeywords: [],
        minKeywordMatches: 1,
      },
    };

    const rules = contentTypeRules[contentType] || contentTypeRules.vc_growth;
    
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
