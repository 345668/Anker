import { db } from "../db";
import { researchOrganizations, researchDocuments, documentChunks, researchCrawlLogs } from "@shared/schema";
import type { InsertResearchDocument, InsertDocumentChunk } from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import crypto from "crypto";

interface CrawlPolicy {
  allowPaths: string[];
  denyPaths: string[];
  maxDepth: number;
  rateLimit: number;
  obeyRobotsTxt: boolean;
  noLoginBypass: boolean;
  noPaywallBypass: boolean;
}

interface ConsultingFirmConfig {
  name: string;
  slug: string;
  orgType: string;
  tier: string;
  trustWeight: number;
  website: string;
  crawlPolicy: CrawlPolicy;
  rssFeeds?: string[];
  publicationsPath: string;
}

const CONSULTING_FIRMS: ConsultingFirmConfig[] = [
  {
    name: "McKinsey & Company",
    slug: "mckinsey",
    orgType: "consulting",
    tier: "tier1_consulting",
    trustWeight: 0.95,
    website: "https://www.mckinsey.com",
    publicationsPath: "/capabilities/growth-marketing-and-sales/our-insights",
    crawlPolicy: {
      allowPaths: ["/capabilities", "/industries", "/featured-insights", "/quarterly"],
      denyPaths: ["/careers", "/about-us", "/contact", "/alumni", "/subscribe", "/login"],
      maxDepth: 2,
      rateLimit: 20,
      obeyRobotsTxt: true,
      noLoginBypass: true,
      noPaywallBypass: true,
    },
    rssFeeds: ["https://www.mckinsey.com/rss/insight_and_publications/latest"],
  },
  {
    name: "Boston Consulting Group",
    slug: "bcg",
    orgType: "consulting",
    tier: "tier1_consulting",
    trustWeight: 0.95,
    website: "https://www.bcg.com",
    publicationsPath: "/publications",
    crawlPolicy: {
      allowPaths: ["/publications", "/industries", "/capabilities"],
      denyPaths: ["/careers", "/about", "/contact", "/subscribe", "/login", "/alumni"],
      maxDepth: 2,
      rateLimit: 20,
      obeyRobotsTxt: true,
      noLoginBypass: true,
      noPaywallBypass: true,
    },
  },
  {
    name: "Bain & Company",
    slug: "bain",
    orgType: "consulting",
    tier: "tier1_consulting",
    trustWeight: 0.95,
    website: "https://www.bain.com",
    publicationsPath: "/insights",
    crawlPolicy: {
      allowPaths: ["/insights", "/industry-expertise", "/capabilities"],
      denyPaths: ["/careers", "/about", "/contact", "/subscribe", "/login", "/alumni"],
      maxDepth: 2,
      rateLimit: 20,
      obeyRobotsTxt: true,
      noLoginBypass: true,
      noPaywallBypass: true,
    },
  },
  {
    name: "Deloitte",
    slug: "deloitte",
    orgType: "audit",
    tier: "tier2_big4",
    trustWeight: 0.85,
    website: "https://www2.deloitte.com",
    publicationsPath: "/insights",
    crawlPolicy: {
      allowPaths: ["/insights", "/content/dam/Deloitte/global"],
      denyPaths: ["/careers", "/about", "/contact", "/subscribe", "/login", "/alumni", "/services"],
      maxDepth: 2,
      rateLimit: 15,
      obeyRobotsTxt: true,
      noLoginBypass: true,
      noPaywallBypass: true,
    },
  },
  {
    name: "PwC",
    slug: "pwc",
    orgType: "audit",
    tier: "tier2_big4",
    trustWeight: 0.85,
    website: "https://www.pwc.com",
    publicationsPath: "/gx/en/issues.html",
    crawlPolicy: {
      allowPaths: ["/gx/en/issues", "/gx/en/industries", "/gx/en/insights"],
      denyPaths: ["/careers", "/about", "/contact", "/subscribe", "/login", "/alumni", "/services"],
      maxDepth: 2,
      rateLimit: 15,
      obeyRobotsTxt: true,
      noLoginBypass: true,
      noPaywallBypass: true,
    },
  },
  {
    name: "KPMG",
    slug: "kpmg",
    orgType: "audit",
    tier: "tier2_big4",
    trustWeight: 0.85,
    website: "https://kpmg.com",
    publicationsPath: "/xx/en/home/insights.html",
    crawlPolicy: {
      allowPaths: ["/home/insights", "/home/industries"],
      denyPaths: ["/careers", "/about", "/contact", "/subscribe", "/login", "/alumni", "/services"],
      maxDepth: 2,
      rateLimit: 15,
      obeyRobotsTxt: true,
      noLoginBypass: true,
      noPaywallBypass: true,
    },
  },
  {
    name: "Ernst & Young",
    slug: "ey",
    orgType: "audit",
    tier: "tier2_big4",
    trustWeight: 0.85,
    website: "https://www.ey.com",
    publicationsPath: "/en_gl/insights",
    crawlPolicy: {
      allowPaths: ["/en_gl/insights", "/en_gl/industries"],
      denyPaths: ["/careers", "/about", "/contact", "/subscribe", "/login", "/alumni", "/services"],
      maxDepth: 2,
      rateLimit: 15,
      obeyRobotsTxt: true,
      noLoginBypass: true,
      noPaywallBypass: true,
    },
  },
];

