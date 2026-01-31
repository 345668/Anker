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
  // PDF upload support
  sourceType: varchar("source_type").default("ai"), // ai, pdf_upload, rss, api
  pdfObjectPath: varchar("pdf_object_path"), // Object storage path for uploaded PDF
  pdfFilename: varchar("pdf_filename"), // Original filename of uploaded PDF
  extractedText: text("extracted_text"), // Text extracted from PDF
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