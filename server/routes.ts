import type { Express } from "express";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth } from "./replit_integrations/auth";
import { registerAdminRoutes } from "./admin-routes";
import { registerSimpleAuthRoutes, setupSimpleAuthSession } from "./simple-auth";
import { wsNotificationService } from "./services/websocket";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { users, insertCalendarMeetingSchema, insertUserEmailSettingsSchema } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Create session store for WebSocket authentication
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    tableName: "sessions",
  });
  const sessionSecret = process.env.SESSION_SECRET || "fallback-secret";

  // Session parser for WebSocket authentication
  const parseSessionFromRequest = async (req: IncomingMessage): Promise<string | null> => {
    return new Promise((resolve) => {
      const cookieHeader = req.headers.cookie;
      if (!cookieHeader) {
        resolve(null);
        return;
      }

      const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) acc[key] = decodeURIComponent(value);
        return acc;
      }, {} as Record<string, string>);

      const sessionCookie = cookies['connect.sid'];
      if (!sessionCookie) {
        resolve(null);
        return;
      }

      const sessionId = sessionCookie.startsWith('s:') 
        ? sessionCookie.slice(2).split('.')[0]
        : sessionCookie.split('.')[0];

      sessionStore.get(sessionId, async (err, sessionData) => {
        if (err || !sessionData) {
          resolve(null);
          return;
        }

        const userId = (sessionData as any)?.userId || (sessionData as any)?.passport?.user?.claims?.sub;
        if (userId) {
          try {
            const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
            if (user) {
              resolve(user.id);
              return;
            }
          } catch (error) {
            console.error("[WebSocket] User lookup error:", error);
          }
        }
        resolve(null);
      });
    });
  };

  // Initialize WebSocket notification service with session parser
  wsNotificationService.initialize(httpServer, parseSessionFromRequest);
  
  // Setup session management (keeping session infrastructure from Replit auth)
  await setupAuth(app);
  
  // Setup simple auth session middleware to hydrate req.user
  setupSimpleAuthSession(app);
  
  // Register simple email/password auth routes
  registerSimpleAuthRoutes(app);
  
  // Register admin routes (protected by isAdmin middleware)
  registerAdminRoutes(app);

  app.post(api.messages.create.path, async (req, res) => {
    try {
      const input = api.messages.create.input.parse(req.body);
      const message = await storage.createMessage(input);
      res.status(201).json(message);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.post(api.subscribers.create.path, async (req, res) => {
    try {
      const input = api.subscribers.create.input.parse(req.body);
      const subscriber = await storage.createSubscriber(input);
      res.status(201).json(subscriber);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      if (err instanceof Error && 'code' in err && (err as any).code === '23505') {
        return res.status(409).json({ message: "Email already subscribed" });
      }
      throw err;
    }
  });

  // Startups API routes
  app.get(api.startups.list.path, async (req, res) => {
    const startups = await storage.getStartups();
    res.json(startups);
  });

  app.get(api.startups.myStartups.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startups = await storage.getStartupsByFounder(req.user.id);
    res.json(startups);
  });

  app.get(api.startups.get.path, async (req, res) => {
    const startup = await storage.getStartupById(req.params.id);
    if (!startup) {
      return res.status(404).json({ message: "Startup not found" });
    }
    // Only allow access if startup is public OR if authenticated user is the owner
    const isOwner = req.isAuthenticated() && req.user && req.user.id === startup.founderId;
    if (!startup.isPublic && !isOwner) {
      return res.status(404).json({ message: "Startup not found" });
    }
    res.json(startup);
  });

  app.post(api.startups.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.startups.create.input.parse({
        ...req.body,
        founderId: req.user.id,
      });
      const startup = await storage.createStartup(input);
      res.status(201).json(startup);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.startups.update.path.replace(':id', ':id'), async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getStartupById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (existing.founderId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const input = api.startups.update.input.parse(req.body);
      // Remove founderId from update to prevent ownership transfer
      const { founderId, ...safeInput } = input;
      const startup = await storage.updateStartup(req.params.id, safeInput);
      res.json(startup);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.startups.delete.path.replace(':id', ':id'), async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getStartupById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (existing.founderId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.deleteStartup(req.params.id);
    res.status(204).send();
  });

  // Startup Pitch Deck Analysis
  app.post(api.startups.analyzePitchDeck.path.replace(':id', ':id'), async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startup = await storage.getStartupById(req.params.id);
    if (!startup) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (startup.founderId !== (req.user as any).id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    try {
      const input = api.startups.analyzePitchDeck.input.parse(req.body);
      const { pitchDeckAnalysisService } = await import("./services/mistral");
      
      const pitchContent = `
Startup: ${startup.name}
Tagline: ${startup.tagline || "Not provided"}
Description: ${startup.description || "Not provided"}
Stage: ${startup.stage || "Not provided"}
Industries: ${startup.industries?.join(", ") || "Not provided"}
Target Raise: ${startup.targetAmount ? `$${startup.targetAmount}` : "Not provided"}
Team Size: ${startup.teamSize || "Not provided"}
Location: ${startup.location || "Not provided"}

Pitch Deck Content:
${input.content}
`;
      
      const result = await pitchDeckAnalysisService.analyzePitchDeck(pitchContent, {
        name: startup.name,
      });
      
      res.json({
        overallScore: result.overallScore,
        categoryScores: result.categoryScores,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        recommendations: result.recommendations.map(r => ({
          category: r.category,
          priority: r.priority,
          title: r.title,
          description: r.description,
        })),
        summary: result.summary,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error("Pitch deck analysis error:", err);
      return res.status(500).json({ message: "Failed to analyze pitch deck" });
    }
  });

  // Startup Documents API routes
  app.get("/api/startups/:id/documents", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startup = await storage.getStartupById(req.params.id);
    if (!startup) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (startup.founderId !== (req.user as any).id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const documents = await storage.getStartupDocuments(req.params.id);
    res.json(documents);
  });

  app.post("/api/startups/:id/documents", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startup = await storage.getStartupById(req.params.id);
    if (!startup) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (startup.founderId !== (req.user as any).id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    try {
      const { type, name, fileName, fileSize, mimeType, content } = req.body;
      if (!type || !name || !fileName) {
        return res.status(400).json({ message: "type, name, and fileName are required" });
      }
      
      const document = await storage.createStartupDocument({
        startupId: req.params.id,
        type,
        name,
        fileName,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
        content: content || null,
        processingStatus: content ? "completed" : "pending",
      });
      
      res.status(201).json(document);
    } catch (err) {
      console.error("Error creating document:", err);
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  app.patch("/api/startups/:startupId/documents/:docId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startup = await storage.getStartupById(req.params.startupId);
    if (!startup) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (startup.founderId !== (req.user as any).id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    const document = await storage.getStartupDocumentById(req.params.docId);
    if (!document || document.startupId !== req.params.startupId) {
      return res.status(404).json({ message: "Document not found" });
    }
    
    const updated = await storage.updateStartupDocument(req.params.docId, req.body);
    res.json(updated);
  });

  app.delete("/api/startups/:startupId/documents/:docId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startup = await storage.getStartupById(req.params.startupId);
    if (!startup) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (startup.founderId !== (req.user as any).id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    const document = await storage.getStartupDocumentById(req.params.docId);
    if (!document || document.startupId !== req.params.startupId) {
      return res.status(404).json({ message: "Document not found" });
    }
    
    await storage.deleteStartupDocument(req.params.docId);
    res.status(204).send();
  });

  // Get startup profile with all documents for matching
  app.get("/api/startups/:id/profile", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const profile = await storage.getStartupProfile(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (profile.startup.founderId !== (req.user as any).id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(profile);
  });

  // Update startup notes and matching profile
  app.patch("/api/startups/:id/notes", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startup = await storage.getStartupById(req.params.id);
    if (!startup) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (startup.founderId !== (req.user as any).id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    const { notes, profileSummary, matchingProfile } = req.body;
    const updated = await storage.updateStartup(req.params.id, {
      notes,
      profileSummary,
      matchingProfile,
    });
    res.json(updated);
  });

  // Enrich startup profile from uploaded documents
  app.post("/api/startups/:id/enrich", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startup = await storage.getStartupById(req.params.id);
    if (!startup) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (startup.founderId !== (req.user as any).id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    try {
      const { enrichStartupProfileFromDocuments } = await import("./services/profile-enrichment");
      const documents = await storage.getStartupDocuments(req.params.id);
      
      if (documents.length === 0) {
        return res.status(400).json({ message: "No documents found for enrichment. Please upload documents first." });
      }
      
      // Check if any document has extractable content
      const documentsWithContent = documents.filter(d => d.content && d.content.length > 100);
      if (documentsWithContent.length === 0) {
        return res.status(400).json({ 
          message: "No documents with extractable content found. Please upload PDF documents with text content.",
          documentsCount: documents.length,
          hint: "Upload PDFs with readable text (not scanned images) for best results."
        });
      }
      
      const result = await enrichStartupProfileFromDocuments(
        req.params.id,
        documents.map(d => ({
          type: d.type,
          content: d.content || undefined,
          extractedData: d.extractedData as Record<string, any> || undefined,
        }))
      );
      
      if (!result.profileSummary && !result.matchingProfile.investmentHighlights?.length) {
        return res.status(400).json({ 
          message: "Could not extract meaningful insights from documents. Try uploading a complete pitch deck.",
          enrichmentScore: result.enrichmentScore
        });
      }
      
      res.json({
        success: true,
        enrichmentScore: result.enrichmentScore,
        profileSummary: result.profileSummary,
        matchingProfile: result.matchingProfile,
      });
    } catch (err) {
      console.error("Error enriching startup profile:", err);
      res.status(500).json({ message: "Failed to enrich startup profile" });
    }
  });

  // Zod schema for pitch analysis report data (strict validation)
  const pitchAnalysisReportSchema = z.object({
    startupName: z.string().min(1).max(200),
    tagline: z.string().max(500).optional(),
    overallScore: z.number().min(0).max(100),
    sections: z.array(z.object({
      name: z.string().max(200),
      score: z.number().min(0).max(100),
      feedback: z.string().max(2000),
    })).max(20),
    strengths: z.array(z.string().max(500)).max(20).optional(),
    weaknesses: z.array(z.string().max(500)).max(20).optional(),
    recommendations: z.array(z.string().max(1000)).max(20).optional(),
    risks: z.array(z.object({
      risk: z.string().max(500),
      level: z.string().max(50),
      mitigation: z.string().max(1000),
    })).max(20).optional(),
  }).strict(); // Reject unexpected fields

  // Generate PDF report for pitch deck analysis (standalone, no startup required)
  app.post("/api/reports/pitch-analysis", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { generatePitchAnalysisPDF } = await import("./services/pdf-report");
      
      // Validate and parse input with strict schema
      const parseResult = pitchAnalysisReportSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid analysis data format",
          errors: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        });
      }
      
      const analysisData = parseResult.data;

      const pdfBuffer = await generatePitchAnalysisPDF({
        startupName: analysisData.startupName,
        tagline: analysisData.tagline,
        overallScore: analysisData.overallScore,
        sections: analysisData.sections,
        strengths: analysisData.strengths || [],
        weaknesses: analysisData.weaknesses || [],
        recommendations: analysisData.recommendations || [],
        risks: analysisData.risks || [],
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${analysisData.startupName.replace(/[^a-zA-Z0-9]/g, '_')}_Analysis_Report.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("Error generating pitch analysis report:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Generate PDF report for pitch deck analysis (startup-specific)
  app.post("/api/startups/:id/reports/pitch-analysis", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startup = await storage.getStartupById(req.params.id);
    if (!startup) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (startup.founderId !== (req.user as any).id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    try {
      const { generatePitchAnalysisPDF } = await import("./services/pdf-report");
      
      // Validate and parse input with strict schema
      const parseResult = pitchAnalysisReportSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid analysis data format",
          errors: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        });
      }
      
      const analysisData = parseResult.data;

      const pdfBuffer = await generatePitchAnalysisPDF({
        startupName: analysisData.startupName || startup.name,
        tagline: analysisData.tagline || startup.tagline || undefined,
        overallScore: analysisData.overallScore,
        sections: analysisData.sections,
        strengths: analysisData.strengths || [],
        weaknesses: analysisData.weaknesses || [],
        recommendations: analysisData.recommendations || [],
        risks: analysisData.risks || [],
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${startup.name.replace(/[^a-zA-Z0-9]/g, '_')}_Pitch_Analysis.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("Error generating pitch analysis report:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Generate PDF report for investor matches
  app.post("/api/startups/:id/reports/matches", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startup = await storage.getStartupById(req.params.id);
    if (!startup) {
      return res.status(404).json({ message: "Startup not found" });
    }
    if (startup.founderId !== (req.user as any).id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    try {
      const { generateMatchesReportPDF } = await import("./services/pdf-report");
      const documents = await storage.getStartupDocuments(req.params.id);
      
      // Fetch matches server-side for security (don't trust client data)
      const allMatches = await storage.getMatches();
      const startupMatches = allMatches.filter(m => m.startupId === req.params.id);
      
      if (startupMatches.length === 0) {
        return res.status(400).json({ 
          message: "No matches found for this startup. Please generate matches first." 
        });
      }

      // Build match data from server-side sources
      const matchesForReport = await Promise.all(startupMatches.map(async (m) => {
        const firm = m.firmId ? await storage.getInvestmentFirmById(m.firmId) : null;
        const investor = m.investorId ? await storage.getInvestorById(m.investorId) : null;
        
        return {
          investorName: investor 
            ? [investor.firstName, investor.lastName].filter(Boolean).join(" ")
            : "Unknown Investor",
          firmName: firm?.name || undefined,
          score: m.matchScore || 0,
          investorType: firm?.firmClassification || investor?.investorType || undefined,
          location: firm?.hqLocation || investor?.location || undefined,
          focusAreas: firm?.sectors || [],
          rationale: m.matchReasons?.join("; ") || undefined,
        };
      }));

      const pdfBuffer = await generateMatchesReportPDF({
        startupName: startup.name,
        stage: startup.stage || undefined,
        industry: startup.industry || undefined,
        fundingTarget: startup.fundingTarget || undefined,
        totalMatches: matchesForReport.length,
        matches: matchesForReport,
        documentCount: documents.length,
        enrichmentScore: 0,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${startup.name.replace(/[^a-zA-Z0-9]/g, '_')}_Investor_Matches.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("Error generating matches report:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Investors API routes (public read, admin write)
  app.get(api.investors.list.path, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await storage.getInvestors(limit, offset);
      res.json(result);
    } catch (err) {
      console.error("Error fetching investors:", err);
      res.status(500).json({ message: "Failed to fetch investors", error: String(err) });
    }
  });

  app.get(api.investors.get.path, async (req, res) => {
    const investor = await storage.getInvestorById(req.params.id);
    if (!investor) {
      return res.status(404).json({ message: "Investor not found" });
    }
    res.json(investor);
  });

  app.post(api.investors.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.investors.create.input.parse(req.body);
      const investor = await storage.createInvestor(input);
      res.status(201).json(investor);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.investors.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getInvestorById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Investor not found" });
    }
    try {
      const input = api.investors.update.input.parse(req.body);
      const investor = await storage.updateInvestor(req.params.id, input);
      res.json(investor);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.investors.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getInvestorById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Investor not found" });
    }
    await storage.deleteInvestor(req.params.id);
    res.status(204).send();
  });

  // Investment Firms API routes
  app.get(api.firms.list.path, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await storage.getInvestmentFirms(limit, offset);
      res.json(result);
    } catch (err) {
      console.error("Error fetching firms:", err);
      res.status(500).json({ message: "Failed to fetch firms", error: String(err) });
    }
  });

  app.get(api.firms.get.path, async (req, res) => {
    const firm = await storage.getInvestmentFirmById(req.params.id);
    if (!firm) {
      return res.status(404).json({ message: "Firm not found" });
    }
    res.json(firm);
  });

  app.post(api.firms.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.firms.create.input.parse(req.body);
      const firm = await storage.createInvestmentFirm(input);
      res.status(201).json(firm);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.firms.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getInvestmentFirmById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Firm not found" });
    }
    try {
      const input = api.firms.update.input.parse(req.body);
      const firm = await storage.updateInvestmentFirm(req.params.id, input);
      res.json(firm);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.firms.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getInvestmentFirmById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Firm not found" });
    }
    await storage.deleteInvestmentFirm(req.params.id);
    res.status(204).send();
  });

  // Businessmen API routes
  app.get(api.businessmen.list.path, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 500, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await storage.getBusinessmen(limit, offset);
    res.json(result);
  });

  app.get(api.businessmen.get.path, async (req, res) => {
    const businessman = await storage.getBusinessmanById(req.params.id);
    if (!businessman) {
      return res.status(404).json({ message: "Businessman not found" });
    }
    res.json(businessman);
  });

  app.post(api.businessmen.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.businessmen.create.input.parse(req.body);
      const businessman = await storage.createBusinessman(input);
      res.status(201).json(businessman);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.businessmen.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getBusinessmanById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Businessman not found" });
    }
    try {
      const input = api.businessmen.update.input.parse(req.body);
      const updated = await storage.updateBusinessman(req.params.id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.businessmen.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getBusinessmanById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Businessman not found" });
    }
    await storage.deleteBusinessman(req.params.id);
    res.status(204).send();
  });

  // Contacts API routes (user-specific)
  app.get(api.contacts.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const contacts = await storage.getContactsByOwner(req.user.id);
    res.json(contacts);
  });

  app.get(api.contacts.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const contact = await storage.getContactById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }
    if (contact.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Contact not found" });
    }
    res.json(contact);
  });

  app.post(api.contacts.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.contacts.create.input.parse(req.body);
      const contact = await storage.createContact({
        ...input,
        ownerId: req.user.id,
      });
      res.status(201).json(contact);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.contacts.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getContactById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Contact not found" });
    }
    if (existing.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const input = api.contacts.update.input.parse(req.body);
      const contact = await storage.updateContact(req.params.id, input);
      res.json(contact);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.contacts.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getContactById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Contact not found" });
    }
    if (existing.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.deleteContact(req.params.id);
    res.status(204).send();
  });

  // Deals routes
  app.get(api.deals.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const deals = await storage.getDealsByOwner(req.user.id);
    res.json(deals);
  });

  app.get(api.deals.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const deal = await storage.getDealById(req.params.id);
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }
    if (deal.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(deal);
  });

  app.post(api.deals.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.deals.create.input.parse(req.body);
      const deal = await storage.createDeal({
        ...input,
        ownerId: req.user.id,
      });
      
      const notification = await storage.createNotification({
        userId: req.user.id,
        type: "deal_created",
        title: "New Deal Created",
        message: `Deal "${deal.title}" has been created successfully.`,
        resourceType: "deal",
        resourceId: deal.id,
        isRead: false,
        metadata: { dealStage: deal.stage },
      });
      wsNotificationService.sendNotification(req.user.id, notification);
      
      res.status(201).json(deal);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.deals.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getDealById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Deal not found" });
    }
    if (existing.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const input = api.deals.update.input.parse(req.body);
      const deal = await storage.updateDeal(req.params.id, input);
      
      if (deal && input.stage && input.stage !== existing.stage) {
        const notification = await storage.createNotification({
          userId: req.user.id,
          type: "deal_stage_change",
          title: "Deal Stage Updated",
          message: `Deal "${deal.title}" moved from ${existing.stage} to ${input.stage}.`,
          resourceType: "deal",
          resourceId: deal.id,
          isRead: false,
          metadata: { previousStage: existing.stage, newStage: input.stage },
        });
        wsNotificationService.sendNotification(req.user.id, notification);
      } else if (deal) {
        const notification = await storage.createNotification({
          userId: req.user.id,
          type: "deal_update",
          title: "Deal Updated",
          message: `Deal "${deal.title}" has been updated.`,
          resourceType: "deal",
          resourceId: deal.id,
          isRead: false,
          metadata: {},
        });
        wsNotificationService.sendNotification(req.user.id, notification);
      }
      
      res.json(deal);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.deals.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getDealById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Deal not found" });
    }
    if (existing.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.deleteDeal(req.params.id);
    res.status(204).send();
  });

  // Deal Rooms routes
  app.get(api.dealRooms.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const rooms = await storage.getDealRoomsByOwner(req.user.id);
    res.json(rooms);
  });

  app.get(api.dealRooms.byDeal.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const deal = await storage.getDealById(req.params.dealId);
    if (!deal || deal.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal not found" });
    }
    const rooms = await storage.getDealRoomsByDeal(req.params.dealId);
    res.json(rooms);
  });

  app.get(api.dealRooms.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.id);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    res.json(room);
  });

  app.post(api.dealRooms.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.dealRooms.create.input.parse(req.body);
      const deal = await storage.getDealById(input.dealId);
      if (!deal || deal.ownerId !== req.user.id) {
        return res.status(404).json({ message: "Deal not found" });
      }
      const room = await storage.createDealRoom({
        ...input,
        ownerId: req.user.id,
      });
      res.status(201).json(room);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.dealRooms.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getDealRoomById(req.params.id);
    if (!existing || existing.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    try {
      const input = api.dealRooms.update.input.parse(req.body);
      const room = await storage.updateDealRoom(req.params.id, input);
      res.json(room);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.dealRooms.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const existing = await storage.getDealRoomById(req.params.id);
    if (!existing || existing.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    await storage.deleteDealRoom(req.params.id);
    res.status(204).send();
  });

  // Deal Room Documents routes
  app.get(api.dealRoomDocuments.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    const docs = await storage.getDocumentsByRoom(req.params.roomId);
    res.json(docs);
  });

  app.get(api.dealRoomDocuments.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const doc = await storage.getDocumentById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }
    const room = await storage.getDealRoomById(doc.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Document not found" });
    }
    res.json(doc);
  });

  app.post(api.dealRoomDocuments.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    try {
      const input = api.dealRoomDocuments.create.input.parse(req.body);
      const doc = await storage.createDocument({
        ...input,
        roomId: req.params.roomId,
        uploadedBy: req.user.id,
      });
      res.status(201).json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.dealRoomDocuments.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const doc = await storage.getDocumentById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }
    const room = await storage.getDealRoomById(doc.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const input = api.dealRoomDocuments.update.input.parse(req.body);
      const updated = await storage.updateDocument(req.params.id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.dealRoomDocuments.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const doc = await storage.getDocumentById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }
    const room = await storage.getDealRoomById(doc.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.deleteDocument(req.params.id);
    res.status(204).send();
  });

  // Deal Room Notes routes
  app.get(api.dealRoomNotes.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    const notes = await storage.getNotesByRoom(req.params.roomId);
    res.json(notes);
  });

  app.get(api.dealRoomNotes.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const note = await storage.getNoteById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }
    const room = await storage.getDealRoomById(note.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Note not found" });
    }
    res.json(note);
  });

  app.post(api.dealRoomNotes.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    try {
      const input = api.dealRoomNotes.create.input.parse(req.body);
      const note = await storage.createNote({
        ...input,
        roomId: req.params.roomId,
        authorId: req.user.id,
      });
      res.status(201).json(note);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.dealRoomNotes.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const note = await storage.getNoteById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }
    const room = await storage.getDealRoomById(note.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const input = api.dealRoomNotes.update.input.parse(req.body);
      const updated = await storage.updateNote(req.params.id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.dealRoomNotes.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const note = await storage.getNoteById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }
    const room = await storage.getDealRoomById(note.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.deleteNote(req.params.id);
    res.status(204).send();
  });

  // Deal Room Milestones routes
  app.get(api.dealRoomMilestones.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    const milestones = await storage.getMilestonesByRoom(req.params.roomId);
    res.json(milestones);
  });

  app.get(api.dealRoomMilestones.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const milestone = await storage.getMilestoneById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: "Milestone not found" });
    }
    const room = await storage.getDealRoomById(milestone.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Milestone not found" });
    }
    res.json(milestone);
  });

  app.post(api.dealRoomMilestones.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    try {
      const input = api.dealRoomMilestones.create.input.parse(req.body);
      const milestone = await storage.createMilestone({
        ...input,
        roomId: req.params.roomId,
        createdBy: req.user.id,
      });
      res.status(201).json(milestone);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.dealRoomMilestones.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const milestone = await storage.getMilestoneById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: "Milestone not found" });
    }
    const room = await storage.getDealRoomById(milestone.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const input = api.dealRoomMilestones.update.input.parse(req.body);
      const updated = await storage.updateMilestone(req.params.id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.dealRoomMilestones.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const milestone = await storage.getMilestoneById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: "Milestone not found" });
    }
    const room = await storage.getDealRoomById(milestone.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.deleteMilestone(req.params.id);
    res.status(204).send();
  });

  // Pitch Deck Analysis Routes
  app.get(api.pitchDeckAnalyses.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    const analyses = await storage.getPitchDeckAnalysesByRoom(req.params.roomId);
    res.json(analyses);
  });

  app.get(api.pitchDeckAnalyses.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const analysis = await storage.getPitchDeckAnalysisById(req.params.id);
    if (!analysis) {
      return res.status(404).json({ message: "Analysis not found" });
    }
    const room = await storage.getDealRoomById(analysis.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Analysis not found" });
    }
    res.json(analysis);
  });

  app.post(api.pitchDeckAnalyses.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    try {
      const input = api.pitchDeckAnalyses.create.input.parse(req.body);
      
      const { pitchDeckAnalysisService } = await import("./services/mistral");
      
      const checklist = pitchDeckAnalysisService.getAnalysisChecklist();
      
      const analysis = await storage.createPitchDeckAnalysis({
        roomId: req.params.roomId,
        documentId: input.documentId || null,
        createdBy: req.user.id,
        status: "analyzing",
        checklistItems: checklist as any,
        currentStep: 0,
        totalSteps: 10,
      });
      
      (async () => {
        try {
          let pitchContent = input.pitchDeckContent || "";
          
          if (input.documentId) {
            const doc = await storage.getDocumentById(input.documentId);
            if (doc?.description) {
              pitchContent = doc.description;
            }
          }
          
          if (!pitchContent) {
            pitchContent = `Deal Room: ${room.name}\nDescription: ${room.description || "No description provided"}\n\nPlease analyze this investment opportunity based on the deal room context.`;
          }
          
          const result = await pitchDeckAnalysisService.analyzePitchDeck(pitchContent, {
            name: room.name,
          });
          
          const completedChecklist = checklist.map(item => ({
            ...item,
            status: "completed" as const,
            result: `Score: ${result.categoryScores[item.id as keyof typeof result.categoryScores] || "N/A"}`,
          }));
          
          await storage.updatePitchDeckAnalysis(analysis.id, {
            status: "completed",
            checklistItems: completedChecklist as any,
            currentStep: 10,
            overallScore: result.overallScore,
            strengths: result.strengths as any,
            weaknesses: result.weaknesses as any,
            recommendations: result.recommendations as any,
            problemScore: result.categoryScores.problem,
            solutionScore: result.categoryScores.solution,
            marketScore: result.categoryScores.market,
            businessModelScore: result.categoryScores.businessModel,
            tractionScore: result.categoryScores.traction,
            teamScore: result.categoryScores.team,
            financialsScore: result.categoryScores.financials,
            competitionScore: result.categoryScores.competition,
            askScore: result.categoryScores.ask,
            presentationScore: result.categoryScores.presentation,
            detailedAnalysis: result.detailedAnalysis as any,
            summary: result.summary,
            tokensUsed: result.tokensUsed,
            modelUsed: "mistral-large-latest",
            completedAt: new Date(),
          });
        } catch (error) {
          console.error("Pitch deck analysis failed:", error);
          await storage.updatePitchDeckAnalysis(analysis.id, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Analysis failed",
          });
        }
      })();
      
      res.status(201).json(analysis);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.pitchDeckAnalyses.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const analysis = await storage.getPitchDeckAnalysisById(req.params.id);
    if (!analysis) {
      return res.status(404).json({ message: "Analysis not found" });
    }
    const room = await storage.getDealRoomById(analysis.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.deletePitchDeckAnalysis(req.params.id);
    res.status(204).send();
  });

  // Email Templates Routes
  app.get(api.emailTemplates.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const templates = await storage.getEmailTemplates(req.user.id);
    res.json(templates);
  });

  app.get(api.emailTemplates.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const template = await storage.getEmailTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    if (template.ownerId !== req.user.id && !template.isPublic) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(template);
  });

  app.post(api.emailTemplates.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.emailTemplates.create.input.parse(req.body);
      const template = await storage.createEmailTemplate({
        ...input,
        ownerId: req.user.id,
      });
      res.status(201).json(template);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.emailTemplates.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const template = await storage.getEmailTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    if (template.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const input = api.emailTemplates.update.input.parse(req.body);
      const updated = await storage.updateEmailTemplate(req.params.id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.emailTemplates.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const template = await storage.getEmailTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    if (template.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.deleteEmailTemplate(req.params.id);
    res.status(204).send();
  });

  // Outreaches Routes
  app.get(api.outreaches.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startupId = typeof req.query.startupId === 'string' ? req.query.startupId : undefined;
    const outreaches = await storage.getOutreaches(req.user.id, startupId);
    res.json(outreaches);
  });

  app.get(api.outreaches.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const outreach = await storage.getOutreachById(req.params.id);
    if (!outreach) {
      return res.status(404).json({ message: "Outreach not found" });
    }
    if (outreach.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(outreach);
  });

  app.post(api.outreaches.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.outreaches.create.input.parse(req.body);
      const outreach = await storage.createOutreach({
        ...input,
        ownerId: req.user.id,
      });
      res.status(201).json(outreach);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.outreaches.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const outreach = await storage.getOutreachById(req.params.id);
    if (!outreach) {
      return res.status(404).json({ message: "Outreach not found" });
    }
    if (outreach.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const input = api.outreaches.update.input.parse(req.body);
      const updated = await storage.updateOutreach(req.params.id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.outreaches.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const outreach = await storage.getOutreachById(req.params.id);
    if (!outreach) {
      return res.status(404).json({ message: "Outreach not found" });
    }
    if (outreach.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.deleteOutreach(req.params.id);
    res.status(204).send();
  });

  // Matches Routes
  app.get(api.matches.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startupId = typeof req.query.startupId === 'string' ? req.query.startupId : undefined;
    const matches = await storage.getMatches(startupId);
    res.json(matches);
  });

  app.get(api.matches.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const match = await storage.getMatchById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }
    res.json(match);
  });

  app.post(api.matches.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.matches.create.input.parse(req.body);
      const match = await storage.createMatch(input);
      res.status(201).json(match);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.matches.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const match = await storage.getMatchById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }
    try {
      const input = api.matches.update.input.parse(req.body);
      const updated = await storage.updateMatch(req.params.id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.matches.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const match = await storage.getMatchById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }
    await storage.deleteMatch(req.params.id);
    res.status(204).send();
  });

  // Interaction Logs Routes
  app.get(api.interactionLogs.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const outreachId = typeof req.query.outreachId === 'string' ? req.query.outreachId : undefined;
    const startupId = typeof req.query.startupId === 'string' ? req.query.startupId : undefined;
    const logs = await storage.getInteractionLogs(outreachId, startupId);
    res.json(logs);
  });

  app.post(api.interactionLogs.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.interactionLogs.create.input.parse(req.body);
      const log = await storage.createInteractionLog({
        ...input,
        performedById: req.user.id,
      });
      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Pitch Deck Analysis API - Extract startup info for onboarding autofill
  app.post("/api/pitch-deck/extract-info", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { pitchDeckContent } = req.body;
      if (!pitchDeckContent || typeof pitchDeckContent !== "string") {
        return res.status(400).json({ message: "Pitch deck content is required" });
      }

      const { pitchDeckAnalysisService } = await import("./services/mistral");
      const extractedInfo = await pitchDeckAnalysisService.extractStartupInfo(pitchDeckContent);
      
      res.json({ success: true, extractedInfo });
    } catch (error) {
      console.error("Pitch deck extraction error:", error);
      return res.status(500).json({ message: "Failed to extract startup info from pitch deck" });
    }
  });

  // Pitch Deck Analysis API - Full multi-perspective analysis
  app.post("/api/pitch-deck/full-analysis", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { pitchDeckContent } = req.body;
      if (!pitchDeckContent || typeof pitchDeckContent !== "string") {
        return res.status(400).json({ message: "Pitch deck content is required" });
      }

      const { pitchDeckAnalysisService } = await import("./services/mistral");
      const analysis = await pitchDeckAnalysisService.performFullAnalysis(pitchDeckContent);
      
      res.json({ success: true, analysis });
    } catch (error) {
      console.error("Pitch deck full analysis error:", error);
      return res.status(500).json({ message: "Failed to analyze pitch deck" });
    }
  });

  // Matchmaking API
  app.get("/api/matches", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { getMatchesForUser } = await import("./services/matchmaking");
      const matches = await getMatchesForUser(req.user.id);
      res.json(matches);
    } catch (error) {
      console.error("Get matches error:", error);
      return res.status(500).json({ message: "Failed to get matches" });
    }
  });

  app.post("/api/matches/generate", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { startupId, limit = 50 } = req.body;
      
      if (!startupId) {
        return res.status(400).json({ message: "startupId is required" });
      }

      const startup = await storage.getStartupById(startupId);
      if (!startup || startup.founderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to generate matches for this startup" });
      }

      const { generateMatchesForStartup, saveMatchResults, adjustWeightsFromFeedback } = await import("./services/matchmaking");
      
      const personalizedWeights = await adjustWeightsFromFeedback(req.user.id);
      const matchResults = await generateMatchesForStartup(startupId, personalizedWeights, limit);
      const savedMatches = await saveMatchResults(startupId, matchResults);
      
      res.json({ 
        success: true, 
        matchCount: savedMatches.length,
        matches: savedMatches 
      });
    } catch (error) {
      console.error("Generate matches error:", error);
      return res.status(500).json({ message: "Failed to generate matches" });
    }
  });

  app.patch("/api/matches/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { status, feedback } = req.body;
      
      const { updateMatchStatus, verifyMatchOwnership } = await import("./services/matchmaking");
      
      const isOwner = await verifyMatchOwnership(req.params.id, req.user.id);
      if (!isOwner) {
        return res.status(403).json({ message: "Not authorized to update this match" });
      }
      
      const updated = await updateMatchStatus(req.params.id, status, feedback);
      
      if (!updated) {
        return res.status(404).json({ message: "Match not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Update match error:", error);
      return res.status(500).json({ message: "Failed to update match" });
    }
  });

  app.get("/api/matches/recommendations/:investorId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { getTopStartupsForInvestor } = await import("./services/matchmaking");
      const recommendations = await getTopStartupsForInvestor(req.params.investorId, 20);
      res.json(recommendations);
    } catch (error) {
      console.error("Get recommendations error:", error);
      return res.status(500).json({ message: "Failed to get recommendations" });
    }
  });

  app.post("/api/matches/enrich-investor/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const investor = await storage.getInvestorById(req.params.id);
      if (!investor) {
        return res.status(404).json({ message: "Investor not found" });
      }

      const { mistralService } = await import("./services/mistral");
      const result = await mistralService.enrichInvestor(investor);
      
      res.json({
        success: true,
        suggestedUpdates: result.suggestedUpdates,
        insights: result.insights,
        confidence: result.confidence,
      });
    } catch (error) {
      console.error("Enrich investor error:", error);
      return res.status(500).json({ message: "Failed to enrich investor" });
    }
  });

  app.post("/api/matches/batch-enrich", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { investorIds } = req.body;
      
      if (!Array.isArray(investorIds) || investorIds.length === 0) {
        return res.status(400).json({ message: "investorIds array is required" });
      }

      const { mistralService } = await import("./services/mistral");
      const results: Array<{ id: string; success: boolean; error?: string }> = [];
      
      for (const id of investorIds.slice(0, 10)) {
        try {
          const investor = await storage.getInvestorById(id);
          if (investor) {
            const result = await mistralService.enrichInvestor(investor);
            if (Object.keys(result.suggestedUpdates).length > 0) {
              await storage.updateInvestor(id, result.suggestedUpdates);
            }
            results.push({ id, success: true });
          } else {
            results.push({ id, success: false, error: "Not found" });
          }
        } catch (err) {
          results.push({ id, success: false, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }
      
      res.json({ success: true, results });
    } catch (error) {
      console.error("Batch enrich error:", error);
      return res.status(500).json({ message: "Failed to enrich investors" });
    }
  });

  // Accelerated Matching API - AI-powered pitch deck analysis and matching
  app.get("/api/accelerated-matches", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { getJobsForUser } = await import("./services/accelerated-matching");
      const jobs = await getJobsForUser(req.user.id);
      res.json(jobs);
    } catch (error) {
      console.error("Get accelerated matches error:", error);
      return res.status(500).json({ message: "Failed to get accelerated match jobs" });
    }
  });

  app.get("/api/accelerated-matches/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { getJobById, verifyJobOwnership } = await import("./services/accelerated-matching");
      
      const isOwner = await verifyJobOwnership(req.params.id, req.user.id);
      if (!isOwner) {
        return res.status(403).json({ message: "Not authorized to view this job" });
      }
      
      const job = await getJobById(req.params.id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Get accelerated match job error:", error);
      return res.status(500).json({ message: "Failed to get job" });
    }
  });

  app.post("/api/accelerated-matches", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { startupId, deckText } = req.body;
      
      if (!deckText || typeof deckText !== "string") {
        return res.status(400).json({ message: "deckText is required" });
      }

      if (startupId) {
        const startup = await storage.getStartupById(startupId);
        if (!startup || startup.founderId !== req.user.id) {
          return res.status(403).json({ message: "Not authorized to use this startup" });
        }
      }

      const { createAcceleratedMatchJob, runAcceleratedMatching } = await import("./services/accelerated-matching");
      
      const job = await createAcceleratedMatchJob(
        req.user.id,
        startupId,
        undefined
      );

      runAcceleratedMatching(job.id, deckText, req.user.id).catch(err => {
        console.error("Accelerated matching background error:", err);
      });

      res.status(201).json(job);
    } catch (error) {
      console.error("Create accelerated match job error:", error);
      return res.status(500).json({ message: "Failed to create accelerated match job" });
    }
  });

  // ==================== CONTACTS API ====================
  
  // Get all contacts for the current user
  app.get("/api/contacts", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const contacts = await storage.getContactsByOwner(req.user.id);
      res.json(contacts);
    } catch (error) {
      console.error("Get contacts error:", error);
      return res.status(500).json({ message: "Failed to get contacts" });
    }
  });

  // Create a new contact
  app.post("/api/contacts", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const contactData = {
        ...req.body,
        ownerId: req.user.id,
      };
      const contact = await storage.createContact(contactData);
      res.status(201).json(contact);
    } catch (error) {
      console.error("Create contact error:", error);
      return res.status(500).json({ message: "Failed to create contact" });
    }
  });

  // Create contact from investor
  app.post("/api/contacts/from-investor", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { investorId } = req.body;
      if (!investorId) {
        return res.status(400).json({ message: "investorId is required" });
      }

      const investor = await storage.getInvestorById(investorId);
      if (!investor) {
        return res.status(404).json({ message: "Investor not found" });
      }

      // Check if contact already exists from this investor
      const existingContacts = await storage.getContactsByOwner(req.user.id);
      const exists = existingContacts.find(c => c.sourceInvestorId === investorId);
      if (exists) {
        return res.status(409).json({ message: "Contact already exists for this investor", contact: exists });
      }

      // Get firm name if linked
      let companyName: string | undefined;
      if (investor.firmId) {
        const firm = await storage.getInvestmentFirmById(investor.firmId);
        companyName = firm?.name;
      }

      const contact = await storage.createContact({
        ownerId: req.user.id,
        type: "investor",
        firstName: investor.firstName || "Unknown",
        lastName: investor.lastName || undefined,
        email: investor.email || undefined,
        company: companyName || undefined,
        title: investor.title || undefined,
        linkedinUrl: investor.linkedinUrl || investor.personLinkedinUrl || undefined,
        twitterUrl: investor.twitterUrl || undefined,
        avatar: investor.avatar || undefined,
        notes: investor.bio || undefined,
        tags: investor.sectors || [],
        sourceType: "investor",
        sourceInvestorId: investorId,
      });

      res.status(201).json(contact);
    } catch (error) {
      console.error("Create contact from investor error:", error);
      return res.status(500).json({ message: "Failed to create contact from investor" });
    }
  });

  // Create contact from investment firm
  app.post("/api/contacts/from-firm", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { firmId } = req.body;
      if (!firmId) {
        return res.status(400).json({ message: "firmId is required" });
      }

      const firm = await storage.getInvestmentFirmById(firmId);
      if (!firm) {
        return res.status(404).json({ message: "Investment firm not found" });
      }

      // Check if contact already exists from this firm
      const existingContacts = await storage.getContactsByOwner(req.user.id);
      const exists = existingContacts.find(c => c.sourceFirmId === firmId);
      if (exists) {
        return res.status(409).json({ message: "Contact already exists for this firm", contact: exists });
      }

      // Get primary email from emails array
      const primaryEmail = firm.emails && firm.emails.length > 0 ? firm.emails[0].value : undefined;

      const contact = await storage.createContact({
        ownerId: req.user.id,
        type: "firm",
        firstName: firm.name || "Unknown",
        lastName: undefined,
        email: primaryEmail,
        company: firm.name || undefined,
        title: firm.firmClassification || firm.type || "Investment Firm",
        linkedinUrl: firm.linkedinUrl || undefined,
        twitterUrl: firm.twitterUrl || undefined,
        notes: firm.description || undefined,
        tags: firm.sectors || [],
        sourceType: "firm",
        sourceFirmId: firmId,
      });

      res.status(201).json(contact);
    } catch (error) {
      console.error("Create contact from firm error:", error);
      return res.status(500).json({ message: "Failed to create contact from firm" });
    }
  });

  // Create contact from match
  app.post("/api/contacts/from-match", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { matchId, investorId, firmId } = req.body;
      if (!matchId) {
        return res.status(400).json({ message: "matchId is required" });
      }

      // Check if contact already exists from this match
      const existingContacts = await storage.getContactsByOwner(req.user.id);
      const exists = existingContacts.find(c => c.sourceMatchId === matchId);
      if (exists) {
        return res.status(409).json({ message: "Contact already exists for this match", contact: exists });
      }

      let firstName = "Unknown";
      let lastName: string | undefined;
      let email: string | undefined;
      let company: string | undefined;
      let title: string | undefined;
      let linkedinUrl: string | undefined;
      let twitterUrl: string | undefined;
      let avatar: string | undefined;
      let notes: string | undefined;
      let tags: string[] = [];

      if (investorId) {
        const investor = await storage.getInvestorById(investorId);
        if (investor) {
          firstName = investor.firstName || "Unknown";
          lastName = investor.lastName || undefined;
          email = investor.email || undefined;
          if (investor.firmId) {
            const firm = await storage.getInvestmentFirmById(investor.firmId);
            company = firm?.name;
          }
          title = investor.title || undefined;
          linkedinUrl = investor.linkedinUrl || investor.personLinkedinUrl || undefined;
          twitterUrl = investor.twitterUrl || undefined;
          avatar = investor.avatar || undefined;
          notes = investor.bio || undefined;
          tags = investor.sectors || [];
        }
      } else if (firmId) {
        const firm = await storage.getInvestmentFirmById(firmId);
        if (firm) {
          firstName = firm.name || "Unknown";
          email = firm.emails && firm.emails.length > 0 ? firm.emails[0].value : undefined;
          company = firm.name || undefined;
          title = firm.firmClassification || firm.type || "Investment Firm";
          linkedinUrl = firm.linkedinUrl || undefined;
          twitterUrl = firm.twitterUrl || undefined;
          notes = firm.description || undefined;
          tags = firm.sectors || [];
        }
      }

      const contact = await storage.createContact({
        ownerId: req.user.id,
        type: investorId ? "investor" : "firm",
        firstName,
        lastName,
        email,
        company,
        title,
        linkedinUrl,
        twitterUrl,
        avatar,
        notes,
        tags,
        sourceType: "match",
        sourceInvestorId: investorId || undefined,
        sourceFirmId: firmId || undefined,
        sourceMatchId: matchId,
      });

      res.status(201).json(contact);
    } catch (error) {
      console.error("Create contact from match error:", error);
      return res.status(500).json({ message: "Failed to create contact from match" });
    }
  });

  // Update a contact
  app.patch("/api/contacts/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const contact = await storage.getContactById(req.params.id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      if (contact.ownerId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to update this contact" });
      }

      const updated = await storage.updateContact(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Update contact error:", error);
      return res.status(500).json({ message: "Failed to update contact" });
    }
  });

  // Delete a contact
  app.delete("/api/contacts/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const contact = await storage.getContactById(req.params.id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      if (contact.ownerId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this contact" });
      }

      await storage.deleteContact(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete contact error:", error);
      return res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  // ==================== DEALS API ====================
  
  // Get all deals for the current user
  app.get("/api/deals", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const deals = await storage.getDealsByOwner(req.user.id);
      res.json(deals);
    } catch (error) {
      console.error("Get deals error:", error);
      return res.status(500).json({ message: "Failed to get deals" });
    }
  });

  // Create a new deal
  app.post("/api/deals", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const dealData = {
        ...req.body,
        ownerId: req.user.id,
      };
      const deal = await storage.createDeal(dealData);
      res.status(201).json(deal);
    } catch (error) {
      console.error("Create deal error:", error);
      return res.status(500).json({ message: "Failed to create deal" });
    }
  });

  // Update a deal
  app.patch("/api/deals/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const deal = await storage.getDealById(req.params.id);
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.ownerId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to update this deal" });
      }

      const updated = await storage.updateDeal(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Update deal error:", error);
      return res.status(500).json({ message: "Failed to update deal" });
    }
  });

  // Delete a deal
  app.delete("/api/deals/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const deal = await storage.getDealById(req.params.id);
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.ownerId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this deal" });
      }

      await storage.deleteDeal(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete deal error:", error);
      return res.status(500).json({ message: "Failed to delete deal" });
    }
  });

  // ==================== DASHBOARD API ====================
  
  // Get dashboard summary with real data
  app.get("/api/dashboard/summary", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const [contacts, deals, startups] = await Promise.all([
        storage.getContactsByOwner(req.user.id),
        storage.getDealsByOwner(req.user.id),
        storage.getStartupsByFounder(req.user.id),
      ]);

      // Get matches for all startups
      const { getMatchesForUser } = await import("./services/matchmaking");
      const matches = await getMatchesForUser(req.user.id);

      // Calculate deal pipeline stages
      const dealsByStage: Record<string, number> = {
        lead: 0,
        contacted: 0,
        meeting: 0,
        due_diligence: 0,
        term_sheet: 0,
        closing: 0,
        closed: 0,
        passed: 0,
      };
      
      for (const deal of deals) {
        const stage = deal.stage || 'lead';
        dealsByStage[stage] = (dealsByStage[stage] || 0) + 1;
      }

      // Calculate contact types
      const contactsByType: Record<string, number> = {};
      for (const contact of contacts) {
        const type = contact.type || 'other';
        contactsByType[type] = (contactsByType[type] || 0) + 1;
      }

      // Calculate contacts by pipeline stage for founder CRM
      const contactsByPipelineStage: Record<string, number> = {
        sourced: 0,
        first_review: 0,
        deep_dive: 0,
        due_diligence: 0,
        term_sheet: 0,
        closed: 0,
      };
      for (const contact of contacts) {
        const stage = (contact as any).pipelineStage || 'sourced';
        contactsByPipelineStage[stage] = (contactsByPipelineStage[stage] || 0) + 1;
      }

      // Get total database counts
      const [investorsData, firmsData] = await Promise.all([
        storage.getInvestors(1, 0),
        storage.getInvestmentFirms(1, 0),
      ]);

      res.json({
        contacts: {
          total: contacts.length,
          byType: contactsByType,
          byPipelineStage: contactsByPipelineStage,
          activeCount: contacts.filter(c => c.status === 'active').length,
        },
        deals: {
          total: deals.length,
          byStage: dealsByStage,
          activeCount: deals.filter(d => d.status === 'active').length,
          totalValue: deals.reduce((sum, d) => sum + (d.dealSize || 0), 0),
        },
        matches: {
          total: matches.length,
          pending: matches.filter(m => m.status === 'pending').length,
          approved: matches.filter(m => m.status === 'approved').length,
          rejected: matches.filter(m => m.status === 'rejected').length,
        },
        startups: {
          total: startups.length,
        },
        database: {
          totalInvestors: investorsData.total,
          totalFirms: firmsData.total,
        },
      });
    } catch (error) {
      console.error("Get dashboard summary error:", error);
      return res.status(500).json({ message: "Failed to get dashboard summary" });
    }
  });

  // Notifications API
  app.get("/api/notifications", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const notifications = await storage.getNotificationsByUser(req.user.id);
    res.json(notifications);
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const count = await storage.getUnreadNotificationCount(req.user.id);
    res.json({ count });
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const notifications = await storage.getNotificationsByUser(req.user.id, 1000);
    const owned = notifications.find(n => n.id === req.params.id);
    if (!owned) {
      return res.status(404).json({ message: "Notification not found" });
    }
    const notification = await storage.markNotificationAsRead(req.params.id);
    res.json(notification);
  });

  app.patch("/api/notifications/mark-all-read", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    await storage.markAllNotificationsAsRead(req.user.id);
    res.json({ success: true });
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const notifications = await storage.getNotificationsByUser(req.user.id, 1000);
    const owned = notifications.find(n => n.id === req.params.id);
    if (!owned) {
      return res.status(404).json({ message: "Notification not found" });
    }
    await storage.deleteNotification(req.params.id);
    res.json({ success: true });
  });

  // Hunter Email Routes
  app.post("/api/email/verify", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: "Email is required" });
    }

    try {
      const { hunterService } = await import('./services/hunter');
      if (!hunterService.isConfigured()) {
        return res.status(503).json({ message: "Email verification service not configured" });
      }
      
      const result = await hunterService.verifyEmail(email);
      if (!result) {
        return res.status(500).json({ message: "Verification failed" });
      }
      
      res.json({
        email,
        status: result.status,
        score: result.score,
        result: result.result,
        deliverable: result.result === 'deliverable',
        disposable: result.disposable,
        webmail: result.webmail,
      });
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Verification error" 
      });
    }
  });

  app.post("/api/email/find", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const { domain, firstName, lastName } = req.body;
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ message: "Domain is required" });
    }

    try {
      const { hunterService } = await import('./services/hunter');
      if (!hunterService.isConfigured()) {
        return res.status(503).json({ message: "Email finder service not configured" });
      }
      
      const result = await hunterService.findEmail(domain, firstName, lastName);
      if (!result) {
        return res.json({ found: false, email: null });
      }
      
      res.json({
        found: true,
        email: result.email,
        score: result.score,
        position: result.position,
        sources: result.sources?.length || 0,
      });
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Email finder error" 
      });
    }
  });

  app.post("/api/email/domain-search", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const { domain, limit = 10 } = req.body;
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ message: "Domain is required" });
    }

    try {
      const { hunterService } = await import('./services/hunter');
      if (!hunterService.isConfigured()) {
        return res.status(503).json({ message: "Domain search service not configured" });
      }
      
      const result = await hunterService.searchDomain(domain, limit);
      if (!result) {
        return res.json({ domain, emails: [], organization: null });
      }
      
      res.json({
        domain: result.domain,
        organization: result.organization,
        pattern: result.pattern,
        emails: result.emails?.map(e => ({
          email: e.email,
          firstName: e.firstName,
          lastName: e.lastName,
          position: e.position,
          score: e.score,
        })) || [],
      });
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Domain search error" 
      });
    }
  });

  // Calendar Meetings API
  app.get("/api/calendar/meetings", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const meetings = await storage.getCalendarMeetingsByUser((req.user as any).id);
      res.json(meetings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch meetings" });
    }
  });

  app.post("/api/calendar/meetings", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = insertCalendarMeetingSchema.parse({
        ...req.body,
        userId: (req.user as any).id,
      });
      const meeting = await storage.createCalendarMeeting(input);
      res.status(201).json(meeting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message, field: error.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Failed to create meeting" });
    }
  });

  app.delete("/api/calendar/meetings/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const meeting = await storage.getCalendarMeetingById(req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }
      if (meeting.userId !== (req.user as any).id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteCalendarMeeting(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete meeting" });
    }
  });

  // User Email Settings API
  app.get("/api/user/email-settings", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const settings = await storage.getUserEmailSettings((req.user as any).id);
      res.json(settings || {});
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email settings" });
    }
  });

  app.post("/api/user/email-settings", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = insertUserEmailSettingsSchema.parse({
        ...req.body,
        userId: (req.user as any).id,
      });
      const settings = await storage.upsertUserEmailSettings(input);
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message, field: error.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Failed to save email settings" });
    }
  });

  // Send outreach email with verification
  app.post("/api/outreach/send", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const { outreachId, toEmail, subject, htmlContent, textContent, verifyFirst = true, investorId, startupId } = req.body;
    
    if (!toEmail || !subject || !htmlContent) {
      return res.status(400).json({ message: "toEmail, subject, and htmlContent are required" });
    }

    try {
      const { sendOutreachEmail } = await import('./services/resend');
      const result = await sendOutreachEmail(toEmail, subject, htmlContent, textContent, verifyFirst);
      
      if (outreachId) {
        await storage.updateOutreach(outreachId, {
          status: result.success ? "sent" : "failed",
          lastSentAt: new Date(),
        });
      }
      
      if (result.success && startupId) {
        await storage.createInteractionLog({
          outreachId: outreachId || null,
          startupId,
          investorId: investorId || null,
          type: "email_sent",
          subject,
          content: `Email sent to ${toEmail}`,
          sentAt: new Date(),
          status: "sent",
          metadata: {
            messageId: result.messageId,
            verification: result.verification,
          },
        });
      }
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          verification: result.verification,
        });
      }
      
      res.json({
        success: true,
        messageId: result.messageId,
        verification: result.verification,
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : "Send error" 
      });
    }
  });

  // ==================== NEWSROOM API ROUTES ====================

  // Get all published articles
  app.get("/api/newsroom/articles", async (req, res) => {
    try {
      const { newsArticles } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq, desc } = await import("drizzle-orm");
      
      const status = (req.query.status as string) || "published";
      const limit = parseInt(req.query.limit as string) || 20;
      
      const articles = await db.select()
        .from(newsArticles)
        .where(eq(newsArticles.status, status))
        .orderBy(desc(newsArticles.publishedAt))
        .limit(limit);
      
      res.json(articles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch articles" });
    }
  });

  // Get single article by slug
  app.get("/api/newsroom/articles/:slug", async (req, res) => {
    try {
      const { newsArticles } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const [article] = await db.select()
        .from(newsArticles)
        .where(eq(newsArticles.slug, req.params.slug))
        .limit(1);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      await db.update(newsArticles)
        .set({ viewCount: (article.viewCount || 0) + 1 })
        .where(eq(newsArticles.id, article.id));
      
      res.json(article);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch article" });
    }
  });

  // Admin: Delete article
  app.delete("/api/newsroom/articles/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const adminEmails = ["vc@philippemasindet.com", "masindetphilippe@gmail.com"];
    if (!req.user.isAdmin && !adminEmails.includes(req.user.email || "")) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      const { newsArticles } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      await db.delete(newsArticles).where(eq(newsArticles.id, req.params.id));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete article error:", error);
      res.status(500).json({ message: "Failed to delete article" });
    }
  });

  // Admin: Get schedule status
  app.get("/api/newsroom/schedule", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsroomScheduler } = await import("./services/newsroom-scheduler");
      const date = req.query.date ? new Date(req.query.date as string) : new Date();
      const status = await newsroomScheduler.getScheduleStatus(date);
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch schedule" });
    }
  });

  // Admin: Trigger daily schedule creation
  app.post("/api/newsroom/schedule/create", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsroomScheduler } = await import("./services/newsroom-scheduler");
      const date = req.body.date ? new Date(req.body.date) : new Date();
      const created = await newsroomScheduler.createDailySchedule(date);
      res.json({ created });
    } catch (error) {
      res.status(500).json({ message: "Failed to create schedule" });
    }
  });

  // Admin: Run scheduled tasks
  app.post("/api/newsroom/schedule/run", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsroomScheduler } = await import("./services/newsroom-scheduler");
      const result = await newsroomScheduler.runScheduledTasks();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to run scheduled tasks" });
    }
  });

  // Admin: Fetch from all sources
  app.post("/api/newsroom/sources/fetch", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { sourceIntelligenceAgent } = await import("./services/newsroom-source");
      const result = await sourceIntelligenceAgent.fetchAllActiveSources();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch from sources" });
    }
  });

  // Admin: Initialize default sources
  app.post("/api/newsroom/sources/init", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { sourceIntelligenceAgent } = await import("./services/newsroom-source");
      const count = await sourceIntelligenceAgent.initializeDefaultSources();
      res.json({ initialized: count });
    } catch (error) {
      res.status(500).json({ message: "Failed to initialize sources" });
    }
  });

  // Admin: Validate pending items
  app.post("/api/newsroom/validate", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { signalValidationAgent } = await import("./services/newsroom-validator");
      const limit = parseInt(req.body.limit) || 20;
      const result = await signalValidationAgent.validatePendingItems(limit);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to validate items" });
    }
  });

  // Admin: Get all sources
  app.get("/api/newsroom/sources", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsSources } = await import("@shared/schema");
      const { db } = await import("./db");
      const { desc } = await import("drizzle-orm");
      
      const sources = await db.select().from(newsSources).orderBy(desc(newsSources.createdAt));
      res.json(sources);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sources" });
    }
  });

  // Admin: Get generation logs
  app.get("/api/newsroom/logs", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsGenerationLogs } = await import("@shared/schema");
      const { db } = await import("./db");
      const { desc } = await import("drizzle-orm");
      
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await db.select()
        .from(newsGenerationLogs)
        .orderBy(desc(newsGenerationLogs.createdAt))
        .limit(limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch logs" });
    }
  });

  // Admin: Toggle source enabled state
  app.patch("/api/newsroom/sources/:id/toggle", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsSources } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const { id } = req.params;
      const { isEnabled } = req.body;
      
      await db.update(newsSources)
        .set({ isEnabled: isEnabled, updatedAt: new Date() })
        .where(eq(newsSources.id, id));
      
      res.json({ success: true, id, isEnabled });
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle source" });
    }
  });

  // Admin: Get all regions
  app.get("/api/newsroom/regions", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsRegions } = await import("@shared/schema");
      const { db } = await import("./db");
      
      const regions = await db.select().from(newsRegions);
      res.json(regions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch regions" });
    }
  });

  // Admin: Initialize default regions
  app.post("/api/newsroom/regions/init", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsRegions } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const defaultRegions = [
        { code: "NA", name: "North America", coordinates: { lat: 40, lng: -100 }, countries: ["US", "CA", "MX"] },
        { code: "EU", name: "Europe", coordinates: { lat: 50, lng: 10 }, countries: ["GB", "DE", "FR", "NL", "CH", "IT", "ES"] },
        { code: "MENA", name: "Middle East & North Africa", coordinates: { lat: 25, lng: 45 }, countries: ["AE", "SA", "IL", "EG", "QA"] },
        { code: "APAC", name: "Asia Pacific", coordinates: { lat: 35, lng: 120 }, countries: ["CN", "JP", "SG", "HK", "AU", "IN", "KR"] },
        { code: "LATAM", name: "Latin America", coordinates: { lat: -15, lng: -60 }, countries: ["BR", "AR", "CL", "CO", "MX"] },
        { code: "AF", name: "Africa", coordinates: { lat: 0, lng: 20 }, countries: ["ZA", "NG", "KE", "EG", "MA"] },
      ];
      
      let count = 0;
      for (const region of defaultRegions) {
        const existing = await db.select().from(newsRegions).where(eq(newsRegions.code, region.code)).limit(1);
        if (existing.length === 0) {
          await db.insert(newsRegions).values({
            code: region.code,
            name: region.name,
            coordinates: region.coordinates,
            countries: region.countries,
            isEnabled: true,
          });
          count++;
        }
      }
      
      res.json({ initialized: count });
    } catch (error) {
      res.status(500).json({ message: "Failed to initialize regions" });
    }
  });

  // Admin: Toggle region enabled state
  app.patch("/api/newsroom/regions/:id/toggle", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsRegions } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const { id } = req.params;
      const { isEnabled } = req.body;
      
      await db.update(newsRegions)
        .set({ isEnabled: isEnabled, updatedAt: new Date() })
        .where(eq(newsRegions.id, id));
      
      res.json({ success: true, id, isEnabled });
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle region" });
    }
  });

  // Admin: Seed initial newsroom content
  app.post("/api/newsroom/seed", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsArticles } = await import("@shared/schema");
      const { db } = await import("./db");
      
      const seedArticles = [
        {
          slug: "ai-driven-due-diligence-transforming-vc-dealflow",
          headline: "AI-Driven Due Diligence: Transforming Venture Capital Deal Flow",
          executiveSummary: "Artificial intelligence is revolutionizing how venture capital firms evaluate investment opportunities, enabling faster, more comprehensive due diligence processes that surface risks and opportunities previously hidden in complex data sets.",
          content: `The venture capital industry is witnessing a fundamental transformation in how investment decisions are made. Artificial intelligence and machine learning technologies are increasingly being deployed to enhance the due diligence process, offering investors unprecedented insights into potential portfolio companies.

Traditional due diligence has long relied on manual review of financial statements, market research, and reference calls. While these methods remain valuable, they are time-consuming and often limited in scope. AI-powered tools can now analyze thousands of data points simultaneously, identifying patterns and correlations that human analysts might miss.

Leading VC firms are implementing AI systems that can evaluate startup metrics in real-time, compare them against industry benchmarks, and flag potential concerns before significant capital is deployed. These systems examine everything from cap table structures and intellectual property portfolios to employee sentiment and competitive positioning.

The impact on deal velocity has been substantial. Firms report that AI-assisted due diligence can reduce initial screening time by up to 60 percent, allowing investment teams to evaluate a larger pipeline while maintaining rigorous standards. This efficiency gain is particularly valuable in competitive markets where speed to term sheet can determine deal success.

However, the integration of AI into investment processes raises important considerations. Questions about algorithmic bias, data privacy, and the appropriate balance between quantitative analysis and human judgment remain active areas of discussion within the industry.

Forward-thinking investors are developing hybrid approaches that leverage AI for data processing and pattern recognition while preserving human expertise for relationship assessment and strategic vision evaluation. This combination appears to offer the best of both worlds: efficiency and insight without sacrificing the nuanced understanding that experienced investors bring to complex decisions.

As these technologies mature, the venture capital landscape will likely see further evolution in how deals are sourced, evaluated, and executed. Firms that successfully integrate AI into their workflows may gain significant competitive advantages in identifying and securing high-potential investments.`,
          blogType: "Insights",
          author: "Anker Intelligence",
          capitalType: "VC",
          capitalStage: "Series A-B",
          geography: "Global",
          tags: ["AI", "Due Diligence", "Venture Capital", "Technology"],
          sources: [
            { title: "The Future of VC Due Diligence", url: "https://www.ft.com/venture-capital", publisher: "Financial Times", date: "2024-12-15", citation: "Financial Times. (2024). The Future of VC Due Diligence." },
            { title: "AI in Investment Decision Making", url: "https://www.reuters.com/technology", publisher: "Reuters", date: "2024-12-10", citation: "Reuters. (2024). AI in Investment Decision Making." }
          ],
          confidenceScore: 0.92,
          status: "published",
          publishedAt: new Date(),
          wordCount: 410,
        },
        {
          slug: "sustainable-investing-esg-criteria-reshaping-pe-portfolios",
          headline: "Sustainable Investing: How ESG Criteria Are Reshaping Private Equity Portfolios",
          executiveSummary: "Environmental, social, and governance considerations have moved from optional to essential in private equity investment strategies, with LPs increasingly demanding demonstrable ESG integration across portfolio companies.",
          content: `The private equity industry is experiencing a profound shift in how investment value is defined and measured. Environmental, social, and governance criteria have transitioned from peripheral considerations to core components of investment thesis development and portfolio management.

Limited partners are driving much of this transformation. Institutional investors, from pension funds to sovereign wealth funds, increasingly require GPs to demonstrate rigorous ESG integration throughout the investment lifecycle. This expectation extends beyond mere policy statements to quantifiable metrics and transparent reporting.

The financial rationale for ESG integration is strengthening. Research consistently demonstrates that companies with strong ESG practices tend to exhibit lower volatility, reduced regulatory risk, and stronger long-term value creation. For private equity firms, this translates to more resilient portfolio companies and enhanced exit valuations.

Operationally, ESG integration presents both challenges and opportunities. Firms are developing specialized capabilities in sustainability assessment, hiring dedicated ESG professionals, and building frameworks for consistent evaluation across diverse portfolio holdings. The most sophisticated approaches link ESG performance to management incentives and operational improvement plans.

Climate considerations are receiving particular attention. Many PE firms have committed to net-zero targets and are actively working to measure and reduce carbon footprints across their portfolios. This effort extends beyond direct emissions to encompass supply chain impacts and product lifecycle considerations.

Social factors are equally prominent, with increased focus on workforce development, diversity and inclusion initiatives, and community impact. Governance improvements, including board composition and compensation alignment, remain foundational elements of value creation strategies.

The regulatory environment is accelerating these trends. The EU's Sustainable Finance Disclosure Regulation and similar frameworks globally are establishing minimum standards for ESG disclosure, creating compliance requirements that favor early adopters.

As ESG integration matures, private equity is demonstrating that financial returns and sustainable practices are not mutually exclusive. The industry's capacity for active ownership and operational engagement positions it uniquely to drive meaningful improvements while generating attractive returns for investors.`,
          blogType: "Trends",
          author: "Anker Intelligence",
          capitalType: "PE",
          capitalStage: "Growth",
          geography: "Europe",
          tags: ["ESG", "Private Equity", "Sustainability", "Impact Investing"],
          sources: [
            { title: "ESG in Private Equity 2024", url: "https://www.bloomberg.com/esg", publisher: "Bloomberg", date: "2024-12-12", citation: "Bloomberg. (2024). ESG in Private Equity 2024." },
            { title: "Sustainable Investment Trends", url: "https://www.wsj.com/markets", publisher: "Wall Street Journal", date: "2024-12-08", citation: "Wall Street Journal. (2024). Sustainable Investment Trends." }
          ],
          confidenceScore: 0.89,
          status: "published",
          publishedAt: new Date(Date.now() - 3600000),
          wordCount: 420,
        },
        {
          slug: "navigating-founder-dilution-strategic-capital-raising-guide",
          headline: "Navigating Founder Dilution: A Strategic Guide to Capital Raising",
          executiveSummary: "Understanding dilution mechanics and cap table optimization is essential for founders seeking to build substantial companies while preserving meaningful ownership stakes through multiple funding rounds.",
          content: `For founders navigating the venture capital ecosystem, understanding and managing dilution is among the most critical financial competencies required for long-term success. Strategic capital raising decisions made early in a company's lifecycle can have profound implications for founder wealth and control as the business scales.

Dilution occurs when new shares are issued, reducing existing shareholders' percentage ownership. While some dilution is inherent to raising capital, the magnitude and terms of dilution can vary dramatically based on negotiation outcomes and structural decisions.

The first principle of intelligent capital management is raising the right amount at the right time. Overraising leads to unnecessary dilution and can create misaligned incentives around growth and profitability. Underraising introduces execution risk and may force unfavorable follow-on terms. Skilled founders develop nuanced judgment about capital needs and market timing.

Valuation is only one factor in dilution analysis. Anti-dilution provisions, liquidation preferences, and participation rights can significantly impact founder economics even when headline valuations appear favorable. Understanding these terms and their downstream implications is essential for effective negotiation.

Option pool placement is another critical consideration. Investors often require option pool expansion as a condition of investment, with the pool carved from the pre-money valuation. This practice, sometimes called the option pool shuffle, effectively reduces the true pre-money valuation and increases founder dilution beyond what headline numbers suggest.

Cap table management extends beyond individual rounds. Founders should model scenarios across multiple funding rounds, considering both optimistic and challenging outcomes. This analysis helps identify strategies that preserve meaningful ownership while supporting necessary capital access.

Alternative financing structures can complement equity raises. Revenue-based financing, venture debt, and strategic partnerships may provide capital while limiting dilution. The appropriateness of these instruments depends on business model characteristics and growth trajectory.

Communication with existing investors matters. Proactive engagement about capital needs and strategic direction builds trust and often leads to better terms in subsequent rounds. Strong investor relationships can also facilitate introductions to quality follow-on investors.

Ultimately, the goal is not to minimize dilution at all costs, but to optimize the trade-off between dilution and company-building resources. Well-capitalized companies with aligned shareholder bases generally outperform those that are underfunded or burdened by adversarial cap table dynamics.`,
          blogType: "Guides",
          author: "Anker Intelligence",
          capitalType: "VC",
          capitalStage: "Seed to Series B",
          geography: "Global",
          tags: ["Fundraising", "Dilution", "Cap Table", "Founders", "Term Sheets"],
          sources: [
            { title: "Founder's Guide to Fundraising", url: "https://techcrunch.com/startups", publisher: "TechCrunch", date: "2024-12-14", citation: "TechCrunch. (2024). Founder's Guide to Fundraising." },
            { title: "Understanding Venture Terms", url: "https://fortune.com/venture", publisher: "Fortune", date: "2024-12-11", citation: "Fortune. (2024). Understanding Venture Terms." }
          ],
          confidenceScore: 0.94,
          status: "published",
          publishedAt: new Date(Date.now() - 7200000),
          wordCount: 450,
        },
        {
          slug: "q4-2024-venture-market-analysis-recovery-signals",
          headline: "Q4 2024 Venture Market Analysis: Early Recovery Signals Emerge",
          executiveSummary: "After two years of market correction, Q4 2024 venture data suggests stabilization in valuations and deal activity, with select sectors showing renewed investor appetite and improving exit conditions.",
          content: `The venture capital market is displaying encouraging signs of normalization as 2024 draws to a close. After a prolonged correction that saw valuations compress and deal activity decline significantly from 2021 peaks, recent data suggests the market may be finding its footing.

Q4 2024 deal volume shows modest improvement over the prior quarter, though activity remains below the frenzied levels of 2021. More significantly, the quality of deals appears to be improving, with investors expressing greater conviction in companies demonstrating clear paths to profitability and sustainable growth.

Valuation dynamics have evolved considerably. The era of growth-at-all-costs valuations has given way to more disciplined pricing, with multiples now more closely aligned with historical norms. This recalibration, while painful for some portfolio companies, establishes a healthier foundation for future investment.

Sector performance continues to diverge. Artificial intelligence and climate technology have attracted disproportionate investor interest, with AI-related deals commanding premium valuations despite broader market caution. Enterprise software remains active, particularly for companies with proven customer retention and efficient growth profiles.

The exit environment shows tentative improvement. Several notable IPOs have performed well post-listing, potentially reopening a pathway that had been largely closed for two years. Strategic M&A activity has picked up as acquirers seek growth through acquisition and smaller companies face pressure to consolidate.

Dry powder levels remain substantial, providing capacity for increased deployment as market confidence returns. Many investors positioned defensively during the correction are now actively seeking new opportunities, though selectivity remains high.

International markets present mixed pictures. European venture activity has proved resilient, supported by a maturing ecosystem of local investors. Asian markets have faced headwinds from regulatory concerns and geopolitical tensions, though fundamentals remain strong in many segments.

LP sentiment toward venture as an asset class remains generally positive, though expectations have been recalibrated. Investors increasingly differentiate between managers with genuine track records of value creation and those whose performance was primarily market-driven.

Looking ahead, the venture market appears positioned for measured recovery rather than rapid rebound. The structural changes implemented during the correction period, including greater focus on capital efficiency and realistic timelines to exit, may ultimately strengthen the industry's long-term health.`,
          blogType: "Analysis",
          author: "Anker Intelligence",
          capitalType: "VC",
          capitalStage: "All Stages",
          geography: "Global",
          tags: ["Market Analysis", "Q4 2024", "Venture Capital", "IPO", "Valuations"],
          sources: [
            { title: "Q4 Venture Capital Report", url: "https://www.reuters.com/markets", publisher: "Reuters", date: "2024-12-16", citation: "Reuters. (2024). Q4 Venture Capital Report." },
            { title: "2024 VC Market Review", url: "https://www.ft.com/venture-capital", publisher: "Financial Times", date: "2024-12-15", citation: "Financial Times. (2024). 2024 VC Market Review." }
          ],
          confidenceScore: 0.91,
          status: "published",
          publishedAt: new Date(Date.now() - 10800000),
          wordCount: 435,
        },
        {
          slug: "deep-tech-investment-thesis-quantum-computing-biotech",
          headline: "Deep Tech Investment Thesis: Opportunities in Quantum Computing and Biotech",
          executiveSummary: "Deep technology investments require specialized due diligence approaches but offer potential for outsized returns as breakthrough technologies mature toward commercial viability.",
          content: `Deep technology investing represents one of the most intellectually demanding and potentially rewarding areas of venture capital. Unlike software businesses that can scale rapidly with minimal capital, deep tech ventures typically require substantial R&D investment and longer development timelines before reaching commercial viability.

The quantum computing sector exemplifies both the challenges and opportunities in deep tech investing. Recent breakthroughs in qubit stability and error correction have accelerated timelines for practical quantum advantage, attracting significant venture interest. Leading companies have secured substantial funding rounds as they race toward commercially relevant systems.

The investment thesis in quantum computing centers on transformative potential across multiple industries. Cryptography, drug discovery, financial modeling, and logistics optimization represent early use cases where quantum advantage could generate substantial value. The question for investors is timing: when will these capabilities translate to revenue?

Biotech and life sciences continue to attract deep tech capital, particularly in areas leveraging AI for drug discovery and development. The convergence of computational biology, machine learning, and traditional pharmaceutical research is yielding promising pipeline candidates at accelerated timelines.

Successful deep tech investing requires specialized expertise. Technical due diligence must assess not only current capabilities but development trajectory and competitive positioning. Patent landscapes, academic talent access, and regulatory pathways all factor into investment decisions.

Capital requirements differ markedly from software investing. Deep tech companies often need multiple rounds of substantial funding before generating meaningful revenue, requiring investors with patient capital and high risk tolerance. Syndication with strategically aligned co-investors can help manage this exposure.

The team composition in deep tech ventures typically emphasizes scientific and technical credentials more heavily than in other startup categories. Investors must evaluate both technical vision and commercial acumen, often seeking founding teams that combine deep domain expertise with business development capabilities.

Exit dynamics in deep tech also diverge from conventional patterns. Strategic acquisitions by large technology companies often provide the most attractive exit pathway, as these acquirers can provide resources for continued development and routes to market that would challenge independent companies.

Despite the challenges, deep tech investing offers portfolio diversification benefits and exposure to potentially transformative technologies. For investors with appropriate expertise and risk tolerance, this category presents compelling opportunities.`,
          blogType: "Insights",
          author: "Anker Intelligence",
          capitalType: "VC",
          capitalStage: "Seed to Series B",
          geography: "North America",
          tags: ["Deep Tech", "Quantum Computing", "Biotech", "Innovation", "R&D"],
          sources: [
            { title: "Deep Tech VC Landscape", url: "https://techcrunch.com/deep-tech", publisher: "TechCrunch", date: "2024-12-13", citation: "TechCrunch. (2024). Deep Tech VC Landscape." },
            { title: "Quantum Computing Investment Trends", url: "https://www.bloomberg.com/tech", publisher: "Bloomberg", date: "2024-12-10", citation: "Bloomberg. (2024). Quantum Computing Investment Trends." }
          ],
          confidenceScore: 0.88,
          status: "published",
          publishedAt: new Date(Date.now() - 14400000),
          wordCount: 445,
        },
        {
          slug: "sec-regulatory-update-fund-marketing-rule-implications",
          headline: "SEC Regulatory Update: New Fund Marketing Rule Implications for GPs",
          executiveSummary: "Recent SEC enforcement actions and guidance clarify expectations for fund marketing materials, requiring GPs to update practices around performance presentation and investor communications.",
          content: `The Securities and Exchange Commission has intensified its focus on private fund marketing practices, issuing new guidance and enforcement actions that have significant implications for general partners across the venture capital and private equity landscape.

The Marketing Rule, which became effective in late 2022, established comprehensive requirements for advertisement content and performance presentation. Recent enforcement actions indicate the SEC is actively monitoring compliance and willing to pursue violations, even among smaller fund managers.

Performance presentation requirements have received particular scrutiny. The rule mandates that advertisements presenting gross performance must also provide net performance with equal prominence. Hypothetical performance, when used, requires enhanced disclosures about assumptions and limitations.

Testimonials and endorsements, now permitted under the new framework, come with significant compliance obligations. Required disclosures must accompany any third-party endorsements, and compensation arrangements must be clearly disclosed. Investor testimonials require careful review to ensure they present balanced perspectives.

Third-party ratings present unique challenges. Funds using ratings in marketing materials must disclose the date of the rating, rating methodology transparency, and any compensation provided to the rating organization. Selective use of ratings that present favorable perspectives while omitting unfavorable ones violates fair and balanced presentation requirements.

The SEC has also clarified expectations around predecessor performance. Managers presenting track records from prior firms must ensure appropriate disclosure about the nature of those historical relationships and the degree to which past performance reflects their individual contributions versus team or firm resources.

Social media presents emerging compliance considerations. The informal nature of these platforms does not exempt content from marketing rule requirements. Posts that could be viewed as advertisements require the same compliance oversight applied to traditional marketing materials.

Compliance infrastructure expectations have increased accordingly. The rule requires reasonable policies and procedures to prevent violations, including review and approval processes for marketing materials. Documentation of compliance efforts has become essential for demonstrating good faith efforts to meet regulatory requirements.

For general partners, these developments require proactive review of existing marketing practices and ongoing attention to evolving regulatory expectations. Investment in compliance capabilities, while representing additional cost, provides protection against enforcement risk and supports institutional credibility with sophisticated limited partners.`,
          blogType: "Analysis",
          author: "Anker Intelligence",
          capitalType: "VC",
          capitalStage: "All Stages",
          geography: "North America",
          tags: ["SEC", "Regulation", "Compliance", "Marketing Rule", "Fund Management"],
          sources: [
            { title: "SEC Marketing Rule Enforcement", url: "https://www.sec.gov/news", publisher: "SEC", date: "2024-12-14", citation: "SEC. (2024). Marketing Rule Enforcement Actions." },
            { title: "Fund Compliance Requirements", url: "https://www.wsj.com/regulation", publisher: "Wall Street Journal", date: "2024-12-12", citation: "Wall Street Journal. (2024). Fund Compliance Requirements." }
          ],
          confidenceScore: 0.93,
          status: "published",
          publishedAt: new Date(Date.now() - 18000000),
          wordCount: 430,
        },
        {
          slug: "building-investor-relationships-founder-networking-strategies",
          headline: "Building Investor Relationships: Networking Strategies for Founders",
          executiveSummary: "Successful fundraising often depends on relationships cultivated well before active capital raising begins. Strategic networking can significantly improve founder access to quality investors and favorable terms.",
          content: `The most successful fundraises rarely begin with a cold pitch. Instead, they culminate relationships that founders have systematically cultivated over months or years. Understanding how to build these relationships efficiently represents a core competency for entrepreneurial leaders.

Warm introductions remain the primary pathway to serious investor conversations. Studies consistently show that investor response rates to referred opportunities significantly exceed cold outreach. Building a network capable of generating quality introductions should be an ongoing priority rather than a fundraising-triggered activity.

Strategic relationship building begins with identifying target investors before capital is needed. Research into investor portfolios, investment theses, and partner backgrounds provides essential context for meaningful engagement. Understanding what specific investors care about allows founders to contribute value before requesting anything in return.

Thoughtful information sharing builds credibility and maintains visibility. Regular but not excessive updates to potential investors, particularly those documenting meaningful progress, keep founders top of mind. These updates should be concise and focused on metrics and milestones rather than narratives without substance.

Industry events and conferences provide efficient networking opportunities when approached strategically. Quality of interactions matters more than quantity. Brief, memorable conversations that establish common ground create stronger foundations than superficial exchanges with many contacts.

Content creation and thought leadership can amplify founder visibility. Writing about industry insights, participating in podcasts, or speaking at events positions founders as knowledgeable operators and can attract inbound investor interest. This approach is particularly valuable for domain experts whose specialized knowledge represents genuine differentiation.

Peer networks deserve attention alongside investor relationships. Fellow founders often provide the most valuable investor introductions, having recently navigated similar processes with current market context. Investing time in founder communities typically yields strong returns in the form of referrals and tactical advice.

Timing of relationship development matters significantly. Investors appreciate founders who engage thoughtfully well before fundraising begins. Reaching out only when capital is urgently needed signals poor planning and reduces leverage in negotiations.

Professional networking should be authentic rather than transactional. Investors develop pattern recognition for founders who approach relationships purely as means to ends. Genuine interest in exchange of ideas and mutual value creation forms the basis of productive long-term relationships.

Maintaining relationships post-investment is equally important. Today's investor is tomorrow's reference check. Building reputation as a reliable, communicative founder enhances access to capital throughout an entrepreneurial career.`,
          blogType: "Guides",
          author: "Anker Intelligence",
          capitalType: "VC",
          capitalStage: "Pre-seed to Series A",
          geography: "Global",
          tags: ["Networking", "Fundraising", "Founders", "Investor Relations", "Strategy"],
          sources: [
            { title: "Founder Networking Best Practices", url: "https://techcrunch.com/founder-advice", publisher: "TechCrunch", date: "2024-12-11", citation: "TechCrunch. (2024). Founder Networking Best Practices." },
            { title: "Building VC Relationships", url: "https://fortune.com/entrepreneurs", publisher: "Fortune", date: "2024-12-09", citation: "Fortune. (2024). Building VC Relationships." }
          ],
          confidenceScore: 0.90,
          status: "published",
          publishedAt: new Date(Date.now() - 21600000),
          wordCount: 455,
        },
        {
          slug: "middle-east-venture-ecosystem-growth-2024",
          headline: "Middle East Venture Ecosystem: Record Growth Amid Global Uncertainty",
          executiveSummary: "The MENA venture capital ecosystem has demonstrated remarkable resilience, with record fund sizes and increasing international investor participation despite challenging global market conditions.",
          content: `The Middle East and North Africa venture capital ecosystem has emerged as one of the most dynamic growth stories in global venture capital. While many markets experienced significant contraction in 2023 and 2024, MENA venture activity has maintained positive momentum, attracting increasing international attention.

Several structural factors underpin this growth trajectory. Young, entrepreneurial populations with high technology adoption rates create substantial addressable markets for innovative companies. Government initiatives across the Gulf Cooperation Council have established supportive regulatory environments and deployed significant capital to catalyze ecosystem development.

Saudi Arabia has emerged as a particularly significant market. Vision 2030 initiatives have created unprecedented opportunities for technology companies serving domestic transformation priorities. International venture firms have established local presence, and sovereign wealth fund deployment into venture has increased substantially.

The United Arab Emirates continues to mature as a regional hub, with Dubai and Abu Dhabi competing to attract talent and capital. Regulatory innovations including virtual asset frameworks and golden visa programs have enhanced the region's appeal to globally mobile entrepreneurs and investors.

Egypt and other North African markets present distinct opportunities. Large populations and developing digital infrastructure create substantial growth potential, though capital availability and currency considerations require careful navigation.

Corporate venture capital has become increasingly prominent in the region. Family office allocations to venture have grown substantially, often providing patient capital and strategic market access that complement institutional funding. Major regional corporates have launched dedicated investment vehicles targeting technology transformation.

Exit pathways remain an area of ongoing development. While strategic acquisitions have provided meaningful liquidity for some investments, public market exits have been limited. Stock exchange initiatives to attract technology company listings may improve this dynamic over time.

International investors are increasingly recognizing MENA opportunities. Global venture firms have raised dedicated regional funds, and cross-border investment flows have increased substantially. This international participation brings capital, expertise, and global network access that accelerates ecosystem maturation.

Challenges persist alongside opportunities. Talent development, while improving, remains a constraint. Regulatory harmonization across diverse regional markets complicates scaling. Currency and macroeconomic factors require careful consideration in underwriting.

For globally minded investors, MENA represents an increasingly attractive opportunity set. The combination of structural growth drivers, government support, and improving ecosystem infrastructure positions the region for continued development.`,
          blogType: "Trends",
          author: "Anker Intelligence",
          capitalType: "VC",
          capitalStage: "All Stages",
          geography: "MENA",
          tags: ["MENA", "Middle East", "Emerging Markets", "Regional Growth", "Saudi Arabia", "UAE"],
          sources: [
            { title: "MENA Venture Report 2024", url: "https://www.reuters.com/mena", publisher: "Reuters", date: "2024-12-15", citation: "Reuters. (2024). MENA Venture Report 2024." },
            { title: "Gulf Investment Trends", url: "https://www.ft.com/mena", publisher: "Financial Times", date: "2024-12-13", citation: "Financial Times. (2024). Gulf Investment Trends." }
          ],
          confidenceScore: 0.87,
          status: "published",
          publishedAt: new Date(Date.now() - 25200000),
          wordCount: 440,
        },
      ];
      
      let count = 0;
      for (const article of seedArticles) {
        const existing = await db.select().from(newsArticles).where(eq(newsArticles.slug, article.slug)).limit(1);
        if (existing.length === 0) {
          await db.insert(newsArticles).values(article);
          count++;
        }
      }
      
      res.json({ seeded: count, total: seedArticles.length });
    } catch (error) {
      console.error("[Seed] Error seeding articles:", error);
      res.status(500).json({ message: "Failed to seed articles" });
    }
  });

  // ============================================
  // AI INTERVIEW ASSISTANT ROUTES
  // ============================================
  const { interviewAIService } = await import("./services/interview-ai");

  app.get("/api/interviews", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const interviews = await interviewAIService.getUserInterviews(req.user.id);
      res.json(interviews);
    } catch (error) {
      console.error("[Interview] Error fetching interviews:", error);
      res.status(500).json({ message: "Failed to fetch interviews" });
    }
  });

  app.get("/api/interviews/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const interview = await interviewAIService.getInterview(req.params.id);
      if (!interview) return res.status(404).json({ message: "Interview not found" });
      if (interview.founderId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      res.json(interview);
    } catch (error) {
      console.error("[Interview] Error fetching interview:", error);
      res.status(500).json({ message: "Failed to fetch interview" });
    }
  });

  app.get("/api/interviews/:id/messages", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const interview = await interviewAIService.getInterview(req.params.id);
      if (!interview) return res.status(404).json({ message: "Interview not found" });
      if (interview.founderId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      const messages = await interviewAIService.getInterviewMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("[Interview] Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.get("/api/interviews/:id/score", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const interview = await interviewAIService.getInterview(req.params.id);
      if (!interview) return res.status(404).json({ message: "Interview not found" });
      if (interview.founderId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      const score = await interviewAIService.getInterviewScore(req.params.id);
      res.json(score);
    } catch (error) {
      console.error("[Interview] Error fetching score:", error);
      res.status(500).json({ message: "Failed to fetch score" });
    }
  });

  app.get("/api/interviews/:id/feedback", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const interview = await interviewAIService.getInterview(req.params.id);
      if (!interview) return res.status(404).json({ message: "Interview not found" });
      if (interview.founderId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      const feedback = await interviewAIService.getInterviewFeedback(req.params.id);
      res.json(feedback);
    } catch (error) {
      console.error("[Interview] Error fetching feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  app.post("/api/interviews", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { pitchDeckContent, ...otherData } = req.body;
      let deckAnalysis = null;
      
      if (pitchDeckContent && typeof pitchDeckContent === "string" && pitchDeckContent.length > 100) {
        try {
          deckAnalysis = await interviewAIService.analyzeDeck(pitchDeckContent);
          console.log("[Interview] Pitch deck analyzed successfully");
        } catch (deckError) {
          console.error("[Interview] Error analyzing deck:", deckError);
        }
      }
      
      const interview = await interviewAIService.createInterview({
        founderId: req.user.id,
        ...otherData,
        deckAnalysis,
      });
      res.json(interview);
    } catch (error) {
      console.error("[Interview] Error creating interview:", error);
      res.status(500).json({ message: "Failed to create interview" });
    }
  });

  app.post("/api/interviews/:id/start", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const interview = await interviewAIService.getInterview(req.params.id);
      if (!interview) return res.status(404).json({ message: "Interview not found" });
      if (interview.founderId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      
      const result = await interviewAIService.startInterview(req.params.id);
      res.json(result);
    } catch (error) {
      console.error("[Interview] Error starting interview:", error);
      res.status(500).json({ message: "Failed to start interview" });
    }
  });

  app.post("/api/interviews/:id/respond", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const interview = await interviewAIService.getInterview(req.params.id);
      if (!interview) return res.status(404).json({ message: "Interview not found" });
      if (interview.founderId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      
      const { response } = req.body;
      if (!response) return res.status(400).json({ message: "Response is required" });
      
      const result = await interviewAIService.submitResponse(req.params.id, response);
      res.json(result);
    } catch (error) {
      console.error("[Interview] Error submitting response:", error);
      res.status(500).json({ message: "Failed to submit response" });
    }
  });

  app.post("/api/interviews/:id/complete", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const interview = await interviewAIService.getInterview(req.params.id);
      if (!interview) return res.status(404).json({ message: "Interview not found" });
      if (interview.founderId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      
      const result = await interviewAIService.completeInterview(req.params.id);
      res.json(result);
    } catch (error) {
      console.error("[Interview] Error completing interview:", error);
      res.status(500).json({ message: "Failed to complete interview" });
    }
  });

  app.post("/api/interviews/analyze-deck", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { deckContent } = req.body;
      if (!deckContent) return res.status(400).json({ message: "Deck content is required" });
      
      const analysis = await interviewAIService.analyzeDeck(deckContent);
      res.json(analysis);
    } catch (error) {
      console.error("[Interview] Error analyzing deck:", error);
      res.status(500).json({ message: "Failed to analyze deck" });
    }
  });

  app.post("/api/interviews/extract-company-details", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { deckContent } = req.body;
      if (!deckContent) return res.status(400).json({ message: "Deck content is required" });
      
      const details = await interviewAIService.extractCompanyDetails(deckContent);
      res.json(details);
    } catch (error) {
      console.error("[Interview] Error extracting company details:", error);
      res.status(500).json({ message: "Failed to extract company details" });
    }
  });

  // Chatbot routes
  app.post("/api/chatbot/chat", async (req, res) => {
    try {
      const { message, conversationHistory } = req.body;
      if (!message) return res.status(400).json({ message: "Message is required" });
      
      const { chat } = await import("./services/chatbot");
      const result = await chat(message, conversationHistory || []);
      res.json(result);
    } catch (error) {
      console.error("[Chatbot] Error:", error);
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  app.get("/api/chatbot/quick-answers", async (_req, res) => {
    try {
      const { getQuickAnswers } = await import("./services/chatbot");
      res.json(getQuickAnswers());
    } catch (error) {
      console.error("[Chatbot] Error getting quick answers:", error);
      res.status(500).json({ message: "Failed to get quick answers" });
    }
  });

  // Profile enrichment routes
  app.post("/api/profile/enrich-startup/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { enrichStartupProfile } = await import("./services/profile-enrichment");
      const result = await enrichStartupProfile(req.params.id);
      res.json(result);
    } catch (error) {
      console.error("[Profile] Error enriching startup:", error);
      res.status(500).json({ message: "Failed to enrich startup profile" });
    }
  });

  app.post("/api/profile/extract-from-deck", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { deckText } = req.body;
      if (!deckText) return res.status(400).json({ message: "Deck text is required" });
      
      const { extractFounderProfileFromPitchDeck } = await import("./services/profile-enrichment");
      const result = await extractFounderProfileFromPitchDeck(deckText);
      res.json(result);
    } catch (error) {
      console.error("[Profile] Error extracting from deck:", error);
      res.status(500).json({ message: "Failed to extract founder profiles" });
    }
  });

  return httpServer;
}
