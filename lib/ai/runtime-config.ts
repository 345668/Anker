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
import { decryptSecret, encryptSecret, hasEncryptionKey, isEncrypted } from "@/lib/config/crypto"
import type { TaskTag } from "./model-router"

export type ProviderName = "anthropic" | "ollama" | "gemini" | "openai" | "mistral" | "qwen" | "none"

/** Provider names accepted as a providerOverride / chain member. */
export const PROVIDER_NAMES: readonly ProviderName[] = ["anthropic", "ollama", "gemini", "openai", "mistral", "qwen", "none"]

/**
 * Per-surface routing (doc 31). A surface absent from the map behaves exactly as
 * it did before this existed — that default is the whole safety property of doc
 * 29 phase 2, not a convenience.
 */
export interface AiSurfaceConfig {
  /** Leads this surface's provider chain, with the same semantics a global
   *  providerOverride has: it heads the chain, and `providerStrict` makes it the
   *  only entry. Null / absent means the surface does not pin one. */
  provider?: ProviderName | null
  /** A task tag whose tier this surface uses in place of the caller's. */
  task?: string | null
  /** Whether a request may name its own model. Omitted means "use the built-in
   *  default for this surface" (SURFACE_DEFAULTS in model-router.ts), which is
   *  where the safe answer lives — config can only restate it, and a malformed
   *  config cannot grant choice where the code refuses it. */
  userSelectable?: boolean
  /** Per-RUN cost ceiling in USD (doc 33). Omitted uses the built-in default for
   *  the surface; 0 disables the money ceiling for it, leaving the call cap.
   *  USD because the catalogue's prices are USD and are the only price data in
   *  the system — see doc 33 §2.3 on why this is not the deck's EUR. */
  maxRunCostUsd?: number
  /** Native tool calling for this surface (doc 34). Absent means OFF: phase 5
   *  ships dark and is enabled per surface after the Decile comparison, so the
   *  chatbot is never risked for the assistant (doc 29 §11). This switch is the
   *  rollback. Gated additionally on the model declaring `tools` — see
   *  nativeToolsEnabled(). */
  nativeTools?: boolean
}

/** The surfaces doc 29 §5 names. Text is what is stored, so an unknown key in
 *  config is ignored rather than fatal. */
export type SurfaceName = "chatbot" | "assistant" | "copilot" | "batch"
export const SURFACE_NAMES: readonly SurfaceName[] = ["chatbot", "assistant", "copilot", "batch"]

export interface AiRouterConfig {
  enabled: Record<string, boolean>
  modelOverride: Record<string, string>
  /** Per-surface routing; {} when nothing is configured. See AiSurfaceConfig. */
  surfaces: Record<string, AiSurfaceConfig>
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
  /** Email verification (docs/architecture/13): provider id and its key,
   *  set here or by environment. The key is a third-party credential and is
   *  encrypted at rest with the others. */
  emailVerificationProvider: string | null
  emailVerificationApiKey: string | null
}

const EMPTY_CONFIG: AiRouterConfig = {
  enabled: {},
  modelOverride: {},
  // No surface is configured when there is no config to read, which is the same
  // thing as "every surface behaves as it always did".
  surfaces: {},
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
  emailVerificationProvider: null,
  emailVerificationApiKey: null,
}

/**
 * Provider credentials in this row are ENCRYPTED at rest (enc:v1: under
 * CONFIG_ENC_KEY), the same as platform_api_keys and the news provider keys.
 * They are third-party credentials sitting in a settings table that several
 * surfaces read.
 *
 * Reads accept plaintext so values written before this keep working, and every
 * write re-encrypts — including values merely carried over from the current
 * config, which is what stops a partial patch from quietly rewriting a stored
 * key in the clear.
 */
const SECRET_FIELDS = ["geminiApiKey", "anthropicApiKey", "openaiApiKey", "mistralApiKey", "qwenApiKey", "emailVerificationApiKey"] as const

/** Decrypt on the way out; a value that predates encryption is returned as-is. */
function secretOut(v: unknown): string | null {
  const raw = str(v)
  if (!raw) return null
  if (!isEncrypted(raw)) return raw
  const plain = decryptSecret(raw)
  if (plain) return plain
  console.warn("[ai/runtime-config] a provider key could not be decrypted — is CONFIG_ENC_KEY the one it was written with?")
  return null
}

