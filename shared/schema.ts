import { pgTable, text, serial, timestamp, boolean, jsonb, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { users } from "./models/auth";

// Export auth models
export * from "./models/auth";

// Contact/Message form table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Newsletter subscribers
export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ 
  id: true, 
  createdAt: true 
});

export const insertSubscriberSchema = createInsertSchema(subscribers).omit({ 
  id: true, 
  active: true,
  createdAt: true 
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Subscriber = typeof subscribers.$inferSelect;
export type InsertSubscriber = z.infer<typeof insertSubscriberSchema>;

// Startups table
export const startups = pgTable("startups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  founderId: varchar("founder_id").references(() => users.id).notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  tagline: varchar("tagline"),
  website: varchar("website"),
  logo: varchar("logo"),
  stage: varchar("stage"), // Pre-seed, Seed, Series A, etc.
  industries: jsonb("industries").$type<string[]>().default([]),
  location: varchar("location"),
  founded: varchar("founded"),
  teamSize: integer("team_size"),
  // Fundraising info
  fundingStatus: varchar("funding_status"), // Actively raising, Not raising, etc.
  targetAmount: integer("target_amount"),
  amountRaised: integer("amount_raised"),
  valuation: integer("valuation"),
  // Pitch materials
  pitchDeckUrl: varchar("pitch_deck_url"),
  demoUrl: varchar("demo_url"),
  // Metrics
  revenue: varchar("revenue"),
  mrr: integer("mrr"),
  growth: varchar("growth"),
  customers: integer("customers"),
  // Social
  twitterUrl: varchar("twitter_url"),
  linkedinUrl: varchar("linkedin_url"),
  // Meta
  isPublic: boolean("is_public").default(false),
  featured: boolean("featured").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertStartupSchema = createInsertSchema(startups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Startup = typeof startups.$inferSelect;
export type InsertStartup = z.infer<typeof insertStartupSchema>;

// Investment Firms (VC/Angel firms)
export const investmentFirms = pgTable("investment_firms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  website: varchar("website"),
  logo: varchar("logo"),
  type: varchar("type"), // VC, Angel, Accelerator, PE, CVC
  aum: varchar("aum"), // Assets under management
  location: varchar("location"),
  stages: jsonb("stages").$type<string[]>().default([]), // Pre-seed, Seed, Series A, etc.
  sectors: jsonb("sectors").$type<string[]>().default([]), // SaaS, Fintech, Healthcare, etc.
  checkSizeMin: integer("check_size_min"),
  checkSizeMax: integer("check_size_max"),
  portfolioCount: integer("portfolio_count"),
  linkedinUrl: varchar("linkedin_url"),
  twitterUrl: varchar("twitter_url"),
  // Folk CRM integration fields
  folkId: varchar("folk_id"), // Folk CRM company ID
  folkWorkspaceId: varchar("folk_workspace_id"), // Which Folk workspace this came from
  folkListIds: jsonb("folk_list_ids").$type<string[]>().default([]), // Folk lists this company belongs to
  folkUpdatedAt: timestamp("folk_updated_at"), // Last update from Folk
  source: varchar("source"), // folk, manual, csv
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInvestmentFirmSchema = createInsertSchema(investmentFirms).omit({
  id: true,
  createdAt: true,
});

export type InvestmentFirm = typeof investmentFirms.$inferSelect;
export type InsertInvestmentFirm = z.infer<typeof insertInvestmentFirmSchema>;

// Investors (individual investors)
export const investors = pgTable("investors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // If investor has platform account
  firmId: varchar("firm_id").references(() => investmentFirms.id),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name"),
  email: varchar("email"),
  phone: varchar("phone"),
  title: varchar("title"), // Partner, Principal, Associate, etc.
  linkedinUrl: varchar("linkedin_url"),
  twitterUrl: varchar("twitter_url"),
  avatar: varchar("avatar"),
  bio: text("bio"),
  stages: jsonb("stages").$type<string[]>().default([]),
  sectors: jsonb("sectors").$type<string[]>().default([]),
  location: varchar("location"),
  isActive: boolean("is_active").default(true),
  // Folk CRM integration fields
  folkId: varchar("folk_id"), // Folk CRM integration ID
  folkWorkspaceId: varchar("folk_workspace_id"), // Which Folk workspace this came from
  folkListIds: jsonb("folk_list_ids").$type<string[]>().default([]), // Folk lists this person belongs to
  folkUpdatedAt: timestamp("folk_updated_at"), // Last update from Folk
  source: varchar("source"), // folk, manual, csv, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInvestorSchema = createInsertSchema(investors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Investor = typeof investors.$inferSelect;
export type InsertInvestor = z.infer<typeof insertInvestorSchema>;

// Contacts (general relationship management)
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").references(() => users.id).notNull(), // User who owns this contact
  type: varchar("type").notNull(), // investor, founder, advisor, other
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name"),
  email: varchar("email"),
  phone: varchar("phone"),
  company: varchar("company"),
  title: varchar("title"),
  linkedinUrl: varchar("linkedin_url"),
  twitterUrl: varchar("twitter_url"),
  avatar: varchar("avatar"),
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>().default([]),
  status: varchar("status").default("active"), // active, archived
  lastContactedAt: timestamp("last_contacted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

// Deals (pipeline management)
export const deals = pgTable("deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").references(() => users.id).notNull(),
  startupId: varchar("startup_id").references(() => startups.id),
  investorId: varchar("investor_id").references(() => investors.id),
  firmId: varchar("firm_id").references(() => investmentFirms.id),
  title: varchar("title").notNull(),
  description: text("description"),
  stage: varchar("stage").notNull().default("lead"), // lead, contacted, meeting, due_diligence, term_sheet, closing, closed, passed
  status: varchar("status").default("active"), // active, won, lost
  priority: varchar("priority").default("medium"), // low, medium, high
  dealSize: integer("deal_size"),
  probability: integer("probability"), // 0-100
  expectedCloseDate: timestamp("expected_close_date"),
  actualCloseDate: timestamp("actual_close_date"),
  source: varchar("source"), // referral, inbound, outbound, event, etc.
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>().default([]),
  assignedTo: varchar("assigned_to").references(() => users.id),
  lastActivityAt: timestamp("last_activity_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Deal = typeof deals.$inferSelect;
export type InsertDeal = z.infer<typeof insertDealSchema>;

// Deal Rooms (virtual data rooms for deals)
export const dealRooms = pgTable("deal_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dealId: varchar("deal_id").references(() => deals.id).notNull(),
  ownerId: varchar("owner_id").references(() => users.id).notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  status: varchar("status").default("active"), // active, archived, closed
  accessLevel: varchar("access_level").default("private"), // private, shared, public
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDealRoomSchema = createInsertSchema(dealRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DealRoom = typeof dealRooms.$inferSelect;
export type InsertDealRoom = z.infer<typeof insertDealRoomSchema>;

// Deal Room Documents
export const dealRoomDocuments = pgTable("deal_room_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").references(() => dealRooms.id).notNull(),
  uploadedBy: varchar("uploaded_by").references(() => users.id).notNull(),
  name: varchar("name").notNull(),
  type: varchar("type"), // pitch_deck, financials, legal, cap_table, other
  url: varchar("url"),
  size: integer("size"), // bytes
  mimeType: varchar("mime_type"),
  description: text("description"),
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDealRoomDocumentSchema = createInsertSchema(dealRoomDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DealRoomDocument = typeof dealRoomDocuments.$inferSelect;
export type InsertDealRoomDocument = z.infer<typeof insertDealRoomDocumentSchema>;

// Deal Room Notes
export const dealRoomNotes = pgTable("deal_room_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").references(() => dealRooms.id).notNull(),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  title: varchar("title"),
  content: text("content").notNull(),
  isPrivate: boolean("is_private").default(false),
  isPinned: boolean("is_pinned").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDealRoomNoteSchema = createInsertSchema(dealRoomNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DealRoomNote = typeof dealRoomNotes.$inferSelect;
export type InsertDealRoomNote = z.infer<typeof insertDealRoomNoteSchema>;

// Deal Room Milestones
export const dealRoomMilestones = pgTable("deal_room_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").references(() => dealRooms.id).notNull(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  status: varchar("status").default("pending"), // pending, in_progress, completed, cancelled
  priority: varchar("priority").default("medium"), // low, medium, high
  order: integer("order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const baseMilestoneSchema = createInsertSchema(dealRoomMilestones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Custom date field that accepts strings, dates, null, undefined - and normalizes empty values to null
const optionalDateField = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return null;
    return val;
  },
  z.union([z.string(), z.date(), z.null()]).nullable().optional()
);

export const insertDealRoomMilestoneSchema = baseMilestoneSchema.extend({
  dueDate: optionalDateField,
  completedAt: optionalDateField,
});

export type DealRoomMilestone = typeof dealRoomMilestones.$inferSelect;
export type InsertDealRoomMilestone = z.infer<typeof insertDealRoomMilestoneSchema>;

// Activity Logs - for admin monitoring
export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: varchar("action").notNull(), // created, updated, deleted, imported, synced, etc.
  entityType: varchar("entity_type").notNull(), // investor, startup, deal, contact, etc.
  entityId: varchar("entity_id"),
  description: text("description"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

// Sync Logs - for tracking Folk CRM and other integrations
export const syncLogs = pgTable("sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: varchar("source").notNull(), // folk, csv, manual
  syncType: varchar("sync_type").notNull(), // import, export, bidirectional
  status: varchar("status").notNull(), // pending, in_progress, completed, failed
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  recordsProcessed: integer("records_processed").default(0),
  recordsCreated: integer("records_created").default(0),
  recordsUpdated: integer("records_updated").default(0),
  recordsFailed: integer("records_failed").default(0),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  initiatedBy: varchar("initiated_by").references(() => users.id),
});

export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({
  id: true,
});

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;

// System Settings - for configuration
export const systemSettings = pgTable("system_settings", {
  key: varchar("key").primaryKey(),
  value: text("value"),
  description: text("description"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;

// Folk Workspaces - track connected Folk CRM workspaces
export const folkWorkspaces = pgTable("folk_workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(), // Folk's workspace ID (e.g., "1000vc")
  name: varchar("name").notNull(),
  slug: varchar("slug"),
  isActive: boolean("is_active").default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  syncCursor: varchar("sync_cursor"), // For paginated sync
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFolkWorkspaceSchema = createInsertSchema(folkWorkspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type FolkWorkspace = typeof folkWorkspaces.$inferSelect;
export type InsertFolkWorkspace = z.infer<typeof insertFolkWorkspaceSchema>;

// Folk Import Runs - track each import operation
export const folkImportRuns = pgTable("folk_import_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => folkWorkspaces.id),
  sourceType: varchar("source_type").notNull(), // people, companies
  status: varchar("status").notNull().default("pending"), // pending, in_progress, completed, failed, cancelled
  initiatedBy: varchar("initiated_by").references(() => users.id),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  totalRecords: integer("total_records").default(0),
  processedRecords: integer("processed_records").default(0),
  createdRecords: integer("created_records").default(0),
  updatedRecords: integer("updated_records").default(0),
  skippedRecords: integer("skipped_records").default(0),
  failedRecords: integer("failed_records").default(0),
  errorSummary: text("error_summary"),
  folkCursor: varchar("folk_cursor"), // For resuming interrupted imports
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
});

export const insertFolkImportRunSchema = createInsertSchema(folkImportRuns).omit({
  id: true,
});

export type FolkImportRun = typeof folkImportRuns.$inferSelect;
export type InsertFolkImportRun = z.infer<typeof insertFolkImportRunSchema>;

// Folk Failed Records - track individual failed imports for retry/debugging
export const folkFailedRecords = pgTable("folk_failed_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").references(() => folkImportRuns.id).notNull(),
  recordType: varchar("record_type").notNull(), // person, company
  folkId: varchar("folk_id").notNull(), // Folk's record ID
  payload: jsonb("payload").$type<Record<string, any>>().default({}), // Original Folk data
  errorCode: varchar("error_code"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFolkFailedRecordSchema = createInsertSchema(folkFailedRecords).omit({
  id: true,
  createdAt: true,
});

export type FolkFailedRecord = typeof folkFailedRecords.$inferSelect;
export type InsertFolkFailedRecord = z.infer<typeof insertFolkFailedRecordSchema>;

// Investor-Company Links - bidirectional relationships between investors and companies
export const investorCompanyLinks = pgTable("investor_company_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investorId: varchar("investor_id").references(() => investors.id).notNull(),
  companyId: varchar("company_id").references(() => investmentFirms.id).notNull(),
  relationshipType: varchar("relationship_type").notNull(), // partner, principal, associate, advisor, board_member, employee
  title: varchar("title"), // Specific title at the company
  isPrimary: boolean("is_primary").default(false), // Primary affiliation
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  confidenceScore: integer("confidence_score"), // 0-100, for auto-matched links
  source: varchar("source"), // folk, manual, csv
  folkId: varchar("folk_id"), // Folk relationship ID if imported
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInvestorCompanyLinkSchema = createInsertSchema(investorCompanyLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InvestorCompanyLink = typeof investorCompanyLinks.$inferSelect;
export type InsertInvestorCompanyLink = z.infer<typeof insertInvestorCompanyLinkSchema>;
