#!/usr/bin/env node
// Load investment_firms and investors xlsx files into a local PGlite database.
// Also creates the lp_match_* / fund_profiles tables and applies v2 migration.
//
// Usage:
//   node scripts/load-local-db.mjs <firms.xlsx> <investors.xlsx>
//
// Output: ./.local-db/  (PGlite data dir)

import { PGlite } from "@electric-sql/pglite"
import { createRequire } from "node:module"
import path from "node:path"
import fs from "node:fs"
import { fileURLToPath } from "node:url"
const require = createRequire(import.meta.url)
const XLSX = require("xlsx")

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const DATA_DIR = path.join(ROOT, ".local-db")
const MIGRATION_PATH = path.join(ROOT, "scripts/migrations/2026-04-25-matching-v2.sql")

const [, , firmsPath, investorsPath] = process.argv
if (!firmsPath || !investorsPath) {
  console.error("Usage: node scripts/load-local-db.mjs <firms.xlsx> <investors.xlsx>")
  process.exit(1)
}

console.log(`[load] data dir: ${DATA_DIR}`)
if (fs.existsSync(DATA_DIR)) {
  console.log("[load] removing existing local DB…")
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
}

const db = new PGlite(DATA_DIR)
await db.waitReady
console.log("[load] PGlite ready")

// ─── 1. Schema ───────────────────────────────────────────────────────────
const SCHEMA = `
CREATE TABLE IF NOT EXISTS investment_firms (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  website TEXT,
  logo TEXT,
  type TEXT,
  aum TEXT,
  location TEXT,
  stages JSONB,
  sectors JSONB,
  check_size_min NUMERIC,
  check_size_max NUMERIC,
  portfolio_count INT,
  linkedin_url TEXT,
  twitter_url TEXT,
  created_at TIMESTAMPTZ,
  folk_id TEXT,
  folk_workspace_id TEXT,
  folk_list_ids JSONB,
  folk_updated_at TIMESTAMPTZ,
  source TEXT,
  updated_at TIMESTAMPTZ,
  hq_location TEXT,
  industry TEXT,
  emails JSONB,
  phones JSONB,
  addresses JSONB,
  urls JSONB,
  funding_raised TEXT,
  last_funding_date TEXT,
  foundation_year INT,
  employee_range TEXT,
  status TEXT,
  folk_custom_fields JSONB,
  url_1 TEXT,
  url_2 TEXT,
  firm_classification TEXT,
  typical_check_size TEXT,
  enrichment_status TEXT,
  last_enrichment_date TIMESTAMPTZ,
  enrichment_error TEXT,
  logo_url TEXT
);

CREATE TABLE IF NOT EXISTS investors (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  firm_id TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  title TEXT,
  linkedin_url TEXT,
  twitter_url TEXT,
  avatar TEXT,
  bio TEXT,
  stages JSONB,
  sectors JSONB,
  location TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  folk_id TEXT,
  source TEXT,
  folk_workspace_id TEXT,
  folk_list_ids JSONB,
  folk_updated_at TIMESTAMPTZ,
  person_linkedin_url TEXT,
  investor_type TEXT,
  investor_state TEXT,
  investor_country TEXT,
  fund_hq TEXT,
  hq_location TEXT,
  funding_stage TEXT,
  typical_investment TEXT,
  num_lead_investments INT,
  total_investments INT,
  recent_investments JSONB,
  status TEXT,
  website TEXT,
  folk_custom_fields JSONB,
  address TEXT,
  enrichment_status TEXT,
  last_enrichment_date TIMESTAMPTZ,
  investment_thesis TEXT,
  preferred_stages JSONB,
  preferred_sectors JSONB,
  typical_check_size TEXT,
  focus_niches JSONB,
  geography_focus JSONB,
  portfolio_count INT
);

CREATE TABLE IF NOT EXISTS fund_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  target_raise NUMERIC,
  sectors JSONB DEFAULT '[]'::jsonb,
  geographic_focus JSONB DEFAULT '[]'::jsonb,
  headquarters_location TEXT,
  thesis_keywords JSONB DEFAULT '[]'::jsonb,
  scoring_weights JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lp_match_sessions (
  id TEXT PRIMARY KEY,
  fund_profile_id TEXT,
  fund_name TEXT,
  total_firms_scored INT,
  total_contacts_scored INT,
  qualified_firms INT,
  qualified_contacts INT,
  contacts_with_email INT,
  anchor_candidates INT,
  tier_counts JSONB,
  duration_ms INT,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lp_firm_matches (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  fund_profile_id TEXT,
  firm_id TEXT,
  firm_name TEXT,
  firm_type TEXT,
  firm_location TEXT,
  firm_aum TEXT,
  firm_sectors TEXT,
  firm_website TEXT,
  firm_linkedin TEXT,
  score INT,
  tier TEXT,
  tags JSONB,
  reasons JSONB,
  factor_lp_type INT,
  factor_aum INT,
  factor_sector INT,
  factor_geo INT,
  factor_thesis_signals INT,
  status TEXT DEFAULT 'identified',
  notes TEXT,
  commitment_amount NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS lp_contact_matches (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  fund_profile_id TEXT,
  investor_id TEXT,
  contact_name TEXT,
  contact_title TEXT,
  contact_type TEXT,
  contact_location TEXT,
  contact_email TEXT,
  contact_linkedin TEXT,
  contact_sectors TEXT,
  score INT,
  tier TEXT,
  tags JSONB,
  reasons JSONB,
  factor_lp_type INT,
  factor_sector INT,
  factor_geo INT,
  factor_thesis_signals INT,
  factor_contact_quality INT,
  status TEXT DEFAULT 'identified',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- ─── User settings (stores API keys + profiles + notifications) ──────────
CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT UNIQUE NOT NULL,
  user_type TEXT DEFAULT 'founder',
  -- API keys (encrypted at rest by lib/db/secrets.ts when SECRET_KEY is set)
  openai_api_key TEXT,
  anthropic_api_key TEXT,
  mistral_api_key TEXT,
  sendgrid_api_key TEXT,
  sender_email TEXT,
  sender_name TEXT,
  -- Founder profile
  company_name TEXT,
  company_website TEXT,
  company_industry TEXT,
  company_stage TEXT,
  company_description TEXT,
  company_one_liner TEXT,
  target_raise NUMERIC,
  current_arr NUMERIC,
  -- VC / Fund profile
  firm_name TEXT,
  firm_type TEXT,
  firm_aum NUMERIC,
  investment_thesis TEXT,
  preferred_stages JSONB,
  preferred_sectors JSONB,
  check_size_min NUMERIC,
  check_size_max NUMERIC,
  -- Notifications
  notification_email BOOLEAN DEFAULT true,
  notification_matches BOOLEAN DEFAULT true,
  notification_deals BOOLEAN DEFAULT true,
  notification_documents BOOLEAN DEFAULT false,
  notification_weekly BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_settings_user_id_idx ON user_settings (user_id);

-- ─── User profile bridge (Supabase auth.users mirror — stub in local mode)
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`
console.log("[load] creating base schema…")
await db.exec(SCHEMA)

