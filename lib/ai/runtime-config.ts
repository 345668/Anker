/**
 * Runtime AI-router config.
 *
 * Admin-managed overlay on top of the static `lib/ai/model-router.ts`
 * + env knobs.  Persists in `system_settings` so the toggles survive
 * restarts.  Cached in-process for 5 s to keep call overhead minimal
 * — admins can hit `invalidate()` after a save to force a re-read.
 *
 * Shape (single row in system_settings, key='ai_router_v1'):
 *
 *   {
 *     enabled:           { [task]: boolean },
 *     modelOverride:     { [task]: "model:tag" },
 *     providerOverride:  "anthropic" | "ollama" | "none" | null
 *   }
 *
 * Resolution order, used by the router + provider:
 *
 *   1. runtime-config.modelOverride[task]
 *   2. env override (OLLAMA_MODEL_TASK_<TASK>)
 *   3. env tier override (OLLAMA_MODEL_<TIER>)
 *   4. tier default
 *   5. legacy OLLAMA_MODEL
 *
 *   For provider:
 *     1. runtime-config.providerOverride
 *     2. AI_PROVIDER env
 *     3. ANTHROPIC_API_KEY auto-detect
 *     4. Ollama probe
 *     5. "none"
 *
 *   Per-task `enabled=false`  ⇒  callers see provider="none" for that
 *   task and fall back to deterministic / heuristic output.
 */

import { sql } from "@/lib/db"
import type { TaskTag } from "./model-router"

export interface AiRouterConfig {
  enabled: Record<string, boolean>
  modelOverride: Record<string, string>
  providerOverride: "anthropic" | "ollama" | "none" | null
}

const EMPTY_CONFIG: AiRouterConfig = {
  enabled: {},
  modelOverride: {},
  providerOverride: null,
}

let _cache: { at: number; config: AiRouterConfig } | null = null
const CACHE_TTL_MS = 5_000

/** Best-effort read.  Never throws — returns empty config on any
 *  database / migration error so the platform keeps working. */
export async function readRouterConfig(): Promise<AiRouterConfig> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) {
    return _cache.config
  }
  try {
    const rows = await sql`SELECT value FROM system_settings WHERE key = 'ai_router_v1' LIMIT 1`
    const v = (rows as any[])[0]?.value
    const config: AiRouterConfig = {
      enabled: (v?.enabled && typeof v.enabled === "object") ? v.enabled : {},
      modelOverride: (v?.modelOverride && typeof v.modelOverride === "object") ? v.modelOverride : {},
      providerOverride: (v?.providerOverride && ["anthropic", "ollama", "none"].includes(v.providerOverride))
        ? v.providerOverride : null,
    }
    _cache = { at: Date.now(), config }
    return config
  } catch {
    _cache = { at: Date.now(), config: EMPTY_CONFIG }
    return EMPTY_CONFIG
  }
}

/** Synchronous read of the current cache; safe for use inside the
 *  router which can't await.  Returns null when no cache yet so the
 *  router falls back to env + defaults; the next call after a refresh
 *  will pick up the runtime config. */
export function readRouterConfigSync(): AiRouterConfig | null {
  return _cache ? _cache.config : null
}

/** Patch one or more fields on the persisted config.  Returns the new
 *  full config. */
export async function patchRouterConfig(
  patch: Partial<AiRouterConfig>,
  updatedBy?: string | null,
): Promise<AiRouterConfig> {
  const current = await readRouterConfig()
  const next: AiRouterConfig = {
    enabled: { ...current.enabled, ...(patch.enabled ?? {}) },
    modelOverride: { ...current.modelOverride, ...(patch.modelOverride ?? {}) },
    providerOverride: patch.providerOverride !== undefined
      ? patch.providerOverride
      : current.providerOverride,
  }
  // Strip empty strings → unset (so an admin can clear an override).
  for (const k of Object.keys(next.modelOverride)) {
    if (!next.modelOverride[k]) delete next.modelOverride[k]
  }
  await sql`
    INSERT INTO system_settings (key, value, updated_by, updated_at)
    VALUES ('ai_router_v1', ${JSON.stringify(next)}::jsonb, ${updatedBy ?? null}, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value      = EXCLUDED.value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `
  _cache = { at: Date.now(), config: next }
  return next
}

/** Clear a single override (model OR enable flag) for a task. */
export async function clearTaskOverride(task: TaskTag, updatedBy?: string | null): Promise<AiRouterConfig> {
  const current = await readRouterConfig()
  const next: AiRouterConfig = {
    enabled: { ...current.enabled },
    modelOverride: { ...current.modelOverride },
    providerOverride: current.providerOverride,
  }
  delete next.enabled[task]
  delete next.modelOverride[task]
  await sql`
    INSERT INTO system_settings (key, value, updated_by, updated_at)
    VALUES ('ai_router_v1', ${JSON.stringify(next)}::jsonb, ${updatedBy ?? null}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
  `
  _cache = { at: Date.now(), config: next }
  return next
}

/** Force a re-read on the next call. */
export function invalidateConfig(): void {
  _cache = null
}

/** Convenience: is this task currently enabled?  Defaults to true. */
export function isTaskEnabled(config: AiRouterConfig | null, task: TaskTag): boolean {
  if (!config) return true
  return config.enabled[task] !== false
}

/** Convenience: any per-task model override the admin set. */
export function modelOverrideFor(config: AiRouterConfig | null, task: TaskTag): string | null {
  if (!config) return null
  const v = config.modelOverride[task]
  return v && typeof v === "string" && v.trim() ? v : null
}
