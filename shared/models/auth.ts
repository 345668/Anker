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
  userType: varchar("user_type"), // 'founder' or 'investor' (legacy - now supports multiple roles)
  activeRole: varchar("active_role"), // Currently active role for role switching
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

// ============================================================================
// ENHANCED RBAC: Roles, Teams, and Permissions
// ============================================================================

// Available system roles
export const SYSTEM_ROLES = [
  "founder",
  "investor", 
  "admin",
  "team_owner",
  "team_editor",
  "team_viewer",
] as const;

export type SystemRole = typeof SYSTEM_ROLES[number];

// Roles table - defines available roles in the system
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull().unique(), // founder, investor, admin, team_owner, etc.
  description: text("description"),
  permissions: jsonb("permissions").$type<string[]>().default([]), // List of permission strings
  isSystemRole: boolean("is_system_role").default(true), // Built-in vs custom roles
  createdAt: timestamp("created_at").defaultNow(),
});

export type Role = typeof roles.$inferSelect;

// User-Role junction table - enables multiple roles per user
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  roleId: varchar("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  isActive: boolean("is_active").default(true), // Can deactivate without deleting
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserRole = typeof userRoles.$inferSelect;

// Teams/Organizations table
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  slug: varchar("slug").unique(), // URL-friendly identifier
  description: text("description"),
  type: varchar("type").notNull(), // startup, investment_firm, advisory, other
  logo: varchar("logo"),
  website: varchar("website"),
  ownerId: varchar("owner_id").references(() => users.id).notNull(),
  settings: jsonb("settings").$type<{
    allowMemberInvites?: boolean;
    defaultMemberRole?: string;
    visibility?: "public" | "private";
  }>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Team = typeof teams.$inferSelect;

// Team member roles
export const TEAM_MEMBER_ROLES = [
  "owner",     // Full control, can delete team
  "admin",     // Can manage members, edit all content
  "editor",    // Can create/edit content
  "viewer",    // Read-only access
] as const;

export type TeamMemberRole = typeof TEAM_MEMBER_ROLES[number];

// Team Members junction table
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").references(() => teams.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: varchar("role").$type<TeamMemberRole>().notNull().default("viewer"),
  permissions: jsonb("permissions").$type<string[]>().default([]), // Additional custom permissions
  invitedBy: varchar("invited_by").references(() => users.id),
  invitedAt: timestamp("invited_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export type TeamMember = typeof teamMembers.$inferSelect;

// Team invitations for pending members
export const teamInvitations = pgTable("team_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").references(() => teams.id, { onDelete: "cascade" }).notNull(),
  email: varchar("email").notNull(),
  role: varchar("role").$type<TeamMemberRole>().notNull().default("viewer"),
  token: varchar("token").notNull().unique(),
  invitedBy: varchar("invited_by").references(() => users.id).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type TeamInvitation = typeof teamInvitations.$inferSelect;

// Permission definitions for granular access control
export const PERMISSIONS = {
  // Deal permissions
  DEAL_READ: "deal:read",
  DEAL_WRITE: "deal:write",
  DEAL_DELETE: "deal:delete",
  DEAL_SHARE: "deal:share",
  // Startup permissions
  STARTUP_READ: "startup:read",
  STARTUP_WRITE: "startup:write",
  STARTUP_DELETE: "startup:delete",
  // Team permissions
  TEAM_MANAGE: "team:manage",
  TEAM_INVITE: "team:invite",
  TEAM_REMOVE: "team:remove",
  // Investor permissions
  INVESTOR_READ: "investor:read",
  INVESTOR_WRITE: "investor:write",
  INVESTOR_CONTACT: "investor:contact",
  // Deal room permissions
  DEALROOM_READ: "dealroom:read",
  DEALROOM_WRITE: "dealroom:write",
  DEALROOM_SHARE: "dealroom:share",
  // Admin permissions
  ADMIN_USERS: "admin:users",
  ADMIN_SETTINGS: "admin:settings",
  ADMIN_DATA: "admin:data",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Insert schemas for new tables
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
});
export type InsertRole = z.infer<typeof insertRoleSchema>;

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  createdAt: true,
});
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTeam = z.infer<typeof insertTeamSchema>;

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  createdAt: true,
  invitedAt: true,
});
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;

export const insertTeamInvitationSchema = createInsertSchema(teamInvitations).omit({
  id: true,
  createdAt: true,
});
export type InsertTeamInvitation = z.infer<typeof insertTeamInvitationSchema>;