// ─── 2. Run v2 migration on top ──────────────────────────────────────────
if (fs.existsSync(MIGRATION_PATH)) {
  console.log("[load] applying v2 migration…")
  const migration = fs.readFileSync(MIGRATION_PATH, "utf8")
  await db.exec(migration)
}

// ─── 3. Seed a default SVS-style fund profile so /dashboard/matchmaking works
const SVS_PROFILE_ID = "fp_svs_fund_ii_demo"
await db.query(
  `INSERT INTO fund_profiles (
    id, name, target_raise, sectors, primary_sectors, geographic_focus,
    headquarters_location, thesis_keywords, average_ticket, fund_number, is_active
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  ON CONFLICT (id) DO NOTHING`,
  [
    SVS_PROFILE_ID,
    "SVS Fund II (Demo)",
    40_000_000,
    JSON.stringify(["healthcare", "edtech", "saas", "ai/ml", "deep tech", "life sciences", "sportstech"]),
    JSON.stringify(["healthcare", "edtech"]),
    JSON.stringify(["us", "utah", "mountain_west", "dach", "gulf", "italy", "canada"]),
    "Lehi, Utah, United States",
    JSON.stringify(["university", "venture studio", "emerging manager", "tech transfer", "micro-PE", "acquisition"]),
    8_000_000,
    2,
    true,
  ],
)

const WC_PROFILE_ID = "fp_winner_capital_demo"
await db.query(
  `INSERT INTO fund_profiles (
    id, name, target_raise, sectors, primary_sectors, geographic_focus,
    headquarters_location, thesis_keywords, average_ticket, fund_number, is_active
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  ON CONFLICT (id) DO NOTHING`,
  [
    WC_PROFILE_ID,
    "Winner Capital (Demo)",
    5_000_000,
    JSON.stringify(["consumer", "ai/ml", "fintech", "healthtech", "saas", "consumer technology"]),
    JSON.stringify(["consumer", "ai/ml"]),
    JSON.stringify(["us", "canada", "dach"]),
    "New York, United States",
    JSON.stringify(["consumer ai", "first-time fund", "emerging manager"]),
    200_000,
    1,
    true,
  ],
)
console.log("[load] seeded 2 demo fund profiles")

// ─── 4. Load firms ──────────────────────────────────────────────────────
console.log(`[load] reading ${firmsPath}…`)
const firmsWb = XLSX.readFile(firmsPath)
const firmsRows = XLSX.utils.sheet_to_json(firmsWb.Sheets[firmsWb.SheetNames[0]], {
  defval: null,
  raw: true,
})
console.log(`[load] ${firmsRows.length} firms to insert…`)

