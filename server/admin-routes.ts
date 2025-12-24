import { Express } from "express";
import { isAdmin } from "./replit_integrations/auth/replitAuth";
import { db } from "./db";
import { eq, desc, sql, and, or, like, count } from "drizzle-orm";
import { folkService } from "./services/folk";
import { 
  users, investors, startups, contacts, deals, 
  activityLogs, syncLogs, systemSettings,
  investmentFirms
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

  // Import from Folk CRM
  app.post("/api/admin/folk/import", isAdmin, async (req: any, res) => {
    const userId = req.user.claims.sub;
    
    try {
      // Create sync log
      const [syncLog] = await db.insert(syncLogs).values({
        source: "folk",
        syncType: "import",
        status: "in_progress",
        initiatedBy: userId,
        startedAt: new Date(),
      }).returning();

      // Fetch people from Folk
      const people = await folkService.getAllPeople();
      
      let recordsCreated = 0;
      let recordsUpdated = 0;
      let recordsFailed = 0;

      for (const person of people) {
        try {
          const email = person.emails?.[0]?.value;
          const phone = person.phones?.[0]?.value;
          
          // Check if investor with this email exists
          if (email) {
            const existingInvestors = await db.select()
              .from(investors)
              .where(eq(investors.email, email))
              .limit(1);
            
            if (existingInvestors.length > 0) {
              // Update existing
              await db.update(investors)
                .set({
                  firstName: person.firstName || person.name?.split(' ')[0] || existingInvestors[0].firstName,
                  lastName: person.lastName || person.name?.split(' ').slice(1).join(' ') || existingInvestors[0].lastName,
                  title: person.jobTitle || existingInvestors[0].title,
                  phone: phone || existingInvestors[0].phone,
                  linkedinUrl: person.linkedinUrl || existingInvestors[0].linkedinUrl,
                  folkId: person.id,
                  updatedAt: new Date(),
                })
                .where(eq(investors.id, existingInvestors[0].id));
              recordsUpdated++;
            } else {
              // Create new investor
              await db.insert(investors).values({
                firstName: person.firstName || person.name?.split(' ')[0] || "Unknown",
                lastName: person.lastName || person.name?.split(' ').slice(1).join(' '),
                email: email,
                phone: phone,
                title: person.jobTitle,
                linkedinUrl: person.linkedinUrl,
                folkId: person.id,
                source: "folk",
              });
              recordsCreated++;
            }
          }
        } catch (err) {
          recordsFailed++;
        }
      }

      // Update sync log
      await db.update(syncLogs)
        .set({
          status: "completed",
          completedAt: new Date(),
          recordsProcessed: people.length,
          recordsCreated,
          recordsUpdated,
          recordsFailed,
        })
        .where(eq(syncLogs.id, syncLog.id));

      // Log activity
      await db.insert(activityLogs).values({
        userId,
        action: "imported",
        entityType: "investor",
        description: `Imported ${recordsCreated} new, updated ${recordsUpdated} from Folk CRM`,
        metadata: { syncLogId: syncLog.id, source: "folk" },
      });

      res.json({
        success: true,
        recordsProcessed: people.length,
        recordsCreated,
        recordsUpdated,
        recordsFailed,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
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
