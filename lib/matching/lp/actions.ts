/**
 * What a person can do with suggested LPs (docs/architecture/63 section 5, rows and bulk actions): put them in the CRM, and ask for first-contact drafts.
 * Both stop short of reaching anyone: adding is a CRM write a person can undo, and drafts are written as proposals a person approves (lib/vc/lp-wave.ts). The assistant
 * reaches the CRM write only through the action layer (capability lp_match_to_crm); the page calls the same function when a signed-in person clicks.
 */
import { sql } from "@/lib/db"
import { sessionInWorkspace, type MatchKind, type MatchRef } from "./matches"

export const ADD_MAX = 50
export interface AddResult {
  added: Array<{ name: string; entryId: string }>
  already: Array<{ name: string; entryId: string | null }>
  skipped: Array<{ name: string; reason: string }>
  boardName: string
}
export class MatchActionError extends Error { constructor(message: string, readonly status = 422) { super(message) } }

interface Loaded { ref: MatchRef; name: string; row: any }
async function load(orgId: string, sessionId: string, refs: MatchRef[]): Promise<Loaded[]> {
  const out: Loaded[] = []
  for (const kind of ["firm", "contact"] as MatchKind[]) {
    const ids = refs.filter((r) => r.kind === kind).map((r) => r.id)
    if (!ids.length) continue
    const rows = kind === "firm"
      ? ((await sql`SELECT m.id, m.firm_id, m.firm_name AS name, m.firm_type AS type, m.firm_location AS location, m.score, m.tier, m.why_this_lp
          FROM lp_firm_matches m WHERE m.session_id::text = ${sessionId} AND m.id::text = ANY(${ids}::text[])`) as any[])
      : ((await sql`SELECT m.id, m.investor_id, i.firm_id, m.contact_name AS name, m.contact_title AS title, m.contact_email AS email, m.contact_linkedin AS linkedin,
          m.contact_location AS location, m.contact_type AS type, m.score, m.tier, m.why_this_lp
          FROM lp_contact_matches m LEFT JOIN investors i ON i.id = m.investor_id WHERE m.session_id::text = ${sessionId} AND m.id::text = ANY(${ids}::text[])`) as any[])
    for (const r of rows) out.push({ ref: { kind, id: String(r.id) }, name: String(r.name ?? ""), row: r })
  }
  return out
}

/** Which of these are already in the workspace's CRM, and which cannot be added, without writing anything. */
async function classify(orgId: string, loaded: Loaded[]) {
  const existing = (await sql`SELECT id, investor_id, firm_id, lower(display_email) AS email FROM crm_entries WHERE org_id = ${orgId}`) as any[]
  const byInvestor = new Map(existing.filter((e) => e.investor_id).map((e) => [String(e.investor_id), String(e.id)]))
  const byEmail = new Map(existing.filter((e) => e.email).map((e) => [String(e.email), String(e.id)]))
  const byFirm = new Map(existing.filter((e) => e.firm_id).map((e) => [String(e.firm_id), String(e.id)]))
  const fresh: Loaded[] = [], already: AddResult["already"] = [], skipped: AddResult["skipped"] = []
  for (const l of loaded) {
    const r = l.row
    const hit = l.ref.kind === "contact"
      ? (r.investor_id && byInvestor.get(String(r.investor_id))) || (r.email && byEmail.get(String(r.email).toLowerCase())) || null
      : byFirm.get(String(r.firm_id)) ?? null
    if (hit) { already.push({ name: l.name, entryId: hit }); continue }
    if (l.ref.kind === "contact" && !String(r.email ?? "").includes("@") && !String(r.linkedin ?? "").includes("linkedin.com/in/")) { skipped.push({ name: l.name, reason: "no email or LinkedIn profile to reach them by" }); continue }
    fresh.push(l)
  }
  return { fresh, already, skipped }
}

export async function previewAdd(orgId: string, sessionId: string, refs: MatchRef[]) {
  const s = await sessionInWorkspace(orgId, sessionId)
  if (!s) throw new MatchActionError("That run is not in this workspace.", 404)
  const loaded = await load(orgId, sessionId, refs.slice(0, ADD_MAX))
  return { fund: String(s.fund_name ?? "fund"), ...(await classify(orgId, loaded)), notFound: refs.length - loaded.length }
}

