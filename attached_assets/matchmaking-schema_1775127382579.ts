/**
 * shared/matchmaking-schema.ts
 *
 * New tables required by the matchmaking engine v2.
 * Add these to shared/schema.ts and run npm run db:push.
 *
 * Existing tables extended: startups (already handled in schema-additions.ts)
 *
 * New tables:
 *   match_sessions        — one record per matching run
 *   investor_matches      — individual scored matches, status tracked
 *   deal_feedback_events  — won/lost signals for feedback loop
 */

// ─── SQL MIGRATION ────────────────────────────────────────────────────────────

export const matchingMigrationSQL = `
-- ── MATCH SESSIONS ─────────────────────────────────────────────────────────
-- One row per matching run. Groups all investor_matches for that run.
-- Mirrors existing match_session concept from replit.md.

CREATE TABLE IF NOT EXISTS match_sessions (
  id                TEXT PRIMARY KEY,
  startup_id        TEXT NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  startup_name      TEXT,
  mode              TEXT NOT NULL DEFAULT 'standard',  -- 'standard' | 'accelerated'
  total_candidates  INTEGER NOT NULL DEFAULT 0,
  matches_returned  INTEGER NOT NULL DEFAULT 0,
  tier_counts       JSONB  DEFAULT '{"champion":0,"A":0,"B":0,"C":0}',
  weights           JSONB  DEFAULT '{}',
  duration_ms       INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS match_sessions_startup_idx ON match_sessions(startup_id);
CREATE INDEX IF NOT EXISTS match_sessions_created_idx ON match_sessions(created_at DESC);


-- ── INVESTOR MATCHES ────────────────────────────────────────────────────────
-- One row per investor per session. Stores full score breakdown and CRM status.
-- Replaces/extends any existing matches table from the original codebase.

CREATE TABLE IF NOT EXISTS investor_matches (
  id                   TEXT PRIMARY KEY,
  session_id           TEXT NOT NULL REFERENCES match_sessions(id) ON DELETE CASCADE,
  startup_id           TEXT NOT NULL,
  startup_name         TEXT,

  -- Investor identity
  investor_id          TEXT NOT NULL,
  investor_name        TEXT,
  investor_email       TEXT,
  investor_linkedin    TEXT,
  firm_id              TEXT,
  firm_name            TEXT,
  firm_website         TEXT,

  -- Scores
  score                INTEGER NOT NULL,               -- 0–100 final
  tier                 TEXT NOT NULL,                  -- 'champion'|'A'|'B'|'C'
  tier_label           TEXT,                           -- Human label

  -- Factor breakdown (0.0–1.0 each)
  factor_industry      NUMERIC(4,3),
  factor_stage         NUMERIC(4,3),
  factor_geo           NUMERIC(4,3),
  factor_check_size    NUMERIC(4,3),
  factor_investor_type NUMERIC(4,3),
  factor_team_signal   NUMERIC(4,3),

  -- Bonus scores
  semantic_score       INTEGER DEFAULT 0,              -- 0–20
  niche_score          INTEGER DEFAULT 0,              -- 0–15
  document_score       INTEGER DEFAULT 0,              -- 0–10
  economic_score       INTEGER DEFAULT 0,              -- 0–15
  behaviour_score      INTEGER DEFAULT 0,              -- 0–10
  feedback_multiplier  NUMERIC(3,2) DEFAULT 1.0,       -- 0.5–1.5

  -- Insights
  win_probability      INTEGER DEFAULT 0,              -- 0–100
  decision_speed       TEXT,                           -- 'fast'|'medium'|'slow'
  value_add            JSONB DEFAULT '[]',

  -- CRM tracking (existing Folk CRM integration)
  status               TEXT NOT NULL DEFAULT 'pending',
  -- 'pending'|'in_crm'|'contacted'|'responded'|'passed'|'won'|'lost'
  folk_contact_id      TEXT,                           -- Folk CRM contact ID
  status_notes         TEXT,
  status_updated_at    TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS investor_matches_session_idx  ON investor_matches(session_id);
CREATE INDEX IF NOT EXISTS investor_matches_startup_idx  ON investor_matches(startup_id);
CREATE INDEX IF NOT EXISTS investor_matches_investor_idx ON investor_matches(investor_id);
CREATE INDEX IF NOT EXISTS investor_matches_score_idx    ON investor_matches(score DESC);
CREATE INDEX IF NOT EXISTS investor_matches_status_idx   ON investor_matches(status);


-- ── DEAL FEEDBACK EVENTS ────────────────────────────────────────────────────
-- Records won/lost outcomes per investor per startup.
-- Used by feedback multiplier in scoring to adjust future match weights.

CREATE TABLE IF NOT EXISTS deal_feedback_events (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id  TEXT NOT NULL,
  startup_id   TEXT NOT NULL,
  session_id   TEXT,
  outcome      TEXT NOT NULL,        -- 'won' | 'lost'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_events_investor_idx ON deal_feedback_events(investor_id);
CREATE INDEX IF NOT EXISTS feedback_events_startup_idx  ON deal_feedback_events(startup_id);
CREATE INDEX IF NOT EXISTS feedback_events_created_idx  ON deal_feedback_events(created_at DESC);


-- ── STARTUPS — additional columns needed by matching engine ─────────────────
-- (Only add if not already present from previous migration)

ALTER TABLE startups ADD COLUMN IF NOT EXISTS niche_industry            TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS funding_target            TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS team_size                 TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS founder_linkedin          TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS pitch_deck_url            TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS target_geographies        TEXT[] DEFAULT '{}';
ALTER TABLE startups ADD COLUMN IF NOT EXISTS preferred_investor_types  TEXT[] DEFAULT '{}';
ALTER TABLE startups ADD COLUMN IF NOT EXISTS key_milestone             TEXT;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS location                  TEXT;

-- ── DEAL_ROOM_DOCUMENTS — keyword extraction column ──────────────────────────
-- Stores keywords extracted by AI from uploaded documents.
-- Used by documentKeywordScore() in matching engine.

ALTER TABLE deal_room_documents ADD COLUMN IF NOT EXISTS extracted_keywords JSONB DEFAULT '[]';
ALTER TABLE deal_room_documents ADD COLUMN IF NOT EXISTS startup_id TEXT REFERENCES startups(id);

-- ── INVESTORS — matchmaking preference columns ───────────────────────────────
-- (Only add if not already present from previous migration)

ALTER TABLE investors ADD COLUMN IF NOT EXISTS investment_thesis     TEXT;
ALTER TABLE investors ADD COLUMN IF NOT EXISTS preferred_stages      TEXT[] DEFAULT '{}';
ALTER TABLE investors ADD COLUMN IF NOT EXISTS preferred_sectors     TEXT[] DEFAULT '{}';
ALTER TABLE investors ADD COLUMN IF NOT EXISTS typical_check_size    TEXT;
ALTER TABLE investors ADD COLUMN IF NOT EXISTS focus_niches          TEXT[] DEFAULT '{}';
ALTER TABLE investors ADD COLUMN IF NOT EXISTS geography_focus       TEXT[] DEFAULT '{}';
ALTER TABLE investors ADD COLUMN IF NOT EXISTS portfolio_count       INTEGER;
ALTER TABLE investors ADD COLUMN IF NOT EXISTS user_id               TEXT REFERENCES users(id);
`;

