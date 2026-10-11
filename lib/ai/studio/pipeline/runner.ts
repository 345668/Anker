import { randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import type { AiPrincipal } from "@/lib/assistant/context"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { assertCanCreate } from "./consent"
import { GATE_OF, PAID_STAGES, recipeById, type StageKind } from "./recipe"
import { isApproved, ownedPipeline } from "./review"

const FLAG = "ai_studio_replace"
let flagCache: { at: number; on: boolean } | null = null
/** The platform switch for subject replacement, read at most every 30 seconds. A failed read means off. */
export async function replaceEnabled(): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.at < 30000) return flagCache.on
  let on = false
  try {
    const [f] = await sql`SELECT enabled FROM platform_flags WHERE key = ${FLAG}`
    on = !!f?.enabled
  } catch {}
  flagCache = { at: Date.now(), on }
  return on
}
export const _resetReplaceFlagCache = () => {
  flagCache = null
}

export interface NewArtifact {
  kind: string
  pathname: string
  contentType: string
  bytes: number
  sha256: string
}
export interface StageContext {
  pipelineId: string
  scopeKey: string
  userId: string
  ord: number
  kind: StageKind
  artifacts: { kind: string; pathname: string; sha256: string; stage_ord: number }[]
}
export type StageRunner = (ctx: StageContext) => Promise<{ artifacts?: NewArtifact[]; jobId?: string }>
export type Runners = Partial<Record<StageKind, StageRunner>>

export interface PipelineView {
  id: string
  recipeId: string
  status: string
  error: string | null
  stages: { ord: number; kind: StageKind; status: string; error: string | null }[]
}

/**
 * Starts a pipeline under a stored consent. One consent covers one pipeline (a unique index), and the request key makes a repeated call return the same pipeline.
 */
export async function createPipeline(
  p: AiPrincipal,
  input: { requestKey: string; consentId: string; recipeId?: string },
): Promise<PipelineView> {
  assertCanCreate(p)
  const recipe = recipeById(input.recipeId ?? "replace-subject")
  if (!recipe) throw new WorkspaceError("Unknown recipe.", 400)
  const [consent] =
    (await sql`SELECT id FROM ai_studio_consents WHERE id = ${input.consentId} AND user_id = ${p.userId} AND scope_key = ${p.scopeKey}`) as any[]
  if (!consent) throw new WorkspaceError("Record the consent for this footage first.", 400)
  const id = randomUUID()
  let made: any
  try {
    ;[made] =
      (await sql`INSERT INTO ai_studio_pipelines (id, user_id, scope_key, org_id, recipe_id, recipe_version, request_key, consent_id)
      VALUES (${id}, ${p.userId}, ${p.scopeKey}, ${p.orgId}, ${recipe.id}, ${recipe.version}, ${input.requestKey}, ${input.consentId})
      ON CONFLICT (user_id, scope_key, request_key) DO NOTHING RETURNING id`) as any[]
  } catch (e) {
    if (/ai_studio_pipelines_consent/.test(String((e as Error).message)))
      throw new WorkspaceError(
        "This consent was already used for another pipeline. Record a new one for new footage.",
        409,
      )
    throw e
  }
  if (made) {
    for (const [ord, kind] of recipe.stages.entries())
      await sql`INSERT INTO ai_studio_stages (pipeline_id, ord, kind) VALUES (${id}, ${ord}, ${kind})`
  } else {
    const [old] =
      (await sql`SELECT id, consent_id FROM ai_studio_pipelines WHERE user_id = ${p.userId} AND scope_key = ${p.scopeKey} AND request_key = ${input.requestKey}`) as any[]
    if (old.consent_id !== input.consentId) throw new WorkspaceError("Request key already used.", 409)
    return getPipeline(p, old.id)
  }
  return getPipeline(p, id)
}

export async function getPipeline(p: AiPrincipal, id: string): Promise<PipelineView> {
  const pipe = (await ownedPipeline(p, id)) as any
  const [row] = (await sql`SELECT status, error FROM ai_studio_pipelines WHERE id = ${id}`) as any[]
  const stages =
    (await sql`SELECT ord, kind, status, error FROM ai_studio_stages WHERE pipeline_id = ${id} ORDER BY ord`) as any[]
  return {
    id,
    recipeId: pipe.recipe_id,
    status: row.status,
    error: row.error ?? null,
    stages: stages.map((s) => ({
      ord: Number(s.ord),
      kind: s.kind,
      status: s.status,
      error: s.error ?? null,
    })),
  }
}

/** The rules of a stage's kind, enforced before it can start. Throws with the reason. */
export async function assertMayRun(pipelineId: string, kind: StageKind) {
  const gate = PAID_STAGES[kind]
  if (gate && !(await isApproved(pipelineId, gate)))
    throw new WorkspaceError(
      gate === "input"
        ? "Review and approve the prepared files before generating."
        : "Approve the draft before the final render. Approval applies to the exact files you reviewed.",
      409,
    )
}