export async function addMatchesToCrm(scope: { orgId: string; userId: string }, sessionId: string, refs: MatchRef[]): Promise<AddResult> {
  if (!refs.length) throw new MatchActionError("Choose at least one LP.")
  if (refs.length > ADD_MAX) throw new MatchActionError(`Add at most ${ADD_MAX} at a time.`)
  const s = await sessionInWorkspace(scope.orgId, sessionId)
  if (!s) throw new MatchActionError("That run is not in this workspace.", 404)
  const { fresh, already, skipped } = await classify(scope.orgId, await load(scope.orgId, sessionId, refs))
  const boardName = `LP matches: ${String(s.fund_name ?? "fund").slice(0, 60)}`
  const added: AddResult["added"] = []
  if (fresh.length) {
    const [b] = (await sql`INSERT INTO crm_boards (org_id, user_id, name, source_session_id, position) VALUES (${scope.orgId}, ${scope.userId}, ${boardName}, ${`lpm:${sessionId}`}, 0)
      ON CONFLICT (org_id, source_session_id) WHERE source_session_id IS NOT NULL DO UPDATE SET source_session_id = EXCLUDED.source_session_id RETURNING id`) as any[]
    const payload = JSON.stringify(fresh.map((l) => {
      const r = l.row, c = l.ref.kind === "contact"
      return { key: `lpm:${sessionId}:${l.ref.id}`, investor: c ? r.investor_id ?? null : null, firm: r.firm_id ?? null, name: l.name, title: c ? r.title ?? null : null,
        email: c ? r.email ?? "" : "", linkedin: c && String(r.linkedin ?? "").includes("linkedin.com/in/") ? r.linkedin : "", location: r.location ?? null, type: r.type ?? null,
        score: r.score == null ? null : Math.round(Number(r.score)), tier: r.tier ?? null, why: r.why_this_lp ?? null }
    }))
    const ins = (await sql`INSERT INTO crm_entries (org_id, user_id, source, source_session_id, board_id, import_key, firm_id, investor_id, display_name, display_title, display_email, display_linkedin, display_location, display_type, display_score, display_tier, why_match, stage)
      SELECT ${scope.orgId}, ${scope.userId}, 'lp_matching', ${`lpm:${sessionId}`}, ${b.id}, x.key, x.firm, x.investor, x.name, x.title, nullif(x.email, ''), nullif(x.linkedin, ''), x.location, x.type, x.score, x.tier, x.why, 'queued'
      FROM jsonb_to_recordset(${payload}::jsonb) AS x(key text, investor text, firm text, name text, title text, email text, linkedin text, location text, type text, score int, tier text, why text)
      ON CONFLICT DO NOTHING RETURNING id, import_key, display_name`) as any[]
    for (const r of ins) added.push({ name: String(r.display_name), entryId: String(r.id) })
    const got = new Set(ins.map((r) => String(r.display_name)))
    for (const l of fresh) if (!got.has(l.name)) already.push({ name: l.name, entryId: null })
  }
  return { added, already, skipped, boardName }
}

/** Remove entries a run added, only while nobody has worked on them (still queued, no message, no task). */
export async function removeAdded(orgId: string, entryIds: string[]): Promise<number> {
  if (!entryIds.length) return 0
  const rows = (await sql`DELETE FROM crm_entries e WHERE e.org_id = ${orgId} AND e.id = ANY(${entryIds}::text[]) AND e.stage = 'queued'
    AND NOT EXISTS (SELECT 1 FROM outreach_messages m WHERE m.crm_entry_id = e.id) AND NOT EXISTS (SELECT 1 FROM crm_tasks t WHERE t.crm_entry_id = e.id) RETURNING e.id`) as any[]
  return rows.length
}

export interface DraftIntrosResult { added: AddResult; proposed: number; skipped: Array<{ name: string; reason: string }>; remainingToday: number; stoppedAtLimit: boolean }

/**
 * First-contact drafts for chosen people, as proposals (lib/vc/lp-wave.ts): the people are put in the CRM if they are not there, then the wave writes one pending proposal
 * each, within its own per-request and per-day limits. A firm has no one to write to, so a chosen firm is skipped with the reason.
 */
export async function draftIntros(scope: { orgId: string; userId: string; persona?: string | null; email?: string | null }, sessionId: string, refs: MatchRef[]): Promise<DraftIntrosResult> {
  const { draftLpWave, WAVE_PER_REQUEST } = await import("@/lib/vc/lp-wave")
  const people = refs.filter((r) => r.kind === "contact"), firms = refs.filter((r) => r.kind === "firm")
  if (!people.length) throw new MatchActionError("Choose people, not firms: a draft is written to a person.")
  if (people.length > WAVE_PER_REQUEST) throw new MatchActionError(`Draft for at most ${WAVE_PER_REQUEST} people at a time.`)
  const added = await addMatchesToCrm(scope, sessionId, people)
  const entryIds = [...added.added.map((a) => a.entryId), ...added.already.map((a) => a.entryId).filter((x): x is string => !!x)]
  if (firms.length) added.skipped.push(...firms.map(() => ({ name: "A firm", reason: "choose a person at the firm: a draft is written to a person" })))
  if (!entryIds.length) return { added, proposed: 0, skipped: added.skipped, remainingToday: 0, stoppedAtLimit: false }
  const wave = await draftLpWave({ orgId: scope.orgId, userId: scope.userId, persona: scope.persona, email: scope.email }, entryIds.length, undefined, entryIds)
  return { added, proposed: wave.proposed, skipped: [...added.skipped, ...wave.skipped], remainingToday: wave.remainingToday, stoppedAtLimit: wave.stoppedAtLimit }
}
