import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication first
  await setupAuth(app);
  registerAuthRoutes(app);

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

  return httpServer;
}
