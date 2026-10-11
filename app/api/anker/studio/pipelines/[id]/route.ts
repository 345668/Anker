import { errorResponse, json } from "@/lib/ai/studio/http"
import { pipelineDetail, requireReplace } from "@/lib/ai/studio/pipeline/api"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const p = await requireReplace()
    return json(await pipelineDetail(p, (await ctx.params).id))
  } catch (e) {
    return errorResponse(e)
  }
}
