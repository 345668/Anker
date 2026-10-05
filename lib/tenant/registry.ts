/**
 * The registry of a workspace's data: what an export includes and what an erasure removes. docs/architecture/41 §6.
 *
 * Explicit on purpose. Erasure deletes real data, so nothing is discovered at run time: a table is here, or it is in EXCLUDED with a reason, and a test
 * (registry.coverage.test.ts) fails when a migration adds a table keyed by a workspace or fund that is in neither. Every statement is built from this list and
 * parameterised: $1 the workspace id, $2 its fund id (null for a company workspace, so fund rules match nothing), $3 the user ids of its SOLE members (people who belong to
 * no other workspace). Order matters: rules are applied top to bottom, children before parents.
 */

export interface Rule {
  table: string
  /** WHERE clause over $1 workspace, $2 fund, $3 sole-member user ids. */
  where: string
  /** Columns left out of an export because they are secrets (tokens, key material). */
  secret?: string[]
  /** Exported but never erased: the reason (a legal duty of ours). */
  retain?: string
  /** Not deleted: this SET clause is applied instead, so aggregates and cost history survive without identifying anyone. */
  anonymize?: string
  /** Where the rows are: workspace, its fund, or the members' own content. */
  scope: "workspace" | "fund" | "member"
}

const O = "workspace" as const, F = "fund" as const, M = "member" as const

