import type { Express } from "express";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth } from "./replit_integrations/auth";
import { registerAdminRoutes } from "./admin-routes";
import { registerSimpleAuthRoutes, setupSimpleAuthSession } from "./simple-auth";
import { registerOnboardingRoutes } from "./onboarding-routes";
import teamRoutes from "./team-routes";
import { institutionalRouter } from "./institutional-routes";
import { wsNotificationService } from "./services/websocket";
import session from "express-session";
import connectPg from "connect-pg-simple";
import cookieParser from "cookie-parser";
import { db } from "./db";
import { users, investors, investmentFirms, insertCalendarMeetingSchema, insertUserEmailSettingsSchema, matchSessions, matches as matchesRows } from "@shared/schema";
import { eq, sql, or, and, isNull, desc, inArray } from "drizzle-orm";
import { setupSecurityMiddleware, csrfProtection, outreachRateLimiter } from "./middleware/security";
import { registerObjectStorageRoutes, ObjectStorageService } from "./replit_integrations/object_storage";
import { extractTextFromBuffer, isSupportedDocumentType, getMimeTypeFromFilename } from "./services/documentExtractor";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getResendClient } from "./services/resend";

// E-T2: Helper to get descriptions for personalization variables
function getVariableDescription(variable: string): string {
  const descriptions: Record<string, string> = {
    name: "Full name of the recipient",
    firstName: "First name of the recipient",
    lastName: "Last name of the recipient",
    company: "Company name of the recipient",
    startupName: "Name of the startup being pitched",
    startupIndustry: "Industry/sector of the startup",
    founderName: "Name of the startup founder",
    investorFirm: "Name of the investor's firm",
    investorTitle: "Job title of the investor",
    investorFirstName: "First name of the investor",
    investorLastName: "Last name of the investor",
    dealTitle: "Title of the current deal",
    targetAmount: "Funding target amount (formatted)",
    stage: "Current funding stage",
    location: "Location/geography",
    meetingLink: "Calendar meeting link",
  };
  return descriptions[variable] || "Custom variable";
}

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
  
  // SECURITY: Setup cookie parser before other middleware that needs cookies
  app.use(cookieParser());
  
  // SECURITY: Setup rate limiting, security headers, and CSRF token generation
  setupSecurityMiddleware(app);
  
  // Setup session management (keeping session infrastructure from Replit auth)
  await setupAuth(app);
  
  // Setup simple auth session middleware to hydrate req.user
  setupSimpleAuthSession(app);
  
  // Register simple email/password auth routes
  // (Auth routes like login/register are excluded from CSRF in the middleware)
  registerSimpleAuthRoutes(app);
  
  // SECURITY: Apply CSRF protection to state-changing API requests
  // Note: Auth routes (login/register/signup) are excluded in the csrfProtection middleware
  // because they don't have a CSRF token yet - they're protected by rate limiting instead
  app.use("/api/", csrfProtection);

  // Register onboarding routes (session-auth protected, CSRF applied via middleware above)
  registerOnboardingRoutes(app);
  
  // Register admin routes (protected by isAdmin middleware and CSRF)
  registerAdminRoutes(app);
  
  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);
  
  // Register team routes (protected by auth and CSRF)
  app.use(teamRoutes);
  
  // Register institutional investor routes (protected by auth and CSRF)
  app.use("/api/institutional", institutionalRouter);

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
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    const search = req.query.search as string | undefined;
    const result = await storage.getStartups(limit, offset, search);
    res.json(result);
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
      
      // Auto-create data room for the startup
      await storage.createDealRoom({
        startupId: startup.id,
        ownerId: req.user.id,
        name: `${startup.name} Data Room`,
        description: `Secure data room for ${startup.name}`,
        status: "active",
        accessLevel: "private",
      });
      
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

      const useStageAware = (req.body as any).useStageAwareAnalysis !== false;
      
      if (useStageAware && startup.stage) {
        const stageResult = await pitchDeckAnalysisService.analyzePitchDeckWithStage(
          pitchContent,
          startup.stage,
          { name: startup.name }
        );
        
        return res.json({
          type: "stage_aware",
          stage: stageResult.stage,
          stageLabel: stageResult.stageLabel,
          overallScore: stageResult.overallScore,
          investmentReadiness: stageResult.investmentReadiness,
          dimensionScores: stageResult.dimensionScores,
          gatingResults: stageResult.gatingResults,
          keyStrengths: stageResult.keyStrengths,
          criticalGaps: stageResult.criticalGaps,
          recommendations: stageResult.recommendations,
          executiveSummary: stageResult.executiveSummary,
          investorAppeal: stageResult.investorAppeal,
          riskFactors: stageResult.riskFactors,
        });
      }
      
      const result = await pitchDeckAnalysisService.analyzePitchDeck(pitchContent, {
        name: startup.name,
      });
      
      res.json({
        type: "standard",
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
      const { type, name, fileName, fileSize, mimeType, content, sourceKind, externalUrl, externalUrlTitle } = req.body;
      
      if (!type || !name) {
        return res.status(400).json({ message: "type and name are required" });
      }
      
      const isLink = sourceKind === "link";
      
      if (isLink) {
        if (!externalUrl) {
          return res.status(400).json({ message: "externalUrl is required for link-type documents" });
        }
        try {
          const url = new URL(externalUrl);
          if (!["https:", "http:"].includes(url.protocol)) {
            return res.status(400).json({ message: "Only HTTP/HTTPS URLs are allowed" });
          }
        } catch {
          return res.status(400).json({ message: "Invalid URL format" });
        }
      } else {
        if (!fileName) {
          return res.status(400).json({ message: "fileName is required for file-type documents" });
        }
      }
      
      const document = await storage.createStartupDocument({
        startupId: req.params.id,
        type,
        name,
        sourceKind: isLink ? "link" : "file",
        fileName: isLink ? null : fileName,
        fileSize: isLink ? null : (fileSize || null),
        mimeType: isLink ? null : (mimeType || null),
        externalUrl: isLink ? externalUrl : null,
        externalUrlTitle: isLink ? (externalUrlTitle || null) : null,
        content: content || null,
        processingStatus: isLink ? "completed" : (content ? "completed" : "pending"),
      });
      
      // Sync link-type documents to the startup's data room if it exists
      // Note: File uploads are not synced because they require object storage keys
      // which are handled separately through the data room's own upload flow
      if (isLink) {
        try {
          const dealRoom = await storage.getDealRoomByStartupId(req.params.id);
          if (dealRoom) {
            // Map startup document type to deal room document type
            const dealRoomDocType = type === "pitch_deck" ? "pitch_deck" : 
                                     type === "financials" ? "financials" : 
                                     type === "cap_table" ? "cap_table" : 
                                     type === "term_sheet" ? "legal" : "other";
            
            await storage.createDealRoomDocument({
              roomId: dealRoom.id,
              uploadedBy: (req.user as any).id,
              name: name,
              type: dealRoomDocType,
              url: externalUrl,
              disclosureLevel: type === "pitch_deck" ? "teaser" : 
                              type === "financials" ? "detailed" : 
                              type === "term_sheet" ? "confirmatory" : "cim",
            });
            console.log(`[Sync] Startup link "${name}" synced to data room ${dealRoom.id}`);
          }
        } catch (syncErr) {
          // Log but don't fail the request if sync fails
          console.error("[Sync] Failed to sync link to data room:", syncErr);
        }
      }
      
      res.status(201).json(document);
    } catch (err) {
      console.error("Error creating document:", err);
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  // Finalize file upload to startup document (with object storage sync to data room)
  const finalizeUploadSchema = z.object({
    type: z.enum(["pitch_deck", "cap_table", "financials", "faq", "data_room", "term_sheet", "additional"]),
    name: z.string().min(1, "Name is required"),
    fileName: z.string().optional(),
    fileSize: z.number().optional(),
    mimeType: z.string().optional(),
    objectPath: z.string().min(1, "Object path is required"),
    content: z.string().optional(),
  });

  app.post("/api/startups/:id/documents/finalize-upload", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const startup = await storage.getStartupById(req.params.id);
      if (!startup) {
        return res.status(404).json({ message: "Startup not found" });
      }
      if (startup.founderId !== (req.user as any).id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      // Validate request body
      const parseResult = finalizeUploadSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const { type, name, fileName, fileSize, mimeType, objectPath, content } = parseResult.data;
      
      // Create the startup document with object storage path
      const document = await storage.createStartupDocument({
        startupId: req.params.id,
        type,
        name,
        sourceKind: "file",
        fileName: fileName || name,
        fileSize: fileSize || null,
        mimeType: mimeType || "application/octet-stream",
        objectPath,
        content: content || null,
        processingStatus: content ? "completed" : "pending",
      });
      
      // Sync file upload to the startup's data room if it exists
      try {
        const dealRoom = await storage.getDealRoomByStartupId(req.params.id);
        if (dealRoom) {
          // Map startup document type to deal room document type
          const dealRoomDocType = type === "pitch_deck" ? "pitch_deck" : 
                                   type === "financials" ? "financials" : 
                                   type === "cap_table" ? "cap_table" : 
                                   type === "term_sheet" ? "legal" : "other";
          
          await storage.createDealRoomDocument({
            roomId: dealRoom.id,
            uploadedBy: (req.user as any).id,
            name: name,
            type: dealRoomDocType,
            objectPath: objectPath,
            size: fileSize || null,
            mimeType: mimeType || "application/octet-stream",
            extractedText: content || null,
            disclosureLevel: type === "pitch_deck" ? "teaser" : 
                            type === "financials" ? "detailed" : 
                            type === "term_sheet" ? "confirmatory" : "cim",
          });
          console.log(`[Sync] Startup file "${name}" synced to data room ${dealRoom.id} with objectPath: ${objectPath}`);
        }
      } catch (syncErr) {
        // Log but don't fail the request if sync fails
        console.error("[Sync] Failed to sync file to data room:", syncErr);
      }
      
      res.status(201).json(document);
    } catch (err) {
      console.error("Error finalizing document upload:", err);
      res.status(500).json({ message: "Failed to finalize document upload" });
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
    overallGrade: z.string().max(10).optional(),
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
    executiveSummary: z.string().max(5000).optional(),
    recommendation: z.string().max(100).optional(),
    recommendationRationale: z.string().max(3000).optional(),
    criticalAssessment: z.string().max(3000).optional(),
    redFlags: z.array(z.string().max(500)).max(20).optional(),
    nextSteps: z.array(z.string().max(500)).max(20).optional(),
    extractedInfo: z.object({
      companyName: z.string().max(200).optional(),
      tagline: z.string().max(500).optional(),
      description: z.string().max(2000).optional(),
      problem: z.string().max(2000).optional(),
      solution: z.string().max(2000).optional(),
      targetMarket: z.string().max(1000).optional(),
      businessModel: z.string().max(1000).optional(),
      traction: z.string().max(1000).optional(),
      team: z.string().max(1000).optional(),
      askAmount: z.string().max(200).optional(),
      useOfFunds: z.string().max(1000).optional(),
      industries: z.array(z.string().max(100)).max(10).optional(),
      stage: z.string().max(100).optional(),
    }).optional(),
    marketOpportunity: z.object({
      tamClaimed: z.string().max(500).optional(),
      tamRealistic: z.string().max(500).optional(),
      samEstimate: z.string().max(500).optional(),
      marketGrowth: z.string().max(500).optional(),
      assessment: z.string().max(2000).optional(),
      redFlags: z.array(z.string().max(500)).max(10).optional(),
      score: z.number().min(0).max(100).optional(),
    }).optional(),
    businessModel: z.object({
      model: z.string().max(1000).optional(),
      pricing: z.string().max(500).optional(),
      margins: z.string().max(500).optional(),
      assessment: z.string().max(2000).optional(),
      score: z.number().min(0).max(100).optional(),
    }).optional(),
    team: z.object({
      founders: z.array(z.object({
        name: z.string().max(200),
        role: z.string().max(200),
        background: z.string().max(1000),
      })).max(10).optional(),
      gaps: z.array(z.string().max(500)).max(10).optional(),
      assessment: z.string().max(2000).optional(),
      score: z.number().min(0).max(100).optional(),
    }).optional(),
    competitive: z.object({
      differentiation: z.string().max(1000).optional(),
      moat: z.string().max(1000).optional(),
      competitors: z.array(z.object({
        name: z.string().max(200),
        advantage: z.string().max(500).optional(),
        disadvantage: z.string().max(500).optional(),
      })).max(10).optional(),
      score: z.number().min(0).max(100).optional(),
    }).optional(),
    financials: z.object({
      currentRevenue: z.string().max(200).optional(),
      burnRate: z.string().max(200).optional(),
      runway: z.string().max(200).optional(),
      askAmount: z.string().max(200).optional(),
      valuation: z.string().max(200).optional(),
      projectionsAssessment: z.string().max(2000).optional(),
      projections: z.object({
        year1: z.number().optional(),
        year2: z.number().optional(),
        year3: z.number().optional(),
        year4: z.number().optional(),
        year5: z.number().optional(),
      }).optional(),
      score: z.number().min(0).max(100).optional(),
    }).optional(),
    detailedRisks: z.array(z.object({
      category: z.string().max(200),
      severity: z.string().max(50),
      description: z.string().max(1000),
    })).max(20).optional(),
    bestPractices: z.array(z.object({
      category: z.string().max(200),
      practices: z.array(z.string().max(500)).max(10),
      status: z.enum(['met', 'partial', 'missing']),
    })).max(20).optional(),
    evaluations: z.array(z.object({
      evaluatorType: z.string().max(50),
      evaluatorName: z.string().max(200),
      overallScore: z.number().min(0).max(100),
      grade: z.string().max(10),
      summary: z.string().max(2000).optional(),
      investmentReadiness: z.string().max(100).optional(),
      strengths: z.array(z.string().max(500)).max(10).optional(),
      weaknesses: z.array(z.string().max(500)).max(10).optional(),
      keyRecommendations: z.array(z.string().max(500)).max(10).optional(),
      sections: z.array(z.object({
        name: z.string().max(200),
        score: z.number().min(0).max(100),
        feedback: z.string().max(2000),
      })).max(20).optional(),
    })).max(5).optional(),
    deckQuality: z.object({
      overallScore: z.number().min(0).max(100).optional(),
      visualDesign: z.number().min(0).max(100).optional(),
      narrative: z.number().min(0).max(100).optional(),
      dataPresentation: z.number().min(0).max(100).optional(),
      strengths: z.array(z.string().max(500)).max(10).optional(),
      weaknesses: z.array(z.string().max(500)).max(10).optional(),
    }).optional(),
  });

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
        overallGrade: analysisData.overallGrade,
        sections: analysisData.sections,
        strengths: analysisData.strengths || [],
        weaknesses: analysisData.weaknesses || [],
        recommendations: analysisData.recommendations || [],
        risks: analysisData.risks || [],
        executiveSummary: analysisData.executiveSummary,
        recommendation: analysisData.recommendation,
        recommendationRationale: analysisData.recommendationRationale,
        criticalAssessment: analysisData.criticalAssessment,
        redFlags: analysisData.redFlags,
        nextSteps: analysisData.nextSteps,
        extractedInfo: analysisData.extractedInfo,
        marketOpportunity: analysisData.marketOpportunity,
        businessModel: analysisData.businessModel,
        team: analysisData.team,
        competitive: analysisData.competitive,
        financials: analysisData.financials,
        detailedRisks: analysisData.detailedRisks,
        bestPractices: analysisData.bestPractices,
        evaluations: analysisData.evaluations,
        deckQuality: analysisData.deckQuality,
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
        overallGrade: analysisData.overallGrade,
        sections: analysisData.sections,
        strengths: analysisData.strengths || [],
        weaknesses: analysisData.weaknesses || [],
        recommendations: analysisData.recommendations || [],
        risks: analysisData.risks || [],
        executiveSummary: analysisData.executiveSummary,
        recommendation: analysisData.recommendation,
        recommendationRationale: analysisData.recommendationRationale,
        criticalAssessment: analysisData.criticalAssessment,
        redFlags: analysisData.redFlags,
        nextSteps: analysisData.nextSteps,
        extractedInfo: analysisData.extractedInfo,
        marketOpportunity: analysisData.marketOpportunity,
        businessModel: analysisData.businessModel,
        team: analysisData.team,
        competitive: analysisData.competitive,
        financials: analysisData.financials,
        detailedRisks: analysisData.detailedRisks,
        bestPractices: analysisData.bestPractices,
        evaluations: analysisData.evaluations,
        deckQuality: analysisData.deckQuality,
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
      const search = req.query.search as string | undefined;
      const stage = req.query.stage as string | undefined;
      const sector = req.query.sector as string | undefined;
      const location = req.query.location as string | undefined;
      const result = await storage.getInvestors(limit, offset, search, stage, sector, location);
      res.json(result);
    } catch (err) {
      console.error("Error fetching investors:", err);
      res.status(500).json({ message: "Failed to fetch investors", error: String(err) });
    }
  });

  // Get stage counts for investors (no pagination, aggregated totals)
  app.get("/api/investors/counts", async (req, res) => {
    try {
      // Get total count
      const [totalResult] = await db.select({ count: sql<number>`count(*)` })
        .from(investors)
        .where(eq(investors.isActive, true));
      
      // Get funding stage counts
      const stageCounts = await db.select({
        stage: investors.fundingStage,
        count: sql<number>`count(*)`,
      })
      .from(investors)
      .where(eq(investors.isActive, true))
      .groupBy(investors.fundingStage);
      
      const result: Record<string, number> = { 
        "All Stages": Number(totalResult?.count || 0)
      };
      
      for (const row of stageCounts) {
        const stage = row.stage?.trim() || null;
        if (stage) {
          result[stage] = (result[stage] || 0) + Number(row.count);
        }
      }
      
      res.json(result);
    } catch (err) {
      console.error("Error fetching investor counts:", err);
      res.status(500).json({ message: "Failed to fetch investor counts" });
    }
  });

  // Get enrichment stats for investors (global counts for Deep Research button)
  app.get("/api/investors/enrichment-stats", async (req, res) => {
    try {
      const statusCounts = await db.select({
        status: investors.enrichmentStatus,
        count: sql<number>`count(*)`,
      })
      .from(investors)
      .where(eq(investors.isActive, true))
      .groupBy(investors.enrichmentStatus);

      const stats = {
        enriched: 0,
        partiallyEnriched: 0,
        failed: 0,
        notEnriched: 0,
        total: 0,
      };

      for (const row of statusCounts) {
        const count = Number(row.count);
        stats.total += count;
        switch (row.status) {
          case "enriched":
            stats.enriched = count;
            break;
          case "partially_enriched":
            stats.partiallyEnriched = count;
            break;
          case "failed":
            stats.failed = count;
            break;
          default:
            stats.notEnriched += count;
        }
      }

      res.json(stats);
    } catch (err) {
      console.error("Error fetching investor enrichment stats:", err);
      res.status(500).json({ message: "Failed to fetch enrichment stats" });
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
      const search = req.query.search as string | undefined;
      const classification = req.query.classification as string | undefined;
      const location = req.query.location as string | undefined;
      const result = await storage.getInvestmentFirms(limit, offset, search, classification, location);
      res.json(result);
    } catch (err) {
      console.error("Error fetching firms:", err);
      res.status(500).json({ message: "Failed to fetch firms", error: String(err) });
    }
  });

  // Get classification counts for firms (no pagination, aggregated totals)
  app.get("/api/firms/counts", async (req, res) => {
    try {
      const counts = await db.select({
        classification: investmentFirms.firmClassification,
        count: sql<number>`count(*)`,
      })
      .from(investmentFirms)
      .groupBy(investmentFirms.firmClassification);
      
      const result: Record<string, number> = { All: 0, Unclassified: 0 };
      for (const row of counts) {
        const classification = row.classification?.trim() || null;
        const count = Number(row.count);
        result.All += count;
        if (!classification) {
          result.Unclassified += count;
        } else {
          result[classification] = (result[classification] || 0) + count;
        }
      }
      res.json(result);
    } catch (err) {
      console.error("Error fetching firm counts:", err);
      res.status(500).json({ message: "Failed to fetch firm counts" });
    }
  });

  // Get enrichment stats for firms (global counts for Deep Research button)
  app.get("/api/firms/enrichment-stats", async (req, res) => {
    try {
      const statusCounts = await db.select({
        status: investmentFirms.enrichmentStatus,
        count: sql<number>`count(*)`,
      })
      .from(investmentFirms)
      .groupBy(investmentFirms.enrichmentStatus);

      // Count firms with missing key data
      const [missingDataResult] = await db.select({ count: sql<number>`count(*)` })
        .from(investmentFirms)
        .where(
          or(
            isNull(investmentFirms.firmClassification),
            eq(investmentFirms.firmClassification, ""),
            isNull(investmentFirms.description),
            eq(investmentFirms.description, ""),
            and(
              or(isNull(investmentFirms.location), eq(investmentFirms.location, "")),
              or(isNull(investmentFirms.hqLocation), eq(investmentFirms.hqLocation, ""))
            ),
            isNull(investmentFirms.aum),
            eq(investmentFirms.aum, "")
          )
        );

      const stats = {
        enriched: 0,
        partiallyEnriched: 0,
        failed: 0,
        notEnriched: 0,
        missingData: Number(missingDataResult?.count || 0),
        total: 0,
      };

      for (const row of statusCounts) {
        const count = Number(row.count);
        stats.total += count;
        switch (row.status) {
          case "enriched":
            stats.enriched = count;
            break;
          case "partially_enriched":
            stats.partiallyEnriched = count;
            break;
          case "failed":
            stats.failed = count;
            break;
          default:
            stats.notEnriched += count;
        }
      }

      res.json(stats);
    } catch (err) {
      console.error("Error fetching firm enrichment stats:", err);
      res.status(500).json({ message: "Failed to fetch enrichment stats" });
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
    const search = req.query.search as string | undefined;
    const result = await storage.getBusinessmen(limit, offset, search);
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
    const search = req.query.search as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const contacts = await storage.getContactsByOwner(req.user.id, search, limit, offset);
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
      
      // Log activity for contact updates
      try {
        const changes: string[] = [];
        if (input.pipelineStage && input.pipelineStage !== existing.pipelineStage) {
          changes.push(`pipeline: ${existing.pipelineStage} → ${input.pipelineStage}`);
        }
        if (input.status && input.status !== existing.status) {
          changes.push(`status: ${existing.status} → ${input.status}`);
        }
        if (changes.length > 0 || Object.keys(input).length > 0) {
          await storage.createActivityLog({
            userId: req.user.id,
            action: "updated",
            entityType: "contact",
            entityId: contact?.id,
            description: changes.length > 0 
              ? `Updated contact "${contact?.firstName} ${contact?.lastName || ""}": ${changes.join(", ")}` 
              : `Updated contact "${contact?.firstName} ${contact?.lastName || ""}"`,
            metadata: { changes: input, previousPipelineStage: existing.pipelineStage },
          });
        }
      } catch (logErr) {
        console.error("[Activity] Error logging contact update:", logErr);
      }
      
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
      
      // Process deal outcome for matchmaking feedback loop
      if (deal && input.status && (input.status === "won" || input.status === "lost") && input.status !== existing.status) {
        try {
          const { processDealOutcomeFeedback } = await import("./services/matchmaking");
          await processDealOutcomeFeedback(deal);
        } catch (err) {
          console.error("[Matchmaking] Error processing deal outcome feedback:", err);
        }
      }
      
      // Log activity for deal changes
      try {
        const changes: string[] = [];
        if (input.stage && input.stage !== existing.stage) {
          changes.push(`stage: ${existing.stage} → ${input.stage}`);
        }
        if (input.status && input.status !== existing.status) {
          changes.push(`status: ${existing.status} → ${input.status}`);
        }
        if (changes.length > 0 || Object.keys(input).length > 0) {
          await storage.createActivityLog({
            userId: req.user.id,
            action: "updated",
            entityType: "deal",
            entityId: deal?.id,
            description: changes.length > 0 
              ? `Updated deal "${deal?.title}": ${changes.join(", ")}` 
              : `Updated deal "${deal?.title}"`,
            metadata: { changes: input, previousStage: existing.stage, previousStatus: existing.status },
          });
        }
      } catch (logErr) {
        console.error("[Activity] Error logging deal update:", logErr);
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

  // Get data room by startup ID (1:1 relationship)
  app.get("/api/deal-rooms/startup/:startupId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startup = await storage.getStartupById(req.params.startupId);
    if (!startup || startup.founderId !== req.user.id) {
      return res.status(404).json({ message: "Startup not found" });
    }
    let room = await storage.getDealRoomByStartupId(req.params.startupId);
    // Auto-create if missing (for existing startups)
    if (!room) {
      room = await storage.createDealRoom({
        startupId: startup.id,
        ownerId: req.user.id,
        name: `${startup.name} Data Room`,
        description: `Secure data room for ${startup.name}`,
        status: "active",
        accessLevel: "private",
      });
    }
    res.json(room);
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
      if (input.dealId) {
        const deal = await storage.getDealById(input.dealId);
        if (!deal || deal.ownerId !== req.user.id) {
          return res.status(404).json({ message: "Deal not found" });
        }
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
    if (!room) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    
    // Allow access if owner, or if room is not password protected, or if verified via session
    const isOwner = room.ownerId === req.user.id;
    const isVerified = (req.session as any)?.verifiedRooms?.[req.params.roomId] === true;
    const needsPassword = room.isPasswordProtected && room.passwordHash;
    
    if (!isOwner && needsPassword && !isVerified) {
      return res.status(403).json({ message: "Access denied - password required" });
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
      
      const notification = await storage.createNotification({
        userId: req.user.id,
        type: "document_uploaded",
        title: "Document Uploaded",
        message: `"${doc.name}" has been uploaded to ${room.name}.`,
        resourceType: "deal_room",
        resourceId: room.id,
        isRead: false,
        metadata: { documentId: doc.id, roomName: room.name },
      });
      wsNotificationService.sendNotification(req.user.id, notification);
      
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

  // Document upload with text extraction endpoint
  app.post("/api/deal-rooms/:roomId/documents/upload", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Deal room not found" });
    }
    
    try {
      const { name, type, objectPath, size, mimeType, description, category } = req.body;
      
      if (!name || !objectPath) {
        return res.status(400).json({ message: "Name and objectPath are required" });
      }
      
      const finalMimeType = mimeType || getMimeTypeFromFilename(name);
      
      // Create the document record first with pending status
      const doc = await storage.createDocument({
        name,
        type: type || "other",
        category: category || "overview",
        objectPath,
        url: objectPath,
        size: size || 0,
        mimeType: finalMimeType,
        description,
        roomId: req.params.roomId,
        uploadedBy: req.user.id,
        processingStatus: "pending",
      });
      
      // Start text extraction in background
      if (isSupportedDocumentType(finalMimeType)) {
        (async () => {
          try {
            await storage.updateDocument(doc.id, { processingStatus: "processing" });
            
            // Fetch the file from object storage
            const objectStorageService = new ObjectStorageService();
            const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
            
            // Download the file content
            const chunks: Buffer[] = [];
            const stream = objectFile.createReadStream();
            
            for await (const chunk of stream) {
              chunks.push(Buffer.from(chunk));
            }
            const buffer = Buffer.concat(chunks);
            
            // Extract text from document
            const extractedText = await extractTextFromBuffer(buffer, finalMimeType);
            
            // Update the document with extracted text
            await storage.updateDocument(doc.id, { 
              extractedText,
              processingStatus: "completed"
            });
            
            console.log(`[DocumentUpload] Text extraction completed for ${doc.name}`);
          } catch (error) {
            console.error(`[DocumentUpload] Text extraction failed for ${doc.name}:`, error);
            await storage.updateDocument(doc.id, { 
              processingStatus: "failed",
              processingError: error instanceof Error ? error.message : "Unknown error"
            });
          }
        })();
      } else {
        // Mark as completed for unsupported types (no text extraction needed)
        await storage.updateDocument(doc.id, { processingStatus: "completed" });
      }
      
      const notification = await storage.createNotification({
        userId: req.user.id,
        type: "document_uploaded",
        title: "Document Uploaded",
        message: `"${doc.name}" has been uploaded to ${room.name}.`,
        resourceType: "deal_room",
        resourceId: room.id,
        isRead: false,
        metadata: { documentId: doc.id, roomName: room.name },
      });
      wsNotificationService.sendNotification(req.user.id, notification);
      
      res.status(201).json(doc);
    } catch (err) {
      console.error("[DocumentUpload] Error:", err);
      res.status(500).json({ message: "Failed to upload document" });
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

  // ========= Data Room Password Protection Routes =========

  // Set password for data room
  app.post("/api/deal-rooms/:roomId/password/set", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Data room not found" });
    }

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      await storage.updateDealRoom(req.params.roomId, {
        passwordHash,
        isPasswordProtected: true,
      });
      res.json({ message: "Password set successfully", isPasswordProtected: true });
    } catch (err) {
      console.error("[DataRoom] Error setting password:", err);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // Remove password protection from data room
  app.post("/api/deal-rooms/:roomId/password/remove", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Data room not found" });
    }

    try {
      await storage.updateDealRoom(req.params.roomId, {
        passwordHash: null,
        isPasswordProtected: false,
        passwordResetToken: null,
        passwordResetExpires: null,
      });
      res.json({ message: "Password protection removed", isPasswordProtected: false });
    } catch (err) {
      console.error("[DataRoom] Error removing password:", err);
      res.status(500).json({ message: "Failed to remove password" });
    }
  });

  // Verify password for data room access
  app.post("/api/deal-rooms/:roomId/password/verify", async (req, res) => {
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: "Data room not found" });
    }

    if (!room.isPasswordProtected || !room.passwordHash) {
      return res.json({ verified: true, message: "No password required" });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    try {
      const isValid = await bcrypt.compare(password, room.passwordHash);
      if (isValid) {
        // Store verification in session
        if (req.session) {
          (req.session as any).verifiedRooms = (req.session as any).verifiedRooms || {};
          (req.session as any).verifiedRooms[req.params.roomId] = true;
        }
        res.json({ verified: true });
      } else {
        res.status(401).json({ verified: false, message: "Incorrect password" });
      }
    } catch (err) {
      console.error("[DataRoom] Error verifying password:", err);
      res.status(500).json({ message: "Failed to verify password" });
    }
  });

  // Request password reset via email
  app.post("/api/deal-rooms/:roomId/password/reset-request", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room || room.ownerId !== req.user.id) {
      return res.status(404).json({ message: "Data room not found" });
    }

    try {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour

      await storage.updateDealRoom(req.params.roomId, {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      });

      // Send reset email
      const user = await storage.getUser(req.user.id);
      if (user?.email) {
        const resetUrl = `${process.env.REPLIT_SITE_URL || "http://localhost:5000"}/app/data-room-reset?token=${resetToken}&roomId=${req.params.roomId}`;
        
        try {
          const { client, fromEmail } = await getResendClient();
          await client.emails.send({
            from: fromEmail,
            to: user.email,
            subject: "Data Room Password Reset",
            text: `You requested a password reset for your data room "${room.name}".\n\nClick this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, you can ignore this email.`,
            html: `
              <h2>Data Room Password Reset</h2>
              <p>You requested a password reset for your data room "<strong>${room.name}</strong>".</p>
              <p><a href="${resetUrl}" style="background: rgb(142,132,247); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Reset Password</a></p>
              <p>This link expires in 1 hour.</p>
              <p>If you didn't request this, you can ignore this email.</p>
            `,
          });
        } catch (emailErr) {
          console.error("[DataRoom] Error sending password reset email:", emailErr);
        }
      }

      res.json({ message: "Reset email sent successfully" });
    } catch (err) {
      console.error("[DataRoom] Error requesting password reset:", err);
      res.status(500).json({ message: "Failed to send reset email" });
    }
  });

  // Reset password with token
  app.post("/api/deal-rooms/:roomId/password/reset", async (req, res) => {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: "Data room not found" });
    }

    if (!room.passwordResetToken || room.passwordResetToken !== token) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    if (room.passwordResetExpires && new Date() > room.passwordResetExpires) {
      return res.status(400).json({ message: "Reset token has expired" });
    }

    try {
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await storage.updateDealRoom(req.params.roomId, {
        passwordHash,
        isPasswordProtected: true,
        passwordResetToken: null,
        passwordResetExpires: null,
      });
      res.json({ message: "Password reset successfully" });
    } catch (err) {
      console.error("[DataRoom] Error resetting password:", err);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Check password protection status
  // Check if user has verified access to a room
  app.get("/api/deal-rooms/:roomId/access-status", async (req, res) => {
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: "Deal room not found" });
    }

    const isOwner = req.user && room.ownerId === req.user.id;
    const isVerified = (req.session as any)?.verifiedRooms?.[req.params.roomId] === true;
    const needsPassword = room.isPasswordProtected && room.passwordHash;

    res.json({
      hasAccess: isOwner || !needsPassword || isVerified,
      isOwner: !!isOwner,
      isPasswordProtected: !!room.isPasswordProtected,
      isVerified,
    });
  });

  app.get("/api/deal-rooms/:roomId/password/status", async (req, res) => {
    const room = await storage.getDealRoomById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: "Data room not found" });
    }

    const isVerified = req.session && (req.session as any).verifiedRooms?.[req.params.roomId];

    res.json({
      isPasswordProtected: room.isPasswordProtected || false,
      isVerified: isVerified || false,
    });
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
      
      const notification = await storage.createNotification({
        userId: req.user.id,
        type: "milestone_created",
        title: "Milestone Created",
        message: `New milestone "${milestone.title}" added to ${room.name}.`,
        resourceType: "deal_room",
        resourceId: room.id,
        isRead: false,
        metadata: { milestoneId: milestone.id, roomName: room.name },
      });
      wsNotificationService.sendNotification(req.user.id, notification);
      
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
      
      if (updated && input.status === "completed" && milestone.status !== "completed") {
        const notification = await storage.createNotification({
          userId: req.user.id,
          type: "milestone_completed",
          title: "Milestone Completed",
          message: `"${updated.title}" has been marked as completed.`,
          resourceType: "deal_room",
          resourceId: room.id,
          isRead: false,
          metadata: { milestoneId: updated.id, roomName: room.name },
        });
        wsNotificationService.sendNotification(req.user.id, notification);
      }
      
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
      
      // E-T3: Sanitize HTML content before storing to prevent XSS attacks
      const { sanitizeEmailHtml } = await import('./services/email-utils');
      const sanitizedInput = {
        ...input,
        htmlContent: input.htmlContent ? sanitizeEmailHtml(input.htmlContent) : input.htmlContent,
      };
      
      const template = await storage.createEmailTemplate({
        ...sanitizedInput,
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
      
      // E-T3: Sanitize HTML content before storing to prevent XSS attacks
      const { sanitizeEmailHtml } = await import('./services/email-utils');
      const sanitizedInput = {
        ...input,
        htmlContent: input.htmlContent ? sanitizeEmailHtml(input.htmlContent) : input.htmlContent,
      };
      
      const updated = await storage.updateEmailTemplate(req.params.id, sanitizedInput);
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

  // E-T2: Endpoint to get supported personalization variables for email templates
  app.get("/api/emailTemplates/variables", async (req, res) => {
    const { getSupportedVariables } = await import('./services/email-utils');
    const variables = getSupportedVariables();
    res.json({
      variables: variables.map(v => ({
        name: v,
        placeholder: `{{${v}}}`,
        description: getVariableDescription(v),
      })),
    });
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
      
      // Auto-create contact if investor/firm doesn't exist in CRM
      try {
        if (input.investorId) {
          const existingContact = await storage.getContactByInvestorId(req.user.id, input.investorId);
          if (!existingContact) {
            const investor = await storage.getInvestorById(input.investorId);
            if (investor) {
              const nameParts = (investor.name || "").split(" ").filter(Boolean);
              const firstName = investor.firstName?.trim() || nameParts[0] || "Unknown Investor";
              const lastName = investor.lastName?.trim() || (nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined);
              
              await storage.createContact({
                ownerId: req.user.id,
                type: "investor",
                firstName,
                lastName: lastName || undefined,
                email: investor.email || undefined,
                company: investor.company || undefined,
                title: investor.title || undefined,
                linkedinUrl: investor.linkedinUrl || undefined,
                sourceType: "investor",
                sourceInvestorId: input.investorId,
                pipelineStage: "sourced",
              });
            }
          }
        }
        if (input.firmId && !input.investorId) {
          // Only create firm contact if there's no investor (to avoid duplicates)
          const existingContact = await storage.getContactByFirmId(req.user.id, input.firmId);
          if (!existingContact) {
            const firm = await storage.getInvestmentFirmById(input.firmId);
            if (firm) {
              const firmName = firm.name?.trim() || "Unknown Firm";
              
              await storage.createContact({
                ownerId: req.user.id,
                type: "other", // Use "other" for firm-level contacts
                firstName: firmName,
                lastName: undefined,
                email: firm.emails?.[0]?.value || undefined,
                company: firmName,
                linkedinUrl: firm.linkedinUrl || undefined,
                sourceType: "firm",
                sourceFirmId: input.firmId,
                pipelineStage: "sourced",
              });
            }
          }
        }
      } catch (autoCreateErr) {
        console.error("[Outreach] Error auto-creating contact:", autoCreateErr);
        // Don't fail the outreach creation if contact auto-creation fails
      }
      
      // Log activity
      try {
        await storage.createActivityLog({
          userId: req.user.id,
          action: "created",
          entityType: "outreach",
          entityId: outreach.id,
          description: `Created outreach: ${input.emailSubject || "No subject"}`,
          metadata: { investorId: input.investorId, firmId: input.firmId },
        });
      } catch (logErr) {
        console.error("[Activity] Error logging outreach creation:", logErr);
      }
      
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

  // ============================================================================
  // INTRODUCTIONS ROUTES (N-I2: Warm Introduction Workflow)
  // ============================================================================

  // List user's introductions
  app.get("/api/introductions", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const introductions = await storage.getIntroductions(req.user.id);
    res.json(introductions);
  });

  // Get single introduction
  app.get("/api/introductions/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const intro = await storage.getIntroductionById(req.params.id);
    if (!intro) {
      return res.status(404).json({ message: "Introduction not found" });
    }
    if (intro.requesterId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(intro);
  });

  // N-I2: Create introduction request
  app.post("/api/introductions", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { targetInvestorId, targetFirmId, startupId, message, matchId, priority } = req.body;

      if (!targetInvestorId && !targetFirmId) {
        return res.status(400).json({ message: "Either targetInvestorId or targetFirmId is required" });
      }

      const intro = await storage.createIntroduction({
        requesterId: req.user.id,
        targetInvestorId: targetInvestorId || null,
        targetFirmId: targetFirmId || null,
        startupId: startupId || null,
        matchId: matchId || null,
        message: message || null,
        priority: priority || "normal",
        status: "draft",
      });

      // Log activity
      try {
        await storage.createActivityLog({
          userId: req.user.id,
          action: "created",
          entityType: "introduction",
          entityId: intro.id,
          description: `Created introduction request`,
          metadata: { targetInvestorId, targetFirmId },
        });
      } catch (logErr) {
        console.error("[Activity] Error logging introduction creation:", logErr);
      }

      res.status(201).json(intro);
    } catch (err) {
      console.error("[Introductions] Create error:", err);
      res.status(500).json({ message: "Failed to create introduction" });
    }
  });

  // N-I2: Send introduction request (updates status and can send email)
  app.post("/api/introductions/:id/send", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const intro = await storage.getIntroductionById(req.params.id);
    if (!intro) {
      return res.status(404).json({ message: "Introduction not found" });
    }
    if (intro.requesterId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    try {
      // Update status to sent_to_target (direct intro) or pending_review (with connector)
      const newStatus = intro.connectorId ? "sent_to_connector" : "sent_to_target";
      const updated = await storage.updateIntroduction(req.params.id, {
        status: newStatus,
        sentToTargetAt: newStatus === "sent_to_target" ? new Date() : undefined,
        sentToConnectorAt: newStatus === "sent_to_connector" ? new Date() : undefined,
      });

      // Log activity
      await storage.createActivityLog({
        userId: req.user.id,
        action: "sent",
        entityType: "introduction",
        entityId: intro.id,
        description: `Sent introduction request`,
        metadata: { status: newStatus },
      });

      res.json(updated);
    } catch (err) {
      console.error("[Introductions] Send error:", err);
      res.status(500).json({ message: "Failed to send introduction" });
    }
  });

  // Update introduction
  app.patch("/api/introductions/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const intro = await storage.getIntroductionById(req.params.id);
    if (!intro) {
      return res.status(404).json({ message: "Introduction not found" });
    }
    if (intro.requesterId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { message, status, priority } = req.body;
    const updated = await storage.updateIntroduction(req.params.id, {
      message,
      status,
      priority,
    });
    res.json(updated);
  });

  // N-I2 (AI): Generate AI intro message
  app.post("/api/introductions/generate", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { targetInvestorId, targetFirmId, startupId, matchId, customNotes } = req.body;

      // Fetch context data
      const [investor, firm, startup, match] = await Promise.all([
        targetInvestorId ? storage.getInvestorById(targetInvestorId) : null,
        targetFirmId ? storage.getInvestmentFirmById(targetFirmId) : null,
        startupId ? storage.getStartupById(startupId) : null,
        matchId ? storage.getMatchById(matchId) : null,
      ]);

      // Get founder name
      const founderName = req.user.firstName 
        ? `${req.user.firstName}${req.user.lastName ? ' ' + req.user.lastName : ''}`
        : req.user.email?.split('@')[0] || "The Founder";

      const { introGenerationService } = await import('./services/intro-generation');
      const result = await introGenerationService.generateIntroMessage({
        startup,
        investor,
        firm,
        match,
        founderName,
        customNotes,
      });

      res.json({
        message: result.message,
        subject: result.subject,
        confidence: result.confidence,
      });
    } catch (err) {
      console.error("[Introductions] AI generate error:", err);
      res.status(500).json({ message: "Failed to generate introduction message" });
    }
  });

  // Search investors for intro target (N-I1: investor search functionality)
  app.get("/api/introductions/search-investors", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    if (!query || query.length < 2) {
      return res.json({ data: [], total: 0 });
    }

    const investors = await storage.getInvestors(10, 0, query);
    res.json(investors);
  });

  // Matches Routes
  app.get(api.matches.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const startupId = typeof req.query.startupId === 'string' ? req.query.startupId : undefined;
    
    // SECURITY: If startupId is provided, verify the user owns this startup
    if (startupId) {
      const startup = await storage.getStartupById(startupId);
      if (!startup || startup.founderId !== req.user.id) {
        return res.status(403).json({ message: "Access denied to this startup's matches" });
      }
    } else {
      // If no startupId, only return matches for startups owned by this user
      const userStartups = await storage.getStartupsByFounder(req.user.id);
      const startupIds = userStartups.map(s => s.id);
      if (startupIds.length === 0) {
        return res.json([]);
      }
      const allMatches = await Promise.all(startupIds.map(id => storage.getMatches(id)));
      return res.json(allMatches.flat());
    }
    
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
      
      // Log activity for match status changes
      try {
        if (input.status && input.status !== match.status) {
          await storage.createActivityLog({
            userId: req.user.id,
            action: "updated",
            entityType: "match",
            entityId: req.params.id,
            description: `Match status changed: ${match.status} → ${input.status}`,
            metadata: { previousStatus: match.status, newStatus: input.status, investorId: match.investorId, firmId: match.firmId },
          });
        }
      } catch (logErr) {
        console.error("[Activity] Error logging match update:", logErr);
      }
      
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

  // Clear all matches for a startup
  app.delete("/api/matches/startup/:startupId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { startupId } = req.params;
      
      // Verify startup belongs to user
      const startup = await storage.getStartupById(startupId);
      if (!startup || startup.founderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      // Delete all matches for this startup
      const allMatches = await storage.getMatches();
      const startupMatches = allMatches.filter(m => m.startupId === startupId);
      
      for (const match of startupMatches) {
        await storage.deleteMatch(match.id);
      }
      
      res.json({ 
        success: true, 
        deletedCount: startupMatches.length 
      });
    } catch (error) {
      console.error("Clear matches error:", error);
      return res.status(500).json({ message: "Failed to clear matches" });
    }
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

  // Pitch Deck Analysis API - Full multi-perspective MBB-style analysis
  app.post("/api/pitch-deck/full-analysis", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { 
        pitchDeckContent,
        dataRoomContent,
        financialsContent,
        faqsContent,
        hasDataRoom,
        hasFinancials,
        hasFaqs
      } = req.body;
      
      if (!pitchDeckContent || typeof pitchDeckContent !== "string") {
        return res.status(400).json({ message: "Pitch deck content is required" });
      }

      const { pitchDeckAnalysisService } = await import("./services/mistral");
      const analysis = await pitchDeckAnalysisService.performFullAnalysis(pitchDeckContent, {
        dataRoomContent: dataRoomContent || '',
        financialsContent: financialsContent || '',
        faqsContent: faqsContent || '',
        hasDataRoom: !!hasDataRoom,
        hasFinancials: !!hasFinancials,
        hasFaqs: !!hasFaqs,
      });
      
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
      const { startupId, limit = 50, async: useAsync = true } = req.body;
      
      if (!startupId) {
        return res.status(400).json({ message: "startupId is required" });
      }

      const startup = await storage.getStartupById(startupId);
      if (!startup || startup.founderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to generate matches for this startup" });
      }

      if (useAsync) {
        const { createJob } = await import("./services/backgroundWorker");
        const job = await createJob(
          "matchmaking",
          { startupId, limit, userId: req.user.id },
          {
            userId: req.user.id,
            entityId: startupId,
            entityType: "startup",
          }
        );
        
        return res.json({
          success: true,
          async: true,
          jobId: job.id,
          message: "Matchmaking started in background",
        });
      }

      const { generateMatchesForStartup, saveMatchResults, adjustWeightsFromFeedback } = await import("./services/matchmaking");
      
      const personalizedWeights = await adjustWeightsFromFeedback(req.user.id);
      const matchResults = await generateMatchesForStartup(startupId, personalizedWeights, limit);

      const [session] = await db.insert(matchSessions).values({
        startupId,
        userId: req.user.id,
        label: startup?.name ? `${startup.name} — Run ${new Date().toLocaleDateString()}` : `Session ${new Date().toLocaleDateString()}`,
        totalMatches: matchResults.length,
        source: "standard",
      }).returning();

      const savedMatches = await saveMatchResults(startupId, matchResults, session?.id);
      
      res.json({ 
        success: true,
        async: false,
        sessionId: session?.id,
        matchCount: savedMatches.length,
        matches: savedMatches 
      });
    } catch (error) {
      console.error("Generate matches error:", error);
      return res.status(500).json({ message: "Failed to generate matches" });
    }
  });

  // Match Sessions - list all sessions for current user
  app.get("/api/match-sessions", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const sessions = await db.select({
        id: matchSessions.id,
        startupId: matchSessions.startupId,
        userId: matchSessions.userId,
        label: matchSessions.label,
        totalMatches: matchSessions.totalMatches,
        source: matchSessions.source,
        createdAt: matchSessions.createdAt,
      })
      .from(matchSessions)
      .where(eq(matchSessions.userId, req.user.id))
      .orderBy(desc(matchSessions.createdAt));

      const startupIds = [...new Set(sessions.map(s => s.startupId))];
      let startupMap: Record<string, string> = {};
      if (startupIds.length > 0) {
        const { startups: startupsTable } = await import("@shared/schema");
        const startupRows = await db.select({ id: startupsTable.id, name: startupsTable.name })
          .from(startupsTable)
          .where(inArray(startupsTable.id, startupIds));
        startupRows.forEach(s => { startupMap[s.id] = s.name; });
      }

      const sessionsWithCounts = await Promise.all(sessions.map(async (s) => {
        const counts = await db.select({ status: matchesRows.status, count: sql<number>`count(*)::int` })
          .from(matchesRows)
          .where(eq(matchesRows.sessionId, s.id))
          .groupBy(matchesRows.status);
        const summary: Record<string, number> = {};
        counts.forEach(c => { summary[c.status] = c.count; });
        return { ...s, startupName: startupMap[s.startupId] || "Unknown Startup", statusSummary: summary };
      }));

      res.json(sessionsWithCounts);
    } catch (error) {
      console.error("Get match sessions error:", error);
      res.status(500).json({ message: "Failed to get match sessions" });
    }
  });

  // Match Sessions - get session detail with all matches enriched with firm/investor data
  app.get("/api/match-sessions/:sessionId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { sessionId } = req.params;

      const [sessionRow] = await db.select()
        .from(matchSessions)
        .where(eq(matchSessions.id, sessionId))
        .limit(1);

      if (!sessionRow || sessionRow.userId !== req.user.id) {
        return res.status(404).json({ message: "Session not found" });
      }

      const sessionMatches = await db.select()
        .from(matchesRows)
        .where(eq(matchesRows.sessionId, sessionId))
        .orderBy(desc(matchesRows.matchScore));

      const firmIds = sessionMatches.filter(m => m.firmId).map(m => m.firmId!);
      const investorIds = sessionMatches.filter(m => m.investorId).map(m => m.investorId!);

      let firmMap: Record<string, any> = {};
      let investorMap: Record<string, any> = {};

      if (firmIds.length > 0) {
        const firmRows = await db.select({
          id: investmentFirms.id,
          name: investmentFirms.name,
          type: investmentFirms.type,
          location: investmentFirms.location,
          aum: investmentFirms.aum,
          sectors: investmentFirms.sectors,
          stages: investmentFirms.stages,
          website: investmentFirms.website,
        }).from(investmentFirms).where(inArray(investmentFirms.id, firmIds));
        firmRows.forEach(f => { firmMap[f.id] = f; });
      }

      if (investorIds.length > 0) {
        const investorRows = await db.select({
          id: investors.id,
          firstName: investors.firstName,
          lastName: investors.lastName,
          title: investors.title,
          location: investors.location,
          sectors: investors.sectors,
          stages: investors.stages,
        }).from(investors).where(inArray(investors.id, investorIds));
        investorRows.forEach(i => { investorMap[i.id] = i; });
      }

      const enrichedMatches = sessionMatches.map(m => ({
        ...m,
        firm: m.firmId ? firmMap[m.firmId] : null,
        investor: m.investorId ? investorMap[m.investorId] : null,
      }));

      res.json({ session: sessionRow, matches: enrichedMatches });
    } catch (error) {
      console.error("Get match session detail error:", error);
      res.status(500).json({ message: "Failed to get match session" });
    }
  });

  // Background job status endpoints
  app.get("/api/jobs/:jobId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { getJobStatus } = await import("./services/backgroundWorker");
      const job = await getJobStatus(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      if (job.userId && job.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to view this job" });
      }
      
      res.json(job);
    } catch (error) {
      console.error("Get job status error:", error);
      return res.status(500).json({ message: "Failed to get job status" });
    }
  });

  app.get("/api/jobs", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { getJobsForUser } = await import("./services/backgroundWorker");
      const jobs = await getJobsForUser(req.user.id, 20);
      res.json(jobs);
    } catch (error) {
      console.error("Get jobs error:", error);
      return res.status(500).json({ message: "Failed to get jobs" });
    }
  });

  app.post("/api/jobs/:jobId/cancel", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { getJobStatus, cancelJob } = await import("./services/backgroundWorker");
      const job = await getJobStatus(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      if (job.userId && job.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to cancel this job" });
      }
      
      await cancelJob(req.params.jobId);
      res.json({ success: true, message: "Job cancelled" });
    } catch (error) {
      console.error("Cancel job error:", error);
      return res.status(500).json({ message: "Failed to cancel job" });
    }
  });

  // Weight learning analytics endpoints
  app.get("/api/matches/weights", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { getActiveWeights, getWeightHistory } = await import("./services/matchmaking");
      const currentWeights = await getActiveWeights(req.user.id);
      const history = await getWeightHistory(req.user.id, 10);
      
      res.json({
        currentWeights,
        history,
        defaultWeights: {
          location: 0.20,
          industry: 0.30,
          stage: 0.25,
          investorType: 0.10,
          checkSize: 0.15,
        },
      });
    } catch (error) {
      console.error("Get weights error:", error);
      return res.status(500).json({ message: "Failed to get weight analytics" });
    }
  });

  app.post("/api/matches/weights/recalculate", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { adjustWeightsFromFeedback, getWeightHistory } = await import("./services/matchmaking");
      const newWeights = await adjustWeightsFromFeedback(req.user.id, {
        triggerType: "manual_recalculation",
        persistWeights: true,
      });
      
      const history = await getWeightHistory(req.user.id, 1);
      
      res.json({
        success: true,
        newWeights,
        latestRecord: history[0] || null,
        message: "Weights recalculated based on your deal outcomes and match feedback",
      });
    } catch (error) {
      console.error("Recalculate weights error:", error);
      return res.status(500).json({ message: "Failed to recalculate weights" });
    }
  });

  // Bulk import matched investors to CRM contacts
  app.post("/api/matches/bulk-import-to-crm", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { matchIds, startupId, importAll = false } = req.body;
      
      if (!startupId) {
        return res.status(400).json({ message: "startupId is required" });
      }

      const startup = await storage.getStartupById(startupId);
      if (!startup || startup.founderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to import matches for this startup" });
      }

      // Get matches to import
      let matchesToImport: any[] = [];
      if (importAll) {
        const { getMatchesForUser } = await import("./services/matchmaking");
        const allMatches = await getMatchesForUser(req.user.id);
        matchesToImport = allMatches.filter(m => m.startupId === startupId);
      } else if (matchIds && matchIds.length > 0) {
        const { getMatchesForUser } = await import("./services/matchmaking");
        const allMatches = await getMatchesForUser(req.user.id);
        matchesToImport = allMatches.filter(m => matchIds.includes(m.id));
      }

      if (matchesToImport.length === 0) {
        return res.status(400).json({ message: "No matches found to import" });
      }

      // Get existing contacts to avoid duplicates
      const existingContacts = await storage.getContactsByOwner(req.user.id);
      const existingMatchIds = new Set(existingContacts.filter(c => c.sourceMatchId).map(c => c.sourceMatchId));

      const importedContacts = [];
      const skipped = [];

      for (const match of matchesToImport) {
        // Skip if already imported
        if (existingMatchIds.has(match.id)) {
          skipped.push({ matchId: match.id, reason: "Already imported" });
          continue;
        }

        let firstName = "Unknown";
        let lastName: string | undefined;
        let email: string | undefined;
        let company: string | undefined;
        let title: string | undefined;
        let linkedinUrl: string | undefined;
        let avatar: string | undefined;
        let tags: string[] = [];
        const matchScore = match.matchScore || 0;

        if (match.investorId) {
          const investor = await storage.getInvestorById(match.investorId);
          if (investor) {
            firstName = investor.firstName || "Unknown";
            lastName = investor.lastName || undefined;
            email = investor.email || undefined;
            title = investor.title || undefined;
            linkedinUrl = investor.linkedinUrl || investor.personLinkedinUrl || undefined;
            avatar = investor.avatar || undefined;
            tags = investor.sectors || [];
            if (investor.firmId) {
              const firm = await storage.getInvestmentFirmById(investor.firmId);
              company = firm?.name;
            }
          }
        } else if (match.firmId) {
          const firm = await storage.getInvestmentFirmById(match.firmId);
          if (firm) {
            firstName = firm.name || "Unknown";
            email = firm.emails && firm.emails.length > 0 ? firm.emails[0].value : undefined;
            company = firm.name || undefined;
            tags = firm.sectors || [];
          }
        }

        // Create contact with match score in metadata
        const contact = await storage.createContact({
          ownerId: req.user.id,
          firstName,
          lastName,
          email,
          company,
          title,
          linkedinUrl,
          avatar,
          tags: [...tags, `score-${matchScore}`],
          type: match.investorId ? "investor" : "firm",
          status: "active",
          pipelineStage: "new",
          sourceMatchId: match.id,
          sourceInvestorId: match.investorId || undefined,
          sourceFirmId: match.firmId || undefined,
          notes: `Imported from matchmaking. Match Score: ${matchScore}. Reasons: ${(match.matchReasons || []).join(", ")}`,
          metadata: {
            matchScore,
            matchReasons: match.matchReasons,
            matchBreakdown: match.metadata?.breakdown,
            importedAt: new Date().toISOString(),
          },
        });

        importedContacts.push(contact);
      }

      res.json({
        success: true,
        imported: importedContacts.length,
        skipped: skipped.length,
        contacts: importedContacts,
        skippedDetails: skipped,
      });
    } catch (error) {
      console.error("Bulk import matches error:", error);
      return res.status(500).json({ message: "Failed to bulk import matches to CRM" });
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

  app.delete("/api/matches/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { verifyMatchOwnership } = await import("./services/matchmaking");
      
      const isOwner = await verifyMatchOwnership(req.params.id, req.user.id);
      if (!isOwner) {
        return res.status(403).json({ message: "Not authorized to delete this match" });
      }
      
      await storage.deleteMatch(req.params.id);
      
      res.json({ success: true, message: "Match deleted" });
    } catch (error) {
      console.error("Delete match error:", error);
      return res.status(500).json({ message: "Failed to delete match" });
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
      const { startupId, deckText, documents } = req.body;
      
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

      runAcceleratedMatching(job.id, deckText, req.user.id, documents).catch(err => {
        console.error("Accelerated matching background error:", err);
      });

      res.status(201).json(job);
    } catch (error) {
      console.error("Create accelerated match job error:", error);
      return res.status(500).json({ message: "Failed to create accelerated match job" });
    }
  });

  // ==================== ENHANCED MATCHMAKING API ====================
  
  app.post("/api/matches/enhanced", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { startupId, limit = 50, includeInactive = false, minScore = 20 } = req.body;
      
      if (!startupId) {
        return res.status(400).json({ message: "startupId is required" });
      }

      const startup = await storage.getStartupById(startupId);
      if (!startup || startup.founderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to use this startup" });
      }

      const { enhancedMatchmakingService } = await import("./services/enhanced-matchmaking");
      
      const matches = await enhancedMatchmakingService.runEnhancedMatching(startupId, {
        limit,
        includeInactiveInvestors: includeInactive,
        minScore,
      });

      res.json({
        success: true,
        algorithm: "enhanced",
        matchCount: matches.length,
        matches,
      });
    } catch (error) {
      console.error("Enhanced matching error:", error);
      return res.status(500).json({ message: "Failed to run enhanced matching" });
    }
  });

  app.post("/api/matches/compare", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { startupId } = req.body;
      
      if (!startupId) {
        return res.status(400).json({ message: "startupId is required" });
      }

      const startup = await storage.getStartupById(startupId);
      if (!startup || startup.founderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to use this startup" });
      }

      const { enhancedMatchmakingService } = await import("./services/enhanced-matchmaking");
      const result = await enhancedMatchmakingService.compareWithBaseline(startupId);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error("Compare matching error:", error);
      return res.status(500).json({ message: "Failed to compare algorithms" });
    }
  });

  // ==================== MATCHMAKING V2 API ====================

  // Run V2 matchmaking for a startup
  app.post("/api/v2/match/run", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { startupId, mode, weights, minScore, maxResults } = req.body;
      if (!startupId) return res.status(400).json({ message: "startupId is required" });
      const startup = await storage.getStartupById(startupId);
      if (!startup || startup.founderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized for this startup" });
      }
      const { runMatchmakingV2 } = await import("./services/matchmaking-v2");
      const result = await runMatchmakingV2(startupId, { mode, weights, minScore, maxResults });
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error("[V2Match] run error:", err);
      res.status(500).json({ message: err?.message ?? "Failed to run matchmaking" });
    }
  });

  // Get all sessions for a startup
  app.get("/api/v2/match/sessions/:startupId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const startup = await storage.getStartupById(req.params.startupId);
      if (!startup || startup.founderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized for this startup" });
      }
      const { getSessionsForStartup } = await import("./services/matchmaking-v2");
      const sessions = await getSessionsForStartup(req.params.startupId);
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? "Failed to fetch sessions" });
    }
  });

  // Get a session with all its matches
  app.get("/api/v2/match/session/:sessionId", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { getSessionWithMatches } = await import("./services/matchmaking-v2");
      const result = await getSessionWithMatches(req.params.sessionId);
      if (!result) return res.status(404).json({ message: "Session not found" });
      // Verify ownership via startup
      const startup = await storage.getStartupById(result.session.startupId);
      if (!startup || startup.founderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized" });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? "Failed to fetch session" });
    }
  });

  // Update a match status (pending | in_crm | passed)
  app.patch("/api/v2/match/matches/:matchId/status", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { status, notes } = req.body;
      if (!status) return res.status(400).json({ message: "status is required" });
      const { updateMatchStatus } = await import("./services/matchmaking-v2");
      await updateMatchStatus(req.params.matchId, status, notes);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? "Failed to update match status" });
    }
  });

  // Import session matches to Folk CRM
  app.post("/api/v2/match/session/:sessionId/import-crm", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { tierFilter } = req.body;
      const { importMatchesToCRM } = await import("./services/matchmaking-v2");
      const result = await importMatchesToCRM(req.params.sessionId, tierFilter);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? "Failed to import to CRM" });
    }
  });

  // Record deal feedback (won/lost)
  app.post("/api/v2/match/feedback", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { investorId, startupId, outcome, sessionId } = req.body;
      if (!investorId || !startupId || !outcome) {
        return res.status(400).json({ message: "investorId, startupId, outcome required" });
      }
      const { recordDealFeedback } = await import("./services/matchmaking-v2");
      await recordDealFeedback(investorId, startupId, outcome, sessionId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? "Failed to record feedback" });
    }
  });

  // Get report data for a session
  app.get("/api/v2/match/session/:sessionId/report", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { getMatchReportData } = await import("./services/matchmaking-v2");
      const data = await getMatchReportData(req.params.sessionId);
      if (!data) return res.status(404).json({ message: "Session not found" });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? "Failed to get report data" });
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
        const stage = contact.pipelineStage || 'sourced';
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

  // D-C1 Fix: Transactional outreach creation + email sending
  // Creates outreach record and sends email atomically - if email fails, outreach stage is set to "draft"
  // E-R3: Rate limited to 50 emails/hour/user for domain reputation protection
  app.post("/api/outreach/create-and-send", outreachRateLimiter, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const { toEmail, subject, htmlContent, textContent, investorId, firmId, startupId, contactId, templateId } = req.body;
    
    if (!toEmail || !subject || !htmlContent) {
      return res.status(400).json({ message: "toEmail, subject, and htmlContent are required" });
    }
    
    let createdOutreach: any = null;
    
    try {
      // Step 1: Create outreach record with "draft" stage (using correct schema fields)
      createdOutreach = await storage.createOutreach({
        ownerId: req.user.id,
        startupId: startupId || null,
        investorId: investorId || null,
        firmId: firmId || null,
        contactId: contactId || null,
        templateId: templateId || null,
        emailSubject: subject,
        emailBody: htmlContent,
        stage: "draft",
      });
      
      // Step 2: Send email
      const { sendOutreachEmail } = await import('./services/resend');
      const result = await sendOutreachEmail(toEmail, subject, htmlContent, textContent);
      
      if (result.success) {
        // Step 3a: Update outreach to "pitch_sent" stage and record sentAt
        await storage.updateOutreach(createdOutreach.id, {
          stage: "pitch_sent",
          sentAt: new Date(),
          metadata: { messageId: result.messageId, toEmail },
        });
        
        // Log the interaction
        if (startupId) {
          await storage.createInteractionLog({
            outreachId: createdOutreach.id,
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
        
        return res.json({
          success: true,
          outreachId: createdOutreach.id,
          messageId: result.messageId,
          verification: result.verification,
        });
      } else {
        // Step 3b: Email failed - keep as "draft" stage with error in metadata
        await storage.updateOutreach(createdOutreach.id, {
          stage: "draft",
          metadata: { sendError: result.error, verification: result.verification },
        });
        
        return res.status(400).json({
          success: false,
          outreachId: createdOutreach.id,
          error: result.error,
          verification: result.verification,
        });
      }
    } catch (error) {
      // If outreach was created but email sending threw an exception, keep as draft with error
      if (createdOutreach?.id) {
        await storage.updateOutreach(createdOutreach.id, {
          stage: "draft",
          metadata: { sendError: error instanceof Error ? error.message : "Unknown error" },
        }).catch(console.error);
      }
      
      res.status(500).json({ 
        success: false,
        outreachId: createdOutreach?.id,
        message: error instanceof Error ? error.message : "Send error" 
      });
    }
  });

  // Send outreach email with verification (for existing outreaches)
  // E-R3: Rate limited to 50 emails/hour/user for domain reputation protection
  app.post("/api/outreach/send", outreachRateLimiter, async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // O-L1 Fix: Removed verifyFirst parameter - email verification is now mandatory
    const { outreachId, toEmail, subject, htmlContent, textContent, investorId, startupId } = req.body;
    
    if (!toEmail || !subject || !htmlContent) {
      return res.status(400).json({ message: "toEmail, subject, and htmlContent are required" });
    }

    try {
      const { sendOutreachEmail } = await import('./services/resend');
      const result = await sendOutreachEmail(toEmail, subject, htmlContent, textContent);
      
      if (outreachId) {
        // D-C1 Fix: Use correct schema field 'stage' instead of 'status'
        const existingOutreach = await storage.getOutreachById(outreachId);
        await storage.updateOutreach(outreachId, {
          stage: result.success ? "pitch_sent" : "draft",
          sentAt: result.success ? new Date() : undefined,
          metadata: {
            ...existingOutreach?.metadata,
            messageId: result.messageId,
            toEmail,
            ...(result.error ? { sendError: result.error } : {}),
          },
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
      // D-C1 Fix: If outreach exists and email failed, keep as draft with error in metadata
      if (outreachId) {
        const existingOutreach = await storage.getOutreachById(outreachId).catch(() => null);
        await storage.updateOutreach(outreachId, {
          stage: "draft",
          metadata: {
            ...existingOutreach?.metadata,
            sendError: error instanceof Error ? error.message : "Unknown error",
          },
        }).catch(console.error);
      }
      
      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : "Send error" 
      });
    }
  });

  // O-W2 Fix: Resend webhook handler for email tracking (opens, replies, bounces)
  // This endpoint receives webhook events from Resend to update outreach engagement metrics
  // Uses official Svix library for proper webhook signature verification
  app.post("/api/webhooks/resend", async (req, res) => {
    try {
      // Get raw body from req.rawBody (captured by express.json middleware in index.ts)
      const rawBodyBuffer = (req as any).rawBody as Buffer | undefined;
      const payload = rawBodyBuffer ? rawBodyBuffer.toString('utf8') : JSON.stringify(req.body);
      
      // Webhook signature verification using RESEND_WEBHOOK_SECRET
      const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
      const isProduction = process.env.NODE_ENV === 'production';
      
      let event = req.body;
      
      if (!webhookSecret) {
        if (isProduction) {
          console.error('[Resend Webhook] RESEND_WEBHOOK_SECRET not configured in production - rejecting');
          return res.status(500).json({ error: 'Webhook secret not configured' });
        }
        console.warn('[Resend Webhook] No RESEND_WEBHOOK_SECRET configured - dev mode, proceeding without verification');
      } else {
        // Use official Svix library for proper signature verification
        const { Webhook } = await import('svix');
        const wh = new Webhook(webhookSecret);
        
        const headers = {
          'svix-id': req.headers['svix-id'] as string,
          'svix-timestamp': req.headers['svix-timestamp'] as string,
          'svix-signature': req.headers['svix-signature'] as string,
        };
        
        try {
          event = wh.verify(payload, headers) as any;
          console.log('[Resend Webhook] Signature verified successfully');
        } catch (verifyError: any) {
          console.warn('[Resend Webhook] Signature verification failed:', verifyError.message);
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }
      
      // Resend webhook event types: email.sent, email.delivered, email.opened, 
      // email.clicked, email.bounced, email.complained, email.delivery_delayed
      const eventType = event.type;
      const messageId = event.data?.email_id;
      
      if (!messageId) {
        return res.status(200).json({ received: true, message: "No message ID" });
      }
      
      console.log(`[Resend Webhook] Received ${eventType} for message ${messageId}`);
      
      const { outreaches } = await import("@shared/schema");
      const { db } = await import("./db");
      const { sql, eq } = await import("drizzle-orm");
      
      // Search for outreach with this messageId in metadata (stored when email was sent)
      const matchingOutreaches = await db.select()
        .from(outreaches)
        .where(sql`${outreaches.metadata}->>'messageId' = ${messageId}`)
        .limit(1);
      
      if (matchingOutreaches.length > 0) {
        const outreach = matchingOutreaches[0];
        const updateData: Record<string, any> = {};
        
        switch (eventType) {
          case "email.opened":
            updateData.openedAt = new Date();
            updateData.stage = "opened";
            break;
          case "email.clicked":
            // Clicked implies opened
            if (!outreach.openedAt) {
              updateData.openedAt = new Date();
            }
            updateData.stage = "opened";
            break;
          case "email.bounced":
            updateData.stage = "passed"; // Use existing stage for failed delivery
            updateData.metadata = { ...outreach.metadata, bounced: true, bouncedAt: new Date().toISOString() };
            break;
          case "email.complained":
            updateData.stage = "passed";
            updateData.metadata = { ...outreach.metadata, complained: true };
            break;
          case "email.delivered":
            // Keep as pitch_sent, just log the delivery
            updateData.metadata = { ...outreach.metadata, deliveredAt: new Date().toISOString() };
            break;
        }
        
        if (Object.keys(updateData).length > 0) {
          await db.update(outreaches)
            .set({ ...updateData, updatedAt: new Date() })
            .where(eq(outreaches.id, outreach.id));
          
          console.log(`[Resend Webhook] Updated outreach ${outreach.id} with ${eventType}`);
        }
      } else {
        console.log(`[Resend Webhook] No outreach found for messageId ${messageId}`);
      }
      
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("[Resend Webhook] Error:", error);
      res.status(200).json({ received: true, error: "Processing error" });
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

  // Export article as PDF report
  app.get("/api/newsroom/articles/:id/export", async (req, res) => {
    try {
      const { newsArticles } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const { generateNewsroomReportPDF } = await import("./services/pdf-report");
      
      const [article] = await db.select().from(newsArticles).where(eq(newsArticles.id, req.params.id)).limit(1);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      // Only allow export of published articles (or require authentication for non-published)
      if (article.status !== "published") {
        if (!req.isAuthenticated()) {
          return res.status(401).json({ message: "Authentication required for unpublished articles" });
        }
        // Only admins can export unpublished articles
        const adminEmails = ["vc@philippemasindet.com", "masindetphilippe@gmail.com"];
        if (!req.user?.isAdmin && !adminEmails.includes(req.user?.email || "")) {
          return res.status(403).json({ message: "Only published articles can be exported" });
        }
      }
      
      // Validate sources is an array
      const sources = Array.isArray(article.sources) ? article.sources : [];
      
      const reportData = {
        headline: article.headline,
        executiveSummary: article.executiveSummary || "",
        content: article.content,
        author: article.author || "Anker Intelligence",
        publishedAt: article.publishedAt?.toISOString() || undefined,
        blogType: article.blogType || "Analysis",
        capitalType: article.capitalType || undefined,
        geography: article.geography || "Global",
        tags: article.tags || [],
        sources: sources as any[],
      };
      
      const pdfBuffer = await generateNewsroomReportPDF(reportData);
      
      const safeFilename = article.headline
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .substring(0, 50);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="anker-report-${safeFilename}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Export article PDF error:", error);
      res.status(500).json({ message: "Failed to generate PDF report" });
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

  // Admin: Create article manually
  app.post("/api/newsroom/articles", async (req, res) => {
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
      const { randomUUID } = await import("crypto");
      
      const { headline, executiveSummary, content, blogType, capitalType, geography, tags, status } = req.body;
      
      if (!headline || !content) {
        return res.status(400).json({ message: "Headline and content are required" });
      }
      
      const baseSlug = headline
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);
      
      let slug = baseSlug + '-' + Date.now();
      const existing = await db.select().from(newsArticles).where(eq(newsArticles.slug, slug)).limit(1);
      if (existing.length > 0) {
        slug = baseSlug + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      }
      
      const normalizedBlogType = blogType ? blogType.charAt(0).toUpperCase() + blogType.slice(1).toLowerCase() : "Insights";
      
      const [article] = await db.insert(newsArticles).values({
        id: randomUUID(),
        slug,
        headline,
        executiveSummary: executiveSummary && executiveSummary.trim() ? executiveSummary : null,
        content,
        blogType: normalizedBlogType,
        capitalType: capitalType && capitalType.trim() ? capitalType : null,
        geography: geography && geography.trim() ? geography : null,
        tags: tags || [],
        status: status || "published",
        publishedAt: new Date(),
        wordCount: content.split(/\s+/).length,
        viewCount: 0,
        createdAt: new Date(),
      }).returning();
      
      res.json(article);
    } catch (error) {
      console.error("Create article error:", error);
      res.status(500).json({ message: "Failed to create article" });
    }
  });

  // Admin: Upload PDF report and create article
  app.post("/api/newsroom/upload-pdf", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const adminEmails = ["vc@philippemasindet.com", "masindetphilippe@gmail.com"];
    if (!req.user.isAdmin && !adminEmails.includes(req.user.email || "")) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      const { objectPath, filename } = req.body;
      
      if (!objectPath || !filename) {
        return res.status(400).json({ message: "Object path and filename are required" });
      }
      
      if (typeof objectPath !== "string" || !objectPath.startsWith("/objects/")) {
        return res.status(400).json({ message: "Invalid object path format" });
      }
      
      if (typeof filename !== "string" || !filename.toLowerCase().endsWith(".pdf")) {
        return res.status(400).json({ message: "Invalid filename - must be a PDF file" });
      }
      
      const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
      const { extractTextFromBuffer, getMimeTypeFromFilename } = await import("./services/documentExtractor");
      const { newsroomAIService } = await import("./services/mistral");
      const { newsArticles } = await import("@shared/schema");
      const { db } = await import("./db");
      const { randomUUID } = await import("crypto");
      
      if (!newsroomAIService.isConfigured()) {
        return res.status(503).json({ message: "AI service not configured. Please ensure MISTRAL_API_KEY is set." });
      }
      
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      
      const chunks: Buffer[] = [];
      const readable = objectFile.createReadStream();
      
      await new Promise<void>((resolve, reject) => {
        readable.on('data', (chunk: Buffer) => chunks.push(chunk));
        readable.on('end', () => {
          readable.destroy();
          resolve();
        });
        readable.on('error', (err: Error) => {
          readable.destroy();
          reject(err);
        });
      });
      
      const pdfBuffer = Buffer.concat(chunks);
      
      const mimeType = getMimeTypeFromFilename(filename);
      const extractedText = await extractTextFromBuffer(pdfBuffer, mimeType);
      
      if (!extractedText || extractedText.length < 100) {
        return res.status(400).json({ message: "Could not extract sufficient text from PDF" });
      }
      
      let analysis = await newsroomAIService.analyzePDFReport(extractedText, filename);
      
      if (!analysis) {
        const cleanFilename = filename.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
        const knownPublishers = ["jpmorgan", "jp morgan", "goldman sachs", "morgan stanley", "mckinsey", "pitchbook"];
        let publisher = "Industry Report";
        for (const pub of knownPublishers) {
          if (cleanFilename.toLowerCase().includes(pub)) {
            publisher = pub.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            break;
          }
        }
        
        analysis = {
          headline: cleanFilename.slice(0, 100),
          executiveSummary: "Investment research report analysis.",
          content: extractedText.substring(0, 5000),
          blogType: "Analysis",
          capitalType: "PE",
          capitalStage: "All Stages",
          geography: "Global",
          eventType: "Market Outlook",
          tags: ["Research", "Report"],
          sources: [{
            title: cleanFilename,
            url: "",
            publisher: publisher,
            date: new Date().toISOString().split('T')[0],
            citation: `${publisher}. (${new Date().getFullYear()}). ${cleanFilename}. Retrieved from uploaded document.`,
          }],
          wordCount: extractedText.split(/\s+/).length,
          tokensUsed: 0,
        };
      }
      
      const baseSlug = analysis.headline
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);
      
      const slug = baseSlug + '-' + Date.now();
      
      const [article] = await db.insert(newsArticles).values({
        id: randomUUID(),
        slug,
        headline: analysis.headline,
        executiveSummary: analysis.executiveSummary,
        content: analysis.content,
        blogType: analysis.blogType,
        capitalType: analysis.capitalType,
        capitalStage: analysis.capitalStage,
        geography: analysis.geography,
        eventType: analysis.eventType,
        tags: analysis.tags,
        sources: analysis.sources,
        sourceType: "pdf_upload",
        pdfObjectPath: objectPath,
        pdfFilename: filename,
        extractedText: extractedText.substring(0, 50000),
        wordCount: analysis.wordCount,
        status: "published",
        publishedAt: new Date(),
        author: "Anker Intelligence",
        aiModel: "mistral-large",
        createdAt: new Date(),
      }).returning();
      
      res.json({
        success: true,
        article,
        extractedTextLength: extractedText.length,
        tokensUsed: analysis.tokensUsed,
      });
    } catch (error) {
      console.error("PDF upload error:", error);
      res.status(500).json({ message: "Failed to process PDF upload" });
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

  // Admin: Get all source items (raw fetched content) with pagination
  app.get("/api/newsroom/source-items", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsSourceItems, newsSources } = await import("@shared/schema");
      const { db } = await import("./db");
      const { desc, eq, sql, count } = await import("drizzle-orm");
      
      const status = req.query.status as string || undefined;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const offset = (page - 1) * pageSize;
      
      // Get total count
      let countQuery = db.select({ total: count() }).from(newsSourceItems);
      if (status) {
        countQuery = countQuery.where(eq(newsSourceItems.validationStatus, status)) as any;
      }
      const [countResult] = await countQuery;
      const total = countResult?.total || 0;
      
      // Get paginated items
      let query = db.select({
        id: newsSourceItems.id,
        sourceId: newsSourceItems.sourceId,
        headline: newsSourceItems.headline,
        summary: newsSourceItems.summary,
        sourceUrl: newsSourceItems.sourceUrl,
        publishedAt: newsSourceItems.publishedAt,
        capitalType: newsSourceItems.capitalType,
        geography: newsSourceItems.geography,
        relevanceScore: newsSourceItems.relevanceScore,
        validationStatus: newsSourceItems.validationStatus,
        validationNotes: newsSourceItems.validationNotes,
        createdAt: newsSourceItems.createdAt,
      }).from(newsSourceItems);
      
      if (status) {
        query = query.where(eq(newsSourceItems.validationStatus, status)) as any;
      }
      
      const items = await query
        .orderBy(desc(newsSourceItems.createdAt))
        .limit(pageSize)
        .offset(offset);
      
      res.json({
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (error) {
      console.error("Failed to fetch source items:", error);
      res.status(500).json({ message: "Failed to fetch source items" });
    }
  });

  // Admin: Update source item validation status
  app.patch("/api/newsroom/source-items/:id/validate", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsSourceItems } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const { id } = req.params;
      const { status, notes } = req.body;
      
      await db.update(newsSourceItems)
        .set({ 
          validationStatus: status,
          validationNotes: notes || null,
          processedAt: new Date(),
        })
        .where(eq(newsSourceItems.id, id));
      
      res.json({ success: true, id, status });
    } catch (error) {
      res.status(500).json({ message: "Failed to update source item" });
    }
  });

  // Admin: Publish a source item directly as an article (no AI - direct publish)
  app.post("/api/newsroom/source-items/:id/publish", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsSourceItems, newsArticles, newsGenerationLogs } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const { id } = req.params;
      
      // Get the source item
      const [sourceItem] = await db.select()
        .from(newsSourceItems)
        .where(eq(newsSourceItems.id, id))
        .limit(1);
      
      if (!sourceItem) {
        return res.status(404).json({ message: "Source item not found" });
      }
      
      if (sourceItem.validationStatus !== "approved") {
        return res.status(400).json({ message: "Source item must be approved before publishing" });
      }
      
      const startTime = Date.now();
      
      // Generate slug from headline
      const generateSlug = (headline: string) => {
        return headline
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .substring(0, 60) + "-" + Date.now().toString(36);
      };
      
      // Map capital type to blog type
      const capitalTypeToBlogType: Record<string, string> = {
        "VC": "Insights",
        "PE": "Analysis",
        "M&A": "Analysis",
        "Growth": "Trends",
        "Seed": "Insights",
        "IPO": "Analysis",
        "Debt": "Guides",
      };
      
      // Create article directly from source item data
      const [newArticle] = await db.insert(newsArticles).values({
        slug: generateSlug(sourceItem.headline),
        headline: sourceItem.headline,
        executiveSummary: sourceItem.summary || sourceItem.headline,
        content: sourceItem.summary || sourceItem.headline,
        blogType: capitalTypeToBlogType[sourceItem.capitalType || "VC"] || "Insights",
        capitalType: sourceItem.capitalType || "VC",
        capitalStage: "All Stages",
        geography: sourceItem.geography || "Global",
        eventType: "News",
        tags: sourceItem.entities ? (sourceItem.entities as string[]).slice(0, 5) : [],
        sources: [{
          title: sourceItem.headline,
          url: sourceItem.sourceUrl,
          publisher: "News Source",
          date: sourceItem.publishedAt ? new Date(sourceItem.publishedAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
          citation: `${sourceItem.headline}. Retrieved from ${sourceItem.sourceUrl}`,
        }],
        confidenceScore: sourceItem.relevanceScore || 0.8,
        aiModel: "direct",
        generationTimeMs: 0,
        wordCount: (sourceItem.summary || "").split(/\s+/).length,
        status: "published",
        publishedAt: new Date(),
        sourceItemIds: [id],
      }).returning();
      
      // Mark source item as used
      await db.update(newsSourceItems)
        .set({ validationStatus: "used" })
        .where(eq(newsSourceItems.id, id));
      
      // Log the action
      await db.insert(newsGenerationLogs).values({
        articleId: newArticle.id,
        action: "direct_publish",
        status: "completed",
        details: {
          sourceItemId: id,
          headline: sourceItem.headline,
          wordCount: (sourceItem.summary || "").split(/\s+/).length,
          durationMs: Date.now() - startTime,
        },
      });
      
      res.json({
        success: true,
        articleId: newArticle.id,
        headline: newArticle.headline,
        slug: newArticle.slug,
      });
    } catch (error) {
      console.error("Failed to publish source item:", error);
      res.status(500).json({ message: "Failed to publish source item" });
    }
  });

  // Admin: Get scheduled posts
  app.get("/api/newsroom/scheduled-posts", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsScheduledPosts, newsArticles } = await import("@shared/schema");
      const { db } = await import("./db");
      const { desc, eq } = await import("drizzle-orm");
      
      const posts = await db.select().from(newsScheduledPosts).orderBy(desc(newsScheduledPosts.scheduledDate), desc(newsScheduledPosts.slot)).limit(50);
      
      const postsWithArticles = await Promise.all(posts.map(async (post) => {
        let articleHeadline = null;
        if (post.articleId) {
          const [article] = await db.select({ headline: newsArticles.headline })
            .from(newsArticles)
            .where(eq(newsArticles.id, post.articleId))
            .limit(1);
          articleHeadline = article?.headline;
        }
        return { ...post, articleHeadline };
      }));
      
      res.json(postsWithArticles);
    } catch (error) {
      console.error("Failed to fetch scheduled posts:", error);
      res.status(500).json({ message: "Failed to fetch scheduled posts" });
    }
  });

  // Admin: Delete/cancel a scheduled post
  app.delete("/api/newsroom/scheduled-posts/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsScheduledPosts } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const postId = req.params.id;
      await db.delete(newsScheduledPosts).where(eq(newsScheduledPosts.id, postId));
      
      res.json({ success: true, message: "Scheduled post cancelled" });
    } catch (error) {
      console.error("Failed to delete scheduled post:", error);
      res.status(500).json({ message: "Failed to delete scheduled post" });
    }
  });

  // Admin: Bulk delete old pending scheduled posts
  app.post("/api/newsroom/scheduled-posts/cleanup", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !(req.user as any).isAdmin) {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { newsScheduledPosts } = await import("@shared/schema");
      const { db } = await import("./db");
      const { and, lt, or, eq } = await import("drizzle-orm");
      
      const today = new Date().toISOString().split("T")[0];
      
      // Delete all pending/generating posts older than today
      const result = await db.delete(newsScheduledPosts)
        .where(and(
          lt(newsScheduledPosts.scheduledDate, today),
          or(
            eq(newsScheduledPosts.status, "pending"),
            eq(newsScheduledPosts.status, "generating")
          )
        ));
      
      res.json({ success: true, message: "Old scheduled posts cleaned up" });
    } catch (error) {
      console.error("Failed to cleanup scheduled posts:", error);
      res.status(500).json({ message: "Failed to cleanup scheduled posts" });
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

  // ── Checklist Sessions ────────────────────────────────────────────────────
  app.get("/api/checklists/:type", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { checklistSessions } = await import("../shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const { db } = await import("./db");
      const { startupId } = req.query;
      const conditions = [
        eq(checklistSessions.userId, req.user.id),
        eq(checklistSessions.type, req.params.type),
      ];
      if (startupId) conditions.push(eq(checklistSessions.startupId, startupId as string));
      const [session] = await db.select().from(checklistSessions).where(and(...conditions)).limit(1);
      res.json(session || { data: {} });
    } catch (error) {
      console.error("[Checklist] GET error:", error);
      res.status(500).json({ message: "Failed to load checklist" });
    }
  });

  app.put("/api/checklists/:type", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { checklistSessions } = await import("../shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const { db } = await import("./db");
      const { data, startupId } = req.body;
      const conditions = [
        eq(checklistSessions.userId, req.user.id),
        eq(checklistSessions.type, req.params.type),
      ];
      if (startupId) conditions.push(eq(checklistSessions.startupId, startupId));
      const [existing] = await db.select({ id: checklistSessions.id })
        .from(checklistSessions).where(and(...conditions)).limit(1);
      if (existing) {
        await db.update(checklistSessions)
          .set({ data, updatedAt: new Date() })
          .where(eq(checklistSessions.id, existing.id));
      } else {
        await db.insert(checklistSessions).values({
          userId: req.user.id,
          type: req.params.type,
          startupId: startupId || null,
          data,
        });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Checklist] PUT error:", error);
      res.status(500).json({ message: "Failed to save checklist" });
    }
  });

  // ─── Deal Flow Pipeline ──────────────────────────────────────────────────────

  app.get("/api/dealflow/prospects", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const mode = (req.query.mode as string) || "startup";
    try {
      const { db } = await import("./db");
      const { dealflowProspects } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const rows = await db.select().from(dealflowProspects)
        .where(and(eq(dealflowProspects.userId, req.user.id), eq(dealflowProspects.mode, mode)))
        .orderBy(dealflowProspects.createdAt);
      res.json(rows);
    } catch (e) {
      console.error("[Dealflow] GET error:", e);
      res.status(500).json({ message: "Failed to fetch prospects" });
    }
  });

  app.post("/api/dealflow/prospects", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { db } = await import("./db");
      const { dealflowProspects } = await import("@shared/schema");
      const { mode = "startup", ...rest } = req.body;
      if (!rest.name) return res.status(400).json({ message: "name is required" });
      const [row] = await db.insert(dealflowProspects).values({
        userId: req.user.id,
        mode,
        stage: rest.stage || (mode === "fund" ? "prospect" : "identified"),
        ...rest,
      }).returning();
      res.json(row);
    } catch (e) {
      console.error("[Dealflow] POST error:", e);
      res.status(500).json({ message: "Failed to create prospect" });
    }
  });

  app.patch("/api/dealflow/prospects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { db } = await import("./db");
      const { dealflowProspects } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const [row] = await db.update(dealflowProspects)
        .set({ ...req.body, lastActivity: new Date() })
        .where(and(eq(dealflowProspects.id, req.params.id), eq(dealflowProspects.userId, req.user.id)))
        .returning();
      if (!row) return res.status(404).json({ message: "Prospect not found" });
      res.json(row);
    } catch (e) {
      console.error("[Dealflow] PATCH error:", e);
      res.status(500).json({ message: "Failed to update prospect" });
    }
  });

  app.delete("/api/dealflow/prospects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { db } = await import("./db");
      const { dealflowProspects } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      await db.delete(dealflowProspects)
        .where(and(eq(dealflowProspects.id, req.params.id), eq(dealflowProspects.userId, req.user.id)));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete prospect" });
    }
  });

  // AI proxy for deal flow (uses Mistral — keeps API keys server-side)
  app.post("/api/dealflow/ai/fill", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { text, mode } = req.body;
    if (!text) return res.status(400).json({ message: "text required" });
    try {
      const Mistral = (await import("@mistralai/mistral")).Mistral;
      const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
      const prompt = `Extract structured data from this text about an ${mode === "fund" ? "LP / institutional investor" : "investment firm or VC"}. Return ONLY valid JSON with these fields (use null for missing): { "name": string, "website": string, "email": string, "geography": string, "lpType": string, "commitmentSize": string, "notes": string, "tags": string[] }\n\nText: ${text}`;
      const result = await client.chat.complete({ model: "mistral-large-latest", messages: [{ role: "user", content: prompt }] });
      const raw = result.choices?.[0]?.message?.content ?? "";
      const clean = (raw as string).replace(/```json|```/g, "").trim();
      res.json({ result: JSON.parse(clean) });
    } catch (e) {
      console.error("[Dealflow AI fill] error:", e);
      res.status(500).json({ message: "AI fill failed" });
    }
  });

  app.post("/api/dealflow/ai/memo", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { prospect, memoType, mode } = req.body;
    if (!prospect) return res.status(400).json({ message: "prospect required" });
    try {
      const Mistral = (await import("@mistralai/mistral")).Mistral;
      const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
      const prompt = `Generate a professional ${memoType?.replace(/_/g, " ")} for an ${mode === "fund" ? "LP prospect" : "investment opportunity"}.\n\nName: ${prospect.name}\nType: ${prospect.lpType ?? prospect.firmType ?? "N/A"}\nSize: ${prospect.commitmentSize ?? prospect.checkSize ?? "N/A"}\nGeography: ${prospect.geography ?? "N/A"}\nNotes: ${prospect.notes ?? "None"}\n\nFormat as markdown with sections: ## Overview, ## Key Points, ## Rationale, ## Next Steps. Be concise and professional (300-400 words).`;
      const result = await client.chat.complete({ model: "mistral-large-latest", messages: [{ role: "user", content: prompt }] });
      res.json({ content: result.choices?.[0]?.message?.content ?? "" });
    } catch (e) {
      console.error("[Dealflow AI memo] error:", e);
      res.status(500).json({ message: "Memo generation failed" });
    }
  });

  app.post("/api/dealflow/ai/email", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { recipients, template, mode } = req.body;
    if (!recipients) return res.status(400).json({ message: "recipients required" });
    try {
      const Mistral = (await import("@mistralai/mistral")).Mistral;
      const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
      const prompt = `Write a professional ${template?.replace(/_/g, " ")} email for a ${mode === "fund" ? "fund manager reaching out to LP prospects" : "startup founder reaching out to investors"}.\n\nRecipients: ${recipients}\n\nKeep it concise (3-4 paragraphs), warm and action-oriented. Include a clear CTA. Start with "Subject: ..." then a blank line, then the email body. No placeholders.`;
      const result = await client.chat.complete({ model: "mistral-large-latest", messages: [{ role: "user", content: prompt }] });
      res.json({ content: result.choices?.[0]?.message?.content ?? "" });
    } catch (e) {
      console.error("[Dealflow AI email] error:", e);
      res.status(500).json({ message: "Email draft failed" });
    }
  });

  return httpServer;
}
