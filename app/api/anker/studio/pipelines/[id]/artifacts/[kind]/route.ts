import { errorResponse } from "@/lib/ai/studio/http"
import { requireReplace, VIEWABLE } from "@/lib/ai/studio/pipeline/api"
import { ownedPipeline } from "@/lib/ai/studio/pipeline/review"
import { blobStorage } from "@/lib/ai/studio/pipeline/storage"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { sql } from "@/lib/db"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** Streams a file of the person's own pipeline for the review player. Nothing is cached, and only the final delivery may be downloaded. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; kind: string }> }) {
  try {
    const p = await requireReplace()
    const { id, kind } = await ctx.params
    if (!VIEWABLE.test(kind)) throw new WorkspaceError("No such file.", 404)
    await ownedPipeline(p, id)
    const [a] =
      (await sql`SELECT pathname, content_type, bytes FROM ai_studio_artifacts WHERE pipeline_id = ${id} AND kind = ${kind}`) as any[]
    if (!a) throw new WorkspaceError("No such file.", 404)
    const stream = await blobStorage().stream(a.pathname)
    if (!stream) throw new WorkspaceError("File unavailable. Please try again.", 404)
    const download = new URL(req.url).searchParams.get("download") === "1" && kind === "delivered"
    return new Response(stream, {
      headers: {
        "Content-Type": a.content_type,
        "Content-Length": String(a.bytes),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="anker-${kind}-${id.slice(0, 8)}.${a.content_type === "video/mp4" ? "mp4" : "bin"}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}
