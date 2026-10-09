import { z } from "zod"
// Qwen Cloud (DashScope) models; ids match lib/ai/model-catalog.ts. docs/architecture/47.
const IMAGE_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const
export const MODELS = [
  { id: "qwen-image-2.0", name: "Qwen-Image 2.0", kind: "image", path: "qwen-image-2.0", ratios: IMAGE_RATIOS, resolutions: ["standard"], min: 0, max: 0, audio: false, enhance: true },
  { id: "qwen-image-max", name: "Qwen-Image Max", kind: "image", path: "qwen-image-max", ratios: IMAGE_RATIOS, resolutions: ["standard"], min: 0, max: 0, audio: false, enhance: true },
  { id: "z-image-turbo", name: "Z-Image Turbo", kind: "image", path: "z-image-turbo", ratios: IMAGE_RATIOS, resolutions: ["standard"], min: 0, max: 0, audio: false, enhance: true },
  { id: "wan2.7", name: "Wan 2.7 Video", kind: "video", path: "wan2.7", ratios: IMAGE_RATIOS, resolutions: ["720p", "1080p"], min: 2, max: 15, audio: false, enhance: true },
] as const
/** DashScope image sizes (width*height) per aspect ratio. */
export const IMAGE_SIZES: Record<string, string> = { "1:1": "1328*1328", "16:9": "1664*928", "9:16": "928*1664", "4:3": "1472*1104", "3:4": "1104*1472" }
export const modelFor = (id: string) => MODELS.find((m) => m.id === id)
export const inputSchema = z
  .object({
    scopeKey: z.string().min(1).max(200),
    requestKey: z.string().uuid(),
    model: z.string(),
    prompt: z.string().trim().min(1, "Describe the image or video to generate.").max(4000),
    aspectRatio: z.string(),
    resolution: z.string(),
    duration: z.number().int().optional(),
    audio: z.boolean().default(false),
    enhancePrompt: z.boolean().default(false),
    sourceAssetId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    const m = modelFor(v.model),
      fail = (message: string) => c.addIssue({ code: "custom", message })
    if (!m) return fail("Choose an available model.")
    if (!(m.ratios as readonly string[]).includes(v.aspectRatio)) fail("Unsupported aspect ratio.")
    if (!(m.resolutions as readonly string[]).includes(v.resolution)) fail("Unsupported resolution.")
    if (m.kind === "video" && (v.duration === undefined || v.duration < m.min || v.duration > m.max))
      fail(`Choose ${m.min}–${m.max} seconds.`)
    if (m.kind === "image" && (v.duration !== undefined || v.sourceAssetId))
      fail("This image model does not accept duration or a start frame.")
    if (v.audio && !m.audio) fail("This model does not support generated audio.")
    if (v.enhancePrompt && !m.enhance) fail("Prompt enhancement is not available for this model.")
  })
export type GenerationInput = z.infer<typeof inputSchema>
export type MediaKind = "image" | "video"
export type JobStatus =
  | "submitting"
  | "queued"
  | "running"
  | "saving"
  | "completed"
  | "failed"
  | "blocked"
  | "canceled"
  | "uncertain"
export const isActive = (status: string) => ["submitting", "queued", "running", "saving"].includes(status)
export interface Asset {
  id: string
  kind: MediaKind
  name: string
  url: string
}
export interface Job {
  id: string
  model: string
  kind: MediaKind
  prompt: string
  settings: GenerationInput
  status: JobStatus
  error: string | null
  favorite: boolean
  createdAt: string
  assets: Asset[]
}
/** What to send to DashScope for a job. Images go to the synchronous multimodal endpoint, video to the asynchronous video-synthesis endpoint. */
export function mapInput(v: GenerationInput, sourceUrl?: string) {
  const m = modelFor(v.model)!
  if (m.kind === "image")
    return { kind: "image" as const, model: m.path, prompt: v.prompt, size: IMAGE_SIZES[v.aspectRatio], promptExtend: v.enhancePrompt }
  return {
    kind: "video" as const,
    model: sourceUrl ? "wan2.7-i2v" : "wan2.7-t2v",
    prompt: v.prompt,
    resolution: v.resolution.toUpperCase(),
    ratio: v.aspectRatio,
    duration: v.duration!,
    promptExtend: v.enhancePrompt,
    ...(sourceUrl ? { firstFrame: sourceUrl } : {}),
  }
}
