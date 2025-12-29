import { db } from "../db";
import { newsSources, newsSourceItems, newsGenerationLogs } from "@shared/schema";
import type { NewsSource, InsertNewsSourceItem, InsertNewsGenerationLog } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { newsroomAIService } from "./mistral";

interface RSSItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  content?: string;
  guid?: string;
}

interface ParsedFeed {
  items: RSSItem[];
  title?: string;
  description?: string;
}

class SourceIntelligenceAgent {
  private defaultSources: Array<{
    name: string;
    type: string;
    url: string;
    category: string;
    tier: string;
  }> = [
    // Tier 1 Media
    { name: "Financial Times - Markets", type: "rss", url: "https://www.ft.com/markets?format=rss", category: "tier1_media", tier: "tier1" },
    { name: "Reuters - Deals", type: "rss", url: "https://feeds.reuters.com/reuters/businessNews", category: "tier1_media", tier: "tier1" },
    { name: "Bloomberg", type: "rss", url: "https://feeds.bloomberg.com/markets/news.rss", category: "tier1_media", tier: "tier1" },
    { name: "WSJ - Markets", type: "rss", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", category: "tier1_media", tier: "tier1" },
    
    // VC/PE Media
    { name: "TechCrunch - Startups", type: "rss", url: "https://techcrunch.com/category/startups/feed/", category: "vc_pe_media", tier: "tier1" },
    { name: "Axios Pro Rata", type: "rss", url: "https://www.axios.com/pro/pro-rata/feed", category: "vc_pe_media", tier: "tier1" },
    { name: "PE Hub", type: "rss", url: "https://www.pehub.com/feed/", category: "vc_pe_media", tier: "tier2" },
    { name: "Fortune", type: "rss", url: "https://fortune.com/feed/", category: "tier1_media", tier: "tier1" },
    { name: "Forbes Business", type: "rss", url: "https://www.forbes.com/business/feed/", category: "tier1_media", tier: "tier1" },
    
    // Regulatory
    { name: "SEC Press Releases", type: "rss", url: "https://www.sec.gov/news/pressreleases.rss", category: "regulatory", tier: "tier1" },
    { name: "FCA News", type: "rss", url: "https://www.fca.org.uk/news/rss.xml", category: "regulatory", tier: "tier1" },
    
    // Yahoo Finance (free)
    { name: "Yahoo Finance", type: "rss", url: "https://feeds.finance.yahoo.com/rss/2.0/headline", category: "tier1_media", tier: "tier2" },
    
    // NASDAQ
    { name: "NASDAQ News", type: "rss", url: "https://www.nasdaq.com/feed/rssoutbound", category: "tier1_media", tier: "tier2" },
  ];

  async initializeDefaultSources(): Promise<number> {
    let count = 0;
    for (const source of this.defaultSources) {
      const existing = await db.select()
        .from(newsSources)
        .where(eq(newsSources.url, source.url))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(newsSources).values({
          name: source.name,
          type: source.type,
          url: source.url,
          category: source.category,
          tier: source.tier,
          isActive: true,
          fetchInterval: 3600,
        });
        count++;
      }
    }
    return count;
  }