/**
 * Runs the first unfinished stage, once. Gate stages are decisions and are never run here. A stage that is already running, or has failed, is left alone:
 * a failed stage that spends money is never retried automatically (retryStage refuses it).
 */
export async function runNextStage(
  p: AiPrincipal,
  pipelineId: string,
  runners: Runners,
): Promise<{ ran: StageKind | null; status: string }> {
  assertCanCreate(p)
  await ownedPipeline(p, pipelineId)
  const stages =
    (await sql`SELECT ord, kind, status FROM ai_studio_stages WHERE pipeline_id = ${pipelineId} ORDER BY ord`) as any[]
  const next = stages.find((s) => s.status !== "done")
  if (!next) {
    await sql`UPDATE ai_studio_pipelines SET status = 'completed', updated_at = now() WHERE id = ${pipelineId} AND status <> 'completed'`
    return { ran: null, status: "completed" }
  }
  const kind = next.kind as StageKind
  if (next.status === "running" || next.status === "failed") return { ran: null, status: next.status }
  if (GATE_OF[kind]) {
    await sql`UPDATE ai_studio_pipelines SET status = 'awaiting_review', updated_at = now() WHERE id = ${pipelineId} AND status = 'running'`
    return { ran: null, status: "awaiting_review" }
  }
  const runner = runners[kind]
  if (!runner) throw new WorkspaceError(`This step (${kind}) is not available yet.`, 501)
  await assertMayRun(pipelineId, kind)
  // Claim the stage: only one caller can move it from pending to running.
  const claimed =
    (await sql`UPDATE ai_studio_stages SET status = 'running', started_at = now(), error = NULL WHERE pipeline_id = ${pipelineId} AND ord = ${next.ord} AND status = 'pending' RETURNING ord`) as any[]
  if (!claimed.length) return { ran: null, status: "running" }
  const files =
    (await sql`SELECT kind, pathname, sha256, stage_ord FROM ai_studio_artifacts WHERE pipeline_id = ${pipelineId}`) as any[]
  try {
    const out = await runner({
      pipelineId,
      scopeKey: p.scopeKey,
      userId: p.userId,
      ord: Number(next.ord),
      kind,
      artifacts: files.map((f) => ({ ...f, stage_ord: Number(f.stage_ord) })),
    })
    for (const a of out.artifacts ?? [])
      await sql`INSERT INTO ai_studio_artifacts (id, pipeline_id, stage_ord, kind, pathname, content_type, bytes, sha256)
        VALUES (${randomUUID()}, ${pipelineId}, ${next.ord}, ${a.kind}, ${a.pathname}, ${a.contentType}, ${a.bytes}, ${a.sha256})
        ON CONFLICT (pipeline_id, kind) DO UPDATE SET stage_ord = excluded.stage_ord, pathname = excluded.pathname, content_type = excluded.content_type, bytes = excluded.bytes, sha256 = excluded.sha256, created_at = now()`
    await sql`UPDATE ai_studio_stages SET status = 'done', job_id = ${out.jobId ?? null}, ended_at = now() WHERE pipeline_id = ${pipelineId} AND ord = ${next.ord}`
    return { ran: kind, status: "running" }
  } catch (e) {
    const message = (e as Error).message?.slice(0, 500) || "The step failed."
    await sql`UPDATE ai_studio_stages SET status = 'failed', error = ${message}, ended_at = now() WHERE pipeline_id = ${pipelineId} AND ord = ${next.ord}`
    await sql`UPDATE ai_studio_pipelines SET status = 'failed', error = ${message}, updated_at = now() WHERE id = ${pipelineId}`
    return { ran: kind, status: "failed" }
  }
}

/** Puts a failed step that does not spend money back to pending. A paid step is refused: a person decides whether to start a new pipeline. */
export async function retryStage(p: AiPrincipal, pipelineId: string, ord: number) {
  assertCanCreate(p)
  await ownedPipeline(p, pipelineId)
  const [s] =
    (await sql`SELECT kind, status FROM ai_studio_stages WHERE pipeline_id = ${pipelineId} AND ord = ${ord}`) as any[]
  if (!s || s.status !== "failed") throw new WorkspaceError("Only a failed step can be retried.", 409)
  if (PAID_STAGES[s.kind as StageKind])
    throw new WorkspaceError(
      "A step that spends money is never retried automatically. Check the provider, then start a new pipeline.",
      409,
    )
  await sql`UPDATE ai_studio_stages SET status = 'pending', error = NULL WHERE pipeline_id = ${pipelineId} AND ord = ${ord}`
  await sql`UPDATE ai_studio_pipelines SET status = 'running', error = NULL, updated_at = now() WHERE id = ${pipelineId}`
}
