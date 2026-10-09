import { requireAiPrincipal } from "@/lib/assistant/principal"
import { createSpeech, speechSchema, VOICES } from "@/lib/ai/studio/speech"
import { readJson, errorResponse, json } from "@/lib/ai/studio/http"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { rateLimit, AI_HEAVY } from "@/lib/rate-limit"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
export async function GET() {
  return json({ voices: VOICES })
}
/** Spoken dialogue to a voice track (docs/architecture/48): one private audio asset to drive a video. */
export async function POST(req: Request) {
  try {
    const p = await requireAiPrincipal()
    if (!rateLimit(`studio-speech:${p.userId}`, AI_HEAVY).ok)
      throw new WorkspaceError("Too many voice requests. Wait a minute.", 429)
    return json({ asset: await createSpeech(p, speechSchema.parse(await readJson(req))) }, 201)
  } catch (e) {
    return errorResponse(e)
  }
}
