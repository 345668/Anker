/**
 * Reading a saved LP run (docs/architecture/63 section 5): the ranked rows, one row in full, and resolving a name or id inside the workspace.
 * Everything is scoped by the workspace of the run (the session's org, or its fund profile's for runs saved before sessions had one). Contact addresses are not returned:
 * the list says whether a way to reach someone exists, and the address itself travels only into the CRM.
 */
import { sql } from "@/lib/db"
import { factorRows } from "./explain"

export type MatchKind = "firm" | "contact"
export interface MatchRef { kind: MatchKind; id: string }
export interface MatchRow {
  kind: MatchKind; id: string; entityKey: string; name: string; title: string | null; type: string; location: string
  tier: string; score: number; stage: string; confidence: string | null; gaps: string[]; reasons: string[]; why: string
  tags: string[]; expectedTicket: number | null; aumUsd: number | null; hasEmail: boolean; hasLinkedIn: boolean
  verdict: string | null; excluded: boolean
}
export interface ListQuery { kind: MatchKind; tier?: string; confidence?: string; q?: string; hideJudged?: boolean; limit?: number; offset?: number }

const arr = (v: any): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : [] } catch { return [] } })() : [])

/** The run, only if it belongs to this workspace and is finished. */
export async function sessionInWorkspace(orgId: string, sessionId: string): Promise<any | null> {
  const [s] = (await sql`SELECT s.* FROM lp_match_sessions s LEFT JOIN fund_profiles f ON f.id = s.fund_profile_id
    WHERE s.id::text = ${sessionId} AND COALESCE(s.org_id, f.org_id) = ${orgId} AND s.status = 'completed' LIMIT 1`) as any[]
  return s ?? null
}
/** The newest finished run of the workspace, optionally for one fund profile. */
export async function latestSession(orgId: string, fundProfileId?: string | null): Promise<any | null> {
  const [s] = (await sql`SELECT s.* FROM lp_match_sessions s LEFT JOIN fund_profiles f ON f.id = s.fund_profile_id
    WHERE COALESCE(s.org_id, f.org_id) = ${orgId} AND s.status = 'completed' AND (${fundProfileId ?? null}::text IS NULL OR s.fund_profile_id::text = ${fundProfileId ?? null})
    ORDER BY s.created_at DESC LIMIT 1`) as any[]
  return s ?? null
}

function shape(kind: MatchKind, r: any): MatchRow {
  const firm = kind === "firm"
  const entity = firm ? r.firm_id : r.investor_id
  return {
    kind, id: String(r.id), entityKey: `${kind}:${entity}`,
    name: String(firm ? r.firm_name : r.contact_name ?? ""), title: firm ? null : (r.contact_title ?? null),
    type: String((firm ? r.firm_type : r.contact_type) ?? ""), location: String((firm ? r.firm_location : r.contact_location) ?? ""),
    tier: String(r.tier ?? ""), score: Number(r.score), stage: String(r.stage ?? "identified"),
    confidence: r.confidence ?? null, gaps: arr(r.gaps), reasons: arr(r.reasons), why: String(r.why_this_lp ?? ""), tags: arr(r.tags),
    expectedTicket: r.expected_ticket_usd == null ? null : Number(r.expected_ticket_usd), aumUsd: firm && r.firm_aum_usd != null ? Number(r.firm_aum_usd) : null,
    hasEmail: !firm && String(r.contact_email ?? "").includes("@"), hasLinkedIn: !firm && String(r.contact_linkedin ?? "").includes("linkedin.com/in/"),
    verdict: r.verdict ?? null, excluded: !!r.excluded,
  }
}

const FIRM_COLS = "m.id, m.firm_id, m.firm_name, m.firm_type, m.firm_location, m.firm_aum_usd, m.tier, m.score, m.stage, m.confidence, m.gaps, m.reasons, m.why_this_lp, m.tags, m.expected_ticket_usd"
const CONTACT_COLS = "m.id, m.investor_id, m.contact_name, m.contact_title, m.contact_type, m.contact_location, m.contact_email, m.contact_linkedin, m.tier, m.score, m.stage, m.confidence, m.gaps, m.reasons, m.why_this_lp, m.tags, m.expected_ticket_usd"

