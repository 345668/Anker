import { sql } from "@/lib/db"
import { assetResponse, hash, type AssetRow } from "@/lib/ai/studio/assets"
import { errorResponse, json } from "@/lib/ai/studio/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// One image or one voice track, 256-bit capability, at most two hours. No reusable private blob URL is exposed.
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token") || ""
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Source unavailable." }, 404)
    const audio = new URL(req.url).searchParams.get("kind") === "audio"
    const [a] = audio
      ? await sql`SELECT a.* FROM ai_studio_assets a JOIN ai_studio_jobs j ON j.audio_asset_id=a.id AND j.user_id=a.user_id AND j.scope_key=a.scope_key WHERE j.audio_token_hash=${hash(token)} AND j.created_at>now()-interval '2 hours' AND j.status IN ('submitting','queued','running','saving','uncertain') AND a.kind='audio' LIMIT 1`
      : await sql`SELECT a.* FROM ai_studio_assets a JOIN ai_studio_jobs j ON j.source_asset_id=a.id AND j.user_id=a.user_id AND j.scope_key=a.scope_key WHERE j.source_token_hash=${hash(token)} AND j.created_at>now()-interval '2 hours' AND j.status IN ('submitting','queued','running','saving','uncertain') AND a.kind='image' LIMIT 1`
    if (!a) return json({ error: "Source unavailable." }, 404)
    return await assetResponse(a as AssetRow)
  } catch (e) {
    return errorResponse(e)
  }
}
