import { storage } from "../storage";
import type { FolkWorkspace, FolkImportRun, InsertFolkImportRun, InsertFolkFailedRecord } from "@shared/schema";

const FOLK_API_BASE = "https://api.folk.app";

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  minRequestInterval: 200, // Minimum ms between requests
  maxConcurrent: 2, // Max concurrent requests
  maxRetries: 3, // Max retry attempts
  baseRetryDelay: 1000, // Base delay for exponential backoff
  batchSize: 25, // Records to process per batch before progress update
};

// Simple rate limiter
class RateLimiter {
  private lastRequestTime = 0;
  private activeRequests = 0;

  async acquire(): Promise<void> {
    // Wait if too many concurrent requests
    while (this.activeRequests >= RATE_LIMIT_CONFIG.maxConcurrent) {
      await this.sleep(50);
    }

    // Ensure minimum interval between requests
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_CONFIG.minRequestInterval) {
      await this.sleep(RATE_LIMIT_CONFIG.minRequestInterval - timeSinceLastRequest);
    }

    this.activeRequests++;
    this.lastRequestTime = Date.now();
  }

  release(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? RATE_LIMIT_CONFIG.maxRetries;
  const baseDelay = options.baseDelay ?? RATE_LIMIT_CONFIG.baseRetryDelay;
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on 4xx errors (except 429 rate limit)
      if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Global rate limiter instance
const rateLimiter = new RateLimiter();

interface FolkPerson {
  id: string;
  name?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  emails?: Array<{ value: string; type?: string }> | string[];
  phones?: Array<{ value: string; type?: string }> | string[];
  jobTitle?: string;
  company?: string;
  linkedinUrl?: string;
  groups?: FolkGroup[];
  customFields?: Record<string, any>;
  customFieldValues?: Record<string, Record<string, any>>; // Keyed by group ID
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
  emails?: Array<{ value: string; type?: string }> | string[];
  phones?: Array<{ value: string; type?: string }> | string[];
  addresses?: Array<{ value: string; type?: string }> | string[];
  urls?: Array<{ value: string; type?: string }> | string[];
  groups?: FolkGroup[];
  customFields?: Record<string, any>;
  customFieldValues?: Record<string, Record<string, any>>; // Keyed by group ID
  createdAt?: string;
  updatedAt?: string;
}

// Field mapping from Folk custom field names to our database column names
const FOLK_PERSON_FIELD_MAP: Record<string, string> = {
  "First Name": "firstName",
  "Last Name": "lastName",
  "Title": "title",
  "Person Linkedin Url": "personLinkedinUrl",
  "Linkedin": "linkedinUrl",
  "Investor Type": "investorType",
  "Investor State": "investorState",
  "Investor's Country": "investorCountry",
  "Fund HQ": "fundHQ",
  "HQ Location": "hqLocation",
  "Funding Stage": "fundingStage",
  "Typical Investment": "typicalInvestment",
  "Num Lead Investments": "numLeadInvestments",
  "Total Number of Investments": "totalInvestments",
  "Recent Investments": "recentInvestments",
  "Status": "status",
  "Website": "website",
};

const FOLK_COMPANY_FIELD_MAP: Record<string, string> = {
  "Description": "description",
  "Funding raised": "fundingRaised",
  "Last funding date": "lastFundingDate",
  "Foundation year": "foundationYear",
  "Employee range": "employeeRange",
  "Industry": "industry",
  "HQ Location": "hqLocation",
  "Status": "status",
  "Linkedin": "linkedinUrl",
  "Website": "website",
};

// Helper to extract and map custom fields
function mapFolkCustomFields(customFields: Record<string, any> | undefined, fieldMap: Record<string, string>): Record<string, any> {
  const mapped: Record<string, any> = {};
  if (!customFields) return mapped;
  
  for (const [folkField, value] of Object.entries(customFields)) {
    const dbField = fieldMap[folkField];
    if (dbField && value !== null && value !== undefined && value !== "") {
      // Handle different value types
      if (typeof value === "object" && value.value !== undefined) {
        mapped[dbField] = value.value;
      } else if (Array.isArray(value)) {
        mapped[dbField] = value.map(v => typeof v === "object" && v.value !== undefined ? v.value : v).join(", ");
      } else {
        mapped[dbField] = value;
      }
    }
  }
  return mapped;
}

// Normalize field key consistently for matching
function normalizeFieldKeyForMatching(key: string): string {
  return key.toLowerCase().replace(/[\s\-_]+/g, "");
}

// Apply dynamic field mappings from database (cached version for use in loops)
async function loadApprovedMappings(
  groupId: string,
  storageInstance: typeof import("../storage").storage
): Promise<Map<string, { targetColumn: string | null; storeInJson: boolean }>> {
  const mappings = await storageInstance.getFolkFieldMappings(groupId);
  const approvedMappings = mappings.filter(m => m.isApproved);
  const mappingLookup = new Map<string, { targetColumn: string | null; storeInJson: boolean }>();
  
  for (const m of approvedMappings) {
    // Store both normalized and original keys for matching
    const normalizedKey = normalizeFieldKeyForMatching(m.folkFieldKey);
    mappingLookup.set(normalizedKey, {
      targetColumn: m.targetColumn,
      storeInJson: m.storeInJson ?? false,
    });
    // Also store with original key lowercase
    mappingLookup.set(m.folkFieldKey.toLowerCase(), {
      targetColumn: m.targetColumn,
      storeInJson: m.storeInJson ?? false,
    });
  }
  
  return mappingLookup;
}

// Apply mappings to custom fields using pre-loaded lookup
function applyMappingsToFields(
  customFields: Record<string, any>,
  mappingLookup: Map<string, { targetColumn: string | null; storeInJson: boolean }>
): { mapped: Record<string, any>; jsonFields: Record<string, any> } {
  const mapped: Record<string, any> = {};
  const jsonFields: Record<string, any> = {};
  
  if (!customFields || mappingLookup.size === 0) {
    return { mapped, jsonFields: customFields || {} };
  }
  
  for (const [folkField, value] of Object.entries(customFields)) {
    if (value === null || value === undefined || value === "") continue;
    
    // Try both normalized and original lowercase key
    const normalizedKey = normalizeFieldKeyForMatching(folkField);
    const mapping = mappingLookup.get(normalizedKey) || mappingLookup.get(folkField.toLowerCase());
    
    // Extract actual value from complex objects
    let actualValue = value;
    if (typeof value === "object" && value.value !== undefined) {
      actualValue = value.value;
    } else if (Array.isArray(value)) {
      actualValue = value.map(v => typeof v === "object" && v.value !== undefined ? v.value : v).join(", ");
    }
    
    if (mapping && mapping.targetColumn && !mapping.storeInJson) {
      // Map to database column
      mapped[mapping.targetColumn] = actualValue;
    } else {
      // Store in JSON field
      jsonFields[folkField] = actualValue;
    }
  }
  
  return { mapped, jsonFields };
}

interface FolkGroup {
  id: string;
  name: string;
}

interface FolkGroupsResponse {
  data: {
    items: FolkGroup[];
    pagination?: Record<string, any>;
  };
}

interface FolkListResponse<T> {
  data: T[];
  pagination?: {
    nextCursor?: string;
    nextLink?: string;
    hasMore?: boolean;
  };
}

interface FolkApiListResponse<T> {
  data: {
    items: T[];
    pagination?: {
      nextLink?: string;
    };
  };
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ folkId: string; error: string }>;
}

