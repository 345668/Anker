import { Express } from "express";
import { isAdmin } from "./replit_integrations/auth/replitAuth";
import { db } from "./db";
import { eq, desc, sql, and, or, like, count, isNull } from "drizzle-orm";
import { folkService } from "./services/folk";
import { storage } from "./storage";
import { mistralService } from "./services/mistral";
import { deduplicationService } from "./services/deduplication";
import { 
  users, investors, startups, contacts, deals, 
  activityLogs, syncLogs, systemSettings,
  investmentFirms, folkWorkspaces, folkImportRuns, folkFailedRecords,
  potentialDuplicates, enrichmentJobs,
  archivedInvestmentFirms, archivedInvestors, archivedContacts
} from "@shared/schema";

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

  // Import people from Folk with tracking
  app.post("/api/admin/folk/import/people", isAdmin, async (req: any, res) => {
    const userId = req.user.claims.sub;
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
    const userId = req.user.claims.sub;
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
    const userId = req.user.claims.sub;
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
    const userId = req.user.claims.sub;
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

  // Legacy import endpoint (kept for backwards compatibility)
  app.post("/api/admin/folk/import", isAdmin, async (req: any, res) => {
    const userId = req.user.claims.sub;
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
    const userId = req.user.claims.sub;
    
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
    const userId = req.user.claims.sub;
    
    try {
      const mappings = await storage.getFolkFieldMappings(groupId);
      const approved = [];
      
      for (const mapping of mappings) {
        const updated = await storage.updateFolkFieldMapping(mapping.id, {
          isApproved: true,
          approvedBy: userId,
          approvedAt: new Date(),
        });
        if (updated) approved.push(updated);
      }
      
      res.json({ success: true, approvedCount: approved.length });
    } catch (error: any) {
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
    const userId = req.user.claims.sub;
    
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
    const userId = req.user.claims.sub;
    
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
    const userId = req.user.claims.sub;
    
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
    const userId = req.user.claims.sub;
    
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
    const userId = req.user.claims.sub;
    
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
    const userId = req.user.claims.sub;
    
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
    const userId = req.user.claims.sub;
    
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
    const { batchSize = 10, onlyUnclassified = true } = req.body;
    
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
        "classification",
        batchSize,
        onlyUnclassified
      );

      await db.insert(activityLogs).values({
        userId,
        action: "started",
        entityType: "batch_enrichment",
        entityId: job.id,
        description: `Started batch enrichment for ${job.totalRecords} firms`,
      });

      res.json(job);
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

  // Get active batch job
  app.get("/api/admin/enrichment/batch/active", isAdmin, async (req: any, res) => {
    try {
      const job = await mistralService.getActiveBatchJob();
      res.json({ job });
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
}
