import { storage } from "../storage";
import type { FolkWorkspace, FolkImportRun, InsertFolkImportRun, InsertFolkFailedRecord } from "@shared/schema";

const FOLK_API_BASE = "https://api.folk.app";

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
    hasMore?: boolean;
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

  // Get people from a specific group
  async getPeopleByGroup(groupId: string, cursor?: string, limit: number = 100): Promise<FolkListResponse<FolkPerson>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.append("cursor", cursor);

    // Folk API expects /groups/{id}/people endpoint
    const response = await fetch(`${FOLK_API_BASE}/v1/groups/${groupId}/people?${params}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch people for group ${groupId}: ${response.status}`);
    }

    return response.json();
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

  // Get companies from a specific group  
  async getCompaniesByGroup(groupId: string, cursor?: string, limit: number = 100): Promise<FolkListResponse<FolkCompany>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.append("cursor", cursor);

    // Folk API expects /groups/{id}/companies endpoint
    const response = await fetch(`${FOLK_API_BASE}/v1/groups/${groupId}/companies?${params}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch companies for group ${groupId}: ${response.status}`);
    }

    return response.json();
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
    });

    const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    try {
      const people = await this.getAllPeople();
      const totalRecords = people.length;

      await storage.updateFolkImportRun(importRun.id, { totalRecords });

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
          const folkListNames = this.getGroupNames(person);

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
      }

      await storage.updateFolkImportRun(importRun.id, {
        status: "completed",
        completedAt: new Date(),
        processedRecords: totalRecords,
        createdRecords: result.created,
        updatedRecords: result.updated,
        skippedRecords: result.skipped,
        failedRecords: result.failed,
        errorSummary: result.errors.length > 0 ? `${result.errors.length} records failed` : undefined,
      });

      if (workspace) {
        await storage.updateFolkWorkspace(workspace.id, { lastSyncedAt: new Date() });
      }

    } catch (error: any) {
      await storage.updateFolkImportRun(importRun.id, {
        status: "failed",
        completedAt: new Date(),
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
    });

    const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    try {
      const companies = await this.getAllCompanies();
      const totalRecords = companies.length;

      await storage.updateFolkImportRun(importRun.id, { totalRecords });

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
      }

      await storage.updateFolkImportRun(importRun.id, {
        status: "completed",
        completedAt: new Date(),
        processedRecords: totalRecords,
        createdRecords: result.created,
        updatedRecords: result.updated,
        skippedRecords: result.skipped,
        failedRecords: result.failed,
        errorSummary: result.errors.length > 0 ? `${result.errors.length} records failed` : undefined,
      });

      if (workspace) {
        await storage.updateFolkWorkspace(workspace.id, { lastSyncedAt: new Date() });
      }

    } catch (error: any) {
      await storage.updateFolkImportRun(importRun.id, {
        status: "failed",
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

        const investorData = {
          firstName: person.firstName || person.name?.split(" ")[0] || "Unknown",
          lastName: person.lastName || person.name?.split(" ").slice(1).join(" ") || undefined,
          email: person.emails?.[0]?.value,
          phone: person.phones?.[0]?.value,
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
}

export const folkService = new FolkService();
export type { FolkPerson, FolkCompany };