class FolkService {
  private apiKey: string;
  private importStartTimes: Map<string, number> = new Map();
  private processedCounts: Map<string, number[]> = new Map(); // For ETA calculation

  constructor() {
    this.apiKey = process.env.FOLK_API_KEY || "";
  }

  private get headers() {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  // Rate-limited fetch with retry
  private async rateLimitedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    await rateLimiter.acquire();
    try {
      return await withRetry(async () => {
        const response = await fetch(url, {
          ...options,
          headers: { ...this.headers, ...options.headers },
        });
        
        if (!response.ok) {
          const error: any = new Error(`Folk API error: ${response.status}`);
          error.status = response.status;
          throw error;
        }
        
        return response;
      });
    } finally {
      rateLimiter.release();
    }
  }

  // Calculate ETA based on processing speed
  private calculateEta(runId: string, processed: number, total: number): number | null {
    const startTime = this.importStartTimes.get(runId);
    if (!startTime || processed === 0) return null;
    
    const elapsed = Date.now() - startTime;
    const avgTimePerRecord = elapsed / processed;
    const remaining = total - processed;
    
    return Math.round((remaining * avgTimePerRecord) / 1000); // seconds
  }

  // Update import progress
  private async updateProgress(
    runId: string,
    processed: number,
    total: number,
    stage?: string
  ): Promise<void> {
    // Handle edge cases: empty imports or completion
    let progressPercent: number;
    if (total === 0) {
      progressPercent = stage === "completed" ? 100 : 0;
    } else if (processed >= total) {
      progressPercent = 100;
    } else {
      progressPercent = Math.round((processed / total) * 100);
    }
    
    // Calculate ETA, but set to 0 when completed
    let etaSeconds: number | undefined;
    if (stage === "completed" || processed >= total) {
      etaSeconds = 0;
    } else {
      const eta = this.calculateEta(runId, processed, total);
      etaSeconds = eta ?? undefined;
    }
    
    await storage.updateFolkImportRun(runId, {
      processedRecords: processed,
      progressPercent,
      etaSeconds,
      importStage: stage,
    });
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

  // Get all groups/lists from Folk workspace
  async getGroups(): Promise<FolkGroup[]> {
    const response = await fetch(`${FOLK_API_BASE}/v1/groups`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch groups: ${response.status}`);
    }

    const data: FolkGroupsResponse = await response.json();
    return data.data?.items || [];
  }

  // Get custom field definitions for a group
  async getGroupCustomFields(groupId: string, entityType: "person" | "company" = "person"): Promise<any[]> {
    const response = await fetch(
      `${FOLK_API_BASE}/v1/groups/${groupId}/custom-fields/${entityType}`,
      { headers: this.headers }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Folk] Failed to fetch custom fields for group ${groupId}:`, response.status, errorText);
      return []; // Return empty array on error to allow fallback to data analysis
    }

    const apiResponse = await response.json();
    return apiResponse.data?.items || [];
  }

  // Get people from a specific group
  async getPeopleByGroup(groupId: string, cursor?: string, limit: number = 100): Promise<FolkListResponse<FolkPerson>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.append("cursor", cursor);
    // Folk API uses filter query param to get people by group
    params.append("filter[groups][in][id]", groupId);

    const url = `${FOLK_API_BASE}/v1/people?${params}`;
    console.log(`[Folk] Fetching people: ${url}`);
    
