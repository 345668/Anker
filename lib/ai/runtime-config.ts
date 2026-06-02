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

export type ProviderName = "anthropic" | "ollama" | "gemini" | "openai" | "mistral" | "alibaba" | "none"

/** Provider names accepted as a providerOverride / chain member. */
export const PROVIDER_NAMES: readonly ProviderName[] = ["anthropic", "ollama", "gemini", "openai", "mistral", "alibaba", "none"]

export interface AiRouterConfig {
  enabled: Record<string, boolean>
  modelOverride: Record<string, string>
  providerOverride: ProviderName | null
  /** Cloud API keys — managed from Settings → API Keys, persisted in DB. */
  geminiApiKey: string | null
  anthropicApiKey: string | null
  openaiApiKey: string | null
  mistralApiKey: string | null
  alibabaApiKey: string | null
  /** Optional per-provider model overrides. */
  geminiModel: string | null
  anthropicModel: string | null
  openaiModel: string | null
  mistralModel: string | null
  alibabaModel: string | null
  /** Local Ollama is OFF by default; enable it manually in Data Ops. */
  localEnabled: boolean
}

const EMPTY_CONFIG: AiRouterConfig = {
  enabled: {},
  modelOverride: {},
  providerOverride: null,
  geminiApiKey: null,
  anthropicApiKey: null,
  openaiApiKey: null,
  mistralApiKey: null,
  alibabaApiKey: null,
  geminiModel: null,
  anthropicModel: null,
  openaiModel: null,
  mistralModel: null,
  alibabaModel: null,
  localEnabled: false,
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
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
      providerOverride: (v?.providerOverride && PROVIDER_NAMES.includes(v.providerOverride))
        ? v.providerOverride : null,
      geminiApiKey: str(v?.geminiApiKey),
      anthropicApiKey: str(v?.anthropicApiKey),
      openaiApiKey: str(v?.openaiApiKey),
      mistralApiKey: str(v?.mistralApiKey),
      alibabaApiKey: str(v?.alibabaApiKey),
      geminiModel: str(v?.geminiModel),
      anthropicModel: str(v?.anthropicModel),
      openaiModel: str(v?.openaiModel),
      mistralModel: str(v?.mistralModel),
      alibabaModel: str(v?.alibabaModel),
      localEnabled: v?.localEnabled === true,
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
    geminiApiKey: patch.geminiApiKey !== undefined ? (str(patch.geminiApiKey)) : current.geminiApiKey,
    anthropicApiKey: patch.anthropicApiKey !== undefined ? (str(patch.anthropicApiKey)) : current.anthropicApiKey,
    openaiApiKey: patch.openaiApiKey !== undefined ? (str(patch.openaiApiKey)) : current.openaiApiKey,
    mistralApiKey: patch.mistralApiKey !== undefined ? (str(patch.mistralApiKey)) : current.mistralApiKey,
    alibabaApiKey: patch.alibabaApiKey !== undefined ? (str(patch.alibabaApiKey)) : current.alibabaApiKey,
    geminiModel: patch.geminiModel !== undefined ? (str(patch.geminiModel)) : current.geminiModel,
    anthropicModel: patch.anthropicModel !== undefined ? (str(patch.anthropicModel)) : current.anthropicModel,
    openaiModel: patch.openaiModel !== undefined ? (str(patch.openaiModel)) : current.openaiModel,
    mistralModel: patch.mistralModel !== undefined ? (str(patch.mistralModel)) : current.mistralModel,
    alibabaModel: patch.alibabaModel !== undefined ? (str(patch.alibabaModel)) : current.alibabaModel,
    localEnabled: patch.localEnabled !== undefined ? !!patch.localEnabled : current.localEnabled,
  }
  // Strip empty strings → unset (so an admin can clear an override).
  for (const k of Object.keys(next.modelOverride)) {
    if (!next.modelOverride[k]) delete next.modelOverride[k]
  }
  
  // Check if user exists in users table before using as updated_by
  // (system_settings.updated_by has FK constraint to users.id)
  let safeUpdatedBy: string | null = null
  if (updatedBy) {
    try {
      const userCheck = await sql`SELECT id FROM users WHERE id = ${updatedBy} OR email = ${updatedBy} LIMIT 1`
      if (userCheck.length > 0) {
        safeUpdatedBy = userCheck[0].id
      }
    } catch {
      // Ignore - will use NULL
    }
  }
  
  await sql`
    INSERT INTO system_settings (key, value, updated_by, updated_at)
    VALUES ('ai_router_v1', ${JSON.stringify(next)}::jsonb, ${safeUpdatedBy}, NOW())
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
  const next: AiRouterConfig = { ...current, enabled: { ...current.enabled }, modelOverride: { ...current.modelOverride } }
  delete next.enabled[task]
  delete next.modelOverride[task]
  
  // Check if user exists in users table before using as updated_by
  let safeUpdatedBy: string | null = null
  if (updatedBy) {
    try {
      const userCheck = await sql`SELECT id FROM users WHERE id = ${updatedBy} OR email = ${updatedBy} LIMIT 1`
      if (userCheck.length > 0) {
        safeUpdatedBy = userCheck[0].id
      }
    } catch {
      // Ignore - will use NULL
    }
  }
  
  await sql`
    INSERT INTO system_settings (key, value, updated_by, updated_at)
    VALUES ('ai_router_v1', ${JSON.stringify(next)}::jsonb, ${safeUpdatedBy}, NOW())
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
