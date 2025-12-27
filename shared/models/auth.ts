import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

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

// Admin email whitelist - users with these emails get admin access
export const ADMIN_EMAILS = [
  "vc@philippemasindet.com",
  "masindetphilippe@gmail.com",
  "philippemasindet@proton.me"
];

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  password: varchar("password"), // Hashed password for email/password auth
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // Admin flag - determined by email whitelist
  isAdmin: boolean("is_admin").default(false),
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

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
