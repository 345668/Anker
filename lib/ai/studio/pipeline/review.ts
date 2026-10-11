import { createHash, randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import type { AiPrincipal } from "@/lib/assistant/context"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { assertCanCreate } from "./consent"
import { recipeById, GATE_OF, type Gate, type StageKind } from "./recipe"

export interface ArtifactRef {
  kind: string
  sha256: string
}

/** One digest over a set of files. Order does not matter; a changed, added or removed file changes it. */
export function artifactSetHash(artifacts: ArtifactRef[], extra: string[] = []): string {
  const lines = [...artifacts.map((a) => `${a.kind}:${a.sha256}`), ...extra].sort()
  return createHash("sha256").update(lines.join("\n")).digest("hex")
}

type PipelineRow = {
  id: string
  user_id: string
  scope_key: string
  recipe_id: string
  consent_id: string
  status: string
}

export async function ownedPipeline(p: AiPrincipal, id: string): Promise<PipelineRow> {
  const [row] =
    (await sql`SELECT id, user_id, scope_key, recipe_id, consent_id, status FROM ai_studio_pipelines WHERE id = ${id} AND user_id = ${p.userId} AND scope_key = ${p.scopeKey}`) as PipelineRow[]
  if (!row) throw new WorkspaceError("Pipeline not found.", 404)
  return row
}

async function stageOrd(pipelineId: string, kind: StageKind): Promise<number> {
  const [r] =
    (await sql`SELECT ord FROM ai_studio_stages WHERE pipeline_id = ${pipelineId} AND kind = ${kind}`) as {
      ord: number
    }[]
  if (!r) throw new WorkspaceError("This pipeline has no such review step.", 400)
  return Number(r.ord)
}

const GATE_STAGE: Record<Gate, StageKind> = { input: "review_input", final: "approve_final" }

/**
 * What a reviewer is approving: every file produced before the gate, plus the consent record those files were made under.
 * The consent is part of the hash, so an approval cannot outlive a change to who was said to have agreed.
 */
export async function currentSetHash(pipelineId: string, gate: Gate): Promise<string> {
  const ord = await stageOrd(pipelineId, GATE_STAGE[gate])
  const files =
    (await sql`SELECT kind, sha256 FROM ai_studio_artifacts WHERE pipeline_id = ${pipelineId} AND stage_ord < ${ord}`) as ArtifactRef[]
  const [c] =
    (await sql`SELECT c.id, c.source_sha256, c.reference_sha256, c.subjects, c.voice_altered FROM ai_studio_pipelines p JOIN ai_studio_consents c ON c.id = p.consent_id WHERE p.id = ${pipelineId}`) as any[]
  const consent = c
    ? [
        `consent:${c.id}:${c.source_sha256}:${[...c.reference_sha256].sort().join(",")}:${c.subjects}:${c.voice_altered}`,
      ]
    : []
  return artifactSetHash(files, consent)
}

/** True only when the latest review of this gate approved exactly the files that exist now. */
export async function isApproved(pipelineId: string, gate: Gate): Promise<boolean> {
  const [r] =
    (await sql`SELECT approved, artifact_set_hash FROM ai_studio_reviews WHERE pipeline_id = ${pipelineId} AND gate = ${gate} ORDER BY reviewed_at DESC, id DESC LIMIT 1`) as any[]
  if (!r || !r.approved) return false
  return r.artifact_set_hash === (await currentSetHash(pipelineId, gate))
}

/**
 * A person's decision at a gate. `expectedHash` is what they were shown: if the files changed since, the decision is refused and they must look again.
 * Approval completes the gate stage; rejection ends the pipeline.
 */
export async function submitReview(
  p: AiPrincipal,
  pipelineId: string,
  gate: Gate,
  decision: { approved: boolean; note?: string; expectedHash: string },
): Promise<{ approved: boolean; hash: string }> {
  assertCanCreate(p)
  const pipe = await ownedPipeline(p, pipelineId)
  if (!recipeById(pipe.recipe_id)) throw new WorkspaceError("Unknown recipe.", 400)
  if (pipe.status === "failed" || pipe.status === "canceled" || pipe.status === "completed")
    throw new WorkspaceError("This pipeline has ended.", 409)
  const kind = GATE_STAGE[gate]
  const ord = await stageOrd(pipelineId, kind)
  const earlier =
    (await sql`SELECT count(*)::int AS n FROM ai_studio_stages WHERE pipeline_id = ${pipelineId} AND ord < ${ord} AND status <> 'done'`) as {
      n: number
    }[]
  if (Number(earlier[0].n) > 0) throw new WorkspaceError("The earlier steps are not finished yet.", 409)
  const hash = await currentSetHash(pipelineId, gate)
  if (hash !== decision.expectedHash)
    throw new WorkspaceError("The prepared files changed. Reload and review the latest version.", 409)
  const note = (decision.note ?? "").slice(0, 1000) || null
  await sql`INSERT INTO ai_studio_reviews (id, pipeline_id, gate, artifact_set_hash, approved, note, reviewer) VALUES (${randomUUID()}, ${pipelineId}, ${gate}, ${hash}, ${decision.approved}, ${note}, ${p.userId})`
  if (decision.approved) {
    await sql`UPDATE ai_studio_stages SET status = 'done', started_at = coalesce(started_at, now()), ended_at = now() WHERE pipeline_id = ${pipelineId} AND ord = ${ord} AND status <> 'done'`
    await sql`UPDATE ai_studio_pipelines SET status = 'running', updated_at = now() WHERE id = ${pipelineId}`
  } else {
    await sql`UPDATE ai_studio_stages SET status = 'failed', error = 'Not approved at review', ended_at = now() WHERE pipeline_id = ${pipelineId} AND ord = ${ord}`
    await sql`UPDATE ai_studio_pipelines SET status = 'canceled', error = ${"Not approved at the " + gate + " review"}, updated_at = now() WHERE id = ${pipelineId}`
  }
  return { approved: decision.approved, hash }
}

export const isGate = (kind: StageKind) => GATE_OF[kind] !== undefined
