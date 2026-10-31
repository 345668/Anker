import "server-only"
import { sql } from "@/lib/db"
import { hashKey, identityHashes } from "./identity"
import { PERSON_REFS } from "./person-registry"
import { FIRM_REFS, FIRM_LIST_REFS } from "./firm-registry"
import { firmDedupKeys } from "@/lib/matching/v2/dedup"

/**
 * Reversible merges of directory records (docs/architecture/55 sections 6 and 10, E2 person and E3 firm).
 *
 * A merge is ONE SQL statement (data-modifying CTEs), so it is all or nothing whatever the database driver: it fills the survivor's EMPTY fields from the loser (never overwrites), moves every
 * reference from the registry to the survivor (or removes the loser's derived rows), records the whole loser row, the ids it moved and what it filled, writes the alias and the importer keys,
 * marks the candidate merged, and deletes the loser. If anything cannot be re-pointed (a workspace holds a record for both), the statement fails and NOTHING changes.
 * Undo within 90 days puts the loser back, moves back exactly the rows that were moved, and restores the filled fields that have not been edited since.
 * Nothing here runs by itself except the flagged merge of `certain` people (autoMergePeople); everything else is a person's click in SAIL.
 */
export type Kind = "firm" | "person"
export const UNDO_DAYS = 90, REASON_ABOVE_REFS = 10, AUTO_CAP = 25
export class MergeError extends Error { constructor(message: string, readonly status = 409, readonly code = "merge") { super(message) } }

const SPEC = {
  person: { table: "investors", refs: PERSON_REFS.map((r) => ({ table: r.table, column: r.column, fate: r.fate === "delete" ? ("drop" as const) : ("move" as const), workspace: r.owner === "workspace" })),
    text: ["first_name", "last_name", "email", "phone", "title", "linkedin_url", "twitter_url", "avatar", "bio", "location", "person_linkedin_url", "investor_type", "investor_state", "investor_country", "fund_hq", "hq_location", "funding_stage", "typical_investment", "website", "address", "investment_thesis"],
    arrays: ["stages", "sectors"], numbers: ["num_lead_investments", "total_investments"] },
  firm: { table: "investment_firms", refs: FIRM_REFS.filter((r) => r.fate !== "ignore").map((r) => ({ table: r.table, column: r.column, fate: r.fate as "move" | "drop", workspace: r.owner === "workspace" })),
    text: ["description", "website", "logo", "logo_url", "type", "aum", "location", "hq_location", "linkedin_url", "twitter_url", "industry", "funding_raised", "last_funding_date", "foundation_year", "employee_range", "firm_classification", "typical_check_size"],
    arrays: ["stages", "sectors", "emails", "phones", "urls"], numbers: ["check_size_min", "check_size_max", "portfolio_count"] },
} as const
const q = (text: string, params: unknown[] = []) => (sql as any).unsafe(text, params) as Promise<any[]>
const empty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0)
const norm = (v: unknown) => JSON.stringify(v).toLowerCase().replace(/\s+/g, " ")
const q1 = (id: string) => `"${id.replace(/"/g, "")}"`

