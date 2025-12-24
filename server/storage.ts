import { db } from "./db";
import { eq, and, ilike, or, desc } from "drizzle-orm";
import {
  messages,
  subscribers,
  startups,
  investors,
  investmentFirms,
  contacts,
  deals,
  type InsertMessage,
  type Message,
  type InsertSubscriber,
  type Subscriber,
  type InsertStartup,
  type Startup,
  type InsertInvestor,
  type Investor,
  type InsertInvestmentFirm,
  type InvestmentFirm,
  type InsertContact,
  type Contact,
  type InsertDeal,
  type Deal
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
  // Investors
  getInvestors(): Promise<Investor[]>;
  getInvestorById(id: string): Promise<Investor | undefined>;
  createInvestor(investor: InsertInvestor): Promise<Investor>;
  updateInvestor(id: string, data: Partial<InsertInvestor>): Promise<Investor | undefined>;
  deleteInvestor(id: string): Promise<boolean>;
  // Investment Firms
  getInvestmentFirms(): Promise<InvestmentFirm[]>;
  getInvestmentFirmById(id: string): Promise<InvestmentFirm | undefined>;
  createInvestmentFirm(firm: InsertInvestmentFirm): Promise<InvestmentFirm>;
  updateInvestmentFirm(id: string, data: Partial<InsertInvestmentFirm>): Promise<InvestmentFirm | undefined>;
  deleteInvestmentFirm(id: string): Promise<boolean>;
  // Contacts
  getContactsByOwner(ownerId: string): Promise<Contact[]>;
  getContactById(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;
  // Deals
  getDealsByOwner(ownerId: string): Promise<Deal[]>;
  getDealById(id: string): Promise<Deal | undefined>;
  createDeal(deal: InsertDeal): Promise<Deal>;
  updateDeal(id: string, data: Partial<InsertDeal>): Promise<Deal | undefined>;
  deleteDeal(id: string): Promise<boolean>;
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
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(startups)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof startups.$inferInsert>)
      .where(eq(startups.id, id))
      .returning();
    return updated;
  }

  async deleteStartup(id: string): Promise<boolean> {
    const result = await db.delete(startups).where(eq(startups.id, id));
    return true;
  }

  // Investors
  async getInvestors(): Promise<Investor[]> {
    return db.select().from(investors).where(eq(investors.isActive, true));
  }

  async getInvestorById(id: string): Promise<Investor | undefined> {
    const [investor] = await db.select().from(investors).where(eq(investors.id, id));
    return investor;
  }

  async createInvestor(investor: InsertInvestor): Promise<Investor> {
    const [newInvestor] = await db
      .insert(investors)
      .values(investor as typeof investors.$inferInsert)
      .returning();
    return newInvestor;
  }

  async updateInvestor(id: string, data: Partial<InsertInvestor>): Promise<Investor | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(investors)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof investors.$inferInsert>)
      .where(eq(investors.id, id))
      .returning();
    return updated;
  }

  async deleteInvestor(id: string): Promise<boolean> {
    await db.delete(investors).where(eq(investors.id, id));
    return true;
  }

  // Investment Firms
  async getInvestmentFirms(): Promise<InvestmentFirm[]> {
    return db.select().from(investmentFirms);
  }

  async getInvestmentFirmById(id: string): Promise<InvestmentFirm | undefined> {
    const [firm] = await db.select().from(investmentFirms).where(eq(investmentFirms.id, id));
    return firm;
  }

  async createInvestmentFirm(firm: InsertInvestmentFirm): Promise<InvestmentFirm> {
    const [newFirm] = await db
      .insert(investmentFirms)
      .values(firm as typeof investmentFirms.$inferInsert)
      .returning();
    return newFirm;
  }

  async updateInvestmentFirm(id: string, data: Partial<InsertInvestmentFirm>): Promise<InvestmentFirm | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(investmentFirms)
      .set(cleanData as Partial<typeof investmentFirms.$inferInsert>)
      .where(eq(investmentFirms.id, id))
      .returning();
    return updated;
  }

  async deleteInvestmentFirm(id: string): Promise<boolean> {
    await db.delete(investmentFirms).where(eq(investmentFirms.id, id));
    return true;
  }

  // Contacts
  async getContactsByOwner(ownerId: string): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.ownerId, ownerId));
  }

  async getContactById(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db
      .insert(contacts)
      .values(contact as typeof contacts.$inferInsert)
      .returning();
    return newContact;
  }

  async updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }
    const [updated] = await db
      .update(contacts)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof contacts.$inferInsert>)
      .where(eq(contacts.id, id))
      .returning();
    return updated;
  }

  async deleteContact(id: string): Promise<boolean> {
    await db.delete(contacts).where(eq(contacts.id, id));
    return true;
  }

  // Deals
  async getDealsByOwner(ownerId: string): Promise<Deal[]> {
    return db.select().from(deals).where(eq(deals.ownerId, ownerId)).orderBy(desc(deals.updatedAt));
  }

  async getDealById(id: string): Promise<Deal | undefined> {
    const [deal] = await db.select().from(deals).where(eq(deals.id, id));
    return deal;
  }

  async createDeal(deal: InsertDeal): Promise<Deal> {
    const [newDeal] = await db
      .insert(deals)
      .values(deal as typeof deals.$inferInsert)
      .returning();
    return newDeal;
  }

  async updateDeal(id: string, data: Partial<InsertDeal>): Promise<Deal | undefined> {
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }
    const [updated] = await db
      .update(deals)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof deals.$inferInsert>)
      .where(eq(deals.id, id))
      .returning();
    return updated;
  }

  async deleteDeal(id: string): Promise<boolean> {
    await db.delete(deals).where(eq(deals.id, id));
    return true;
  }
}

export const storage = new DatabaseStorage();
