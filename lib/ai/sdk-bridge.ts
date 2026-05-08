/**
 * Vercel AI SDK bridge — typed structured-output helper.
 *
 * Why this exists: the existing `lib/ai/provider.ts` works (direct
 * fetch to Ollama's `/api/generate`, plus Anthropic SDK).  But for
 * NEW code paths that want typed JSON output (zod-validated), the AI
 * SDK's `generateObject` is dramatically nicer than the
 * "JSON-prompt + parse + try/catch" pattern we currently use.
 *
 * This module wraps `generateObject` against:
 *
 *   - Ollama via the OpenAI-compatible endpoint (`/v1/chat/completions`)
 *     using `@ai-sdk/openai-compatible`
 *   - Anthropic via the AI SDK's native provider (when wired up later)
 *
 * Existing callers don't change.  New callers can do:
 *
 *   import { z } from "zod"
 *   import { generateTyped } from "@/lib/ai/sdk-bridge"
 *
 *   const Schema = z.object({ name: z.string(), score: z.number() })
 *   const result = await generateTyped(Schema, "Extract … as JSON", { task: "deck_extract" })
 *   if (result.ok) console.log(result.value.name)
 *
 * Routing & model selection still go through `lib/ai/model-router.ts` —
 * task → tier → model — so the multi-model setup is preserved.
 */

import { generateObject, type GenerateObjectResult } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { z } from "zod"
import { modelForTask, type TaskTag } from "./model-router"

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "")

// Ollama exposes OpenAI-compatible endpoints under /v1/* — we point
// the AI SDK's openai-compatible provider at that.
const _ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: `${OLLAMA_URL}/v1`,
  // Ollama doesn't require an API key — pass a dummy.
  headers: { Authorization: "Bearer ollama" },
})

export interface TypedGenerateOpts<T extends z.ZodTypeAny> {
  /** Task tag — drives model selection. */
  task?: TaskTag
  /** Explicit model id to use (overrides the router). */
  model?: string
  temperature?: number
  maxTokens?: number
  /** Optional system prompt. */
  system?: string
}

export type TypedGenerateResult<T> =
  | { ok: true; value: T; usage?: { inputTokens?: number; outputTokens?: number } }
  | { ok: false; error: string; raw?: string }

/**
 * Generate a value matching `schema` from a prompt.  Returns `{ok:false}`
 * (never throws) so callers can fall back to the legacy
 * prompt-and-parse path in `provider.ts` if desired.
 */
export async function generateTyped<T extends z.ZodTypeAny>(
  schema: T,
  prompt: string,
  opts: TypedGenerateOpts<T> = {},
): Promise<TypedGenerateResult<z.infer<T>>> {
  const modelId = opts.model ?? (opts.task ? modelForTask(opts.task) : "gemma2:2b")
  try {
    const result: GenerateObjectResult<z.infer<T>> = await generateObject({
      model: _ollama(modelId),
      schema,
      prompt,
      system: opts.system,
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxTokens ?? 800,
    })
    return {
      ok: true,
      value: result.object,
      usage: {
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      },
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "generateObject failed", raw: e?.text }
  }
}

/** Convenience: typed extraction with a `confidence` floor — returns
 *  `null` if the model's confidence falls below the threshold. */
export async function generateTypedAtLeast<T extends z.ZodObject<any>>(
  schema: T,
  prompt: string,
  minConfidence = 0.5,
  opts: TypedGenerateOpts<T> = {},
): Promise<z.infer<T> | null> {
  const r = await generateTyped(schema, prompt, opts)
  if (!r.ok) return null
  const v = r.value as any
  if (typeof v?.confidence === "number" && v.confidence < minConfidence) return null
  return r.value
}
