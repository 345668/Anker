import { randomBytes, randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import type { AiPrincipal } from "@/lib/assistant/context"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { assertAllowed, assertWithinLimit } from "@/lib/entitlements"
import { safeFetch } from "@/lib/net/safe-fetch"
import { isActive, modelFor, type GenerationInput, type Job, type JobStatus } from "./catalog"
import { generationStatus, ProviderError, requireConfiguration, submitGeneration } from "./provider"
import { MAX_BYTES, ownedAsset, publicAsset, storeAsset, hash, type AssetRow } from "./assets"
type Row = {
  id: string
  user_id: string
  scope_key: string
  org_id: string | null
  model: string
  kind: "image" | "video"
  prompt: string
  settings: GenerationInput
  status: JobStatus
  error: string | null
  favorite: boolean
  created_at: string
  provider_id: string | null
}
export function assertScope(p: AiPrincipal, scope: string, create = false) {
  if (p.scopeKey !== scope) throw new WorkspaceError("Workspace changed. Reload Anker AI.", 409)
  // LPs may create their own media without gaining write permission for fund records.
  if (create && (p.readonly || (p.persona !== "lp" && !p.canWrite)))
    throw new WorkspaceError("Your role does not allow media generation.")
}
export async function assertCreation(p: AiPrincipal) {
  assertScope(p, p.scopeKey, true)
  if (p.orgId) {
    await assertAllowed(p.orgId, "ai", "assistant")
    await assertWithinLimit(p.orgId, "ai_spend_usd_month")
  }
}
async function view(r: Row): Promise<Job> {
  const assets =
    await sql`SELECT * FROM ai_studio_assets WHERE job_id=${r.id} AND user_id=${r.user_id} AND scope_key=${r.scope_key}`
  return {
    id: r.id,
    model: r.model,
    kind: r.kind,
    prompt: r.prompt,
    settings: r.settings,
    status: r.status,
    error: r.error,
    favorite: r.favorite,
    createdAt: new Date(r.created_at).toISOString(),
    assets: assets.map((a) => publicAsset(a as AssetRow)),
  }
}
export async function ownedJob(p: AiPrincipal, id: string): Promise<Row> {
  const [r] =
    await sql`SELECT * FROM ai_studio_jobs WHERE id=${id} AND user_id=${p.userId} AND scope_key=${p.scopeKey}`
  if (!r) throw new WorkspaceError("Generation unavailable in this workspace.", 404)
  return r as Row
}
export async function listJobs(p: AiPrincipal, before?: string) {
  const rows = before
    ? await sql`SELECT * FROM ai_studio_jobs WHERE user_id=${p.userId} AND scope_key=${p.scopeKey} AND created_at<${before}::timestamptz ORDER BY created_at DESC LIMIT 30`
    : await sql`SELECT * FROM ai_studio_jobs WHERE user_id=${p.userId} AND scope_key=${p.scopeKey} ORDER BY created_at DESC LIMIT 30`
  return Promise.all(rows.map((r) => view(r as Row)))
}
function sourceOrigin() {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_APP_URL || "")
    if (u.protocol !== "https:" || u.username || u.password) throw new Error()
    return u.origin
  } catch {
    throw new WorkspaceError("Start frames need a public HTTPS app URL. Contact your administrator.", 503)
  }
}
export async function createJob(p: AiPrincipal, input: GenerationInput) {
  assertScope(p, input.scopeKey, true)
  const digest = hash(JSON.stringify({ ...input, requestKey: undefined }))
  const [old] =
    await sql`SELECT * FROM ai_studio_jobs WHERE user_id=${p.userId} AND scope_key=${p.scopeKey} AND request_key=${input.requestKey}`
  if (old) {
    if (old.request_hash !== digest)
      throw new WorkspaceError("Request key already used for different input.", 409)
    return view(old as Row)
  }
  await assertCreation(p)
  await requireConfiguration()
  const token = randomBytes(32).toString("hex")
  let sourceUrl: string | undefined
  if (input.sourceAssetId) {
    const a = await ownedAsset(p, input.sourceAssetId)
    if (a.kind !== "image") throw new WorkspaceError("Choose an image as the start frame.", 400)
    sourceUrl = `${sourceOrigin()}/api/anker/studio/source?token=${token}`
  }
  let audioUrl: string | undefined, audioToken: string | undefined
  if (input.audioAssetId) {
    const a = await ownedAsset(p, input.audioAssetId)
    if (a.kind !== "audio")
      throw new WorkspaceError("Choose an audio file or a spoken dialogue as the voice track.", 400)
    if ((a.duration_ms ?? 2000) < 2000 || (a.duration_ms ?? 0) > 30000)
      throw new WorkspaceError("The voice track must be between 2 and 30 seconds.", 400)
    audioToken = randomBytes(32).toString("hex")
    audioUrl = `${sourceOrigin()}/api/anker/studio/source?token=${audioToken}&kind=audio`
  }
  let reserved
  try {
    ;[reserved] =
      await sql`SELECT * FROM reserve_ai_studio_job(${randomUUID()},${p.userId},${p.scopeKey},${p.orgId},${input.requestKey},${digest},${input.model},${modelFor(input.model)!.kind},${input.prompt},${JSON.stringify(input)}::jsonb,${input.sourceAssetId ?? null},${sourceUrl ? hash(token) : null})`
  } catch (e) {
    const c = (e as { code?: string }).code
    if (c === "54000")
      throw new WorkspaceError(
        "Generation allowance reached: 3 active jobs, 20 requests per person daily and 30 per workspace.",
        429,
      )
    if (c === "22023") throw new WorkspaceError("Request key already used for different input.", 409)
    throw e
  }
  if (reserved.created) {
    try {
      if (audioToken)
        await sql`UPDATE ai_studio_jobs SET audio_asset_id=${input.audioAssetId!},audio_token_hash=${hash(audioToken)} WHERE id=${reserved.job_id}`
      const id = await submitGeneration(input, sourceUrl, audioUrl)
      await sql`UPDATE ai_studio_jobs SET provider_id=${id},status='queued',updated_at=now() WHERE id=${reserved.job_id} AND status IN ('submitting','uncertain')`
    } catch (e) {
      const certain = e instanceof ProviderError && e.status >= 400 && e.status < 500
      await sql`UPDATE ai_studio_jobs SET status=${certain ? "failed" : "uncertain"},error=${certain ? e.message : "Submission could not be confirmed and may have been charged. Contact support before generating again."},updated_at=now() WHERE id=${reserved.job_id} AND status='submitting'`
    }
  }
  return view(await ownedJob(p, reserved.job_id))
}
/** Browser and cron share a lease; this worker NEVER resubmits paid generation. */
export async function advanceJob(id: string) {
  const lease = randomUUID(),
    [row] =
      await sql`UPDATE ai_studio_jobs SET lease_token=${lease},lease_until=now()+interval '150 seconds' WHERE id=${id} AND status IN ('queued','running','saving') AND provider_id IS NOT NULL AND next_poll_at<=now() AND (lease_until IS NULL OR lease_until<now()) RETURNING *`
  if (!row) return
  const j = row as Row
  const finish = async (s: JobStatus, error: string | null = null) => {
    await sql`UPDATE ai_studio_jobs SET status=${s},error=${error},lease_until=NULL,lease_token=NULL,next_poll_at=now()+interval '8 seconds',updated_at=now() WHERE id=${id} AND lease_token=${lease}`
  }
  try {
    const [saved] = await sql`SELECT id FROM ai_studio_assets WHERE job_id=${id}`
    if (saved) {
      await finish("completed")
      return
    }
    if (Date.now() - new Date(j.created_at).getTime() > 7200000) {
      await finish(
        "failed",
        "Generation exceeded two hours. Contact support with the job ID before retrying.",
      )
      return
    }
    const r = await generationStatus(j.provider_id!)
    if (["failed", "nsfw", "canceled", "cancelled"].includes(r.status)) {
      await finish(
        r.status === "nsfw" ? "blocked" : r.status.startsWith("cancel") ? "canceled" : "failed",
        r.status === "nsfw"
          ? "The provider blocked this prompt or media. Revise it before trying again."
          : "The provider did not complete this generation.",
      )
      return
    }
    if (r.status !== "completed") {
      await finish(r.status === "queued" ? "queued" : "running")
      return
    }
    const url = j.kind === "image" ? r.image : r.video
    if (!url) {
      await finish("failed", "The provider returned no usable output. Contact support with the job ID.")
      return
    }
    await sql`UPDATE ai_studio_jobs SET status='saving' WHERE id=${id} AND lease_token=${lease}`
    const file = await safeFetch(url, {
      maxBytes: MAX_BYTES,
      timeoutMs: 45000,
    })
    await storeAsset({ userId: j.user_id, scopeKey: j.scope_key }, j.id, file.body, j.kind, j.id)
    await finish("completed")
  } catch (e) {
    await sql`UPDATE ai_studio_jobs SET error=${e instanceof ProviderError ? e.message : "Status or storage is temporarily unavailable. Anker will retry without generating again."},lease_until=NULL,lease_token=NULL,next_poll_at=now()+interval '30 seconds',updated_at=now() WHERE id=${id} AND lease_token=${lease}`
  }
}
export async function getJob(p: AiPrincipal, id: string, refresh = false) {
  const r = await ownedJob(p, id)
  if (refresh && isActive(r.status)) await advanceJob(id)
  await sql`UPDATE ai_studio_jobs SET status='uncertain',error='Submission was interrupted. Contact support before generating again.',updated_at=now() WHERE id=${id} AND user_id=${p.userId} AND scope_key=${p.scopeKey} AND status='submitting' AND created_at<now()-interval '2 minutes'`
  return view(await ownedJob(p, id))
}
export async function setFavorite(p: AiPrincipal, id: string, favorite: boolean) {
  await ownedJob(p, id)
  await sql`UPDATE ai_studio_jobs SET favorite=${favorite} WHERE id=${id} AND user_id=${p.userId} AND scope_key=${p.scopeKey}`
  return getJob(p, id)
}
