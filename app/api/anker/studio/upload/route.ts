import { randomUUID } from "node:crypto"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { assertCreation, assertScope } from "@/lib/ai/studio/service"
import { mediaFormat, publicAsset, storeAsset } from "@/lib/ai/studio/assets"
import { bodyBytes, errorResponse, json } from "@/lib/ai/studio/http"
import { requireConfiguration } from "@/lib/ai/studio/provider"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { rateLimit, AI_HEAVY } from "@/lib/rate-limit"
import { sql } from "@/lib/db"
export const runtime = "nodejs"
export const maxDuration = 60
export async function POST(req: Request) {
  try {
    const p = await requireAiPrincipal()
    if (!rateLimit(`studio-upload:${p.userId}`, AI_HEAVY).ok)
      throw new WorkspaceError("Too many uploads. Wait a minute.", 429)
    const bytes = await bodyBytes(req, 15 * 1024 * 1024 + 16384)
    let f: FormData
    try {
      f = await new Response(Buffer.from(bytes), {
        headers: { "Content-Type": req.headers.get("content-type") || "" },
      }).formData()
    } catch {
      throw new WorkspaceError("Send an image upload.", 400)
    }
    assertScope(p, String(f.get("scopeKey") || ""), true)
    await assertCreation(p)
    await requireConfiguration()
    const [n] =
      await sql`SELECT count(*)::int AS n FROM ai_studio_assets WHERE user_id=${p.userId} AND job_id IS NULL AND created_at>now()-interval '1 day'`
    if (n.n >= 30)
      throw new WorkspaceError("Today's upload allowance is used up. Reuse an image or try tomorrow.", 429)
    const file = f.get("file"),
      wantAudio = f.get("kind") === "audio"
    const limit = wantAudio ? 15 * 1024 * 1024 : 3 * 1024 * 1024
    if (!(file instanceof File) || file.size > limit || !file.size)
      throw new WorkspaceError(
        wantAudio ? "Choose a WAV or MP3 under 15 MB." : "Choose a PNG, JPG or WebP under 3 MB.",
        400,
      )
    const data = Buffer.from(await file.arrayBuffer())
    if (wantAudio) {
      if (mediaFormat(data)?.kind !== "audio")
        throw new WorkspaceError("Choose a WAV or MP3 audio file.", 400)
      let ms: number | null = null
      try {
        const { parseWav, durationMs } = await import("@/lib/ai/studio/wav")
        ms = mediaFormat(data)?.ext === "wav" ? durationMs(parseWav(data)) : null
      } catch {
        /* an MP3 or an unusual WAV: length is checked by the provider */
      }
      if (ms !== null && (ms < 2000 || ms > 30000))
        throw new WorkspaceError("The voice track must be between 2 and 30 seconds.", 400)
      return json(
        {
          asset: publicAsset(await storeAsset(p, randomUUID(), data, "audio", null, ms)),
        },
        201,
      )
    }
    if (mediaFormat(data)?.kind !== "image") throw new WorkspaceError("Choose a PNG, JPG or WebP image.", 400)
    return json(
      {
        asset: publicAsset(await storeAsset(p, randomUUID(), data, "image", null)),
      },
      201,
    )
  } catch (e) {
    return errorResponse(e)
  }
}
