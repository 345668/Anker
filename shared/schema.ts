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
  hqLocation: varchar("hq_location"), // HQ Location from Folk
  stages: jsonb("stages").$type<string[]>().default([]), // Pre-seed, Seed, Series A, etc.
  sectors: jsonb("sectors").$type<string[]>().default([]), // SaaS, Fintech, Healthcare, etc.
  industry: varchar("industry"), // Industry from Folk
  checkSizeMin: integer("check_size_min"),
  checkSizeMax: integer("check_size_max"),
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