class ResearchCrawlerService {
  private robotsTxtCache: Map<string, { rules: string[]; fetched: Date }> = new Map();
  private requestTimestamps: Map<string, number[]> = new Map();

  async initializeOrganizations(): Promise<number> {
    let created = 0;
    for (const firm of CONSULTING_FIRMS) {
      const existing = await db.select()
        .from(researchOrganizations)
        .where(eq(researchOrganizations.slug, firm.slug))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(researchOrganizations).values({
          name: firm.name,
          slug: firm.slug,
          orgType: firm.orgType,
          tier: firm.tier,
          trustWeight: firm.trustWeight,
          officialWebsite: firm.website,
          verifiedWebsite: firm.website,
          websiteConfidence: 1.0,
          crawlPolicy: firm.crawlPolicy,
          isActive: true,
        });
        created++;
      }
    }
    return created;
  }

  async getOrganizations() {
    return db.select().from(researchOrganizations).where(eq(researchOrganizations.isActive, true));
  }

  private async checkRateLimit(domain: string, rateLimit: number): Promise<boolean> {
    const now = Date.now();
    const timestamps = this.requestTimestamps.get(domain) || [];
    const windowStart = now - 60000;
    const recentRequests = timestamps.filter(t => t > windowStart);
    
    if (recentRequests.length >= rateLimit) {
      return false;
    }
    
    recentRequests.push(now);
    this.requestTimestamps.set(domain, recentRequests);
    return true;
  }

  private async fetchRobotsTxt(baseUrl: string): Promise<string[]> {
    const cached = this.robotsTxtCache.get(baseUrl);
    if (cached && Date.now() - cached.fetched.getTime() < 3600000) {
      return cached.rules;
    }

    try {
      const response = await fetch(`${baseUrl}/robots.txt`, {
        headers: { "User-Agent": "AnkerResearchCrawler/1.0 (Research Intelligence)" },
      });
      
      if (!response.ok) {
        return [];
      }
      
      const text = await response.text();
      const disallowRules = text
        .split("\n")
        .filter(line => line.toLowerCase().startsWith("disallow:"))
        .map(line => line.replace(/disallow:\s*/i, "").trim());
      
      this.robotsTxtCache.set(baseUrl, { rules: disallowRules, fetched: new Date() });
      return disallowRules;
    } catch {
      return [];
    }
  }

  async isUrlAllowed(url: string, policy: CrawlPolicy): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const parsedUrl = new URL(url);
      const path = parsedUrl.pathname;

      for (const denyPath of policy.denyPaths) {
        if (path.startsWith(denyPath) || path.includes(denyPath)) {
          return { allowed: false, reason: `Path blocked by policy: ${denyPath}` };
        }
      }

      const allowMatch = policy.allowPaths.some(allowPath => 
        path.startsWith(allowPath) || path.includes(allowPath)
      );
      if (!allowMatch && policy.allowPaths.length > 0) {
        return { allowed: false, reason: "Path not in allowed list" };
      }

      if (policy.obeyRobotsTxt) {
        const robotsRules = await this.fetchRobotsTxt(`${parsedUrl.protocol}//${parsedUrl.host}`);
        for (const rule of robotsRules) {
          if (rule && path.startsWith(rule)) {
            return { allowed: false, reason: `Blocked by robots.txt: ${rule}` };
          }
        }
      }

      return { allowed: true };
    } catch (error) {
      return { allowed: false, reason: `Invalid URL: ${error}` };
    }
  }

  async crawlOrganization(orgSlug: string): Promise<{ documents: number; errors: string[] }> {
    const org = await db.select()
      .from(researchOrganizations)
      .where(eq(researchOrganizations.slug, orgSlug))
      .limit(1);

    if (org.length === 0) {
      return { documents: 0, errors: [`Organization not found: ${orgSlug}`] };
    }

    const organization = org[0];
    const policy = organization.crawlPolicy as CrawlPolicy;
    const config = CONSULTING_FIRMS.find(f => f.slug === orgSlug);
    
    if (!config) {
      return { documents: 0, errors: [`Configuration not found for: ${orgSlug}`] };
    }

    const errors: string[] = [];
    let documentsFound = 0;

    await db.insert(researchCrawlLogs).values({
      organizationId: organization.id,
      crawlType: "scheduled",
      status: "started",
      startedAt: new Date(),
    });

    if (config.rssFeeds) {
      for (const feedUrl of config.rssFeeds) {
        try {
          const docs = await this.parseRSSFeed(feedUrl, organization.id, config.slug);
          documentsFound += docs;
        } catch (error) {
          errors.push(`RSS error for ${feedUrl}: ${error}`);
        }
      }
    }

    const publicationsUrl = `${config.website}${config.publicationsPath}`;
    const { allowed, reason } = await this.isUrlAllowed(publicationsUrl, policy);
    
    if (allowed) {
      const domain = new URL(config.website).host;
      if (await this.checkRateLimit(domain, policy.rateLimit)) {
        try {
          const docs = await this.scrapePublicationsPage(publicationsUrl, organization.id, config.slug, policy);
          documentsFound += docs;
        } catch (error) {
          errors.push(`Scrape error for ${publicationsUrl}: ${error}`);
        }
      } else {
        errors.push(`Rate limited for ${domain}`);
      }
    } else {
      errors.push(`URL blocked: ${publicationsUrl} - ${reason}`);
    }

    await db.insert(researchCrawlLogs).values({
      organizationId: organization.id,
      crawlType: "scheduled",
      status: errors.length > 0 ? "completed_with_errors" : "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      documentsFound,
      errors: errors.length > 0 ? errors : null,
    });

    return { documents: documentsFound, errors };
  }

  private async parseRSSFeed(feedUrl: string, organizationId: string, sourceType: string): Promise<number> {
    const response = await fetch(feedUrl, {
      headers: {
        "User-Agent": "AnkerResearchCrawler/1.0 (Research Intelligence)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS: ${response.status}`);
    }

    const xml = await response.text();
    const items = this.parseXMLItems(xml);
    let savedCount = 0;

    for (const item of items) {
      if (item.title && item.link) {
        const hash = crypto.createHash("sha256").update(item.link).digest("hex");
        
        const existing = await db.select()
          .from(researchDocuments)
          .where(eq(researchDocuments.hashSha256, hash))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(researchDocuments).values({
            organizationId,
            sourceType,
            title: item.title,
            documentType: "insight",
            url: item.link,
            hashSha256: hash,
            publicationDate: item.pubDate ? new Date(item.pubDate) : null,
            confidenceScore: this.getTrustWeight(sourceType),
            processingStatus: "pending",
          } as InsertResearchDocument);
          savedCount++;
        }
      }
    }

    return savedCount;
  }

  private parseXMLItems(xml: string): Array<{ title?: string; link?: string; pubDate?: string; description?: string }> {
    const items: Array<{ title?: string; link?: string; pubDate?: string; description?: string }> = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      items.push({
        title: this.extractTag(itemXml, "title"),
        link: this.extractTag(itemXml, "link"),
        pubDate: this.extractTag(itemXml, "pubDate"),
        description: this.extractTag(itemXml, "description"),
      });
    }

    return items;
  }

  private extractTag(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]*)</${tag}>`, "i");
    const match = regex.exec(xml);
    return match ? (match[1] || match[2])?.trim() : undefined;
  }

  private async scrapePublicationsPage(url: string, organizationId: string, sourceType: string, policy: CrawlPolicy): Promise<number> {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "AnkerResearchCrawler/1.0 (Research Intelligence)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();
    const links = this.extractPublicationLinks(html, url);
    let savedCount = 0;

    for (const link of links.slice(0, 20)) {
      const { allowed } = await this.isUrlAllowed(link.url, policy);
      if (!allowed) continue;

      const hash = crypto.createHash("sha256").update(link.url).digest("hex");
      
      const existing = await db.select()
        .from(researchDocuments)
        .where(eq(researchDocuments.hashSha256, hash))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(researchDocuments).values({
          organizationId,
          sourceType,
          title: link.title || "Untitled Document",
          documentType: this.inferDocumentType(link.title || ""),
          url: link.url,
          hashSha256: hash,
          confidenceScore: this.getTrustWeight(sourceType),
          processingStatus: "pending",
        } as InsertResearchDocument);
        savedCount++;
      }
    }

    return savedCount;
  }

  private extractPublicationLinks(html: string, baseUrl: string): Array<{ url: string; title?: string }> {
    const links: Array<{ url: string; title?: string }> = [];
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let match;

    const parsedBase = new URL(baseUrl);
    
    while ((match = linkRegex.exec(html)) !== null) {
      let href = match[1];
      const text = match[2].trim();
      
      if (href.startsWith("/")) {
        href = `${parsedBase.protocol}//${parsedBase.host}${href}`;
      } else if (!href.startsWith("http")) {
        continue;
      }

      if (href.includes(parsedBase.host) && 
          (href.includes("/insight") || href.includes("/publication") || 
           href.includes("/report") || href.includes("/article"))) {
        links.push({ url: href, title: text });
      }
    }

    return links;
  }

  private inferDocumentType(title: string): string {
    const lower = title.toLowerCase();
    if (lower.includes("report")) return "report";
    if (lower.includes("benchmark")) return "benchmark";
    if (lower.includes("analysis")) return "analysis";
    if (lower.includes("whitepaper") || lower.includes("white paper")) return "whitepaper";
    return "insight";
  }

  private getTrustWeight(sourceType: string): number {
    const weights: Record<string, number> = {
      mckinsey: 0.95,
      bcg: 0.95,
      bain: 0.95,
      deloitte: 0.85,
      pwc: 0.85,
      kpmg: 0.85,
      ey: 0.85,
      sec: 0.90,
    };
    return weights[sourceType] || 0.5;
  }

  async processDocument(documentId: string): Promise<{ chunks: number; error?: string }> {
    const doc = await db.select()
      .from(researchDocuments)
      .where(eq(researchDocuments.id, documentId))
      .limit(1);

    if (doc.length === 0) {
      return { chunks: 0, error: "Document not found" };
    }

    const document = doc[0];

    try {
      const response = await fetch(document.url, {
        headers: {
          "User-Agent": "AnkerResearchCrawler/1.0 (Research Intelligence)",
          "Accept": "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        await db.update(researchDocuments)
          .set({ processingStatus: "failed" })
          .where(eq(researchDocuments.id, documentId));
        return { chunks: 0, error: `Failed to fetch: ${response.status}` };
      }

      const html = await response.text();
      const text = this.extractTextContent(html);
      const chunks = this.chunkText(text, 1000, 200);

      for (let i = 0; i < chunks.length; i++) {
        await db.insert(documentChunks).values({
          documentId,
          chunkIndex: i,
          text: chunks[i].text,
          startOffset: chunks[i].start,
          endOffset: chunks[i].end,
          hasMetrics: this.hasMetrics(chunks[i].text),
          hasCitations: this.hasCitations(chunks[i].text),
        } as InsertDocumentChunk);
      }

      await db.update(researchDocuments)
        .set({ processingStatus: "processed" })
        .where(eq(researchDocuments.id, documentId));

      return { chunks: chunks.length };
    } catch (error) {
      await db.update(researchDocuments)
        .set({ processingStatus: "failed" })
        .where(eq(researchDocuments.id, documentId));
      return { chunks: 0, error: `Processing error: ${error}` };
    }
  }

  private extractTextContent(html: string): string {
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");
    
    text = text.replace(/<[^>]+>/g, " ");
    text = text.replace(/&[a-z]+;/gi, " ");
    text = text.replace(/\s+/g, " ").trim();
    
    return text;
  }

  private chunkText(text: string, chunkSize: number, overlap: number): Array<{ text: string; start: number; end: number }> {
    const chunks: Array<{ text: string; start: number; end: number }> = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);
      
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf(".", end);
        const lastNewline = text.lastIndexOf("\n", end);
        const breakPoint = Math.max(lastPeriod, lastNewline);
        if (breakPoint > start + chunkSize / 2) {
          end = breakPoint + 1;
        }
      }

      chunks.push({
        text: text.slice(start, end).trim(),
        start,
        end,
      });

      start = end - overlap;
      if (start >= text.length) break;
    }

    return chunks;
  }

  private hasMetrics(text: string): boolean {
    return /\$[\d,]+|[\d.]+%|CAGR|billion|million|market size/i.test(text);
  }

  private hasCitations(text: string): boolean {
    return /\[\d+\]|\(Source:|according to|study|research|survey/i.test(text);
  }

  async getCrawlStats(): Promise<{
    organizations: number;
    documents: number;
    pendingDocuments: number;
    processedDocuments: number;
    chunks: number;
  }> {
    const [orgs] = await db.select({ count: sql<number>`count(*)` }).from(researchOrganizations);
    const [docs] = await db.select({ count: sql<number>`count(*)` }).from(researchDocuments);
    const [pending] = await db.select({ count: sql<number>`count(*)` })
      .from(researchDocuments)
      .where(eq(researchDocuments.processingStatus, "pending"));
    const [processed] = await db.select({ count: sql<number>`count(*)` })
      .from(researchDocuments)
      .where(eq(researchDocuments.processingStatus, "processed"));
    const [chunkCount] = await db.select({ count: sql<number>`count(*)` }).from(documentChunks);

    return {
      organizations: Number(orgs.count),
      documents: Number(docs.count),
      pendingDocuments: Number(pending.count),
      processedDocuments: Number(processed.count),
      chunks: Number(chunkCount.count),
    };
  }
}

export const researchCrawlerService = new ResearchCrawlerService();
