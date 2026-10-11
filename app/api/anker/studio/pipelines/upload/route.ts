import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { z } from "zod"
import { errorResponse, json } from "@/lib/ai/studio/http"
import { requireReplace, uploadRule } from "@/lib/ai/studio/pipeline/api"
import { ownedPipeline } from "@/lib/ai/studio/pipeline/review"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { rateLimit, AI_HEAVY } from "@/lib/rate-limit"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const payload = z.object({ pipelineId: z.string().uuid() })
/**
 * Direct-to-Blob upload for the footage (a 100 MB video cannot pass through a function). A token is made only for the exact
 * names of this person's own pipeline, with the content types and size for that name.
 */
export async function POST(req: Request) {
  try {
    const p = await requireReplace()
    const origin = req.headers.get("origin")
    if (origin && origin !== new URL(req.url).origin)
      throw new WorkspaceError("Request origin is not allowed.", 403)
    if (!rateLimit(`studio-pipeline-upload:${p.userId}`, AI_HEAVY).ok)
      throw new WorkspaceError("Too many uploads. Wait a minute.", 429)
    const body = (await req.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request: req,
      token: process.env.MEDIA_BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { pipelineId } = payload.parse(JSON.parse(clientPayload ?? "{}"))
        await ownedPipeline(p, pipelineId)
        const rule = uploadRule(p, pipelineId, pathname)
        if (!rule) throw new WorkspaceError("That file name is not accepted for this pipeline.", 400)
        return {
          allowedContentTypes: rule.contentTypes,
          maximumSizeInBytes: rule.maxBytes,
          addRandomSuffix: false,
          allowOverwrite: true,
        }
      },
      onUploadCompleted: async () => {},
    })
    return json(result)
  } catch (e) {
    return errorResponse(e)
  }
}
