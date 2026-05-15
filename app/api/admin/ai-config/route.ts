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

    return NextResponse.json({
      providerActive: info.provider,
      providerInfo: info,
      pulledModels: pulled,
      config,
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
          : body.providerOverride === null || ["anthropic", "ollama", "none"].includes(body.providerOverride)
            ? body.providerOverride
            : undefined,
    }, admin.email ?? admin.id)
    resetProvider()
    invalidateModelsCache()
    return NextResponse.json({ config: next })
  } catch (e: any) {
    console.error("[admin/ai-config PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}