// ─── DRIZZLE SCHEMA ADDITIONS ─────────────────────────────────────────────────
//
// Add these table definitions to shared/schema.ts

export const drizzleSchemaAdditions = `
import { pgTable, text, integer, numeric, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export const matchSessions = pgTable("match_sessions", {
  id:               text("id").primaryKey(),
  startupId:        text("startup_id").notNull().references(() => startups.id, { onDelete: "cascade" }),
  startupName:      text("startup_name"),
  mode:             text("mode").notNull().default("standard"),
  totalCandidates:  integer("total_candidates").notNull().default(0),
  matchesReturned:  integer("matches_returned").notNull().default(0),
  tierCounts:       jsonb("tier_counts").default({ champion:0, A:0, B:0, C:0 }),
  weights:          jsonb("weights").default({}),
  durationMs:       integer("duration_ms"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const investorMatches = pgTable("investor_matches", {
  id:                  text("id").primaryKey(),
  sessionId:           text("session_id").notNull().references(() => matchSessions.id, { onDelete: "cascade" }),
  startupId:           text("startup_id").notNull(),
  startupName:         text("startup_name"),
  investorId:          text("investor_id").notNull(),
  investorName:        text("investor_name"),
  investorEmail:       text("investor_email"),
  investorLinkedin:    text("investor_linkedin"),
  firmId:              text("firm_id"),
  firmName:            text("firm_name"),
  firmWebsite:         text("firm_website"),
  score:               integer("score").notNull(),
  tier:                text("tier").notNull(),
  tierLabel:           text("tier_label"),
  factorIndustry:      numeric("factor_industry", { precision: 4, scale: 3 }),
  factorStage:         numeric("factor_stage",    { precision: 4, scale: 3 }),
  factorGeo:           numeric("factor_geo",      { precision: 4, scale: 3 }),
  factorCheckSize:     numeric("factor_check_size", { precision: 4, scale: 3 }),
  factorInvestorType:  numeric("factor_investor_type", { precision: 4, scale: 3 }),
  factorTeamSignal:    numeric("factor_team_signal",   { precision: 4, scale: 3 }),
  semanticScore:       integer("semantic_score").default(0),
  nicheScore:          integer("niche_score").default(0),
  documentScore:       integer("document_score").default(0),
  economicScore:       integer("economic_score").default(0),
  behaviourScore:      integer("behaviour_score").default(0),
  feedbackMultiplier:  numeric("feedback_multiplier", { precision: 3, scale: 2 }).default("1.00"),
  winProbability:      integer("win_probability").default(0),
  decisionSpeed:       text("decision_speed"),
  valueAdd:            jsonb("value_add").default([]),
  status:              text("status").notNull().default("pending"),
  folkContactId:       text("folk_contact_id"),
  statusNotes:         text("status_notes"),
  statusUpdatedAt:     timestamp("status_updated_at", { withTimezone: true }),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dealFeedbackEvents = pgTable("deal_feedback_events", {
  id:         text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  investorId: text("investor_id").notNull(),
  startupId:  text("startup_id").notNull(),
  sessionId:  text("session_id"),
  outcome:    text("outcome").notNull(), // 'won' | 'lost'
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
`;

