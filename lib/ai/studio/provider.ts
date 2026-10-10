import { WorkspaceError } from "@/lib/auth/workspace-context"
import { readRouterConfig } from "@/lib/ai/runtime-config"
import { qwenLanes } from "@/lib/ai/qwen-lanes"
import { ProviderError } from "./errors"
import { mapInput, modelFor, type GenerationInput } from "./catalog"
import { comfyConfig, comfyEnabled, comfySubmit, comfyJob, comfyUpload, comfyView } from "./comfy/client"
import { fill, RecipeError, UNLICENSED, type Recipe } from "./comfy/recipes"
import { screenOutput, screenPrompt, screensReady } from "./comfy/moderation"
/**
 * Qwen Cloud (DashScope) as the generation provider. docs/architecture/47.
 * The key is the pay-as-you-go key on the standard endpoint: the free-tier key, else the standard Qwen key, else DASHSCOPE_API_KEY / QWEN_API_KEY (the same order
 * the text lanes use, doc 35). The token-plan key is never used: it is a coding plan on a different endpoint that serves text models only.
 */
async function endpoint(): Promise<{ key: string; base: string } | null> {
  const cfg = await readRouterConfig().catch(() => null)
  const lane = qwenLanes(cfg).find((l) => l.id !== "plan")
  if (!lane) return null
  // The text lanes use the OpenAI-compatible path; media uses the native API on the same host (or workspace host).
  return {
    key: lane.apiKey.trim(),
    base: (
      process.env.DASHSCOPE_BASE_API || lane.baseUrl.replace(/\/compatible-mode\/v1$/, "/api/v1")
    ).replace(/\/+$/, ""),
  }
}
export async function configuration() {
  const e = await endpoint()
  return {
    ready: !!(e?.key && process.env.MEDIA_BLOB_READ_WRITE_TOKEN),
    key: e?.key ?? "",
    base: e?.base ?? "",
  }
}
export async function requireConfiguration() {
  const c = await configuration()
  if (!c.ready)
    throw new WorkspaceError(
      "Media Studio needs administrator setup. Chat and saved media remain available.",
      503,
    )
  return c
}
export { ProviderError }
export const providerCall = (path: string, init: { body?: object; async?: boolean; timeout: number }) =>
  call(path, init)
