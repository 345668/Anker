import { db } from "./db";
import { eq, and, ilike, or, desc, sql } from "drizzle-orm";
import {
  messages,
  subscribers,
  startups,
  startupDocuments,
  investors,
  investmentFirms,
  businessmen,
  contacts,
  deals,
  dealRooms,
  dealRoomDocuments,
  dealRoomNotes,
  dealRoomMilestones,
  pitchDeckAnalyses,
  folkWorkspaces,
  folkImportRuns,
  folkFailedRecords,
  folkFieldDefinitions,
  folkFieldMappings,
  investorCompanyLinks,
  potentialDuplicates,
  enrichmentJobs,
  emailTemplates,
  outreaches,
  matches,
  interactionLogs,
  notifications,
  introductions,
  type InsertMessage,
  type Message,
  type InsertSubscriber,
  type Subscriber,
  type InsertStartup,
  type Startup,
  type InsertStartupDocument,
  type StartupDocument,
  type InsertInvestor,
  type Investor,
  type InsertInvestmentFirm,
  type InvestmentFirm,
  type InsertBusinessman,
  type Businessman,
  type InsertContact,
  type Contact,
  type InsertDeal,
  type Deal,
  type InsertDealRoom,
  type DealRoom,
  type InsertDealRoomDocument,
  type DealRoomDocument,
  type InsertDealRoomNote,
  type DealRoomNote,
  type InsertDealRoomMilestone,
  type DealRoomMilestone,
  type InsertPitchDeckAnalysis,
  type PitchDeckAnalysis,
  type InsertFolkWorkspace,
  type FolkWorkspace,
  type InsertFolkImportRun,
  type FolkImportRun,
  type InsertFolkFailedRecord,
  type FolkFailedRecord,
  type InsertFolkFieldDefinition,
  type FolkFieldDefinition,
  type InsertFolkFieldMapping,
  type FolkFieldMapping,
  type InsertInvestorCompanyLink,
  type InvestorCompanyLink,
  type InsertPotentialDuplicate,
  type PotentialDuplicate,
  type InsertEnrichmentJob,
  type EnrichmentJob,
  type InsertEmailTemplate,
  type EmailTemplate,
  type InsertOutreach,
  type Outreach,
  type InsertMatch,
  type Match,
  type InsertInteractionLog,
  type InteractionLog,
  type InsertNotification,
  type Notification,
  type InsertIntroduction,
  type Introduction,
  type InsertCalendarMeeting,
  type CalendarMeeting,
  calendarMeetings,
  type InsertUserEmailSettings,
  type UserEmailSettings,
  userEmailSettings,
  activityLogs,
  type InsertActivityLog,
  type ActivityLog
} from "@shared/schema";

