/**
 * shared/schema-additions.ts
 *
 * ADD THESE FIELDS to the existing tables in shared/schema.ts
 * All column names match what onboarding-routes.ts and auth-routes.ts write.
 *
 * After editing schema.ts, run:  npm run db:push
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. USERS TABLE  (extend existing users table)
// ─────────────────────────────────────────────────────────────────────────────
//
// Add these fields to the existing pgTable("users", { ... }) definition:
//
//   // Auth provider (replaces/augments Replit Auth)
//   provider:             text("provider").default("replit"),
//   // "replit" | "google" | "github" | "linkedin" | "local"
//
//   providerId:           text("provider_id"),
//   // External OAuth subject ID
//
//   passwordHash:         text("password_hash"),
//   // bcrypt hash — only set for provider="local"
//
//   firstName:            text("first_name"),
//   lastName:             text("last_name"),
//   avatarUrl:            text("avatar_url"),
//
//   // Role — drives dashboard layout via userType in AppLayout.tsx
//   userType:             text("user_type", { enum: ["founder","investor","admin"] }).default("founder"),
//
//   // Onboarding state
//   onboardingCompleted:  boolean("onboarding_completed").notNull().default(false),
//   onboardingStep:       integer("onboarding_step").default(0),
//   // 0 = not started, 1-6 = founder steps, 1-5 = investor steps

// ─────────────────────────────────────────────────────────────────────────────
// 2. STARTUPS TABLE  (extend existing startups table)
// ─────────────────────────────────────────────────────────────────────────────
//
//   // Already likely present (verify these exist):
//   // name, website, description, stage, userId
//
//   // Add / verify these matchmaking-engine fields:
//   location:                  text("location"),
//   // "City, Country" — feeds geographic scoring (20% weight)
//
//   nicheIndustry:             text("niche_industry"),
//   // "film" | "realestate" | "sports" | null
//   // Triggers boosted matching: 25+ film keywords, 30+ RE keywords
//
//   fundingTarget:             text("funding_target"),
//   // e.g. "$1M – $3M" — feeds check size scoring (15% weight)
//
//   teamSize:                  text("team_size"),
//   // "Solo founder" | "2–3" | "4–10" | "11–25" | "25+"
//
//   founderLinkedin:           text("founder_linkedin"),
//   // Used by profile-enrichment.ts for social crawling
//
//   pitchDeckUrl:              text("pitch_deck_url"),
//   // GCS URL — triggers AI pitch deck analysis pipeline
//
//   targetGeographies:         text("target_geographies").array().default([]),
//   // e.g. ["Europe – UK", "MENA / UAE"]
//   // feeds geographic practicality scoring in accelerated-matching.ts
//
//   preferredInvestorTypes:    text("preferred_investor_types").array().default([]),
//   // e.g. ["Family Office", "VC Fund"]
//   // feeds investor type scoring (10% weight)
//
//   keyMilestone:              text("key_milestone"),
//   // Shown in match insights / MBB match report

// ─────────────────────────────────────────────────────────────────────────────
// 3. INVESTORS TABLE  (extend existing investors table)
// ─────────────────────────────────────────────────────────────────────────────
//
//   // Already likely present (verify): email, name, firmId
//
//   userId:               text("user_id").references(() => users.id),
//   // Links investor profile to auth user
//
//   investmentThesis:     text("investment_thesis"),
//   // Free text — shown to founders in match cards
//
//   preferredStages:      text("preferred_stages").array().default([]),
//   // e.g. ["Seed", "Series A"] — feeds stage scoring (25% weight)
//
//   preferredSectors:     text("preferred_sectors").array().default([]),
//   // e.g. ["AI / ML", "FinTech"] — feeds industry scoring (30% weight)
//
//   typicalCheckSize:     text("typical_check_size"),
//   // e.g. "$1M – $5M" — feeds check size alignment (15% weight)
//
//   focusNiches:          text("focus_niches").array().default([]),
//   // ["film", "realestate", "sports"] — activates niche keyword boosting
//
//   geographyFocus:       text("geography_focus").array().default([]),
//   // e.g. ["Europe – Benelux", "MENA / UAE"] — feeds geo scoring
//
//   portfolioCount:       integer("portfolio_count"),
//   // Used for investor behaviour scoring

// ─────────────────────────────────────────────────────────────────────────────
// 4. INVESTMENT_FIRMS TABLE  (extend existing investmentFirms table)
// ─────────────────────────────────────────────────────────────────────────────
//
//   createdByUserId:      text("created_by_user_id").references(() => users.id),
//   // So investors can manage their own firm record
//
//   // classification, hqLocation, aum, website likely already exist
//   // from the deep-research / enrichment pipeline — just verify

// ─────────────────────────────────────────────────────────────────────────────
// 5. CHECKLIST_SESSIONS TABLE  (likely already exists from /app/dd-checklist)
// ─────────────────────────────────────────────────────────────────────────────
//
// From replit.md: "DB: checklist_sessions table — stores per-user checklist
// state as JSON blob, type discriminator: data-room-em, data-room-fund2,
// eoy-review, dd-readiness, dd-checklist"
//
// This table should already exist. onboarding-routes.ts inserts a "dd-readiness"
// row on founder signup so the checklist is pre-initialised.

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE SQL MIGRATION  (run manually or via db:push)
// ─────────────────────────────────────────────────────────────────────────────

export const migrationSQL = `
-- ── USERS ──────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider            TEXT    DEFAULT 'replit';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type           TEXT    DEFAULT 'founder';
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step     INTEGER DEFAULT 0;

-- Unique index for provider-based lookup (OAuth)
CREATE UNIQUE INDEX IF NOT EXISTS users_provider_idx
  ON users (provider, provider_id)
  WHERE provider IS NOT NULL AND provider_id IS NOT NULL;

-- ── STARTUPS ────────────────────────────────────────────────────
ALTER TABLE startups ADD COLUMN IF NOT EXISTS location                  TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS niche_industry            TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS funding_target            TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS team_size                 TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS founder_linkedin          TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS pitch_deck_url            TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS target_geographies        TEXT[]  DEFAULT '{}';
ALTER TABLE startups ADD COLUMN IF NOT EXISTS preferred_investor_types  TEXT[]  DEFAULT '{}';
ALTER TABLE startups ADD COLUMN IF NOT EXISTS key_milestone             TEXT;

-- ── INVESTORS ───────────────────────────────────────────────────
ALTER TABLE investors ADD COLUMN IF NOT EXISTS user_id              TEXT    REFERENCES users(id);
ALTER TABLE investors ADD COLUMN IF NOT EXISTS investment_thesis     TEXT;
ALTER TABLE investors ADD COLUMN IF NOT EXISTS preferred_stages      TEXT[]  DEFAULT '{}';
ALTER TABLE investors ADD COLUMN IF NOT EXISTS preferred_sectors     TEXT[]  DEFAULT '{}';
ALTER TABLE investors ADD COLUMN IF NOT EXISTS typical_check_size    TEXT;
ALTER TABLE investors ADD COLUMN IF NOT EXISTS focus_niches          TEXT[]  DEFAULT '{}';
ALTER TABLE investors ADD COLUMN IF NOT EXISTS geography_focus       TEXT[]  DEFAULT '{}';
ALTER TABLE investors ADD COLUMN IF NOT EXISTS portfolio_count       INTEGER;

-- ── INVESTMENT FIRMS ────────────────────────────────────────────
ALTER TABLE investment_firms ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id);
`;

// ─────────────────────────────────────────────────────────────────────────────
// DRIZZLE SCHEMA SNIPPET  (copy into shared/schema.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const drizzleSnippet = `
// In shared/schema.ts, extend these tables:

export const users = pgTable("users", {
  // ... existing fields ...

  // New auth fields
  provider:             text("provider").default("replit"),
  providerId:           text("provider_id"),
  passwordHash:         text("password_hash"),
  firstName:            text("first_name"),
  lastName:             text("last_name"),
  avatarUrl:            text("avatar_url"),
  userType:             text("user_type").$type<"founder"|"investor"|"admin">().default("founder"),
  onboardingCompleted:  boolean("onboarding_completed").notNull().default(false),
  onboardingStep:       integer("onboarding_step").default(0),
});

export const startups = pgTable("startups", {
  // ... existing fields ...

  // New matchmaking fields
  location:                 text("location"),
  nicheIndustry:            text("niche_industry"),
  fundingTarget:            text("funding_target"),
  teamSize:                 text("team_size"),
  founderLinkedin:          text("founder_linkedin"),
  pitchDeckUrl:             text("pitch_deck_url"),
  targetGeographies:        text("target_geographies").array().default([]),
  preferredInvestorTypes:   text("preferred_investor_types").array().default([]),
  keyMilestone:             text("key_milestone"),
});

export const investors = pgTable("investors", {
  // ... existing fields ...

  userId:               text("user_id").references(() => users.id),
  investmentThesis:     text("investment_thesis"),
  preferredStages:      text("preferred_stages").array().default([]),
  preferredSectors:     text("preferred_sectors").array().default([]),
  typicalCheckSize:     text("typical_check_size"),
  focusNiches:          text("focus_niches").array().default([]),
  geographyFocus:       text("geography_focus").array().default([]),
  portfolioCount:       integer("portfolio_count"),
});
`;
