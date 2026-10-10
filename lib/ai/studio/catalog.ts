import { z } from "zod"
import { offeredRecipes, type Recipe } from "./comfy/recipes"
// Qwen Cloud (DashScope) models; ids match lib/ai/model-catalog.ts. docs/architecture/47 and 48.
const R5 = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const
/** DashScope image sizes (width*height) per aspect ratio, by model family. */
const QWEN_SIZES = {
  "1:1": "1328*1328",
  "16:9": "1664*928",
  "9:16": "928*1664",
  "4:3": "1472*1104",
  "3:4": "1104*1472",
}
const WAN_SIZES = {
  "1:1": "1280*1280",
  "16:9": "1696*960",
  "9:16": "960*1696",
  "4:3": "1472*1104",
  "3:4": "1104*1472",
}
const Z_SIZES = {
  "1:1": "1024*1024",
  "16:9": "1280*720",
  "9:16": "720*1280",
  "4:3": "1152*864",
  "3:4": "864*1152",
}
type Img = {
  id: string
  name: string
  sizes?: Record<string, string>
  edit?: boolean
}
const image = (m: Img) => ({
  kind: "image" as const,
  path: m.id,
  ratios: R5,
  resolutions: ["standard"] as const,
  min: 0,
  max: 0,
  audio: false,
  enhance: true,
  negative: true,
  seed: false,
  voice: false,
  needsSource: !!m.edit,
  canSource: !!m.edit,
  ...m,
  sizes: m.sizes,
})
export const MODELS = [
  image({ id: "qwen-image-2.0", name: "Qwen-Image 2.0", sizes: QWEN_SIZES }),
  image({
    id: "qwen-image-2.0-pro",
    name: "Qwen-Image 2.0 Pro",
    sizes: QWEN_SIZES,
  }),
  image({ id: "qwen-image-max", name: "Qwen-Image Max", sizes: QWEN_SIZES }),
  image({ id: "qwen-image-plus", name: "Qwen-Image Plus", sizes: QWEN_SIZES }),
  image({ id: "z-image-turbo", name: "Z-Image Turbo", sizes: Z_SIZES }),
  image({ id: "wan2.6-t2i", name: "Wan 2.6 Text-to-Image", sizes: WAN_SIZES }),
  image({
    id: "wan2.7-image-pro",
    name: "Wan 2.7 Image Pro",
    sizes: WAN_SIZES,
  }),
  image({
    id: "qwen-image-edit-plus-2025-12-15",
    name: "Qwen-Image Edit Plus",
    edit: true,
  }),
  image({ id: "qwen-image-edit-max", name: "Qwen-Image Edit Max", edit: true }),
  {
    id: "wan2.7",
    name: "Wan 2.7 Video",
    kind: "video",
    path: "wan2.7",
    ratios: R5,
    resolutions: ["720p", "1080p"],
    min: 2,
    max: 15,
    audio: false,
    enhance: true,
    negative: true,
    seed: true,
    voice: true,
    needsSource: false,
    canSource: true,
    sizes: undefined,
  },
  {
    id: "happyhorse-1.1",
    name: "HappyHorse 1.1 Video",
    kind: "video",
    path: "happyhorse-1.1",
    ratios: ["16:9"],
    resolutions: ["720p", "1080p"],
    min: 3,
    max: 15,
    audio: false,
    enhance: true,
    negative: true,
    seed: false,
    voice: false,
    needsSource: false,
    canSource: true,
    sizes: undefined,
  },
] as const
export type ModelDef = (typeof MODELS)[number]
export const IMAGE_SIZES = QWEN_SIZES
export interface ModelLike {
  id: string
  name: string
  kind: "image" | "video"
  path: string
  ratios: readonly string[]
  resolutions: readonly string[]
  min: number
  max: number
  audio: boolean
  enhance: boolean
  negative: boolean
  seed: boolean
  voice: boolean
  needsSource: boolean
  canSource: boolean
  sizes: Record<string, string> | undefined
  /** Set for self-hosted recipes (docs/architecture/49); absent for hosted Qwen Cloud models. */
  recipe?: Recipe
}
/** A verified, customer-facing recipe as a studio model. */
export const recipeModel = (r: Recipe): ModelLike => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  path: r.id,
  ratios: r.ratios,
  resolutions: ["standard"],
  min: 0,
  max: 0,
  audio: false,
  enhance: false,
  negative: !!r.slots.negative,
  seed: !!r.slots.seed,
  voice: false,
  needsSource: false,
  canSource: !!r.slots.source,
  sizes: undefined,
  recipe: r,
})
export const recipeModels = (): ModelLike[] => offeredRecipes().map(recipeModel)
export const modelFor = (id: string): ModelLike | undefined =>
  MODELS.find((m) => m.id === id) ?? recipeModels().find((m) => m.id === id)
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
    negativePrompt: z.string().trim().max(500).optional(),
    seed: z.number().int().min(0).max(2147483647).optional(),
    /** A voice track (uploaded, or spoken from dialogue) that drives the video's speech and lip movement. */
    audioAssetId: z.string().uuid().optional(),
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
    if (m.kind === "image" && v.duration !== undefined) fail("This image model does not accept a duration.")
    if (v.sourceAssetId && !m.canSource) fail("This model does not accept a start frame or source image.")
    if (m.needsSource && !v.sourceAssetId) fail("Add the image to edit.")
    if (v.negativePrompt && !m.negative) fail("This model does not accept a negative prompt.")
    if (v.seed !== undefined && !m.seed) fail("This model does not accept a seed.")
    if (v.audioAssetId && !m.voice) fail("This model does not accept a voice track.")
    if (v.audio && !m.audio) fail("This model does not support generated audio.")
    if (v.enhancePrompt && !m.enhance) fail("Prompt enhancement is not available for this model.")
  })
export type GenerationInput = z.infer<typeof inputSchema>
export type MediaKind = "image" | "video"
export type AssetKind = MediaKind | "audio"
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
  kind: AssetKind
  durationMs?: number | null
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
export function mapInput(v: GenerationInput, sourceUrl?: string, audioUrl?: string) {
  const m = modelFor(v.model)!
  if (m.kind === "image")
    return {
      kind: "image" as const,
      model: m.path,
      prompt: v.prompt,
      size: m.sizes?.[v.aspectRatio],
      promptExtend: v.enhancePrompt,
      ...(v.negativePrompt ? { negativePrompt: v.negativePrompt } : {}),
      ...(sourceUrl ? { sourceImage: sourceUrl } : {}),
    }
  const wan = m.id === "wan2.7"
  return {
    kind: "video" as const,
    model: `${m.path}-${sourceUrl ? "i2v" : "t2v"}`,
    prompt: v.prompt,
    resolution: v.resolution.toUpperCase(),
    ...(wan ? { ratio: v.aspectRatio } : {}),
    duration: v.duration!,
    promptExtend: v.enhancePrompt,
    ...(v.negativePrompt ? { negativePrompt: v.negativePrompt } : {}),
    ...(v.seed !== undefined ? { seed: v.seed } : {}),
    ...(sourceUrl ? { firstFrame: sourceUrl } : {}),
    ...(audioUrl ? { audioUrl } : {}),
  }
}