export interface IStorage {
  createMessage(message: InsertMessage): Promise<Message>;
  createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber>;
  // Startups
  getStartups(limit?: number, offset?: number, search?: string): Promise<{ data: Startup[], total: number }>;
  getStartupsByFounder(founderId: string): Promise<Startup[]>;
  getStartupById(id: string): Promise<Startup | undefined>;
  createStartup(startup: InsertStartup): Promise<Startup>;
  updateStartup(id: string, data: Partial<InsertStartup>): Promise<Startup | undefined>;
  deleteStartup(id: string): Promise<boolean>;
  // Startup Documents
  getStartupDocuments(startupId: string): Promise<StartupDocument[]>;
  getStartupDocumentById(id: string): Promise<StartupDocument | undefined>;
  createStartupDocument(doc: InsertStartupDocument): Promise<StartupDocument>;
  updateStartupDocument(id: string, data: Partial<InsertStartupDocument>): Promise<StartupDocument | undefined>;
  deleteStartupDocument(id: string): Promise<boolean>;
  getStartupProfile(startupId: string): Promise<{ startup: Startup; documents: StartupDocument[] } | undefined>;
  // Investors
  getInvestors(limit?: number, offset?: number, search?: string): Promise<{ data: Investor[], total: number }>;
  getInvestorById(id: string): Promise<Investor | undefined>;
  createInvestor(investor: InsertInvestor): Promise<Investor>;
  updateInvestor(id: string, data: Partial<InsertInvestor>): Promise<Investor | undefined>;
  deleteInvestor(id: string): Promise<boolean>;
  // Investment Firms
  getInvestmentFirms(limit?: number, offset?: number, search?: string, classification?: string): Promise<{ data: InvestmentFirm[], total: number }>;
  getInvestmentFirmById(id: string): Promise<InvestmentFirm | undefined>;
  createInvestmentFirm(firm: InsertInvestmentFirm): Promise<InvestmentFirm>;
  updateInvestmentFirm(id: string, data: Partial<InsertInvestmentFirm>): Promise<InvestmentFirm | undefined>;
  deleteInvestmentFirm(id: string): Promise<boolean>;
  // Businessmen
  getBusinessmen(limit?: number, offset?: number, search?: string): Promise<{ data: Businessman[], total: number }>;
  getBusinessmanById(id: string): Promise<Businessman | undefined>;
  getBusinessmanByFolkId(folkId: string): Promise<Businessman | undefined>;
  createBusinessman(businessman: InsertBusinessman): Promise<Businessman>;
  updateBusinessman(id: string, data: Partial<InsertBusinessman>): Promise<Businessman | undefined>;
  deleteBusinessman(id: string): Promise<boolean>;
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
  // Deal Rooms
  getDealRoomsByOwner(ownerId: string): Promise<DealRoom[]>;
  getDealRoomsByDeal(dealId: string): Promise<DealRoom[]>;
  getDealRoomByStartupId(startupId: string): Promise<DealRoom | undefined>;
  getDealRoomById(id: string): Promise<DealRoom | undefined>;
  createDealRoom(room: InsertDealRoom): Promise<DealRoom>;
  updateDealRoom(id: string, data: Partial<InsertDealRoom>): Promise<DealRoom | undefined>;
  deleteDealRoom(id: string): Promise<boolean>;
  // Deal Room Documents
  getDocumentsByRoom(roomId: string): Promise<DealRoomDocument[]>;
  getDocumentById(id: string): Promise<DealRoomDocument | undefined>;
  createDocument(doc: InsertDealRoomDocument): Promise<DealRoomDocument>;
  updateDocument(id: string, data: Partial<InsertDealRoomDocument>): Promise<DealRoomDocument | undefined>;
  deleteDocument(id: string): Promise<boolean>;
  // Deal Room Notes
  getNotesByRoom(roomId: string): Promise<DealRoomNote[]>;
  getNoteById(id: string): Promise<DealRoomNote | undefined>;
  createNote(note: InsertDealRoomNote): Promise<DealRoomNote>;
  updateNote(id: string, data: Partial<InsertDealRoomNote>): Promise<DealRoomNote | undefined>;
  deleteNote(id: string): Promise<boolean>;
  // Deal Room Milestones
  getMilestonesByRoom(roomId: string): Promise<DealRoomMilestone[]>;
  getMilestoneById(id: string): Promise<DealRoomMilestone | undefined>;
  createMilestone(milestone: InsertDealRoomMilestone): Promise<DealRoomMilestone>;
  updateMilestone(id: string, data: Partial<InsertDealRoomMilestone>): Promise<DealRoomMilestone | undefined>;
  deleteMilestone(id: string): Promise<boolean>;
  // Folk Workspaces
  getFolkWorkspaces(): Promise<FolkWorkspace[]>;
  getFolkWorkspaceById(id: string): Promise<FolkWorkspace | undefined>;
  getFolkWorkspaceByWorkspaceId(workspaceId: string): Promise<FolkWorkspace | undefined>;
  createFolkWorkspace(workspace: InsertFolkWorkspace): Promise<FolkWorkspace>;
  updateFolkWorkspace(id: string, data: Partial<InsertFolkWorkspace>): Promise<FolkWorkspace | undefined>;
  deleteFolkWorkspace(id: string): Promise<boolean>;
  // Folk Import Runs
  getFolkImportRuns(workspaceId?: string): Promise<FolkImportRun[]>;
  getFolkImportRunById(id: string): Promise<FolkImportRun | undefined>;
  createFolkImportRun(run: InsertFolkImportRun): Promise<FolkImportRun>;
  updateFolkImportRun(id: string, data: Partial<InsertFolkImportRun>): Promise<FolkImportRun | undefined>;
  // Folk Failed Records
  getFolkFailedRecords(runId: string): Promise<FolkFailedRecord[]>;
  getUnresolvedFolkFailedRecords(): Promise<FolkFailedRecord[]>;
  createFolkFailedRecord(record: InsertFolkFailedRecord): Promise<FolkFailedRecord>;
  updateFolkFailedRecord(id: string, data: Partial<InsertFolkFailedRecord>): Promise<FolkFailedRecord | undefined>;
  deleteFolkFailedRecord(id: string): Promise<boolean>;
  // Folk Field Definitions
  getFolkFieldDefinitions(groupId: string): Promise<FolkFieldDefinition[]>;
  getFolkFieldDefinitionByKey(groupId: string, fieldKey: string): Promise<FolkFieldDefinition | undefined>;
  createFolkFieldDefinition(definition: InsertFolkFieldDefinition): Promise<FolkFieldDefinition>;
  updateFolkFieldDefinition(id: string, data: Partial<InsertFolkFieldDefinition>): Promise<FolkFieldDefinition | undefined>;
  upsertFolkFieldDefinition(definition: InsertFolkFieldDefinition): Promise<FolkFieldDefinition>;
  // Folk Field Mappings
  getFolkFieldMappings(groupId: string): Promise<FolkFieldMapping[]>;
  getFolkFieldMappingByKey(groupId: string, folkFieldKey: string): Promise<FolkFieldMapping | undefined>;
  createFolkFieldMapping(mapping: InsertFolkFieldMapping): Promise<FolkFieldMapping>;
  updateFolkFieldMapping(id: string, data: Partial<InsertFolkFieldMapping>): Promise<FolkFieldMapping | undefined>;
  deleteFolkFieldMapping(id: string): Promise<boolean>;
  // Investor-Company Links
  getInvestorCompanyLinks(investorId?: string, companyId?: string): Promise<InvestorCompanyLink[]>;
  createInvestorCompanyLink(link: InsertInvestorCompanyLink): Promise<InvestorCompanyLink>;
  updateInvestorCompanyLink(id: string, data: Partial<InsertInvestorCompanyLink>): Promise<InvestorCompanyLink | undefined>;
  deleteInvestorCompanyLink(id: string): Promise<boolean>;
  // Investor by Folk ID
  getInvestorByFolkId(folkId: string): Promise<Investor | undefined>;
  getInvestmentFirmByFolkId(folkId: string): Promise<InvestmentFirm | undefined>;
  findInvestmentFirmByName(name: string): Promise<InvestmentFirm | undefined>;
  // Potential Duplicates
  getPotentialDuplicates(entityType?: string, status?: string): Promise<PotentialDuplicate[]>;
  getPotentialDuplicateById(id: string): Promise<PotentialDuplicate | undefined>;
  createPotentialDuplicate(duplicate: InsertPotentialDuplicate): Promise<PotentialDuplicate>;
  updatePotentialDuplicate(id: string, data: Partial<InsertPotentialDuplicate>): Promise<PotentialDuplicate | undefined>;
  deletePotentialDuplicate(id: string): Promise<boolean>;
  // Enrichment Jobs
  getEnrichmentJobs(entityType?: string, status?: string): Promise<EnrichmentJob[]>;
  getEnrichmentJobById(id: string): Promise<EnrichmentJob | undefined>;
  getEnrichmentJobsByEntity(entityType: string, entityId: string): Promise<EnrichmentJob[]>;
  createEnrichmentJob(job: InsertEnrichmentJob): Promise<EnrichmentJob>;
  updateEnrichmentJob(id: string, data: Partial<InsertEnrichmentJob>): Promise<EnrichmentJob | undefined>;
  // Email Templates
  getEmailTemplates(ownerId?: string): Promise<EmailTemplate[]>;
  getEmailTemplateById(id: string): Promise<EmailTemplate | undefined>;
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  updateEmailTemplate(id: string, data: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined>;
  deleteEmailTemplate(id: string): Promise<boolean>;
  // Outreaches
  getOutreaches(ownerId?: string, startupId?: string): Promise<Outreach[]>;
  getOutreachById(id: string): Promise<Outreach | undefined>;
  createOutreach(outreach: InsertOutreach): Promise<Outreach>;
  updateOutreach(id: string, data: Partial<InsertOutreach>): Promise<Outreach | undefined>;
  deleteOutreach(id: string): Promise<boolean>;
  // Matches
  getMatches(startupId?: string): Promise<Match[]>;
  getMatchById(id: string): Promise<Match | undefined>;
  createMatch(match: InsertMatch): Promise<Match>;
  updateMatch(id: string, data: Partial<InsertMatch>): Promise<Match | undefined>;
  deleteMatch(id: string): Promise<boolean>;
  // Interaction Logs
  getInteractionLogs(outreachId?: string, startupId?: string): Promise<InteractionLog[]>;
  createInteractionLog(log: InsertInteractionLog): Promise<InteractionLog>;
  // Notifications
  getNotificationsByUser(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<boolean>;
  deleteNotification(id: string): Promise<boolean>;
  // Calendar Meetings
  getCalendarMeetingsByUser(userId: string): Promise<CalendarMeeting[]>;
  getCalendarMeetingById(id: string): Promise<CalendarMeeting | undefined>;
  createCalendarMeeting(meeting: InsertCalendarMeeting): Promise<CalendarMeeting>;
  updateCalendarMeeting(id: string, data: Partial<InsertCalendarMeeting>): Promise<CalendarMeeting | undefined>;
  deleteCalendarMeeting(id: string): Promise<boolean>;
  // User Email Settings
  getUserEmailSettings(userId: string): Promise<UserEmailSettings | undefined>;
  upsertUserEmailSettings(settings: InsertUserEmailSettings): Promise<UserEmailSettings>;
  // Activity Logs
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogs(userId?: string, entityType?: string, limit?: number): Promise<ActivityLog[]>;
  // Contact lookup for auto-creation
  getContactByInvestorId(ownerId: string, investorId: string): Promise<Contact | undefined>;
  getContactByFirmId(ownerId: string, firmId: string): Promise<Contact | undefined>;
  // Introductions (N-I2: Warm Introduction Workflow)
  getIntroductions(requesterId: string): Promise<Introduction[]>;
  getIntroductionById(id: string): Promise<Introduction | undefined>;
  createIntroduction(intro: InsertIntroduction): Promise<Introduction>;
  updateIntroduction(id: string, data: Partial<InsertIntroduction>): Promise<Introduction | undefined>;
  deleteIntroduction(id: string): Promise<boolean>;
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

  async getStartups(limit?: number, offset?: number, search?: string): Promise<{ data: Startup[], total: number }> {
    let whereClause = eq(startups.isPublic, true);
    
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      whereClause = and(
        eq(startups.isPublic, true),
        or(
          ilike(startups.name, searchPattern),
          ilike(startups.tagline, searchPattern),
          ilike(startups.description, searchPattern),
          ilike(startups.location, searchPattern)
        )
      ) as any;
    }
    
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(startups).where(whereClause);
    const total = countResult?.count || 0;
    
    let query = db.select().from(startups).where(whereClause);
    if (limit !== undefined) {
      query = query.limit(limit) as typeof query;
    }
    if (offset !== undefined) {
      query = query.offset(offset) as typeof query;
    }
    
    const data = await query;
    return { data, total };
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

  // Startup Documents
  async getStartupDocuments(startupId: string): Promise<StartupDocument[]> {
    return await db.select().from(startupDocuments).where(eq(startupDocuments.startupId, startupId)).orderBy(desc(startupDocuments.uploadedAt));
  }

  async getStartupDocumentById(id: string): Promise<StartupDocument | undefined> {
    const result = await db.select().from(startupDocuments).where(eq(startupDocuments.id, id));
    return result[0];
  }

  async createStartupDocument(doc: InsertStartupDocument): Promise<StartupDocument> {
    const result = await db.insert(startupDocuments).values(doc as any).returning();
    return result[0];
  }

  async updateStartupDocument(id: string, data: Partial<InsertStartupDocument>): Promise<StartupDocument | undefined> {
    const result = await db.update(startupDocuments).set(data as any).where(eq(startupDocuments.id, id)).returning();
    return result[0];
  }

  async deleteStartupDocument(id: string): Promise<boolean> {
    await db.delete(startupDocuments).where(eq(startupDocuments.id, id));
    return true;
  }

  async getStartupProfile(startupId: string): Promise<{ startup: Startup; documents: StartupDocument[] } | undefined> {
    const startup = await this.getStartupById(startupId);
    if (!startup) return undefined;
    const documents = await this.getStartupDocuments(startupId);
    return { startup, documents };
  }

  // Investors
  async getInvestors(limit: number = 100, offset: number = 0, search?: string): Promise<{ data: Investor[], total: number }> {
    let whereClause = eq(investors.isActive, true);
    
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      whereClause = and(
        eq(investors.isActive, true),
        or(
          ilike(investors.firstName, searchPattern),
          ilike(investors.lastName, searchPattern),
          ilike(investors.title, searchPattern),
          ilike(investors.email, searchPattern),
          ilike(investors.bio, searchPattern),
          ilike(investors.location, searchPattern)
        )
      ) as any;
    }
    
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(investors).where(whereClause);
    const data = await db.select().from(investors).where(whereClause).limit(limit).offset(offset);
    return { data, total: Number(countResult?.count || 0) };
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
  async getInvestmentFirms(limit: number = 100, offset: number = 0, search?: string, classification?: string): Promise<{ data: InvestmentFirm[], total: number }> {
    const conditions: any[] = [];
    
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(investmentFirms.name, searchPattern),
          ilike(investmentFirms.description, searchPattern),
          ilike(investmentFirms.hqLocation, searchPattern),
          ilike(investmentFirms.location, searchPattern),
          ilike(investmentFirms.industry, searchPattern),
          ilike(investmentFirms.type, searchPattern)
        )
      );
    }
    