// ─── API ROUTES TO ADD ────────────────────────────────────────────────────────

export const apiRouteStubs = `
// Add to server/routes.ts:

import { runStandardMatching, runAcceleratedMatching, importMatchesToCRM, updateMatchStatus } from "./services/matchmaking.js";

// Standard match run
app.post("/api/matching/startup/:id", requireAuth, async (req, res, next) => {
  try {
    const { session, results } = await runStandardMatching(req.params.id, {
      includeDocumentKeywords: true,
    });
    res.json({ session, results });
  } catch (err) { next(err); }
});

// Accelerated match run
app.post("/api/matching/accelerated", requireAuth, async (req, res, next) => {
  try {
    const { startupId, weights } = req.body;
    const { session, results } = await runAcceleratedMatching(startupId, { weights });
    res.json({ session, results });
  } catch (err) { next(err); }
});

// Import matches to Folk CRM
app.post("/api/matching/crm-import", requireAuth, async (req, res, next) => {
  try {
    const result = await importMatchesToCRM(req.body.startupId, req.body);
    res.json(result);
  } catch (err) { next(err); }
});

// Update individual match status
app.patch("/api/matching/match/:id/status", requireAuth, async (req, res, next) => {
  try {
    await updateMatchStatus(req.params.id, req.body.status, req.body.notes);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Get sessions for a startup
app.get("/api/matching/startup/:id/sessions", requireAuth, async (req, res, next) => {
  try {
    const sessions = await db.query.matchSessions.findMany({
      where: eq(matchSessions.startupId, req.params.id),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    res.json(sessions);
  } catch (err) { next(err); }
});

// Get matches for a session
app.get("/api/matching/session/:id", requireAuth, async (req, res, next) => {
  try {
    const matches = await db.query.investorMatches.findMany({
      where: eq(investorMatches.sessionId, req.params.id),
      orderBy: (t, { desc }) => [desc(t.score)],
    });
    res.json(matches);
  } catch (err) { next(err); }
});
`;