  async parseRSSFeed(url: string): Promise<ParsedFeed | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "AnkerNewsroom/1.0 (Private Capital Intelligence)",
          "Accept": "application/rss+xml, application/xml, text/xml",
        },
      });

      if (!response.ok) {
        console.error(`[SourceAgent] Failed to fetch RSS: ${url} - ${response.status}`);
        return null;
      }

      const xml = await response.text();
      return this.parseXML(xml);
    } catch (error) {
      console.error(`[SourceAgent] Error fetching RSS ${url}:`, error);
      return null;
    }
  }

  private parseXML(xml: string): ParsedFeed {
    const items: RSSItem[] = [];
    
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      
      const title = this.extractTag(itemXml, "title");
      const link = this.extractTag(itemXml, "link");
      const pubDate = this.extractTag(itemXml, "pubDate");
      const description = this.extractTag(itemXml, "description");
      const content = this.extractTag(itemXml, "content:encoded") || this.extractTag(itemXml, "content");
      const guid = this.extractTag(itemXml, "guid");
      
      if (title && link) {
        items.push({
          title: this.decodeHTMLEntities(title),
          link,
          pubDate,
          description: description ? this.decodeHTMLEntities(this.stripHTML(description)) : undefined,
          content: content ? this.decodeHTMLEntities(content) : undefined,
          guid: guid || link,
        });
      }
    }
    
    const feedTitle = this.extractTag(xml, "channel>title") || this.extractTag(xml, "title");
    const feedDescription = this.extractTag(xml, "channel>description") || this.extractTag(xml, "description");
    
    return {
      items,
      title: feedTitle ? this.decodeHTMLEntities(feedTitle) : undefined,
      description: feedDescription ? this.decodeHTMLEntities(feedDescription) : undefined,
    };
  }

  private extractTag(xml: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>|<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
    const match = xml.match(regex);
    return match ? (match[1] || match[2])?.trim() : undefined;
  }

  private decodeHTMLEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  }

  private stripHTML(html: string): string {
    return html.replace(/<[^>]*>/g, "").trim();
  }

  async fetchFromSource(source: NewsSource): Promise<number> {
    const startTime = Date.now();
    let itemsCreated = 0;

    try {
      await this.logAction(null, null, "source_intelligence", "fetch", "started", {
        sourceId: source.id,
        sourceName: source.name,
      });

      if (source.type === "rss") {
        const feed = await this.parseRSSFeed(source.url);
        if (!feed) {
          await this.updateSourceError(source.id, "Failed to parse RSS feed");
          return 0;
        }

        const freshnessThreshold = new Date();
        freshnessThreshold.setHours(freshnessThreshold.getHours() - 72);

        for (const item of feed.items) {
          const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
          
          if (pubDate < freshnessThreshold) {
            continue;
          }

          const existing = await db.select()
            .from(newsSourceItems)
            .where(and(
              eq(newsSourceItems.sourceId, source.id),
              eq(newsSourceItems.externalId, item.guid || item.link)
            ))
            .limit(1);

          if (existing.length > 0) {
            continue;
          }

          const summary = item.description || "";
          const entities = await newsroomAIService.extractEntities(`${item.title}. ${summary}`);

          const newItem: InsertNewsSourceItem = {
            sourceId: source.id,
            externalId: item.guid || item.link,
            headline: item.title,
            summary: summary.substring(0, 1000),
            content: item.content?.substring(0, 5000),
            sourceUrl: item.link,
            publishedAt: pubDate,
            entities: entities,
            validationStatus: "pending",
          };

          await db.insert(newsSourceItems).values(newItem);
          itemsCreated++;
        }
      }

      await db.update(newsSources)
        .set({
          lastFetchedAt: new Date(),
          itemsFetched: (source.itemsFetched || 0) + itemsCreated,
          errorCount: 0,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(newsSources.id, source.id));

      await this.logAction(null, null, "source_intelligence", "fetch", "completed", {
        sourceId: source.id,
        sourceName: source.name,
        itemsCreated,
        durationMs: Date.now() - startTime,
      });

      return itemsCreated;
    } catch (error) {
      await this.updateSourceError(source.id, error instanceof Error ? error.message : "Unknown error");
      await this.logAction(null, null, "source_intelligence", "fetch", "failed", {
        sourceId: source.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return 0;
    }
  }

  async fetchAllActiveSources(): Promise<{ total: number; successful: number; itemsCreated: number }> {
    // Only fetch from sources that are both active AND enabled (admin toggle)
    const sources = await db.select()
      .from(newsSources)
      .where(and(
        eq(newsSources.isActive, true),
        eq(newsSources.isEnabled, true)
      ));

    let successful = 0;
    let totalItemsCreated = 0;

    for (const source of sources) {
      const lastFetch = source.lastFetchedAt ? new Date(source.lastFetchedAt).getTime() : 0;
      const interval = (source.fetchInterval || 3600) * 1000;
      
      if (Date.now() - lastFetch < interval) {
        continue;
      }

      const itemsCreated = await this.fetchFromSource(source);
      if (itemsCreated >= 0) {
        successful++;
        totalItemsCreated += itemsCreated;
      }
    }

    console.log(`[SourceAgent] Fetched from ${successful}/${sources.length} enabled sources, created ${totalItemsCreated} items`);

    return {
      total: sources.length,
      successful,
      itemsCreated: totalItemsCreated,
    };
  }

  async getPendingItems(limit: number = 20): Promise<typeof newsSourceItems.$inferSelect[]> {
    return db.select()
      .from(newsSourceItems)
      .where(eq(newsSourceItems.validationStatus, "pending"))
      .orderBy(desc(newsSourceItems.createdAt))
      .limit(limit);
  }

  async getApprovedItems(limit: number = 10): Promise<typeof newsSourceItems.$inferSelect[]> {
    return db.select()
      .from(newsSourceItems)
      .where(eq(newsSourceItems.validationStatus, "approved"))
      .orderBy(desc(newsSourceItems.createdAt))
      .limit(limit);
  }

  private async updateSourceError(sourceId: string, error: string): Promise<void> {
    const source = await db.select().from(newsSources).where(eq(newsSources.id, sourceId)).limit(1);
    if (source.length > 0) {
      await db.update(newsSources)
        .set({
          errorCount: (source[0].errorCount || 0) + 1,
          lastError: error,
          updatedAt: new Date(),
        })
        .where(eq(newsSources.id, sourceId));
    }
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
        durationMs: 0,
      });
    } catch (error) {
      console.error("[SourceAgent] Failed to log action:", error);
    }
  }
}

export const sourceIntelligenceAgent = new SourceIntelligenceAgent();