    if (classification && classification !== "All" && classification !== "Unclassified") {
      conditions.push(eq(investmentFirms.firmClassification, classification));
    } else if (classification === "Unclassified") {
      conditions.push(sql`${investmentFirms.firmClassification} IS NULL`);
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [countResult] = whereClause 
      ? await db.select({ count: sql<number>`count(*)` }).from(investmentFirms).where(whereClause)
      : await db.select({ count: sql<number>`count(*)` }).from(investmentFirms);
    
    const data = whereClause
      ? await db.select().from(investmentFirms).where(whereClause).limit(limit).offset(offset)
      : await db.select().from(investmentFirms).limit(limit).offset(offset);
    
    return { data, total: Number(countResult?.count || 0) };
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

  // Businessmen
  async getBusinessmen(limit?: number, offset?: number, search?: string): Promise<{ data: Businessman[], total: number }> {
    let whereClause = eq(businessmen.isActive, true);
    
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      whereClause = and(
        eq(businessmen.isActive, true),
        or(
          ilike(businessmen.firstName, searchPattern),
          ilike(businessmen.lastName, searchPattern),
          ilike(businessmen.company, searchPattern),
          ilike(businessmen.title, searchPattern),
          ilike(businessmen.industry, searchPattern),
          ilike(businessmen.location, searchPattern),
          ilike(businessmen.bio, searchPattern),
          ilike(businessmen.familyName, searchPattern)
        )
      ) as any;
    }
    
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(businessmen).where(whereClause);
    const total = countResult?.count || 0;
    
    let query = db.select().from(businessmen).where(whereClause);
    if (limit !== undefined) {
      query = query.limit(limit) as typeof query;
    }
    if (offset !== undefined) {
      query = query.offset(offset) as typeof query;
    }
    
    const data = await query;
    return { data, total };
  }