export async function listMatches(orgId: string, sessionId: string, qy: ListQuery): Promise<{ rows: MatchRow[]; total: number } | null> {
  const s = await sessionInWorkspace(orgId, sessionId)
  if (!s) return null
  const firm = qy.kind === "firm", table = firm ? "lp_firm_matches" : "lp_contact_matches"
  const limit = Math.max(1, Math.min(100, Math.floor(qy.limit ?? 50))), offset = Math.max(0, Math.floor(qy.offset ?? 0))
  const nameCol = firm ? "m.firm_name" : "m.contact_name", entity = firm ? "'firm:' || m.firm_id" : "'contact:' || m.investor_id"
  const where = `m.session_id::text = $1 AND ($2::text IS NULL OR m.tier = $2) AND ($3::text IS NULL OR m.confidence = $3) AND ($4::text IS NULL OR ${nameCol} ILIKE $4)
    AND ($6::boolean IS NOT TRUE OR NOT EXISTS (SELECT 1 FROM lp_match_feedback fb WHERE fb.org_id = $5 AND fb.entity_key = ${entity}))`
  const params = [sessionId, qy.tier || null, qy.confidence || null, qy.q ? `%${qy.q.replace(/[%_]/g, "")}%` : null, orgId, !!qy.hideJudged]
  const [{ n }] = (await sql.unsafe(`SELECT count(*)::int AS n FROM ${table} m WHERE ${where}`, params)) as any[]
  const rows = (await sql.unsafe(
    `SELECT ${firm ? FIRM_COLS : CONTACT_COLS},
       fb.verdict, EXISTS (SELECT 1 FROM founder_match_exclusions x WHERE x.org_id = $5 AND x.entity_key = ${entity}) AS excluded
     FROM ${table} m LEFT JOIN LATERAL (SELECT verdict FROM lp_match_feedback f2 WHERE f2.org_id = $5 AND f2.entity_key = ${entity} ORDER BY f2.created_at DESC LIMIT 1) fb ON true
     WHERE ${where} ORDER BY m.score DESC, ${nameCol} ASC LIMIT ${limit} OFFSET ${offset}`, params)) as any[]
  return { rows: rows.map((r) => shape(qy.kind, r)), total: n }
}

/** One match in full: the row and how the engine scored it. */
export async function getMatch(orgId: string, kind: MatchKind, id: string): Promise<(MatchRow & { sessionId: string; factors: ReturnType<typeof factorRows> }) | null> {
  const firm = kind === "firm", table = firm ? "lp_firm_matches" : "lp_contact_matches", entity = firm ? "'firm:' || m.firm_id" : "'contact:' || m.investor_id"
  const [r] = (await sql.unsafe(
    `SELECT ${firm ? FIRM_COLS : CONTACT_COLS}, m.session_id, m.factor_lp_type, m.factor_aum, m.factor_sector, m.factor_geo, m.factor_thesis_signals, ${firm ? "0" : "m.factor_contact_quality"} AS factor_contact,
       (SELECT verdict FROM lp_match_feedback f2 WHERE f2.org_id = $2 AND f2.entity_key = ${entity} ORDER BY f2.created_at DESC LIMIT 1) AS verdict,
       EXISTS (SELECT 1 FROM founder_match_exclusions x WHERE x.org_id = $2 AND x.entity_key = ${entity}) AS excluded
     FROM ${table} m JOIN lp_match_sessions s ON s.id = m.session_id LEFT JOIN fund_profiles f ON f.id = s.fund_profile_id
     WHERE m.id::text = $1 AND COALESCE(s.org_id, f.org_id) = $2 LIMIT 1`, [id, orgId])) as any[]
  if (!r) return null
  const row = shape(kind, r)
  const factors = factorRows({ lpType: Number(r.factor_lp_type ?? 0), aum: Number(r.factor_aum ?? 0), sector: Number(r.factor_sector ?? 0), geography: Number(r.factor_geo ?? 0), thesis: Number(r.factor_thesis_signals ?? 0), contact: Number(r.factor_contact ?? 0) }, kind)
  return { ...row, sessionId: String(r.session_id), factors }
}

/** Names the user used, resolved to rows of one run. An exact name (any case) is a match; two rows with the same name are reported, never guessed. */
export async function resolveNames(orgId: string, sessionId: string, names: string[], kind?: MatchKind): Promise<{ refs: Array<MatchRef & { name: string }>; unresolved: string[]; ambiguous: string[] }> {
  const refs: Array<MatchRef & { name: string }> = [], unresolved: string[] = [], ambiguous: string[] = []
  for (const raw of names.slice(0, 60)) {
    const name = raw.trim()
    if (!name) continue
    const hits: Array<MatchRef & { name: string }> = []
    for (const k of kind ? [kind] : (["firm", "contact"] as MatchKind[])) {
      const table = k === "firm" ? "lp_firm_matches" : "lp_contact_matches", col = k === "firm" ? "firm_name" : "contact_name"
      const found = (await sql.unsafe(`SELECT m.id, m.${col} AS name FROM ${table} m WHERE m.session_id::text = $1 AND lower(m.${col}) = lower($2) LIMIT 3`, [sessionId, name])) as any[]
      for (const f of found) hits.push({ kind: k, id: String(f.id), name: String(f.name) })
    }
    if (hits.length === 1) refs.push(hits[0]); else if (!hits.length) unresolved.push(name); else ambiguous.push(name)
  }
  return { refs, unresolved, ambiguous }
}

