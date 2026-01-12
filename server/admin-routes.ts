import { Express } from "express";
import { isAdmin } from "./replit_integrations/auth/replitAuth";
import { db } from "./db";
import { eq, desc, sql, and, or, like, count, isNull } from "drizzle-orm";
import { folkService } from "./services/folk";
import { storage } from "./storage";
import { mistralService } from "./services/mistral";
import { deduplicationService } from "./services/deduplication";
import { seedFamilyOffices } from "./seeds/family-offices";
import { seedBusinessmenFromCSV } from "./seeds/businessmen-csv";
import { importInvestors } from "./scripts/import-investors-pdf";
import { importPensionFunds } from "./scripts/import-pension-funds";
import { 
  startUrlHealthJob, processUrlHealthJob, cancelUrlHealthJob,
  getActiveUrlHealthJob, getUrlHealthStats, getUrlHealthChecks
} from "./services/url-health";
import { 
  users, investors, startups, contacts, deals, 
  activityLogs, syncLogs, systemSettings,
  investmentFirms, folkWorkspaces, folkImportRuns, folkFailedRecords,
  potentialDuplicates, enrichmentJobs, businessmen,
  archivedInvestmentFirms, archivedInvestors, archivedContacts
} from "@shared/schema";

// Helper to get user ID from request - supports both Replit OAuth and simple auth
function getUserId(req: any): string {
  // Simple email/password auth sets user.id directly
  if (req.user?.id) {
    return req.user.id;
  }
  // Replit OAuth sets claims.sub
  if (req.user?.claims?.sub) {
    return req.user.claims.sub;
  }
  return "unknown";
}

