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
    const q = new URL(req.url).searchParams
    const audio = q.get("kind") === "audio"
    const asset = q.get("asset")
    if (asset !== null && !/^[0-9a-f-]{36}$/i.test(asset)) return json({ error: "Source unavailable." }, 404)
    const [a] = audio
      ? await sql`SELECT a.* FROM ai_studio_assets a JOIN ai_studio_jobs j ON j.audio_asset_id=a.id AND j.user_id=a.user_id AND j.scope_key=a.scope_key WHERE j.audio_token_hash=${hash(token)} AND j.created_at>now()-interval '2 hours' AND j.status IN ('submitting','queued','running','saving','uncertain') AND a.kind='audio' LIMIT 1`
      : // One token per job. Without `asset` it serves the job's single source image; with it, exactly one asset the job lists as a reference.
        await sql`SELECT a.* FROM ai_studio_assets a JOIN ai_studio_jobs j ON j.user_id=a.user_id AND j.scope_key=a.scope_key AND ((${asset}::text IS NULL AND j.source_asset_id=a.id) OR (${asset}::text IS NOT NULL AND a.id=${asset}::text AND jsonb_exists(coalesce(j.settings->'referenceAssetIds','[]'::jsonb), ${asset}::text))) WHERE j.source_token_hash=${hash(token)} AND j.created_at>now()-interval '2 hours' AND j.status IN ('submitting','queued','running','saving','uncertain') AND a.kind='image' LIMIT 1`
    if (!a) return json({ error: "Source unavailable." }, 404)
    return await assetResponse(a as AssetRow)
  } catch (e) {
    return errorResponse(e)
  }
}
