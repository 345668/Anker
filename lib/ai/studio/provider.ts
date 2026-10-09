import { WorkspaceError } from "@/lib/auth/workspace-context"
import { dashscopeKey } from "@/lib/ai/dashscope-media"
import { mapInput, type GenerationInput } from "./catalog"
/** Qwen Cloud (DashScope) as the generation provider. docs/architecture/47. */
const base = () => (process.env.DASHSCOPE_BASE_API || "https://dashscope-intl.aliyuncs.com/api/v1").replace(/\/+$/, "")
export async function configuration() {
  const key = (await dashscopeKey().catch(() => null))?.trim() || ""
  return { ready: !!(key && process.env.MEDIA_BLOB_READ_WRITE_TOKEN), key }
}
export async function requireConfiguration() {
  const c = await configuration()
  if (!c.ready)
    throw new WorkspaceError("Media Studio needs administrator setup. Chat and saved media remain available.", 503)
  return c
}
export class ProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
const BLOCKED = /DataInspectionFailed|IPInfringementSuspect|inappropriate|sensitive/i
async function call(path: string, init: { body?: object; async?: boolean; timeout: number }): Promise<Record<string, any>> {
  const c = await requireConfiguration()
  const r = await fetch(`${base()}/${path}`, {
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
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ProviderError(502, "Invalid provider response.")
  return data
}
/** Returns the job's provider reference: `task:<id>` for video, `img:<url>` for an image the synchronous call already produced. */
export async function submitGeneration(v: GenerationInput, sourceUrl?: string) {
  const m = mapInput(v, sourceUrl)
  if (m.kind === "image") {
    const j = await call("services/aigc/multimodal-generation/generation", {
      timeout: 55000,
      body: {
        model: m.model,
        input: { messages: [{ role: "user", content: [{ text: m.prompt }] }] },
        parameters: { n: 1, watermark: false, size: m.size, prompt_extend: m.promptExtend },
      },
    })
    const parts = j?.output?.choices?.[0]?.message?.content
    const url = Array.isArray(parts) ? parts.map((p: any) => p?.image).find((u: unknown) => typeof u === "string") : null
    if (!url) throw new ProviderError(502, "Submission returned no image and may have been charged.")
    return `img:${url}`
  }
  const j = await call("services/aigc/video-generation/video-synthesis", {
    async: true,
    timeout: 25000,
    body: {
      model: m.model,
      input: { prompt: m.prompt, ...(m.firstFrame ? { media: [{ type: "first_frame", url: m.firstFrame }] } : {}) },
      parameters: { resolution: m.resolution, ratio: m.ratio, duration: m.duration, prompt_extend: m.promptExtend, watermark: false },
    },
  })
  const id = j?.output?.task_id
  if (typeof id !== "string" || !id || id.length > 200) throw new ProviderError(502, "Submission returned no task ID and may have succeeded.")
  return `task:${id}`
}
export async function generationStatus(ref: string) {
  if (ref.startsWith("img:")) return { status: "completed", image: ref.slice(4), video: null as string | null }
  const id = ref.replace(/^task:/, "")
  const j = await call(`tasks/${encodeURIComponent(id)}`, { timeout: 25000 })
  const out = j.output ?? {}
  const s = String(out.task_status || "unknown").toUpperCase()
  const blocked = BLOCKED.test(`${out.code ?? ""} ${out.message ?? ""}`)
  return {
    status: s === "SUCCEEDED" ? "completed" : s === "PENDING" ? "queued" : s === "RUNNING" ? "running" : s === "FAILED" ? (blocked ? "nsfw" : "failed") : s === "CANCELED" ? "canceled" : "unknown",
    image: null as string | null,
    video: typeof out.video_url === "string" ? (out.video_url as string) : null,
  }
}
