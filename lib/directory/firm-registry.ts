/**
 * Every column in the database that holds the id of a directory firm, and what a MERGE does with the rows that point at the firm being folded away (docs/architecture/55 section 4, E3).
 * The twin of person-registry.ts, with the same guard: a new such column fails firm-registry.coverage.test.ts until it is classified here, so a merge can never leave a reference behind.
 *
 *  move    the rows are re-pointed at the surviving firm (a person, a workspace's own record, a learning aggregate). Their ids are written to the merge record so an undo can put them back.
 *  drop    the rows are derived from the directory (match results, links) and are removed; the next run regenerates them. An undo cannot restore them (and says so).
 *  ignore  a historical or archive table that is not part of the live directory; left as it is.
 */
export type FirmFate = "move" | "drop" | "ignore"
export interface FirmRef { table: string; column: string; fate: FirmFate; owner: "platform" | "workspace"; orgColumn?: string; why: string }

export const FIRM_REFS: FirmRef[] = [
  { table: "investors", column: "firm_id", fate: "move", owner: "platform", why: "The people of a firm move with it: the directory's own people." },
  { table: "investment_firms", column: "parent_firm_id", fate: "move", owner: "platform", why: "Programmes of a parent brand stay under the surviving firm." },
  { table: "investor_matches", column: "firm_id", fate: "drop", owner: "platform", why: "Match results shown to a workspace; derived from the directory and regenerated." },
  { table: "lp_firm_matches", column: "firm_id", fate: "drop", owner: "platform", why: "Derived LP matching results." },
  { table: "founder_match_results", column: "firm_id", fate: "drop", owner: "platform", why: "Derived founder matching results." },
  { table: "investor_company_links", column: "company_id", fate: "drop", owner: "platform", why: "Links between a person and a company; part of the directory and regenerated." },
  { table: "match_outcome_events", column: "firm_id", fate: "move", owner: "platform", why: "Learning aggregates keep their history under the surviving firm." },
  { table: "crm_companies", column: "firm_id", fate: "move", owner: "workspace", orgColumn: "org_id", why: "A workspace's own copy of the firm keeps its fields; only its pointer moves." },
  { table: "crm_entries", column: "firm_id", fate: "move", owner: "workspace", orgColumn: "org_id", why: "A workspace's pipeline entry." },
  { table: "campaign_crm_entries", column: "firm_id", fate: "move", owner: "workspace", why: "A workspace's campaign entry." },
  { table: "contacts", column: "source_firm_id", fate: "move", owner: "workspace", why: "A workspace contact created from the directory." },
  { table: "deals", column: "firm_id", fate: "move", owner: "workspace", why: "A workspace's deal record." },
  { table: "deal_room_access_grants", column: "firm_id", fate: "move", owner: "workspace", why: "An access grant in a workspace's deal room." },
  { table: "interaction_logs", column: "firm_id", fate: "move", owner: "workspace", why: "A workspace's interaction history." },
  { table: "introductions", column: "target_firm_id", fate: "move", owner: "workspace", why: "A workspace's introduction record." },
  { table: "matches", column: "firm_id", fate: "move", owner: "workspace", why: "A workspace's saved match." },
  { table: "outreaches", column: "firm_id", fate: "move", owner: "workspace", why: "A workspace's outreach record." },
  { table: "calendar_meetings", column: "related_firm_id", fate: "move", owner: "workspace", why: "A workspace's meeting." },
  { table: "lp_entities", column: "firm_id", fate: "move", owner: "workspace", why: "A workspace's LP entity linked to the firm." },
  { table: "archived_investors", column: "firm_id", fate: "ignore", owner: "platform", why: "Archive of removed rows; not part of the live directory." },
]
/** Columns that hold a firm id but are matched by prefix and never classified: database backups taken by hand. */
export const BACKUP_PREFIXES = ["neon_bak_", "neon_del_", "neon_fix_"]

/**
 * Columns that hold a JSON LIST of firm ids rather than one id. A merge APPENDS the survivor's id to every list that names the loser (the loser's id stays, harmless, and the alias resolves
 * it), only where the survivor was not already there, so an undo removes exactly what the merge added.
 */
export interface FirmListRef { table: string; column: string; owner: "platform" | "workspace"; why: string }
export const FIRM_LIST_REFS: FirmListRef[] = [
  { table: "fund_profiles", column: "fund_i_prior_lp_firm_ids", owner: "workspace", why: "A fund's list of firms that were LPs in its first fund; used by matching." },
]
