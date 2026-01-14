import { pgTable, text, serial, timestamp, boolean, jsonb, varchar, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { users, teams } from "./models/auth";

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
  // Enhanced profile fields for matching
  profileSummary: text("profile_summary"), // AI-generated summary from documents
  notes: text("notes"), // Founder notes and additional context
  onboardingData: jsonb("onboarding_data").$type<Record<string, any>>(), // Data from signup process
  matchingProfile: jsonb("matching_profile").$type<{
    industries?: string[];
    targetInvestorTypes?: string[];
    preferredCheckSize?: { min: number; max: number };
    geographicFocus?: string[];
    keyMetrics?: Record<string, any>;
    competitiveAdvantages?: string[];
    useCases?: string[];
  }>(), // Structured profile for matching
});

export const insertStartupSchema = createInsertSchema(startups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Startup = typeof startups.$inferSelect;
export type InsertStartup = z.infer<typeof insertStartupSchema>;

// Startup Document Types
export const DOCUMENT_TYPES = [
  "pitch_deck",
  "cap_table",
  "financials",
  "faq",
  "data_room",
  "term_sheet",
  "additional",
] as const;

export type DocumentType = typeof DOCUMENT_TYPES[number];

// Startup Documents table
export const startupDocuments = pgTable("startup_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  startupId: varchar("startup_id").references(() => startups.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type").$type<DocumentType>().notNull(), // pitch_deck, cap_table, financials, faq, data_room, additional
  name: varchar("name").notNull(),
  fileName: varchar("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  // Storage
  storageUrl: varchar("storage_url"), // URL if stored externally
  content: text("content"), // Extracted text content
  // Processing
  processingStatus: varchar("processing_status").default("pending"), // pending, processing, completed, failed
  extractedData: jsonb("extracted_data").$type<Record<string, any>>(), // Structured data extracted from document
  insights: jsonb("insights").$type<{
    summary?: string;
    keyPoints?: string[];
    metrics?: Record<string, any>;
    entities?: string[];
  }>(), // AI-generated insights
  // Meta
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const insertStartupDocumentSchema = createInsertSchema(startupDocuments).omit({
  id: true,
  uploadedAt: true,
  processedAt: true,
});

export type StartupDocument = typeof startupDocuments.$inferSelect;
export type InsertStartupDocument = z.infer<typeof insertStartupDocumentSchema>;

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
  "Fund House(AMCs) & IFSC",
  "Pension Fund",
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
  familyName: varchar("family_name"), // Family name from CSV (Name / Family column)
  email: varchar("email"),
  phone: varchar("phone"),
  title: varchar("title"),
  company: varchar("company"),
  flagshipCompany: varchar("flagship_company"), // Flagship Company / Group from CSV
  industry: varchar("industry"),
  businessSectors: text("business_sectors"), // Business Sector(s) from CSV
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
  coreAssets: text("core_assets"), // Core Assets from CSV
  influence: text("influence"), // Influence (Politics, Culture, Infra) from CSV
  notes: text("notes"),
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
  type: varchar("type").notNull(), // investor, founder, advisor, firm, other
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
  pipelineStage: varchar("pipeline_stage").default("sourced"), // sourced, first_review, deep_dive, due_diligence, term_sheet, closed
  lastContactedAt: timestamp("last_contacted_at"),
  // Source tracking fields
  sourceType: varchar("source_type"), // investor, firm, match, manual
  sourceInvestorId: varchar("source_investor_id").references(() => investors.id),
  sourceFirmId: varchar("source_firm_id").references(() => investmentFirms.id),
  sourceMatchId: varchar("source_match_id"),
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
  dealId: varchar("deal_id").references(() => deals.id), // Optional - standalone rooms allowed
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
  category: varchar("category").default("overview"), // overview, financials, legal, cap_table, market_strategy, technical_ip, esg
  disclosureLevel: varchar("disclosure_level").default("teaser"), // teaser, cim, detailed, confirmatory
  url: varchar("url"),
  size: integer("size"), // bytes
  mimeType: varchar("mime_type"),
  description: text("description"),
  version: integer("version").default(1),
  isWatermarked: boolean("is_watermarked").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Deal Room Access Grants - explicit per-investor access
export const dealRoomAccessGrants = pgTable("deal_room_access_grants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").references(() => dealRooms.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  investorId: varchar("investor_id").references(() => investors.id),
  firmId: varchar("firm_id").references(() => investmentFirms.id),
  disclosureLevel: varchar("disclosure_level").default("teaser"), // teaser, cim, detailed, confirmatory
  permissions: jsonb("permissions").$type<{
    view: boolean;
    download: boolean;
    comment: boolean;
  }>().default({ view: true, download: false, comment: true }),
  status: varchar("status").default("pending"), // pending, approved, revoked
  grantedAt: timestamp("granted_at"),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDealRoomAccessGrantSchema = createInsertSchema(dealRoomAccessGrants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DealRoomAccessGrant = typeof dealRoomAccessGrants.$inferSelect;
export type InsertDealRoomAccessGrant = z.infer<typeof insertDealRoomAccessGrantSchema>;

// Deal Room NDA Agreements
export const dealRoomNdaAgreements = pgTable("deal_room_nda_agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").references(() => dealRooms.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  ndaVersion: varchar("nda_version").default("1.0"),
  acceptedAt: timestamp("accepted_at").notNull(),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  signatureData: text("signature_data"), // digital signature or consent text
  status: varchar("status").default("active"), // active, superseded, revoked
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDealRoomNdaAgreementSchema = createInsertSchema(dealRoomNdaAgreements).omit({
  id: true,
  createdAt: true,
});

export type DealRoomNdaAgreement = typeof dealRoomNdaAgreements.$inferSelect;
export type InsertDealRoomNdaAgreement = z.infer<typeof insertDealRoomNdaAgreementSchema>;

// Deal Room Audit Events - comprehensive activity logging
export const dealRoomAuditEvents = pgTable("deal_room_audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").references(() => dealRooms.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: varchar("action").notNull(), // view, download, upload, delete, access_granted, access_revoked, nda_signed
  targetType: varchar("target_type"), // document, room, access_grant
  targetId: varchar("target_id"),
  metadata: jsonb("metadata").$type<{
    documentName?: string;
    timeSpentSeconds?: number;
    ipAddress?: string;
    userAgent?: string;
    disclosureLevel?: string;
  }>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDealRoomAuditEventSchema = createInsertSchema(dealRoomAuditEvents).omit({
  id: true,
  createdAt: true,
});

export type DealRoomAuditEvent = typeof dealRoomAuditEvents.$inferSelect;
export type InsertDealRoomAuditEvent = z.infer<typeof insertDealRoomAuditEventSchema>;

// Deal Room Q&A - structured diligence communication
export const dealRoomQuestions = pgTable("deal_room_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").references(() => dealRooms.id).notNull(),
  askedBy: varchar("asked_by").references(() => users.id).notNull(),
  documentId: varchar("document_id").references(() => dealRoomDocuments.id),
  question: text("question").notNull(),
  answer: text("answer"),
  answeredBy: varchar("answered_by").references(() => users.id),
  answeredAt: timestamp("answered_at"),
  isPrivate: boolean("is_private").default(false), // private to asker or shared
  isPublished: boolean("is_published").default(false), // published to all investors
  category: varchar("category"), // financials, legal, operations, market, team
  status: varchar("status").default("pending"), // pending, answered, closed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDealRoomQuestionSchema = createInsertSchema(dealRoomQuestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DealRoomQuestion = typeof dealRoomQuestions.$inferSelect;
export type InsertDealRoomQuestion = z.infer<typeof insertDealRoomQuestionSchema>;

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

// URL Health Check Classifications
export const URL_HEALTH_STATUS = [
  "valid",
  "redirected", 
  "parked",
  "expired",
  "unreachable",
  "pending",
  "unknown"
] as const;

export type UrlHealthStatus = typeof URL_HEALTH_STATUS[number];

// URL Health Checks - Track URL validation status across entities
export const urlHealthChecks = pgTable("url_health_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: varchar("entity_type").notNull(), // investmentFirm, investor, businessman
  entityId: varchar("entity_id").notNull(),
  fieldName: varchar("field_name").notNull(), // website, linkedinUrl, etc.
  originalUrl: text("original_url"),
  canonicalUrl: text("canonical_url"), // After redirect resolution
  httpStatus: integer("http_status"),
  redirectChain: jsonb("redirect_chain").$type<string[]>().default([]),
  healthStatus: varchar("health_status").$type<UrlHealthStatus>().default("pending"),
  confidence: real("confidence").default(0),
  
  // Classification signals
  isParkedDomain: boolean("is_parked_domain").default(false),
  isExpired: boolean("is_expired").default(false),
  hasLoginOnly: boolean("has_login_only").default(false),
  domainAge: integer("domain_age"), // Days
  contentLength: integer("content_length"),
  pageTitle: text("page_title"),
  
  // Processing metadata
  lastCheckedAt: timestamp("last_checked_at"),
  checkCount: integer("check_count").default(0),
  errorMessage: text("error_message"),
  processingState: varchar("processing_state").default("pending"), // pending, processing, completed, failed
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUrlHealthCheckSchema = createInsertSchema(urlHealthChecks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UrlHealthCheck = typeof urlHealthChecks.$inferSelect;
export type InsertUrlHealthCheck = z.infer<typeof insertUrlHealthCheckSchema>;

// URL Repair Candidates - Search-derived replacement URLs
export const urlRepairCandidates = pgTable("url_repair_candidates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  healthCheckId: varchar("health_check_id").references(() => urlHealthChecks.id).notNull(),
  candidateUrl: text("candidate_url").notNull(),
  source: varchar("source"), // google_search, bing_search, linkedin, crunchbase, manual
  rankingScore: real("ranking_score").default(0),
  
  // Scoring features
  domainSimilarity: real("domain_similarity").default(0),
  nameMatchScore: real("name_match_score").default(0),
  isHttps: boolean("is_https").default(false),
  appearsOnLinkedIn: boolean("appears_on_linkedin").default(false),
  
  // Admin disposition
  disposition: varchar("disposition").default("pending"), // pending, approved, rejected, ignored
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUrlRepairCandidateSchema = createInsertSchema(urlRepairCandidates).omit({
  id: true,
  createdAt: true,
});

export type UrlRepairCandidate = typeof urlRepairCandidates.$inferSelect;
export type InsertUrlRepairCandidate = z.infer<typeof insertUrlRepairCandidateSchema>;

// URL Health Jobs - Batch processing jobs
export const urlHealthJobs = pgTable("url_health_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityScope: varchar("entity_scope").notNull(), // all, investmentFirms, investors, businessmen
  status: varchar("status").default("pending"), // pending, running, completed, failed, cancelled
  
  // Counts
  totalRecords: integer("total_records").default(0),
  processedRecords: integer("processed_records").default(0),
  validUrls: integer("valid_urls").default(0),
  brokenUrls: integer("broken_urls").default(0),
  repairedUrls: integer("repaired_urls").default(0),
  pendingReview: integer("pending_review").default(0),
  
  // Options
  includeAutoFix: boolean("include_auto_fix").default(true),
  confidenceThreshold: real("confidence_threshold").default(0.85),
  
  // Metadata
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  startedBy: varchar("started_by"),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUrlHealthJobSchema = createInsertSchema(urlHealthJobs).omit({
  id: true,
  createdAt: true,
});

export type UrlHealthJob = typeof urlHealthJobs.$inferSelect;
export type InsertUrlHealthJob = z.infer<typeof insertUrlHealthJobSchema>;

// ==================== RESEARCH INTELLIGENCE & IC MEMO SYSTEM ====================

// Source Trust Tiers - For investor-grade weighting
export const SOURCE_TIERS = {
  tier1_consulting: { weight: 0.95, label: "Tier 1 Consulting", sources: ["mckinsey", "bcg", "bain"] },
  tier2_big4: { weight: 0.85, label: "Big 4", sources: ["kpmg", "pwc", "deloitte", "ey"] },
  tier3_regulatory: { weight: 0.90, label: "Regulatory", sources: ["sec", "oecd", "worldbank", "ecb"] },
  tier4_market_data: { weight: 0.65, label: "Market Data", sources: ["pitchbook", "crunchbase", "dealroom"] },
  tier5_media: { weight: 0.40, label: "Media", sources: ["techcrunch", "bloomberg", "reuters"] },
} as const;

export type SourceTierKey = keyof typeof SOURCE_TIERS;

// Research Organizations - Consulting firms, regulators, publishers
export const researchOrganizations = pgTable("research_organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  slug: varchar("slug").notNull().unique(),
  orgType: varchar("org_type").notNull(), // consulting, audit, publisher, regulator, fund
  tier: varchar("tier").notNull(), // tier1_consulting, tier2_big4, tier3_regulatory, etc.
  trustWeight: real("trust_weight").default(0.5), // 0-1 source credibility weight
  officialWebsite: varchar("official_website"),
  verifiedWebsite: varchar("verified_website"),
  websiteConfidence: real("website_confidence").default(0),
  country: varchar("country"),
  isActive: boolean("is_active").default(true),
  crawlPolicy: jsonb("crawl_policy").$type<{
    allowPaths: string[];
    denyPaths: string[];
    maxDepth: number;
    rateLimit: number; // requests per minute
    obeyRobotsTxt: boolean;
    noLoginBypass: boolean;
    noPaywallBypass: boolean;
  }>().default({
    allowPaths: ["/insights", "/publications", "/reports"],
    denyPaths: ["/login", "/subscribe", "/premium", "/api"],
    maxDepth: 3,
    rateLimit: 30,
    obeyRobotsTxt: true,
    noLoginBypass: true,
    noPaywallBypass: true,
  }),
  lastVerifiedAt: timestamp("last_verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertResearchOrganizationSchema = createInsertSchema(researchOrganizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ResearchOrganization = typeof researchOrganizations.$inferSelect;
export type InsertResearchOrganization = z.infer<typeof insertResearchOrganizationSchema>;

// Research Documents - Reports, whitepapers, insights from consulting firms
export const researchDocuments = pgTable("research_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => researchOrganizations.id),
  sourceType: varchar("source_type").notNull(), // mckinsey, bcg, bain, kpmg, pwc, deloitte, ey, sec, third_party
  title: varchar("title").notNull(),
  documentType: varchar("document_type").notNull(), // report, whitepaper, insight, benchmark, analysis, press_release
  publicationDate: timestamp("publication_date"),
  url: varchar("url").notNull(),
  pdfUrl: varchar("pdf_url"),
  hashSha256: varchar("hash_sha256"), // For deduplication
  language: varchar("language").default("en"),
  
  // Investment-relevant metadata
  sectors: text("sectors").array().default(sql`'{}'::text[]`), // AI, Healthcare, FinTech, etc.
  subsectors: text("subsectors").array().default(sql`'{}'::text[]`),
  geography: text("geography").array().default(sql`'{}'::text[]`), // Europe, US, APAC, etc.
  timeHorizon: varchar("time_horizon"), // 2025-2030, Q1 2026, etc.
  
  // Extracted metrics
  extractedMetrics: jsonb("extracted_metrics").$type<{
    marketSize?: string;
    cagr?: string;
    valuation?: string;
    fundingTrend?: string;
    keyDrivers?: string[];
    riskFactors?: string[];
  }>().default({}),
  
  // Source confidence
  confidenceScore: real("confidence_score").default(0), // Combined weighting
  corroborationCount: integer("corroboration_count").default(0), // How many sources confirm
  recencyFactor: real("recency_factor").default(1), // Decay based on age
  
  // Processing state
  crawledAt: timestamp("crawled_at"),
  processedAt: timestamp("processed_at"),
  processingStatus: varchar("processing_status").default("pending"), // pending, processing, completed, failed
  chunkCount: integer("chunk_count").default(0),
  wordCount: integer("word_count"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertResearchDocumentSchema = createInsertSchema(researchDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ResearchDocument = typeof researchDocuments.$inferSelect;
export type InsertResearchDocument = z.infer<typeof insertResearchDocumentSchema>;

// Document Chunks - Vector-ready text segments for RAG
export const documentChunks = pgTable("document_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").references(() => researchDocuments.id).notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  startOffset: integer("start_offset"),
  endOffset: integer("end_offset"),
  
  // For future vector search - storing embedding metadata
  embeddingModel: varchar("embedding_model"), // e.g., "text-embedding-3-small"
  embeddingDim: integer("embedding_dim"),
  
  // Chunk metadata for retrieval
  sectionTitle: varchar("section_title"),
  hasMetrics: boolean("has_metrics").default(false),
  hasCitations: boolean("has_citations").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDocumentChunkSchema = createInsertSchema(documentChunks).omit({
  id: true,
  createdAt: true,
});

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;

// Investment Signals - Extracted market intelligence from documents
export const investmentSignals = pgTable("investment_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").references(() => researchDocuments.id),
  signalType: varchar("signal_type").notNull(), // market_size, growth_rate, risk, trend, regulatory, timing
  signalCategory: varchar("signal_category"), // TAM, SAM, SOM, CAGR, margin, adoption
  sector: varchar("sector"),
  geography: varchar("geography"),
  rawText: text("raw_text").notNull(),
  normalizedValue: varchar("normalized_value"),
  unit: varchar("unit"), // %, $B, CAGR
  timeframe: varchar("timeframe"), // 2025-2030, Q4 2024
  confidenceScore: real("confidence_score").default(0),
  sourceWeight: real("source_weight").default(0),
  extractedBy: varchar("extracted_by").default("ai"), // ai, manual
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvestmentSignalSchema = createInsertSchema(investmentSignals).omit({
  id: true,
  createdAt: true,
});

export type InvestmentSignal = typeof investmentSignals.$inferSelect;
export type InsertInvestmentSignal = z.infer<typeof insertInvestmentSignalSchema>;

// Investment Cases - Target companies being evaluated
export const investmentCases = pgTable("investment_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdBy: varchar("created_by").references(() => users.id),
  companyName: varchar("company_name").notNull(),
  companyDescription: text("company_description"),
  sector: varchar("sector").notNull(),
  subsector: varchar("subsector"),
  stage: varchar("stage").notNull(), // Pre-Seed, Seed, Series A-F, Growth, Late-Stage
  dealType: varchar("deal_type"), // Primary, Secondary, M&A, IPO
  geography: varchar("geography"),
  targetValuation: varchar("target_valuation"),
  dealSize: varchar("deal_size"),
  
  // Company data
  website: varchar("website"),
  foundedYear: integer("founded_year"),
  teamSize: integer("team_size"),
  revenue: varchar("revenue"),
  growthRate: varchar("growth_rate"),
  keyMetrics: jsonb("key_metrics").$type<Record<string, string>>().default({}),
  
  // Pitch claims to verify
  claimedTam: varchar("claimed_tam"),
  claimedSam: varchar("claimed_sam"),
  claimedGrowth: varchar("claimed_growth"),
  
  // Status
  status: varchar("status").default("draft"), // draft, under_review, approved, rejected, closed
  assignedTo: varchar("assigned_to").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInvestmentCaseSchema = createInsertSchema(investmentCases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InvestmentCase = typeof investmentCases.$inferSelect;
export type InsertInvestmentCase = z.infer<typeof insertInvestmentCaseSchema>;

// IC Memos - AI-generated investment committee memorandums
export const icMemos = pgTable("ic_memos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investmentCaseId: varchar("investment_case_id").references(() => investmentCases.id).notNull(),
  version: integer("version").default(1),
  
  // Memo content
  executiveSummary: text("executive_summary"),
  marketAnalysis: text("market_analysis"),
  competitiveLandscape: text("competitive_landscape"),
  riskAssessment: text("risk_assessment"),
  investmentThesis: text("investment_thesis"),
  recommendation: text("recommendation"),
  appendix: text("appendix"),
  
  // Structured data
  keyMetrics: jsonb("key_metrics").$type<{
    marketSize?: string;
    cagr?: string;
    competitorCount?: number;
    riskLevel?: string;
  }>().default({}),
  
  // Source citations with confidence
  sources: jsonb("sources").$type<Array<{
    documentId: string;
    title: string;
    organization: string;
    tier: string;
    weight: number;
    citation: string;
    usedFor: string; // which section
  }>>().default([]),
  
  // Confidence scoring
  confidenceScore: real("confidence_score").default(0), // Weighted average of sources
  corroborationFactor: real("corroboration_factor").default(0), // Multi-source confirmation
  recencyFactor: real("recency_factor").default(0), // Data freshness
  
  // Generation metadata
  aiModel: varchar("ai_model").default("mistral"),
  generationTimeMs: integer("generation_time_ms"),
  tokensUsed: integer("tokens_used"),
  wordCount: integer("word_count"),
  
  // Approval workflow
  status: varchar("status").default("draft"), // draft, pending_review, approved, rejected
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  reviewNotes: text("review_notes"),
  
  // Human edits tracking
  humanRevisionVersion: integer("human_revision_version").default(0),
  lastEditedBy: varchar("last_edited_by").references(() => users.id),
  lastEditedAt: timestamp("last_edited_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertIcMemoSchema = createInsertSchema(icMemos).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type IcMemo = typeof icMemos.$inferSelect;
export type InsertIcMemo = z.infer<typeof insertIcMemoSchema>;

// Research Crawl Logs - Audit trail for compliance
export const researchCrawlLogs = pgTable("research_crawl_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => researchOrganizations.id),
  url: varchar("url").notNull(),
  action: varchar("action").notNull(), // crawl, download, parse, skip, block
  status: varchar("status").notNull(), // success, failed, blocked, rate_limited
  httpStatus: integer("http_status"),
  
  // Compliance tracking
  robotsTxtChecked: boolean("robots_txt_checked").default(false),
  robotsTxtAllowed: boolean("robots_txt_allowed"),
  policyViolation: varchar("policy_violation"), // login_bypass, paywall_bypass, rate_exceeded
  
  // Metadata
  contentType: varchar("content_type"),
  contentLength: integer("content_length"),
  documentId: varchar("document_id").references(() => researchDocuments.id),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertResearchCrawlLogSchema = createInsertSchema(researchCrawlLogs).omit({
  id: true,
  createdAt: true,
});

export type ResearchCrawlLog = typeof researchCrawlLogs.$inferSelect;
export type InsertResearchCrawlLog = z.infer<typeof insertResearchCrawlLogSchema>;

// Database Backups - Track backup snapshots
export const databaseBackups = pgTable("database_backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  environment: varchar("environment").notNull().default("development"), // development, production
  status: varchar("status").notNull().default("pending"), // pending, in_progress, completed, failed, restored
  
  // Backup metadata
  backupType: varchar("backup_type").notNull().default("manual"), // manual, scheduled, pre_migration
  tables: jsonb("tables").$type<string[]>().default([]),
  recordCounts: jsonb("record_counts").$type<Record<string, number>>().default({}),
  
  // Actual backup data stored as JSON
  backupData: jsonb("backup_data").$type<Record<string, any[]>>(),
  
  // Storage
  filePath: varchar("file_path"),
  fileSize: integer("file_size"), // in bytes
  checksum: varchar("checksum"),
  
  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  restoredAt: timestamp("restored_at"),
  
  // User tracking
  createdBy: varchar("created_by").references(() => users.id),
  restoredBy: varchar("restored_by").references(() => users.id),
  
  // Error handling
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDatabaseBackupSchema = createInsertSchema(databaseBackups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DatabaseBackup = typeof databaseBackups.$inferSelect;
export type InsertDatabaseBackup = z.infer<typeof insertDatabaseBackupSchema>;

// ==========================================
// INSTITUTIONAL INVESTOR FEATURES
// ==========================================

// Funds - Investment funds managed by firms
export const funds = pgTable("funds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firmId: varchar("firm_id").references(() => investmentFirms.id).notNull(),
  teamId: varchar("team_id").references(() => teams.id),
  name: varchar("name").notNull(),
  description: text("description"),
  fundType: varchar("fund_type").notNull().default("venture"), // venture, growth, buyout, seed, opportunity
  status: varchar("status").notNull().default("active"), // active, closed, fundraising, fully_deployed
  vintage: integer("vintage"), // Year the fund was established
  targetSize: integer("target_size"), // Target fund size in dollars
  committedCapital: integer("committed_capital"), // Total LP commitments
  calledCapital: integer("called_capital"), // Capital drawn from LPs
  distributedCapital: integer("distributed_capital"), // Capital returned to LPs
  managementFee: real("management_fee"), // Management fee percentage (e.g., 2.0)
  carriedInterest: real("carried_interest"), // Carry percentage (e.g., 20.0)
  investmentPeriod: integer("investment_period"), // Investment period in years
  fundLife: integer("fund_life"), // Total fund life in years
  currency: varchar("currency").default("USD"),
  focusSectors: jsonb("focus_sectors").$type<string[]>().default([]),
  focusStages: jsonb("focus_stages").$type<string[]>().default([]),
  focusGeographies: jsonb("focus_geographies").$type<string[]>().default([]),
  minInvestment: integer("min_investment"),
  maxInvestment: integer("max_investment"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFundSchema = createInsertSchema(funds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Fund = typeof funds.$inferSelect;
export type InsertFund = z.infer<typeof insertFundSchema>;

// Fund Investments - Portfolio company investments
export const fundInvestments = pgTable("fund_investments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fundId: varchar("fund_id").references(() => funds.id).notNull(),
  startupId: varchar("startup_id").references(() => startups.id),
  dealId: varchar("deal_id").references(() => deals.id),
  companyName: varchar("company_name").notNull(), // In case startup doesn't exist
  investmentDate: timestamp("investment_date").notNull(),
  roundType: varchar("round_type"), // seed, series_a, series_b, etc.
  investedAmount: integer("invested_amount").notNull(),
  ownershipPercentage: real("ownership_percentage"), // Ownership stake
  preMoneyValuation: integer("pre_money_valuation"),
  postMoneyValuation: integer("post_money_valuation"),
  currentValuation: integer("current_valuation"), // Latest fair market value
  unrealizedValue: integer("unrealized_value"), // Current FMV of holding
  realizedValue: integer("realized_value"), // Value from exits/distributions
  status: varchar("status").notNull().default("active"), // active, exited, written_off
  exitDate: timestamp("exit_date"),
  exitType: varchar("exit_type"), // ipo, acquisition, secondary, write_off
  exitValuation: integer("exit_valuation"),
  multipleOnInvestment: real("multiple_on_investment"), // MOIC
  irr: real("irr"), // Internal Rate of Return
  boardSeat: boolean("board_seat").default(false),
  leadInvestor: boolean("lead_investor").default(false),
  notes: text("notes"),
  sector: varchar("sector"),
  geography: varchar("geography"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFundInvestmentSchema = createInsertSchema(fundInvestments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type FundInvestment = typeof fundInvestments.$inferSelect;
export type InsertFundInvestment = z.infer<typeof insertFundInvestmentSchema>;

// Portfolio Metrics - Quarterly/periodic performance snapshots
export const portfolioMetrics = pgTable("portfolio_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fundId: varchar("fund_id").references(() => funds.id).notNull(),
  periodEnd: timestamp("period_end").notNull(), // End of reporting period
  periodType: varchar("period_type").notNull().default("quarterly"), // quarterly, annual, monthly
  nav: integer("nav"), // Net Asset Value
  totalValue: integer("total_value"), // Total portfolio value
  totalCost: integer("total_cost"), // Total invested capital
  dpi: real("dpi"), // Distributions to Paid-In (realized return)
  rvpi: real("rvpi"), // Residual Value to Paid-In (unrealized return)
  tvpi: real("tvpi"), // Total Value to Paid-In (total return multiple)
  irr: real("irr"), // Net IRR
  grossIrr: real("gross_irr"), // Gross IRR
  pme: real("pme"), // Public Market Equivalent
  portfolioCompanyCount: integer("portfolio_company_count"),
  activeCompanyCount: integer("active_company_count"),
  exitedCompanyCount: integer("exited_company_count"),
  writtenOffCount: integer("written_off_count"),
  calledToDate: integer("called_to_date"),
  distributedToDate: integer("distributed_to_date"),
  remainingUnfunded: integer("remaining_unfunded"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPortfolioMetricsSchema = createInsertSchema(portfolioMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PortfolioMetrics = typeof portfolioMetrics.$inferSelect;
export type InsertPortfolioMetrics = z.infer<typeof insertPortfolioMetricsSchema>;

// LP Entities - Limited Partners
export const lpEntities = pgTable("lp_entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firmId: varchar("firm_id").references(() => investmentFirms.id).notNull(),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(), // individual, family_office, pension, endowment, foundation, fund_of_funds, sovereign_wealth, insurance, corporate, hni
  contactName: varchar("contact_name"),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  address: text("address"),
  country: varchar("country"),
  taxId: varchar("tax_id"),
  status: varchar("status").default("active"), // active, prospect, inactive
  kycStatus: varchar("kyc_status").default("pending"), // pending, approved, expired
  accreditedInvestor: boolean("accredited_investor").default(false),
  qualifiedPurchaser: boolean("qualified_purchaser").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLpEntitySchema = createInsertSchema(lpEntities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LpEntity = typeof lpEntities.$inferSelect;
export type InsertLpEntity = z.infer<typeof insertLpEntitySchema>;

// LP Commitments - Capital commitments from LPs to funds
export const lpCommitments = pgTable("lp_commitments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lpId: varchar("lp_id").references(() => lpEntities.id).notNull(),
  fundId: varchar("fund_id").references(() => funds.id).notNull(),
  commitmentAmount: integer("commitment_amount").notNull(),
  calledAmount: integer("called_amount").default(0),
  uncalledAmount: integer("uncalled_amount"),
  distributedAmount: integer("distributed_amount").default(0),
  commitmentDate: timestamp("commitment_date").notNull(),
  status: varchar("status").default("active"), // active, fully_called, closed
  ownershipPercentage: real("ownership_percentage"), // Share of fund
  managementFeeRate: real("management_fee_rate"), // LP-specific fee if different
  carryRate: real("carry_rate"), // LP-specific carry if different
  sideLetter: boolean("side_letter").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLpCommitmentSchema = createInsertSchema(lpCommitments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LpCommitment = typeof lpCommitments.$inferSelect;
export type InsertLpCommitment = z.infer<typeof insertLpCommitmentSchema>;

// LP Capital Calls - Capital call notices to LPs
export const lpCapitalCalls = pgTable("lp_capital_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fundId: varchar("fund_id").references(() => funds.id).notNull(),
  callNumber: integer("call_number").notNull(),
  callDate: timestamp("call_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  totalAmount: integer("total_amount").notNull(),
  purpose: varchar("purpose"), // investment, fees, expenses
  investmentName: varchar("investment_name"), // Name of portfolio company if for investment
  status: varchar("status").default("pending"), // pending, paid, overdue, cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLpCapitalCallSchema = createInsertSchema(lpCapitalCalls).omit({
  id: true,
  createdAt: true,
});

export type LpCapitalCall = typeof lpCapitalCalls.$inferSelect;
export type InsertLpCapitalCall = z.infer<typeof insertLpCapitalCallSchema>;

// LP Distributions - Capital returned to LPs
export const lpDistributions = pgTable("lp_distributions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fundId: varchar("fund_id").references(() => funds.id).notNull(),
  distributionDate: timestamp("distribution_date").notNull(),
  totalAmount: integer("total_amount").notNull(),
  distributionType: varchar("distribution_type").notNull(), // return_of_capital, profit, recallable
  source: varchar("source"), // exit, dividend, other
  portfolioCompanyName: varchar("portfolio_company_name"), // Source company if from exit
  investmentId: varchar("investment_id").references(() => fundInvestments.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLpDistributionSchema = createInsertSchema(lpDistributions).omit({
  id: true,
  createdAt: true,
});

export type LpDistribution = typeof lpDistributions.$inferSelect;
export type InsertLpDistribution = z.infer<typeof insertLpDistributionSchema>;

// LP Reports - Generated reports for LPs
export const lpReports = pgTable("lp_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fundId: varchar("fund_id").references(() => funds.id).notNull(),
  reportType: varchar("report_type").notNull(), // quarterly, annual, capital_call, distribution, k1
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  title: varchar("title").notNull(),
  status: varchar("status").default("draft"), // draft, pending_review, approved, published
  generatedBy: varchar("generated_by").references(() => users.id),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  pdfUrl: varchar("pdf_url"),
  fileSize: integer("file_size"),
  sentToLps: boolean("sent_to_lps").default(false),
  sentAt: timestamp("sent_at"),
  notes: text("notes"),
  reportData: jsonb("report_data").$type<Record<string, any>>(), // Cached report data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLpReportSchema = createInsertSchema(lpReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LpReport = typeof lpReports.$inferSelect;
export type InsertLpReport = z.infer<typeof insertLpReportSchema>;

// Fund Analytics Snapshots - Pre-computed analytics for dashboards
export const fundAnalyticsSnapshots = pgTable("fund_analytics_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fundId: varchar("fund_id").references(() => funds.id).notNull(),
  snapshotDate: timestamp("snapshot_date").notNull(),
  metrics: jsonb("metrics").$type<{
    totalInvested: number;
    totalValue: number;
    tvpi: number;
    dpi: number;
    irr: number;
    portfolioCount: number;
    sectorAllocation: Record<string, number>;
    stageAllocation: Record<string, number>;
    geographyAllocation: Record<string, number>;
    vintagePerformance: Record<string, number>;
    topPerformers: Array<{name: string; moic: number; irr: number}>;
    pipelineStats: {leads: number; active: number; closed: number};
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFundAnalyticsSnapshotSchema = createInsertSchema(fundAnalyticsSnapshots).omit({
  id: true,
  createdAt: true,
});

export type FundAnalyticsSnapshot = typeof fundAnalyticsSnapshots.$inferSelect;
export type InsertFundAnalyticsSnapshot = z.infer<typeof insertFundAnalyticsSnapshotSchema>;
