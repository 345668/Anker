/**
 * DashScope media generation (Alibaba Model Studio, intl endpoint).
 *
 * Two patterns:
 *   • Image (Qwen-Image family): SYNCHRONOUS multimodal-generation — messages
 *     with {image}/{text} parts → output.choices[0].message.content[].image.
 *   • Video (HappyHorse / Wan): ASYNC video-synthesis — submit returns a
 *     task_id; poll /tasks/{id} until SUCCEEDED for the video_url.
 */
import { readRouterConfig } from "./runtime-config"

const BASE = (process.env.DASHSCOPE_BASE_API || "https://dashscope-intl.aliyuncs.com/api/v1").replace(/\/+$/, "")

export async function dashscopeKey(): Promise<string | null> {
  const cfg = await readRouterConfig().catch(() => null)
  return cfg?.qwenApiKey || process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || null
}

export interface ImageResult { images: string[] }

/** Synchronous text/image → image. `refImages` are URLs for edit/reference. */
export async function generateImage(
  key: string, model: string, prompt: string,
  opts: { refImages?: string[]; n?: number; size?: string; negativePrompt?: string } = {},
): Promise<ImageResult> {
  const content: any[] = [...(opts.refImages || []).map((url) => ({ image: url })), { text: prompt }]
  const parameters: any = { n: Math.min(opts.n ?? 1, 4), watermark: false }
  if (opts.size) parameters.size = opts.size
  if (opts.negativePrompt) parameters.negative_prompt = opts.negativePrompt

  const res = await fetch(`${BASE}/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: { messages: [{ role: "user", content }] }, parameters }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.message || `image ${res.status}`)
  const parts = j?.output?.choices?.[0]?.message?.content || []
  const images = parts.map((p: any) => p?.image).filter(Boolean)
  if (!images.length) throw new Error(j?.output?.choices?.[0]?.message?.content ? "no image returned" : (j?.message || "no image"))
  return { images }
}

/** Submit an async video task; returns the task_id. `firstFrame` = image URL for I2V. */
export async function submitVideo(
  key: string, model: string, prompt: string,
  opts: { firstFrame?: string; refImages?: string[]; resolution?: string; duration?: number } = {},
): Promise<string> {
  const input: any = { prompt }
  if (opts.firstFrame) input.media = [{ type: "first_frame", url: opts.firstFrame }]
  else if (opts.refImages?.length) input.media = opts.refImages.map((url) => ({ type: "reference", url }))

  const res = await fetch(`${BASE}/services/aigc/video-generation/video-synthesis`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-DashScope-Async": "enable" },
    body: JSON.stringify({ model, input, parameters: { resolution: opts.resolution ?? "720P", duration: opts.duration ?? 5 } }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j?.output?.task_id) throw new Error(j?.message || `video submit ${res.status}`)
  return j.output.task_id
}

export interface TaskStatus {
  status: string // PENDING | RUNNING | SUCCEEDED | FAILED | UNKNOWN
  videoUrl?: string
  images?: string[]
  message?: string
}

/** Poll an async task. */
export async function pollTask(key: string, taskId: string): Promise<TaskStatus> {
  const res = await fetch(`${BASE}/tasks/${taskId}`, { headers: { Authorization: `Bearer ${key}` } })
  const j = await res.json().catch(() => ({}))
  const out = j?.output || {}
  return {
    status: out.task_status || "UNKNOWN",
    videoUrl: out.video_url || out.results?.video_url,
    images: Array.isArray(out.results) ? out.results.map((r: any) => r?.url).filter(Boolean) : undefined,
    message: out.message || j?.message,
  }
}
