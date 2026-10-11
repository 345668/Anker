import { errorResponse, json, readJson } from "@/lib/ai/studio/http"
import { recordConsent } from "@/lib/ai/studio/pipeline/consent"
import { requireReplace, scopeCheck } from "@/lib/ai/studio/pipeline/api"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** Records the attestation for specific footage. The body is the consent schema plus the workspace key. */
export async function POST(req: Request) {
  try {
    const p = await requireReplace()
    const { scopeKey, ...consent } = (await readJson(req)) as Record<string, unknown>
    scopeCheck(p, scopeKey)
    return json(await recordConsent(p, consent), 201)
  } catch (e) {
    return errorResponse(e)
  }
}
