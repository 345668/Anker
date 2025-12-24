const FOLK_API_BASE = "https://api.folk.app";

interface FolkPerson {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  emails?: Array<{ value: string; type?: string }>;
  phones?: Array<{ value: string; type?: string }>;
  jobTitle?: string;
  company?: string;
  linkedinUrl?: string;
  customFields?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

interface FolkCompany {
  id: string;
  name?: string;
  domain?: string;
  description?: string;
  industry?: string;
  size?: string;
  linkedinUrl?: string;
  customFields?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

interface FolkListResponse<T> {
  data: T[];
  pagination?: {
    nextCursor?: string;
    hasMore?: boolean;
  };
}

class FolkService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.FOLK_API_KEY || "";
  }

  private get headers() {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.apiKey) {
      return { success: false, message: "Folk API key not configured" };
    }

    try {
      const response = await fetch(`${FOLK_API_BASE}/v1/people?limit=1`, {
        headers: this.headers,
      });

      if (response.ok) {
        return { success: true, message: "Connected to Folk CRM successfully" };
      } else {
        const error = await response.text();
        return { success: false, message: `Folk API error: ${response.status} - ${error}` };
      }
    } catch (error: any) {
      return { success: false, message: `Connection error: ${error.message}` };
    }
  }

  async getPeople(cursor?: string, limit: number = 100): Promise<FolkListResponse<FolkPerson>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.append("cursor", cursor);

    const response = await fetch(`${FOLK_API_BASE}/v1/people?${params}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch people: ${response.status}`);
    }

    return response.json();
  }

  async getAllPeople(): Promise<FolkPerson[]> {
    const allPeople: FolkPerson[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getPeople(cursor);
      allPeople.push(...response.data);
      cursor = response.pagination?.nextCursor;
      hasMore = response.pagination?.hasMore ?? false;
    }

    return allPeople;
  }

  async getCompanies(cursor?: string, limit: number = 100): Promise<FolkListResponse<FolkCompany>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.append("cursor", cursor);

    const response = await fetch(`${FOLK_API_BASE}/v1/companies?${params}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch companies: ${response.status}`);
    }

    return response.json();
  }

  async getAllCompanies(): Promise<FolkCompany[]> {
    const allCompanies: FolkCompany[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getCompanies(cursor);
      allCompanies.push(...response.data);
      cursor = response.pagination?.nextCursor;
      hasMore = response.pagination?.hasMore ?? false;
    }

    return allCompanies;
  }

  async createPerson(data: Partial<FolkPerson>): Promise<FolkPerson> {
    const response = await fetch(`${FOLK_API_BASE}/v1/people`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create person: ${response.status}`);
    }

    return response.json();
  }

  async updatePerson(id: string, data: Partial<FolkPerson>): Promise<FolkPerson> {
    const response = await fetch(`${FOLK_API_BASE}/v1/people/${id}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to update person: ${response.status}`);
    }

    return response.json();
  }

  async createCompany(data: Partial<FolkCompany>): Promise<FolkCompany> {
    const response = await fetch(`${FOLK_API_BASE}/v1/companies`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create company: ${response.status}`);
    }

    return response.json();
  }

  async updateCompany(id: string, data: Partial<FolkCompany>): Promise<FolkCompany> {
    const response = await fetch(`${FOLK_API_BASE}/v1/companies/${id}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to update company: ${response.status}`);
    }

    return response.json();
  }
}

export const folkService = new FolkService();
export type { FolkPerson, FolkCompany };
