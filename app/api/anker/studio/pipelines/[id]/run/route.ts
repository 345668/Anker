import { errorResponse, json } from "@/lib/ai/studio/http"
import { pipelineDetail, requireReplace } from "@/lib/ai/studio/pipeline/api"
import { runNextStage } from "@/lib/ai/studio/pipeline/runner"
import { stageRunners } from "@/lib/ai/studio/pipeline/stages"
import { blobStorage } from "@/lib/ai/studio/pipeline/storage"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { rateLimit, AI_HEAVY } from "@/lib/rate-limit"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300
/** Runs the next unfinished step once. The client calls this until the pipeline waits for a review. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const p = await requireReplace()
    if (!rateLimit(`studio-pipeline-run:${p.userId}`, AI_HEAVY).ok)
      throw new WorkspaceError("Too many requests. Wait a minute.", 429)
    const id = (await ctx.params).id
    const result = await runNextStage(p, id, stageRunners(blobStorage()))
    return json({ ...result, pipeline: await pipelineDetail(p, id) })
  } catch (e) {
    return errorResponse(e)
  }
}
