import { errorResponse, json, readJson } from "@/lib/ai/studio/http"
import { createPipeline } from "@/lib/ai/studio/pipeline/runner"
import { createSchema, pipelineDetail, requireReplace, scopeCheck } from "@/lib/ai/studio/pipeline/api"
import { INCOMING_SOURCE, incomingReference } from "@/lib/ai/studio/pipeline/stages"
import { pipelinePath } from "@/lib/ai/studio/pipeline/storage"
import { sql } from "@/lib/db"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(req: Request) {
  try {
    const p = await requireReplace()
    scopeCheck(p, new URL(req.url).searchParams.get("scopeKey"))
    const rows =
      (await sql`SELECT id, recipe_id, status, error, created_at FROM ai_studio_pipelines WHERE user_id = ${p.userId} AND scope_key = ${p.scopeKey} ORDER BY created_at DESC LIMIT 30`) as any[]
    return json({
      pipelines: rows.map((r) => ({
        id: r.id,
        recipeId: r.recipe_id,
        status: r.status,
        error: r.error ?? null,
        createdAt: r.created_at,
      })),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
/** Starts a pipeline under a stored consent and says where the client uploads the source and the reference images. */
export async function POST(req: Request) {
  try {
    const p = await requireReplace()
    const b = createSchema.parse(await readJson(req))
    scopeCheck(p, b.scopeKey)
    const view = await createPipeline(p, { requestKey: b.requestKey, consentId: b.consentId })
    const [c] =
      (await sql`SELECT reference_sha256 FROM ai_studio_consents WHERE id = ${b.consentId}`) as any[]
    const at = (name: string) => pipelinePath(p.userId, p.scopeKey, view.id, name)
    return json(
      {
        pipeline: await pipelineDetail(p, view.id),
        uploads: {
          source: at(INCOMING_SOURCE),
          references: (c.reference_sha256 as string[]).map((_, i) => ({
            png: at(incomingReference(i + 1, "png")),
            jpg: at(incomingReference(i + 1, "jpg")),
            webp: at(incomingReference(i + 1, "webp")),
          })),
        },
      },
      201,
    )
  } catch (e) {
    return errorResponse(e)
  }
}