const BLOCKED = /DataInspectionFailed|IPInfringementSuspect|inappropriate|sensitive/i
async function call(
  path: string,
  init: { body?: object; async?: boolean; timeout: number },
): Promise<Record<string, any>> {
  const c = await requireConfiguration()
  const r = await fetch(`${c.base}/${path}`, {
    method: init.body ? "POST" : "GET",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(init.timeout),
    headers: {
      Authorization: `Bearer ${c.key}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.async ? { "X-DashScope-Async": "enable" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
  const text = (await r.text()).slice(0, 200000)
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {}
  if (!r.ok) {
    // The provider's own code and message go to the server log only; callers see a fixed sentence.
    console.error("[studio provider]", path, r.status, data?.code, String(data?.message ?? "").slice(0, 300))
    const reason = `${data?.code ?? ""} ${data?.message ?? ""}`
    throw new ProviderError(
      BLOCKED.test(reason) ? 422 : r.status,
      BLOCKED.test(reason)
        ? "The provider blocked this prompt or media. Revise it before trying again."
        : r.status === 401 || r.status === 403
          ? "Generation credentials were rejected. Contact your administrator."
          : r.status === 429
            ? "Provider capacity or allowance is exhausted. Try later."
            : r.status >= 500
              ? "The generation provider is temporarily unavailable."
              : "The provider rejected these settings. Review the prompt and model.",
    )
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new ProviderError(502, "Invalid provider response.")
  return data
}
/** Returns the job's provider reference: `task:<id>` for video, `img:<url>` for an image the synchronous call already produced. */
export async function submitGeneration(
  v: GenerationInput,
  sourceUrl?: string,
  audioUrl?: string,
  ctx: { jobId?: string; sourceBytes?: Buffer } = {},
) {
  const recipe = modelFor(v.model)?.recipe
  if (recipe) return submitComfy(recipe, v, ctx)
  const m = mapInput(v, sourceUrl, audioUrl)
  if (m.kind === "image") {
    const content: Array<{ image: string } | { text: string }> = [
      ...(m.sourceImage ? [{ image: m.sourceImage }] : []),
      { text: m.prompt },
    ]
    const j = await call("services/aigc/multimodal-generation/generation", {
      timeout: 55000,
      body: {
        model: m.model,
        input: { messages: [{ role: "user", content }] },
        parameters: {
          n: 1,
          watermark: false,
          ...(m.size ? { size: m.size } : {}),
          prompt_extend: m.promptExtend,
          ...(m.negativePrompt ? { negative_prompt: m.negativePrompt } : {}),
        },
      },
    })
    const parts = j?.output?.choices?.[0]?.message?.content
    const url = Array.isArray(parts)
      ? parts.map((p: any) => p?.image).find((u: unknown) => typeof u === "string")
      : null
    if (!url) throw new ProviderError(502, "Submission returned no image and may have been charged.")
    return `img:${url}`
  }
  // Wan 2.7 text-to-video takes the voice track as input.audio_url; image-to-video takes it as a driving_audio media item.
  const media = [
    ...(m.firstFrame ? [{ type: "first_frame", url: m.firstFrame }] : []),
    ...(m.audioUrl && m.firstFrame ? [{ type: "driving_audio", url: m.audioUrl }] : []),
  ]
  const j = await call("services/aigc/video-generation/video-synthesis", {
    async: true,
    timeout: 25000,
    body: {
      model: m.model,
      input: {
        prompt: m.prompt,
        ...(m.negativePrompt ? { negative_prompt: m.negativePrompt } : {}),
        ...(m.audioUrl && !m.firstFrame ? { audio_url: m.audioUrl } : {}),
        ...(media.length ? { media } : {}),
      },
      parameters: {
        resolution: m.resolution,
        ...(m.ratio ? { ratio: m.ratio } : {}),
        duration: m.duration,
        prompt_extend: m.promptExtend,
        watermark: false,
        ...(m.seed !== undefined ? { seed: m.seed } : {}),
      },
    },
  })
  const id = j?.output?.task_id
  if (typeof id !== "string" || !id || id.length > 200)
    throw new ProviderError(502, "Submission returned no task ID and may have succeeded.")
  return `task:${id}`
}
/** Why a self-hosted recipe cannot run right now, or null: the platform switch, the gateway settings, the licences, and content screening for free text. */
export async function comfyBlocker(r: Recipe): Promise<string | null> {
  if (!(await comfyEnabled()) || !comfyConfig()) return "Self-hosted generation is not available yet."
  if (UNLICENSED(r).length) return "This recipe uses a model that may not be used commercially."
  if (r.freeText && !screensReady())
    return "Self-hosted generation is waiting for content screening to be set up."
  return null
}
async function submitComfy(r: Recipe, v: GenerationInput, ctx: { jobId?: string; sourceBytes?: Buffer }) {
  const why = await comfyBlocker(r)
  if (why) throw new ProviderError(503, why)
  const cfg = comfyConfig()!
  if (!ctx.jobId) throw new ProviderError(400, "A job id is required.")
  if (r.freeText) {
    const sc = await screenPrompt(`${v.prompt}\n${v.negativePrompt ?? ""}`)
    if (!sc.ok)
      throw new ProviderError(
        422,
        "The provider blocked this prompt or media. Revise it before trying again.",
      )
  }
  let sourceName: string | undefined
  if (v.sourceAssetId && r.slots.source) {
    if (!ctx.sourceBytes) throw new ProviderError(400, "The source image is missing.")
    const png = ctx.sourceBytes[0] === 137
    sourceName = `anker-${ctx.jobId}.${png ? "png" : "jpg"}`
    await comfyUpload(cfg, ctx.sourceBytes, sourceName, png ? "image/png" : "image/jpeg")
  }
  let graph
  try {
    graph = fill(r, {
      prompt: v.prompt,
      negative: v.negativePrompt,
      seed: v.seed,
      ratio: v.aspectRatio,
      sourceName,
    })
  } catch (e) {
    if (e instanceof RecipeError) throw new ProviderError(400, e.message)
    throw e
  }
  await comfySubmit(cfg, graph, ctx.jobId)
  return `comfy:${ctx.jobId}`
}
export async function generationStatus(
  ref: string,
  model?: string,
): Promise<{
  status: string
  image: string | null
  video: string | null
  file?: { bytes: Buffer; kind: "image" | "video" }
}> {
  if (ref.startsWith("comfy:")) return comfyStatus(ref.slice(6), model)
  if (ref.startsWith("img:"))
    return {
      status: "completed",
      image: ref.slice(4),
      video: null as string | null,
    }
  const id = ref.replace(/^task:/, "")
  const j = await call(`tasks/${encodeURIComponent(id)}`, { timeout: 25000 })
  const out = j.output ?? {}
  const s = String(out.task_status || "unknown").toUpperCase()
  const blocked = BLOCKED.test(`${out.code ?? ""} ${out.message ?? ""}`)
  return {
    status:
      s === "SUCCEEDED"
        ? "completed"
        : s === "PENDING"
          ? "queued"
          : s === "RUNNING"
            ? "running"
            : s === "FAILED"
              ? blocked
                ? "nsfw"
                : "failed"
              : s === "CANCELED"
                ? "canceled"
                : "unknown",
    image: null as string | null,
    video: typeof out.video_url === "string" ? (out.video_url as string) : null,
  }
}

async function comfyStatus(id: string, model?: string) {
  const r = model ? modelFor(model)?.recipe : undefined
  const cfg = comfyConfig()
  if (!r || !cfg) throw new ProviderError(503, "Self-hosted generation is not available.")
  const j = await comfyJob(cfg, id, r.output.node, r.output.key)
  const none = { image: null as string | null, video: null as string | null }
  if (j.state === "missing") return { status: "failed", ...none }
  if (j.state !== "completed") return { status: j.state, ...none }
  if (!j.files.length) return { status: "failed", ...none }
  const bytes = await comfyView(cfg, j.files[0])
  if (r.freeText && !(await screenOutput(bytes, r.output.kind)).ok) return { status: "nsfw", ...none }
  return { status: "completed", ...none, file: { bytes, kind: r.output.kind } }
}
