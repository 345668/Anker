/**
 * ANKER AI model catalog — the Qwen Cloud (Alibaba Model Studio / DashScope)
 * free-tier + partner models, plus the platform's own providers.
 *
 * Chat/vision/omni models run over the OpenAI-compatible endpoint
 * (`.../compatible-mode/v1/chat/completions`). Media models (video/image/tts/
 * asr) use DashScope's async task API and are surfaced as tools, not chat turns.
 *
 * `category` drives how the ANKER AI UI treats each model:
 *   chat | vision | omni  → selectable as the conversation model (streamed)
 *   image | video | tts | asr | embedding | rerank | translation → tool/action
 */

export type ModelCategory =
  | "chat" | "vision" | "omni"
  | "image" | "video" | "tts" | "asr"
  | "embedding" | "rerank" | "translation"

export interface CatalogModel {
  id: string
  name: string
  category: ModelCategory
  /** Runtime provider used to call it. */
  provider: "dashscope" | "anthropic" | "openai" | "gemini" | "mistral"
  freeTier?: boolean
  contextTokens?: number
  maxOutTokens?: number
  /** USD per 1M tokens (chat) — [inputLow, inputHigh?] / [outputLow, outputHigh?]. */
  priceIn?: string
  priceOut?: string
  /** Non-token pricing note (media/audio). */
  price?: string
  blurb: string
}

/** The models a conversation can run on (streamed chat). */
export const CHATTABLE: ModelCategory[] = ["chat", "vision", "omni"]

