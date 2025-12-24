import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // Onboarding fields
  userType: varchar("user_type"), // 'founder' or 'investor'
  onboardingCompleted: timestamp("onboarding_completed"),
  // Common profile fields
  companyName: varchar("company_name"),
  jobTitle: varchar("job_title"),
  linkedinUrl: varchar("linkedin_url"),
  phone: varchar("phone"),
  bio: text("bio"),
  // Founder-specific fields
  stage: varchar("stage"), // Pre-seed, Seed, Series A, etc.
  industries: jsonb("industries").$type<string[]>().default([]),
  location: varchar("location"),
  // Investor-specific fields
  firmRole: varchar("firm_role"),
  preferredStages: jsonb("preferred_stages").$type<string[]>().default([]),
  investmentFocus: jsonb("investment_focus").$type<string[]>().default([]),
  checkSizeMin: varchar("check_size_min"),
  checkSizeMax: varchar("check_size_max"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