    const response = await fetch(url, {
      headers: this.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Folk] API error for group ${groupId}:`, response.status, errorText);
      throw new Error(`Failed to fetch people for group ${groupId}: ${response.status}`);
    }

    // Folk API returns { data: { items: [...], pagination: { nextLink: "..." } } }
    const apiResponse: FolkApiListResponse<FolkPerson> = await response.json();
    
    console.log(`[Folk] People response: ${apiResponse.data?.items?.length || 0} items`);
    
    // Extract cursor from nextLink if present
    let nextCursor: string | undefined;
    if (apiResponse.data.pagination?.nextLink) {
      const url = new URL(apiResponse.data.pagination.nextLink, FOLK_API_BASE);
      nextCursor = url.searchParams.get("cursor") || undefined;
    }
    
    return {
      data: apiResponse.data.items || [],
      pagination: {
        nextCursor,
        hasMore: !!nextCursor,
      },
    };
  }

  // Get all people from a specific group
  async getAllPeopleByGroup(groupId: string): Promise<FolkPerson[]> {
    const allPeople: FolkPerson[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getPeopleByGroup(groupId, cursor);
      allPeople.push(...response.data);
      cursor = response.pagination?.nextCursor;
      hasMore = response.pagination?.hasMore ?? false;
    }

    return allPeople;
  }

  // Get people from a specific group with range selection
  // Supports: first N, last N, or range (start-end)
  async getPeopleByGroupWithRange(
    groupId: string, 
    options: { 
      first?: number; 
      last?: number; 
      start?: number; 
      end?: number;
    }
  ): Promise<{ people: FolkPerson[]; total: number }> {
    // Fetch all people first (Folk API doesn't support offset)
    const allPeople = await this.getAllPeopleByGroup(groupId);
    const total = allPeople.length;
    
    let selectedPeople: FolkPerson[];
    
    if (options.first !== undefined) {
      // First N people
      selectedPeople = allPeople.slice(0, options.first);
    } else if (options.last !== undefined) {
      // Last N people
      selectedPeople = allPeople.slice(-options.last);
    } else if (options.start !== undefined && options.end !== undefined) {
      // Range selection (1-indexed for user-friendliness)
      const startIdx = Math.max(0, options.start - 1);
      const endIdx = Math.min(total, options.end);
      selectedPeople = allPeople.slice(startIdx, endIdx);
    } else {
      // Return all
      selectedPeople = allPeople;
    }
    
    return { people: selectedPeople, total };
  }

  // Count people in a group (without fetching all data)
  async countPeopleInGroup(groupId: string): Promise<number> {
    // Folk API doesn't have a count endpoint, so we need to fetch all
    const allPeople = await this.getAllPeopleByGroup(groupId);
    return allPeople.length;
  }

  // Update person with custom field values (for syncing enriched data back to Folk)
  async updatePersonCustomFields(
    personId: string, 
    groupId: string,
    customFields: Record<string, any>
  ): Promise<FolkPerson> {
    // Build the customFieldValues structure expected by Folk API
    const payload = {
      customFieldValues: {
        [groupId]: customFields
      }
    };

    const response = await this.rateLimitedFetch(
      `${FOLK_API_BASE}/v1/people/${personId}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    );

