/**
 * GET   /api/admin/ai-config
 *   Returns:
 *     - the persisted runtime config (enabled / modelOverride / providerOverride)
 *     - the full TASKS list with their tier + currently-resolved model
 *     - the active provider + pulled Ollama models
 *
 * PATCH /api/admin/ai-config
 *   Partial update to the runtime config.  Body example:
 *     { enabled: { deck_extract: false }, modelOverride: { dm_personalize: "qwen2.5:3b" }, providerOverride: null }
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  providerInfo,
  listAvailableOllamaModels,
  resetProvider,
  invalidateModelsCache,
} from "@/lib/ai/provider"
import { TASKS, TASK_TIER, modelForTask, type TaskTag } from "@/lib/ai/model-router"
import {
  readRouterConfig, patchRouterConfig, invalidateConfig, clearTaskOverride, redactRouterConfig,
} from "@/lib/ai/runtime-config"

export const runtime = "nodejs"

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    // Always refresh — admins use this page to react to env / daemon changes.
    resetProvider()
    invalidateModelsCache()
    invalidateConfig()

    // Read config first (this populates the cache), then resolve provider
    const config = await readRouterConfig()
    const info = await providerInfo()
    const pulled = info.provider === "ollama" ? await listAvailableOllamaModels() : []

    // Per-task snapshot the UI renders directly.
    const tasks = TASKS.map((task) => {
      const tier = TASK_TIER[task] ?? "fast"
      const resolvedModel = modelForTask(task)
      const enabled = config.enabled[task] !== false
      const override = config.modelOverride[task] ?? null
      const modelPulled = info.provider !== "ollama" || pulled.includes(resolvedModel)
      return { task, tier, resolvedModel, enabled, override, modelPulled }
    })

    // Never leak raw API keys to the client — presence + last-4 only, through the
    // one redaction boundary so a newly added secret field cannot be missed
    // (emailVerificationApiKey used to ride along here in the clear; doc 35 #8).
    const { config: safeConfig, keys } = redactRouterConfig(config, { hints: true })
    return NextResponse.json({
      providerActive: info.provider,
      providerInfo: info,
      pulledModels: pulled,
      config: safeConfig,
      keys,
      tasks,
    })
  } catch (e: any) {
    console.error("[admin/ai-config GET]", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  try {
    const body = await req.json()
    // Allow per-task clear via { clearTask: "deck_extract" }
    if (typeof body?.clearTask === "string") {
      const next = await clearTaskOverride(body.clearTask as TaskTag, admin.email ?? admin.id)
      resetProvider()
      invalidateModelsCache()
      // The clear path used to return `next` verbatim — every provider key included.
      return NextResponse.json({ config: redactRouterConfig(next).config })
    }
    const next = await patchRouterConfig({
      enabled: typeof body?.enabled === "object" && body.enabled ? body.enabled : undefined,
      modelOverride: typeof body?.modelOverride === "object" && body.modelOverride ? body.modelOverride : undefined,
      providerOverride:
        body?.providerOverride === undefined
          ? undefined
          : body.providerOverride === null || ["anthropic", "ollama", "gemini", "openai", "mistral", "qwen", "none"].includes(body.providerOverride)
            ? body.providerOverride
            : undefined,
      providerStrict: body?.providerStrict !== undefined ? !!body.providerStrict : undefined,
      // Cloud API keys + model overrides (Settings → API Keys).
      geminiApiKey: body?.geminiApiKey !== undefined ? body.geminiApiKey : undefined,
      anthropicApiKey: body?.anthropicApiKey !== undefined ? body.anthropicApiKey : undefined,
      openaiApiKey: body?.openaiApiKey !== undefined ? body.openaiApiKey : undefined,
      mistralApiKey: body?.mistralApiKey !== undefined ? body.mistralApiKey : undefined,
      qwenApiKey: body?.qwenApiKey !== undefined ? body.qwenApiKey : undefined,
      qwenWorkspaceId: body?.qwenWorkspaceId !== undefined ? body.qwenWorkspaceId : undefined,
      qwenRegion: body?.qwenRegion !== undefined ? body.qwenRegion : undefined,
      geminiModel: body?.geminiModel !== undefined ? body.geminiModel : undefined,
      anthropicModel: body?.anthropicModel !== undefined ? body.anthropicModel : undefined,
      openaiModel: body?.openaiModel !== undefined ? body.openaiModel : undefined,
      mistralModel: body?.mistralModel !== undefined ? body.mistralModel : undefined,
      qwenModel: body?.qwenModel !== undefined ? body.qwenModel : undefined,
      // Local Ollama on/off (Data Ops).
      localEnabled: body?.localEnabled !== undefined ? !!body.localEnabled : undefined,
    }, admin.email ?? admin.id)
    // patchRouterConfig drops the cache and returns the decrypted runtime view, so
    // the provider is re-resolved against what was actually saved.
    resetProvider()
    invalidateModelsCache()
    const newInfo = await providerInfo()
    const { config: safeConfig, keys } = redactRouterConfig(next)
    return NextResponse.json({ providerActive: newInfo.provider, config: safeConfig, keys })
  } catch (e: any) {
    console.error("[admin/ai-config PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}