// ─── Run history and comparison (docs/architecture/63 section 5) ───────────────────────────────────────

export interface RunSummaryRow {
  id: string; fundProfileId: string; fundName: string; createdAt: string; source: string; parentSessionId: string | null
  filters: unknown; options: unknown; exclusions: unknown; confidence: unknown
  qualifiedFirms: number; qualifiedContacts: number; contactsWithEmail: number; anchorCandidates: number; engineVersion: string; durationMs: number
}
const iso = (v: any) => (v instanceof Date ? v.toISOString() : String(v))
export function shapeSession(s: any): RunSummaryRow {
  return {
    id: String(s.id), fundProfileId: String(s.fund_profile_id), fundName: String(s.fund_name ?? ""), createdAt: iso(s.created_at), source: s.source ?? "page", parentSessionId: s.parent_session_id ? String(s.parent_session_id) : null,
    filters: s.filters_applied ?? null, options: s.run_options ?? null, exclusions: s.exclusion_counts ?? null, confidence: s.confidence_counts ?? null,
    qualifiedFirms: Number(s.qualified_firms ?? 0), qualifiedContacts: Number(s.qualified_contacts ?? 0), contactsWithEmail: Number(s.contacts_with_email ?? 0),
    anchorCandidates: Number(s.anchor_candidates ?? 0), engineVersion: s.engine_version ?? "v1", durationMs: Number(s.duration_ms ?? 0),
  }
}

/** The workspace's finished runs, newest first, whoever started them. */
export async function listSessions(orgId: string, opts: { fundProfileId?: string | null; limit?: number } = {}): Promise<RunSummaryRow[]> {
  const limit = Math.max(1, Math.min(50, Math.floor(opts.limit ?? 20)))
  const rows = (await sql`SELECT s.* FROM lp_match_sessions s LEFT JOIN fund_profiles f ON f.id = s.fund_profile_id
    WHERE COALESCE(s.org_id, f.org_id) = ${orgId} AND s.status = 'completed' AND (${opts.fundProfileId ?? null}::text IS NULL OR s.fund_profile_id::text = ${opts.fundProfileId ?? null})
    ORDER BY s.created_at DESC LIMIT ${limit}`) as any[]
  return rows.map(shapeSession)
}

export interface RunComparison {
  newer: RunSummaryRow; older: RunSummaryRow
  newFirms: string[]; droppedFirms: string[]; newCount: number; droppedCount: number
  firmsDelta: number; contactsDelta: number
}
/** What changed between two runs of the workspace: firms that appear only in the newer run, firms that appear only in the older, and the change in counts. */
export async function compareSessions(orgId: string, newerId: string, olderId: string, cap = 25): Promise<RunComparison | null> {
  const [n, o] = await Promise.all([sessionInWorkspace(orgId, newerId), sessionInWorkspace(orgId, olderId)])
  if (!n || !o) return null
  const side = async (id: string) => new Map(((await sql`SELECT firm_id::text AS id, firm_name AS name FROM lp_firm_matches WHERE session_id::text = ${id}`) as any[]).map((r) => [String(r.id), String(r.name)]))
  const [a, b] = await Promise.all([side(newerId), side(olderId)])
  const added = [...a].filter(([id]) => !b.has(id)).map(([, name]) => name), dropped = [...b].filter(([id]) => !a.has(id)).map(([, name]) => name)
  const ns = shapeSession(n), os = shapeSession(o)
  return { newer: ns, older: os, newFirms: added.slice(0, cap), droppedFirms: dropped.slice(0, cap), newCount: added.length, droppedCount: dropped.length,
    firmsDelta: ns.qualifiedFirms - os.qualifiedFirms, contactsDelta: ns.qualifiedContacts - os.qualifiedContacts }
}

/** The run before this one for the same fund profile, if there is one. */
export async function previousSessionId(orgId: string, session: { id: string; fund_profile_id: string; created_at: unknown }): Promise<string | null> {
  const [r] = (await sql`SELECT s.id FROM lp_match_sessions s LEFT JOIN fund_profiles f ON f.id = s.fund_profile_id
    WHERE COALESCE(s.org_id, f.org_id) = ${orgId} AND s.status = 'completed' AND s.fund_profile_id::text = ${String(session.fund_profile_id)} AND s.id::text <> ${String(session.id)} AND s.created_at < (SELECT x.created_at FROM lp_match_sessions x WHERE x.id::text = ${String(session.id)})
    ORDER BY s.created_at DESC LIMIT 1`) as any[]
  return r ? String(r.id) : null
}
