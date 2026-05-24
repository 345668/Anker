/**
 * Database schema map for the AI assistant + agents.
 *
 * The model does NOT write raw SQL — the tools do — but giving it the real
 * table and column names stops it from inventing fields (e.g. asking
 * query_investors for a `name`/`type` column on `investors`, which is a PEOPLE
 * table with no such columns). Injected into the agent system prompt and
 * importable by any agent that needs to reason about where data lives.
 *
 * Keep this in sync with the live Postgres schema.
 */

export const DB_SCHEMA_NOTE = `ANKER DATABASE — tables & key columns (use the RIGHT table for the RIGHT entity):

• investment_firms  — ORGANIZATIONS / LPs / funds (20k rows). THIS is where
  family offices, VCs, funds-of-funds, accelerators, corporates, and PE firms
  live. Columns: id, name, type (free-text: "VC","VC Firm","Venture Capital",
  "Family Office","Accelerator","Corporate Venture Capital","Private Equity"…),
  description, sectors (jsonb string[]), stages (jsonb), hq_location, location,
  website, emails (jsonb), aum, check_size_min, check_size_max, portfolio_count,
  industry, firm_classification, linkedin_url.
  → Reach it with the query_investors tool (despite the name) and matchmake_lps.

• investors  — PEOPLE (46k rows). Individual investors/partners. Columns:
  first_name, last_name (NO "name" column), email (NO "contact_email"),
  investor_type (NO "type"), title, bio, linkedin_url, location, hq_location,
  sectors (jsonb), stages (jsonb), investment_thesis, firm_id (→ investment_firms).
  → Reach it with build_investor_profile (by investorId) and matchmake_lps
  (contact path). Do NOT query it for org-level "family office" lists.

• crm_entries  — the user's working pipeline. Columns: display_name,
  display_email, display_linkedin, display_title, display_type, display_score
  (int), display_tier, why_match, stage, firm_id, investor_id, notes,
  last_contacted_at.

• outreach_messages  — drafted/sent outreach. Columns: crm_entry_id, kind
  (connection_request|follow_up|different_angle|close_loop), step_number,
  channel (linkedin|email), body, subject, status (draft|sent|delivered|replied),
  opens, clicks, needs_followup.

RULES:
- "family offices", "funds of funds", "LPs", "VCs", "accelerators" → query_investors
  or matchmake_lps (both read investment_firms). Never assume an "investors.name"
  or "investors.type" column — they don't exist.
- For a ranked LP shortlist + XLSX, prefer matchmake_lps (it scores against a fund
  profile AND emits the spreadsheet in one call).`

export default DB_SCHEMA_NOTE