export const RULES: Rule[] = [
  // ── fund: children whose parent would otherwise refuse the delete ──
  { scope: F, table: "deal_room_documents", where: "room_id::text IN (SELECT id::text FROM deal_rooms WHERE deal_id::text IN (SELECT id::text FROM deal_opportunities WHERE fund_id::text = $2))" },
  { scope: F, table: "deal_room_access_grants", where: "room_id::text IN (SELECT id::text FROM deal_rooms WHERE deal_id::text IN (SELECT id::text FROM deal_opportunities WHERE fund_id::text = $2))" },
  { scope: F, table: "deal_room_audit_events", where: "room_id::text IN (SELECT id::text FROM deal_rooms WHERE deal_id::text IN (SELECT id::text FROM deal_opportunities WHERE fund_id::text = $2))" },
  { scope: F, table: "deal_room_milestones", where: "room_id::text IN (SELECT id::text FROM deal_rooms WHERE deal_id::text IN (SELECT id::text FROM deal_opportunities WHERE fund_id::text = $2))" },
  { scope: F, table: "deal_room_nda_agreements", where: "room_id::text IN (SELECT id::text FROM deal_rooms WHERE deal_id::text IN (SELECT id::text FROM deal_opportunities WHERE fund_id::text = $2))" },
  { scope: F, table: "deal_room_notes", where: "room_id::text IN (SELECT id::text FROM deal_rooms WHERE deal_id::text IN (SELECT id::text FROM deal_opportunities WHERE fund_id::text = $2))" },
  { scope: F, table: "deal_room_questions", where: "room_id::text IN (SELECT id::text FROM deal_rooms WHERE deal_id::text IN (SELECT id::text FROM deal_opportunities WHERE fund_id::text = $2))" },
  { scope: F, table: "pitch_deck_analyses", where: "room_id::text IN (SELECT id::text FROM deal_rooms WHERE deal_id::text IN (SELECT id::text FROM deal_opportunities WHERE fund_id::text = $2))" },
  { scope: F, table: "deal_rooms", where: "deal_id::text IN (SELECT id::text FROM deal_opportunities WHERE fund_id::text = $2)" },
  { scope: F, table: "lp_quarterly_reports", where: "fund_id::text = $2" },
  { scope: F, table: "portfolio_kpi_extractions", where: "fund_id::text = $2" },
  { scope: F, table: "lp_portal_access_log", where: "lp_id::text IN (SELECT id::text FROM fund_lps WHERE fund_id::text = $2)" },
  { scope: F, table: "lp_portal_tokens", where: "fund_id::text = $2", secret: ["token_hash", "token"] },
  { scope: F, table: "lp_information_sharing", where: "fund_id::text = $2" },
  { scope: F, table: "lp_positions", where: "fund_id::text = $2" },
  { scope: F, table: "lp_reports", where: "fund_id::text = $2" },
  { scope: F, table: "lp_statement_imports", where: "fund_id::text = $2" },
  { scope: F, table: "lp_distributions", where: "fund_id::text = $2" },
  { scope: F, table: "lp_capital_calls", where: "fund_id::text = $2" },
  { scope: F, table: "lp_commitment_events", where: "fund_id::text = $2" },
  { scope: F, table: "lp_commitments", where: "fund_id::text = $2" },
  { scope: F, table: "data_room_document_views", where: "fund_id::text = $2" },
  { scope: F, table: "data_room_requests", where: "fund_id::text = $2" },
  { scope: F, table: "data_room_documents", where: "fund_id::text = $2" },
  { scope: F, table: "kyc_cases", where: "fund_id::text = $2" },
  { scope: F, table: "legal_documents", where: "fund_id::text = $2" },
  { scope: F, table: "legal_entities", where: "fund_id::text = $2" },
  { scope: F, table: "mc_actuals", where: "fund_id::text = $2" },
  { scope: F, table: "mc_budget_lines", where: "fund_id::text = $2" },
  { scope: F, table: "forecast_scenarios", where: "fund_id::text = $2" },
  { scope: F, table: "waterfall_runs", where: "fund_id::text = $2" },
  { scope: F, table: "valuation_snapshots", where: "fund_id::text = $2" },
  { scope: F, table: "studio_projects", where: "fund_id::text = $2" },
  { scope: F, table: "fund_investments", where: "fund_id::text = $2" },
  { scope: F, table: "portfolio_metrics", where: "fund_id::text = $2" },
  { scope: F, table: "fee_accruals", where: "fund_id::text = $2" },
  { scope: F, table: "fee_schedules", where: "fund_id::text = $2" },
  { scope: F, table: "fund_analytics_snapshots", where: "fund_id::text = $2" },
  { scope: F, table: "fund_assessment_history", where: "fund_id::text = $2" },
  { scope: F, table: "fund_compliance_profile", where: "fund_id::text = $2" },
  { scope: F, table: "compliance_fund_settings", where: "fund_id::text = $2" },
  { scope: F, table: "compliance_deadlines", where: "fund_id::text = $2" },
  { scope: F, table: "decks", where: "fund_id::text = $2" },
  { scope: F, table: "financial_reports", where: "fund_id::text = $2" },
  { scope: F, table: "distributions", where: "fund_id::text = $2" },
  { scope: F, table: "capital_calls", where: "fund_id::text = $2" },
  { scope: F, table: "journal_entries", where: "fund_id::text = $2" },
  { scope: F, table: "investments", where: "fund_id::text = $2" },
  { scope: F, table: "portfolio_companies", where: "fund_id::text = $2" },
  { scope: F, table: "syndicates", where: "lead_fund_id::text = $2 OR spv_fund_id::text = $2" },
  { scope: F, table: "intake_submissions", where: "fund_id::text = $2" },
  { scope: F, table: "fund_intake_configs", where: "fund_id::text = $2" },
  { scope: F, table: "deal_opportunities", where: "fund_id::text = $2" },
  { scope: F, table: "fund_lps", where: "fund_id::text = $2" },
  // ── workspace (company or fund workspace) ──
  { scope: O, table: "agent_executions", where: "org_id::text = $1" },
  { scope: O, table: "agent_settings", where: "org_id::text = $1" },
  { scope: O, table: "action_proposals", where: "org_id::text = $1" },
  { scope: O, table: "workspace_autonomy", where: "org_id::text = $1" },
  { scope: O, table: "crm_activities", where: "org_id::text = $1" },
  { scope: O, table: "crm_tasks", where: "org_id::text = $1" },
  { scope: O, table: "crm_saved_views", where: "org_id::text = $1" },
  { scope: O, table: "crm_entries", where: "org_id::text = $1" },
  { scope: O, table: "crm_deals", where: "org_id::text = $1" },
  { scope: O, table: "crm_people", where: "org_id::text = $1" },
  { scope: O, table: "crm_companies", where: "org_id::text = $1" },
  { scope: O, table: "crm_boards", where: "org_id::text = $1" },
  { scope: O, table: "crm_migration_report", where: "org_id::text = $1" },
  { scope: O, table: "founder_match_exclusions", where: "org_id::text = $1" },
  { scope: O, table: "founder_match_sessions", where: "org_id::text = $1" },
  { scope: O, table: "founder_match_runs", where: "org_id::text = $1" },
  { scope: O, table: "startup_profiles", where: "org_id::text = $1" },
  { scope: O, table: "startups", where: "org_id::text = $1" },
  { scope: O, table: "fund_profiles", where: "org_id::text = $1" },
  { scope: O, table: "fundraising_rounds", where: "org_id::text = $1" },
  { scope: O, table: "investor_calls", where: "org_id::text = $1" },
  { scope: O, table: "investor_updates", where: "org_id::text = $1" },
  { scope: O, table: "private_artifacts", where: "org_id::text = $1" },
  { scope: O, table: "document_extractions", where: "org_id::text = $1" },
  { scope: O, table: "discovery_exports", where: "org_id::text = $1" },
  { scope: O, table: "discovery_saved_searches", where: "org_id::text = $1" },
  { scope: O, table: "planning_scenarios", where: "org_id::text = $1" },
  { scope: O, table: "workspace_decks", where: "org_id::text = $1" },
  { scope: O, table: "tasks", where: "org_id::text = $1" },
  { scope: O, table: "notifications", where: "org_id::text = $1" },
  { scope: O, table: "call_sync_devices", where: "org_id::text = $1", secret: ["token", "token_hash", "secret"] },
  { scope: O, table: "folk_import_runs", where: "workspace_id::text = $1" },
  { scope: O, table: "folk_workspaces", where: "workspace_id::text = $1", secret: ["api_key", "token", "access_token"] },
  { scope: O, table: "mcp_tokens", where: "workspace_id::text = $1", secret: ["token", "token_hash"] },
  { scope: O, table: "onboarding_drafts", where: "workspace_id::text = $1" },
  { scope: O, table: "workspace_invitations", where: "org_id::text = $1", secret: ["token_hash", "token"] },
  { scope: O, table: "workspace_ownership_transfers", where: "org_id::text = $1" },
  { scope: O, table: "impersonation_grants", where: "org_id::text = $1", secret: ["token_hash"] },
  { scope: O, table: "workspace_access_events", where: "org_id::text = $1" },
  // retained: our own records, kept by law, exported to the customer but not erased
  { scope: O, table: "billing_subscriptions", where: "org_id::text = $1", retain: "Invoices and subscription records are kept for the statutory retention period (German commercial and tax law)." },
  { scope: O, table: "billing_customers", where: "org_id::text = $1", retain: "Invoices and subscription records are kept for the statutory retention period (German commercial and tax law)." },
  { scope: O, table: "billing_credit_ledger", where: "org_id::text = $1", retain: "Credit and invoice ledger entries are kept for the statutory retention period." },
  // anonymised: the cost history stays, the identity does not
  { scope: O, table: "ai_calls", where: "workspace_id::text = $1", anonymize: "workspace_id = NULL, actor_id = NULL, actor_email = NULL, error = NULL" },
  // ── members' own content, for people who belong to no other workspace ──
  { scope: M, table: "outreach_messages", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "outreach_replies", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "outreach_reply_deliveries", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "outreach_campaign_members", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "outreach_campaign_schedules", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "outreach_campaigns", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "outreach_templates", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "outreach_crawl_queue", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "li_action_queue", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "li_messages", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "li_conversations", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "li_campaign_members", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "li_lead_list_members", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "li_lead_lists", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "li_campaigns", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "linkedin_connections", where: "owner_id::text = ANY($3::text[]) OR owner_user_id::text = ANY($3::text[])" },
  { scope: M, table: "linkedin_mutuals", where: "owner_id::text = ANY($3::text[])" },
  { scope: M, table: "linkedin_senders", where: "user_id::text = ANY($3::text[])", secret: ["session_token", "token", "cookies"] },
  { scope: M, table: "contacts", where: "owner_id::text = ANY($3::text[])" },
  { scope: M, table: "anker_chat_events", where: "chat_id::text IN (SELECT id::text FROM anker_chats WHERE user_id::text = ANY($3::text[]))" },
  { scope: M, table: "anker_chats", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "email_oauth_accounts", where: "user_id::text = ANY($3::text[])", secret: ["access_token", "refresh_token"] },
  { scope: M, table: "sender_profiles", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "user_email_settings", where: "user_id::text = ANY($3::text[])", secret: ["smtp_pass", "password", "api_key"] },
  { scope: M, table: "user_settings", where: "user_id::text = ANY($3::text[])", secret: ["openai_api_key", "anthropic_api_key", "mistral_api_key", "sendgrid_api_key"] },
  { scope: M, table: "extension_tokens", where: "user_id::text = ANY($3::text[])", secret: ["token_hash", "token"] },
  { scope: M, table: "activity_logs", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "match_outcome_events", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "match_sessions", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "lp_match_sessions", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "matching_weight_history", where: "user_id::text = ANY($3::text[])" },
  { scope: M, table: "background_jobs", where: "user_id::text = ANY($3::text[])" },
  // ── last: the membership list and the workspace and fund themselves ──
  { scope: O, table: "memberships", where: "org_id::text = $1" },
  { scope: F, table: "funds", where: "id::text = $2" },
  { scope: O, table: "organizations", where: "id::text = $1" },
]