  async getBusinessmanById(id: string): Promise<Businessman | undefined> {
    const [businessman] = await db.select().from(businessmen).where(eq(businessmen.id, id));
    return businessman;
  }

  async getBusinessmanByFolkId(folkId: string): Promise<Businessman | undefined> {
    const [businessman] = await db.select().from(businessmen).where(eq(businessmen.folkId, folkId));
    return businessman;
  }

  async createBusinessman(businessman: InsertBusinessman): Promise<Businessman> {
    const [newBusinessman] = await db
      .insert(businessmen)
      .values(businessman as typeof businessmen.$inferInsert)
      .returning();
    return newBusinessman;
  }

  async updateBusinessman(id: string, data: Partial<InsertBusinessman>): Promise<Businessman | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(businessmen)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof businessmen.$inferInsert>)
      .where(eq(businessmen.id, id))
      .returning();
    return updated;
  }

  async deleteBusinessman(id: string): Promise<boolean> {
    await db.delete(businessmen).where(eq(businessmen.id, id));
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

  // Deal Rooms
  async getDealRoomsByOwner(ownerId: string): Promise<DealRoom[]> {
    return db.select().from(dealRooms).where(eq(dealRooms.ownerId, ownerId)).orderBy(desc(dealRooms.updatedAt));
  }

  async getDealRoomsByDeal(dealId: string): Promise<DealRoom[]> {
    return db.select().from(dealRooms).where(eq(dealRooms.dealId, dealId));
  }

  async getDealRoomByStartupId(startupId: string): Promise<DealRoom | undefined> {
    const [room] = await db.select().from(dealRooms).where(eq(dealRooms.startupId, startupId));
    return room;
  }

  async getDealRoomById(id: string): Promise<DealRoom | undefined> {
    const [room] = await db.select().from(dealRooms).where(eq(dealRooms.id, id));
    return room;
  }

  async createDealRoom(room: InsertDealRoom): Promise<DealRoom> {
    const [newRoom] = await db
      .insert(dealRooms)
      .values(room as typeof dealRooms.$inferInsert)
      .returning();
    return newRoom;
  }

  async updateDealRoom(id: string, data: Partial<InsertDealRoom>): Promise<DealRoom | undefined> {
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }
    const [updated] = await db
      .update(dealRooms)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof dealRooms.$inferInsert>)
      .where(eq(dealRooms.id, id))
      .returning();
    return updated;
  }

  async deleteDealRoom(id: string): Promise<boolean> {
    await db.delete(dealRooms).where(eq(dealRooms.id, id));
    return true;
  }

  // Deal Room Documents
  async getDocumentsByRoom(roomId: string): Promise<DealRoomDocument[]> {
    return db.select().from(dealRoomDocuments).where(eq(dealRoomDocuments.roomId, roomId)).orderBy(desc(dealRoomDocuments.createdAt));
  }

  async getDocumentById(id: string): Promise<DealRoomDocument | undefined> {
    const [doc] = await db.select().from(dealRoomDocuments).where(eq(dealRoomDocuments.id, id));
    return doc;
  }

  async createDocument(doc: InsertDealRoomDocument): Promise<DealRoomDocument> {
    const [newDoc] = await db
      .insert(dealRoomDocuments)
      .values(doc as typeof dealRoomDocuments.$inferInsert)
      .returning();
    return newDoc;
  }

  async updateDocument(id: string, data: Partial<InsertDealRoomDocument>): Promise<DealRoomDocument | undefined> {
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }
    const [updated] = await db
      .update(dealRoomDocuments)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof dealRoomDocuments.$inferInsert>)
      .where(eq(dealRoomDocuments.id, id))
      .returning();
    return updated;
  }

  async deleteDocument(id: string): Promise<boolean> {
    await db.delete(dealRoomDocuments).where(eq(dealRoomDocuments.id, id));
    return true;
  }

  // Deal Room Notes
  async getNotesByRoom(roomId: string): Promise<DealRoomNote[]> {
    return db.select().from(dealRoomNotes).where(eq(dealRoomNotes.roomId, roomId)).orderBy(desc(dealRoomNotes.createdAt));
  }

  async getNoteById(id: string): Promise<DealRoomNote | undefined> {
    const [note] = await db.select().from(dealRoomNotes).where(eq(dealRoomNotes.id, id));
    return note;
  }

  async createNote(note: InsertDealRoomNote): Promise<DealRoomNote> {
    const [newNote] = await db
      .insert(dealRoomNotes)
      .values(note as typeof dealRoomNotes.$inferInsert)
      .returning();
    return newNote;
  }

  async updateNote(id: string, data: Partial<InsertDealRoomNote>): Promise<DealRoomNote | undefined> {
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }
    const [updated] = await db
      .update(dealRoomNotes)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof dealRoomNotes.$inferInsert>)
      .where(eq(dealRoomNotes.id, id))
      .returning();
    return updated;
  }

  async deleteNote(id: string): Promise<boolean> {
    await db.delete(dealRoomNotes).where(eq(dealRoomNotes.id, id));
    return true;
  }

  // Deal Room Milestones
  async getMilestonesByRoom(roomId: string): Promise<DealRoomMilestone[]> {
    return db.select().from(dealRoomMilestones).where(eq(dealRoomMilestones.roomId, roomId)).orderBy(dealRoomMilestones.order);
  }

  async getMilestoneById(id: string): Promise<DealRoomMilestone | undefined> {
    const [milestone] = await db.select().from(dealRoomMilestones).where(eq(dealRoomMilestones.id, id));
    return milestone;
  }

  async createMilestone(milestone: InsertDealRoomMilestone): Promise<DealRoomMilestone> {
    const sanitized = { ...milestone };
    // Normalize dueDate: empty strings, invalid values -> null, valid date strings -> Date
    if (sanitized.dueDate === '' || sanitized.dueDate === undefined) {
      sanitized.dueDate = null;
    } else if (sanitized.dueDate !== null && typeof sanitized.dueDate === 'string') {
      const date = new Date(sanitized.dueDate);
      sanitized.dueDate = isNaN(date.getTime()) ? null : date;
    }
    // Normalize completedAt: empty strings, invalid values -> null, valid date strings -> Date
    if (sanitized.completedAt === '' || sanitized.completedAt === undefined) {
      sanitized.completedAt = null;
    } else if (sanitized.completedAt !== null && typeof sanitized.completedAt === 'string') {
      const date = new Date(sanitized.completedAt);
      sanitized.completedAt = isNaN(date.getTime()) ? null : date;
    }
    const [newMilestone] = await db
      .insert(dealRoomMilestones)
      .values(sanitized as typeof dealRoomMilestones.$inferInsert)
      .returning();
    return newMilestone;
  }

  async updateMilestone(id: string, data: Partial<InsertDealRoomMilestone>): Promise<DealRoomMilestone | undefined> {
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        if (key === 'dueDate' || key === 'completedAt') {
          if (value === null || value === '') {
            cleanData[key] = null;
          } else {
            const date = new Date(value as string);
            cleanData[key] = isNaN(date.getTime()) ? null : date;
          }
        } else {
          cleanData[key] = value;
        }
      }
    }
    const [updated] = await db
      .update(dealRoomMilestones)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof dealRoomMilestones.$inferInsert>)
      .where(eq(dealRoomMilestones.id, id))
      .returning();
    return updated;
  }

  async deleteMilestone(id: string): Promise<boolean> {
    await db.delete(dealRoomMilestones).where(eq(dealRoomMilestones.id, id));
    return true;
  }

  // Pitch Deck Analyses
  async getPitchDeckAnalysesByRoom(roomId: string): Promise<PitchDeckAnalysis[]> {
    return db.select().from(pitchDeckAnalyses).where(eq(pitchDeckAnalyses.roomId, roomId)).orderBy(desc(pitchDeckAnalyses.createdAt));
  }

  async getPitchDeckAnalysisById(id: string): Promise<PitchDeckAnalysis | undefined> {
    const [analysis] = await db.select().from(pitchDeckAnalyses).where(eq(pitchDeckAnalyses.id, id));
    return analysis;
  }

  async createPitchDeckAnalysis(analysis: InsertPitchDeckAnalysis): Promise<PitchDeckAnalysis> {
    const [newAnalysis] = await db
      .insert(pitchDeckAnalyses)
      .values(analysis as typeof pitchDeckAnalyses.$inferInsert)
      .returning();
    return newAnalysis;
  }

  async updatePitchDeckAnalysis(id: string, data: Partial<InsertPitchDeckAnalysis>): Promise<PitchDeckAnalysis | undefined> {
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }
    const [updated] = await db
      .update(pitchDeckAnalyses)
      .set(cleanData as Partial<typeof pitchDeckAnalyses.$inferInsert>)
      .where(eq(pitchDeckAnalyses.id, id))
      .returning();
    return updated;
  }

  async deletePitchDeckAnalysis(id: string): Promise<boolean> {
    await db.delete(pitchDeckAnalyses).where(eq(pitchDeckAnalyses.id, id));
    return true;
  }

  // Folk Workspaces
  async getFolkWorkspaces(): Promise<FolkWorkspace[]> {
    return db.select().from(folkWorkspaces).orderBy(desc(folkWorkspaces.createdAt));
  }

  async getFolkWorkspaceById(id: string): Promise<FolkWorkspace | undefined> {
    const [workspace] = await db.select().from(folkWorkspaces).where(eq(folkWorkspaces.id, id));
    return workspace;
  }

  async getFolkWorkspaceByWorkspaceId(workspaceId: string): Promise<FolkWorkspace | undefined> {
    const [workspace] = await db.select().from(folkWorkspaces).where(eq(folkWorkspaces.workspaceId, workspaceId));
    return workspace;
  }

  async createFolkWorkspace(workspace: InsertFolkWorkspace): Promise<FolkWorkspace> {
    const [newWorkspace] = await db
      .insert(folkWorkspaces)
      .values(workspace as typeof folkWorkspaces.$inferInsert)
      .returning();
    return newWorkspace;
  }

  async updateFolkWorkspace(id: string, data: Partial<InsertFolkWorkspace>): Promise<FolkWorkspace | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(folkWorkspaces)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof folkWorkspaces.$inferInsert>)
      .where(eq(folkWorkspaces.id, id))
      .returning();
    return updated;
  }

  async deleteFolkWorkspace(id: string): Promise<boolean> {
    await db.delete(folkWorkspaces).where(eq(folkWorkspaces.id, id));
    return true;
  }

  // Folk Import Runs
  async getFolkImportRuns(workspaceId?: string): Promise<FolkImportRun[]> {
    if (workspaceId) {
      return db.select().from(folkImportRuns)
        .where(eq(folkImportRuns.workspaceId, workspaceId))
        .orderBy(desc(folkImportRuns.startedAt));
    }
    return db.select().from(folkImportRuns).orderBy(desc(folkImportRuns.startedAt));
  }

  async getFolkImportRunById(id: string): Promise<FolkImportRun | undefined> {
    const [run] = await db.select().from(folkImportRuns).where(eq(folkImportRuns.id, id));
    return run;
  }

  async createFolkImportRun(run: InsertFolkImportRun): Promise<FolkImportRun> {
    const [newRun] = await db
      .insert(folkImportRuns)
      .values(run as typeof folkImportRuns.$inferInsert)
      .returning();
    return newRun;
  }

  async updateFolkImportRun(id: string, data: Partial<InsertFolkImportRun>): Promise<FolkImportRun | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(folkImportRuns)
      .set(cleanData as Partial<typeof folkImportRuns.$inferInsert>)
      .where(eq(folkImportRuns.id, id))
      .returning();
    return updated;
  }

  // Folk Failed Records
  async getFolkFailedRecords(runId: string): Promise<FolkFailedRecord[]> {
    return db.select().from(folkFailedRecords)
      .where(eq(folkFailedRecords.runId, runId))
      .orderBy(desc(folkFailedRecords.createdAt));
  }

  async getUnresolvedFolkFailedRecords(): Promise<FolkFailedRecord[]> {
    return db.select().from(folkFailedRecords)
      .where(eq(folkFailedRecords.resolvedAt, null as any))
      .orderBy(desc(folkFailedRecords.createdAt));
  }

  async createFolkFailedRecord(record: InsertFolkFailedRecord): Promise<FolkFailedRecord> {
    const [newRecord] = await db
      .insert(folkFailedRecords)
      .values(record as typeof folkFailedRecords.$inferInsert)
      .returning();
    return newRecord;
  }

  async updateFolkFailedRecord(id: string, data: Partial<InsertFolkFailedRecord>): Promise<FolkFailedRecord | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(folkFailedRecords)
      .set(cleanData as Partial<typeof folkFailedRecords.$inferInsert>)
      .where(eq(folkFailedRecords.id, id))
      .returning();
    return updated;
  }

  async deleteFolkFailedRecord(id: string): Promise<boolean> {
    await db.delete(folkFailedRecords).where(eq(folkFailedRecords.id, id));
    return true;
  }

  // Folk Field Definitions
  async getFolkFieldDefinitions(groupId: string): Promise<FolkFieldDefinition[]> {
    return db.select().from(folkFieldDefinitions)
      .where(eq(folkFieldDefinitions.groupId, groupId))
      .orderBy(folkFieldDefinitions.fieldName);
  }

  async getFolkFieldDefinitionByKey(groupId: string, fieldKey: string): Promise<FolkFieldDefinition | undefined> {
    const [definition] = await db.select().from(folkFieldDefinitions)
      .where(and(
        eq(folkFieldDefinitions.groupId, groupId),
        eq(folkFieldDefinitions.fieldKey, fieldKey)
      ));
    return definition;
  }

  async createFolkFieldDefinition(definition: InsertFolkFieldDefinition): Promise<FolkFieldDefinition> {
    const [newDefinition] = await db
      .insert(folkFieldDefinitions)
      .values(definition as typeof folkFieldDefinitions.$inferInsert)
      .returning();
    return newDefinition;
  }

  async updateFolkFieldDefinition(id: string, data: Partial<InsertFolkFieldDefinition>): Promise<FolkFieldDefinition | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(folkFieldDefinitions)
      .set({ ...cleanData, lastSeenAt: new Date() } as Partial<typeof folkFieldDefinitions.$inferInsert>)
      .where(eq(folkFieldDefinitions.id, id))
      .returning();
    return updated;
  }

  async upsertFolkFieldDefinition(definition: InsertFolkFieldDefinition): Promise<FolkFieldDefinition> {
    const existing = await this.getFolkFieldDefinitionByKey(definition.groupId, definition.fieldKey);
    if (existing) {
      const updated = await this.updateFolkFieldDefinition(existing.id, {
        ...definition,
        occurrenceCount: (existing.occurrenceCount || 0) + 1,
        sampleValues: [...(existing.sampleValues || []).slice(-4), ...(definition.sampleValues || []).slice(0, 1)].slice(-5),
      });
      return updated!;
    }
    return this.createFolkFieldDefinition(definition);
  }

  // Folk Field Mappings
  async getFolkFieldMappings(groupId: string): Promise<FolkFieldMapping[]> {
    return db.select().from(folkFieldMappings)
      .where(eq(folkFieldMappings.groupId, groupId))
      .orderBy(folkFieldMappings.folkFieldKey);
  }

  async getFolkFieldMappingByKey(groupId: string, folkFieldKey: string): Promise<FolkFieldMapping | undefined> {
    const [mapping] = await db.select().from(folkFieldMappings)
      .where(and(
        eq(folkFieldMappings.groupId, groupId),
        eq(folkFieldMappings.folkFieldKey, folkFieldKey)
      ));
    return mapping;
  }

  async createFolkFieldMapping(mapping: InsertFolkFieldMapping): Promise<FolkFieldMapping> {
    const [newMapping] = await db
      .insert(folkFieldMappings)
      .values(mapping as typeof folkFieldMappings.$inferInsert)
      .returning();
    return newMapping;
  }

  async updateFolkFieldMapping(id: string, data: Partial<InsertFolkFieldMapping>): Promise<FolkFieldMapping | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(folkFieldMappings)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof folkFieldMappings.$inferInsert>)
      .where(eq(folkFieldMappings.id, id))
      .returning();
    return updated;
  }

  async deleteFolkFieldMapping(id: string): Promise<boolean> {
    await db.delete(folkFieldMappings).where(eq(folkFieldMappings.id, id));
    return true;
  }

  // Investor-Company Links
  async getInvestorCompanyLinks(investorId?: string, companyId?: string): Promise<InvestorCompanyLink[]> {
    if (investorId && companyId) {
      return db.select().from(investorCompanyLinks)
        .where(and(
          eq(investorCompanyLinks.investorId, investorId),
          eq(investorCompanyLinks.companyId, companyId)
        ));
    }
    if (investorId) {
      return db.select().from(investorCompanyLinks)
        .where(eq(investorCompanyLinks.investorId, investorId));
    }
    if (companyId) {
      return db.select().from(investorCompanyLinks)
        .where(eq(investorCompanyLinks.companyId, companyId));
    }
    return db.select().from(investorCompanyLinks);
  }

  async createInvestorCompanyLink(link: InsertInvestorCompanyLink): Promise<InvestorCompanyLink> {
    const [newLink] = await db
      .insert(investorCompanyLinks)
      .values(link as typeof investorCompanyLinks.$inferInsert)
      .returning();
    return newLink;
  }

  async updateInvestorCompanyLink(id: string, data: Partial<InsertInvestorCompanyLink>): Promise<InvestorCompanyLink | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(investorCompanyLinks)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof investorCompanyLinks.$inferInsert>)
      .where(eq(investorCompanyLinks.id, id))
      .returning();
    return updated;
  }

  async deleteInvestorCompanyLink(id: string): Promise<boolean> {
    await db.delete(investorCompanyLinks).where(eq(investorCompanyLinks.id, id));
    return true;
  }

  // Investor/Firm by Folk ID
  async getInvestorByFolkId(folkId: string): Promise<Investor | undefined> {
    const [investor] = await db.select().from(investors).where(eq(investors.folkId, folkId));
    return investor;
  }

  async getInvestmentFirmByFolkId(folkId: string): Promise<InvestmentFirm | undefined> {
    const [firm] = await db.select().from(investmentFirms).where(eq(investmentFirms.folkId, folkId));
    return firm;
  }

  async findInvestmentFirmByName(name: string): Promise<InvestmentFirm | undefined> {
    if (!name || name.trim().length === 0) return undefined;
    const normalizedName = name.trim().toLowerCase();
    const [firm] = await db.select().from(investmentFirms)
      .where(ilike(investmentFirms.name, normalizedName));
    if (firm) return firm;
    const [partialFirm] = await db.select().from(investmentFirms)
      .where(ilike(investmentFirms.name, `%${normalizedName}%`));
    return partialFirm;
  }

  // Potential Duplicates
  async getPotentialDuplicates(entityType?: string, status?: string): Promise<PotentialDuplicate[]> {
    const conditions = [];
    if (entityType) conditions.push(eq(potentialDuplicates.entityType, entityType));
    if (status) conditions.push(eq(potentialDuplicates.status, status));
    
    if (conditions.length === 0) {
      return db.select().from(potentialDuplicates).orderBy(desc(potentialDuplicates.createdAt));
    }
    return db.select().from(potentialDuplicates)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(potentialDuplicates.createdAt));
  }

  async getPotentialDuplicateById(id: string): Promise<PotentialDuplicate | undefined> {
    const [duplicate] = await db.select().from(potentialDuplicates).where(eq(potentialDuplicates.id, id));
    return duplicate;
  }

  async createPotentialDuplicate(duplicate: InsertPotentialDuplicate): Promise<PotentialDuplicate> {
    const [newDuplicate] = await db
      .insert(potentialDuplicates)
      .values(duplicate as typeof potentialDuplicates.$inferInsert)
      .returning();
    return newDuplicate;
  }

  async updatePotentialDuplicate(id: string, data: Partial<InsertPotentialDuplicate>): Promise<PotentialDuplicate | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(potentialDuplicates)
      .set(cleanData as Partial<typeof potentialDuplicates.$inferInsert>)
      .where(eq(potentialDuplicates.id, id))
      .returning();
    return updated;
  }

  async deletePotentialDuplicate(id: string): Promise<boolean> {
    await db.delete(potentialDuplicates).where(eq(potentialDuplicates.id, id));
    return true;
  }

  // Enrichment Jobs
  async getEnrichmentJobs(entityType?: string, status?: string): Promise<EnrichmentJob[]> {
    const conditions = [];
    if (entityType) conditions.push(eq(enrichmentJobs.entityType, entityType));
    if (status) conditions.push(eq(enrichmentJobs.status, status));
    
    if (conditions.length === 0) {
      return db.select().from(enrichmentJobs).orderBy(desc(enrichmentJobs.createdAt));
    }
    return db.select().from(enrichmentJobs)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(enrichmentJobs.createdAt));
  }

  async getEnrichmentJobById(id: string): Promise<EnrichmentJob | undefined> {
    const [job] = await db.select().from(enrichmentJobs).where(eq(enrichmentJobs.id, id));
    return job;
  }

  async getEnrichmentJobsByEntity(entityType: string, entityId: string): Promise<EnrichmentJob[]> {
    return db.select().from(enrichmentJobs)
      .where(and(
        eq(enrichmentJobs.entityType, entityType),
        eq(enrichmentJobs.entityId, entityId)
      ))
      .orderBy(desc(enrichmentJobs.createdAt));
  }

  async createEnrichmentJob(job: InsertEnrichmentJob): Promise<EnrichmentJob> {
    const [newJob] = await db
      .insert(enrichmentJobs)
      .values(job as typeof enrichmentJobs.$inferInsert)
      .returning();
    return newJob;
  }

  async updateEnrichmentJob(id: string, data: Partial<InsertEnrichmentJob>): Promise<EnrichmentJob | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(enrichmentJobs)
      .set(cleanData as Partial<typeof enrichmentJobs.$inferInsert>)
      .where(eq(enrichmentJobs.id, id))
      .returning();
    return updated;
  }

  // Email Templates
  async getEmailTemplates(ownerId?: string): Promise<EmailTemplate[]> {
    if (ownerId) {
      return db.select().from(emailTemplates)
        .where(or(eq(emailTemplates.ownerId, ownerId), eq(emailTemplates.isPublic, true)))
        .orderBy(desc(emailTemplates.createdAt));
    }
    return db.select().from(emailTemplates).orderBy(desc(emailTemplates.createdAt));
  }

  async getEmailTemplateById(id: string): Promise<EmailTemplate | undefined> {
    const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
    return template;
  }

  async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    const [newTemplate] = await db
      .insert(emailTemplates)
      .values(template as typeof emailTemplates.$inferInsert)
      .returning();
    return newTemplate;
  }

  async updateEmailTemplate(id: string, data: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(emailTemplates)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof emailTemplates.$inferInsert>)
      .where(eq(emailTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteEmailTemplate(id: string): Promise<boolean> {
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
    return true;
  }

  // Outreaches
  async getOutreaches(ownerId?: string, startupId?: string): Promise<Outreach[]> {
    const conditions = [];
    if (ownerId) conditions.push(eq(outreaches.ownerId, ownerId));
    if (startupId) conditions.push(eq(outreaches.startupId, startupId));
    
    if (conditions.length === 0) {
      return db.select().from(outreaches).orderBy(desc(outreaches.createdAt));
    }
    return db.select().from(outreaches)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(outreaches.createdAt));
  }

  async getOutreachById(id: string): Promise<Outreach | undefined> {
    const [outreach] = await db.select().from(outreaches).where(eq(outreaches.id, id));
    return outreach;
  }

  async createOutreach(outreach: InsertOutreach): Promise<Outreach> {
    const [newOutreach] = await db
      .insert(outreaches)
      .values(outreach as typeof outreaches.$inferInsert)
      .returning();
    return newOutreach;
  }

  async updateOutreach(id: string, data: Partial<InsertOutreach>): Promise<Outreach | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(outreaches)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof outreaches.$inferInsert>)
      .where(eq(outreaches.id, id))
      .returning();
    return updated;
  }

  async deleteOutreach(id: string): Promise<boolean> {
    await db.delete(outreaches).where(eq(outreaches.id, id));
    return true;
  }

  // Matches
  async getMatches(startupId?: string): Promise<Match[]> {
    if (startupId) {
      return db.select().from(matches)
        .where(eq(matches.startupId, startupId))
        .orderBy(desc(matches.matchScore));
    }
    return db.select().from(matches).orderBy(desc(matches.matchScore));
  }

  async getMatchById(id: string): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match;
  }

  async createMatch(match: InsertMatch): Promise<Match> {
    const [newMatch] = await db
      .insert(matches)
      .values(match as typeof matches.$inferInsert)
      .returning();
    return newMatch;
  }

  async updateMatch(id: string, data: Partial<InsertMatch>): Promise<Match | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(matches)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof matches.$inferInsert>)
      .where(eq(matches.id, id))
      .returning();
    return updated;
  }

  async deleteMatch(id: string): Promise<boolean> {
    await db.delete(matches).where(eq(matches.id, id));
    return true;
  }

  // Interaction Logs
  async getInteractionLogs(outreachId?: string, startupId?: string): Promise<InteractionLog[]> {
    const conditions = [];
    if (outreachId) conditions.push(eq(interactionLogs.outreachId, outreachId));
    if (startupId) conditions.push(eq(interactionLogs.startupId, startupId));
    
    if (conditions.length === 0) {
      return db.select().from(interactionLogs).orderBy(desc(interactionLogs.createdAt));
    }
    return db.select().from(interactionLogs)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(interactionLogs.createdAt));
  }

  async createInteractionLog(log: InsertInteractionLog): Promise<InteractionLog> {
    const [newLog] = await db
      .insert(interactionLogs)
      .values(log as typeof interactionLogs.$inferInsert)
      .returning();
    return newLog;
  }

  // Notifications
  async getNotificationsByUser(userId: string, limit: number = 50): Promise<Notification[]> {
    return db.select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
    return result.length;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db
      .insert(notifications)
      .values(notification as typeof notifications.$inferInsert)
      .returning();
    return newNotification;
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return updated;
  }

  async markAllNotificationsAsRead(userId: string): Promise<boolean> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
    return true;
  }

  async deleteNotification(id: string): Promise<boolean> {
    await db.delete(notifications).where(eq(notifications.id, id));
    return true;
  }

  // Calendar Meetings
  async getCalendarMeetingsByUser(userId: string): Promise<CalendarMeeting[]> {
    return db.select()
      .from(calendarMeetings)
      .where(eq(calendarMeetings.userId, userId))
      .orderBy(desc(calendarMeetings.startTime));
  }

  async getCalendarMeetingById(id: string): Promise<CalendarMeeting | undefined> {
    const [meeting] = await db.select().from(calendarMeetings).where(eq(calendarMeetings.id, id));
    return meeting;
  }

  async createCalendarMeeting(meeting: InsertCalendarMeeting): Promise<CalendarMeeting> {
    const [newMeeting] = await db
      .insert(calendarMeetings)
      .values(meeting as typeof calendarMeetings.$inferInsert)
      .returning();
    return newMeeting;
  }

  async updateCalendarMeeting(id: string, data: Partial<InsertCalendarMeeting>): Promise<CalendarMeeting | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const [updated] = await db
      .update(calendarMeetings)
      .set({ ...cleanData, updatedAt: new Date() } as Partial<typeof calendarMeetings.$inferInsert>)
      .where(eq(calendarMeetings.id, id))
      .returning();
    return updated;
  }

  async deleteCalendarMeeting(id: string): Promise<boolean> {
    await db.delete(calendarMeetings).where(eq(calendarMeetings.id, id));
    return true;
  }

  // User Email Settings
  async getUserEmailSettings(userId: string): Promise<UserEmailSettings | undefined> {
    const [settings] = await db.select()
      .from(userEmailSettings)
      .where(eq(userEmailSettings.userId, userId));
    return settings;
  }

  async upsertUserEmailSettings(settings: InsertUserEmailSettings): Promise<UserEmailSettings> {
    const existing = await this.getUserEmailSettings(settings.userId);
    if (existing) {
      const [updated] = await db
        .update(userEmailSettings)
        .set({ ...settings, updatedAt: new Date() } as Partial<typeof userEmailSettings.$inferInsert>)
        .where(eq(userEmailSettings.userId, settings.userId))
        .returning();
      return updated;
    }
    const [newSettings] = await db
      .insert(userEmailSettings)
      .values(settings as typeof userEmailSettings.$inferInsert)
      .returning();
    return newSettings;
  }

  // Activity Logs
  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [newLog] = await db
      .insert(activityLogs)
      .values(log as typeof activityLogs.$inferInsert)
      .returning();
    return newLog;
  }

  async getActivityLogs(userId?: string, entityType?: string, limit: number = 100): Promise<ActivityLog[]> {
    let query = db.select().from(activityLogs);
    
    if (userId && entityType) {
      query = query.where(and(eq(activityLogs.userId, userId), eq(activityLogs.entityType, entityType))) as any;
    } else if (userId) {
      query = query.where(eq(activityLogs.userId, userId)) as any;
    } else if (entityType) {
      query = query.where(eq(activityLogs.entityType, entityType)) as any;
    }
    
    return query.orderBy(desc(activityLogs.createdAt)).limit(limit);
  }

  // Contact lookup for auto-creation
  async getContactByInvestorId(ownerId: string, investorId: string): Promise<Contact | undefined> {
    const [contact] = await db.select()
      .from(contacts)
      .where(and(
        eq(contacts.ownerId, ownerId),
        eq(contacts.sourceInvestorId, investorId)
      ));
    return contact;
  }

  async getContactByFirmId(ownerId: string, firmId: string): Promise<Contact | undefined> {
    const [contact] = await db.select()
      .from(contacts)
      .where(and(
        eq(contacts.ownerId, ownerId),
        eq(contacts.sourceFirmId, firmId)
      ));
    return contact;
  }

  // Introductions (N-I2: Warm Introduction Workflow)
  async getIntroductions(requesterId: string): Promise<Introduction[]> {
    return db.select()
      .from(introductions)
      .where(eq(introductions.requesterId, requesterId))
      .orderBy(desc(introductions.createdAt));
  }

  async getIntroductionById(id: string): Promise<Introduction | undefined> {
    const [intro] = await db.select()
      .from(introductions)
      .where(eq(introductions.id, id));
    return intro;
  }

  async createIntroduction(intro: InsertIntroduction): Promise<Introduction> {
    const [newIntro] = await db.insert(introductions)
      .values(intro)
      .returning();
    return newIntro;
  }

  async updateIntroduction(id: string, data: Partial<InsertIntroduction>): Promise<Introduction | undefined> {
    const [updated] = await db.update(introductions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(introductions.id, id))
      .returning();
    return updated;
  }

  async deleteIntroduction(id: string): Promise<boolean> {
    const result = await db.delete(introductions)
      .where(eq(introductions.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

export const storage = new DatabaseStorage();