export interface Plan {
  kind: Kind; survivorId: string; loserId: string
  fills: Record<string, unknown>; before: Record<string, unknown>; conflicts: string[]; fillSkippedBecauseOfSource: boolean
  moves: Array<{ table: string; column: string; n: number; workspace: boolean }>; drops: Array<{ table: string; n: number }>; workspaceRefs: number
  blockers: string[]
}
async function rowOf(kind: Kind, id: string) { return (await q(`SELECT * FROM ${SPEC[kind].table} WHERE id = $1`, [id]))[0] ?? null }
const hasCol = async (table: string, col: string) => (await q(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`, [table, col])).length > 0
async function columnsOf(table: string): Promise<Set<string>> { return new Set((await q(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table])).map((r) => String(r.column_name))) }

/** What a merge WOULD do, without doing it: fields to fill, conflicts, how many references move, and anything that forbids it. */
export async function planMerge(kind: Kind, survivorId: string, loserId: string): Promise<Plan> {
  const spec = SPEC[kind], blockers: string[] = []
  const plan: Plan = { kind, survivorId, loserId, fills: {}, before: {}, conflicts: [], fillSkippedBecauseOfSource: false, moves: [], drops: [], workspaceRefs: 0, blockers }
  if (survivorId === loserId) { blockers.push("Choose two different records."); return plan }
  const [s, l] = [await rowOf(kind, survivorId), await rowOf(kind, loserId)]
  if (!s || !l) { blockers.push(!s ? "The surviving record no longer exists." : "The record to fold in no longer exists."); return plan }
  if (kind === "person") {
    const dead = (r: any) => r.is_active === false || String(r.first_name ?? "").trim() === "Removed"
    if (dead(s)) blockers.push("The surviving person is hidden or erased: a removed person is never the survivor of a merge.")
    if (dead(l)) blockers.push("The person to fold in is hidden or erased.")
    try { const { isTombstoned } = await import("./maintenance"); if (await isTombstoned({ email: s.email, linkedinUrl: s.linkedin_url, personLinkedinUrl: s.person_linkedin_url, source: s.source })) blockers.push("The surviving person matches a tombstone (erased or withdrawn).") } catch (e) { blockers.push(`Tombstones could not be checked (${(e as Error).message}); merging is refused rather than guessed.`) }
  } else {
    if (s.parent_firm_id === loserId || l.parent_firm_id === survivorId) blockers.push("One firm is the parent of the other: they are related, not the same. Record the hierarchy instead.")
  }
  // Facts from a source that is not recorded (unreviewed, restricted or withdrawn) are not copied onto another record: the survivor keeps what it has. References still move.
  const srcOf = (r: any) => String(r.source ?? "").trim()
  let copyOk = srcOf(s) === srcOf(l) || !srcOf(l)
  if (!copyOk) { const [st] = await q(`SELECT status FROM directory_sources WHERE source = $1`, [srcOf(l)]).catch(() => []); copyOk = st?.status === "recorded" }
  if (!copyOk) plan.fillSkippedBecauseOfSource = true
  if ((await q(`SELECT status FROM directory_sources WHERE source = ANY($1::text[]) AND status = 'withdrawn'`, [[srcOf(s), srcOf(l)].filter(Boolean)]).catch(() => [])).length) blockers.push("One of the records comes from a withdrawn source: purge or restore the source first.")
  const cols = await columnsOf(spec.table)
  for (const c of [...spec.text, ...spec.arrays, ...spec.numbers].filter((c) => cols.has(c))) {
    const sv = s[c], lv = l[c]
    if (empty(lv)) continue
    if (empty(sv)) { if (copyOk) { plan.fills[c] = lv; plan.before[c] = sv ?? null } }
    else if (!(spec.arrays as readonly string[]).includes(c) && norm(sv) !== norm(lv)) plan.conflicts.push(c)
  }
  for (const c of (spec.arrays as readonly string[]).filter((c) => cols.has(c))) {                      // lists are unioned, not "filled": the survivor keeps its own and gains the loser's
    const sv: any[] = Array.isArray(s[c]) ? s[c] : [], lv: any[] = Array.isArray(l[c]) ? l[c] : []
    const extra = lv.filter((x) => !sv.some((y) => norm(y) === norm(x)))
    if (copyOk && extra.length && !(c in plan.fills)) { plan.fills[c] = [...sv, ...extra]; plan.before[c] = s[c] ?? null }
  }
  for (const r of spec.refs) {
    try {
      const n = Number((await q(`SELECT count(*)::int AS n FROM ${q1(r.table)} WHERE ${q1(r.column)} = $1`, [loserId]))[0]?.n ?? 0)
      if (!n) continue
      if (r.fate === "drop") plan.drops.push({ table: r.table, n }); else { plan.moves.push({ table: r.table, column: r.column, n, workspace: r.workspace }); if (r.workspace) plan.workspaceRefs += n }
    } catch (e) { if (!/does not exist/i.test(String((e as Error).message))) throw e }
  }
  if (kind === "firm") for (const r of FIRM_LIST_REFS) {
    try {
      const n = Number((await q(`SELECT count(*)::int AS n FROM ${q1(r.table)} WHERE ${q1(r.column)} @> jsonb_build_array($1::text)`, [loserId]))[0]?.n ?? 0)
      if (n) { plan.moves.push({ table: r.table, column: r.column, n, workspace: r.owner === "workspace" }); if (r.owner === "workspace") plan.workspaceRefs += n }
    } catch (e) { if (!/does not exist/i.test(String((e as Error).message))) throw e }
  }
  return plan
}

export interface MergeResult { mergeId: number; survivorId: string; loserId: string; filled: string[]; conflicts: string[]; moved: number; dropped: number; undoUntil: string }
const UNIQUE_MSG = (m: string) => `A workspace (or the directory) holds a record for BOTH ${m} that cannot be combined automatically, so nothing was merged. Resolve that record first.`

/** The alias keys an importer matches on, for the loser: so a later row for it lands on the survivor. People are keyed by the same keyed hashes as the tombstones (no raw email is stored). */
function aliasKeys(kind: Kind, l: any): Array<[string, string]> {
  const out: Array<[string, string]> = []
  if (kind === "firm") {
    for (const k of firmDedupKeys(l.name)) if (k.length >= 3) out.push(["firm_key", k])
    const host = String(l.website ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0]
    if (host && host.includes(".")) out.push(["firm_host", host])
  } else {
    try { const h = identityHashes({ email: l.email, linkedinUrl: l.linkedin_url, personLinkedinUrl: l.person_linkedin_url }, hashKey()); if (h.emailHash) out.push(["email_hash", h.emailHash]); for (const x of h.linkedinHashes) out.push(["linkedin_hash", x]) } catch { /* no hash key here: the maintenance job's hashes still match the survivor through its own row */ }
  }
  return [...new Map(out.map((x) => [x.join("|"), x])).values()]
}

export async function executeMerge(i: { kind: Kind; survivorId: string; loserId: string; candidateId?: number | null; by: string; reason?: string | null }): Promise<MergeResult> {
  const plan = await planMerge(i.kind, i.survivorId, i.loserId)
  if (plan.blockers.length) throw new MergeError(plan.blockers.join(" "), 409, "blocked")
  const reason = (i.reason ?? "").trim()
  if (plan.workspaceRefs > REASON_ABOVE_REFS && reason.length < 5) throw new MergeError(`${plan.workspaceRefs} workspace records point at the record being folded in: give a reason (at least a few words).`, 400, "reason_required")
  if (i.candidateId != null) {
    const [c] = await q(`SELECT kind, a_id, b_id, status FROM directory_candidates WHERE id = $1`, [i.candidateId])
    if (!c || c.kind !== i.kind || ![c.a_id, c.b_id].includes(i.survivorId) || ![c.a_id, c.b_id].includes(i.loserId)) throw new MergeError("That pair is not the candidate it was said to be.", 400, "bad_candidate")
    if (c.status !== "same" && i.by !== "auto") throw new MergeError("Confirm the pair as the same first (the review queue), then merge.", 409, "not_confirmed")
  }
  const spec = SPEC[i.kind], T = q1(spec.table), p: unknown[] = [], P = (v: unknown) => { p.push(v); return `$${p.length}` }
  const sId = P(i.survivorId), lId = P(i.loserId)
  const ctes: string[] = [], movedKeys: string[] = [], droppedKeys: string[] = []
  spec.refs.forEach((r, n) => {
    const t = q1(r.table), c = q1(r.column)
    if (r.fate === "move") { ctes.push(`m${n} AS (UPDATE ${t} SET ${c} = ${sId} WHERE ${c} = ${lId} RETURNING id::text AS id)`); movedKeys.push(`'${r.table}.${r.column}', COALESCE((SELECT jsonb_agg(id) FROM m${n}), '[]'::jsonb)`) }
    else { ctes.push(`d${n} AS (DELETE FROM ${t} WHERE ${c} = ${lId} RETURNING 1)`); droppedKeys.push(`'${r.table}', (SELECT count(*)::int FROM d${n})`) }
  })
  if (i.kind === "firm") FIRM_LIST_REFS.forEach((r, n) => {
    const t = q1(r.table), c = q1(r.column), ls = P(i.survivorId), ll = P(i.loserId)       // their own parameters: the shared ones are typed by the id columns they meet first
    ctes.push(`a${n} AS (UPDATE ${t} SET ${c} = ${c} || jsonb_build_array(${ls}::text) WHERE ${c} @> jsonb_build_array(${ll}::text) AND NOT ${c} @> jsonb_build_array(${ls}::text) RETURNING id::text AS id)`)
    movedKeys.push(`'${r.table}.${r.column}', COALESCE((SELECT jsonb_agg(id) FROM a${n}), '[]'::jsonb)`)
  })
  const sets: string[] = []
  for (const [c, v] of Object.entries(plan.fills)) sets.push(`${q1(c)} = ${P(Array.isArray(v) ? JSON.stringify(v) : v)}${Array.isArray(v) ? "::jsonb" : ""}`)
  if (i.kind === "person" && ("email" in plan.fills || "linkedin_url" in plan.fills || "person_linkedin_url" in plan.fills)) sets.push(`email_hash = NULL, linkedin_hashes = NULL, hashed_at = NULL`)      // recomputed by the maintenance job
  ctes.push(sets.length ? `fill AS (UPDATE ${T} SET ${sets.join(", ")}, updated_at = now() WHERE id = ${sId} RETURNING 1)` : `fill AS (SELECT 1 WHERE false)`)
  const keys = aliasKeys(i.kind, (await rowOf(i.kind, i.loserId))!)
  ctes.push(`mg AS (INSERT INTO directory_merges (kind, survivor_id, loser_id, candidate_id, by_staff, reason, filled, before, conflicts, repointed, dropped, loser_row, undo_until)
      SELECT ${P(i.kind)}, ${sId}, ${lId}, ${P(i.candidateId ?? null)}, ${P(i.by)}, ${P(reason || null)}, ${P(Object.keys(plan.fills))}::text[], ${P(JSON.stringify(plan.before))}::jsonb, ${P(JSON.stringify(plan.conflicts))}::jsonb,
        ${movedKeys.length ? `jsonb_build_object(${movedKeys.join(", ")})` : "'{}'::jsonb"}, ${droppedKeys.length ? `jsonb_build_object(${droppedKeys.join(", ")})` : "'{}'::jsonb"},
        (to_jsonb(l) - 'embedding'), now() + interval '${UNDO_DAYS} days' FROM ${T} l WHERE l.id = ${lId} RETURNING id)`)
  ctes.push(`al AS (INSERT INTO directory_aliases (kind, old_id, new_id, merge_id) SELECT ${P(i.kind)}, ${lId}, ${sId}, id FROM mg RETURNING 1)`)
  if (keys.length) ctes.push(`ak AS (INSERT INTO directory_alias_keys (kind, key_type, key, target_id, merge_id) SELECT ${P(i.kind)}, k.t, k.k, ${sId}, mg.id FROM mg, unnest(${P(keys.map((x) => x[0]))}::text[], ${P(keys.map((x) => x[1]))}::text[]) AS k(t, k) ON CONFLICT (kind, key_type, key) DO UPDATE SET target_id = EXCLUDED.target_id, merge_id = EXCLUDED.merge_id RETURNING 1)`)
  if (i.candidateId != null) ctes.push(`cd AS (UPDATE directory_candidates SET status = 'merged', decided_by = COALESCE(decided_by, ${P(i.by)}), decided_at = COALESCE(decided_at, now()), updated_at = now() WHERE id = ${P(i.candidateId)} RETURNING 1)`)
  // Other open candidates that name the loser now name a record that no longer exists: they go stale (a later run re-proposes them against the survivor if they still apply).
  ctes.push(`st AS (UPDATE directory_candidates SET status = 'stale', updated_at = now() WHERE kind = ${P(i.kind)} AND status IN ('open', 'same') AND (a_id = ${lId} OR b_id = ${lId})${i.candidateId != null ? ` AND id <> ${P(i.candidateId)}` : ""} RETURNING 1)`)
  ctes.push(`del AS (DELETE FROM ${T} WHERE id = ${lId} RETURNING 1)`)
  const text = `WITH ${ctes.join(",\n  ")}\nSELECT (SELECT id FROM mg) AS merge_id, (SELECT count(*)::int FROM del) AS removed, (SELECT undo_until FROM directory_merges WHERE id = (SELECT id FROM mg)) AS undo_until`
  let r: any
  try { r = (await q(text, p))[0] } catch (e: any) {
    const m = String(e?.message ?? e)
    if (e?.code === "23505" || /duplicate key|unique constraint/i.test(m)) throw new MergeError(UNIQUE_MSG(i.kind === "firm" ? "firms" : "people"), 409, "conflict")
    if (e?.code === "23503" || /foreign key/i.test(m)) throw new MergeError("Something still refers to the record being folded in, so nothing was merged. It has been left as it was.", 409, "reference")
    throw e
  }
  if (!r?.merge_id || r.removed !== 1) throw new MergeError("The merge did not complete; nothing was changed.", 500, "failed")
  const [m] = await q(`SELECT repointed, dropped, undo_until FROM directory_merges WHERE id = $1`, [r.merge_id])
  const moved = Object.values(m.repointed as Record<string, unknown[]>).reduce((n, a) => n + a.length, 0), dropped = Object.values(m.dropped as Record<string, number>).reduce((n, x) => n + Number(x), 0)
  return { mergeId: Number(r.merge_id), survivorId: i.survivorId, loserId: i.loserId, filled: Object.keys(plan.fills), conflicts: plan.conflicts, moved, dropped, undoUntil: new Date(m.undo_until).toISOString() }
}

export interface UndoResult { restored: string; moved: number; fieldsRestored: string[]; fieldsKept: string[]; derivedNotRestored: number }
/** Puts a merged record back. Moves back exactly the rows that were moved (and still point at the survivor); restores a filled field only if the survivor still holds the value the merge gave it. */
export async function undoMerge(mergeId: number, by: string, now = new Date()): Promise<UndoResult> {
  const [m] = await q(`SELECT * FROM directory_merges WHERE id = $1`, [mergeId])
  if (!m) throw new MergeError("That merge was not found.", 404, "not_found")
  if (m.undone_at) throw new MergeError("That merge was already undone.", 409, "already")
  if (new Date(m.undo_until).getTime() < now.getTime()) throw new MergeError("The 90 days to undo this merge have passed.", 409, "expired")
  const kind = m.kind as Kind, spec = SPEC[kind], T = q1(spec.table)
  if ((await q(`SELECT 1 FROM ${T} WHERE id = $1`, [m.loser_id])).length) throw new MergeError("A record with the old id exists again; it cannot be restored over it.", 409, "id_taken")
  const survivor = await rowOf(kind, m.survivor_id)
  if (!survivor) throw new MergeError("The surviving record no longer exists, so the merge cannot be undone.", 409, "no_survivor")
  const p: unknown[] = [], P = (v: unknown) => { p.push(v); return `$${p.length}` }
  const sId = P(m.survivor_id), lId = P(m.loser_id), ctes: string[] = [`ins AS (INSERT INTO ${T} SELECT * FROM jsonb_populate_record(NULL::${T}, ${P(JSON.stringify(m.loser_row))}::jsonb) RETURNING 1)`]
  let moved = 0
  const repointed = m.repointed as Record<string, string[]>
  Object.entries(repointed).forEach(([key, ids], n) => {
    if (!ids.length) return
    const [table, column] = key.split("."); moved += ids.length
    if (FIRM_LIST_REFS.some((r) => r.table === table && r.column === column))        // a list the merge appended to: take the survivor's id back out of exactly those rows
      ctes.push(`u${n} AS (UPDATE ${q1(table)} SET ${q1(column)} = (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(${q1(column)}) e WHERE e <> to_jsonb(${P(m.survivor_id)}::text)) WHERE id::text = ANY(${P(ids)}::text[]) RETURNING 1)`)
    else ctes.push(`u${n} AS (UPDATE ${q1(table)} SET ${q1(column)} = ${lId} WHERE ${q1(column)} = ${sId} AND id::text = ANY(${P(ids)}::text[]) RETURNING 1)`)
  })
  const restored: string[] = [], kept: string[] = [], sets: string[] = []
  const loserRow = m.loser_row as Record<string, any>, before = m.before as Record<string, any>
  for (const c of m.filled as string[]) {
    const now_ = survivor[c], was = before[c] ?? null, gave = loserRow[c]
    let untouched: boolean
    if (Array.isArray(gave) || Array.isArray(now_)) {          // a list was UNIONED: restore only if it is still exactly the old items plus the loser's extras
      const old: any[] = Array.isArray(was) ? was : [], lv: any[] = Array.isArray(gave) ? gave : []
      const expected = [...old, ...lv.filter((x) => !old.some((y) => norm(y) === norm(x)))], cur: any[] = Array.isArray(now_) ? now_ : []
      untouched = cur.length === expected.length && cur.every((x, i) => norm(x) === norm(expected[i]))
    } else untouched = norm(now_) === norm(gave)                 // a scalar was FILLED: restore only if the survivor still holds exactly the value the merge gave it
    if (!untouched) { kept.push(c); continue }
    restored.push(c)
    const isJson = Array.isArray(was) || Array.isArray(gave)
    sets.push(`${q1(c)} = ${P(was === null ? null : isJson ? JSON.stringify(was) : was)}${isJson && was !== null ? "::jsonb" : ""}`)
  }
  if (sets.length) ctes.push(`rf AS (UPDATE ${T} SET ${sets.join(", ")}, updated_at = now() WHERE id = ${sId} RETURNING 1)`)
  ctes.push(`da AS (DELETE FROM directory_aliases WHERE merge_id = ${P(mergeId)} RETURNING 1)`, `dk AS (DELETE FROM directory_alias_keys WHERE merge_id = ${P(mergeId)} RETURNING 1)`)
  if (m.candidate_id != null) ctes.push(`cd AS (UPDATE directory_candidates SET status = 'same', updated_at = now() WHERE id = ${P(m.candidate_id)} AND status = 'merged' RETURNING 1)`)
  ctes.push(`mu AS (UPDATE directory_merges SET undone_at = now(), undone_by = ${P(by)} WHERE id = ${P(mergeId)} AND undone_at IS NULL RETURNING id)`)
  // The two ids are always mentioned in the final SELECT, so a parameter is never left without a type.
  const r = (await q(`WITH ${ctes.join(",\n  ")}\nSELECT (SELECT count(*)::int FROM mu) AS undone, ${sId}::text AS s, ${lId}::text AS l`, p).catch((e) => { if (e?.code === "23505") throw new MergeError("Restoring would clash with a record created since the merge, so nothing was changed.", 409, "conflict"); throw e }))[0]
  if (r?.undone !== 1) throw new MergeError("The merge could not be undone; nothing was changed.", 500, "failed")
  return { restored: m.loser_id, moved, fieldsRestored: restored, fieldsKept: kept, derivedNotRestored: Object.values(m.dropped as Record<string, number>).reduce((n, x) => n + Number(x), 0) }
}

/** The record an id now means (an old id resolves to the survivor; a current id to itself). Follows a chain of merges, at most 10 steps. */
export async function resolveAlias(kind: Kind, id: string): Promise<string> {
  let cur = id
  for (let n = 0; n < 10; n++) { const [a] = await q(`SELECT new_id FROM directory_aliases WHERE kind = $1 AND old_id = $2`, [kind, cur]); if (!a) return cur; cur = String(a.new_id) }
  return cur
}

/** Which of two records is richer (more filled fields, then more references): the default survivor. */
export function richer(a: any, b: any): "a" | "b" {
  const n = (r: any) => Object.values(r).filter((v) => !empty(v)).length
  return n(b) > n(a) ? "b" : "a"
}

/**
 * Merges `certain` person pairs without a review, behind the platform flag `directory_auto_merge` (off), capped per run. `certain` already needs the same email or the same personal profile
 * AND a compatible name AND a non-team mailbox (E1). A pair that is blocked or conflicts is left for a person. Firms are never merged automatically.
 */
export async function autoMergePeople(o: { enabled: boolean; cap?: number } ): Promise<{ merged: number; skipped: number; ids: number[] }> {
  if (!o.enabled) return { merged: 0, skipped: 0, ids: [] }
  const rows = await q(`SELECT id, a_id, b_id FROM directory_candidates WHERE kind = 'person' AND tier = 'certain' AND status = 'open' ORDER BY score DESC, id LIMIT ${Math.min(o.cap ?? AUTO_CAP, AUTO_CAP)}`)
  let merged = 0, skipped = 0; const ids: number[] = []
  for (const c of rows) {
    try {
      const [a, b] = [await rowOf("person", c.a_id), await rowOf("person", c.b_id)]
      if (!a || !b) { skipped++; continue }
      const w = richer(a, b), survivorId = w === "a" ? c.a_id : c.b_id, loserId = w === "a" ? c.b_id : c.a_id
      const plan = await planMerge("person", survivorId, loserId)
      if (plan.blockers.length || plan.conflicts.length || plan.workspaceRefs > REASON_ABOVE_REFS) { skipped++; continue }
      const r = await executeMerge({ kind: "person", survivorId, loserId, candidateId: Number(c.id), by: "auto", reason: "Same email or profile and a compatible name" }); merged++; ids.push(r.mergeId)
    } catch { skipped++ }
  }
  return { merged, skipped, ids }
}

/** One level of hierarchy: `childId` becomes a programme of `parentId`. Refused for itself, a cycle, a parent that is itself a child, and a child that is already a parent. */
export async function setParent(childId: string, parentId: string | null): Promise<void> {
  if (parentId === null) { await q(`UPDATE investment_firms SET parent_firm_id = NULL, updated_at = now() WHERE id = $1`, [childId]); return }
  if (childId === parentId) throw new MergeError("A firm cannot be its own parent.", 400, "self")
  const [c] = await q(`SELECT id, parent_firm_id FROM investment_firms WHERE id = $1`, [childId]), [p] = await q(`SELECT id, parent_firm_id FROM investment_firms WHERE id = $1`, [parentId])
  if (!c || !p) throw new MergeError("Both firms must exist.", 404, "not_found")
  if (p.parent_firm_id) throw new MergeError("The chosen parent is itself a programme of another firm: hierarchy is one level.", 409, "depth")
  if ((await q(`SELECT 1 FROM investment_firms WHERE parent_firm_id = $1 LIMIT 1`, [childId])).length) throw new MergeError("This firm already has programmes of its own: hierarchy is one level.", 409, "depth")
  await q(`UPDATE investment_firms SET parent_firm_id = $2, updated_at = now() WHERE id = $1`, [childId, parentId])
}
export { hasCol }
