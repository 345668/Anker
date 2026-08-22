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

export type ModelTier = "fast" | "balanced" | "deep" | "reason"

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
  // ─── Founder campaign engine ──────────────────────────────────────────
  "campaign_readiness", // Conservative investor-readiness gate (0-100 + gaps)
  "campaign_draft",     // Per-investor outreach email {subject, body}, bulk
  // ─── Agentic tasks (DeepSeek practices; skills/models/*.md) ───────────
  "investor_score",     // SPCT thesis-fit scorer (principles → critique → score)
  "agent_plan",         // Subgoal-decomposition planner (reasoning tier)
  "agent_verify",       // Numeric-claim extractor for the engine verifier
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

  campaign_readiness: "reason",   // SPCT gate — reasoning tier (falls back to deep model)
  campaign_draft:     "balanced", // structured email JSON, run in bulk

  investor_score: "deep",   // SPCT scorer — long-form principled critique
  agent_plan:     "reason", // subgoal decomposition before the tool loop
  agent_verify:   "reason", // extract numeric claims for the engine oracle
}

/** Default Ollama model per tier when no env override is set. */
const TIER_DEFAULTS: Record<ModelTier, string> = {
  fast:     "gemma2:2b",        // ~1.6 GB, ~50-150 tok/s on M-series
  balanced: "qwen2.5:7b-instruct", // ~4.4 GB, ~20-40 tok/s, strong JSON
  deep:     "qwen2.5:14b-instruct", // ~9 GB, ~10-20 tok/s, best reasoning
  // Reasoning tier: planning / verification / high-stakes gates. Defaults to the
  // strong local model so behavior is unchanged until OLLAMA_MODEL_REASON (or a
  // DashScope reasoning route, e.g. DeepSeek-R1 / GLM-thinking) is configured.
  reason:   "qwen2.5:14b-instruct",
}

/** Cloud (DashScope: Qwen / GLM / DeepSeek / Kimi) model per tier — the cloud
 *  analogue of TIER_DEFAULTS, used when the active provider is `qwen`. The provider
 *  layer (lib/ai/provider.ts) calls `dashscopeModelForTask` so a task-tagged call on
 *  DashScope gets a tier-appropriate cloud model (reason → a reasoning model, fast → a
 *  cheap one) instead of one model for everything.
 *
 *  Override per tier with QWEN_MODEL_FAST / _BALANCED / _DEEP / _REASON, or per task
 *  with QWEN_MODEL_TASK_<TASK> (e.g. QWEN_MODEL_REASON=qwq-plus  or
 *  QWEN_MODEL_TASK_AGENT_PLAN=deepseek-v4-flash-0731). Ids must exist on your DashScope
 *  account (see lib/ai/model-catalog.ts). */
// Each tier is an ordered fallback CHAIN: the primary model first, then 3 backups from
// earlier generations of the same family (cheaper / still capable). The provider tries
// them in order and moves to the next on a model/availability error — so a deprecated,
// rate-limited, or briefly-unavailable model degrades gracefully within the family
// before cross-provider failover kicks in. All ids exist in lib/ai/model-catalog.ts.
const DASHSCOPE_TIER_CHAINS: Record<ModelTier, string[]> = {
  //          primary            ← backups: previous generations of the family →
  fast:     ["qwen-flash",     "qwen3.7-flash",       "qwen3.6-flash", "qwen3.5-flash"],
  balanced: ["qwen-plus",      "qwen3.7-plus",        "qwen3.6-plus",  "qwen3.5-plus"],
  deep:     ["glm-5.2",        "glm-5.2-fast-preview", "qwq-plus",     "qwen3-max"],
  reason:   ["qwen3.7-max",    "qwen3.6-max-preview", "qwen3-max",     "qwen-max"],
}

/** A comma-separated env value becomes a custom chain; a single id is a 1-model chain. */
function parseChain(v: string | undefined): string[] | undefined {
  if (!v) return undefined
  const list = v.split(",").map((s) => s.trim()).filter(Boolean)
  return list.length ? list : undefined
}

/** Ordered DashScope fallback chain for a task (primary first, then backups). Override
 *  with QWEN_MODEL_TASK_<TASK> or QWEN_MODEL_<TIER> — comma-separate for a custom chain
 *  (e.g. QWEN_MODEL_REASON="qwen3.7-max,qwen3-max,glm-5.2"). */
export function dashscopeModelChain(task: TaskTag): string[] {
  const tier = TASK_TIER[task] ?? "fast"
  return (
    parseChain(readEnv(`QWEN_MODEL_TASK_${task.toUpperCase()}`)) ??
    parseChain(readEnv(`QWEN_MODEL_${tier.toUpperCase()}`)) ??
    DASHSCOPE_TIER_CHAINS[tier]
  )
}

/** Primary (first) DashScope model for a task — for callers/status wanting one id. */
export function dashscopeModelForTask(task: TaskTag): string {
  return dashscopeModelChain(task)[0]
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
  if (tier === "reason")   return readEnv("OLLAMA_MODEL_REASON")
  return readEnv("OLLAMA_MODEL_DEEP")
}

function envForTask(task: TaskTag): string | undefined {
  // OLLAMA_MODEL_TASK_REPLY_CLASSIFY etc.
  return readEnv(`OLLAMA_MODEL_TASK_${task.toUpperCase()}`)
}

/** Resolve the model for a task. Order of precedence:
 *   1. Runtime admin override (system_settings.ai_router_v1.modelOverride)
 *   2. Per-task override env
 *   3. Per-tier override env
 *   4. Tier default
 *   5. Generic OLLAMA_MODEL (legacy single-model env)
 *
 * The runtime config is read SYNCHRONOUSLY from the in-process cache
 * (`lib/ai/runtime-config.ts`).  Callers that want the freshest config
 * should hit `readRouterConfig()` first to prime the cache.
 */
export function modelForTask(task: TaskTag): string {
  // Runtime override — wins if present.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rc = require("./runtime-config")
  const config = rc.readRouterConfigSync?.() ?? null
  const runtime = rc.modelOverrideFor?.(config, task)
  if (runtime) return runtime

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
