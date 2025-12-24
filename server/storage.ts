import { db } from "./db";
import { eq, and } from "drizzle-orm";
import {
  messages,
  subscribers,
  startups,
  type InsertMessage,
  type Message,
  type InsertSubscriber,
  type Subscriber,
  type InsertStartup,
  type Startup
} from "@shared/schema";

export interface IStorage {
  createMessage(message: InsertMessage): Promise<Message>;
  createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber>;
  // Startups
  getStartups(): Promise<Startup[]>;
  getStartupsByFounder(founderId: string): Promise<Startup[]>;
  getStartupById(id: string): Promise<Startup | undefined>;
  createStartup(startup: InsertStartup): Promise<Startup>;
  updateStartup(id: string, data: Partial<InsertStartup>): Promise<Startup | undefined>;
  deleteStartup(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values(message)
      .returning();
    return newMessage;
  }

  async createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber> {
    const [newSubscriber] = await db
      .insert(subscribers)
      .values(subscriber)
      .returning();
    return newSubscriber;
  }

  async getStartups(): Promise<Startup[]> {
    return db.select().from(startups).where(eq(startups.isPublic, true));
  }

  async getStartupsByFounder(founderId: string): Promise<Startup[]> {
    return db.select().from(startups).where(eq(startups.founderId, founderId));
  }

  async getStartupById(id: string): Promise<Startup | undefined> {
    const [startup] = await db.select().from(startups).where(eq(startups.id, id));
    return startup;
  }

  async createStartup(startup: InsertStartup): Promise<Startup> {
    const [newStartup] = await db
      .insert(startups)
      .values(startup as typeof startups.$inferInsert)
      .returning();
    return newStartup;
  }

  async updateStartup(id: string, data: Partial<InsertStartup>): Promise<Startup | undefined> {
    const [updated] = await db
      .update(startups)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof startups.$inferInsert>)
      .where(eq(startups.id, id))
      .returning();
    return updated;
  }

  async deleteStartup(id: string): Promise<boolean> {
    const result = await db.delete(startups).where(eq(startups.id, id));
    return true;
  }
}

export const storage = new DatabaseStorage();
