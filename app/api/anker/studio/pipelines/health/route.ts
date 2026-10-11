import { errorResponse, json } from "@/lib/ai/studio/http"
import { requireReplace } from "@/lib/ai/studio/pipeline/api"
import { basename } from "node:path"
import { ffmpeg, ffmpegBinary } from "@/lib/ai/studio/pipeline/ffmpeg"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** Whether the bundled ffmpeg runs in this deployment (it is a binary that must ship with the function). */
export async function GET() {
  try {
    await requireReplace()
    // Decodes 0.1 s of generated silence: proves the binary is in the bundle, executable, and can run a filter graph.
    const r = await ffmpeg(
      ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.1", "-f", "null", "-"],
      15_000,
    )
    return json({ ok: r.code === 0, binary: basename(await ffmpegBinary()) })
  } catch (e) {
    return errorResponse(e)
  }
}