const FIRM_COLS = [
  "id", "name", "description", "website", "logo", "type", "aum", "location",
  "stages", "sectors", "check_size_min", "check_size_max", "portfolio_count",
  "linkedin_url", "twitter_url", "created_at", "folk_id", "folk_workspace_id",
  "folk_list_ids", "folk_updated_at", "source", "updated_at", "hq_location",
  "industry", "emails", "phones", "addresses", "urls", "funding_raised",
  "last_funding_date", "foundation_year", "employee_range", "status",
  "folk_custom_fields", "url_1", "url_2", "firm_classification",
  "typical_check_size", "enrichment_status", "last_enrichment_date",
  "enrichment_error", "logo_url",
]

await bulkInsert(db, "investment_firms", FIRM_COLS, firmsRows, 500)
console.log("[load] firms inserted")

// ─── 5. Load investors ──────────────────────────────────────────────────
console.log(`[load] reading ${investorsPath}…`)
const invWb = XLSX.readFile(investorsPath)
const invRows = XLSX.utils.sheet_to_json(invWb.Sheets[invWb.SheetNames[0]], {
  defval: null,
  raw: true,
})
console.log(`[load] ${invRows.length} investors to insert…`)

const INV_COLS = [
  "id", "user_id", "firm_id", "first_name", "last_name", "email", "phone",
  "title", "linkedin_url", "twitter_url", "avatar", "bio", "stages",
  "sectors", "location", "is_active", "created_at", "updated_at", "folk_id",
  "source", "folk_workspace_id", "folk_list_ids", "folk_updated_at",
  "person_linkedin_url", "investor_type", "investor_state",
  "investor_country", "fund_hq", "hq_location", "funding_stage",
  "typical_investment", "num_lead_investments", "total_investments",
  "recent_investments", "status", "website", "folk_custom_fields", "address",
  "enrichment_status", "last_enrichment_date", "investment_thesis",
  "preferred_stages", "preferred_sectors", "typical_check_size",
  "focus_niches", "geography_focus", "portfolio_count",
]

await bulkInsert(db, "investors", INV_COLS, invRows, 500)
console.log("[load] investors inserted")

// ─── Stats ──────────────────────────────────────────────────────────────
const f = await db.query("SELECT COUNT(*) AS n FROM investment_firms")
const i = await db.query("SELECT COUNT(*) AS n FROM investors")
const fp = await db.query("SELECT COUNT(*) AS n FROM fund_profiles")
console.log("\n[load] DONE")
console.log(`  investment_firms : ${f.rows[0].n}`)
console.log(`  investors        : ${i.rows[0].n}`)
console.log(`  fund_profiles    : ${fp.rows[0].n}`)

await db.close()

// ─── helper ─────────────────────────────────────────────────────────────
async function bulkInsert(db, table, cols, rows, batchSize) {
  // JSONB columns we need to stringify
  const jsonCols = new Set(cols.filter((c) =>
    ["stages", "sectors", "folk_list_ids", "emails", "phones", "addresses",
     "urls", "folk_custom_fields", "recent_investments", "preferred_stages",
     "preferred_sectors", "focus_niches", "geography_focus"].includes(c),
  ))
  const boolCols = new Set(cols.filter((c) => ["is_active"].includes(c)))
  const intCols = new Set(cols.filter((c) =>
    ["check_size_min", "check_size_max", "portfolio_count", "foundation_year",
     "num_lead_investments", "total_investments"].includes(c),
  ))

  let inserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const values = []
    const placeholders = []
    let p = 1
    for (const row of batch) {
      const ph = []
      for (const col of cols) {
        let v = row[col]
        if (v === undefined) v = null
        if (v != null && jsonCols.has(col)) {
          // input is already a JSON string in xlsx; verify
          if (typeof v === "object") v = JSON.stringify(v)
          else if (typeof v === "string") {
            // ensure it parses; if not, wrap as a string array
            try { JSON.parse(v) } catch { v = JSON.stringify([v]) }
          }
        }
        if (v != null && boolCols.has(col)) {
          v = v === true || v === "true" || v === 1 || v === "1"
        }
        if (v != null && intCols.has(col)) {
          const n = Number(v)
          v = Number.isFinite(n) ? Math.trunc(n) : null
        }
        ph.push(`$${p++}`)
        values.push(v)
      }
      placeholders.push(`(${ph.join(",")})`)
    }
    const text = `INSERT INTO ${table} (${cols.join(",")}) VALUES ${placeholders.join(",")} ON CONFLICT (id) DO NOTHING`
    await db.query(text, values)
    inserted += batch.length
    if (inserted % 5000 === 0 || inserted === rows.length) {
      process.stdout.write(`\r  ${inserted}/${rows.length}`)
    }
  }
  process.stdout.write("\n")
}