export const MODEL_CATALOG: CatalogModel[] = [
  // ─── Flagship chat (text) ────────────────────────────────────────────────
  { id: "qwen3.7-max", name: "Qwen3.7-Max", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 131_100, priceIn: "1.25", priceOut: "3.75", blurb: "Largest Qwen3.7; agent-centric — coding, productivity, long autonomous execution. Text-only." },
  { id: "qwen3.7-plus", name: "Qwen3.7-Plus", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 131_100, priceIn: "0.32-0.96", priceOut: "1.28-3.84", blurb: "Cost-effective Qwen3.7 with full VL + agent intelligence: reads screens, GUIs, generates code from visuals." },
  { id: "qwen3.7-flash", name: "Qwen3.7-Flash", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 131_100, priceIn: "0.03-0.2", priceOut: "0.13-0.8", blurb: "Fast Qwen3.7 VL; strong multimodal agents (Search/CI), spatial intelligence, vibe coding." },
  { id: "qwen3.6-max-preview", name: "Qwen3.6-Max", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 65_500, priceIn: "1.3-2", priceOut: "7.8-12", blurb: "Largest Qwen3.6 (preview, text): enhanced vibe coding, agent execution, front-end dev." },
  { id: "qwen3.6-plus", name: "Qwen3.6-Plus", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 65_500, priceIn: "0.5-2", priceOut: "3-6", blurb: "SOTA-class Qwen3.6 VL: agentic + front-end coding, OCR, object localization." },
  { id: "qwen3.6-flash", name: "Qwen3.6-Flash", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 65_500, priceIn: "0.25-1", priceOut: "1.5-4", blurb: "Fast Qwen3.6 VL; big gains in agentic coding, math/code reasoning, object detection." },
  { id: "qwen3.6-27b", name: "Qwen3.6 27B (open)", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 65_500, priceIn: "0.6", priceOut: "3.6", blurb: "Open dense VL; agentic coding + STEM reasoning, spatial intelligence, document OCR." },
  { id: "qwen3.5-plus", name: "Qwen3.5-Plus", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 65_500, priceIn: "0.4-0.5", priceOut: "2.4-3", blurb: "Hybrid linear-attention + sparse MoE VL; SOTA-comparable across text + multimodal." },
  { id: "qwen3.5-flash", name: "Qwen3.5-Flash", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 65_500, priceIn: "0.1", priceOut: "0.4", blurb: "Efficient hybrid VL; fast responses, strong text + multimodal." },
  { id: "qwen3.5-27b", name: "Qwen3.5 27B (open)", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 65_500, priceIn: "0.3", priceOut: "2.4", blurb: "Open dense VL with linear attention; ~122B-A10B capability at 27B." },
  { id: "qwen3-max", name: "Qwen3-Max", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 65_500, priceIn: "1.2-3", priceOut: "6-15", blurb: "Most powerful general-purpose Qwen3 LLM." },
  { id: "qwen-max", name: "Qwen-Max", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 32_800, maxOutTokens: 8_200, priceIn: "1.6", priceOut: "6.4", blurb: "Most capable billion-scale Qwen LLM." },
  { id: "qwen-plus", name: "Qwen-Plus", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 32_800, priceIn: "0.4-1.2", priceOut: "1.2-3.6", blurb: "Enhanced general LLM, 1M context." },
  { id: "qwen-flash", name: "Qwen-Flash", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 32_800, priceIn: "0.05-0.25", priceOut: "0.4-2", blurb: "Fused thinking/non-thinking with in-conversation switching; 1M context, tiered pricing." },
  { id: "qwen-turbo", name: "Qwen-Turbo", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 131_100, maxOutTokens: 8_200, priceIn: "0.05", priceOut: "0.2", blurb: "Fast, cost-effective LLM." },

  // ─── Reasoning / vision LLMs ─────────────────────────────────────────────
  { id: "qwq-plus", name: "QwQ-Plus", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 131_100, maxOutTokens: 8_200, priceIn: "0.8", priceOut: "2.4", blurb: "Enhanced reasoning model." },
  { id: "qvq-max", name: "QVQ-Max", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 131_100, maxOutTokens: 8_200, priceIn: "1.2", priceOut: "4.8", blurb: "Most capable visual reasoning model." },
  { id: "qwen3-vl-plus", name: "Qwen3-VL-Plus", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 32_800, priceIn: "0.2-0.6", priceOut: "1.6-4.8", blurb: "World-leading visual agent (OS World); visual coding, spatial perception, long video." },
  { id: "qwen3-vl-flash", name: "Qwen3-VL-Flash", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 32_800, priceIn: "0.05-0.12", priceOut: "0.4-0.96", blurb: "Small VL with 2D/3D grounding, ultra-long video/doc, fast." },
  { id: "qwen-vl-max", name: "Qwen-VL-Max", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 131_100, maxOutTokens: 32_800, priceIn: "0.8", priceOut: "3.2", blurb: "Most capable visual LLM." },
  { id: "qwen-vl-plus", name: "Qwen-VL-Plus", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 131_100, maxOutTokens: 8_200, priceIn: "0.21", priceOut: "0.63", blurb: "Enhanced visual LLM." },

  // ─── Partner chat models (via DashScope) ─────────────────────────────────
  { id: "glm-5.2", name: "GLM-5.2", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 131_100, priceIn: "1.4", priceOut: "4.4", blurb: "Zhipu AI flagship: long-horizon tasks, 1M context, strong reasoning + code." },
  { id: "glm-5.2-fast-preview", name: "GLM-5.2-Fast", category: "chat", provider: "dashscope", contextTokens: 1_000_000, maxOutTokens: 131_100, priceIn: "2.8", priceOut: "8.8", blurb: "High-speed GLM-5.2 (1.5–2× TPS) for real-time chat, agents, streaming code." },
  { id: "deepseek-v4-flash-0731", name: "DeepSeek-V4-Flash", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 393_200, priceIn: "0.2", priceOut: "0.4", blurb: "Lightweight 284B-MoE (13B active), 1M context; fast, cheap, high-concurrency." },
  { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 16_400, priceIn: "0.95", priceOut: "4", blurb: "Kimi's most intelligent coding model; long-context, thinking mode, agent tasks, image/video in." },

  // ─── Omni (text+image+audio+video) ───────────────────────────────────────
  { id: "qwen3.5-omni-plus", name: "Qwen3.5-Omni-Plus", category: "omni", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 65_500, priceIn: "1.4", priceOut: "8.3", blurb: "Text/image/audio/AV; 10h audio, 400s 720p video, 60+ langs in / 30+ out." },
  { id: "qwen3.5-omni-flash", name: "Qwen3.5-Omni-Flash", category: "omni", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 65_500, priceIn: "0.4", priceOut: "2.2", blurb: "Fast omni; text/image/audio/AV understanding + speech." },
  { id: "qwen3-omni-flash", name: "Qwen3-Omni-Flash", category: "omni", provider: "dashscope", freeTier: true, contextTokens: 65_500, maxOutTokens: 8_000, priceIn: "0.43", priceOut: "1.66", blurb: "Thinker–Talker MoE omni; 119 langs text / 20 speech." },
  { id: "qwen-omni-turbo", name: "Qwen-Omni-Turbo", category: "omni", provider: "dashscope", freeTier: true, contextTokens: 32_800, maxOutTokens: 2_000, priceIn: "0.07", priceOut: "0.27", blurb: "Multimodal understand + generate; audio+text+image+video in." },
  { id: "qwen2.5-omni-7b", name: "Qwen2.5-Omni 7B (open)", category: "omni", provider: "dashscope", freeTier: true, contextTokens: 32_800, maxOutTokens: 2_000, priceIn: "0.1", priceOut: "0.4", blurb: "Open multimodal model." },

  // ─── Coding ──────────────────────────────────────────────────────────────
  { id: "qwen3-coder-plus", name: "Qwen3-Coder-Plus", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 65_500, priceIn: "1-6", priceOut: "5-60", blurb: "Latest Qwen3 coding agent model." },
  { id: "qwen3-coder-flash", name: "Qwen3-Coder-Flash", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 1_000_000, maxOutTokens: 65_500, priceIn: "0.3-1.6", priceOut: "1.5-9.6", blurb: "Coding agent, multi-turn tools, repo-level understanding." },
  { id: "qwen3-coder-next", name: "Qwen3-Coder-Next (open)", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 65_500, priceIn: "0.3-0.8", priceOut: "1.5-4", blurb: "New-gen open coder; repo-level, multi-turn tool interaction." },
  { id: "qwen3-coder-480b-a35b-instruct", name: "Qwen3-Coder 480B-A35B", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 65_500, priceIn: "1.5-9", priceOut: "7.5-90", blurb: "Open-source SOTA coding agent." },
  { id: "qwen3-coder-30b-a3b-instruct", name: "Qwen3-Coder 30B-A3B", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 262_100, maxOutTokens: 65_500, priceIn: "0.45-2.4", priceOut: "2.25-14.4", blurb: "SOTA-at-scale open coder." },

  // ─── Role-play ───────────────────────────────────────────────────────────
  { id: "qwen-plus-character", name: "Qwen-Plus-Character", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 32_800, maxOutTokens: 4_100, priceIn: "0.5", priceOut: "1.4", blurb: "Anthropomorphic role-play; character consistency, empathy." },
  { id: "qwen-flash-character", name: "Qwen-Flash-Character", category: "chat", provider: "dashscope", freeTier: true, contextTokens: 8_200, maxOutTokens: 4_100, priceIn: "0.05", priceOut: "0.4", blurb: "Fast role-play; multilingual persona interaction." },

  // ─── Image generation / editing ──────────────────────────────────────────
  { id: "qwen-image-3.0-pro", name: "Qwen-Image-3.0-Pro", category: "image", provider: "dashscope", blurb: "Dense-layout image gen (newspapers, menus), 10px text, 12 langs / 20+ fonts.", price: "task" },
  { id: "qwen-image-2.0-pro", name: "Qwen-Image-2.0-Pro", category: "image", provider: "dashscope", freeTier: true, price: "$0.075/image", blurb: "Strongest text rendering + realistic textures in 2.0." },
  { id: "qwen-image-2.0", name: "Qwen-Image-2.0", category: "image", provider: "dashscope", freeTier: true, price: "$0.035/image", blurb: "Accelerated gen+edit; 1000-token prompts." },
  { id: "qwen-image-max", name: "Qwen-Image-Max", category: "image", provider: "dashscope", freeTier: true, price: "$0.075/image", blurb: "Most realistic textures, appealing text rendering." },
  { id: "qwen-image-plus", name: "Qwen-Image-Plus", category: "image", provider: "dashscope", freeTier: true, price: "$0.03/image", blurb: "Foundation gen+edit; excels at Chinese text." },
  { id: "qwen-image-edit-max", name: "Qwen-Image-Edit-Max", category: "image", provider: "dashscope", freeTier: true, price: "$0.075/image", blurb: "Stable, versatile editing; character consistency, LoRA." },
  { id: "qwen-image-edit-plus-2025-12-15", name: "Qwen-Image-Edit-Plus", category: "image", provider: "dashscope", freeTier: true, price: "$0.03/image", blurb: "Editing with character/industrial-design consistency, LoRA lighting." },
  { id: "z-image-turbo", name: "Z-Image-Turbo", category: "image", provider: "dashscope", freeTier: true, price: "$0.015/image", blurb: "#1 open T2I; 6B params, 8-step, photorealistic, EN/ZH text." },
  { id: "wan2.6-t2i", name: "Wan2.6 Text-to-Image", category: "image", provider: "dashscope", freeTier: true, price: "$0.03/image", blurb: "Upgraded aesthetics + instruction following; style control, portraits." },
  { id: "wan2.7-image-pro", name: "Wan2.7-Image-Pro", category: "image", provider: "dashscope", freeTier: true, price: "$0.075/image", blurb: "T2I, sequential images, edit, multi-image reference, interactive edit." },

  // ─── Video generation / editing ──────────────────────────────────────────
  { id: "happyhorse-1.1-i2v", name: "HappyHorse-1.1 Image→Video", category: "video", provider: "dashscope", freeTier: true, price: "$0.042-0.108/s", blurb: "Image-to-video; realism, ID consistency, motion smoothness, AV sync." },
  { id: "happyhorse-1.1-t2v", name: "HappyHorse-1.1 Text→Video", category: "video", provider: "dashscope", freeTier: true, price: "$0.042-0.108/s", blurb: "Text-to-video; cinematic shot control, dynamic motion." },
  { id: "happyhorse-1.1-r2v", name: "HappyHorse-1.1 Ref→Video", category: "video", provider: "dashscope", freeTier: true, price: "$0.042-0.108/s", blurb: "Reference-to-video, up to 9 refs; subject/scene consistency." },
  { id: "happyhorse-1.0-video-edit", name: "HappyHorse Video Edit", category: "video", provider: "dashscope", freeTier: true, price: "$0.112-0.192/s", blurb: "NL video editing, up to 5 refs; preserves motion dynamics." },
  { id: "wan2.7-t2v", name: "Wan2.7 Text→Video", category: "video", provider: "dashscope", freeTier: true, price: "$0.1-0.15/s", blurb: "Emotional depth, action impact, cinematic cuts." },
  { id: "wan2.7-i2v", name: "Wan2.7 Image→Video", category: "video", provider: "dashscope", freeTier: true, price: "$0.1-0.15/s", blurb: "Image-to-video, reimagined performance." },
  { id: "wan2.7-r2v-2026-06-12", name: "Wan2.7 Ref→Video", category: "video", provider: "dashscope", freeTier: true, price: "$0.1-0.15/s", blurb: "Reference-to-video, up to 5 mixed refs + audio timbre clone." },
  { id: "wan2.7-videoedit", name: "Wan2.7 Video Edit", category: "video", provider: "dashscope", freeTier: true, price: "$0.1-0.15/s", blurb: "Local + global video editing with prompt, image refs." },
  { id: "wan2.1-vace-plus", name: "Wan2.1-VACE-Plus", category: "video", provider: "dashscope", freeTier: true, price: "$0.1/s", blurb: "All-in-one video create/edit; repaint, outpaint, extend, image-ref." },

  // ─── Speech: TTS / ASR ───────────────────────────────────────────────────
  { id: "qwen3-tts-flash", name: "Qwen3-TTS-Flash", category: "tts", provider: "dashscope", freeTier: true, price: "$0.1/10k chars", blurb: "17 expressive voices, low-latency, multilingual + dialects." },
  { id: "qwen3-tts-flash-realtime", name: "Qwen3-TTS-Flash-Realtime", category: "tts", provider: "dashscope", freeTier: true, price: "$0.13/10k chars", blurb: "Real-time TTS, 17 voices, cross-lingual consistency." },
  { id: "qwen-audio-3.0-tts-flash", name: "Qwen-Audio-3.0-TTS-Flash", category: "tts", provider: "dashscope", freeTier: true, price: "$0.15/10k chars", blurb: "Real-time TTS <200ms; fine-grained emotion/tone/rate control." },
  { id: "cosyvoice-v3-plus", name: "CosyVoice-v3-Plus", category: "tts", provider: "dashscope", freeTier: true, price: "$0.26/10k chars", blurb: "Voice cloning from 5–20s ref; streaming synthesis." },
  { id: "qwen3-asr-flash", name: "Qwen3-ASR-Flash", category: "asr", provider: "dashscope", freeTier: true, price: "$0.000035/s", blurb: "Robust multilingual ASR; auto-detects 11 languages." },
  { id: "qwen3-asr-flash-realtime", name: "Qwen3-ASR-Flash-Realtime", category: "asr", provider: "dashscope", freeTier: true, price: "$0.00009/s", blurb: "Real-time multilingual ASR." },
  { id: "fun-asr-flash-2026-06-15", name: "Fun-ASR-Flash", category: "asr", provider: "dashscope", freeTier: true, price: "$0.000035/s", blurb: "30-language ASR; 7 Chinese dialect systems, poetry-tuned." },
  { id: "qwen3-livetranslate-flash", name: "Qwen3-LiveTranslate-Flash", category: "asr", provider: "dashscope", freeTier: true, blurb: "Real-time AV interpretation; understands 19 langs, speaks 10.", price: "task" },

  // ─── Embedding / rerank / translation ────────────────────────────────────
  { id: "text-embedding-v4", name: "Qwen Text-Embedding v4", category: "embedding", provider: "dashscope", freeTier: true, price: "$0.07/M tok", blurb: "Multilingual embeddings, 64–2048 dims, retrieval/cluster/classify." },
  { id: "tongyi-embedding-vision-plus", name: "Tongyi Multimodal Embedding", category: "embedding", provider: "dashscope", freeTier: true, price: "$0.09/M tok", blurb: "Vision-centric multimodal embeddings; text/image/video retrieval." },
  { id: "qwen3-rerank", name: "Qwen3-Rerank", category: "rerank", provider: "dashscope", freeTier: true, price: "$0.1/M tok", blurb: "Relevance ranking, 100+ langs, long text — for retrieval/RAG." },
  { id: "qwen-mt-plus", name: "Qwen-MT-Plus", category: "translation", provider: "dashscope", freeTier: true, contextTokens: 4_100, priceIn: "2.46", priceOut: "7.37", blurb: "Pro translation, 92 languages." },
  { id: "qwen-mt-turbo", name: "Qwen-MT-Turbo", category: "translation", provider: "dashscope", freeTier: true, contextTokens: 4_100, priceIn: "0.16", priceOut: "0.49", blurb: "Cost-effective translation." },
  { id: "qwen-vl-ocr", name: "Qwen-VL-OCR", category: "vision", provider: "dashscope", freeTier: true, contextTokens: 38_200, maxOutTokens: 8_200, priceIn: "0.07", priceOut: "0.16", blurb: "OCR: image-text recognition, parsing, structure." },
]

export function chatModels(): CatalogModel[] {
  return MODEL_CATALOG.filter((m) => CHATTABLE.includes(m.category))
}
export function getModel(id: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.id === id)
}
/** Default conversation model — a fast, capable, free-tier chat model. */
export const DEFAULT_CHAT_MODEL = "qwen-flash"
