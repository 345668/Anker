import { pgTable, text, serial, timestamp, boolean, jsonb, varchar, integer, real } from "drizzle-orm/pg-core";
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

// Firm classification types
export const FIRM_CLASSIFICATIONS = [
  "Family Office",
  "Bank",
  "Institutional Investor",
  "Sovereign Wealth Fund",
  "Angel Investor",
  "Asset & Wealth Manager",
  "Fund of Funds",
  "Corporate VC",
  "Venture Capital",
  "Private Equity",
  "Accelerator",
] as const;

export type FirmClassification = typeof FIRM_CLASSIFICATIONS[number];

// Investment Firms (VC/Angel firms)
export const investmentFirms = pgTable("investment_firms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  website: varchar("website"),
  logo: varchar("logo"),
  type: varchar("type"), // VC, Angel, Accelerator, PE, CVC
  firmClassification: varchar("firm_classification"), // Family Office, Bank, etc.
  aum: varchar("aum"), // Assets under management
  location: varchar("location"),
  hqLocation: varchar("hq_location"), // HQ Location from Folk
  stages: jsonb("stages").$type<string[]>().default([]), // Pre-seed, Seed, Series A, etc.
  sectors: jsonb("sectors").$type<string[]>().default([]), // SaaS, Fintech, Healthcare, etc.
  industry: varchar("industry"), // Industry from Folk
  url1: varchar("url_1"), // Additional URL 1
  url2: varchar("url_2"), // Additional URL 2
  checkSizeMin: integer("check_size_min"),
  checkSizeMax: integer("check_size_max"),
  typicalCheckSize: varchar("typical_check_size"), // Typical investment/check size range
  portfolioCount: integer("portfolio_count"),
  linkedinUrl: varchar("linkedin_url"),
  twitterUrl: varchar("twitter_url"),
  // Folk "Magic Investors" company fields
  emails: jsonb("emails").$type<Array<{value: string; type?: string}>>(), // Email addresses
  phones: jsonb("phones").$type<Array<{value: string; type?: string}>>(), // Phone numbers  
  addresses: jsonb("addresses").$type<Array<{value: string; type?: string}>>(), // Physical addresses
  urls: jsonb("urls").$type<Array<{value: string; type?: string}>>(), // Website URLs
  fundingRaised: varchar("funding_raised"), // Total funding raised
  lastFundingDate: varchar("last_funding_date"), // Date of last funding round
  foundationYear: varchar("foundation_year"), // Year founded
  employeeRange: varchar("employee_range"), // e.g., "11-50", "51-200"
  status: varchar("status"), // Status in pipeline
  // Folk CRM integration fields
  folkId: varchar("folk_id"), // Folk CRM company ID
  folkWorkspaceId: varchar("folk_workspace_id"), // Which Folk workspace this came from
  folkListIds: jsonb("folk_list_ids").$type<string[]>().default([]), // Folk lists this company belongs to
  folkUpdatedAt: timestamp("folk_updated_at"), // Last update from Folk
  folkCustomFields: jsonb("folk_custom_fields").$type<Record<string, any>>(), // Store all custom fields
  source: varchar("source"), // folk, manual, csv
  // Enrichment tracking fields
  enrichmentStatus: varchar("enrichment_status").default("not_enriched"), // not_enriched, enriched, failed, partially_enriched
  lastEnrichmentDate: timestamp("last_enrichment_date"), // When the firm was last enriched
  enrichmentError: text("enrichment_error"), // Error message if enrichment failed
  logoUrl: text("logo_url"), // Logo URL from enrichment
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
  personLinkedinUrl: varchar("person_linkedin_url"), // From Folk custom field
  twitterUrl: varchar("twitter_url"),
  avatar: varchar("avatar"),
  bio: text("bio"),
  stages: jsonb("stages").$type<string[]>().default([]),
  sectors: jsonb("sectors").$type<string[]>().default([]),
  location: varchar("location"),
  address: varchar("address"),
  isActive: boolean("is_active").default(true),
  // Folk "Magic Investors" custom fields
  investorType: varchar("investor_type"), // VC, Angel, Accelerator, etc.
  investorState: varchar("investor_state"), // Active, Inactive, etc.
  investorCountry: varchar("investor_country"),
  fundHQ: varchar("fund_hq"), // Fund headquarters location
  hqLocation: varchar("hq_location"), // General HQ location
  fundingStage: varchar("funding_stage"), // Pre-seed, Seed, Series A, etc.
  typicalInvestment: varchar("typical_investment"), // Check size range
  numLeadInvestments: integer("num_lead_investments"),
  totalInvestments: integer("total_investments"),
  recentInvestments: text("recent_investments"), // JSON or comma-separated list
  status: varchar("status"), // Lead, Contact, etc.
  website: varchar("website"),
  // Folk CRM integration fields
  folkId: varchar("folk_id"), // Folk CRM integration ID
  folkWorkspaceId: varchar("folk_workspace_id"), // Which Folk workspace this came from
  folkListIds: jsonb("folk_list_ids").$type<string[]>().default([]), // Folk lists this person belongs to
  folkUpdatedAt: timestamp("folk_updated_at"), // Last update from Folk
  folkCustomFields: jsonb("folk_custom_fields").$type<Record<string, any>>(), // Store all custom fields
  source: varchar("source"), // folk, manual, csv, etc.
  // Enrichment tracking fields
  enrichmentStatus: text("enrichment_status"), // Status of AI enrichment
  lastEnrichmentDate: timestamp("last_enrichment_date"), // When the investor was last enriched
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

// Top Businessmen by City
export const businessmen = pgTable("businessmen", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name"),
  email: varchar("email"),
  phone: varchar("phone"),
  title: varchar("title"),
  company: varchar("company"),
  industry: varchar("industry"),
  linkedinUrl: varchar("linkedin_url"),
  personLinkedinUrl: varchar("person_linkedin_url"),
  twitterUrl: varchar("twitter_url"),
  avatar: varchar("avatar"),
  bio: text("bio"),
  city: varchar("city"),
  country: varchar("country"),
  location: varchar("location"),
  address: varchar("address"),
  netWorth: varchar("net_worth"),
  source: varchar("source"),
  website: varchar("website"),
  isActive: boolean("is_active").default(true),
  folkId: varchar("folk_id"),
  folkWorkspaceId: varchar("folk_workspace_id"),
  folkListIds: jsonb("folk_list_ids").$type<string[]>().default([]),
  folkUpdatedAt: timestamp("folk_updated_at"),
  folkCustomFields: jsonb("folk_custom_fields").$type<Record<string, any>>(),
  enrichmentStatus: text("enrichment_status"),
  lastEnrichmentDate: timestamp("last_enrichment_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBusinessmanSchema = createInsertSchema(businessmen).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Businessman = typeof businessmen.$inferSelect;
export type InsertBusinessman = z.infer<typeof insertBusinessmanSchema>;

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

// Pitch Deck Analysis - AI-powered analysis of pitch decks
export const pitchDeckAnalyses = pgTable("pitch_deck_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").references(() => dealRooms.id).notNull(),
  documentId: varchar("document_id").references(() => dealRoomDocuments.id),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  status: varchar("status").default("pending"), // pending, analyzing, completed, failed
  // Analysis checklist progress
  checklistItems: jsonb("checklist_items").$type<Array<{
    id: string;
    label: string;
    status: "pending" | "in_progress" | "completed" | "failed";
    result?: string;
  }>>().default([]),
  currentStep: integer("current_step").default(0),
  totalSteps: integer("total_steps").default(10),
  // Analysis results
  overallScore: integer("overall_score"), // 0-100
  strengths: jsonb("strengths").$type<string[]>().default([]),
  weaknesses: jsonb("weaknesses").$type<string[]>().default([]),
  recommendations: jsonb("recommendations").$type<Array<{
    category: string;
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    actionItems: string[];
  }>>().default([]),
  // Category scores
  problemScore: integer("problem_score"),
  solutionScore: integer("solution_score"),
  marketScore: integer("market_score"),
  businessModelScore: integer("business_model_score"),
  tractionScore: integer("traction_score"),
  teamScore: integer("team_score"),
  financialsScore: integer("financials_score"),
  competitionScore: integer("competition_score"),
  askScore: integer("ask_score"),
  presentationScore: integer("presentation_score"),
  // Detailed analysis
  detailedAnalysis: jsonb("detailed_analysis").$type<Record<string, any>>().default({}),
  summary: text("summary"),
  // AI metadata
  tokensUsed: integer("tokens_used"),
  modelUsed: varchar("model_used"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertPitchDeckAnalysisSchema = createInsertSchema(pitchDeckAnalyses).omit({
  id: true,
  createdAt: true,
});

export type PitchDeckAnalysis = typeof pitchDeckAnalyses.$inferSelect;
export type InsertPitchDeckAnalysis = z.infer<typeof insertPitchDeckAnalysisSchema>;

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
  progressPercent: integer("progress_percent").default(0), // 0-100 percentage complete
  etaSeconds: integer("eta_seconds"), // Estimated time remaining in seconds
  importStage: varchar("import_stage"), // Current import stage: fetching, processing, saving
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

// Folk Field Definitions - track discovered fields from Folk groups
export const folkFieldDefinitions = pgTable("folk_field_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(), // Folk group this field was discovered in
  fieldName: varchar("field_name").notNull(), // Original field name in Folk
  fieldKey: varchar("field_key").notNull(), // Normalized key (lowercase, underscored)
  fieldType: varchar("field_type").notNull(), // string, number, boolean, array, object, date, email, url, phone
  sampleValues: jsonb("sample_values").$type<any[]>().default([]), // Sample values for preview
  occurrenceCount: integer("occurrence_count").default(0), // How many records have this field
  isCustomField: boolean("is_custom_field").default(true), // Is this a custom field vs standard Folk field
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFolkFieldDefinitionSchema = createInsertSchema(folkFieldDefinitions).omit({
  id: true,
  createdAt: true,
});

export type FolkFieldDefinition = typeof folkFieldDefinitions.$inferSelect;
export type InsertFolkFieldDefinition = z.infer<typeof insertFolkFieldDefinitionSchema>;

// Folk Field Mappings - map Folk fields to database columns
export const folkFieldMappings = pgTable("folk_field_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(), // Folk group this mapping applies to
  folkFieldKey: varchar("folk_field_key").notNull(), // Field key from Folk
  targetTable: varchar("target_table").notNull(), // investors, investment_firms, contacts
  targetColumn: varchar("target_column"), // Existing column name, null if storing in JSON
  storeInJson: boolean("store_in_json").default(true), // Store in folkCustomFields if no target column
  transformType: varchar("transform_type"), // none, lowercase, uppercase, trim, parse_number, parse_date
  aiConfidence: integer("ai_confidence"), // 0-100 confidence from AI matching
  aiReason: text("ai_reason"), // AI explanation for the suggestion
  isApproved: boolean("is_approved").default(false), // Admin approved this mapping
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFolkFieldMappingSchema = createInsertSchema(folkFieldMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type FolkFieldMapping = typeof folkFieldMappings.$inferSelect;
export type InsertFolkFieldMapping = z.infer<typeof insertFolkFieldMappingSchema>;

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

// Potential Duplicates - track duplicate candidates for review
export const potentialDuplicates = pgTable("potential_duplicates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: varchar("entity_type").notNull(), // investor, contact, firm
  entity1Id: varchar("entity1_id").notNull(),
  entity2Id: varchar("entity2_id").notNull(),
  matchType: varchar("match_type").notNull(), // email_exact, name_fuzzy, company_exact, combined
  similarityScore: integer("similarity_score").notNull(), // 0-100
  matchDetails: jsonb("match_details").$type<Record<string, any>>().default({}), // Details about what matched
  status: varchar("status").default("pending"), // pending, merged, dismissed, reviewed
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  mergedIntoId: varchar("merged_into_id"), // If merged, which record survived
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPotentialDuplicateSchema = createInsertSchema(potentialDuplicates).omit({
  id: true,
  createdAt: true,
});

export type PotentialDuplicate = typeof potentialDuplicates.$inferSelect;
export type InsertPotentialDuplicate = z.infer<typeof insertPotentialDuplicateSchema>;

// AI Enrichment Jobs - track enrichment requests and results
export const enrichmentJobs = pgTable("enrichment_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: varchar("entity_type").notNull(), // investor, contact, firm
  entityId: varchar("entity_id").notNull(),
  status: varchar("status").default("pending"), // pending, processing, completed, failed
  enrichmentType: varchar("enrichment_type").notNull(), // full_profile, missing_fields, insights
  inputData: jsonb("input_data").$type<Record<string, any>>().default({}),
  outputData: jsonb("output_data").$type<Record<string, any>>().default({}),
  suggestedUpdates: jsonb("suggested_updates").$type<Record<string, any>>().default({}),
  appliedAt: timestamp("applied_at"), // When suggestions were applied
  appliedBy: varchar("applied_by").references(() => users.id),
  errorMessage: text("error_message"),
  tokensUsed: integer("tokens_used"),
  modelUsed: varchar("model_used"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertEnrichmentJobSchema = createInsertSchema(enrichmentJobs).omit({
  id: true,
  createdAt: true,
});

export type EnrichmentJob = typeof enrichmentJobs.$inferSelect;
export type InsertEnrichmentJob = z.infer<typeof insertEnrichmentJobSchema>;

// Batch Enrichment Jobs - track batch processing for deep research
export const batchEnrichmentJobs = pgTable("batch_enrichment_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: varchar("entity_type").notNull(), // firm, investor
  status: varchar("status").default("pending"), // pending, processing, completed, failed, cancelled
  totalRecords: integer("total_records").default(0),
  processedRecords: integer("processed_records").default(0),
  successfulRecords: integer("successful_records").default(0),
  failedRecords: integer("failed_records").default(0),
  batchSize: integer("batch_size").default(10),
  currentBatch: integer("current_batch").default(0),
  totalBatches: integer("total_batches").default(0),
  enrichmentType: varchar("enrichment_type").notNull(), // classification, full_enrichment
  filterCriteria: jsonb("filter_criteria").$type<Record<string, any>>().default({}),
  errorLog: jsonb("error_log").$type<Array<{entityId: string; error: string}>>().default([]),
  totalTokensUsed: integer("total_tokens_used").default(0),
  modelUsed: varchar("model_used"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBatchEnrichmentJobSchema = createInsertSchema(batchEnrichmentJobs).omit({
  id: true,
  createdAt: true,
});

export type BatchEnrichmentJob = typeof batchEnrichmentJobs.$inferSelect;
export type InsertBatchEnrichmentJob = z.infer<typeof insertBatchEnrichmentJobSchema>;

// Archived Investment Firms - stores less complete duplicates
export const archivedInvestmentFirms = pgTable("archived_investment_firms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalId: varchar("original_id"), // ID of the record before archiving
  mergedIntoId: varchar("merged_into_id"), // ID of the more complete record it was merged with
  name: varchar("name").notNull(),
  description: text("description"),
  website: varchar("website"),
  logo: varchar("logo"),
  type: varchar("type"),
  aum: varchar("aum"),
  location: varchar("location"),
  hqLocation: varchar("hq_location"),
  stages: jsonb("stages").$type<string[]>().default([]),
  sectors: jsonb("sectors").$type<string[]>().default([]),
  industry: varchar("industry"),
  checkSizeMin: integer("check_size_min"),
  checkSizeMax: integer("check_size_max"),
  portfolioCount: integer("portfolio_count"),
  linkedinUrl: varchar("linkedin_url"),
  twitterUrl: varchar("twitter_url"),
  emails: jsonb("emails").$type<Array<{value: string; type?: string}>>(),
  phones: jsonb("phones").$type<Array<{value: string; type?: string}>>(),
  addresses: jsonb("addresses").$type<Array<{value: string; type?: string}>>(),
  urls: jsonb("urls").$type<Array<{value: string; type?: string}>>(),
  fundingRaised: varchar("funding_raised"),
  lastFundingDate: varchar("last_funding_date"),
  foundationYear: varchar("foundation_year"),
  employeeRange: varchar("employee_range"),
  status: varchar("status"),
  folkId: varchar("folk_id"),
  folkWorkspaceId: varchar("folk_workspace_id"),
  folkListIds: jsonb("folk_list_ids").$type<string[]>().default([]),
  folkUpdatedAt: timestamp("folk_updated_at"),
  folkCustomFields: jsonb("folk_custom_fields").$type<Record<string, any>>(),
  source: varchar("source"),
  archiveReason: varchar("archive_reason"), // duplicate_less_complete, merged, manual
  fieldCount: integer("field_count"), // Number of non-null fields at time of archiving
  archivedAt: timestamp("archived_at").defaultNow(),
  archivedBy: varchar("archived_by").references(() => users.id),
});

export type ArchivedInvestmentFirm = typeof archivedInvestmentFirms.$inferSelect;

// Archived Investors - stores less complete duplicates
export const archivedInvestors = pgTable("archived_investors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalId: varchar("original_id"),
  mergedIntoId: varchar("merged_into_id"),
  firmId: varchar("firm_id"),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name"),
  email: varchar("email"),
  phone: varchar("phone"),
  title: varchar("title"),
  linkedinUrl: varchar("linkedin_url"),
  twitterUrl: varchar("twitter_url"),
  bio: text("bio"),
  location: varchar("location"),
  stages: jsonb("stages").$type<string[]>().default([]),
  sectors: jsonb("sectors").$type<string[]>().default([]),
  checkSizeMin: integer("check_size_min"),
  checkSizeMax: integer("check_size_max"),
  investorType: varchar("investor_type"),
  dealCount: integer("deal_count"),
  averageDealSize: integer("average_deal_size"),
  folkId: varchar("folk_id"),
  folkWorkspaceId: varchar("folk_workspace_id"),
  folkListIds: jsonb("folk_list_ids").$type<string[]>().default([]),
  folkUpdatedAt: timestamp("folk_updated_at"),
  folkCustomFields: jsonb("folk_custom_fields").$type<Record<string, any>>(),
  source: varchar("source"),
  archiveReason: varchar("archive_reason"),
  fieldCount: integer("field_count"),
  archivedAt: timestamp("archived_at").defaultNow(),
  archivedBy: varchar("archived_by").references(() => users.id),
});

export type ArchivedInvestor = typeof archivedInvestors.$inferSelect;

// Archived Contacts - stores less complete duplicates
export const archivedContacts = pgTable("archived_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalId: varchar("original_id"),
  mergedIntoId: varchar("merged_into_id"),
  ownerId: varchar("owner_id"),
  type: varchar("type"),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name"),
  email: varchar("email"),
  phone: varchar("phone"),
  company: varchar("company"),
  title: varchar("title"),
  linkedinUrl: varchar("linkedin_url"),
  twitterUrl: varchar("twitter_url"),
  website: varchar("website"),
  location: varchar("location"),
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>().default([]),
  source: varchar("source"),
  archiveReason: varchar("archive_reason"),
  fieldCount: integer("field_count"),
  archivedAt: timestamp("archived_at").defaultNow(),
  archivedBy: varchar("archived_by").references(() => users.id),
});

export type ArchivedContact = typeof archivedContacts.$inferSelect;

// Email Templates - reusable email templates for outreach
export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").references(() => users.id),
  name: varchar("name").notNull(),
  subject: varchar("subject").notNull(),
  body: text("body").notNull(),
  category: varchar("category").default("custom"), // intro, followup, thank_you, meeting_request, custom
  variables: jsonb("variables").$type<string[]>().default([]), // Available template variables
  isPublic: boolean("is_public").default(false), // Shared with team
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;

// Outreaches - track email outreach to investors
export const outreaches = pgTable("outreaches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").references(() => users.id),
  startupId: varchar("startup_id").references(() => startups.id),
  contactId: varchar("contact_id").references(() => contacts.id),
  firmId: varchar("firm_id").references(() => investmentFirms.id),
  investorId: varchar("investor_id").references(() => investors.id),
  templateId: varchar("template_id").references(() => emailTemplates.id),
  emailSubject: varchar("email_subject"),
  emailBody: text("email_body"),
  stage: varchar("stage").default("draft"), // draft, pitch_sent, opened, replied, call_scheduled, funded, passed
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  repliedAt: timestamp("replied_at"),
  scheduledCallAt: timestamp("scheduled_call_at"),
  notes: text("notes"),
  sentimentAnalysis: jsonb("sentiment_analysis").$type<{
    overall_sentiment?: string;
    confidence?: number;
    key_phrases?: string[];
  }>(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOutreachSchema = createInsertSchema(outreaches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Outreach = typeof outreaches.$inferSelect;
export type InsertOutreach = z.infer<typeof insertOutreachSchema>;

// Matches - investor-startup matching with AI scoring
export const matches = pgTable("matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  startupId: varchar("startup_id").references(() => startups.id).notNull(),
  firmId: varchar("firm_id").references(() => investmentFirms.id),
  investorId: varchar("investor_id").references(() => investors.id),
  contactId: varchar("contact_id").references(() => contacts.id),
  matchScore: integer("match_score"), // 0-100 score
  matchReasons: jsonb("match_reasons").$type<string[]>().default([]),
  status: varchar("status").default("suggested"), // suggested, saved, contacted, passed, converted
  founderNotes: text("founder_notes"),
  predictedInterest: integer("predicted_interest"), // 0-100 predicted investor interest
  userFeedback: jsonb("user_feedback").$type<{
    rating?: string; // positive, negative, neutral
    reason?: string;
    timestamp?: string;
  }>(),
  sentimentAnalysis: jsonb("sentiment_analysis").$type<{
    sentiment_score?: string;
    total_interactions?: number;
    positive_rate?: string;
  }>(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMatchSchema = createInsertSchema(matches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Match = typeof matches.$inferSelect;
export type InsertMatch = z.infer<typeof insertMatchSchema>;

// Interaction Logs - track all interactions with investors/contacts
export const interactionLogs = pgTable("interaction_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  outreachId: varchar("outreach_id").references(() => outreaches.id),
  startupId: varchar("startup_id").references(() => startups.id),
  contactId: varchar("contact_id").references(() => contacts.id),
  firmId: varchar("firm_id").references(() => investmentFirms.id),
  investorId: varchar("investor_id").references(() => investors.id),
  performedById: varchar("performed_by_id").references(() => users.id),
  type: varchar("type").notNull(), // email_sent, email_opened, email_replied, call, meeting, note
  subject: varchar("subject"),
  content: text("content"),
  performedByEmail: varchar("performed_by_email"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInteractionLogSchema = createInsertSchema(interactionLogs).omit({
  id: true,
  createdAt: true,
});

export type InteractionLog = typeof interactionLogs.$inferSelect;
export type InsertInteractionLog = z.infer<typeof insertInteractionLogSchema>;

// Notifications table for real-time updates
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: varchar("type").notNull(), // deal_update, deal_created, message_received, deal_stage_change, document_uploaded, milestone_completed
  title: varchar("title").notNull(),
  message: text("message"),
  resourceType: varchar("resource_type"), // deal, deal_room, message, document
  resourceId: varchar("resource_id"),
  isRead: boolean("is_read").default(false),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Accelerated Match Jobs - AI-powered pitch deck analysis and matching pipeline
export const acceleratedMatchJobs = pgTable("accelerated_match_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  founderId: varchar("founder_id").references(() => users.id).notNull(),
  startupId: varchar("startup_id").references(() => startups.id),
  pitchDeckUrl: varchar("pitch_deck_url"),
  status: varchar("status").default("pending"), // pending, analyzing_deck, enriching_team, generating_matches, complete, failed
  progress: integer("progress").default(0), // 0-100
  currentStep: varchar("current_step"),
  // Extracted data from pitch deck
  extractedData: jsonb("extracted_data").$type<{
    problem?: string;
    solution?: string;
    market?: string;
    businessModel?: string;
    traction?: string;
    team?: Array<{
      name?: string;
      role?: string;
      linkedinUrl?: string;
      background?: string;
    }>;
    competitors?: string[];
    askAmount?: string;
    useOfFunds?: string;
    websiteUrl?: string;
    companyName?: string;
    industries?: string[];
    stage?: string;
    location?: string;
  }>(),
  // Enriched team data from web searches
  enrichedTeam: jsonb("enriched_team").$type<Array<{
    name?: string;
    role?: string;
    linkedinUrl?: string;
    linkedinData?: {
      headline?: string;
      experience?: string[];
      education?: string[];
      skills?: string[];
    };
    twitterUrl?: string;
    otherProfiles?: string[];
  }>>(),
  // Match results
  matchResults: jsonb("match_results").$type<Array<{
    investorId?: string;
    investorName?: string;
    investorEmail?: string;
    firmName?: string;
    matchScore?: number;
    matchReasons?: string[];
    investorProfile?: Record<string, any>;
  }>>(),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertAcceleratedMatchJobSchema = createInsertSchema(acceleratedMatchJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export type AcceleratedMatchJob = typeof acceleratedMatchJobs.$inferSelect;
export type InsertAcceleratedMatchJob = z.infer<typeof insertAcceleratedMatchJobSchema>;

// Calendar Meetings for Networking
export const calendarMeetings = pgTable("calendar_meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  location: varchar("location"),
  meetingLink: varchar("meeting_link"),
  attendees: jsonb("attendees").$type<Array<{
    email: string;
    name?: string;
    status?: 'pending' | 'accepted' | 'declined';
  }>>().default([]),
  relatedInvestorId: varchar("related_investor_id").references(() => investors.id),
  relatedFirmId: varchar("related_firm_id").references(() => investmentFirms.id),
  relatedDealId: varchar("related_deal_id").references(() => deals.id),
  googleCalendarId: varchar("google_calendar_id"),
  googleEventId: varchar("google_event_id"),
  status: varchar("status").default("scheduled"), // scheduled, completed, cancelled
  meetingType: varchar("meeting_type").default("networking"), // networking, pitch, due_diligence, follow_up
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCalendarMeetingSchema = createInsertSchema(calendarMeetings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CalendarMeeting = typeof calendarMeetings.$inferSelect;
export type InsertCalendarMeeting = z.infer<typeof insertCalendarMeetingSchema>;

// User Email Settings for Gmail Integration
export const userEmailSettings = pgTable("user_email_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  senderEmail: varchar("sender_email"),
  senderName: varchar("sender_name"),
  gmailConnected: boolean("gmail_connected").default(false),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiry: timestamp("google_token_expiry"),
  calendarSyncEnabled: boolean("calendar_sync_enabled").default(false),
  emailSignature: text("email_signature"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserEmailSettingsSchema = createInsertSchema(userEmailSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserEmailSettings = typeof userEmailSettings.$inferSelect;
export type InsertUserEmailSettings = z.infer<typeof insertUserEmailSettingsSchema>;

// ==================== AI NEWSROOM TABLES ====================

// Content type taxonomy for newsroom (new categories)
export const NEWS_CONTENT_TYPES = ["insights", "trends", "guides", "analysis"] as const;
export type NewsContentType = typeof NEWS_CONTENT_TYPES[number];

// News Regions - Geographic regions for content filtering
export const newsRegions = pgTable("news_regions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code").notNull().unique(), // NA, EU, MENA, APAC, LATAM, AF
  name: varchar("name").notNull(), // North America, Europe, etc.
  isEnabled: boolean("is_enabled").default(true),
  coordinates: jsonb("coordinates").$type<{ lat: number; lng: number }>().default({ lat: 0, lng: 0 }),
  countries: text("countries").array().default(sql`'{}'::text[]`), // ISO country codes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNewsRegionSchema = createInsertSchema(newsRegions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type NewsRegion = typeof newsRegions.$inferSelect;
export type InsertNewsRegion = z.infer<typeof insertNewsRegionSchema>;

// News Sources - RSS feeds, APIs, web sources for content ingestion
export const newsSources = pgTable("news_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(), // rss, api, web_scrape
  url: varchar("url").notNull(),
  category: varchar("category").notNull(), // tier1_media, vc_pe_media, consulting, regulatory, institutional
  tier: varchar("tier").default("tier2"), // tier1, tier2, tier3 for source credibility
  isActive: boolean("is_active").default(true),
  isEnabled: boolean("is_enabled").default(true), // Admin toggle for source on/off
  contentTags: text("content_tags").array().default(sql`'{}'::text[]`), // insights, trends, guides, analysis
  regions: text("regions").array().default(sql`'{}'::text[]`), // Region codes this source covers
  fetchInterval: integer("fetch_interval").default(3600), // seconds between fetches
  lastFetchedAt: timestamp("last_fetched_at"),
  itemsFetched: integer("items_fetched").default(0),
  errorCount: integer("error_count").default(0),
  lastError: text("last_error"),
  config: jsonb("config").$type<{
    selector?: string;
    headers?: Record<string, string>;
    apiKey?: string;
    feedType?: string;
  }>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNewsSourceSchema = createInsertSchema(newsSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type NewsSource = typeof newsSources.$inferSelect;
export type InsertNewsSource = z.infer<typeof insertNewsSourceSchema>;

// News Source Items - Raw items fetched from sources before validation
export const newsSourceItems = pgTable("news_source_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id").references(() => newsSources.id).notNull(),
  externalId: varchar("external_id"), // unique ID from source (e.g., RSS guid)
  headline: varchar("headline").notNull(),
  summary: text("summary"),
  content: text("content"),
  sourceUrl: varchar("source_url").notNull(),
  publishedAt: timestamp("published_at"),
  entities: jsonb("entities").$type<{
    firms?: string[];
    funds?: string[];
    founders?: string[];
    investors?: string[];
  }>().default({}),
  capitalType: varchar("capital_type"), // VC, PE, Growth, FoF, IB, FO, SWF
  capitalStage: varchar("capital_stage"), // Pre-Seed, Seed, Series A-F, Late-Stage, Pre-IPO, IPO
  geography: varchar("geography"), // North America, Europe, MENA, APAC, LATAM, Africa
  eventType: varchar("event_type"), // Fund Close, Capital Raise, New Fund Launch, M&A, IPO, Regulatory, Strategy
  relevanceScore: real("relevance_score").default(0),
  validationStatus: varchar("validation_status").default("pending"), // pending, approved, hold, rejected
  validationNotes: text("validation_notes"),
  duplicateOf: varchar("duplicate_of"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNewsSourceItemSchema = createInsertSchema(newsSourceItems).omit({
  id: true,
  createdAt: true,
});

export type NewsSourceItem = typeof newsSourceItems.$inferSelect;
export type InsertNewsSourceItem = z.infer<typeof insertNewsSourceItemSchema>;

// News Articles - Published AI-generated articles
export const newsArticles = pgTable("news_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").notNull().unique(),
  headline: varchar("headline").notNull(),
  executiveSummary: text("executive_summary"), // 3-4 bullet points
  content: text("content").notNull(), // Full article 600-900 words
  author: varchar("author").default("Anker Intelligence"),
  blogType: varchar("blog_type").default("Insights"), // Insights, Trends, Guides, Analysis
  imageUrl: varchar("image_url"),
  capitalType: varchar("capital_type"), // VC, PE, Growth, FoF, IB, FO, SWF
  capitalStage: varchar("capital_stage"),
  geography: varchar("geography"),
  eventType: varchar("event_type"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  sources: jsonb("sources").$type<Array<{
    title: string;
    url: string;
    publisher: string;
    date: string;
    citation: string; // APA 7th edition format
  }>>().default([]),
  confidenceScore: real("confidence_score").default(0),
  aiModel: varchar("ai_model").default("mistral"),
  generationTimeMs: integer("generation_time_ms"),
  wordCount: integer("word_count"),
  status: varchar("status").default("draft"), // draft, scheduled, published, archived
  publishedAt: timestamp("published_at"),
  scheduledFor: timestamp("scheduled_for"),
  scheduledSlot: varchar("scheduled_slot"), // morning_8am, noon_12pm, afternoon_3pm, evening_9pm
  viewCount: integer("view_count").default(0),
  sourceItemIds: text("source_item_ids").array().default(sql`'{}'::text[]`), // Reference to source items used
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNewsArticleSchema = createInsertSchema(newsArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type NewsArticle = typeof newsArticles.$inferSelect;
export type InsertNewsArticle = z.infer<typeof insertNewsArticleSchema>;

// News Scheduled Posts - Publication queue with time slots
export const newsScheduledPosts = pgTable("news_scheduled_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduledDate: varchar("scheduled_date").notNull(), // YYYY-MM-DD
  slot: varchar("slot").notNull(), // morning_8am, noon_12pm, afternoon_3pm, evening_9pm
  contentType: varchar("content_type").notNull(), // macro_regulatory, vc_growth, pe_ib_ma, editorial_deep_dive
  articleId: varchar("article_id").references(() => newsArticles.id),
  status: varchar("status").default("pending"), // pending, generating, ready, published, skipped
  skipReason: text("skip_reason"), // Why slot was skipped (e.g., no quality content)
  generationAttempts: integer("generation_attempts").default(0),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNewsScheduledPostSchema = createInsertSchema(newsScheduledPosts).omit({
  id: true,
  createdAt: true,
});

export type NewsScheduledPost = typeof newsScheduledPosts.$inferSelect;
export type InsertNewsScheduledPost = z.infer<typeof insertNewsScheduledPostSchema>;

// News Generation Logs - AI generation history and debugging
export const newsGenerationLogs = pgTable("news_generation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => newsArticles.id),
  scheduledPostId: varchar("scheduled_post_id").references(() => newsScheduledPosts.id),
  agentType: varchar("agent_type").notNull(), // source_intelligence, signal_validation, editorial, citation, publisher
  action: varchar("action").notNull(), // fetch, validate, generate, cite, publish
  status: varchar("status").notNull(), // started, completed, failed
  inputData: jsonb("input_data").$type<Record<string, any>>().default({}),
  outputData: jsonb("output_data").$type<Record<string, any>>().default({}),
  promptUsed: text("prompt_used"),
  tokensUsed: integer("tokens_used"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNewsGenerationLogSchema = createInsertSchema(newsGenerationLogs).omit({
  id: true,
  createdAt: true,
});

export type NewsGenerationLog = typeof newsGenerationLogs.$inferSelect;
export type InsertNewsGenerationLog = z.infer<typeof insertNewsGenerationLogSchema>;

// ============================================
// AI INTERVIEW ASSISTANT TABLES
// ============================================

// Investor types for interview conditioning
export const INVESTOR_TYPES = [
  "Angel",
  "Syndicate",
  "Venture Capital",
  "Growth Equity",
  "Private Equity",
  "Fund of Funds",
  "Family Office",
  "Sovereign Wealth Fund",
  "Corporate VC",
  "Development Finance Institution",
] as const;

export type InvestorType = typeof INVESTOR_TYPES[number];

// Interview phases
export const INTERVIEW_PHASES = [
  "setup",
  "core_pitch",
  "investor_deep_dive",
  "risk_diligence",
  "wrap_up",
  "completed",
] as const;

export type InterviewPhase = typeof INTERVIEW_PHASES[number];

// Interviews - Main interview sessions
export const interviews = pgTable("interviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  founderId: varchar("founder_id").references(() => users.id).notNull(),
  startupId: varchar("startup_id").references(() => startups.id),
  
  // Founder profile data (captured at interview start)
  founderName: varchar("founder_name").notNull(),
  companyName: varchar("company_name").notNull(),
  role: varchar("role"), // CEO, CTO, Founder
  industry: varchar("industry"),
  hqLocation: varchar("hq_location"),
  incorporationCountry: varchar("incorporation_country"),
  stage: varchar("stage"), // Pre-Seed, Seed, Series A, etc.
  capitalRaisedToDate: varchar("capital_raised_to_date"),
  targetRaise: varchar("target_raise"),
  useOfFunds: text("use_of_funds"),
  revenue: varchar("revenue"),
  growthRate: varchar("growth_rate"),
  teamSize: integer("team_size"),
  previousExits: jsonb("previous_exits").$type<string[]>().default([]),
  
  // Target investor profile
  targetInvestorTypes: jsonb("target_investor_types").$type<string[]>().default([]),
  targetGeography: varchar("target_geography"),
  targetTicketSize: varchar("target_ticket_size"),
  investorStrategy: varchar("investor_strategy"), // strategic, financial, both
  
  // Pitch deck analysis
  pitchDeckUrl: varchar("pitch_deck_url"),
  deckAnalysis: jsonb("deck_analysis").$type<{
    clarityScore: number;
    consistencyFlags: string[];
    missingSections: string[];
    redFlags: string[];
    extractedData: {
      problemStatement?: string;
      solution?: string;
      marketSize?: string;
      businessModel?: string;
      traction?: string;
      competitiveLandscape?: string;
      ask?: string;
    };
  }>(),
  
  // Interview state
  phase: varchar("phase").default("setup"),
  currentQuestionIndex: integer("current_question_index").default(0),
  status: varchar("status").default("pending"), // pending, in_progress, completed, abandoned
  
  // Timestamps
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInterviewSchema = createInsertSchema(interviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Interview = typeof interviews.$inferSelect;
export type InsertInterview = z.infer<typeof insertInterviewSchema>;

// Interview Messages - Conversation history
export const interviewMessages = pgTable("interview_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  interviewId: varchar("interview_id").references(() => interviews.id).notNull(),
  role: varchar("role").notNull(), // system, assistant, user
  content: text("content").notNull(),
  phase: varchar("phase"), // Which interview phase this message belongs to
  questionType: varchar("question_type"), // problem_customer, solution_moat, market, traction, business_model, diligence
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInterviewMessageSchema = createInsertSchema(interviewMessages).omit({
  id: true,
  createdAt: true,
});

export type InterviewMessage = typeof interviewMessages.$inferSelect;
export type InsertInterviewMessage = z.infer<typeof insertInterviewMessageSchema>;

// Interview Scores - Evaluation results
export const interviewScores = pgTable("interview_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  interviewId: varchar("interview_id").references(() => interviews.id).notNull().unique(),
  
  // Core dimensions (weighted scoring)
  marketUnderstanding: integer("market_understanding"), // 0-100
  businessModel: integer("business_model"), // 0-100
  tractionMetrics: integer("traction_metrics"), // 0-100
  founderClarity: integer("founder_clarity"), // 0-100
  strategicFit: integer("strategic_fit"), // 0-100
  riskAwareness: integer("risk_awareness"), // 0-100
  
  // Overall
  overallScore: integer("overall_score"), // 0-100 weighted average
  investorReadiness: varchar("investor_readiness"), // Not Ready, Pre-Seed Ready, Seed Ready, Series A Ready, etc.
  
  // Diligence signals
  riskLevel: varchar("risk_level"), // Low, Medium, High
  keyConcerns: jsonb("key_concerns").$type<string[]>().default([]),
  followUpRequired: boolean("follow_up_required").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInterviewScoreSchema = createInsertSchema(interviewScores).omit({
  id: true,
  createdAt: true,
});

export type InterviewScore = typeof interviewScores.$inferSelect;
export type InsertInterviewScore = z.infer<typeof insertInterviewScoreSchema>;

// Interview Feedback - Detailed recommendations
export const interviewFeedback = pgTable("interview_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  interviewId: varchar("interview_id").references(() => interviews.id).notNull().unique(),
  
  // Investor-style feedback
  executiveSummary: text("executive_summary"),
  strengths: jsonb("strengths").$type<string[]>().default([]),
  criticalGaps: jsonb("critical_gaps").$type<string[]>().default([]),
  redFlags: jsonb("red_flags").$type<string[]>().default([]),
  
  // Recommendations
  deckImprovements: jsonb("deck_improvements").$type<string[]>().default([]),
  nextSteps: jsonb("next_steps").$type<string[]>().default([]),
  recommendedInvestorTypes: jsonb("recommended_investor_types").$type<string[]>().default([]),
  
  // Full written feedback (investor-style memo)
  fullFeedback: text("full_feedback"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInterviewFeedbackSchema = createInsertSchema(interviewFeedback).omit({
  id: true,
  createdAt: true,
});

export type InterviewFeedback = typeof interviewFeedback.$inferSelect;
export type InsertInterviewFeedback = z.infer<typeof insertInterviewFeedbackSchema>;
