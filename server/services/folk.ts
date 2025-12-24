import { storage } from "../storage";
import type { FolkWorkspace, FolkImportRun, InsertFolkImportRun, InsertFolkFailedRecord } from "@shared/schema";

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

          const investorData = {
            firstName: person.firstName || person.name?.split(" ")[0] || "Unknown",
            lastName: person.lastName || person.name?.split(" ").slice(1).join(" ") || undefined,
            email: person.emails?.[0]?.value,
            phone: person.phones?.[0]?.value,
            title: person.jobTitle,
            linkedinUrl: person.linkedinUrl,
            folkId: person.id,
            folkWorkspaceId: workspaceId,
            folkUpdatedAt: person.updatedAt ? new Date(person.updatedAt) : new Date(),
            source: "folk",
          };

          if (existingInvestor) {
            await storage.updateInvestor(existingInvestor.id, investorData);
            result.updated++;
          } else {
            await storage.createInvestor(investorData);
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

          const firmData = {
            name: company.name || "Unknown Company",
            description: company.description,
            website: company.domain ? `https://${company.domain}` : undefined,
            linkedinUrl: company.linkedinUrl,
            folkId: company.id,
            folkWorkspaceId: workspaceId,
            folkUpdatedAt: company.updatedAt ? new Date(company.updatedAt) : new Date(),
            source: "folk",
          };

          if (existingFirm) {
            await storage.updateInvestmentFirm(existingFirm.id, firmData);
            result.updated++;
          } else {
            await storage.createInvestmentFirm(firmData);
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
