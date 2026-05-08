/**
 * Multi-model router.
 *
 * Different inference jobs have different requirements:
 *
 *   - reply classification, tag extraction, short DM rewrites:
 *       a 2-3B model (gemma2:2b, llama3.2:3b) is plenty and ~5-10x faster
 *       than a 7B+ on a laptop GPU.
 *   - structured-JSON extraction from a deck:
 *       a 7-8B model (qwen2.5:7b, llama3.1:8b) gets the schema right far
 *       more often than a 3B.
 *   - long-form analysis / decision support (claims review, deck critique,
 *       LP analyst review):
 *       step up again to a 12-14B (mistral-nemo, gemma2:9b, qwen2.5:14b)
 *       or fall back to Anthropic for vision / nuance.
 *
 * The router picks a model per **task tag**.  Tags map → tier → model
 * via env-overridable defaults.  Anything unset falls through to the
 * generic OLLAMA_MODEL the rest of the system already uses.
 *
 * Env overrides (all optional):
 *
 *   OLLAMA_MODEL_FAST     # tier 'fast'    classify, short rewrite, hooks
 *   OLLAMA_MODEL_BALANCED # tier 'balanced' extraction, summarize
 *   OLLAMA_MODEL_DEEP     # tier 'deep'    long analysis, critique
 *
 * Per-task overrides (highest precedence):
 *
 *   OLLAMA_MODEL_TASK_<TASK>   e.g. OLLAMA_MODEL_TASK_REPLY_CLASSIFY=qwen2.5:1.5b
 *
 * Everything is a one-line lookup at call time — no probes, no extra
 * round-trips.
 */

export type ModelTier = "fast" | "balanced" | "deep"

/** Task tags used across the codebase.  Keep as a closed set so typos
 *  don't silently fall through to the default tier. */
export const TASKS = [
  "reply_classify",   // Layer 4 reply classifier (5 buckets, 1 draft)
  "dm_personalize",   // Layer 2 connection request + 3 follow-ups
  "deck_extract",     // Pull JSON profile from a deck (founder or fund)
  "deck_critique",    // 8-dimension founder deck critique
  "fund_critique",    // 6-dimension LP fund critique + claims review
  "ai_rationale",     // Per-investor "why this LP" / "why this VC" 1-liner
  "match_summary",    // Short summary of a matchmaking session
  "doc_summary",      // 1-2 sentence document summary
  // ─── Admin / data-quality tasks ──────────────────────────────────────
  "enrich_extract",   // From a crawled webpage, pull structured firm/
                      // investor fields (sectors, stages, check size,
                      // portfolio, team).  Strict JSON shape.
  "deep_research",    // Multi-page research dossier: synthesize a 2-3
                      // paragraph profile from home + about + team
                      // + portfolio pages.
  "url_classify",     // Tag a URL by purpose (homepage / about / team /
                      // portfolio / blog / careers / press / other).
  // ─── Agent / outreach tasks ──────────────────────────────────────────
  "investor_profile", // Synthesize a multi-source profile for one
                      // investor (firm role, sectors, recent deals,
                      // public posts, talking points).
  "firm_lookup",      // Quick "is this firm in our DB? does the user
                      // mean X or Y?" disambiguation.
  "linkedin_extract", // Pull structured fields from a LinkedIn public
                      // snippet (title, company, summary).
  "portfolio_search", // From a firm's portfolio page text, list deals
                      // + the lead investor where stated.
] as const

export type TaskTag = (typeof TASKS)[number]

/** Default tier per task. */
export const TASK_TIER: Record<TaskTag, ModelTier> = {
  reply_classify: "fast",     // 5 labels + 1 short draft, small model is fine
  dm_personalize: "fast",     // strict templates, low temperature
  ai_rationale:   "fast",     // 1 line, run hundreds of times per match run
  match_summary:  "fast",
  doc_summary:    "fast",
  url_classify:   "fast",     // single-label classification, tiny model OK
  firm_lookup:    "fast",     // disambiguation, name → id matching
  portfolio_search: "fast",   // structured-list extraction, simple

  deck_extract:    "balanced", // structured JSON, schema discipline matters
  fund_critique:   "balanced", // structured 6-dim scoring + claims table
  enrich_extract:  "balanced", // crawled page → structured firm fields
  investor_profile:"balanced", // multi-source profile synthesis
  linkedin_extract:"balanced", // sparse data, schema needs care

  deck_critique:  "deep",     // long-form, multi-paragraph reasoning
  deep_research:  "deep",     // multi-page synthesis into a dossier
}

/** Default Ollama model per tier when no env override is set. */
const TIER_DEFAULTS: Record<ModelTier, string> = {
  fast:     "gemma2:2b",        // ~1.6 GB, ~50-150 tok/s on M-series
  balanced: "qwen2.5:7b-instruct", // ~4.4 GB, ~20-40 tok/s, strong JSON
  deep:     "qwen2.5:14b-instruct", // ~9 GB, ~10-20 tok/s, best reasoning
}

/** Read-once cache of resolved task→model mapping. */
let _cache: Record<TaskTag, string> | null = null

function readEnv(key: string): string | undefined {
  const v = process.env[key]
  return v && v.trim() ? v.trim() : undefined
}

function envForTier(tier: ModelTier): string | undefined {
  if (tier === "fast")     return readEnv("OLLAMA_MODEL_FAST")
  if (tier === "balanced") return readEnv("OLLAMA_MODEL_BALANCED")
  return readEnv("OLLAMA_MODEL_DEEP")
}

function envForTask(task: TaskTag): string | undefined {
  // OLLAMA_MODEL_TASK_REPLY_CLASSIFY etc.
  return readEnv(`OLLAMA_MODEL_TASK_${task.toUpperCase()}`)
}

/** Resolve the model for a task. Order of precedence:
 *   1. Per-task override env
 *   2. Per-tier override env
 *   3. Tier default
 *   4. Generic OLLAMA_MODEL (legacy single-model env)
 */
export function modelForTask(task: TaskTag): string {
  if (_cache && _cache[task]) return _cache[task]
  const tier = TASK_TIER[task] ?? "fast"
  const taskOverride = envForTask(task)
  const tierOverride = envForTier(tier)
  const legacy = readEnv("OLLAMA_MODEL")
  const resolved =
    taskOverride ??
    tierOverride ??
    legacy ??
    TIER_DEFAULTS[tier]
  if (!_cache) _cache = {} as Record<TaskTag, string>
  _cache[task] = resolved
  return resolved
}

/** Reset cache — used in tests after env changes. */
export function resetModelRouter(): void {
  _cache = null
}

/** Inspector for status pages: returns the full task→model mapping. */
export function snapshotModelRouting(): Array<{
  task: TaskTag
  tier: ModelTier
  model: string
  source: "task_env" | "tier_env" | "legacy_env" | "default"
}> {
  return TASKS.map((task) => {
    const tier = TASK_TIER[task] ?? "fast"
    let source: "task_env" | "tier_env" | "legacy_env" | "default" = "default"
    if (envForTask(task)) source = "task_env"
    else if (envForTier(tier)) source = "tier_env"
    else if (readEnv("OLLAMA_MODEL")) source = "legacy_env"
    return { task, tier, model: modelForTask(task), source }
  })
}
