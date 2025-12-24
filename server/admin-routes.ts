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
