import { z } from "zod"
import { sql } from "@/lib/db"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import type { AiPrincipal } from "@/lib/assistant/context"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { assertCanCreate } from "./consent"
import { GATE_OF, recipeById, type Gate } from "./recipe"
import { currentSetHash, ownedPipeline } from "./review"
import { replaceEnabled } from "./runner"
import { INCOMING_REFERENCE, INCOMING_SOURCE, MAX_REFERENCE_BYTES, MAX_SOURCE_BYTES } from "./stages"
import { pipelinePath } from "./storage"

/** Every pipeline route starts here: the platform flag, then who is asking. With the flag off the feature does not exist. */
export async function requireReplace(): Promise<AiPrincipal> {
  if (!(await replaceEnabled())) throw new WorkspaceError("Not available.", 404)
  const p = await requireAiPrincipal()
  assertCanCreate(p)
  return p
}

export const scopeCheck = (p: AiPrincipal, scopeKey: unknown) => {
  if (p.scopeKey !== scopeKey) throw new WorkspaceError("Workspace changed. Reload Anker AI.", 409)
}

export const createSchema = z
  .object({
    scopeKey: z.string().min(1).max(200),
    requestKey: z.string().uuid(),
    consentId: z.string().uuid(),
  })
  .strict()
export const reviewSchema = z
  .object({
    scopeKey: z.string().min(1).max(200),
    gate: z.enum(["input", "final"]),
    approved: z.boolean(),
    note: z.string().max(1000).optional(),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

/** The only names a client may upload into a pipeline, with the limits for each. Anything else is refused before a token is made. */
export function uploadRule(
  p: Pick<AiPrincipal, "userId" | "scopeKey">,
  pipelineId: string,
  pathname: string,
): { contentTypes: string[]; maxBytes: number } | null {
  const base = pipelinePath(p.userId, p.scopeKey, pipelineId, "")
  if (!pathname.startsWith(base)) return null
  const name = pathname.slice(base.length)
  if (name === INCOMING_SOURCE) return { contentTypes: ["video/mp4"], maxBytes: MAX_SOURCE_BYTES }
  if (INCOMING_REFERENCE.test(name))
    return { contentTypes: ["image/png", "image/jpeg", "image/webp"], maxBytes: MAX_REFERENCE_BYTES }
  return null
}

/** Files a person may open for review, by artifact kind. */
export const VIEWABLE = /^(source|prepared|draft|final|restored|delivered|reference_[1-4])$/

/** What the screens need: the stages, the files (never their storage paths), the consent summary and, at a gate, the hash to send back with the decision. */
export async function pipelineDetail(p: AiPrincipal, id: string) {
  const pipe = (await ownedPipeline(p, id)) as any
  const [row] =
    (await sql`SELECT status, error, consent_id FROM ai_studio_pipelines WHERE id = ${id}`) as any[]
  const stages =
    (await sql`SELECT ord, kind, status, error FROM ai_studio_stages WHERE pipeline_id = ${id} ORDER BY ord`) as any[]
  const files =
    (await sql`SELECT kind, content_type, bytes, sha256, stage_ord FROM ai_studio_artifacts WHERE pipeline_id = ${id} ORDER BY stage_ord, kind`) as any[]
  const [consent] =
    (await sql`SELECT id, statement_version, subjects, voice_altered, created_at FROM ai_studio_consents WHERE id = ${row.consent_id}`) as any[]
  const gates: Partial<Record<Gate, { hash: string; ready: boolean }>> = {}
  for (const s of stages) {
    const gate = GATE_OF[s.kind as keyof typeof GATE_OF]
    if (!gate) continue
    const ready = stages.filter((x) => x.ord < s.ord).every((x) => x.status === "done")
    gates[gate] = { hash: ready ? await currentSetHash(id, gate) : "", ready }
  }
  return {
    id,
    recipe: { id: pipe.recipe_id, name: recipeById(pipe.recipe_id)?.name ?? pipe.recipe_id },
    status: row.status as string,
    error: (row.error ?? null) as string | null,
    stages: stages.map((s) => ({
      ord: Number(s.ord),
      kind: s.kind as string,
      status: s.status as string,
      error: (s.error ?? null) as string | null,
    })),
    files: files.map((f) => ({
      kind: f.kind as string,
      contentType: f.content_type as string,
      bytes: Number(f.bytes),
      sha256: f.sha256 as string,
    })),
    consent: {
      id: consent.id as string,
      version: consent.statement_version as string,
      subjects: consent.subjects as string,
      voiceAltered: !!consent.voice_altered,
    },
    gates,
  }
}
