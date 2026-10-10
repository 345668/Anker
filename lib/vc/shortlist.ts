/** One-click shortlist (docs/architecture/50 §9.1): the best contact at each of the top firms of the latest completed matching run, added to the pipeline once. */
import { sql } from "@/lib/db"
export const SHORTLIST_DEFAULT = 25,
  SHORTLIST_MAX = 50
export interface ShortlistScope {
  orgId: string
  userId: string
}
export interface ShortlistResult {
  added: number
  alreadyThere: number
  considered: number
  boardName: string | null
  noRun: boolean
}
export class ShortlistError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message)
  }
}

export async function addTopLps(scope: ShortlistScope, want = SHORTLIST_DEFAULT): Promise<ShortlistResult> {
  const n = Math.max(1, Math.min(SHORTLIST_MAX, Math.floor(want) || SHORTLIST_DEFAULT))
  const [run] =
    (await sql`SELECT s.id, f.name AS fund_name FROM lp_match_sessions s JOIN fund_profiles f ON f.id = s.fund_profile_id
    WHERE f.org_id = ${scope.orgId} AND f.is_active = true AND s.status = 'completed' AND EXISTS (SELECT 1 FROM lp_contact_matches c WHERE c.session_id = s.id)
    ORDER BY s.created_at DESC LIMIT 1`) as any[]
  if (!run) return { added: 0, alreadyThere: 0, considered: 0, boardName: null, noRun: true }
  // Best contact per firm: a decision maker, then one with an email, then the higher score. Then the top firms by that contact's score.
  // The firm of a contact: the matched firm if the run recorded it, else the directory record's firm, else the email's company domain (not a free mailbox), else the contact alone.
  // Contacts are only offered with something to reach them by: an email, or a real LinkedIn profile address (the matching data sometimes holds a website or a Twitter link there).
  const picks = (await sql`SELECT * FROM (
      SELECT DISTINCT ON (g.firm_key) g.* FROM (
        SELECT c.id, c.contact_id, c.investor_id, c.contact_name, c.contact_title, c.contact_email, c.contact_linkedin, c.contact_location, c.contact_type, c.score, c.tier, c.why_this_lp, c.is_decision_maker,
          coalesce(fm.firm_id, i.firm_id) AS firm_id,
          coalesce(fm.firm_id::text, i.firm_id::text, CASE WHEN lower(split_part(c.contact_email, '@', 2)) IN ('', 'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'proton.me', 'protonmail.com') THEN NULL ELSE lower(split_part(c.contact_email, '@', 2)) END, c.id::text) AS firm_key
        FROM lp_contact_matches c LEFT JOIN lp_firm_matches fm ON fm.id = c.firm_match_id LEFT JOIN investors i ON i.id = c.investor_id
        WHERE c.session_id = ${run.id} AND (c.contact_email LIKE '%@%' OR c.contact_linkedin LIKE '%linkedin.com/in/%')
      ) g
      ORDER BY g.firm_key, g.is_decision_maker DESC NULLS LAST, (g.contact_email LIKE '%@%') DESC NULLS LAST, g.score DESC NULLS LAST) best
    ORDER BY best.score DESC NULLS LAST, best.id LIMIT ${n * 3}`) as any[]
  const existing =
    (await sql`SELECT lower(display_email) AS email, investor_id FROM crm_entries WHERE org_id = ${scope.orgId}`) as any[]
  const haveEmail = new Set(existing.map((e) => e.email).filter(Boolean)),
    haveId = new Set(
      existing
        .map((e) => e.investor_id)
        .filter(Boolean)
        .map(String),
    )
  const fresh: any[] = []
  let already = 0
  for (const p of picks) {
    if (fresh.length >= n) break
    const dup =
      (p.contact_email && haveEmail.has(String(p.contact_email).toLowerCase())) ||
      (p.investor_id && haveId.has(String(p.investor_id))) ||
      (p.contact_id && haveId.has(String(p.contact_id)))
    if (dup) {
      already++
      continue
    }
    fresh.push(p)
  }
  const boardName = `LP shortlist: ${String(run.fund_name ?? "fund").slice(0, 60)}`
  if (!fresh.length)
    return { added: 0, alreadyThere: already, considered: picks.length, boardName, noRun: false }
  const [b] =
    (await sql`INSERT INTO crm_boards (org_id, user_id, name, source_session_id, position) VALUES (${scope.orgId}, ${scope.userId}, ${boardName}, ${`lpm:${run.id}`}, 0)
    ON CONFLICT (org_id, source_session_id) WHERE source_session_id IS NOT NULL DO UPDATE SET source_session_id = EXCLUDED.source_session_id RETURNING id`) as any[]
  const payload = JSON.stringify(
    fresh.map((p) => ({
      key: `lpm:${run.id}:${p.id}`,
      investor: p.investor_id ?? p.contact_id ?? null,
      firm: p.firm_id ?? null,
      name: p.contact_name,
      title: p.contact_title,
      email: p.contact_email,
      linkedin: String(p.contact_linkedin ?? "").includes("linkedin.com/in/") ? p.contact_linkedin : null,
      location: p.contact_location,
      type: p.contact_type,
      score: p.score == null ? null : Math.round(Number(p.score)),
      tier: p.tier,
      why: p.why_this_lp,
    })),
  )
  const ins =
    (await sql`INSERT INTO crm_entries (org_id, user_id, source, source_session_id, board_id, import_key, firm_id, investor_id, display_name, display_title, display_email, display_linkedin, display_location, display_type, display_score, display_tier, why_match, stage)
    SELECT ${scope.orgId}, ${scope.userId}, 'lp_matching', ${`lpm:${run.id}`}, ${b.id}, x.key, x.firm, x.investor, x.name, x.title, nullif(x.email, ''), nullif(x.linkedin, ''), x.location, x.type, x.score, x.tier, x.why, 'queued'
    FROM jsonb_to_recordset(${payload}::jsonb) AS x(key text, investor text, firm text, name text, title text, email text, linkedin text, location text, type text, score int, tier text, why text)
    ON CONFLICT DO NOTHING RETURNING id`) as any[]
  return {
    added: ins.length,
    alreadyThere: already + (fresh.length - ins.length),
    considered: picks.length,
    boardName,
    noRun: false,
  }
}
