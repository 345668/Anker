import { Express } from "express";
import { isAdmin } from "./replit_integrations/auth/replitAuth";
import { db } from "./db";
import { eq, desc, sql, and, or, like, count, isNull } from "drizzle-orm";
import { folkService } from "./services/folk";
import { storage } from "./storage";
import { 
  users, investors, startups, contacts, deals, 
  activityLogs, syncLogs, systemSettings,
  investmentFirms, folkWorkspaces, folkImportRuns, folkFailedRecords
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
}