/** Encrypt on the way in. Without a key we refuse rather than store plaintext. */
function secretIn(v: unknown): string | null {
  const raw = str(v)
  if (!raw) return null
  if (isEncrypted(raw)) return raw
  if (!hasEncryptionKey()) throw new Error("CONFIG_ENC_KEY is not set — refusing to store a provider key unencrypted.")
  return encryptSecret(raw)
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
/**
 * Validate the `surfaces` map out of stored JSON (doc 31 §2).
 *
 * Every field is checked and anything unrecognised is dropped rather than
 * carried: this object decides which vendor a request is sent to, so a typo in a
 * hand-edited config must fall back to today's behaviour, not to an undefined
 * that reads as "no pin" in one place and `undefined` as a provider name in
 * another. Unknown surface keys are ignored for forward compatibility.
 */
function parseSurfaces(raw: unknown): Record<string, AiSurfaceConfig> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, AiSurfaceConfig> = {}
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SURFACE_NAMES.includes(name as SurfaceName)) continue
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const v = value as Record<string, unknown>
    const entry: AiSurfaceConfig = {}
    if (typeof v.provider === "string" && PROVIDER_NAMES.includes(v.provider as ProviderName)) {
      entry.provider = v.provider as ProviderName
    }
    if (typeof v.task === "string" && v.task) entry.task = v.task
    // Only an explicit boolean counts. Anything else leaves the built-in default
    // in force, so a truthy string in config cannot open a surface that the code
    // says is closed.
    if (typeof v.userSelectable === "boolean") entry.userSelectable = v.userSelectable
    // A negative or non-finite ceiling is dropped rather than clamped: a config
    // that says something impossible should fall back to the built-in default,
    // not be silently reinterpreted into a number nobody chose.
    if (typeof v.maxRunCostUsd === "number" && Number.isFinite(v.maxRunCostUsd) && v.maxRunCostUsd >= 0) {
      entry.maxRunCostUsd = v.maxRunCostUsd
    }
    // Only an explicit boolean turns this on, for the same reason userSelectable
    // insists on one: a truthy string in a hand-edited config must not switch a
    // surface onto a new transport.
    if (typeof v.nativeTools === "boolean") entry.nativeTools = v.nativeTools
    if (Object.keys(entry).length) out[name] = entry
  }
  return out
}

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
      surfaces: parseSurfaces(v?.surfaces),
      providerOverride: (v?.providerOverride && PROVIDER_NAMES.includes(v.providerOverride))
        ? v.providerOverride : null,
      providerStrict: v?.providerStrict === true,
      geminiApiKey: secretOut(v?.geminiApiKey),
      anthropicApiKey: secretOut(v?.anthropicApiKey),
      openaiApiKey: secretOut(v?.openaiApiKey),
      mistralApiKey: secretOut(v?.mistralApiKey),
      qwenApiKey: secretOut(v?.qwenApiKey),
      qwenWorkspaceId: str(v?.qwenWorkspaceId),
      geminiModel: str(v?.geminiModel),
      anthropicModel: str(v?.anthropicModel),
      openaiModel: str(v?.openaiModel),
      mistralModel: str(v?.mistralModel),
      qwenModel: str(v?.qwenModel),
      localEnabled: v?.localEnabled === true,
      emailVerificationProvider: str(v?.emailVerificationProvider),
      emailVerificationApiKey: secretOut(v?.emailVerificationApiKey),
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
    // Listed here because this function REBUILDS the config rather than merging
    // into it: a key that is read but not named on this object is destroyed by
    // the next unrelated save — change an API key, lose every surface mapping,
    // with nothing logged (doc 31 §1.2). Merged per surface, so patching one
    // does not drop the others.
    surfaces: { ...current.surfaces, ...(patch.surfaces ?? {}) },
    providerOverride: patch.providerOverride !== undefined
      ? patch.providerOverride
      : current.providerOverride,
    providerStrict: patch.providerStrict !== undefined
      ? !!patch.providerStrict
      : current.providerStrict,
    geminiApiKey: secretIn(patch.geminiApiKey !== undefined ? patch.geminiApiKey : current.geminiApiKey),
    anthropicApiKey: secretIn(patch.anthropicApiKey !== undefined ? patch.anthropicApiKey : current.anthropicApiKey),
    openaiApiKey: secretIn(patch.openaiApiKey !== undefined ? patch.openaiApiKey : current.openaiApiKey),
    mistralApiKey: secretIn(patch.mistralApiKey !== undefined ? patch.mistralApiKey : current.mistralApiKey),
    qwenApiKey: secretIn(patch.qwenApiKey !== undefined ? patch.qwenApiKey : current.qwenApiKey),
    qwenWorkspaceId: patch.qwenWorkspaceId !== undefined ? (str(patch.qwenWorkspaceId)) : current.qwenWorkspaceId,
    geminiModel: patch.geminiModel !== undefined ? (str(patch.geminiModel)) : current.geminiModel,
    anthropicModel: patch.anthropicModel !== undefined ? (str(patch.anthropicModel)) : current.anthropicModel,
    openaiModel: patch.openaiModel !== undefined ? (str(patch.openaiModel)) : current.openaiModel,
    mistralModel: patch.mistralModel !== undefined ? (str(patch.mistralModel)) : current.mistralModel,
    qwenModel: patch.qwenModel !== undefined ? (str(patch.qwenModel)) : current.qwenModel,
    localEnabled: patch.localEnabled !== undefined ? !!patch.localEnabled : current.localEnabled,
    emailVerificationProvider: patch.emailVerificationProvider !== undefined ? str(patch.emailVerificationProvider) : current.emailVerificationProvider,
    emailVerificationApiKey: secretIn(patch.emailVerificationApiKey !== undefined ? patch.emailVerificationApiKey : current.emailVerificationApiKey),
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
