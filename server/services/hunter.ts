function log(message: string, source: string = "hunter") {
  console.log(`[${source}] ${message}`);
}

const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const HUNTER_BASE_URL = "https://api.hunter.io/v2";

export interface HunterEmailResult {
  email: string;
  score: number;
  domain: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  company?: string;
  sources?: Array<{
    domain: string;
    uri: string;
    extracted_on: string;
  }>;
}

export interface HunterDomainSearchResult {
  domain: string;
  organization: string;
  emails: HunterEmailResult[];
  pattern?: string;
}

export interface HunterEmailVerification {
  email: string;
  status: "valid" | "invalid" | "accept_all" | "webmail" | "disposable" | "unknown";
  score: number;
  result: "deliverable" | "undeliverable" | "risky" | "unknown";
  regexp: boolean;
  gibberish: boolean;
  disposable: boolean;
  webmail: boolean;
  mx_records: boolean;
  smtp_server: boolean;
  smtp_check: boolean;
  accept_all: boolean;
  block: boolean;
}

export interface HunterPersonInfo {
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  position?: string;
  twitter?: string;
  linkedin_url?: string;
  phone_number?: string;
  company?: string;
  country?: string;
}

export interface HunterCompanyInfo {
  name: string;
  domain: string;
  industry?: string;
  type?: string;
  country?: string;
  state?: string;
  city?: string;
  postal_code?: string;
  street?: string;
  employees?: number;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  description?: string;
}

class HunterService {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = HUNTER_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async makeRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    if (!this.apiKey) {
      log("Hunter API key not configured", "hunter");
      return null;
    }

    const url = new URL(`${HUNTER_BASE_URL}${endpoint}`);
    url.searchParams.set("api_key", this.apiKey);
    
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    try {
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        const errorText = await response.text();
        log(`Hunter API error: ${response.status} - ${errorText}`, "hunter");
        return null;
      }

      const data = await response.json();
      return data.data as T;
    } catch (error) {
      log(`Hunter API request failed: ${error instanceof Error ? error.message : "Unknown error"}`, "hunter");
      return null;
    }
  }

  async findEmail(
    domain: string,
    firstName?: string,
    lastName?: string
  ): Promise<HunterEmailResult | null> {
    if (!domain) {
      return null;
    }

    const params: Record<string, string> = { domain };
    if (firstName) params.first_name = firstName;
    if (lastName) params.last_name = lastName;

    const result = await this.makeRequest<HunterEmailResult>("/email-finder", params);
    
    if (result && result.email) {
      log(`Found email for ${firstName} ${lastName} at ${domain}: ${result.email}`, "hunter");
      return result;
    }

    return null;
  }

  async searchDomain(domain: string, limit: number = 10): Promise<HunterDomainSearchResult | null> {
    if (!domain) {
      return null;
    }

    const result = await this.makeRequest<HunterDomainSearchResult>("/domain-search", {
      domain,
      limit: limit.toString(),
    });

    if (result) {
      log(`Found ${result.emails?.length || 0} emails at ${domain}`, "hunter");
      return result;
    }

    return null;
  }

  async verifyEmail(email: string): Promise<HunterEmailVerification | null> {
    if (!email) {
      return null;
    }

    const result = await this.makeRequest<HunterEmailVerification>("/email-verifier", { email });
    
    if (result) {
      log(`Verified email ${email}: ${result.result} (score: ${result.score})`, "hunter");
      return result;
    }

    return null;
  }

  async findPerson(email: string): Promise<HunterPersonInfo | null> {
    if (!email) {
      return null;
    }

    const result = await this.makeRequest<HunterPersonInfo>("/people/find", { email });
    
    if (result) {
      log(`Found person info for ${email}`, "hunter");
      return result;
    }

    return null;
  }

  async findCompany(domain: string): Promise<HunterCompanyInfo | null> {
    if (!domain) {
      return null;
    }

    const result = await this.makeRequest<HunterCompanyInfo>("/companies/find", { domain });
    
    if (result) {
      log(`Found company info for ${domain}`, "hunter");
      return result;
    }

    return null;
  }

  async getCombinedInfo(email: string): Promise<{
    person: HunterPersonInfo | null;
    company: HunterCompanyInfo | null;
  }> {
    const result = await this.makeRequest<{
      person?: HunterPersonInfo;
      company?: HunterCompanyInfo;
    }>("/combined/find", { email });

    return {
      person: result?.person || null,
      company: result?.company || null,
    };
  }

  extractDomainFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    
    try {
      let cleanUrl = url.trim();
      if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
        cleanUrl = "https://" + cleanUrl;
      }
      const parsed = new URL(cleanUrl);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/i);
      return match ? match[1].replace(/^www\./, "") : null;
    }
  }

  extractDomainFromEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const parts = email.split("@");
    return parts.length === 2 ? parts[1] : null;
  }
}

export const hunterService = new HunterService();
