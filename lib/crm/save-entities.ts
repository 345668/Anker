/**
 * Save directory investors to a workspace CRM — one path for match results,
 * run imports and Discover (docs/architecture/14 §6, §9).
 *
 * An investor already in the workspace's CRM is never added twice, whichever
 * surface saved it first: the check is on the investor (or the firm, for
 * firm-only entries), not on the source label. One SQL statement, so a
 * partial failure cannot leave half a batch.
 */
import { sql } from "@/lib/db"

export type CrmSource = "founder_matching" | "lp_matching" | "manual" | "discover"

export interface CrmItem {
  kind: "firm" | "contact"
  id: string
  displayName?: string | null
  title?: string | null
  email?: string | null
  linkedin?: string | null
  location?: string | null
  type?: string | null
  score?: number | null
  tier?: string | null
  why?: string | null
}

export const MAX_SAVE = 200

export async function saveToCrm(
  scope: { orgId: string; userId: string },
  items: CrmItem[],
  source: CrmSource,
  sessionId: string | null = null,
): Promise<{ inserted: number; alreadyPresent: number; missing: number }> {
  const clean = items
    .filter((i) => (i.kind === "firm" || i.kind === "contact") && /^[\w-]{1,200}$/.test(i.id))
    .slice(0, MAX_SAVE)
    .map((i) => ({
      key: `${i.kind}:${i.id}`, kind: i.kind, id: i.id,
      name: (i.displayName ?? "").slice(0, 300), title: (i.title ?? "").slice(0, 300), email: (i.email ?? "").slice(0, 320),
      linkedin: (i.linkedin ?? "").slice(0, 1000), location: (i.location ?? "").slice(0, 300), type: (i.type ?? "").slice(0, 100),
      score: i.score == null ? null : Math.round(i.score), tier: (i.tier ?? "").slice(0, 40), why: (i.why ?? "").slice(0, 2000),
    }))
  if (!clean.length) return { inserted: 0, alreadyPresent: 0, missing: 0 }
  const [r] = await sql`
    WITH input AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(clean)}::jsonb) AS x(
        key text, kind text, id text, name text, title text, email text, linkedin text, location text,
        type text, score int, tier text, why text)
    ), resolved AS (
      SELECT x.*, f.id AS firm_row, i.id AS inv_row,
             CASE WHEN x.kind = 'firm' THEN f.id::text ELSE i.firm_id::text END AS firm_id,
             CASE WHEN x.kind = 'contact' THEN i.id::text END AS investor_id,
             coalesce(nullif(x.name, ''), f.name, nullif(concat_ws(' ', i.first_name, i.last_name), ''), x.key) AS display_name,
             coalesce(nullif(x.email, ''), i.email) AS display_email
        FROM input x
        LEFT JOIN investment_firms f ON x.kind = 'firm' AND f.id::text = x.id
        LEFT JOIN investors i ON x.kind = 'contact' AND i.id::text = x.id
    ), fresh AS (
      SELECT * FROM resolved r
       WHERE (r.firm_row IS NOT NULL OR r.inv_row IS NOT NULL)
         AND NOT EXISTS (
           SELECT 1 FROM crm_entries c WHERE c.org_id = ${scope.orgId} AND (
             (r.kind = 'contact' AND c.investor_id = r.investor_id) OR
             (r.kind = 'firm' AND c.firm_id = r.firm_id AND c.investor_id IS NULL)))
    ), inserted AS (
      INSERT INTO crm_entries (org_id, user_id, source, source_session_id, import_key, firm_id, investor_id,
        display_name, display_title, display_email, display_linkedin, display_location, display_type,
        display_score, display_tier, why_match, stage)
      SELECT ${scope.orgId}, ${scope.userId}, ${source}, ${sessionId}, key, firm_id, investor_id,
             display_name, nullif(title, ''), display_email, nullif(linkedin, ''), nullif(location, ''), nullif(type, ''),
             score, nullif(tier, ''), nullif(why, ''), 'queued'
        FROM fresh
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT (SELECT count(*)::int FROM inserted) AS inserted,
           (SELECT count(*)::int FROM resolved WHERE firm_row IS NULL AND inv_row IS NULL) AS missing`
  const inserted = Number(r?.inserted ?? 0), missing = Number(r?.missing ?? 0)
  return { inserted, missing, alreadyPresent: clean.length - inserted - missing }
}
