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
  readRouterConfig, patchRouterConfig, invalidateConfig, clearTaskOverride,
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

    const [config, info] = await Promise.all([readRouterConfig(), providerInfo()])
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

    // Never leak raw API keys to the client — return presence + last-4 only.
    const { geminiApiKey, anthropicApiKey, ...safeConfig } = config
    const mask = (k: string | null) => (k ? `••••${k.slice(-4)}` : null)
    return NextResponse.json({
      providerActive: info.provider,
      providerInfo: info,
      pulledModels: pulled,
      config: safeConfig,
      keys: {
        gemini: { set: !!geminiApiKey, hint: mask(geminiApiKey) },
        anthropic: { set: !!anthropicApiKey, hint: mask(anthropicApiKey) },
      },
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
      return NextResponse.json({ config: next })
    }
    const next = await patchRouterConfig({
      enabled: typeof body?.enabled === "object" && body.enabled ? body.enabled : undefined,
      modelOverride: typeof body?.modelOverride === "object" && body.modelOverride ? body.modelOverride : undefined,
      providerOverride:
        body?.providerOverride === undefined
          ? undefined
          : body.providerOverride === null || ["anthropic", "ollama", "gemini", "none"].includes(body.providerOverride)
            ? body.providerOverride
            : undefined,
      // Cloud API keys + model overrides (Settings → API Keys).
      geminiApiKey: body?.geminiApiKey !== undefined ? body.geminiApiKey : undefined,
      anthropicApiKey: body?.anthropicApiKey !== undefined ? body.anthropicApiKey : undefined,
      geminiModel: body?.geminiModel !== undefined ? body.geminiModel : undefined,
      anthropicModel: body?.anthropicModel !== undefined ? body.anthropicModel : undefined,
      // Local Ollama on/off (Data Ops).
      localEnabled: body?.localEnabled !== undefined ? !!body.localEnabled : undefined,
    }, admin.email ?? admin.id)
    resetProvider()
    invalidateModelsCache()
    invalidateConfig()
    const { geminiApiKey, anthropicApiKey, ...safeConfig } = next
    return NextResponse.json({
      config: safeConfig,
      keys: { gemini: { set: !!geminiApiKey }, anthropic: { set: !!anthropicApiKey } },
    })
  } catch (e: any) {
    console.error("[admin/ai-config PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}
