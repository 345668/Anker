import { z } from "zod"
// Selected, implemented mappings from 345668/open-higgsfield @ b16a0ef.
export const MODELS = [
  {
    id: "soul-2",
    name: "Soul 2",
    kind: "image",
    path: "higgsfield-ai/soul/v2/standard",
    ratios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    resolutions: ["720p", "1080p"],
    min: 0,
    max: 0,
    audio: false,
  },
  {
    id: "soul-cinema",
    name: "Soul Cinema",
    kind: "image",
    path: "higgsfield-ai/soul/cinema",
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    resolutions: ["720p", "1080p"],
    min: 0,
    max: 0,
    audio: false,
  },
  {
    id: "flux-2",
    name: "Flux 2",
    kind: "image",
    path: "flux-2-pro",
    ratios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    resolutions: ["1k", "2k", "4k"],
    min: 0,
    max: 0,
    audio: false,
  },
  {
    id: "kling-3-turbo",
    name: "Kling 3.0 Turbo",
    kind: "video",
    path: "kling-video/v3.0-turbo",
    ratios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p", "1080p"],
    min: 3,
    max: 15,
    audio: false,
  },
  {
    id: "seedance-2-fast",
    name: "Seedance 2.0 Fast",
    kind: "video",
    path: "bytedance/seedance-2.0/fast",
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    resolutions: ["480p", "720p"],
    min: 4,
    max: 15,
    audio: true,
  },
] as const
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
    if (v.enhancePrompt && !m.id.startsWith("soul-")) fail("Prompt enhancement is only available for Soul.")
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
export function mapInput(v: GenerationInput, sourceUrl?: string) {
  const m = modelFor(v.model)!,
    body = { prompt: v.prompt, resolution: v.resolution }
  if (m.kind === "image")
    return {
      path: m.path,
      body: {
        ...body,
        aspect_ratio: v.aspectRatio,
        ...(m.id.startsWith("soul-") ? { batch_size: 1, enhance_prompt: v.enhancePrompt } : {}),
      },
    }
  return {
    path: `${m.path}/${sourceUrl ? "image-to-video" : "text-to-video"}`,
    body: {
      ...body,
      duration: v.duration,
      ...(sourceUrl ? { image_url: sourceUrl } : { aspect_ratio: v.aspectRatio }),
      ...(m.audio ? { generate_audio: v.audio } : {}),
    },
  }
}
