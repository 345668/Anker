/**
 * The learned ranker — docs/architecture/17.
 *
 * Reads what founders were shown and what they did about it, fits weights to
 * it, and stores the result in `matching_weight_history`. The arithmetic and
 * the guard live in ranker-fit.ts; this file is the database half.
 *
 * Nothing here changes a score until a fit passes every guard in doc 17 §3.
 * Until then `activeWeights()` returns the expert weights and says so.
 */
import { sql } from "@/lib/db"
import { ENGINE_VERSION } from "./founder-scoring"
import {
  COMPONENT_KEYS, EXPERT_WEIGHTS, fitAndEvaluate, labelFor,
  type FitOutcome, type LabelledExample, type Weights,
} from "./ranker-fit"

export { EXPERT_WEIGHTS, GUARDS, type Weights } from "./ranker-fit"

/** How far back a run still counts as evidence. */
const WINDOW_MONTHS = 18

function featuresFrom(components: any): number[] | null {
  if (!components || typeof components !== "object") return null
  const out: number[] = []
  for (const key of COMPONENT_KEYS) {
    const v = Number(components[key]?.value)
    if (!Number.isFinite(v)) return null
    out.push(Math.max(0, Math.min(1, v)))
  }
  return out
}

export interface LabelAssembly {
  examples: LabelledExample[]
  /** Everything the query considered, for the report: shown, contacted, excluded. */
  shown: number
  contacted: number
}

/**
 * One example per (workspace, investor): a firm a founder saw and acted on.
 *
 * Deduped across runs — re-running matching does not multiply the evidence —
 * and positives win over negatives for the same investor, because a reply is
 * a fact and silence on an earlier run is not.
 */
export async function assembleLabels(opts: { now?: Date } = {}): Promise<LabelAssembly> {
  const now = opts.now ?? new Date()
  const [{ shown = 0 } = {} as any] = await sql`
    SELECT count(*)::int AS shown
      FROM founder_match_results r JOIN founder_match_runs run ON run.id = r.run_id
     WHERE r.kind = 'group' AND run.created_at > now() - make_interval(months => ${WINDOW_MONTHS})`

  const rows = (await sql`
    SELECT run.org_id,
           run.id                                   AS run_id,
           run.created_at,
           r.entity_id,
           r.payload->'firm'->'components'          AS components,
           c.stage, c.last_contacted_at, c.added_at,
           EXISTS (
             SELECT 1 FROM match_outcome_events e
              WHERE e.user_id = run.user_id
                AND e.event_type IN ('replied', 'committed')
                AND (e.firm_id = r.entity_id
                     OR (e.investor_id IS NOT NULL AND e.investor_id = r.payload->'primary'->>'id'))
           )                                        AS acted
      FROM founder_match_results r
      JOIN founder_match_runs run ON run.id = r.run_id
      JOIN crm_entries c
        ON c.user_id = run.user_id
       AND (c.firm_id = r.entity_id
            OR (c.investor_id IS NOT NULL AND c.investor_id = r.payload->'primary'->>'id'))
     WHERE r.kind = 'group'
       AND run.created_at > now() - make_interval(months => ${WINDOW_MONTHS})
       AND r.payload->'firm'->'components' IS NOT NULL
     ORDER BY run.created_at DESC`) as any[]

  const best = new Map<string, LabelledExample>()
  for (const row of rows) {
    const label = labelFor({ stage: row.stage, contactedAt: row.last_contacted_at, addedAt: row.added_at, acted: !!row.acted, now })
    if (label === null) continue
    const features = featuresFrom(row.components)
    if (!features) continue
    const key = `${row.org_id}:${row.entity_id}`
    const existing = best.get(key)
    if (existing && (existing.label === 1 || label === 0)) continue
    best.set(key, { orgId: String(row.org_id), runId: String(row.run_id), entityId: String(row.entity_id), features, label })
  }
  return { examples: [...best.values()], shown: Number(shown), contacted: rows.length }
}

export interface FitReport extends FitOutcome {
  id: string | null
  engine: string
  shown: number
  contacted: number
  previousWeights: Weights
  /** Plain-language summary for the admin page and the cron log. */
  summary: string
}

/**
 * Assemble, fit, evaluate, record. Writes a row whether or not it activates:
 * a refused fit is a measurement worth keeping, and the reason it was refused
 * is the useful part.
 */