export function registerAdminRoutes(app: Express) {
  // ============ Folk CRM Integration ============
  
  // Test Folk connection
  app.get("/api/admin/folk/test", isAdmin, async (req, res) => {
    try {
      const result = await folkService.testConnection();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ============ Folk API Explorer ============
  
  // Get all groups/lists from Folk workspace
  app.get("/api/admin/folk/groups", isAdmin, async (req, res) => {
    try {
      const groups = await folkService.getGroups();
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get raw sample data from Folk to explore structure
  app.get("/api/admin/folk/explore", isAdmin, async (req, res) => {
    const { groupId } = req.query;
    
    try {
      // First get all groups
      const groups = await folkService.getGroups();
      
      // Get people and companies (optionally filtered by group)
      let peopleRes, companiesRes;
      if (groupId && typeof groupId === 'string') {
        peopleRes = await folkService.getPeopleByGroup(groupId, undefined, 5);
        companiesRes = await folkService.getCompaniesByGroup(groupId, undefined, 5);
      } else {
        peopleRes = await folkService.getPeople(undefined, 5);
        companiesRes = await folkService.getCompanies(undefined, 5);
      }
      
      // Extract all custom field names from people samples
      const peopleCustomFieldNames = new Set<string>();
      for (const person of peopleRes.data) {
        const customFields = folkService.extractCustomFields(person);
        Object.keys(customFields).forEach(k => peopleCustomFieldNames.add(k));
      }
      
      // Extract all custom field names from company samples
      const companyCustomFieldNames = new Set<string>();
      for (const company of companiesRes.data) {
        const customFields = folkService.extractCustomFields(company);
        Object.keys(customFields).forEach(k => companyCustomFieldNames.add(k));
      }
      
      res.json({
        groups: groups.map(g => ({ id: g.id, name: g.name })),
        people: {
          sample: peopleRes.data,
          count: peopleRes.data.length,
          fields: peopleRes.data.length > 0 ? Object.keys(peopleRes.data[0]) : [],
          customFields: Array.from(peopleCustomFieldNames),
          groupsInSample: peopleRes.data.length > 0 && peopleRes.data[0].groups 
            ? peopleRes.data[0].groups.map((g: any) => g.name) 
            : [],
        },
        companies: {
          sample: companiesRes.data,
          count: companiesRes.data.length,
          fields: companiesRes.data.length > 0 ? Object.keys(companiesRes.data[0]) : [],
          customFields: Array.from(companyCustomFieldNames),
          groupsInSample: companiesRes.data.length > 0 && companiesRes.data[0].groups 
            ? companiesRes.data[0].groups.map((g: any) => g.name) 
            : [],
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Explore a specific group's data
  app.get("/api/admin/folk/explore/:groupId", isAdmin, async (req, res) => {
    const { groupId } = req.params;
    
    try {
      const [peopleRes, companiesRes] = await Promise.all([
        folkService.getPeopleByGroup(groupId, undefined, 10),
        folkService.getCompaniesByGroup(groupId, undefined, 10),
      ]);
      
      // Extract all custom field names
      const peopleCustomFieldNames = new Set<string>();
      for (const person of peopleRes.data) {
        const customFields = folkService.extractCustomFields(person);
        Object.keys(customFields).forEach(k => peopleCustomFieldNames.add(k));
      }
      
      const companyCustomFieldNames = new Set<string>();
      for (const company of companiesRes.data) {
        const customFields = folkService.extractCustomFields(company);
        Object.keys(customFields).forEach(k => companyCustomFieldNames.add(k));
      }
      
      res.json({
        groupId,
        people: {
          sample: peopleRes.data,
          count: peopleRes.data.length,
          fields: peopleRes.data.length > 0 ? Object.keys(peopleRes.data[0]) : [],
          customFields: Array.from(peopleCustomFieldNames),
        },
        companies: {
          sample: companiesRes.data,
          count: companiesRes.data.length,
          fields: companiesRes.data.length > 0 ? Object.keys(companiesRes.data[0]) : [],
          customFields: Array.from(companyCustomFieldNames),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Inspect fields for a specific group (legacy-style)
  app.get("/api/admin/folk/inspect-fields", isAdmin, async (req, res) => {
    const { groupId } = req.query;
    
    if (!groupId || typeof groupId !== 'string') {
      return res.status(400).json({ success: false, message: "Group ID is required" });
    }
    
    try {
      const [peopleRes, companiesRes] = await Promise.all([
        folkService.getPeopleByGroup(groupId, undefined, 5),
        folkService.getCompaniesByGroup(groupId, undefined, 5),
      ]);
      
      // Extract all field names from people samples
      const peopleFieldNames = new Set<string>();
      for (const person of peopleRes.data) {
        Object.keys(person).forEach(k => peopleFieldNames.add(k));
        const customFields = folkService.extractCustomFields(person);
        Object.keys(customFields).forEach(k => peopleFieldNames.add(k));
      }
      
      // Extract all field names from company samples
      const companyFieldNames = new Set<string>();
      for (const company of companiesRes.data) {
        Object.keys(company).forEach(k => companyFieldNames.add(k));
        const customFields = folkService.extractCustomFields(company);
        Object.keys(customFields).forEach(k => companyFieldNames.add(k));
      }
      
      res.json({
        success: true,
        companyFields: Array.from(companyFieldNames).sort(),
        peopleFields: Array.from(peopleFieldNames).sort(),
        sampleCompanies: companiesRes.data.slice(0, 3),
        samplePeople: peopleRes.data.slice(0, 3),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Enhanced field mapping reference with sample values and mapped/unmapped status
  app.get("/api/admin/folk/field-mapping", isAdmin, async (req, res) => {
    const { groupId } = req.query;
    
    try {
      // Field mappings from Folk service
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

      // Get sample data to find actual field values
      let peopleRes, companiesRes;
      if (groupId && typeof groupId === 'string') {
        peopleRes = await folkService.getPeopleByGroup(groupId, undefined, 5);
        companiesRes = await folkService.getCompaniesByGroup(groupId, undefined, 5);
      } else {
        peopleRes = await folkService.getPeople(undefined, 5);
        companiesRes = await folkService.getCompanies(undefined, 5);
      }

      // Build mapping info with sample values
      const peopleFieldInfo: Array<{
        folkField: string;
        dbColumn: string | null;
        isMapped: boolean;
        sampleValues: any[];
      }> = [];

      const companyFieldInfo: Array<{
        folkField: string;
        dbColumn: string | null;
        isMapped: boolean;
        sampleValues: any[];
      }> = [];

      // Collect all custom fields from people samples
      const allPeopleCustomFields = new Map<string, any[]>();
      for (const person of peopleRes.data) {
        const customFields = folkService.extractCustomFields(person);
        for (const [key, value] of Object.entries(customFields)) {
          if (!allPeopleCustomFields.has(key)) {
            allPeopleCustomFields.set(key, []);
          }
          if (value !== null && value !== undefined && value !== "") {
            const samples = allPeopleCustomFields.get(key)!;
            if (samples.length < 3) {
              samples.push(value);
            }
          }
        }
      }

      // Build people field mapping info
      for (const [folkField, samples] of Array.from(allPeopleCustomFields.entries())) {
        const dbColumn = FOLK_PERSON_FIELD_MAP[folkField] || null;
        peopleFieldInfo.push({
          folkField,
          dbColumn,
          isMapped: !!dbColumn,
          sampleValues: samples,
        });
      }

      // Collect all custom fields from company samples
      const allCompanyCustomFields = new Map<string, any[]>();
      for (const company of companiesRes.data) {
        const customFields = folkService.extractCustomFields(company);
        for (const [key, value] of Object.entries(customFields)) {
          if (!allCompanyCustomFields.has(key)) {
            allCompanyCustomFields.set(key, []);
          }
          if (value !== null && value !== undefined && value !== "") {
            const samples = allCompanyCustomFields.get(key)!;
            if (samples.length < 3) {
              samples.push(value);
            }
          }
        }
      }

      // Build company field mapping info
      for (const [folkField, samples] of Array.from(allCompanyCustomFields.entries())) {
        const dbColumn = FOLK_COMPANY_FIELD_MAP[folkField] || null;
        companyFieldInfo.push({
          folkField,
          dbColumn,
          isMapped: !!dbColumn,
          sampleValues: samples,
        });
      }

      // Sort by mapped status (unmapped first) then alphabetically
      peopleFieldInfo.sort((a, b) => {
        if (a.isMapped !== b.isMapped) return a.isMapped ? 1 : -1;
        return a.folkField.localeCompare(b.folkField);
      });

      companyFieldInfo.sort((a, b) => {
        if (a.isMapped !== b.isMapped) return a.isMapped ? 1 : -1;
        return a.folkField.localeCompare(b.folkField);
      });

      res.json({
        people: {
          fields: peopleFieldInfo,
          mappedCount: peopleFieldInfo.filter(f => f.isMapped).length,
          unmappedCount: peopleFieldInfo.filter(f => !f.isMapped).length,
          fieldMap: FOLK_PERSON_FIELD_MAP,
        },
        companies: {
          fields: companyFieldInfo,
          mappedCount: companyFieldInfo.filter(f => f.isMapped).length,
          unmappedCount: companyFieldInfo.filter(f => !f.isMapped).length,
          fieldMap: FOLK_COMPANY_FIELD_MAP,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Folk Workspaces ============
  
  // Get all workspaces
  app.get("/api/admin/folk/workspaces", isAdmin, async (req, res) => {
    try {
      const workspaces = await storage.getFolkWorkspaces();
      res.json(workspaces);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create/register workspace
  app.post("/api/admin/folk/workspaces", isAdmin, async (req, res) => {
    const { workspaceId, name } = req.body;
    
    if (!workspaceId || !name) {
      return res.status(400).json({ message: "workspaceId and name are required" });
    }

    try {
      const workspace = await folkService.getOrCreateWorkspace(workspaceId, name);
      res.json(workspace);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update workspace
  app.patch("/api/admin/folk/workspaces/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    const { isActive, name } = req.body;
    
    try {
      const workspace = await storage.updateFolkWorkspace(id, { isActive, name });
      res.json(workspace);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete workspace
  app.delete("/api/admin/folk/workspaces/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
      await storage.deleteFolkWorkspace(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Folk Import Runs ============
  
  // Get import runs
  app.get("/api/admin/folk/import-runs", isAdmin, async (req, res) => {
    const { workspaceId } = req.query;
    
    try {
      const runs = await storage.getFolkImportRuns(workspaceId as string | undefined);
      res.json(runs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single import run
  app.get("/api/admin/folk/import-runs/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
      const run = await storage.getFolkImportRunById(id);
      if (!run) {
        return res.status(404).json({ message: "Import run not found" });
      }
      res.json(run);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get failed records for an import run
  app.get("/api/admin/folk/import-runs/:id/failed", isAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
      const failedRecords = await storage.getFolkFailedRecords(id);
      res.json(failedRecords);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Retry failed records for an import run
  app.post("/api/admin/folk/import-runs/:id/retry", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const { id } = req.params;
    const { folkIds } = req.body; // Optional: specific folkIds to retry, otherwise retry all
    
    try {
      const run = await storage.getFolkImportRunById(id);
      if (!run) {
        return res.status(404).json({ message: "Import run not found" });
      }
      
      const failedRecords = await storage.getFolkFailedRecords(id);
      const recordsToRetry = folkIds 
        ? failedRecords.filter(r => folkIds.includes(r.folkId))
        : failedRecords;
      
      if (recordsToRetry.length === 0) {
        return res.json({ message: "No failed records to retry", retried: 0 });
      }
      
      // Start a new import run for the retry
      const retryRun = await folkService.retryFailedRecords(recordsToRetry, run.sourceType, userId);
      
      // Log activity
      db.insert(activityLogs).values({
        userId,
        action: "retry_import",
        entityType: run.sourceType || "unknown",
        description: `Retrying ${recordsToRetry.length} failed records from import run`,
        metadata: { originalRunId: id, retryRunId: retryRun.id },
      }).catch(console.error);
      
      res.json(retryRun);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Import people from Folk with tracking
  app.post("/api/admin/folk/import/people", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const { workspaceId } = req.body;
    
    if (!workspaceId) {
      return res.status(400).json({ message: "workspaceId is required" });
    }

    try {
      const importRun = await folkService.importPeopleWithTracking(workspaceId, userId);
      
      await db.insert(activityLogs).values({
        userId,
        action: "imported",
        entityType: "investor",
        description: `Imported ${importRun.createdRecords} new, updated ${importRun.updatedRecords} investors from Folk CRM`,
        metadata: { importRunId: importRun.id, workspaceId },
      });

      res.json(importRun);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Import companies from Folk with tracking
  app.post("/api/admin/folk/import/companies", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const { workspaceId } = req.body;
    
    if (!workspaceId) {
      return res.status(400).json({ message: "workspaceId is required" });
    }

    try {
      const importRun = await folkService.importCompaniesWithTracking(workspaceId, userId);
      
      await db.insert(activityLogs).values({
        userId,
        action: "imported",
        entityType: "company",
        description: `Imported ${importRun.createdRecords} new, updated ${importRun.updatedRecords} companies from Folk CRM`,
        metadata: { importRunId: importRun.id, workspaceId },
      });

      res.json(importRun);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Import people from a specific Folk group (background job with real-time progress)
  app.post("/api/admin/folk/import/people-from-group", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }

    try {
      // Create a default workspace if none exists
      await folkService.getOrCreateWorkspace("default", "Default Workspace");
      
      // Start import in background and return immediately
      const importRun = await folkService.startPeopleImportFromGroup(groupId, userId);
      
      // Log activity asynchronously (don't await)
      db.insert(activityLogs).values({
        userId,
        action: "started_import",
        entityType: "investor",
        description: `Started importing investors from Folk CRM group`,
        metadata: { importRunId: importRun.id, groupId },
      }).catch(console.error);

      res.json(importRun);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Import companies from a specific Folk group (background job with real-time progress)
  app.post("/api/admin/folk/import/companies-from-group", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }

    try {
      // Create a default workspace if none exists
      await folkService.getOrCreateWorkspace("default", "Default Workspace");
      
      // Start import in background and return immediately
      const importRun = await folkService.startCompaniesImportFromGroup(groupId, userId);
      
      // Log activity asynchronously (don't await)
      db.insert(activityLogs).values({
        userId,
        action: "started_import",
        entityType: "company",
        description: `Started importing companies from Folk CRM group`,
        metadata: { importRunId: importRun.id, groupId },
      }).catch(console.error);

      res.json(importRun);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Import businessmen from a specific Folk group (background job with real-time progress)
  app.post("/api/admin/folk/import/businessmen-from-group", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }

    try {
      // Create a default workspace if none exists
      await folkService.getOrCreateWorkspace("default", "Default Workspace");
      
      // Start import in background and return immediately
      const importRun = await folkService.startBusinessmenImportFromGroup(groupId, userId);
      
      // Log activity asynchronously (don't await)
      db.insert(activityLogs).values({
        userId,
        action: "started_import",
        entityType: "businessman",
        description: `Started importing businessmen from Folk CRM group`,
        metadata: { importRunId: importRun.id, groupId },
      }).catch(console.error);

      res.json(importRun);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Import accelerators from Folk group - removes placeholder URLs like "https://company"
  app.post("/api/admin/folk/import/accelerators-from-group", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }

    try {
      // Create a default workspace if none exists
      await folkService.getOrCreateWorkspace("default", "Default Workspace");
      
      // Start import with URL cleanup and Accelerator classification
      const importRun = await folkService.startAcceleratorsImportFromGroup(groupId, userId);
      
      // Log activity asynchronously (don't await)
      db.insert(activityLogs).values({
        userId,
        action: "started_import",
        entityType: "company",
        description: `Started importing Accelerators from Folk CRM group`,
        metadata: { importRunId: importRun.id, groupId, classification: "Accelerator" },
      }).catch(console.error);

      res.json(importRun);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Import fund houses (AMCs) from a specific Folk group - auto-tags with Fund House(AMCs) & IFSC classification
  app.post("/api/admin/folk/import/fundhouses-from-group", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }

    try {
      // Create a default workspace if none exists
      await folkService.getOrCreateWorkspace("default", "Default Workspace");
      
      // Start import in background with Fund House(AMCs) & IFSC classification
      const importRun = await folkService.startCompaniesImportFromGroupWithClassification(
        groupId, 
        userId,
        "Fund House(AMCs) & IFSC"
      );
      
      // Log activity asynchronously (don't await)
      db.insert(activityLogs).values({
        userId,
        action: "started_import",
        entityType: "company",
        description: `Started importing Fund Houses/AMCs from Folk CRM group`,
        metadata: { importRunId: importRun.id, groupId, classification: "Fund House(AMCs) & IFSC" },
      }).catch(console.error);

      res.json(importRun);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Legacy import endpoint (kept for backwards compatibility)
  app.post("/api/admin/folk/import", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ success: false, message: "groupId is required" });
    }
    
    try {
      await folkService.getOrCreateWorkspace("default", "Default Workspace");
      
      const importRun = await folkService.importPeopleFromGroupWithTracking(groupId, userId);
      
      db.insert(activityLogs).values({
        userId,
        action: "imported",
        entityType: "investor",
        description: `Imported ${importRun.createdRecords || 0} new, updated ${importRun.updatedRecords || 0} investors from Folk CRM`,
        metadata: { importRunId: importRun.id, groupId },
      }).catch(console.error);
      
      res.json({
        success: true,
        firms: 0,
        contacts: (importRun.createdRecords || 0) + (importRun.updatedRecords || 0),
        recordsProcessed: importRun.processedRecords || 0,
        recordsCreated: importRun.createdRecords || 0,
        recordsUpdated: importRun.updatedRecords || 0,
        recordsFailed: importRun.failedRecords || 0,
        failed: importRun.failedRecords || 0,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ============ Folk Bulk Operations ============

  // Helper to validate and parse range parameters
  function parseRangeParams(body: any): { 
    groupId: string; 
    first?: number; 
    last?: number; 
    start?: number; 
    end?: number;
    error?: string;
  } {
    const { groupId, first, last, start, end } = body;
    
    if (!groupId || typeof groupId !== 'string') {
      return { groupId: '', error: "groupId is required" };
    }
    
    // Parse and validate numbers
    const parsedFirst = first ? parseInt(String(first)) : undefined;
    const parsedLast = last ? parseInt(String(last)) : undefined;
    const parsedStart = start ? parseInt(String(start)) : undefined;
    const parsedEnd = end ? parseInt(String(end)) : undefined;
    
    // Validate positive integers
    if (parsedFirst !== undefined && (isNaN(parsedFirst) || parsedFirst <= 0 || parsedFirst > 10000)) {
      return { groupId, error: "first must be a positive integer between 1 and 10000" };
    }
    if (parsedLast !== undefined && (isNaN(parsedLast) || parsedLast <= 0 || parsedLast > 10000)) {
      return { groupId, error: "last must be a positive integer between 1 and 10000" };
    }
    if (parsedStart !== undefined && (isNaN(parsedStart) || parsedStart <= 0)) {
      return { groupId, error: "start must be a positive integer" };
    }
    if (parsedEnd !== undefined && (isNaN(parsedEnd) || parsedEnd <= 0)) {
      return { groupId, error: "end must be a positive integer" };
    }
    if (parsedStart !== undefined && parsedEnd !== undefined && parsedStart > parsedEnd) {
      return { groupId, error: "start must be less than or equal to end" };
    }
    
    // Check mutual exclusivity
    const rangeTypeCount = [
      parsedFirst !== undefined,
      parsedLast !== undefined,
      (parsedStart !== undefined && parsedEnd !== undefined)
    ].filter(Boolean).length;
    
    if (rangeTypeCount > 1) {
      return { groupId, error: "Only one range type allowed: first, last, or start+end" };
    }
    
    return { groupId, first: parsedFirst, last: parsedLast, start: parsedStart, end: parsedEnd };
  }

  // Get people from Folk group with range selection (preview before operations)
  app.post("/api/admin/folk/bulk/preview", isAdmin, async (req: any, res) => {
    const params = parseRangeParams(req.body);
    
    if (params.error) {
      return res.status(400).json({ message: params.error });
    }
    
    try {
      const { people, total } = await folkService.getPeopleByGroupWithRange(params.groupId, {
        first: params.first,
        last: params.last,
        start: params.start,
        end: params.end,
      });
      
      // Extract relevant info for preview
      const preview = people.map(p => {
        const customFields = folkService.extractCustomFields(p);
        const email = Array.isArray(p.emails) && p.emails.length > 0
          ? (typeof p.emails[0] === 'string' ? p.emails[0] : (p.emails[0] as any)?.value)
          : null;
          
        return {
          folkId: p.id,
          name: p.fullName || p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Unknown',
          email,
          title: p.jobTitle,
          linkedinUrl: p.linkedinUrl,
          company: customFields.company || p.company,
          hasEmail: !!email,
        };
      });
      
      const withEmail = preview.filter(p => p.hasEmail).length;
      const withoutEmail = preview.filter(p => !p.hasEmail).length;
      
      res.json({
        success: true,
        total,
        selected: people.length,
        withEmail,
        withoutEmail,
        preview: preview.slice(0, 50), // Limit preview to first 50
      });
    } catch (error: any) {
      console.error("[Folk] Preview error:", error);
      res.status(500).json({ message: "Failed to preview Folk group data" });
    }
  });

  // Bulk enrich investors from Folk group with range selection
  app.post("/api/admin/folk/bulk/enrich", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const params = parseRangeParams(req.body);
    
    if (params.error) {
      return res.status(400).json({ message: params.error });
    }
    
    try {
      const { people, total } = await folkService.getPeopleByGroupWithRange(params.groupId, {
        first: params.first,
        last: params.last,
        start: params.start,
        end: params.end,
      });
      
      // Start enrichment process in background
      const enrichmentResults = { success: 0, failed: 0, errors: [] as string[] };
      
      // Log activity
      db.insert(activityLogs).values({
        userId,
        action: "started_bulk_enrichment",
        entityType: "investor",
        description: `Started bulk enrichment for ${people.length} investors from Folk group`,
        metadata: { groupId: params.groupId, totalSelected: people.length, totalInGroup: total },
      }).catch(console.error);
      
      // Process enrichment (simplified - just import to local DB)
      for (const person of people) {
        try {
          const existingInvestor = await storage.getInvestorByFolkId(person.id);
          const customFields = folkService.extractCustomFields(person);
          
          const email = Array.isArray(person.emails) && person.emails.length > 0
            ? (typeof person.emails[0] === 'string' ? person.emails[0] : (person.emails[0] as any)?.value)
            : undefined;
          const phone = Array.isArray(person.phones) && person.phones.length > 0
            ? (typeof person.phones[0] === 'string' ? person.phones[0] : (person.phones[0] as any)?.value)
            : undefined;
            
          const investorData: any = {
            firstName: person.firstName || person.fullName?.split(" ")[0] || person.name?.split(" ")[0] || "Unknown",
            lastName: person.lastName || person.fullName?.split(" ").slice(1).join(" ") || person.name?.split(" ").slice(1).join(" "),
            email,
            phone,
            title: person.jobTitle,
            linkedinUrl: person.linkedinUrl,
            folkId: person.id,
            folkWorkspaceId: params.groupId,
            folkCustomFields: customFields,
            source: "folk",
          };
          
          // Filter out undefined
          Object.keys(investorData).forEach(key => {
            if (investorData[key] === undefined) delete investorData[key];
          });
          
          if (existingInvestor) {
            await storage.updateInvestor(existingInvestor.id, investorData);
          } else {
            await storage.createInvestor(investorData);
          }
          enrichmentResults.success++;
        } catch (error: any) {
          enrichmentResults.failed++;
          enrichmentResults.errors.push(`${person.id}: ${error.message}`);
        }
      }
      
      res.json({
        success: true,
        totalProcessed: people.length,
        enriched: enrichmentResults.success,
        failed: enrichmentResults.failed,
        errors: enrichmentResults.errors.slice(0, 10),
      });
    } catch (error: any) {
      console.error("[Folk] Enrichment error:", error);
      res.status(500).json({ message: "Failed to enrich investors" });
    }
  });

  // Bulk email to investors from Folk group with range selection
  app.post("/api/admin/folk/bulk/email", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const { subject, htmlContent, textContent, testMode } = req.body;
    const params = parseRangeParams(req.body);
    
    if (params.error) {
      return res.status(400).json({ message: params.error });
    }
    if (!subject || !htmlContent) {
      return res.status(400).json({ message: "subject and htmlContent are required" });
    }
    
    try {
      const { sendOutreachEmail } = await import("./services/resend");
      
      const { people, total } = await folkService.getPeopleByGroupWithRange(params.groupId, {
        first: params.first,
        last: params.last,
        start: params.start,
        end: params.end,
      });
      
      // Filter to only those with email addresses
      const peopleWithEmail = people.filter(p => {
        const email = Array.isArray(p.emails) && p.emails.length > 0
          ? (typeof p.emails[0] === 'string' ? p.emails[0] : (p.emails[0] as any)?.value)
          : null;
        return !!email;
      });
      
      // In test mode, only send to first 3
      const toSend = testMode ? peopleWithEmail.slice(0, 3) : peopleWithEmail;
      
      // Log activity
      db.insert(activityLogs).values({
        userId,
        action: "started_bulk_email",
        entityType: "investor",
        description: `Started bulk email campaign to ${toSend.length} investors`,
        metadata: { groupId: params.groupId, totalSelected: toSend.length, testMode: !!testMode },
      }).catch(console.error);
      
      const emailResults = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };
      
      for (const person of toSend) {
        try {
          const email = Array.isArray(person.emails) && person.emails.length > 0
            ? (typeof person.emails[0] === 'string' ? person.emails[0] : (person.emails[0] as any)?.value)
            : null;
            
          if (!email) {
            emailResults.skipped++;
            continue;
          }
          
          // Personalize content
          const name = person.fullName || person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'there';
          const personalizedHtml = htmlContent
            .replace(/\{\{name\}\}/g, name)
            .replace(/\{\{firstName\}\}/g, person.firstName || name.split(' ')[0] || 'there')
            .replace(/\{\{company\}\}/g, person.company || 'your company');
          const personalizedSubject = subject
            .replace(/\{\{name\}\}/g, name)
            .replace(/\{\{firstName\}\}/g, person.firstName || name.split(' ')[0] || 'there');
          
          const result = await sendOutreachEmail(email, personalizedSubject, personalizedHtml, textContent, false);
          
          if (result.success) {
            emailResults.sent++;
          } else {
            emailResults.failed++;
            emailResults.errors.push(`${email}: ${result.error}`);
          }
          
          // Rate limit: 1 email per second
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error: any) {
          emailResults.failed++;
          emailResults.errors.push(`${person.id}: ${error.message}`);
        }
      }
      
      res.json({
        success: true,
        totalInGroup: total,
        totalWithEmail: peopleWithEmail.length,
        sent: emailResults.sent,
        failed: emailResults.failed,
        skipped: emailResults.skipped,
        testMode: !!testMode,
        errors: emailResults.errors.slice(0, 10),
      });
    } catch (error: any) {
      console.error("[Folk] Email campaign error:", error);
      res.status(500).json({ message: "Failed to send email campaign" });
    }
  });

  // Sync enriched data back to Folk
  app.post("/api/admin/folk/bulk/sync-to-folk", isAdmin, async (req: any, res) => {
    const userId = getUserId(req);
    const { investorIds, fields } = req.body;
    const params = parseRangeParams(req.body);
    
    if (params.error) {
      return res.status(400).json({ message: params.error });
    }
    
    try {
      // Get investors that have folkId and are from this group
      let investorsToSync: any[];
      if (investorIds && Array.isArray(investorIds) && investorIds.length > 0) {
        // Sync specific investors
        const results = await Promise.all(
          investorIds.map((id: number) => storage.getInvestorById(String(id)))
        );
        investorsToSync = results.filter((inv): inv is NonNullable<typeof inv> => inv != null && !!inv.folkId);
      } else {
        // Sync all investors from this Folk workspace
        const allInvestors = await db.select().from(investors)
          .where(eq(investors.folkWorkspaceId, params.groupId));
        investorsToSync = allInvestors.filter((inv): inv is NonNullable<typeof inv> => !!inv.folkId);
      }
      
      // Prepare updates for Folk
      const updates = investorsToSync.map(inv => {
        const customFields: Record<string, any> = {};
        
        // Map our fields to Folk custom fields
        if (fields?.includes('email') && inv.email) customFields['Email'] = inv.email;
        if (fields?.includes('phone') && inv.phone) customFields['Phone'] = inv.phone;
        if (fields?.includes('title') && inv.title) customFields['Title'] = inv.title;
        if (fields?.includes('linkedinUrl') && inv.linkedinUrl) customFields['Person Linkedin Url'] = inv.linkedinUrl;
        if (fields?.includes('investorType') && inv.investorType) customFields['Investor Type'] = inv.investorType;
        if (fields?.includes('investorCountry') && inv.investorCountry) customFields["Investor's Country"] = inv.investorCountry;
        if (fields?.includes('hqLocation') && inv.hqLocation) customFields['HQ Location'] = inv.hqLocation;
        if (fields?.includes('fundingStage') && inv.fundingStage) customFields['Funding Stage'] = inv.fundingStage;
        if (fields?.includes('typicalInvestment') && inv.typicalInvestment) customFields['Typical Investment'] = inv.typicalInvestment;
        if (fields?.includes('status') && inv.status) customFields['Status'] = inv.status;
        if (fields?.includes('website') && inv.website) customFields['Website'] = inv.website;
        
        return {
          folkId: inv.folkId!,
          customFields,
        };
      });
      
      // Log activity
      db.insert(activityLogs).values({
        userId,
        action: "sync_to_folk",
        entityType: "investor",
        description: `Syncing ${updates.length} investors back to Folk CRM`,
        metadata: { groupId: params.groupId, count: updates.length, fields },
      }).catch(console.error);
      
      // Bulk sync to Folk
      const result = await folkService.bulkSyncToFolk(params.groupId, updates);
      
      res.json({
        success: true,
        synced: result.success,
        failed: result.failed,
        errors: result.errors.slice(0, 10),
      });
    } catch (error: any) {
      console.error("[Folk] Sync to Folk error:", error);
      res.status(500).json({ message: "Failed to sync data to Folk CRM" });
    }
  });

  // Trigger Folk's native enrichment (via Dropcontact) for a range of people
  // Runs as a background job to avoid HTTP timeout
  app.post("/api/admin/folk/bulk/trigger-enrichment", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || 'system';
      const params = parseRangeParams(req.body);
      
      if (params.error) {
        return res.status(400).json({ message: params.error });
      }
      
      console.log(`[Folk] Starting background enrichment for group ${params.groupId}, range: start=${params.start}, end=${params.end}, first=${params.first}, last=${params.last}`);
      
      // Return immediately - this is a long-running operation
      res.json({
        success: true,
        message: `Enrichment job started in background. This may take several minutes depending on the number of contacts.`,
        status: "processing",
      });
      
      // Run enrichment in background (don't await)
      (async () => {
        try {
          const result = await folkService.bulkTriggerEnrichment(params.groupId, {
            first: params.first,
            last: params.last,
            start: params.start,
            end: params.end,
          });
          
          console.log(`[Folk] Enrichment complete: ${result.triggered} triggered, ${result.failed} failed`);
          
          // Log activity
          db.insert(activityLogs).values({
            userId,
            action: "triggered_folk_enrichment",
            entityType: "investor",
            description: `Triggered Folk enrichment for ${result.triggered} contacts`,
            metadata: { groupId: params.groupId, ...result },
          }).catch(console.error);
          
        } catch (error: any) {
          console.error("[Folk] Background enrichment error:", error);
          
          db.insert(activityLogs).values({
            userId,
            action: "folk_enrichment_failed",
            entityType: "investor",
            description: `Folk enrichment failed: ${error.message}`,
            metadata: { groupId: params.groupId, error: error.message },
          }).catch(console.error);
        }
      })();
    } catch (error: any) {
      console.error("[Folk] Trigger enrichment error:", error);
      res.status(500).json({ message: "Failed to start enrichment: " + error.message });
    }
  });

  // ============ Folk Field Discovery & AI Mapping ============
  
  // Discover fields from a Folk group (analyzes structure)
  app.post("/api/admin/folk/discover-fields", isAdmin, async (req: any, res) => {
    const { groupId, entityType = "person" } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }
    
    try {
      const { discoverFieldsFromFolkData } = await import("./services/fieldMatcher");
      
      console.log(`[Folk] Discovering ${entityType} fields for group: ${groupId}`);
      
      // First, try to get custom field definitions directly from Folk API
      const customFieldDefs = await folkService.getGroupCustomFields(groupId, entityType as "person" | "company");
      console.log(`[Folk] Got ${customFieldDefs.length} custom field definitions from Folk API`);
      
      // Fetch sample data based on entity type
      let records: any[] = [];
      if (entityType === "company") {
        const companiesRes = await folkService.getCompaniesByGroup(groupId, undefined, 50);
        records = companiesRes.data || [];
        console.log(`[Folk] Fetched ${records.length} companies from group`);
      } else {
        const peopleRes = await folkService.getPeopleByGroup(groupId, undefined, 50);
        records = peopleRes.data || [];
        console.log(`[Folk] Fetched ${records.length} people from group`);
      }
      
      // Pass both custom field definitions and sample data to field discovery
      const definitions = await discoverFieldsFromFolkData(groupId, records, customFieldDefs, entityType as "person" | "company");
      console.log(`[Folk] Discovered ${definitions.length} field definitions`);
      
      res.json({
        success: true,
        entityType,
        fieldsDiscovered: definitions.length,
        fields: definitions,
        customFieldsFromApi: customFieldDefs.length,
        sampleRecords: records.length,
      });
    } catch (error: any) {
      console.error("[Folk] Field discovery error:", error);
      res.status(500).json({ message: error.message || "Failed to discover fields" });
    }
  });
  
  // Get discovered field definitions for a group
  app.get("/api/admin/folk/field-definitions/:groupId", isAdmin, async (req, res) => {
    const { groupId } = req.params;
    
    try {
      const definitions = await storage.getFolkFieldDefinitions(groupId);
      res.json(definitions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Generate AI field mapping suggestions
  app.post("/api/admin/folk/generate-mappings", isAdmin, async (req: any, res) => {
    const { groupId, targetTable } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }
    
    try {
      const { generateAIFieldMappings, saveFieldMappings } = await import("./services/fieldMatcher");
      
      const result = await generateAIFieldMappings(groupId, targetTable || "investors");
      
      const savedMappings = await saveFieldMappings(groupId, result.suggestions);
      
      res.json({
        success: true,
        suggestions: result.suggestions,
        unmatchedFields: result.unmatchedFields,
        savedMappings: savedMappings.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get field mappings for a group
  app.get("/api/admin/folk/field-mappings/:groupId", isAdmin, async (req, res) => {
    const { groupId } = req.params;
    
    try {
      const mappings = await storage.getFolkFieldMappings(groupId);
      res.json(mappings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Update a field mapping
  app.patch("/api/admin/folk/field-mappings/:id", isAdmin, async (req: any, res) => {
    const { id } = req.params;
    const { targetColumn, storeInJson, transformType } = req.body;
    
    try {
      const updated = await storage.updateFolkFieldMapping(id, {
        targetColumn,
        storeInJson,
        transformType,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Approve a field mapping
  app.post("/api/admin/folk/field-mappings/:id/approve", isAdmin, async (req: any, res) => {
    const { id } = req.params;
    const userId = getUserId(req);
    
    try {
      const { approveFieldMapping } = await import("./services/fieldMatcher");
      const updated = await approveFieldMapping(id, userId);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Approve all field mappings for a group
  app.post("/api/admin/folk/field-mappings/:groupId/approve-all", isAdmin, async (req: any, res) => {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    try {
      const mappings = await storage.getFolkFieldMappings(groupId);
      console.log(`[Folk] Approving ${mappings.length} field mappings for group ${groupId}`);
      const approved = [];
      
      for (const mapping of mappings) {
        try {
          const updated = await storage.updateFolkFieldMapping(mapping.id, {
            isApproved: true,
            approvedBy: userId || null,
            approvedAt: new Date(),
          });
          if (updated) approved.push(updated);
        } catch (innerError: any) {
          console.error(`[Folk] Error approving mapping ${mapping.id}:`, innerError.message);
        }
      }
      
      res.json({ success: true, approvedCount: approved.length });
    } catch (error: any) {
      console.error("[Folk] Error in approve-all:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Delete a field mapping
  app.delete("/api/admin/folk/field-mappings/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
      await storage.deleteFolkFieldMapping(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Folk Failed Records ============
  
  // Get failed records for a run
  app.get("/api/admin/folk/failed-records", isAdmin, async (req, res) => {
    const { runId } = req.query;
    
    try {
      if (runId) {
        const records = await storage.getFolkFailedRecords(runId as string);
        res.json(records);
      } else {
        const records = await storage.getUnresolvedFolkFailedRecords();
        res.json(records);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Retry a failed record
  app.post("/api/admin/folk/failed-records/:id/retry", isAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
      const success = await folkService.retryFailedRecord(id);
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete a failed record (mark as resolved without retry)
  app.delete("/api/admin/folk/failed-records/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
      await storage.deleteFolkFailedRecord(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ User Management ============
  
  // Get all users
  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      res.json(allUsers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update user
  app.patch("/api/admin/users/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    const { isAdmin: adminStatus, userType } = req.body;
    
    try {
      const [user] = await db.update(users)
        .set({ 
          isAdmin: adminStatus,
          userType,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete user
  app.delete("/api/admin/users/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
      await db.delete(users).where(eq(users.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Analytics ============
  
  app.get("/api/admin/analytics", isAdmin, async (req, res) => {
    try {
      const [userCount] = await db.select({ count: count() }).from(users);
      const [investorCount] = await db.select({ count: count() }).from(investors);
      const [startupCount] = await db.select({ count: count() }).from(startups);
      const [dealCount] = await db.select({ count: count() }).from(deals);
      const [contactCount] = await db.select({ count: count() }).from(contacts);
      const [firmCount] = await db.select({ count: count() }).from(investmentFirms);
      
      // Recent activity
      const recentActivity = await db.select()
        .from(activityLogs)
        .orderBy(desc(activityLogs.createdAt))
        .limit(10);

      // Sync history
      const recentSyncs = await db.select()
        .from(syncLogs)
        .orderBy(desc(syncLogs.startedAt))
        .limit(5);

      res.json({
        counts: {
          users: userCount.count,
          investors: investorCount.count,
          startups: startupCount.count,
          deals: dealCount.count,
          contacts: contactCount.count,
          firms: firmCount.count,
        },
        recentActivity,
        recentSyncs,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Activity Logs ============
  
  app.get("/api/admin/activity-logs", isAdmin, async (req, res) => {
    const { limit = 50, offset = 0 } = req.query;
    
    try {
      const logs = await db.select()
        .from(activityLogs)
        .orderBy(desc(activityLogs.createdAt))
        .limit(Number(limit))
        .offset(Number(offset));
      
      const [total] = await db.select({ count: count() }).from(activityLogs);
      
      res.json({ logs, total: total.count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Sync Logs ============
  
  app.get("/api/admin/sync-logs", isAdmin, async (req, res) => {
    try {
      const logs = await db.select()
        .from(syncLogs)
        .orderBy(desc(syncLogs.startedAt))
        .limit(50);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ System Settings ============
  
  app.get("/api/admin/settings", isAdmin, async (req, res) => {
    try {
      const settings = await db.select().from(systemSettings);
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/admin/settings/:key", isAdmin, async (req: any, res) => {
    const { key } = req.params;
    const { value, description } = req.body;
    const userId = getUserId(req);
    
    try {
      const [setting] = await db
        .insert(systemSettings)
        .values({ key, value, description, updatedBy: userId })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value, description, updatedBy: userId, updatedAt: new Date() },
        })
        .returning();
      res.json(setting);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Database Management ============
  
  // Get database stats
  app.get("/api/admin/database/stats", isAdmin, async (req, res) => {
    try {
      const stats = await Promise.all([
        db.select({ count: count() }).from(investors),
        db.select({ count: count() }).from(startups),
        db.select({ count: count() }).from(contacts),
        db.select({ count: count() }).from(deals),
        db.select({ count: count() }).from(investmentFirms),
        db.select({ count: count() }).from(users),
      ]);

      res.json({
        investors: stats[0][0].count,
        startups: stats[1][0].count,
        contacts: stats[2][0].count,
        deals: stats[3][0].count,
        firms: stats[4][0].count,
        users: stats[5][0].count,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Bulk operations on entities
  app.delete("/api/admin/database/investors", isAdmin, async (req: any, res) => {
    const { ids } = req.body;
    const userId = getUserId(req);
    
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ message: "ids array required" });
    }
    
    try {
      for (const id of ids) {
        await db.delete(investors).where(eq(investors.id, id));
      }
      
      await db.insert(activityLogs).values({
        userId,
        action: "deleted",
        entityType: "investor",
        description: `Bulk deleted ${ids.length} investors`,
        metadata: { ids },
      });
      
      res.json({ success: true, deleted: ids.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Duplicate Detection ============

  // Run duplicate scan
  app.post("/api/admin/duplicates/scan", isAdmin, async (req: any, res) => {
    const { entityType } = req.body;
    const userId = getUserId(req);
    
    try {
      const result = await deduplicationService.runDuplicateScan(
        entityType || "investor",
        userId
      );
      
      await db.insert(activityLogs).values({
        userId,
        action: "created",
        entityType: "duplicate_scan",
        description: `Scanned for ${entityType} duplicates: found ${result.found}, created ${result.created} new`,
        metadata: result,
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get potential duplicates
  app.get("/api/admin/duplicates", isAdmin, async (req, res) => {
    const { entityType, status } = req.query;
    
    try {
      const duplicates = await storage.getPotentialDuplicates(
        entityType as string | undefined,
        status as string | undefined
      );
      
      const enrichedDuplicates = await Promise.all(
        duplicates.map(async (dup) => {
          let entity1: any = null;
          let entity2: any = null;
          
          if (dup.entityType === "investor") {
            [entity1, entity2] = await Promise.all([
              storage.getInvestorById(dup.entity1Id),
              storage.getInvestorById(dup.entity2Id),
            ]);
          } else if (dup.entityType === "contact") {
            [entity1, entity2] = await Promise.all([
              storage.getContactById(dup.entity1Id),
              storage.getContactById(dup.entity2Id),
            ]);
          }
          
          return { ...dup, entity1, entity2 };
        })
      );
      
      res.json(enrichedDuplicates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Merge duplicates
  app.post("/api/admin/duplicates/:id/merge", isAdmin, async (req: any, res) => {
    const { id } = req.params;
    const { primaryId, duplicateId } = req.body;
    const userId = getUserId(req);
    
    try {
      const duplicate = await storage.getPotentialDuplicateById(id);
      if (!duplicate) {
        return res.status(404).json({ message: "Duplicate record not found" });
      }
      
      if (duplicate.entityType === "investor") {
        const merged = await deduplicationService.mergeInvestors(primaryId, duplicateId, userId);
        
        await db.insert(activityLogs).values({
          userId,
          action: "merged",
          entityType: "investor",
          entityId: primaryId,
          description: `Merged investor ${duplicateId} into ${primaryId}`,
          metadata: { primaryId, duplicateId },
        });
        
        res.json(merged);
      } else {
        res.status(400).json({ message: "Only investor merging is supported" });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Dismiss duplicate
  app.post("/api/admin/duplicates/:id/dismiss", isAdmin, async (req: any, res) => {
    const { id } = req.params;
    const userId = getUserId(req);
    
    try {
      await deduplicationService.dismissDuplicate(id, userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ AI Enrichment ============

  // Create enrichment job
  app.post("/api/admin/enrichment/jobs", isAdmin, async (req: any, res) => {
    const { entityType, entityId, enrichmentType } = req.body;
    
    try {
      const job = await mistralService.createEnrichmentJob(
        entityType,
        entityId,
        enrichmentType || "full_profile"
      );
      res.json(job);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get enrichment jobs
  app.get("/api/admin/enrichment/jobs", isAdmin, async (req, res) => {
    const { entityType, status } = req.query;
    
    try {
      const jobs = await storage.getEnrichmentJobs(
        entityType as string | undefined,
        status as string | undefined
      );
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single enrichment job
  app.get("/api/admin/enrichment/jobs/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
      const job = await storage.getEnrichmentJobById(id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(job);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Apply enrichment suggestions
  app.post("/api/admin/enrichment/jobs/:id/apply", isAdmin, async (req: any, res) => {
    const { id } = req.params;
    const userId = getUserId(req);
    
    try {
      await mistralService.applyEnrichmentSuggestions(id, userId);
      
      const job = await storage.getEnrichmentJobById(id);
      
      await db.insert(activityLogs).values({
        userId,
        action: "updated",
        entityType: job?.entityType || "unknown",
        entityId: job?.entityId,
        description: `Applied AI enrichment suggestions`,
        metadata: { jobId: id },
      });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Batch enrich investors
  app.post("/api/admin/enrichment/batch/investors", isAdmin, async (req: any, res) => {
    const { investorIds } = req.body;
    const userId = getUserId(req);
    
    try {
      const jobs = [];
      for (const investorId of investorIds || []) {
        const job = await mistralService.createEnrichmentJob("investor", investorId, "full_profile");
        jobs.push(job);
      }
      
      await db.insert(activityLogs).values({
        userId,
        action: "created",
        entityType: "enrichment_batch",
        description: `Started batch enrichment for ${jobs.length} investors`,
        metadata: { investorIds, jobCount: jobs.length },
      });
      
      res.json({ jobs, count: jobs.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get enrichment jobs for specific entity
  app.get("/api/admin/enrichment/entity/:entityType/:entityId", isAdmin, async (req, res) => {
    const { entityType, entityId } = req.params;
    
    try {
      const jobs = await storage.getEnrichmentJobsByEntity(entityType, entityId);
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Firm type normalization utility
  const firmTypeNormalization: Record<string, string> = {
    "VC": "Venture Capital",
    "Venture Capital": "Venture Capital",
    "CVC": "Corporate Venture Capital",
    "Corporate VC": "Corporate Venture Capital",
    "Corporate Venture Capital": "Corporate Venture Capital",
    "Family Office": "Family Office",
    "Single Family Office": "Family Office",
    "Multi-Family Office": "Family Office",
    "Angel": "Angel Investor",
    "Angel Investor": "Angel Investor",
    "Angel Group": "Angel Group/Network",
    "Angel Network": "Angel Group/Network",
    "Syndicate": "Syndicate",
    "Fund of Funds": "Fund of Funds",
    "FoF": "Fund of Funds",
    "PE": "Private Equity",
    "Private Equity": "Private Equity",
    "Growth Equity": "Growth Equity",
    "Hedge Fund": "Hedge Fund",
    "Accelerator": "Accelerator/Incubator",
    "Incubator": "Accelerator/Incubator",
    "Micro VC": "Micro VC",
    "Impact": "Impact/ESG Fund",
    "ESG": "Impact/ESG Fund",
  };

  const normalizeFirmType = (type: string | undefined): string => {
    if (!type) return "Venture Capital";
    const normalized = firmTypeNormalization[type];
    if (normalized) return normalized;
    const titleCase = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    return firmTypeNormalization[titleCase] || type;
  };

  // CSV Import Routes
  app.post("/api/admin/import/investors", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const { records, mode } = req.body;
    
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ message: "Invalid records array" });
    }

    try {
      let firmsCreated = 0;
      let contactsCreated = 0;
      let failed = 0;
      let skipped = 0;

      for (const record of records) {
        try {
          if (mode === "contacts") {
            // Validate required fields for contacts
            const fullName = record.full_name || record.name;
            if (!fullName || fullName.trim() === "") {
              skipped++;
              continue;
            }
            const nameParts = fullName.trim().split(' ');
            await db.insert(contacts).values({
              ownerId: userId || "system",
              type: "investor",
              firstName: nameParts[0] || "Unknown",
              lastName: nameParts.slice(1).join(' ') || null,
              email: record.email || null,
              phone: record.phone || null,
              company: record.firm_name || null,
              title: record.title || null,
              linkedinUrl: record.linkedin_url || null,
              notes: record.notes || null,
            });
            contactsCreated++;
          } else {
            // Validate required fields for firms
            if (!record.company_name || record.company_name.trim() === "") {
              skipped++;
              continue;
            }
            
            // Check if firm already exists
            const existingFirm = await db.query.investmentFirms.findFirst({
              where: eq(investmentFirms.name, record.company_name.trim()),
            });
            
            if (!existingFirm) {
              await db.insert(investmentFirms).values({
                name: record.company_name.trim(),
                type: normalizeFirmType(record.firm_type),
                website: record.website || null,
                linkedinUrl: record.linkedin_url || null,
                description: record.firm_description || null,
                sectors: record.investment_focus ? [record.investment_focus] : [],
                stages: record.investment_stages ? [record.investment_stages] : [],
                checkSizeMin: record.check_size_min || null,
                checkSizeMax: record.check_size_max || null,
                typicalCheckSize: record.typical_investment || null,
                aum: record.aum ? String(record.aum) : null,
                location: record.city ? `${record.city}${record.country ? ', ' + record.country : ''}` : null,
                source: "csv_import",
              });
              firmsCreated++;
            } else {
              skipped++; // Already exists
            }
          }
        } catch (err: any) {
          console.error("CSV import record error:", err.message);
          failed++;
        }
      }

      await db.insert(activityLogs).values({
        userId,
        action: "imported",
        entityType: mode === "contacts" ? "contact" : "investment_firm",
        description: `CSV import: ${firmsCreated} firms, ${contactsCreated} contacts created, ${skipped} skipped, ${failed} failed`,
        metadata: { recordCount: records.length, firmsCreated, contactsCreated, skipped, failed },
      });

      res.json({ firmsCreated, contactsCreated, skipped, failed, total: records.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/import/contacts", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const { records } = req.body;
    
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ message: "Invalid records array" });
    }

    try {
      let contactsCreated = 0;
      let failed = 0;

      for (const record of records) {
        try {
          const fullName = record.full_name || record.name || "Unknown";
          const nameParts = fullName.split(' ');
          await db.insert(contacts).values({
            ownerId: userId || "system",
            type: "investor",
            firstName: nameParts[0] || "Unknown",
            lastName: nameParts.slice(1).join(' ') || null,
            email: record.email || null,
            phone: record.phone || null,
            company: record.firm_name || null,
            title: record.title || null,
            linkedinUrl: record.linkedin_url || null,
            notes: record.notes || null,
          });
          contactsCreated++;
        } catch (err: any) {
          console.error("CSV contact import error:", err.message);
          failed++;
        }
      }

      await db.insert(activityLogs).values({
        userId,
        action: "imported",
        entityType: "contact",
        description: `CSV import: ${contactsCreated} contacts created, ${failed} failed`,
        metadata: { recordCount: records.length, contactsCreated, failed },
      });

      res.json({ firmsCreated: 0, contactsCreated, failed, total: records.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Smart Import - Unified import with deduplication and field filling
  app.post("/api/admin/import/smart", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const { records, firms, contacts: contactRecords } = req.body;
    
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ message: "Invalid records array" });
    }

    try {
      let created = 0;
      let updated = 0;
      let merged = 0;
      let archived = 0;
      let skipped = 0;
      let failed = 0;
      let duplicatesFound = 0;
      let fieldsFilled = 0;

      // Helper function to count non-null fields in a record
      const countFields = (record: Record<string, any>): number => {
        return Object.values(record).filter(v => 
          v !== null && v !== undefined && v !== "" && 
          !(Array.isArray(v) && v.length === 0)
        ).length;
      };

      // Process investment firms
      if (firms && Array.isArray(firms)) {
        for (const firmRecord of firms) {
          try {
            if (!firmRecord.company_name || firmRecord.company_name.trim() === "") {
              skipped++;
              continue;
            }

            const firmName = firmRecord.company_name.trim();
            
            // Check for existing firm by name (case insensitive)
            const existingFirm = await db.query.investmentFirms.findFirst({
              where: sql`LOWER(${investmentFirms.name}) = LOWER(${firmName})`,
            });

            if (existingFirm) {
              duplicatesFound++;
              
              // Count fields in both records
              const newFieldCount = countFields(firmRecord);
              const existingFieldCount = countFields(existingFirm);

              if (newFieldCount > existingFieldCount) {
                // New record has more data - archive old, insert new
                await db.insert(archivedInvestmentFirms).values({
                  originalId: existingFirm.id,
                  mergedIntoId: null, // Will be set after new insert
                  name: existingFirm.name,
                  description: existingFirm.description,
                  website: existingFirm.website,
                  logo: existingFirm.logo,
                  type: existingFirm.type,
                  aum: existingFirm.aum,
                  location: existingFirm.location,
                  hqLocation: existingFirm.hqLocation,
                  stages: existingFirm.stages,
                  sectors: existingFirm.sectors,
                  industry: existingFirm.industry,
                  checkSizeMin: existingFirm.checkSizeMin,
                  checkSizeMax: existingFirm.checkSizeMax,
                  linkedinUrl: existingFirm.linkedinUrl,
                  twitterUrl: existingFirm.twitterUrl,
                  emails: existingFirm.emails,
                  phones: existingFirm.phones,
                  source: existingFirm.source,
                  archiveReason: "duplicate_less_complete",
                  fieldCount: existingFieldCount,
                  archivedBy: userId,
                });
                
                // Delete old and insert new
                await db.delete(investmentFirms).where(eq(investmentFirms.id, existingFirm.id));
                await db.insert(investmentFirms).values({
                  name: firmName,
                  type: normalizeFirmType(firmRecord.firm_type),
                  website: firmRecord.website || existingFirm.website,
                  linkedinUrl: firmRecord.linkedin_url || existingFirm.linkedinUrl,
                  description: firmRecord.description || existingFirm.description,
                  sectors: firmRecord.investment_focus ? [firmRecord.investment_focus] : existingFirm.sectors,
                  stages: firmRecord.investment_stages ? [firmRecord.investment_stages] : existingFirm.stages,
                  checkSizeMin: firmRecord.check_size_min || existingFirm.checkSizeMin,
                  checkSizeMax: firmRecord.check_size_max || existingFirm.checkSizeMax,
                  aum: firmRecord.aum ? String(firmRecord.aum) : existingFirm.aum,
                  location: firmRecord.city 
                    ? `${firmRecord.city}${firmRecord.country ? ', ' + firmRecord.country : ''}`
                    : existingFirm.location,
                  source: "smart_import",
                });
                
                archived++;
                merged++;
              } else {
                // Existing record has more or equal data - fill missing fields only
                const updateFields: Record<string, any> = {};
                
                if (!existingFirm.website && firmRecord.website) {
                  updateFields.website = firmRecord.website;
                  fieldsFilled++;
                }
                if (!existingFirm.linkedinUrl && firmRecord.linkedin_url) {
                  updateFields.linkedinUrl = firmRecord.linkedin_url;
                  fieldsFilled++;
                }
                if (!existingFirm.description && firmRecord.description) {
                  updateFields.description = firmRecord.description;
                  fieldsFilled++;
                }
                if (!existingFirm.type && firmRecord.firm_type) {
                  updateFields.type = normalizeFirmType(firmRecord.firm_type);
                  fieldsFilled++;
                }
                if ((!existingFirm.sectors || existingFirm.sectors.length === 0) && firmRecord.investment_focus) {
                  updateFields.sectors = [firmRecord.investment_focus];
                  fieldsFilled++;
                }
                if ((!existingFirm.stages || existingFirm.stages.length === 0) && firmRecord.investment_stages) {
                  updateFields.stages = [firmRecord.investment_stages];
                  fieldsFilled++;
                }
                if (!existingFirm.checkSizeMin && firmRecord.check_size_min) {
                  updateFields.checkSizeMin = firmRecord.check_size_min;
                  fieldsFilled++;
                }
                if (!existingFirm.checkSizeMax && firmRecord.check_size_max) {
                  updateFields.checkSizeMax = firmRecord.check_size_max;
                  fieldsFilled++;
                }
                if (!existingFirm.aum && firmRecord.aum) {
                  updateFields.aum = String(firmRecord.aum);
                  fieldsFilled++;
                }
                if (!existingFirm.location && firmRecord.city) {
                  updateFields.location = `${firmRecord.city}${firmRecord.country ? ', ' + firmRecord.country : ''}`;
                  fieldsFilled++;
                }

                if (Object.keys(updateFields).length > 0) {
                  await db.update(investmentFirms)
                    .set({ ...updateFields, updatedAt: new Date() })
                    .where(eq(investmentFirms.id, existingFirm.id));
                  updated++;
                } else {
                  skipped++;
                }
              }
            } else {
              // New firm - insert
              await db.insert(investmentFirms).values({
                name: firmName,
                type: normalizeFirmType(firmRecord.firm_type),
                website: firmRecord.website || null,
                linkedinUrl: firmRecord.linkedin_url || null,
                description: firmRecord.description || null,
                sectors: firmRecord.investment_focus ? [firmRecord.investment_focus] : [],
                stages: firmRecord.investment_stages ? [firmRecord.investment_stages] : [],
                checkSizeMin: firmRecord.check_size_min || null,
                checkSizeMax: firmRecord.check_size_max || null,
                aum: firmRecord.aum ? String(firmRecord.aum) : null,
                location: firmRecord.city 
                  ? `${firmRecord.city}${firmRecord.country ? ', ' + firmRecord.country : ''}`
                  : null,
                source: "smart_import",
              });
              created++;
            }
          } catch (err: any) {
            console.error("Smart import firm error:", err.message);
            failed++;
          }
        }
      }

      // Process contacts
      if (contactRecords && Array.isArray(contactRecords)) {
        for (const contactRecord of contactRecords) {
          try {
            const fullName = contactRecord.full_name || 
              `${contactRecord.first_name || ''} ${contactRecord.last_name || ''}`.trim();
            
            if (!fullName || fullName === "") {
              skipped++;
              continue;
            }

            const email = contactRecord.email;
            
            // Check for existing contact by email (if provided) or by full name
            let existingContact = null;
            if (email) {
              existingContact = await db.query.contacts.findFirst({
                where: sql`LOWER(${contacts.email}) = LOWER(${email})`,
              });
            }
            if (!existingContact) {
              const nameParts = fullName.split(' ');
              const firstName = nameParts[0];
              const lastName = nameParts.slice(1).join(' ');
              existingContact = await db.query.contacts.findFirst({
                where: sql`LOWER(${contacts.firstName}) = LOWER(${firstName}) AND LOWER(${contacts.lastName}) = LOWER(${lastName || ''})`,
              });
            }

            if (existingContact) {
              duplicatesFound++;
              
              const newFieldCount = countFields(contactRecord);
              const existingFieldCount = countFields(existingContact);

              if (newFieldCount > existingFieldCount) {
                // Archive old, insert new
                await db.insert(archivedContacts).values({
                  originalId: existingContact.id,
                  ownerId: existingContact.ownerId,
                  type: existingContact.type,
                  firstName: existingContact.firstName,
                  lastName: existingContact.lastName,
                  email: existingContact.email,
                  phone: existingContact.phone,
                  company: existingContact.company,
                  title: existingContact.title,
                  linkedinUrl: existingContact.linkedinUrl,
                  notes: existingContact.notes,
                  source: "existing",
                  archiveReason: "duplicate_less_complete",
                  fieldCount: existingFieldCount,
                  archivedBy: userId,
                });

                await db.delete(contacts).where(eq(contacts.id, existingContact.id));
                
                const nameParts = fullName.split(' ');
                await db.insert(contacts).values({
                  ownerId: userId || "system",
                  type: "investor",
                  firstName: nameParts[0] || "Unknown",
                  lastName: nameParts.slice(1).join(' ') || null,
                  email: email || existingContact.email,
                  phone: contactRecord.phone || existingContact.phone,
                  company: contactRecord.company_name || contactRecord.firm_name || existingContact.company,
                  title: contactRecord.title || existingContact.title,
                  linkedinUrl: contactRecord.linkedin_url || existingContact.linkedinUrl,
                  notes: contactRecord.notes || existingContact.notes,
                });

                archived++;
                merged++;
              } else {
                // Fill missing fields
                const updateFields: Record<string, any> = {};
                
                if (!existingContact.email && email) {
                  updateFields.email = email;
                  fieldsFilled++;
                }
                if (!existingContact.phone && contactRecord.phone) {
                  updateFields.phone = contactRecord.phone;
                  fieldsFilled++;
                }
                if (!existingContact.company && (contactRecord.company_name || contactRecord.firm_name)) {
                  updateFields.company = contactRecord.company_name || contactRecord.firm_name;
                  fieldsFilled++;
                }
                if (!existingContact.title && contactRecord.title) {
                  updateFields.title = contactRecord.title;
                  fieldsFilled++;
                }
                if (!existingContact.linkedinUrl && contactRecord.linkedin_url) {
                  updateFields.linkedinUrl = contactRecord.linkedin_url;
                  fieldsFilled++;
                }
                if (!existingContact.notes && contactRecord.notes) {
                  updateFields.notes = contactRecord.notes;
                  fieldsFilled++;
                }

                if (Object.keys(updateFields).length > 0) {
                  await db.update(contacts)
                    .set({ ...updateFields, updatedAt: new Date() })
                    .where(eq(contacts.id, existingContact.id));
                  updated++;
                } else {
                  skipped++;
                }
              }
            } else {
              // New contact
              const nameParts = fullName.split(' ');
              await db.insert(contacts).values({
                ownerId: userId || "system",
                type: "investor",
                firstName: nameParts[0] || "Unknown",
                lastName: nameParts.slice(1).join(' ') || null,
                email: email || null,
                phone: contactRecord.phone || null,
                company: contactRecord.company_name || contactRecord.firm_name || null,
                title: contactRecord.title || null,
                linkedinUrl: contactRecord.linkedin_url || null,
                notes: contactRecord.notes || null,
              });
              created++;
            }
          } catch (err: any) {
            console.error("Smart import contact error:", err.message);
            failed++;
          }
        }
      }

      await db.insert(activityLogs).values({
        userId,
        action: "smart_imported",
        entityType: "mixed",
        description: `Smart import: ${created} created, ${updated} updated, ${merged} merged, ${archived} archived, ${skipped} skipped, ${failed} failed`,
        metadata: { 
          recordCount: records.length, 
          created, updated, merged, archived, skipped, failed,
          duplicatesFound, fieldsFilled
        },
      });

      res.json({ 
        created, updated, merged, archived, skipped, failed, 
        total: records.length, duplicatesFound, fieldsFilled 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Missing Records Scanner - Find Folk records not in local database
  app.post("/api/admin/folk/scan-missing", isAdmin, async (req: any, res) => {
    const { groupId } = req.body;

    try {
      // Fetch from Folk using getPeopleByGroup
      const folkPeopleRes = await folkService.getPeopleByGroup(groupId);
      const folkPeople = folkPeopleRes.data || [];
      
      // Get existing records by folkId
      const existingInvestors = await db.query.investors.findMany({
        columns: { folkId: true },
        where: sql`${investors.folkId} IS NOT NULL`,
      });
      const existingFolkIds = new Set(existingInvestors.map((i: any) => i.folkId));
      
      // Find missing
      const missingPeople = folkPeople.filter((p: any) => !existingFolkIds.has(p.id));
      
      res.json({
        totalInFolk: folkPeople.length,
        existingInLocal: existingFolkIds.size,
        missing: missingPeople.length,
        missingRecords: missingPeople.slice(0, 50), // Return first 50 for preview
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Fill missing records from Folk
  app.post("/api/admin/folk/fill-missing", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const { missingRecords } = req.body;

    if (!missingRecords || !Array.isArray(missingRecords)) {
      return res.status(400).json({ message: "Invalid missing records" });
    }

    try {
      let created = 0;
      let failed = 0;

      for (const person of missingRecords) {
        try {
          const fullName = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim() || "Unknown";
          const nameParts = fullName.split(' ');
          await db.insert(investors).values({
            folkId: person.id,
            firstName: nameParts[0] || "Unknown",
            lastName: nameParts.slice(1).join(' ') || null,
            email: person.emails?.[0] || null,
            linkedinUrl: person.urls?.find((u: string) => u.includes('linkedin.com')) || null,
            title: person.jobTitle || null,
            source: "folk",
          });
          created++;
        } catch (err: any) {
          console.error("Fill missing error:", err.message);
          failed++;
        }
      }

      await db.insert(activityLogs).values({
        userId,
        action: "imported",
        entityType: "investor",
        description: `Filled ${created} missing Folk records, ${failed} failed`,
        metadata: { created, failed },
      });

      res.json({ created, failed });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Sync local changes back to Folk
  app.post("/api/admin/folk/sync-to-folk", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const { investorIds } = req.body;

    if (!investorIds || !Array.isArray(investorIds)) {
      return res.status(400).json({ message: "Invalid investor IDs" });
    }

    try {
      let synced = 0;
      let failed = 0;

      for (const investorId of investorIds) {
        try {
          const investor = await db.query.investors.findFirst({
            where: eq(investors.id, investorId),
          });

          if (investor && investor.folkId) {
            await folkService.updatePerson(investor.folkId, {
              firstName: investor.firstName,
              lastName: investor.lastName || undefined,
              emails: investor.email ? [investor.email] : [],
              jobTitle: investor.title || undefined,
            });
            synced++;
          }
        } catch (err: any) {
          console.error("Sync to Folk error:", err.message);
          failed++;
        }
      }

      await db.insert(activityLogs).values({
        userId,
        action: "synced",
        entityType: "investor",
        description: `Synced ${synced} investors to Folk, ${failed} failed`,
        metadata: { synced, failed },
      });

      res.json({ synced, failed });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Folk sync settings
  app.get("/api/admin/folk/settings", isAdmin, async (req, res) => {
    try {
      const settings = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.key, "folk_sync_settings"),
      });
      const parsed = settings?.value ? JSON.parse(settings.value) : {};
      res.json(parsed);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/folk/settings", isAdmin, async (req: any, res) => {
    const { syncFields, selectedGroup, syncInterval } = req.body;

    try {
      const existingSettings = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.key, "folk_sync_settings"),
      });

      const settingsValue = JSON.stringify({ syncFields, selectedGroup, syncInterval });

      if (existingSettings) {
        await db.update(systemSettings)
          .set({ value: settingsValue, updatedAt: new Date() })
          .where(eq(systemSettings.key, "folk_sync_settings"));
      } else {
        await db.insert(systemSettings).values({
          key: "folk_sync_settings",
          value: settingsValue,
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Investor CRUD Routes ============
  
  // Create investor
  app.post("/api/admin/investors", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const data = req.body;
    
    try {
      const [investor] = await db.insert(investors).values({
        firstName: data.firstName,
        lastName: data.lastName || null,
        email: data.email || null,
        phone: data.phone || null,
        title: data.title || null,
        linkedinUrl: data.linkedinUrl || null,
        investorType: data.investorType || null,
        investorState: data.investorState || null,
        fundingStage: data.fundingStage || null,
        typicalInvestment: data.typicalInvestment || null,
        bio: data.bio || null,
        location: data.location || null,
        source: data.source || "manual",
      }).returning();
      
      await db.insert(activityLogs).values({
        userId,
        action: "created",
        entityType: "investor",
        entityId: investor.id,
        description: `Created investor: ${data.firstName} ${data.lastName || ""}`,
      });
      
      res.json(investor);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update investor
  app.patch("/api/admin/investors/:id", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const data = req.body;
    
    try {
      const [investor] = await db.update(investors)
        .set({
          firstName: data.firstName,
          lastName: data.lastName || null,
          email: data.email || null,
          phone: data.phone || null,
          title: data.title || null,
          linkedinUrl: data.linkedinUrl || null,
          investorType: data.investorType || null,
          investorState: data.investorState || null,
          fundingStage: data.fundingStage || null,
          typicalInvestment: data.typicalInvestment || null,
          bio: data.bio || null,
          location: data.location || null,
          updatedAt: new Date(),
        })
        .where(eq(investors.id, id))
        .returning();
      
      await db.insert(activityLogs).values({
        userId,
        action: "updated",
        entityType: "investor",
        entityId: id,
        description: `Updated investor: ${data.firstName} ${data.lastName || ""}`,
      });
      
      res.json(investor);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get investor by ID
  app.get("/api/admin/investors/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
      const investor = await db.query.investors.findFirst({
        where: eq(investors.id, id),
      });
      
      if (!investor) {
        return res.status(404).json({ message: "Investor not found" });
      }
      
      res.json(investor);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete investor
  app.delete("/api/admin/investors/:id", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    
    try {
      const investor = await db.query.investors.findFirst({
        where: eq(investors.id, id),
      });
      
      if (!investor) {
        return res.status(404).json({ message: "Investor not found" });
      }
      
      await db.delete(investors).where(eq(investors.id, id));
      
      await db.insert(activityLogs).values({
        userId,
        action: "deleted",
        entityType: "investor",
        entityId: id,
        description: `Deleted investor: ${investor.firstName} ${investor.lastName || ""}`,
      });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Deep Research / Batch Enrichment ============

  // Start batch enrichment for firms
  app.post("/api/admin/enrichment/batch/start", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const { batchSize = 10, onlyUnclassified = false, onlyMissingData = true, enrichmentType = "full_enrichment" } = req.body;
    
    try {
      const existingJob = await mistralService.getActiveBatchJob();
      if (existingJob) {
        return res.status(400).json({ 
          message: "A batch enrichment job is already in progress",
          jobId: existingJob.id 
        });
      }

      const job = await mistralService.startBatchEnrichment(
        userId,
        "firm",
        enrichmentType,
        batchSize,
        onlyUnclassified,
        onlyMissingData
      );

      await db.insert(activityLogs).values({
        userId,
        action: "started",
        entityType: "batch_enrichment",
        entityId: job.id,
        description: `Started full data enrichment for ${job.totalRecords} firms`,
      });

      res.json(job);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get active batch job - MUST come before :jobId route
  app.get("/api/admin/enrichment/batch/active", isAdmin, async (req: any, res) => {
    try {
      const job = await mistralService.getActiveBatchJob();
      res.json({ job });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get batch enrichment job status
  app.get("/api/admin/enrichment/batch/:jobId", isAdmin, async (req: any, res) => {
    const { jobId } = req.params;
    
    try {
      const job = await mistralService.getBatchEnrichmentJob(jobId);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(job);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Cancel batch enrichment job
  app.post("/api/admin/enrichment/batch/:jobId/cancel", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const { jobId } = req.params;
    
    try {
      await mistralService.cancelBatchJob(jobId);
      
      await db.insert(activityLogs).values({
        userId,
        action: "cancelled",
        entityType: "batch_enrichment",
        entityId: jobId,
        description: `Cancelled batch enrichment job`,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Investor Deep Research / Batch Enrichment ============

  // Start batch enrichment for investors
  app.post("/api/admin/enrichment/investors/start", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const { batchSize = 10, onlyIncomplete = true } = req.body;
    
    try {
      const existingJob = await mistralService.getActiveInvestorBatchJob();
      if (existingJob) {
        return res.status(400).json({ 
          message: "An investor batch enrichment job is already in progress",
          jobId: existingJob.id 
        });
      }

      const job = await mistralService.startInvestorBatchEnrichment(
        userId,
        batchSize,
        onlyIncomplete
      );

      await db.insert(activityLogs).values({
        userId,
        action: "started",
        entityType: "investor_batch_enrichment",
        entityId: job.id,
        description: `Started investor batch enrichment for ${job.totalRecords} investors`,
      });

      res.json(job);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get active investor batch job
  app.get("/api/admin/enrichment/investors/active", isAdmin, async (req: any, res) => {
    try {
      const job = await mistralService.getActiveInvestorBatchJob();
      res.json({ job });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Direct Database Import ============
  
  // Direct 1:1 CSV to database import
  app.post("/api/admin/import/direct", isAdmin, async (req: any, res) => {
    const userId = req.user?.id;
    const { table, data } = req.body;
    
    if (!table || !data || !Array.isArray(data)) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing table or data",
        created: 0,
        updated: 0,
        failed: 0,
        errors: ["Invalid request body"]
      });
    }
    
    if (table !== "investment_firms" && table !== "investors") {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid table name",
        created: 0,
        updated: 0,
        failed: 0,
        errors: ["Table must be 'investment_firms' or 'investors'"]
      });
    }
    
    try {
      let created = 0;
      let updated = 0;
      let failed = 0;
      const errors: string[] = [];
      
      const targetTable = table === "investment_firms" ? investmentFirms : investors;
      
      for (const row of data) {
        try {
          // Clean up the row data - convert empty strings to null, parse JSON fields
          const cleanedRow: Record<string, any> = {};
          
          for (const [key, value] of Object.entries(row)) {
            if (value === "" || value === undefined) {
              cleanedRow[key] = null;
            } else if (typeof value === "string") {
              // Try to parse JSON for array/object fields
              if ((value.startsWith("[") || value.startsWith("{")) && (value.endsWith("]") || value.endsWith("}"))) {
                try {
                  cleanedRow[key] = JSON.parse(value);
                } catch {
                  cleanedRow[key] = value;
                }
              } else if (key === "is_active") {
                cleanedRow[key] = value === "true" || value === "1";
              } else if (["check_size_min", "check_size_max", "portfolio_count", "num_lead_investments", "total_investments"].includes(key)) {
                const parsed = parseInt(value);
                cleanedRow[key] = isNaN(parsed) ? null : parsed;
              } else {
                cleanedRow[key] = value;
              }
            } else {
              cleanedRow[key] = value;
            }
          }
          
          // Check if record exists by ID
          if (cleanedRow.id) {
            const existing = await db.select({ id: targetTable.id })
              .from(targetTable)
              .where(eq(targetTable.id, cleanedRow.id))
              .limit(1);
            
            if (existing.length > 0) {
              // Update existing record
              await db.update(targetTable)
                .set(cleanedRow)
                .where(eq(targetTable.id, cleanedRow.id));
              updated++;
            } else {
              // Insert new record
              await db.insert(targetTable).values(cleanedRow);
              created++;
            }
          } else {
            // No ID, generate one and insert
            await db.insert(targetTable).values(cleanedRow);
            created++;
          }
        } catch (rowError: any) {
          failed++;
          if (errors.length < 10) {
            errors.push(`Row error: ${rowError.message}`);
          }
        }
      }
      
      // Log the import activity
      await db.insert(activityLogs).values({
        userId,
        action: "direct_import",
        entityType: table,
        description: `Direct import: ${created} created, ${updated} updated, ${failed} failed`,
        metadata: { created, updated, failed, totalRows: data.length }
      });
      
      res.json({
        success: failed === 0 || (created + updated) > 0,
        created,
        updated,
        failed,
        errors
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false, 
        message: error.message,
        created: 0,
        updated: 0,
        failed: data.length,
        errors: [error.message]
      });
    }
  });

  // ============ Database Seeding ============
  
  // Seed family offices data (admin endpoint)
  app.post("/api/admin/seed/family-offices", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || 'system';
      console.log("[Seed] Admin triggered family offices seed");
      
      const result = await seedFamilyOffices();
      
      // Log activity
      await db.insert(activityLogs).values({
        userId,
        action: "seed_family_offices",
        entityType: "investment_firm",
        description: `Seeded family offices: ${result.inserted} inserted, ${result.skipped} skipped`,
        metadata: result
      });
      
      res.json({
        success: true,
        message: `Family offices seed complete: ${result.inserted} inserted, ${result.skipped} already existed`,
        ...result
      });
    } catch (error: any) {
      console.error("[Seed] Family offices seed failed:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Seed businessmen from CSV data (admin endpoint)
  app.post("/api/admin/seed/businessmen", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || 'system';
      console.log("[Seed] Admin triggered businessmen CSV seed");
      
      const result = await seedBusinessmenFromCSV();
      
      // Log activity
      await db.insert(activityLogs).values({
        userId,
        action: "seed_businessmen_csv",
        entityType: "businessman",
        description: `Seeded businessmen from CSV: ${result.imported} imported, ${result.skipped} skipped`,
        metadata: result
      });
      
      res.json({
        success: true,
        message: `Businessmen CSV import complete: ${result.imported} imported, ${result.skipped} skipped`,
        ...result
      });
    } catch (error: any) {
      console.error("[Seed] Businessmen CSV seed failed:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Deep research for businessmen - AI enrichment
  app.post("/api/admin/businessmen/deep-research", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || 'system';
      const { batchSize = 10 } = req.body;
      
      // Get businessmen that need enrichment (missing key data)
      const toEnrich = await db.select()
        .from(businessmen)
        .where(
          or(
            isNull(businessmen.enrichmentStatus),
            sql`${businessmen.enrichmentStatus} NOT IN ('enriched', 'pending')`
          )
        )
        .limit(batchSize);
      
      if (toEnrich.length === 0) {
        return res.json({
          success: true,
          message: "No businessmen records need enrichment",
          enriched: 0,
          total: 0
        });
      }
      
      let enrichedCount = 0;
      const errors: string[] = [];
      
      for (const person of toEnrich) {
        try {
          const result = await mistralService.enrichBusinessman(person);
          
          await db.update(businessmen)
            .set({
              ...result.suggestedUpdates,
              enrichmentStatus: "enriched",
              lastEnrichmentDate: new Date(),
              updatedAt: new Date()
            })
            .where(eq(businessmen.id, person.id));
          
          enrichedCount++;
        } catch (error: any) {
          errors.push(`${person.firstName} ${person.lastName}: ${error.message}`);
          
          await db.update(businessmen)
            .set({
              enrichmentStatus: "failed",
              lastEnrichmentDate: new Date(),
              updatedAt: new Date()
            })
            .where(eq(businessmen.id, person.id));
        }
      }
      
      // Log activity
      await db.insert(activityLogs).values({
        userId,
        action: "deep_research_businessmen",
        entityType: "businessman",
        description: `Deep research enriched ${enrichedCount} of ${toEnrich.length} businessmen`,
        metadata: { enriched: enrichedCount, errors: errors.slice(0, 5) }
      });
      
      res.json({
        success: true,
        message: `Deep research complete: ${enrichedCount} enriched`,
        enriched: enrichedCount,
        total: toEnrich.length,
        errors: errors.slice(0, 5)
      });
    } catch (error: any) {
      console.error("[DeepResearch] Businessmen enrichment failed:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get businessmen enrichment stats
  app.get("/api/admin/businessmen/enrichment-stats", isAdmin, async (req: any, res) => {
    try {
      const [total] = await db.select({ count: count() }).from(businessmen);
      const [enriched] = await db.select({ count: count() })
        .from(businessmen)
        .where(eq(businessmen.enrichmentStatus, "enriched"));
      const [pending] = await db.select({ count: count() })
        .from(businessmen)
        .where(eq(businessmen.enrichmentStatus, "pending"));
      const [failed] = await db.select({ count: count() })
        .from(businessmen)
        .where(eq(businessmen.enrichmentStatus, "failed"));
      
      res.json({
        total: total.count,
        enriched: enriched.count,
        pending: pending.count,
        failed: failed.count,
        needsEnrichment: total.count - enriched.count - pending.count
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Import investors from PDF data
  app.post("/api/admin/import/investors-pdf", isAdmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      console.log("[Import] Starting PDF investor import...");
      
      const result = await importInvestors();
      
      await db.insert(activityLogs).values({
        userId,
        action: "import_investors_pdf",
        entityType: "investor",
        description: `Imported ${result.firmsInserted} firms and ${result.investorsInserted} investors from PDF`,
        metadata: result
      });
      
      res.json({
        success: true,
        message: `Import complete: ${result.firmsInserted} firms, ${result.investorsInserted} investors inserted, ${result.skipped} skipped`,
        ...result
      });
    } catch (error: any) {
      console.error("[Import] PDF investor import failed:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Import pension funds from Excel
  app.post("/api/admin/import/pension-funds", isAdmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      console.log("[Import] Starting pension fund import...");
      
      const result = await importPensionFunds();
      
      await db.insert(activityLogs).values({
        userId,
        action: "import_pension_funds",
        entityType: "investmentFirm",
        description: `Imported ${result.firmsInserted} pension funds and ${result.contactsInserted} contacts`,
        metadata: result
      });
      
      res.json({
        success: true,
        message: `Import complete: ${result.firmsInserted} pension funds, ${result.contactsInserted} contacts inserted, ${result.skipped} skipped`,
        ...result
      });
    } catch (error: any) {
      console.error("[Import] Pension fund import failed:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ============ URL Health Validation ============

  // Start a URL health validation job
  app.post("/api/admin/url-health/jobs/start", isAdmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { entityScope = "all", includeAutoFix = true, confidenceThreshold = 0.85 } = req.body;
      
      // Check if there's already an active job
      const activeJob = await getActiveUrlHealthJob();
      if (activeJob) {
        return res.status(400).json({ 
          success: false, 
          message: "A URL health job is already running",
          activeJob 
        });
      }
      
      const job = await startUrlHealthJob(entityScope, userId, { includeAutoFix, confidenceThreshold });
      
      await db.insert(activityLogs).values({
        userId,
        action: "start_url_health_job",
        entityType: "urlHealthJob",
        entityId: job.id,
        description: `Started URL health validation for ${entityScope}`
      });
      
      // Process job in background
      processUrlHealthJob(job.id).catch(err => {
        console.error("[URL Health] Job processing failed:", err);
      });
      
      res.json({ success: true, job });
    } catch (error: any) {
      console.error("[URL Health] Failed to start job:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get active URL health job
  app.get("/api/admin/url-health/jobs/active", isAdmin, async (req, res) => {
    try {
      const job = await getActiveUrlHealthJob();
      res.json({ job });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Cancel a URL health job
  app.post("/api/admin/url-health/jobs/:id/cancel", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await cancelUrlHealthJob(id);
      
      await db.insert(activityLogs).values({
        userId: getUserId(req),
        action: "cancel_url_health_job",
        entityType: "urlHealthJob",
        entityId: id,
        description: "Cancelled URL health validation job"
      });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get URL health stats
  app.get("/api/admin/url-health/stats", isAdmin, async (req, res) => {
    try {
      const { scope = "all" } = req.query;
      const stats = await getUrlHealthStats(scope as string);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get URL health checks list
  app.get("/api/admin/url-health/checks", isAdmin, async (req, res) => {
    try {
      const { scope = "all", status, limit = "50", offset = "0" } = req.query;
      const checks = await getUrlHealthChecks(
        scope as string,
        status as any,
        parseInt(limit as string),
        parseInt(offset as string)
      );
      res.json({ checks });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ Research Intelligence / Crawler ============

  // Initialize research organizations
  app.post("/api/admin/research/init-orgs", isAdmin, async (req: any, res) => {
    try {
      const { researchCrawlerService } = await import("./services/research-crawler");
      const created = await researchCrawlerService.initializeOrganizations();
      
      await db.insert(activityLogs).values({
        userId: getUserId(req),
        action: "init_research_orgs",
        entityType: "researchOrganization",
        description: `Initialized ${created} research organizations`
      });
      
      res.json({ success: true, created });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get research organizations
  app.get("/api/admin/research/organizations", isAdmin, async (req, res) => {
    try {
      const { researchCrawlerService } = await import("./services/research-crawler");
      const orgs = await researchCrawlerService.getOrganizations();
      res.json(orgs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get crawler stats
  app.get("/api/admin/research/stats", isAdmin, async (req, res) => {
    try {
      const { researchCrawlerService } = await import("./services/research-crawler");
      const stats = await researchCrawlerService.getCrawlStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Crawl a specific organization
  app.post("/api/admin/research/crawl/:slug", isAdmin, async (req: any, res) => {
    try {
      const { slug } = req.params;
      const { researchCrawlerService } = await import("./services/research-crawler");
      const result = await researchCrawlerService.crawlOrganization(slug);
      
      await db.insert(activityLogs).values({
        userId: getUserId(req),
        action: "crawl_research_source",
        entityType: "researchOrganization",
        description: `Crawled ${slug}: ${result.documents} documents found, ${result.errors.length} errors`
      });
      
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Crawl all organizations
  app.post("/api/admin/research/crawl-all", isAdmin, async (req: any, res) => {
    try {
      const { researchCrawlerService } = await import("./services/research-crawler");
      const orgs = await researchCrawlerService.getOrganizations();
      
      let totalDocs = 0;
      const allErrors: string[] = [];
      
      for (const org of orgs) {
        const result = await researchCrawlerService.crawlOrganization(org.slug);
        totalDocs += result.documents;
        allErrors.push(...result.errors);
      }
      
      await db.insert(activityLogs).values({
        userId: getUserId(req),
        action: "crawl_all_research_sources",
        entityType: "researchOrganization",
        description: `Crawled all sources: ${totalDocs} documents found, ${allErrors.length} errors`
      });
      
      res.json({ success: true, documents: totalDocs, errors: allErrors });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Process a document (chunk and extract text)
  app.post("/api/admin/research/process/:documentId", isAdmin, async (req: any, res) => {
    try {
      const { documentId } = req.params;
      const { researchCrawlerService } = await import("./services/research-crawler");
      const result = await researchCrawlerService.processDocument(documentId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get investment signals summary
  app.get("/api/admin/research/signals/summary", isAdmin, async (req, res) => {
    try {
      const { signalExtractionService } = await import("./services/signal-extraction");
      const summary = await signalExtractionService.getSignalsSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get recent investment signals
  app.get("/api/admin/research/signals", isAdmin, async (req, res) => {
    try {
      const { limit = "20" } = req.query;
      const { signalExtractionService } = await import("./services/signal-extraction");
      const signals = await signalExtractionService.getRecentSignals(parseInt(limit as string));
      res.json(signals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Extract signals from a document
  app.post("/api/admin/research/extract-signals/:documentId", isAdmin, async (req: any, res) => {
    try {
      const { documentId } = req.params;
      const { signalExtractionService } = await import("./services/signal-extraction");
      const result = await signalExtractionService.processDocument(documentId);
      
      await db.insert(activityLogs).values({
        userId: getUserId(req),
        action: "extract_signals",
        entityType: "researchDocument",
        entityId: documentId,
        description: `Extracted ${result.signalsExtracted} signals from document`
      });
      
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Process all pending documents for signal extraction
  app.post("/api/admin/research/extract-all-signals", isAdmin, async (req: any, res) => {
    try {
      const { signalExtractionService } = await import("./services/signal-extraction");
      const result = await signalExtractionService.processAllPendingDocuments();
      
      await db.insert(activityLogs).values({
        userId: getUserId(req),
        action: "extract_all_signals",
        entityType: "researchDocument",
        description: `Processed ${result.processed} documents, extracted ${result.signalsExtracted} signals`
      });
      
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ============ Database Backup & Restore ============

  // Get database stats
  app.get("/api/admin/backups/stats", isAdmin, async (req, res) => {
    try {
      const { getDatabaseStats } = await import("./services/database-backup");
      const stats = await getDatabaseStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // List all backups
  app.get("/api/admin/backups", isAdmin, async (req, res) => {
    try {
      const { listBackups } = await import("./services/database-backup");
      const limit = parseInt(req.query.limit as string) || 20;
      const backups = await listBackups(limit);
      res.json(backups);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create a new backup
  app.post("/api/admin/backups", isAdmin, async (req: any, res) => {
    try {
      const { createBackup } = await import("./services/database-backup");
      const userId = getUserId(req);
      const { name, description, backupType } = req.body;
      
      if (!name) {
        return res.status(400).json({ success: false, message: "Backup name is required" });
      }
      
      const result = await createBackup(userId, name, description, backupType || "manual");
      
      await db.insert(activityLogs).values({
        userId,
        action: "create_backup",
        entityType: "databaseBackup",
        entityId: result.backupId,
        description: `Created backup: ${name}`
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get a specific backup
  app.get("/api/admin/backups/:id", isAdmin, async (req, res) => {
    try {
      const { getBackupById } = await import("./services/database-backup");
      const backup = await getBackupById(req.params.id);
      
      if (!backup) {
        return res.status(404).json({ message: "Backup not found" });
      }
      
      res.json(backup);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete a backup
  app.delete("/api/admin/backups/:id", isAdmin, async (req: any, res) => {
    try {
      const { deleteBackup, getBackupById } = await import("./services/database-backup");
      const backup = await getBackupById(req.params.id);
      
      if (!backup) {
        return res.status(404).json({ success: false, message: "Backup not found" });
      }
      
      await deleteBackup(req.params.id);
      
      await db.insert(activityLogs).values({
        userId: getUserId(req),
        action: "delete_backup",
        entityType: "databaseBackup",
        entityId: req.params.id,
        description: `Deleted backup: ${backup.name}`
      });
      
      res.json({ success: true, message: "Backup deleted" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Download a backup as JSON file
  app.get("/api/admin/backups/:id/download", isAdmin, async (req, res) => {
    try {
      const { downloadBackup } = await import("./services/database-backup");
      const result = await downloadBackup(req.params.id);
      
      if (!result) {
        return res.status(404).json({ message: "Backup not found or incomplete" });
      }
      
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.send(result.data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get backup data for preview/restore
  app.get("/api/admin/backups/:id/data", isAdmin, async (req, res) => {
    try {
      const { getBackupData } = await import("./services/database-backup");
      const backupData = await getBackupData(req.params.id);
      
      if (!backupData) {
        return res.status(404).json({ message: "Backup data not found" });
      }
      
      res.json(backupData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}

// Run seeds on startup (for production deployments)
export async function runStartupSeeds() {
  console.log("[Seed] Running startup seeds...");
  try {
    const result = await seedFamilyOffices();
    console.log(`[Seed] Startup seed complete: ${result.inserted} family offices inserted, ${result.skipped} skipped`);
    return result;
  } catch (error) {
    console.error("[Seed] Startup seed failed:", error);
    return { inserted: 0, skipped: 0 };
  }
}