/** Tables that carry a workspace, fund or user key but are NOT the customer's data, with the reason. The coverage test accepts these. */
export const EXCLUDED: { table: string; reason: string }[] = [
  { table: "crm_migration_plan", reason: "A VIEW over crm_entries: it cannot be deleted from, and is removed with its source rows." },
  { table: "investors", reason: "The shared investor directory (50,000 rows), not tenant data. user_id there is the importer, never an owner." },
  { table: "email_suppressions", reason: "The do-not-contact list protects third parties and must survive any erasure." },
  { table: "li_suppressions", reason: "The do-not-contact list protects third parties and must survive any erasure." },
  { table: "outreach_consents", reason: "Consent records are evidence for the recipients and are kept." },
  { table: "tenant_entitlements", reason: "The control plane, not customer data; removed with the tombstone step." },
  { table: "tenant_lifecycle", reason: "The control plane, not customer data." },
  { table: "tenant_lifecycle_events", reason: "The control plane's audit trail." },
  { table: "tenant_requests", reason: "The request that is being executed." },
  { table: "tenant_tombstones", reason: "Proof that an erasure happened." },
  { table: "company_audit_log", reason: "Staff action trail." },
  { table: "audit_events", reason: "Platform audit trail." },
  { table: "platform_api_keys", reason: "Platform keys, not customer data." },
  { table: "database_backups", reason: "Platform backups." },
  { table: "news_articles", reason: "Platform content." },
  { table: "password_reset_tokens", reason: "Authentication, expires on its own." },
  { table: "user_roles", reason: "Platform roles." },
  { table: "teams", reason: "Legacy, unused (0 rows)." },
  { table: "team_members", reason: "Legacy, unused (0 rows)." },
  { table: "notifications_legacy_20260916", reason: "A retired legacy table." },
  { table: "accelerated_match_jobs", reason: "Directory matching job queue keyed by importer." },
  { table: "interviews", reason: "Platform research interviews." },
  { table: "batch_enrichment_jobs", reason: "Directory enrichment jobs run by staff." },
  { table: "email_templates", reason: "Legacy, unused (0 rows)." },
  { table: "archived_contacts", reason: "Legacy, unused (0 rows)." },
  { table: "outreaches", reason: "Legacy, unused (0 rows)." },
  { table: "deals", reason: "Legacy table, unused (0 rows); superseded by deal_opportunities." },
  { table: "documents", reason: "Legacy, unused (0 rows)." },
  { table: "pitch_decks", reason: "Legacy, unused (0 rows)." },
  { table: "saved_templates", reason: "Legacy, unused (0 rows)." },
  { table: "calendar_meetings", reason: "Legacy, unused (0 rows)." },
  { table: "checklist_sessions", reason: "Legacy, unused (0 rows)." },
  { table: "dealflow_prospects", reason: "Legacy, unused (0 rows)." },
  { table: "agent_runs", reason: "Unused (0 rows); will be member-scoped when used." },
  { table: "ai_media_tasks", reason: "Unused (0 rows)." },
  { table: "ai_processing_logs", reason: "Unused (0 rows)." },
  { table: "activities", reason: "Legacy, unused (0 rows)." },
  { table: "contracts", reason: "Unused (0 rows); will be workspace-scoped when used." },
  { table: "comp_bands", reason: "Unused (0 rows)." },
  { table: "equity_filings", reason: "Unused (0 rows)." },
  { table: "investment_cases", reason: "Unused (0 rows)." },
  { table: "loans", reason: "Unused (0 rows)." },
  { table: "lp_match_audit", reason: "Unused (0 rows)." },
  { table: "lp_pipeline_events", reason: "Unused (0 rows)." },
  { table: "match_pipeline_actions", reason: "Unused (0 rows)." },
  { table: "option_grants", reason: "Unused (0 rows)." },
  { table: "portfolio_kpis_monthly", reason: "Unused (0 rows)." },
  { table: "spv_portal_tokens", reason: "Unused (0 rows)." },
  { table: "spvs", reason: "Unused (0 rows)." },
  { table: "syndicate_partners", reason: "Unused (0 rows)." },
  { table: "valuations_409a", reason: "Unused (0 rows)." },
  { table: "data_room_access_grants", reason: "Covered through its documents (data_room_documents)." },
  { table: "data_room_files", reason: "Legacy, unused (0 rows)." },
  { table: "investor_update_recipients", reason: "Child of investor_updates, removed with the update (no rows today)." },
  { table: "term_grids", reason: "Child of deal_opportunities (ON DELETE CASCADE)." },
  { table: "deal_documents", reason: "Child of deal_opportunities (ON DELETE CASCADE); its files are removed as blobs." },
  { table: "deal_evaluations", reason: "Child of deal_opportunities (ON DELETE CASCADE)." },
  { table: "deal_founders", reason: "Child of deal_opportunities (ON DELETE CASCADE)." },
  { table: "ic_votes", reason: "Child of deal_opportunities (ON DELETE CASCADE)." },
  { table: "folk_workspaces_legacy", reason: "Placeholder so the name is reserved." },
]

