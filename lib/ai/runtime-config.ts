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

export type ProviderName = "anthropic" | "ollama" | "gemini" | "openai" | "mistral" | "qwen" | "none"

/** Provider names accepted as a providerOverride / chain member. */
export const PROVIDER_NAMES: readonly ProviderName[] = ["anthropic", "ollama", "gemini", "openai", "mistral", "qwen", "none"]

export interface AiRouterConfig {
  enabled: Record<string, boolean>
  modelOverride: Record<string, string>
  providerOverride: ProviderName | null
  /** Cloud API keys — managed from Settings → API Keys, persisted in DB. */
  geminiApiKey: string | null
  anthropicApiKey: string | null
  openaiApiKey: string | null
  mistralApiKey: string | null
  /** When true, a providerOverride pins that provider with NO failover.
   *  Default false: the chosen provider leads the chain but the other
   *  configured providers still act as backups if it errors. */
  providerStrict: boolean
  /** Alibaba Cloud Qwen (DashScope) — OpenAI-compatible endpoint. */
  qwenApiKey: string | null
  /** Per-tenant workspace id used to construct the Qwen base URL:
   *  https://<workspace>.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1 */
  qwenWorkspaceId: string | null
  /** Optional per-provider model overrides. */
  geminiModel: string | null
  anthropicModel: string | null
  openaiModel: string | null
  mistralModel: string | null
  qwenModel: string | null
  /** Local Ollama is OFF by default; enable it manually in Data Ops. */
  localEnabled: boolean
}

const EMPTY_CONFIG: AiRouterConfig = {
  enabled: {},
  modelOverride: {},
  providerOverride: null,
  providerStrict: false,
  geminiApiKey: null,
  anthropicApiKey: null,
  openaiApiKey: null,
  mistralApiKey: null,
  qwenApiKey: null,
  qwenWorkspaceId: null,
  geminiModel: null,
  anthropicModel: null,
  openaiModel: null,
  mistralModel: null,
  qwenModel: null,
  localEnabled: false,
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

let _cache: { at: number; config: AiRouterConfig } | null = null
const CACHE_TTL_MS = 5_000
/** Negative cache after a DB error. Deliberately much shorter than the happy
 *  path: an empty config silently falls back to env keys, which is how the
 *  wrong provider gets pinned. Fail open, but re-check almost immediately. */
const ERROR_CACHE_TTL_MS = 1_000
let _cacheIsError = false

/** Best-effort read.  Never throws — returns empty config on any
 *  database / migration error so the platform keeps working. */
export async function readRouterConfig(): Promise<AiRouterConfig> {
  if (_cache && Date.now() - _cache.at < (_cacheIsError ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS)) {
    return _cache.config
  }
  try {
    const rows = await sql`SELECT value FROM system_settings WHERE key = 'ai_router_v1' LIMIT 1`
    const raw = (rows as any[])[0]?.value
    // Parse JSON if it's a string (text column), or use directly if already an object (jsonb)
    const v = typeof raw === "string" ? JSON.parse(raw) : raw
    const config: AiRouterConfig = {
      enabled: (v?.enabled && typeof v.enabled === "object") ? v.enabled : {},
      modelOverride: (v?.modelOverride && typeof v.modelOverride === "object") ? v.modelOverride : {},
      providerOverride: (v?.providerOverride && PROVIDER_NAMES.includes(v.providerOverride))
        ? v.providerOverride : null,
      providerStrict: v?.providerStrict === true,
      geminiApiKey: str(v?.geminiApiKey),
      anthropicApiKey: str(v?.anthropicApiKey),
      openaiApiKey: str(v?.openaiApiKey),
      mistralApiKey: str(v?.mistralApiKey),
      qwenApiKey: str(v?.qwenApiKey),
      qwenWorkspaceId: str(v?.qwenWorkspaceId),
      geminiModel: str(v?.geminiModel),
      anthropicModel: str(v?.anthropicModel),
      openaiModel: str(v?.openaiModel),
      mistralModel: str(v?.mistralModel),
      qwenModel: str(v?.qwenModel),
      localEnabled: v?.localEnabled === true,
    }
    _cache = { at: Date.now(), config }
    _cacheIsError = false
    return config
  } catch {
    _cache = { at: Date.now(), config: EMPTY_CONFIG }
    _cacheIsError = true
    return EMPTY_CONFIG
  }
}

/** Synchronous read of the current cache; safe for use inside the
 *  router which can't await.  Returns null when there is no cache OR the
 *  cache has expired, so the caller falls back to an awaited DB read
 *  rather than pinning a stale config.
 *
 *  Honouring the TTL here matters: on serverless every warm instance keeps
 *  its own `_cache`. Without expiry, an instance that once read an empty or
 *  outdated config would keep using it for its whole lifetime — silently
 *  ignoring the provider + keys saved in Settings → API Keys and falling
 *  back to whatever provider env vars happen to be set. */
export function readRouterConfigSync(): AiRouterConfig | null {
  if (!_cache) return null
  const ttl = _cacheIsError ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS
  return Date.now() - _cache.at < ttl ? _cache.config : null
}

/** Drop the cached config so the next read hits the DB. Called after a
 *  settings write so a save takes effect immediately on this instance. */
export function invalidateRouterConfig(): void {
  invalidateConfig()
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
    providerStrict: patch.providerStrict !== undefined
      ? !!patch.providerStrict
      : current.providerStrict,
    geminiApiKey: patch.geminiApiKey !== undefined ? (str(patch.geminiApiKey)) : current.geminiApiKey,
    anthropicApiKey: patch.anthropicApiKey !== undefined ? (str(patch.anthropicApiKey)) : current.anthropicApiKey,
    openaiApiKey: patch.openaiApiKey !== undefined ? (str(patch.openaiApiKey)) : current.openaiApiKey,
    mistralApiKey: patch.mistralApiKey !== undefined ? (str(patch.mistralApiKey)) : current.mistralApiKey,
    qwenApiKey: patch.qwenApiKey !== undefined ? (str(patch.qwenApiKey)) : current.qwenApiKey,
    qwenWorkspaceId: patch.qwenWorkspaceId !== undefined ? (str(patch.qwenWorkspaceId)) : current.qwenWorkspaceId,
    geminiModel: patch.geminiModel !== undefined ? (str(patch.geminiModel)) : current.geminiModel,
    anthropicModel: patch.anthropicModel !== undefined ? (str(patch.anthropicModel)) : current.anthropicModel,
    openaiModel: patch.openaiModel !== undefined ? (str(patch.openaiModel)) : current.openaiModel,
    mistralModel: patch.mistralModel !== undefined ? (str(patch.mistralModel)) : current.mistralModel,
    qwenModel: patch.qwenModel !== undefined ? (str(patch.qwenModel)) : current.qwenModel,
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
  _cacheIsError = false
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
  _cacheIsError = false
  return next
}

/** Force a re-read on the next call. */
export function invalidateConfig(): void {
  _cache = null
  _cacheIsError = false
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
