/**
 * Every column in the database that holds the id of a directory person (docs/architecture/54, D4), and what happens to the rows that point at a person who is erased.
 * A new such column fails person-registry.coverage.test.ts until it is classified here, so an erasure can never be "complete" while missing a table.
 *
 *  delete  the row is derived from the directory (a match result, a signal, a link) and goes with the person.
 *  keep    the row belongs to a workspace or is a learning aggregate; it stays and the person's record becomes an inactive shell with the personal fields cleared.
 *          A row that has an org column is counted so the workspace can be told once.
 */
export type Fate = "delete" | "keep"
export interface PersonRef { table: string; column: string; fate: Fate; owner: "platform" | "workspace"; orgColumn?: string; why: string }

export const PERSON_REFS: PersonRef[] = [
  { table: "investor_matches", column: "investor_id", fate: "delete", owner: "platform", why: "Match results shown to a workspace; derived from the directory." },
  { table: "lp_contact_matches", column: "investor_id", fate: "delete", owner: "platform", why: "Derived match between a contact and a directory person." },
  { table: "market_signals", column: "investor_id", fate: "delete", owner: "platform", why: "Signals attached to the person; derived." },
  { table: "investor_company_links", column: "investor_id", fate: "delete", owner: "platform", why: "Link between the person and a company; part of the directory." },
  { table: "match_outcome_events", column: "investor_id", fate: "keep", owner: "platform", why: "Learning aggregates (outcomes of matches) carry no personal data and are kept." },
  { table: "crm_people", column: "investor_id", fate: "keep", owner: "workspace", orgColumn: "org_id", why: "A workspace's own CRM copy of the person; the workspace is the controller of its copy and is notified." },
  { table: "crm_entries", column: "investor_id", fate: "keep", owner: "workspace", orgColumn: "org_id", why: "A workspace's own pipeline entry." },
  { table: "campaign_crm_entries", column: "investor_id", fate: "keep", owner: "workspace", why: "A workspace's campaign entry." },
  { table: "contacts", column: "source_investor_id", fate: "keep", owner: "workspace", why: "A workspace contact created from the directory." },
  { table: "deals", column: "investor_id", fate: "keep", owner: "workspace", why: "A workspace's deal record." },
  { table: "deal_room_access_grants", column: "investor_id", fate: "keep", owner: "workspace", why: "An access grant in a workspace's deal room; the record of who had access is kept." },
  { table: "deal_feedback_events", column: "investor_id", fate: "keep", owner: "workspace", why: "Feedback recorded on a workspace's deal." },
  { table: "interaction_logs", column: "investor_id", fate: "keep", owner: "workspace", why: "A workspace's interaction history." },
  { table: "introductions", column: "target_investor_id", fate: "keep", owner: "workspace", why: "A workspace's introduction record." },
  { table: "matches", column: "investor_id", fate: "keep", owner: "workspace", why: "A workspace's saved match." },
  { table: "outreaches", column: "investor_id", fate: "keep", owner: "workspace", why: "A workspace's outreach record." },
  { table: "calendar_meetings", column: "related_investor_id", fate: "keep", owner: "workspace", why: "A workspace's meeting." },
]
