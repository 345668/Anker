/**
 * Recipes: reviewed, versioned ComfyUI workflows with named parameter slots (docs/architecture/49 section 4). Users never submit a graph. The server picks a recipe,
 * fills its slots with typed, bounded values, and sends the result. Nothing a user types becomes a node name, a file path or a link.
 */
import { LICENCES } from "./licences"
export type Slot = "prompt" | "negative" | "seed" | "width" | "height" | "source"
export interface GraphNode {
  class_type: string
  inputs: Record<string, unknown>
}
export interface Recipe {
  id: string
  version: number
  name: string
  kind: "image" | "video"
  /** `verified` recipes have run on real hardware with the weights named in `licences`; `draft` ones are templates and are never offered. */
  status: "verified" | "draft"
  /** Internal recipes (health checks) are never shown in the studio. */
  internal?: boolean
  /** Takes free text from a person: needs content screening before it may run on self-hosted GPUs. */
  freeText: boolean
  licences: string[]
  ratios: string[]
  sizes: Record<string, [number, number]>
  graph: Record<string, GraphNode>
  slots: Partial<Record<Slot, { node: string; input: string }>>
  output: { node: string; key: "images" | "gifs" | "videos" | "audio"; kind: "image" | "video" }
}
const SIZES_1K: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:3": [1152, 864],
  "3:4": [864, 1152],
}
export const RECIPES: Recipe[] = [
  {
    id: "smoke.card",
    version: 1,
    name: "Smoke test (solid card)",
    kind: "image",
    status: "verified",
    internal: true,
    freeText: false,
    licences: ["comfyui", "core-nodes"],
    ratios: ["16:9", "1:1"],
    sizes: { "16:9": [512, 288], "1:1": [512, 512] },
    graph: {
      "1": { class_type: "EmptyImage", inputs: { width: 512, height: 288, batch_size: 1, color: 2386000 } },
      "2": { class_type: "SaveImage", inputs: { images: ["1", 0], filename_prefix: "anker-smoke" } },
    },
    slots: {
      width: { node: "1", input: "width" },
      height: { node: "1", input: "height" },
      seed: { node: "1", input: "color" },
    },
    output: { node: "2", key: "images", kind: "image" },
  },
  {
    // DRAFT: the node names and weight file names follow ComfyUI's published Qwen-Image example. Not run yet; verify on a GPU before changing status.
    id: "image.qwen-image",
    version: 1,
    name: "Qwen-Image (self-hosted)",
    kind: "image",
    status: "draft",
    freeText: true,
    licences: ["comfyui", "qwen-image"],
    ratios: Object.keys(SIZES_1K),
    sizes: SIZES_1K,
    graph: {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_fp8_e4m3fn.safetensors", weight_dtype: "default" },
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: { clip_name: "qwen_2.5_vl_7b_fp8_scaled.safetensors", type: "qwen_image", device: "default" },
      },
      "3": { class_type: "VAELoader", inputs: { vae_name: "qwen_image_vae.safetensors" } },
      "4": { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3.1 } },
      "5": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] } },
      "6": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] } },
      "7": { class_type: "EmptySD3LatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["4", 0],
          positive: ["5", 0],
          negative: ["6", 0],
          latent_image: ["7", 0],
          seed: 0,
          steps: 30,
          cfg: 2.5,
          sampler_name: "euler",
          scheduler: "simple",
          denoise: 1,
        },
      },
      "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
      "10": { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: "anker-qwen-image" } },
    },
    slots: {
      prompt: { node: "5", input: "text" },
      negative: { node: "6", input: "text" },
      seed: { node: "8", input: "seed" },
      width: { node: "7", input: "width" },
      height: { node: "7", input: "height" },
    },
    output: { node: "10", key: "images", kind: "image" },
  },
]
export const recipeFor = (id: string) => RECIPES.find((r) => r.id === id)
/** Recipes a person may pick: verified, not internal. */
export const offeredRecipes = () => RECIPES.filter((r) => r.status === "verified" && !r.internal)
/** Every node class any recipe uses: the gateway's allow-list is generated from this, so it can never run a node no reviewed recipe needs. */
export const allowedNodeList = () =>
  [...new Set(RECIPES.flatMap((r) => Object.values(r.graph).map((n) => n.class_type)))].sort()
export const UNLICENSED = (r: Recipe) => r.licences.filter((k) => !LICENCES[k] || !LICENCES[k].commercial)

export interface FillInput {
  prompt?: string
  negative?: string
  seed?: number
  ratio: string
  sourceName?: string
}
export class RecipeError extends Error {}
const SOURCE_NAME = /^anker-[0-9a-f-]{36}\.(png|jpg|webp)$/
/** A copy of the recipe's graph with the slots filled. Throws if a value is out of bounds or a slot's target is missing. */
export function fill(r: Recipe, v: FillInput): Record<string, GraphNode> {
  const g: Record<string, GraphNode> = JSON.parse(JSON.stringify(r.graph))
  const set = (slot: Slot, value: string | number) => {
    const t = r.slots[slot]
    if (!t) throw new RecipeError(`This recipe has no ${slot} input.`)
    if (!g[t.node] || !(t.input in g[t.node].inputs))
      throw new RecipeError(`Recipe ${r.id} slot ${slot} points at nothing.`)
    g[t.node].inputs[t.input] = value
  }
  const size = r.sizes[v.ratio]
  if (!size) throw new RecipeError("Unsupported aspect ratio.")
  set("width", size[0])
  if (r.slots.height) set("height", size[1])
  if (v.prompt !== undefined) {
    if (typeof v.prompt !== "string" || v.prompt.length > 4000) throw new RecipeError("Prompt too long.")
    set("prompt", v.prompt)
  } else if (r.slots.prompt) throw new RecipeError("A prompt is required.")
  if (v.negative !== undefined) {
    if (typeof v.negative !== "string" || v.negative.length > 500)
      throw new RecipeError("Negative prompt too long.")
    set("negative", v.negative)
  }
  if (v.seed !== undefined) {
    if (!Number.isInteger(v.seed) || v.seed < 0 || v.seed > 2147483647)
      throw new RecipeError("Seed out of range.")
    set("seed", v.seed)
  }
  if (v.sourceName !== undefined) {
    if (!SOURCE_NAME.test(v.sourceName)) throw new RecipeError("Invalid source image name.")
    set("source", v.sourceName)
  }
  return g
}
