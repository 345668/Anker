function log(message: string, source: string = "web-crawler") {
  console.log(`[${source}] ${message}`);
}

interface CrawlResult {
  url: string;
  title: string | null;
  description: string | null;
  content: string | null;
  error: string | null;
  success: boolean;
}

interface CompanyInfo {
  name: string | null;
  description: string | null;
  sectors: string[];
  investmentFocus: string[];
  investmentStages: string[];
  aum: string | null;
  typicalCheckSize: string | null;
  location: string | null;
  foundingYear: string | null;
  teamSize: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  contactEmail: string | null;
  portfolioCompanies: string[];
  keyPeople: Array<{ name: string; title: string }>;
  rawContent: string;
}

class WebCrawlerService {
  private userAgent = "Mozilla/5.0 (compatible; AnkerBot/1.0; +https://anker.vc)";
  private maxContentLength = 50000;

  async crawlUrl(url: string, timeout = 15000): Promise<CrawlResult> {
    const result: CrawlResult = {
      url,
      title: null,
      description: null,
      content: null,
      error: null,
      success: false,
    };

    try {
      if (!url || !this.isValidUrl(url)) {
        result.error = "Invalid URL";
        return result;
      }

      const normalizedUrl = this.normalizeUrl(url);
      log(`Crawling: ${normalizedUrl}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(normalizedUrl, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        result.error = `HTTP ${response.status}: ${response.statusText}`;
        return result;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        result.error = `Unsupported content type: ${contentType}`;
        return result;
      }

      const html = await response.text();
      const truncatedHtml = html.substring(0, this.maxContentLength);

      result.title = this.extractTitle(truncatedHtml);
      result.description = this.extractMetaDescription(truncatedHtml);
      result.content = this.extractTextContent(truncatedHtml);
      result.success = true;

      log(`Successfully crawled: ${normalizedUrl} (${result.content?.length || 0} chars)`);

    } catch (error: any) {
      if (error.name === "AbortError") {
        result.error = "Request timed out";
      } else {
        result.error = error.message || "Unknown error";
      }
      log(`Error crawling ${url}: ${result.error}`);
    }

    return result;
  }

  async crawlCompanyWebsite(url: string): Promise<CompanyInfo | null> {
    const crawlResult = await this.crawlUrl(url);
    
    if (!crawlResult.success || !crawlResult.content) {
      log(`Failed to crawl company website: ${url}`);
      return null;
    }

    const info: CompanyInfo = {
      name: crawlResult.title,
      description: crawlResult.description,
      sectors: [],
      investmentFocus: [],
      investmentStages: [],
      aum: null,
      typicalCheckSize: null,
      location: null,
      foundingYear: null,
      teamSize: null,
      linkedinUrl: null,
      twitterUrl: null,
      contactEmail: null,
      portfolioCompanies: [],
      keyPeople: [],
      rawContent: crawlResult.content,
    };

    info.sectors = this.extractSectors(crawlResult.content);
    info.investmentStages = this.extractInvestmentStages(crawlResult.content);
    info.aum = this.extractAUM(crawlResult.content);
    info.typicalCheckSize = this.extractCheckSize(crawlResult.content);
    info.location = this.extractLocation(crawlResult.content);
    info.foundingYear = this.extractFoundingYear(crawlResult.content);
    info.contactEmail = this.extractEmail(crawlResult.content);
    info.linkedinUrl = this.extractLinkedInUrl(crawlResult.content);
    info.twitterUrl = this.extractTwitterUrl(crawlResult.content);

    return info;
  }

  async crawlMultiplePages(baseUrl: string, paths: string[] = ["/", "/about", "/team", "/portfolio", "/focus", "/contact"]): Promise<string> {
    const allContent: string[] = [];
    const baseUrlObj = new URL(this.normalizeUrl(baseUrl));

    for (const path of paths) {
      try {
        const fullUrl = new URL(path, baseUrlObj.origin).toString();
        const result = await this.crawlUrl(fullUrl, 10000);
        if (result.success && result.content) {
          allContent.push(`=== ${path} ===\n${result.content}`);
        }
      } catch (error) {
        continue;
      }
    }

    return allContent.join("\n\n").substring(0, this.maxContentLength * 2);
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  private normalizeUrl(url: string): string {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    return url;
  }

  private extractTitle(html: string): string | null {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return titleMatch ? this.decodeHtmlEntities(titleMatch[1].trim()) : null;
  }

  private extractMetaDescription(html: string): string | null {
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) ||
                      html.match(/<meta[^>]*content=["']([^"']*)[^>]*name=["']description["']/i);
    return descMatch ? this.decodeHtmlEntities(descMatch[1].trim()) : null;
  }

  private extractTextContent(html: string): string {
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return this.decodeHtmlEntities(text).substring(0, this.maxContentLength);
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/");
  }

  private extractSectors(content: string): string[] {
    const sectors: Set<string> = new Set();
    const lower = content.toLowerCase();

    const sectorKeywords: Record<string, string[]> = {
      "Entertainment": ["film", "movie", "cinema", "media", "entertainment", "streaming", "content", "studio", "production"],
      "Real Estate": ["real estate", "property", "commercial real estate", "residential", "multifamily", "reit", "development"],
      "FinTech": ["fintech", "financial technology", "payments", "banking", "insurtech"],
      "Healthcare": ["healthcare", "healthtech", "biotech", "medtech", "digital health", "life sciences"],
      "SaaS": ["saas", "software as a service", "enterprise software", "b2b software"],
      "AI/ML": ["artificial intelligence", "machine learning", "ai", "deep learning"],
      "Climate": ["climate", "cleantech", "sustainability", "renewable", "clean energy", "green"],
      "Consumer": ["consumer", "b2c", "e-commerce", "retail", "marketplace", "direct-to-consumer", "dtc"],
      "Crypto/Web3": ["crypto", "blockchain", "web3", "defi", "nft"],
      "EdTech": ["edtech", "education", "learning", "online education"],
      "FoodTech": ["foodtech", "agtech", "agriculture", "food", "beverage"],
      "Mobility": ["mobility", "transportation", "automotive", "electric vehicle", "ev"],
      "PropTech": ["proptech", "property technology", "real estate tech"],
    };

    for (const [sector, keywords] of Object.entries(sectorKeywords)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          sectors.add(sector);
          break;
        }
      }
    }

    return Array.from(sectors);
  }

  private extractInvestmentStages(content: string): string[] {
    const stages: Set<string> = new Set();
    const lower = content.toLowerCase();

    const stagePatterns: Record<string, string[]> = {
      "Pre-seed": ["pre-seed", "pre seed", "preseed"],
      "Seed": ["seed stage", "seed round", "seed funding", "seed investment"],
      "Series A": ["series a", "series-a"],
      "Series B": ["series b", "series-b"],
      "Series C": ["series c", "series-c"],
      "Growth": ["growth stage", "growth equity", "late stage", "expansion"],
      "Early Stage": ["early stage", "early-stage"],
    };

    for (const [stage, patterns] of Object.entries(stagePatterns)) {
      for (const pattern of patterns) {
        if (lower.includes(pattern)) {
          stages.add(stage);
          break;
        }
      }
    }

    return Array.from(stages);
  }

  private extractAUM(content: string): string | null {
    const aumPatterns = [
      /(?:aum|assets under management|fund size|total capital)[:\s]*(?:of\s+)?(?:approximately\s+)?(?:over\s+)?(?:more than\s+)?\$?([\d,.]+)\s*(million|billion|m|b|mn|bn)/i,
      /\$?([\d,.]+)\s*(million|billion|m|b|mn|bn)\s+(?:aum|assets under management|fund|capital)/i,
      /(?:managing|manages|invested)\s+(?:over\s+)?\$?([\d,.]+)\s*(million|billion|m|b|mn|bn)/i,
    ];

    for (const pattern of aumPatterns) {
      const match = content.match(pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ""));
        const unit = match[2].toLowerCase();
        if (unit.startsWith("b")) {
          return `$${amount}B`;
        } else {
          return `$${amount}M`;
        }
      }
    }

    return null;
  }

  private extractCheckSize(content: string): string | null {
    const checkSizePatterns = [
      /(?:check size|investment size|typical investment|invest(?:s|ing)?)[:\s]*(?:of\s+)?(?:between\s+)?\$?([\d,.]+)(?:k|m|K|M)?\s*(?:to|-|–)\s*\$?([\d,.]+)\s*(k|m|K|M|thousand|million)/i,
      /\$?([\d,.]+)\s*(?:to|-|–)\s*\$?([\d,.]+)\s*(k|m|K|M|thousand|million)\s+(?:check|investment)/i,
    ];

    for (const pattern of checkSizePatterns) {
      const match = content.match(pattern);
      if (match) {
        return `$${match[1]}-${match[2]}${match[3].toUpperCase()}`;
      }
    }

    return null;
  }

  private extractLocation(content: string): string | null {
    const locationPatterns = [
      /(?:headquartered|based|located|offices?)\s+(?:in\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:,\s*[A-Z]{2})?)/,
      /([A-Z][a-z]+(?:,\s*(?:CA|NY|TX|FL|MA|WA|CO|IL|PA|GA|NC|NJ|VA|AZ|TN|MN|MD|WI|MO|IN|OH|MI|OR)))/,
    ];

    for (const pattern of locationPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  private extractFoundingYear(content: string): string | null {
    const yearPatterns = [
      /(?:founded|established|since|started)\s+(?:in\s+)?(19\d{2}|20[0-2]\d)/i,
      /since\s+(19\d{2}|20[0-2]\d)/i,
    ];

    for (const pattern of yearPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  private extractEmail(content: string): string | null {
    const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return emailMatch ? emailMatch[0] : null;
  }

  private extractLinkedInUrl(content: string): string | null {
    const linkedinMatch = content.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9_-]+\/?/i);
    return linkedinMatch ? linkedinMatch[0] : null;
  }

  private extractTwitterUrl(content: string): string | null {
    const twitterMatch = content.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/?/i);
    return twitterMatch ? twitterMatch[0] : null;
  }
}

export const webCrawlerService = new WebCrawlerService();
export type { CrawlResult, CompanyInfo };
