import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth } from "./replit_integrations/auth";
import { registerAdminRoutes } from "./admin-routes";
import { registerSimpleAuthRoutes, setupSimpleAuthSession } from "./simple-auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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

  // Investors API routes (public read, admin write)
  app.get(api.investors.list.path, async (req, res) => {
    const investors = await storage.getInvestors();
    res.json(investors);
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
    const firms = await storage.getInvestmentFirms();
    res.json(firms);
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

  return httpServer;
}