    return response.json();
  }

  // Bulk update people in Folk (sync enriched data back)
  async bulkSyncToFolk(
    groupId: string,
    updates: Array<{ folkId: string; customFields: Record<string, any> }>
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const result = { success: 0, failed: 0, errors: [] as string[] };
    
    for (const update of updates) {
      try {
        await this.updatePersonCustomFields(update.folkId, groupId, update.customFields);
        result.success++;
      } catch (error: any) {
        result.failed++;
        result.errors.push(`${update.folkId}: ${error.message}`);
      }
    }
    
    return result;
  }

  // Get companies from a specific group  
  async getCompaniesByGroup(groupId: string, cursor?: string, limit: number = 100): Promise<FolkListResponse<FolkCompany>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.append("cursor", cursor);
    // Folk API uses filter query param to get companies by group
    params.append("filter[groups][in][id]", groupId);

    const url = `${FOLK_API_BASE}/v1/companies?${params}`;
    console.log(`[Folk] Fetching companies: ${url}`);
    
    const response = await fetch(url, {
      headers: this.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Folk] API error for companies in group ${groupId}:`, response.status, errorText);
      throw new Error(`Failed to fetch companies for group ${groupId}: ${response.status}`);
    }

    // Folk API returns { data: { items: [...], pagination: { nextLink: "..." } } }
    const apiResponse: FolkApiListResponse<FolkCompany> = await response.json();
    
    console.log(`[Folk] Companies response: ${apiResponse.data?.items?.length || 0} items`);
    
    // Extract cursor from nextLink if present
    let nextCursor: string | undefined;
    if (apiResponse.data.pagination?.nextLink) {
      const url = new URL(apiResponse.data.pagination.nextLink, FOLK_API_BASE);
      nextCursor = url.searchParams.get("cursor") || undefined;
    }
    
    return {
      data: apiResponse.data.items || [],
      pagination: {
        nextCursor,
        hasMore: !!nextCursor,
      },
    };
  }

  // Get all companies from a specific group
  async getAllCompaniesByGroup(groupId: string): Promise<FolkCompany[]> {
    const allCompanies: FolkCompany[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getCompaniesByGroup(groupId, cursor);
      allCompanies.push(...response.data);
      cursor = response.pagination?.nextCursor;
      hasMore = response.pagination?.hasMore ?? false;
    }

    return allCompanies;
  }

  // Extract custom fields from a person/company based on their groups
  extractCustomFields(entity: FolkPerson | FolkCompany): Record<string, any> {
    const allCustomFields: Record<string, any> = {};
    
    // Merge customFieldValues from all groups
    if (entity.customFieldValues) {
      for (const groupFields of Object.values(entity.customFieldValues)) {
        if (groupFields && typeof groupFields === 'object') {
          Object.assign(allCustomFields, groupFields);
        }
      }
    }
    
    // Also include top-level customFields if present
    if (entity.customFields) {
      Object.assign(allCustomFields, entity.customFields);
    }
    
    return allCustomFields;
  }

  // Get group IDs from a person/company
  getGroupIds(entity: FolkPerson | FolkCompany): string[] {
    if (!entity.groups) return [];
    return entity.groups.map(g => g.id);
  }

  // Get group names from a person/company
  getGroupNames(entity: FolkPerson | FolkCompany): string[] {
    if (!entity.groups) return [];
    return entity.groups.map(g => g.name);
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

    // Folk API returns { data: { items: [...], pagination: { nextLink: "..." } } }
    const apiResponse: FolkApiListResponse<FolkPerson> = await response.json();
    
    let nextCursor: string | undefined;
    if (apiResponse.data.pagination?.nextLink) {
      const url = new URL(apiResponse.data.pagination.nextLink, FOLK_API_BASE);
      nextCursor = url.searchParams.get("cursor") || undefined;
    }
    
    return {
      data: apiResponse.data.items || [],
      pagination: {
        nextCursor,
        hasMore: !!nextCursor,
      },
    };
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

    // Folk API returns { data: { items: [...], pagination: { nextLink: "..." } } }
    const apiResponse: FolkApiListResponse<FolkCompany> = await response.json();
    
    let nextCursor: string | undefined;
    if (apiResponse.data.pagination?.nextLink) {
      const url = new URL(apiResponse.data.pagination.nextLink, FOLK_API_BASE);
      nextCursor = url.searchParams.get("cursor") || undefined;
    }
    
    return {
      data: apiResponse.data.items || [],
      pagination: {
        nextCursor,
        hasMore: !!nextCursor,
      },
    };
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

  // Workspace management
  async getOrCreateWorkspace(workspaceId: string, name: string): Promise<FolkWorkspace> {
    let workspace = await storage.getFolkWorkspaceByWorkspaceId(workspaceId);
    if (!workspace) {
      workspace = await storage.createFolkWorkspace({
        workspaceId,
        name,
        slug: workspaceId.toLowerCase().replace(/\s+/g, "-"),
        isActive: true,
      });
    }
    return workspace;
  }

  // Import with tracking
  async importPeopleWithTracking(
    workspaceId: string,
    initiatedBy?: string
  ): Promise<FolkImportRun> {
    const workspace = await storage.getFolkWorkspaceByWorkspaceId(workspaceId);
    
    const importRun = await storage.createFolkImportRun({
      workspaceId: workspace?.id,
      sourceType: "people",
      status: "in_progress",
      initiatedBy,
      startedAt: new Date(),
      importStage: "fetching",
    });

    // Track import start time for ETA calculation
    this.importStartTimes.set(importRun.id, Date.now());

    const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    try {
      // Fetch people (rate-limited)
      await this.updateProgress(importRun.id, 0, 0, "fetching");
      const people = await this.getAllPeople();
      const totalRecords = people.length;

      await storage.updateFolkImportRun(importRun.id, { totalRecords });
      await this.updateProgress(importRun.id, 0, totalRecords, "processing");

      let processedCount = 0;

      for (const person of people) {
        try {
          const existingInvestor = await storage.getInvestorByFolkId(person.id);
          
          // Extract custom fields from all groups (handles customFieldValues structure)
          const allCustomFields = this.extractCustomFields(person);
          
          // Map custom fields from Folk to our database columns
          const mappedCustomFields = mapFolkCustomFields(allCustomFields, FOLK_PERSON_FIELD_MAP);
          
          // Extract email (handles both array of objects and array of strings)
          const firstEmail = Array.isArray(person.emails) && person.emails.length > 0
            ? (typeof person.emails[0] === 'string' ? person.emails[0] : person.emails[0]?.value)
            : undefined;
          
          // Extract phone (handles both array of objects and array of strings)  
          const firstPhone = Array.isArray(person.phones) && person.phones.length > 0
            ? (typeof person.phones[0] === 'string' ? person.phones[0] : person.phones[0]?.value)
            : undefined;
          
          // Get group info
          const folkListIds = this.getGroupIds(person);

          const investorData: Record<string, any> = {
            firstName: mappedCustomFields.firstName || person.firstName || person.fullName?.split(" ")[0] || person.name?.split(" ")[0] || "Unknown",
            lastName: mappedCustomFields.lastName || person.lastName || person.fullName?.split(" ").slice(1).join(" ") || person.name?.split(" ").slice(1).join(" ") || undefined,
            email: firstEmail,
            phone: firstPhone,
            title: mappedCustomFields.title || person.jobTitle,
            linkedinUrl: mappedCustomFields.linkedinUrl || person.linkedinUrl,
            personLinkedinUrl: mappedCustomFields.personLinkedinUrl,
            investorType: mappedCustomFields.investorType,
            investorState: mappedCustomFields.investorState,
            investorCountry: mappedCustomFields.investorCountry,
            fundHQ: mappedCustomFields.fundHQ,
            hqLocation: mappedCustomFields.hqLocation,
            fundingStage: mappedCustomFields.fundingStage,
            typicalInvestment: mappedCustomFields.typicalInvestment,
            numLeadInvestments: mappedCustomFields.numLeadInvestments ? parseInt(String(mappedCustomFields.numLeadInvestments)) : undefined,
            totalInvestments: mappedCustomFields.totalInvestments ? parseInt(String(mappedCustomFields.totalInvestments)) : undefined,
            recentInvestments: mappedCustomFields.recentInvestments,
            status: mappedCustomFields.status,
            website: mappedCustomFields.website,
            folkId: person.id,
            folkWorkspaceId: workspaceId,
            folkListIds: folkListIds.length > 0 ? folkListIds : undefined,
            folkUpdatedAt: person.updatedAt ? new Date(person.updatedAt) : new Date(),
            folkCustomFields: allCustomFields, // Store all custom fields for reference
            source: "folk",
          };

          // Filter out undefined values
          Object.keys(investorData).forEach(key => {
            if (investorData[key] === undefined) delete investorData[key];
          });

          if (existingInvestor) {
            await storage.updateInvestor(existingInvestor.id, investorData as any);
            result.updated++;
          } else {
            await storage.createInvestor(investorData as any);
            result.created++;
          }
        } catch (error: any) {
          result.failed++;
          result.errors.push({ folkId: person.id, error: error.message });
          
          await storage.createFolkFailedRecord({
            runId: importRun.id,
            recordType: "person",
            folkId: person.id,
            payload: person as Record<string, any>,
            errorCode: "IMPORT_ERROR",
            errorMessage: error.message,
          });
        }

        // Update progress every batch
        processedCount++;
        if (processedCount % RATE_LIMIT_CONFIG.batchSize === 0 || processedCount === totalRecords) {
          await this.updateProgress(importRun.id, processedCount, totalRecords, "processing");
        }
      }

      await this.updateProgress(importRun.id, totalRecords, totalRecords, "completed");
      
      await storage.updateFolkImportRun(importRun.id, {
        status: "completed",
        completedAt: new Date(),
        processedRecords: totalRecords,
        createdRecords: result.created,
        updatedRecords: result.updated,
        skippedRecords: result.skipped,
        failedRecords: result.failed,
        progressPercent: 100,
        importStage: "completed",
        errorSummary: result.errors.length > 0 ? `${result.errors.length} records failed` : undefined,
      });

      if (workspace) {
        await storage.updateFolkWorkspace(workspace.id, { lastSyncedAt: new Date() });
      }

    } catch (error: any) {
      await storage.updateFolkImportRun(importRun.id, {
        status: "failed",
        completedAt: new Date(),
        importStage: "failed",
        errorSummary: error.message,
      });
    }

    return (await storage.getFolkImportRunById(importRun.id))!;
  }

  async importCompaniesWithTracking(
    workspaceId: string,
    initiatedBy?: string
  ): Promise<FolkImportRun> {
    const workspace = await storage.getFolkWorkspaceByWorkspaceId(workspaceId);
    
    const importRun = await storage.createFolkImportRun({
      workspaceId: workspace?.id,
      sourceType: "companies",
      status: "in_progress",
      initiatedBy,
      startedAt: new Date(),
      importStage: "fetching",
    });

    // Track import start time for ETA calculation
    this.importStartTimes.set(importRun.id, Date.now());

    const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    try {
      // Fetch companies (rate-limited)
      await this.updateProgress(importRun.id, 0, 0, "fetching");
      const companies = await this.getAllCompanies();
      const totalRecords = companies.length;

      await storage.updateFolkImportRun(importRun.id, { totalRecords });
      await this.updateProgress(importRun.id, 0, totalRecords, "processing");

      let processedCount = 0;

      for (const company of companies) {
        try {
          const existingFirm = await storage.getInvestmentFirmByFolkId(company.id);
          
          // Extract custom fields from all groups (handles customFieldValues structure)
          const allCustomFields = this.extractCustomFields(company);
          
          // Map custom fields from Folk to our database columns
          const mappedCustomFields = mapFolkCustomFields(allCustomFields, FOLK_COMPANY_FIELD_MAP);
          
          // Get group info
          const folkListIds = this.getGroupIds(company);

          const firmData: Record<string, any> = {
            name: company.name || "Unknown Company",
            description: mappedCustomFields.description || company.description,
            website: mappedCustomFields.website || (company.domain ? `https://${company.domain}` : undefined),
            linkedinUrl: mappedCustomFields.linkedinUrl || company.linkedinUrl,
            hqLocation: mappedCustomFields.hqLocation,
            industry: mappedCustomFields.industry || company.industry,
            employeeRange: mappedCustomFields.employeeRange || company.size,
            fundingRaised: mappedCustomFields.fundingRaised,
            lastFundingDate: mappedCustomFields.lastFundingDate,
            foundationYear: mappedCustomFields.foundationYear,
            status: mappedCustomFields.status,
            emails: company.emails,
            phones: company.phones,
            addresses: company.addresses,
            urls: company.urls,
            folkId: company.id,
            folkWorkspaceId: workspaceId,
            folkListIds: folkListIds.length > 0 ? folkListIds : undefined,
            folkUpdatedAt: company.updatedAt ? new Date(company.updatedAt) : new Date(),
            folkCustomFields: allCustomFields, // Store all custom fields for reference
            source: "folk",
          };

          // Filter out undefined values
          Object.keys(firmData).forEach(key => {
            if (firmData[key] === undefined) delete firmData[key];
          });

          if (existingFirm) {
            await storage.updateInvestmentFirm(existingFirm.id, firmData as any);
            result.updated++;
          } else {
            await storage.createInvestmentFirm(firmData as any);
            result.created++;
          }
        } catch (error: any) {
          result.failed++;
          result.errors.push({ folkId: company.id, error: error.message });
          
          await storage.createFolkFailedRecord({
            runId: importRun.id,
            recordType: "company",
            folkId: company.id,
            payload: company as Record<string, any>,
            errorCode: "IMPORT_ERROR",
            errorMessage: error.message,
          });
        }

        // Update progress every batch
        processedCount++;
        if (processedCount % RATE_LIMIT_CONFIG.batchSize === 0 || processedCount === totalRecords) {
          await this.updateProgress(importRun.id, processedCount, totalRecords, "processing");
        }
      }

      await this.updateProgress(importRun.id, totalRecords, totalRecords, "completed");

      await storage.updateFolkImportRun(importRun.id, {
        status: "completed",
        completedAt: new Date(),
        processedRecords: totalRecords,
        createdRecords: result.created,
        updatedRecords: result.updated,
        skippedRecords: result.skipped,
        failedRecords: result.failed,
        progressPercent: 100,
        importStage: "completed",
        errorSummary: result.errors.length > 0 ? `${result.errors.length} records failed` : undefined,
      });

      if (workspace) {
        await storage.updateFolkWorkspace(workspace.id, { lastSyncedAt: new Date() });
      }

    } catch (error: any) {
      await storage.updateFolkImportRun(importRun.id, {
        status: "failed",
        importStage: "failed",
        completedAt: new Date(),
        errorSummary: error.message,
      });
    }

    return (await storage.getFolkImportRunById(importRun.id))!;
  }

  // Retry failed records
  async retryFailedRecord(failedRecordId: string): Promise<boolean> {
    const failedRecord = await storage.getFolkFailedRecords(failedRecordId);
    if (!failedRecord || failedRecord.length === 0) return false;

    const record = failedRecord[0];
    const payload = record.payload as FolkPerson | FolkCompany;

    try {
      if (record.recordType === "person") {
        const person = payload as FolkPerson;
        const existingInvestor = await storage.getInvestorByFolkId(person.id);

        // Extract email and phone (handles both array of objects and array of strings)
        const firstEmail = Array.isArray(person.emails) && person.emails.length > 0
          ? (typeof person.emails[0] === 'string' ? person.emails[0] : (person.emails[0] as any)?.value)
          : undefined;
        const firstPhone = Array.isArray(person.phones) && person.phones.length > 0
          ? (typeof person.phones[0] === 'string' ? person.phones[0] : (person.phones[0] as any)?.value)
          : undefined;

        const investorData = {
          firstName: person.firstName || person.name?.split(" ")[0] || "Unknown",
          lastName: person.lastName || person.name?.split(" ").slice(1).join(" ") || undefined,
          email: firstEmail,
          phone: firstPhone,
          title: person.jobTitle,
          linkedinUrl: person.linkedinUrl,
          folkId: person.id,
          source: "folk",
        };

        if (existingInvestor) {
          await storage.updateInvestor(existingInvestor.id, investorData);
        } else {
          await storage.createInvestor(investorData);
        }
      } else if (record.recordType === "company") {
        const company = payload as FolkCompany;
        const existingFirm = await storage.getInvestmentFirmByFolkId(company.id);

        const firmData = {
          name: company.name || "Unknown Company",
          description: company.description,
          website: company.domain ? `https://${company.domain}` : undefined,
          linkedinUrl: company.linkedinUrl,
          folkId: company.id,
          source: "folk",
        };

        if (existingFirm) {
          await storage.updateInvestmentFirm(existingFirm.id, firmData);
        } else {
          await storage.createInvestmentFirm(firmData);
        }
      }

      await storage.updateFolkFailedRecord(record.id, {
        resolvedAt: new Date(),
        retryCount: (record.retryCount || 0) + 1,
      });

      return true;
    } catch (error: any) {
      await storage.updateFolkFailedRecord(record.id, {
        retryCount: (record.retryCount || 0) + 1,
        errorMessage: error.message,
      });
      return false;
    }
  }

  // Synchronous people import from group (waits for completion)
  async importPeopleFromGroupWithTracking(
    groupId: string,
    initiatedBy?: string
  ): Promise<FolkImportRun> {
    const importRun = await storage.createFolkImportRun({
      sourceType: "people",
      status: "in_progress",
      initiatedBy,
      startedAt: new Date(),
      importStage: "fetching",
    });

    this.importStartTimes.set(importRun.id, Date.now());
    const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    try {
      await this.updateProgress(importRun.id, 0, 0, "fetching");
      const people = await this.getAllPeopleByGroup(groupId);
      const totalRecords = people.length;

      await storage.updateFolkImportRun(importRun.id, { totalRecords });
      await this.updateProgress(importRun.id, 0, totalRecords, "processing");
      
      // Load approved mappings once before processing (not per-record)
      const dynamicMappingLookup = await loadApprovedMappings(groupId, storage);

      let processedCount = 0;

      for (const person of people) {
        try {
          const existingInvestor = await storage.getInvestorByFolkId(person.id);
          const allCustomFields = this.extractCustomFields(person);
          
          // Use static mappings as fallback
          const staticMappedFields = mapFolkCustomFields(allCustomFields, FOLK_PERSON_FIELD_MAP);
          
          // Apply dynamic mappings from pre-loaded lookup
          const { mapped: dynamicMappedFields, jsonFields } = applyMappingsToFields(allCustomFields, dynamicMappingLookup);
          
          // Merge: dynamic mappings take precedence over static
          const mappedCustomFields = { ...staticMappedFields, ...dynamicMappedFields };
          
          const firstEmail = Array.isArray(person.emails) && person.emails.length > 0
            ? (typeof person.emails[0] === 'string' ? person.emails[0] : person.emails[0]?.value)
            : undefined;
          const firstPhone = Array.isArray(person.phones) && person.phones.length > 0
            ? (typeof person.phones[0] === 'string' ? person.phones[0] : person.phones[0]?.value)
            : undefined;
          const folkListIds = this.getGroupIds(person);

          const investorData: Record<string, any> = {
            firstName: mappedCustomFields.firstName || person.firstName || person.fullName?.split(" ")[0] || person.name?.split(" ")[0] || "Unknown",
            lastName: mappedCustomFields.lastName || person.lastName || person.fullName?.split(" ").slice(1).join(" ") || person.name?.split(" ").slice(1).join(" ") || undefined,
            email: firstEmail,
            phone: firstPhone,
            title: mappedCustomFields.title || person.jobTitle,
            linkedinUrl: mappedCustomFields.linkedinUrl || person.linkedinUrl,
            personLinkedinUrl: mappedCustomFields.personLinkedinUrl,
            investorType: mappedCustomFields.investorType,
            investorState: mappedCustomFields.investorState,
            investorCountry: mappedCustomFields.investorCountry,
            fundHQ: mappedCustomFields.fundHQ,
            hqLocation: mappedCustomFields.hqLocation,
            fundingStage: mappedCustomFields.fundingStage,
            typicalInvestment: mappedCustomFields.typicalInvestment,
            numLeadInvestments: mappedCustomFields.numLeadInvestments ? parseInt(String(mappedCustomFields.numLeadInvestments)) : undefined,
            totalInvestments: mappedCustomFields.totalInvestments ? parseInt(String(mappedCustomFields.totalInvestments)) : undefined,
            recentInvestments: mappedCustomFields.recentInvestments,
            status: mappedCustomFields.status,
            website: mappedCustomFields.website,
            bio: mappedCustomFields.bio,
            notes: mappedCustomFields.notes,
            company: mappedCustomFields.company,
            folkId: person.id,
            folkWorkspaceId: groupId,
            folkListIds: folkListIds.length > 0 ? folkListIds : [groupId],
            folkUpdatedAt: person.updatedAt ? new Date(person.updatedAt) : new Date(),
            folkCustomFields: Object.keys(jsonFields).length > 0 ? jsonFields : allCustomFields,
            source: "folk",
          };

          Object.keys(investorData).forEach(key => {
            if (investorData[key] === undefined) delete investorData[key];
          });

          if (existingInvestor) {
            await storage.updateInvestor(existingInvestor.id, investorData as any);
            result.updated++;
          } else {
            await storage.createInvestor(investorData as any);
            result.created++;
          }
        } catch (error: any) {
          result.failed++;
          result.errors.push({ folkId: person.id, error: error.message });
          await storage.createFolkFailedRecord({
            runId: importRun.id,
            recordType: "person",
            folkId: person.id,
            payload: person as Record<string, any>,
            errorCode: "IMPORT_ERROR",
            errorMessage: error.message,
          });
        }

        processedCount++;
        if (processedCount % RATE_LIMIT_CONFIG.batchSize === 0 || processedCount === totalRecords) {
          await this.updateProgress(importRun.id, processedCount, totalRecords, "processing");
        }
      }

      await this.updateProgress(importRun.id, totalRecords, totalRecords, "completed");
      await storage.updateFolkImportRun(importRun.id, {
        status: "completed",
        completedAt: new Date(),
        processedRecords: totalRecords,
        createdRecords: result.created,
        updatedRecords: result.updated,
        skippedRecords: result.skipped,
        failedRecords: result.failed,
        progressPercent: 100,
        importStage: "completed",
        errorSummary: result.errors.length > 0 ? `${result.errors.length} records failed` : undefined,
      });

      return { 
        ...importRun, 
        processedRecords: totalRecords, 
        createdRecords: result.created, 
        updatedRecords: result.updated, 
        failedRecords: result.failed,
        status: "completed" as const,
      };
    } catch (error: any) {
      await storage.updateFolkImportRun(importRun.id, {
        status: "failed",
        completedAt: new Date(),
        importStage: "failed",
        errorSummary: error.message,
      });
      throw error;
    }
  }

  // Start people import from group in background (returns immediately)
  async startPeopleImportFromGroup(
    groupId: string,
    initiatedBy?: string
  ): Promise<FolkImportRun> {
    const importRun = await storage.createFolkImportRun({
      sourceType: "people",
      status: "in_progress",
      initiatedBy,
      startedAt: new Date(),
      importStage: "fetching",
    });

    // Start the import in the background (don't await)
    this.runPeopleImportFromGroup(importRun.id, groupId).catch(console.error);

    return importRun;
  }

  // Start companies import from group in background (returns immediately)
  async startCompaniesImportFromGroup(
    groupId: string,
    initiatedBy?: string
  ): Promise<FolkImportRun> {
    const importRun = await storage.createFolkImportRun({
      sourceType: "companies",
      status: "in_progress",
      initiatedBy,
      startedAt: new Date(),
      importStage: "fetching",
    });

    // Start the import in the background (don't await)
    this.runCompaniesImportFromGroup(importRun.id, groupId).catch(console.error);

    return importRun;
  }

  // Background worker: import people from group
  private async runPeopleImportFromGroup(
    importRunId: string,
    groupId: string
  ): Promise<void> {
    this.importStartTimes.set(importRunId, Date.now());
    const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    try {
      await this.updateProgress(importRunId, 0, 0, "fetching");
      const people = await this.getAllPeopleByGroup(groupId);
      const totalRecords = people.length;

      await storage.updateFolkImportRun(importRunId, { totalRecords });
      await this.updateProgress(importRunId, 0, totalRecords, "processing");

      let processedCount = 0;

      for (const person of people) {
        try {
          const existingInvestor = await storage.getInvestorByFolkId(person.id);
          const allCustomFields = this.extractCustomFields(person);
          const mappedCustomFields = mapFolkCustomFields(allCustomFields, FOLK_PERSON_FIELD_MAP);
          
          const firstEmail = Array.isArray(person.emails) && person.emails.length > 0
            ? (typeof person.emails[0] === 'string' ? person.emails[0] : person.emails[0]?.value)
            : undefined;
          const firstPhone = Array.isArray(person.phones) && person.phones.length > 0
            ? (typeof person.phones[0] === 'string' ? person.phones[0] : person.phones[0]?.value)
            : undefined;
          const folkListIds = this.getGroupIds(person);

          const investorData: Record<string, any> = {
            firstName: mappedCustomFields.firstName || person.firstName || person.fullName?.split(" ")[0] || person.name?.split(" ")[0] || "Unknown",
            lastName: mappedCustomFields.lastName || person.lastName || person.fullName?.split(" ").slice(1).join(" ") || person.name?.split(" ").slice(1).join(" ") || undefined,
            email: firstEmail,
            phone: firstPhone,
            title: mappedCustomFields.title || person.jobTitle,
            linkedinUrl: mappedCustomFields.linkedinUrl || person.linkedinUrl,
            personLinkedinUrl: mappedCustomFields.personLinkedinUrl,
            investorType: mappedCustomFields.investorType,
            investorState: mappedCustomFields.investorState,
            investorCountry: mappedCustomFields.investorCountry,
            fundHQ: mappedCustomFields.fundHQ,
            hqLocation: mappedCustomFields.hqLocation,
            fundingStage: mappedCustomFields.fundingStage,
            typicalInvestment: mappedCustomFields.typicalInvestment,
            numLeadInvestments: mappedCustomFields.numLeadInvestments ? parseInt(String(mappedCustomFields.numLeadInvestments)) : undefined,
            totalInvestments: mappedCustomFields.totalInvestments ? parseInt(String(mappedCustomFields.totalInvestments)) : undefined,
            recentInvestments: mappedCustomFields.recentInvestments,
            status: mappedCustomFields.status,
            website: mappedCustomFields.website,
            folkId: person.id,
            folkWorkspaceId: groupId,
            folkListIds: folkListIds.length > 0 ? folkListIds : [groupId],
            folkUpdatedAt: person.updatedAt ? new Date(person.updatedAt) : new Date(),
            folkCustomFields: allCustomFields,
            source: "folk",
          };

          Object.keys(investorData).forEach(key => {
            if (investorData[key] === undefined) delete investorData[key];
          });

          if (existingInvestor) {
            await storage.updateInvestor(existingInvestor.id, investorData as any);
            result.updated++;
          } else {
            await storage.createInvestor(investorData as any);
            result.created++;
          }
        } catch (error: any) {
          result.failed++;
          result.errors.push({ folkId: person.id, error: error.message });
          await storage.createFolkFailedRecord({
            runId: importRunId,
            recordType: "person",
            folkId: person.id,
            payload: person as Record<string, any>,
            errorCode: "IMPORT_ERROR",
            errorMessage: error.message,
          });
        }

        processedCount++;
        if (processedCount % RATE_LIMIT_CONFIG.batchSize === 0 || processedCount === totalRecords) {
          await this.updateProgress(importRunId, processedCount, totalRecords, "processing");
        }
      }

      await this.updateProgress(importRunId, totalRecords, totalRecords, "completed");
      await storage.updateFolkImportRun(importRunId, {
        status: "completed",
        completedAt: new Date(),
        processedRecords: totalRecords,
        createdRecords: result.created,
        updatedRecords: result.updated,
        skippedRecords: result.skipped,
        failedRecords: result.failed,
        progressPercent: 100,
        importStage: "completed",
        errorSummary: result.errors.length > 0 ? `${result.errors.length} records failed` : undefined,
      });

    } catch (error: any) {
      await storage.updateFolkImportRun(importRunId, {
        status: "failed",
        completedAt: new Date(),
        importStage: "failed",
        errorSummary: error.message,
      });
    }
  }

  // Background worker: import companies from group
  private async runCompaniesImportFromGroup(
    importRunId: string,
    groupId: string
  ): Promise<void> {
    this.importStartTimes.set(importRunId, Date.now());
    const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    try {
      await this.updateProgress(importRunId, 0, 0, "fetching");
      const companies = await this.getAllCompaniesByGroup(groupId);
      const totalRecords = companies.length;

      await storage.updateFolkImportRun(importRunId, { totalRecords });
      await this.updateProgress(importRunId, 0, totalRecords, "processing");

      let processedCount = 0;

      for (const company of companies) {
        try {
          const existingFirm = await storage.getInvestmentFirmByFolkId(company.id);
          const allCustomFields = this.extractCustomFields(company);
          const mappedCustomFields = mapFolkCustomFields(allCustomFields, FOLK_COMPANY_FIELD_MAP);
          const folkListIds = this.getGroupIds(company);

          const firmData: Record<string, any> = {
            name: company.name || "Unknown Company",
            description: mappedCustomFields.description || company.description,
            website: mappedCustomFields.website || (company.domain ? `https://${company.domain}` : undefined),
            linkedinUrl: mappedCustomFields.linkedinUrl || company.linkedinUrl,
            hqLocation: mappedCustomFields.hqLocation,
            industry: mappedCustomFields.industry || company.industry,
            employeeRange: mappedCustomFields.employeeRange || company.size,
            fundingRaised: mappedCustomFields.fundingRaised,
            lastFundingDate: mappedCustomFields.lastFundingDate,
            foundationYear: mappedCustomFields.foundationYear,
            status: mappedCustomFields.status,
            emails: company.emails,
            phones: company.phones,
            addresses: company.addresses,
            urls: company.urls,
            folkId: company.id,
            folkWorkspaceId: groupId,
            folkListIds: folkListIds.length > 0 ? folkListIds : [groupId],
            folkUpdatedAt: company.updatedAt ? new Date(company.updatedAt) : new Date(),
            folkCustomFields: allCustomFields,
            source: "folk",
          };

          Object.keys(firmData).forEach(key => {
            if (firmData[key] === undefined) delete firmData[key];
          });

          if (existingFirm) {
            await storage.updateInvestmentFirm(existingFirm.id, firmData as any);
            result.updated++;
          } else {
            await storage.createInvestmentFirm(firmData as any);
            result.created++;
          }
        } catch (error: any) {
          result.failed++;
          result.errors.push({ folkId: company.id, error: error.message });
          await storage.createFolkFailedRecord({
            runId: importRunId,
            recordType: "company",
            folkId: company.id,
            payload: company as Record<string, any>,
            errorCode: "IMPORT_ERROR",
            errorMessage: error.message,
          });
        }

        processedCount++;
        if (processedCount % RATE_LIMIT_CONFIG.batchSize === 0 || processedCount === totalRecords) {
          await this.updateProgress(importRunId, processedCount, totalRecords, "processing");
        }
      }

      await this.updateProgress(importRunId, totalRecords, totalRecords, "completed");
      await storage.updateFolkImportRun(importRunId, {
        status: "completed",
        completedAt: new Date(),
        processedRecords: totalRecords,
        createdRecords: result.created,
        updatedRecords: result.updated,
        skippedRecords: result.skipped,
        failedRecords: result.failed,
        progressPercent: 100,
        importStage: "completed",
        errorSummary: result.errors.length > 0 ? `${result.errors.length} records failed` : undefined,
      });

    } catch (error: any) {
      await storage.updateFolkImportRun(importRunId, {
        status: "failed",
        completedAt: new Date(),
        importStage: "failed",
        errorSummary: error.message,
      });
    }
  }
}

export const folkService = new FolkService();
export type { FolkPerson, FolkCompany };