/** Where a workspace's files live in Blob, so an export can list them and an erasure can remove them. `{org}` and `{fund}` are filled in. */
export const BLOB_QUERIES: { label: string; sql: string }[] = [
  { label: "deal documents", sql: "SELECT blob_path AS ref FROM deal_documents WHERE fund_id::text = $2 AND blob_path IS NOT NULL" },
  { label: "intake decks", sql: "SELECT deck_url AS ref FROM intake_submissions WHERE fund_id::text = $2 AND deck_url IS NOT NULL" },
  { label: "data room files", sql: "SELECT file_url AS ref FROM data_room_documents WHERE fund_id::text = $2 AND file_url IS NOT NULL" },
  { label: "LP reports", sql: "SELECT pdf_url AS ref FROM lp_reports WHERE fund_id::text = $2 AND pdf_url IS NOT NULL" },
]
/** Blob prefixes owned by a workspace by name. Deal documents are removed per deal (`deal-documents/<dealId>/`), never by the shared prefix. */
export const blobPrefixes = (orgId: string): string[] => {
  const k = orgId.replace(/[^A-Za-z0-9_-]/g, "-")
  return [`assistant-uploads/org-${k}/`, `tools-convert/org-${k}/`]
}

export const rulesFor = (scopes: Array<Rule["scope"]>) => RULES.filter((r) => scopes.includes(r.scope))
