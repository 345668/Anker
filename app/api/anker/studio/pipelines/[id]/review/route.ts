import { errorResponse, json, readJson } from "@/lib/ai/studio/http"
import { pipelineDetail, requireReplace, reviewSchema, scopeCheck } from "@/lib/ai/studio/pipeline/api"
import { submitReview } from "@/lib/ai/studio/pipeline/review"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** A person's decision at a gate, with the hash of the files they were shown. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const p = await requireReplace()
    const b = reviewSchema.parse(await readJson(req))
    scopeCheck(p, b.scopeKey)
    const id = (await ctx.params).id
    const result = await submitReview(p, id, b.gate, {
      approved: b.approved,
      note: b.note,
      expectedHash: b.expectedHash,
    })
    return json({ ...result, pipeline: await pipelineDetail(p, id) })
  } catch (e) {
    return errorResponse(e)
  }
}
