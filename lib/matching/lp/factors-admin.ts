/**
 * The owner's view of the extra scoring factors (docs/architecture/63 M6): where each stands, the evaluation of them on the owner's own workspace, and the decision to promote,
 * return to shadow or retire one. The labels and verdicts are a workspace's private records, so the evaluation is always of the workspace the owner is signed in to, never a
 * pool across workspaces. A promotion is a platform setting that changes every workspace's scores, so it is only made with the evaluation in front of the owner and is recorded
 * with that evaluation as its evidence.
 */
import { sql } from "@/lib/db"
import { latestSession } from "./matches"
import { evaluateFactors, GUARDS_LP, type EvalReport } from "./evaluate"
import { loadEvaluationSet } from "./labels"
import { loadFactorSettings, invalidateFactorSettings } from "./shadow-load"
import { SHADOW_KEYS, type ShadowKey } from "./shadow"

export class FactorError extends Error { constructor(message: string, readonly status = 409) { super(message) } }

export interface FactorRow { key: string; label: string; description: string; status: string; weight: number; decidedBy: string | null; decidedAt: string | null; note: string | null; evidence: any }
export async function factorList(): Promise<FactorRow[]> {
  const rows = (await sql`SELECT key, label, description, status, weight, decided_by, decided_at, note, evidence FROM lp_scoring_factors ORDER BY array_position(ARRAY['recent_activity','emerging_manager_appetite','relationship_proximity','data_confidence'], key), key`) as any[]
  return rows.map((r) => ({ key: r.key, label: r.label, description: r.description, status: r.status, weight: Number(r.weight), decidedBy: r.decided_by ?? null, decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null, note: r.note ?? null, evidence: typeof r.evidence === "string" ? JSON.parse(r.evidence) : r.evidence ?? null }))
}

export interface Evaluation {
  session: { id: string; fundName: string; createdAt: string } | null
  labelled: number; inRun: number; withoutFactors: number
  firms: EvalReport | null; contacts: EvalReport | null
  error: string | null
}
/** The evaluation on the workspace's newest run of a fund. A run that predates the factors has no values to judge, and says so. */
export async function evaluateWorkspace(orgId: string, fundProfileId: string | null): Promise<Evaluation> {
  const s = await latestSession(orgId, fundProfileId)
  const empty: Evaluation = { session: null, labelled: 0, inRun: 0, withoutFactors: 0, firms: null, contacts: null, error: null }
  if (!s) return { ...empty, error: "This workspace has no finished matching run yet. Run the matching first." }
  const set = await loadEvaluationSet(orgId, String(s.id), fundProfileId ?? String(s.fund_profile_id))
  const base = { session: { id: String(s.id), fundName: s.fund_name ?? "", createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at) }, labelled: set.labelled, inRun: set.inRun, withoutFactors: set.withoutFactors }
  if (set.inRun > 0 && set.withoutFactors === set.inRun) return { ...empty, ...base, error: "The newest run was saved before the extra factors existed, so its matches carry no factor values. Run the matching again." }
  const settings = await loadFactorSettings(0)
  return { ...empty, ...base, firms: evaluateFactors(set.firms, settings), contacts: evaluateFactors(set.contacts, settings) }
}

export interface Decision { key: string; status: "shadow" | "promoted" | "retired"; weight?: number; note?: string; override?: boolean }
/**
 * Promote, return to shadow or retire a factor. Promoting needs the evaluation of firms to recommend it; without that it needs `override` and a written reason, and the
 * override is part of the evidence on record. The evaluation is computed here, never taken from the caller.
 */
export async function decideFactor(orgId: string, fundProfileId: string | null, d: Decision, by: string): Promise<{ status: string; weight: number; overridden: boolean }> {
  if (!(SHADOW_KEYS as readonly string[]).includes(d.key)) throw new FactorError("That is not one of the factors.", 400)
  if (!["shadow", "promoted", "retired"].includes(d.status)) throw new FactorError("Choose shadow, promoted or retired.", 400)
  const [cur] = (await sql`SELECT status, weight FROM lp_scoring_factors WHERE key = ${d.key}`) as any[]
  if (!cur) throw new FactorError("That factor is not in the table.", 404)
  const weight = d.weight == null ? Number(cur.weight) : Number(d.weight)
  if (!Number.isFinite(weight) || weight < 0 || weight > 15) throw new FactorError("The weight is between 0 and 15 points.", 400)
  const note = (d.note ?? "").trim().slice(0, 500)
  let evidence: Record<string, unknown> = { at: new Date().toISOString(), by, guards: GUARDS_LP }
  let overridden = false
  if (d.status === "promoted") {
    const ev = await evaluateWorkspace(orgId, fundProfileId)
    const f = ev.firms?.factors.find((x) => x.key === (d.key as ShadowKey))
    evidence = { ...evidence, session: ev.session, firms: ev.firms ? { n: ev.firms.n, fit: ev.firms.fit, notFit: ev.firms.notFit, baselineAuc: ev.firms.baselineAuc, factor: f ?? null, blocked: ev.firms.blocked } : null, error: ev.error }
    if (!f || f.verdict !== "promote") {
      if (!d.override) throw new FactorError(f ? `The evaluation does not recommend promoting it: ${f.reason}` : (ev.error ?? "There is no evaluation to promote it on."), 409)
      if (note.length < 10) throw new FactorError("Promoting against the evaluation needs a written reason of at least ten characters.", 400)
      overridden = true
    }
    evidence.overridden = overridden
  }
  await sql`UPDATE lp_scoring_factors SET status = ${d.status}, weight = ${weight}, decided_by = ${by}, decided_at = now(), note = ${note || null}, evidence = ${JSON.stringify(evidence)}::jsonb, updated_at = now() WHERE key = ${d.key}`
  invalidateFactorSettings()
  return { status: d.status, weight, overridden }
}
