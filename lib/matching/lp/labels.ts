/** The workspace's labelled set (docs/architecture/63 section 8): reading a list a person wrote, saving it, and gathering every label the workspace has made for one run. */
import { sql } from "@/lib/db"
import { resolveNames } from "./matches"
import type { EvalRow } from "./evaluate"
import { SHADOW_KEYS, type ShadowValues } from "./shadow"

export interface LabelLine { name?: string; key?: string; label: "fit" | "not_fit" }
const FIT = /^(fit|yes|y|1|true|approach|good|target)$/i, NOT = /^(not[ _-]?fit|no|n|0|false|skip|dont|don't|do not approach|bad|pass)$/i
const KEY = /^(firm|contact):[\w-]{1,200}$/

/** Lines of "name or firm:id, fit|not fit". A header line is skipped; a line with a label that is neither (including "unsure") is skipped and counted. */
export function parseLabelText(text: string): { lines: LabelLine[]; skipped: string[] } {
  const lines: LabelLine[] = [], skipped: string[] = []
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(.*?)[,;\t]\s*("?)([^,;\t"]+)\2\s*$/)
    if (!m) { skipped.push(line.slice(0, 60)); continue }
    const who = m[1].trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"'), tag = m[3].trim()
    if (/^(name|firm|investor|key|lp)$/i.test(who) && /^(label|verdict|fit)$/i.test(tag)) continue   // header
    const label = FIT.test(tag) ? "fit" : NOT.test(tag) ? "not_fit" : null
    if (!who || !label) { skipped.push(line.slice(0, 60)); continue }
    lines.push(KEY.test(who) ? { key: who, label } : { name: who, label })
  }
  return { lines, skipped }
}

export interface ImportResult { saved: number; unresolved: string[]; ambiguous: string[]; skipped: string[] }
/** Save the labels of a workspace for a fund. A name is looked up exactly in the given run (firms, then people); a key is taken as it is. Saving again for the same LP changes the label. */
export async function importLabels(scope: { orgId: string; userId: string }, sessionId: string, fundProfileId: string | null, text: string): Promise<ImportResult> {
  const { lines, skipped } = parseLabelText(text)
  const out: ImportResult = { saved: 0, unresolved: [], ambiguous: [], skipped }
  const keyed: Array<{ key: string; label: string; note?: string }> = []
  for (const l of lines) {
    if (l.key) { keyed.push({ key: l.key, label: l.label }); continue }
    const r = await resolveNames(scope.orgId, sessionId, [l.name!])
    if (r.ambiguous.length) out.ambiguous.push(l.name!)
    else if (!r.refs.length) out.unresolved.push(l.name!)
    else {
      const ref = r.refs[0]
      const table = ref.kind === "firm" ? "lp_firm_matches" : "lp_contact_matches", col = ref.kind === "firm" ? "firm_id" : "investor_id"
      const [row] = (await sql.unsafe(`SELECT ${col} AS eid FROM ${table} WHERE id::text = $1`, [ref.id])) as any[]
      if (row?.eid != null) keyed.push({ key: `${ref.kind}:${row.eid}`, label: l.label, note: l.name })
      else out.unresolved.push(l.name!)
    }
  }
  for (const k of keyed) {
    await sql`INSERT INTO lp_eval_labels (org_id, fund_profile_id, entity_key, label, source, note, created_by) VALUES (${scope.orgId}, ${fundProfileId}, ${k.key}, ${k.label}, 'founder_set', ${k.note ?? null}, ${scope.userId})
      ON CONFLICT (org_id, entity_key, source) DO UPDATE SET label = EXCLUDED.label, fund_profile_id = EXCLUDED.fund_profile_id, created_by = EXCLUDED.created_by, created_at = now()`
    out.saved++
  }
  return out
}

export async function clearLabels(orgId: string, fundProfileId: string | null): Promise<number> {
  const rows = (await sql`DELETE FROM lp_eval_labels WHERE org_id = ${orgId} AND source = 'founder_set' AND (${fundProfileId}::text IS NULL OR fund_profile_id = ${fundProfileId}) RETURNING id`) as any[]
  return rows.length
}

export interface EvaluationSet { firms: EvalRow[]; contacts: EvalRow[]; labelled: number; inRun: number; withoutFactors: number }
const jf = (v: any) => (v == null ? null : typeof v === "string" ? (() => { try { return JSON.parse(v) } catch { return null } })() : v)
const valuesOf = (sf: any): ShadowValues | null => {
  const o = jf(sf); if (!o) return null
  return Object.fromEntries(SHADOW_KEYS.map((k) => [k, o[k]?.value == null ? null : Number(o[k].value)])) as ShadowValues
}

/**
 * Every labelled LP that is in this run, with the score it had before any promoted factor and the value of each factor. Labels come from the founder's list first and from
 * the verdicts the workspace has given in the app ("fit", "not a fit") second. A run saved before the factors existed has no values and cannot be used.
 */
export async function loadEvaluationSet(orgId: string, sessionId: string, fundProfileId: string | null): Promise<EvaluationSet> {
  const labels = new Map<string, { label: 0 | 1; source: "founder_set" | "feedback" }>()
  const fb = (await sql`SELECT DISTINCT ON (entity_key) entity_key, verdict FROM lp_match_feedback WHERE org_id = ${orgId} AND verdict IN ('fit', 'not_a_fit') ORDER BY entity_key, created_at DESC`) as any[]
  for (const r of fb) labels.set(String(r.entity_key), { label: r.verdict === "fit" ? 1 : 0, source: "feedback" })
  const fs = (await sql`SELECT entity_key, label FROM lp_eval_labels WHERE org_id = ${orgId} AND (fund_profile_id IS NULL OR ${fundProfileId}::text IS NULL OR fund_profile_id = ${fundProfileId})`) as any[]
  for (const r of fs) labels.set(String(r.entity_key), { label: r.label === "fit" ? 1 : 0, source: "founder_set" })

  const out: EvaluationSet = { firms: [], contacts: [], labelled: labels.size, inRun: 0, withoutFactors: 0 }
  for (const kind of ["firm", "contact"] as const) {
    const table = kind === "firm" ? "lp_firm_matches" : "lp_contact_matches", col = kind === "firm" ? "firm_id" : "investor_id"
    const rows = (await sql.unsafe(`SELECT ${col} AS eid, score, base_score, shadow_factors FROM ${table} WHERE session_id::text = $1`, [sessionId])) as any[]
    for (const r of rows) {
      const key = `${kind}:${r.eid}`, l = labels.get(key)
      if (!l) continue
      out.inRun++
      const values = valuesOf(r.shadow_factors)
      if (!values) { out.withoutFactors++; continue }
      ;(kind === "firm" ? out.firms : out.contacts).push({ key, label: l.label, source: l.source, base: Number(r.base_score ?? r.score), values })
    }
  }
  return out
}
