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
  potentialDuplicates, enrichmentJobs
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
    const workspaceId = req.body.workspaceId || "default";
    
    try {
      await folkService.getOrCreateWorkspace(workspaceId, "Default Workspace");
      const importRun = await folkService.importPeopleWithTracking(workspaceId, userId);
      
      res.json({
        success: true,
        recordsProcessed: importRun.processedRecords,
        recordsCreated: importRun.createdRecords,
        recordsUpdated: importRun.updatedRecords,
        recordsFailed: importRun.failedRecords,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
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
}