export async function fitRanker(opts: { now?: Date; triggerType?: string } = {}): Promise<FitReport> {
  const { examples, shown, contacted } = await assembleLabels({ now: opts.now })
  const outcome = fitAndEvaluate(examples)
  const previous = await activeWeights()

  let id: string | null = null
  try {
    if (outcome.activate) {
      await sql`UPDATE matching_weight_history SET is_active = false WHERE engine = ${ENGINE_VERSION} AND is_active = true`
    }
    const [row] = await sql`
      INSERT INTO matching_weight_history (user_id, scope, engine, weights, previous_weights, trigger_type, signal_counts, metrics, is_active)
      VALUES (NULL, 'platform', ${ENGINE_VERSION},
              ${JSON.stringify(outcome.weights ?? previous.weights)}::jsonb,
              ${JSON.stringify(previous.weights)}::jsonb,
              ${opts.triggerType ?? "scheduled"},
              ${JSON.stringify({ ...outcome.counts, shown, contacted })}::jsonb,
              ${JSON.stringify({ ...outcome.metrics, blockedBy: outcome.blockedBy, bias: outcome.bias })}::jsonb,
              ${outcome.activate})
      RETURNING id::text AS id`
    id = row?.id ?? null
  } catch (e: any) {
    // The fit is still worth reporting even if it could not be filed.
    console.warn("[ranker] could not record the fit:", e?.message ?? e)
  }

  const summary = outcome.activate
    ? `Fitted weights are live (${outcome.metrics.aucFitted} against ${outcome.metrics.aucExpert} on ${outcome.counts.test} held-out examples).`
    : `Expert weights kept — ${outcome.blockedBy}.`
  return { ...outcome, id, engine: ENGINE_VERSION, shown, contacted, previousWeights: previous.weights, summary }
}

export interface ActiveWeights {
  weights: Weights
  /** "expert" or "fitted:<id>" — recorded on every run so a result can be explained later. */
  source: string
  fittedAt: string | null
}

function usable(value: any): Weights | null {
  if (!value || typeof value !== "object") return null
  const out = {} as Weights
  let total = 0
  for (const key of COMPONENT_KEYS) {
    const n = Number(value[key])
    if (!Number.isFinite(n) || n < 0) return null
    out[key] = n
    total += n
  }
  // Stored weights that do not sum to 100 would move every score against the
  // tier thresholds, so they are not used at all.
  return Math.abs(total - 100) <= 1 ? out : null
}

/**
 * The weights matching should use right now.
 *
 * Never throws and never blocks a run: any problem reading or reading into the
 * stored row falls back to the expert weights, which are always defensible.
 */
export async function activeWeights(): Promise<ActiveWeights> {
  try {
    const [row] = await sql`
      SELECT id::text AS id, weights, created_at
        FROM matching_weight_history
       WHERE engine = ${ENGINE_VERSION} AND is_active = true
       ORDER BY created_at DESC LIMIT 1`
    const weights = usable(row?.weights)
    if (row && weights) {
      return { weights, source: `fitted:${row.id}`, fittedAt: new Date(row.created_at).toISOString() }
    }
    if (row) console.warn(`[ranker] active weights ${row.id} are not usable — keeping the expert weights`)
  } catch (e: any) {
    console.warn("[ranker] could not read the active weights:", e?.message ?? e)
  }
  return { weights: { ...EXPERT_WEIGHTS }, source: "expert", fittedAt: null }
}

/** Roll back to the expert weights. Returns how many rows were deactivated. */
export async function deactivateFitted(): Promise<number> {
  const rows = await sql`
    UPDATE matching_weight_history SET is_active = false
     WHERE engine = ${ENGINE_VERSION} AND is_active = true
     RETURNING id::text AS id`
  return (rows as any[]).length
}

export interface RankerState {
  engine: string
  active: ActiveWeights
  expertWeights: Weights
  labels: { examples: number; positive: number; negative: number; workspaces: number; shown: number; contacted: number }
  lastFit: { id: string; createdAt: string; isActive: boolean; weights: any; metrics: any; counts: any; trigger: string | null } | null
  guardsMet: boolean
  blockedBy: string | null
}

/** What the owner page shows: where the evidence stands and what is ranking today. */
export async function rankerState(): Promise<RankerState> {
  const active = await activeWeights()
  const { examples, shown, contacted } = await assembleLabels()
  const positive = examples.filter((e) => e.label === 1).length
  const outcome = fitAndEvaluate(examples)
  let lastFit: RankerState["lastFit"] = null
  try {
    const [row] = await sql`
      SELECT id::text AS id, created_at, is_active, weights, metrics, signal_counts, trigger_type
        FROM matching_weight_history WHERE engine = ${ENGINE_VERSION}
       ORDER BY created_at DESC LIMIT 1`
    if (row) lastFit = {
      id: row.id, createdAt: new Date(row.created_at).toISOString(), isActive: !!row.is_active,
      weights: row.weights, metrics: row.metrics, counts: row.signal_counts, trigger: row.trigger_type ?? null,
    }
  } catch (e: any) {
    console.warn("[ranker] could not read the fit history:", e?.message ?? e)
  }
  return {
    engine: ENGINE_VERSION, active, expertWeights: { ...EXPERT_WEIGHTS },
    labels: { examples: examples.length, positive, negative: examples.length - positive, workspaces: new Set(examples.map((e) => e.orgId)).size, shown, contacted },
    lastFit, guardsMet: outcome.activate, blockedBy: outcome.blockedBy,
  }
}
