/**
 * Doc 31 — the surface dimension. Acceptance criteria §5, in order.
 *
 * The first test is the one that matters most: with no `surfaces` configured,
 * nothing moves. Everything else in this phase is only safe to deploy because
 * that holds.
 */
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"

const state = vi.hoisted(() => ({ query: null as any }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  sql: Object.assign(
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      state.query(parts.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""), values),
    { unsafe: (q: string, v: unknown[] = []) => state.query(q, v) },
  ),
}))

import {
  resolveModel, surfaceAllowsChoice, SURFACE_DEFAULTS, providerConfigured, TIER_CHAINS,
  dashscopeModelChain,
} from "./model-router"
import { MODEL_CATALOG, RUNTIME_PROVIDER } from "./model-catalog"
import { providerChain, surfaceProviderChain, resolveProvenance, resolveProviderForSurface } from "./provider"
import { rejectionMessage } from "./model-catalog"
import {
  readRouterConfig, patchRouterConfig, invalidateRouterConfig, type AiRouterConfig,
} from "./runtime-config"

/** A config with keys for two providers, so a chain has somewhere to fail over. */
const cfg = (overrides: Partial<AiRouterConfig> = {}): AiRouterConfig => ({
  enabled: {}, modelOverride: {}, surfaces: {},
  providerOverride: null, providerStrict: false,
  geminiApiKey: null, anthropicApiKey: null, openaiApiKey: null,
  mistralApiKey: "m-key", qwenApiKey: "q-key", qwenWorkspaceId: null,
  geminiModel: null, anthropicModel: null, openaiModel: null,
  mistralModel: null, qwenModel: null,
  emailVerificationProvider: null, emailVerificationApiKey: null,
  localEnabled: false,
  ...overrides,
})

// ── 1. Nothing moves without config ─────────────────────────────────────────

it("resolves exactly as before when no surface is configured", () => {
  const c = cfg()
  const before = providerChain(c)
  for (const surface of ["chatbot", "assistant", "copilot", "batch"] as const) {
    const r = resolveModel({ surface, task: "reply_classify", config: c })
    expect(r.provider).toBeNull()          // nothing pinned → the chain decides
    expect(r.task).toBe("reply_classify")  // the caller's task survives
    expect(r.resolution).toBe("auto")
    expect(surfaceProviderChain(c, r.provider as any)).toEqual(before)
  }
})

it("leaves a caller with no surface at all untouched", () => {
  const r = resolveModel({ task: "reply_classify", config: cfg() })
  expect(r).toMatchObject({ provider: null, task: "reply_classify", resolution: "auto" })
  expect(surfaceAllowsChoice(undefined, cfg())).toBe(true)
})

// ── 2. Two surfaces, pointed independently, no deploy ───────────────────────

it("points two surfaces at different providers and tiers independently", () => {
  const c = cfg({ surfaces: {
    chatbot: { provider: "mistral", task: "reply_classify" },
    assistant: { provider: "qwen", task: "deep_research" },
  } })
  const chatbot = resolveModel({ surface: "chatbot", task: "deck_extract", config: c })
  const assistant = resolveModel({ surface: "assistant", task: "deck_extract", config: c })
  expect(chatbot).toMatchObject({ provider: "mistral", task: "reply_classify", resolution: "surface" })
  expect(assistant).toMatchObject({ provider: "qwen", task: "deep_research", resolution: "surface" })
  // A third surface nobody configured is unaffected by either.
  expect(resolveModel({ surface: "copilot", task: "deck_extract", config: c }))
    .toMatchObject({ provider: null, task: "deck_extract", resolution: "auto" })
})

// ── 3. chatbot refuses a pick (P4) ──────────────────────────────────────────

it("refuses a model named by a request on chatbot, valid or not", () => {
  const c = cfg()
  // A REAL catalogue model, to show the refusal is about the surface and not the
  // model: on a surface that takes no choice, a valid id is just as unwelcome.
  const r = resolveModel({ surface: "chatbot", requested: "qwen-plus", config: c })
  expect(r.choice).toEqual({ honoured: false, reason: "not-selectable" })
  expect(r.provider).toBeNull()
  const unknown = resolveModel({ surface: "chatbot", requested: "gpt-9-ultra", config: c })
  expect(unknown.choice).toEqual({ honoured: false, reason: "not-selectable" })
})

it("honours a pick on the surfaces that permit one", () => {
  for (const surface of ["assistant", "copilot"] as const) {
    const r = resolveModel({ surface, requested: "qwen-plus", config: cfg() })
    expect(r.choice).toMatchObject({ honoured: true, model: "qwen-plus", provider: "qwen" })
    expect(r.resolution).toBe("request")
  }
})

it("says the surface takes no choice, rather than calling the pick invalid", () => {
  // The distinction a user acts on: retry with another model, or stop trying.
  const msg = rejectionMessage("qwen-plus", "not-selectable")
  expect(msg).toContain("does not take a model choice")
  expect(msg).not.toContain("not a model in the catalogue")
})

it("keeps the code's default when config is silent, and lets config close a surface", () => {
  expect(SURFACE_DEFAULTS.chatbot.userSelectable).toBe(false)
  expect(surfaceAllowsChoice("copilot", cfg())).toBe(true)
  expect(surfaceAllowsChoice("copilot", cfg({ surfaces: { copilot: { userSelectable: false } } }))).toBe(false)
  // ...but config cannot OPEN a surface with a non-boolean, so a hand-edited
  // "true" string cannot grant choice where the code refuses it.
  const junk = cfg({ surfaces: { chatbot: { userSelectable: "yes" as any } } })
  expect(surfaceAllowsChoice("chatbot", junk)).toBe(false)
})

// ── 4. A surface pin keeps the chain's semantics (P5) ───────────────────────

it("keeps failover for a surface pin, and honours providerStrict", () => {
  const c = cfg()
  const lenient = surfaceProviderChain(c, "qwen")
  expect(lenient[0]).toBe("qwen")
  expect(lenient.length).toBeGreaterThan(1)        // mistral still backs it up

  const strict = surfaceProviderChain(cfg({ providerStrict: true }), "qwen")
  expect(strict).toEqual(["qwen"])                  // no failover, as configured
})

// ── 5. The cache is not shared between surfaces (P1) ───────────────────────

it("gives two surfaces their own provider inside one cache window", async () => {
  const c = cfg({ surfaces: { chatbot: { provider: "mistral" }, assistant: { provider: "qwen" } } })
  // Back-to-back, well inside resolveProvider's 5s TTL. If surface resolution
  // went through that process-global cache, the second call would return the
  // first's answer — intermittently in production, and never in a test that
  // called it once.
  expect(await resolveProviderForSurface("chatbot", c)).toBe("mistral")
  expect(await resolveProviderForSurface("assistant", c)).toBe("qwen")
  expect(await resolveProviderForSurface("chatbot", c)).toBe("mistral")
})

// ── 7. Provenance names the surface (doc 30's column) ──────────────────────

it("records the surface as the deciding rule, below a pin and above the global", () => {
  const c = cfg({ surfaces: { copilot: { provider: "qwen" } }, providerOverride: "mistral" })
  expect(resolveProvenance({ surface: "copilot" }, c)).toBe("surface")
  // A caller's explicit pin is more specific than the surface's config...
  expect(resolveProvenance({ surface: "copilot", provider: "mistral" }, c)).toBe("pinned")
  // ...and the surface is more specific than the global break-glass.
  expect(resolveProvenance({ surface: "assistant" }, c)).toBe("global")
  expect(resolveProvenance({ surface: "copilot", resolution: "request" }, c)).toBe("request")
})

// ── Doc 32: the frontier catalogue ──────────────────────────────────────────

it("lists at least one model for every frontier provider", () => {
  for (const p of ["anthropic", "openai", "gemini", "mistral"] as const) {
    expect(MODEL_CATALOG.some((m) => m.provider === p)).toBe(true)
  }
  // N5 was "the catalogue is Qwen-only"; this is the assertion that it is not.
  expect(new Set(MODEL_CATALOG.map((m) => m.provider)).size).toBeGreaterThan(1)
})

it("refuses a frontier pick with not-configured, not unknown", () => {
  // cfg() has keys for mistral and qwen only.
  const r = resolveModel({ surface: "assistant", requested: "claude-opus-5-5", config: cfg() })
  expect(r.choice).toEqual({ honoured: false, reason: "not-configured" })
  // The distinction doc 32 §1.2 exists for: a developer fixes `unknown`,
  // procurement fixes this.
  expect(r.choice).not.toEqual({ honoured: false, reason: "unknown" })
})

it("honours the same pick once its key is configured", () => {
  const r = resolveModel({ surface: "assistant", requested: "claude-opus-5-5",
    config: cfg({ anthropicApiKey: "a-key" }) })
  expect(r.choice).toMatchObject({ honoured: true, model: "claude-opus-5-5", provider: "anthropic" })
  expect(r.resolution).toBe("request")
})

it("still refuses a model that does not exist as unknown", () => {
  const r = resolveModel({ surface: "assistant", requested: "gpt-9-ultra", config: cfg() })
  expect(r.choice).toEqual({ honoured: false, reason: "unknown" })
})

it("does not refuse when the config could not be read at all", () => {
  // The routes read config as `.catch(() => null)`. Treating null as "no key"
  // would let one database blip refuse every pick platform-wide, blaming
  // credentials that exist.
  const r = resolveModel({ surface: "assistant", requested: "qwen-plus", config: null })
  expect(r.choice).toMatchObject({ honoured: true, model: "qwen-plus" })
})

it("agrees with provider.ts about what counts as a key", () => {
  expect(providerConfigured("qwen", cfg())).toBe(true)
  expect(providerConfigured("anthropic", cfg())).toBe(false)
  // provider.ts treats the literal "stub" as absent; reporting it configured here
  // would honour the pick and then fail upstream.
  expect(providerConfigured("anthropic", cfg({ anthropicApiKey: "stub" }))).toBe(false)
  expect(providerConfigured("anthropic", cfg({ anthropicApiKey: "real" }))).toBe(true)
  expect(providerConfigured("nonsense", cfg())).toBe(false)
})

it("keeps every DashScope tier chain byte-identical through the generalisation", () => {
  // TIER_CHAINS replaced DASHSCOPE_TIER_CHAINS. Every model call in the platform
  // routes through these, so the generalisation must not move a single id.
  expect(TIER_CHAINS.qwen).toEqual({
    fast:     ["qwen-flash",  "qwen3.7-flash",        "qwen3.6-flash", "qwen3.5-flash"],
    balanced: ["qwen-plus",   "qwen3.7-plus",         "qwen3.6-plus",  "qwen3.5-plus"],
    deep:     ["glm-5.2",     "glm-5.2-fast-preview", "qwq-plus",      "qwen3-max"],
    reason:   ["qwen3.7-max", "qwen3.6-max-preview",  "qwen3-max",     "qwen-max"],
  })
  // And the existing reader still sees them.
  expect(dashscopeModelChain("reply_classify")[0]).toBe("qwen-flash")
})

it("gives every provider in TIER_CHAINS a chain for all four tiers", () => {
  for (const [provider, chains] of Object.entries(TIER_CHAINS)) {
    for (const tier of ["fast", "balanced", "deep", "reason"] as const) {
      expect(chains[tier]?.length, `${provider}.${tier}`).toBeGreaterThan(0)
    }
  }
})

it("names only models the catalogue actually contains in every chain", () => {
  // A chain id absent from the catalogue is the upstream "unknown model" failure
  // doc 32 §1.3 is about, reached without anyone picking it.
  const ids = new Set(MODEL_CATALOG.map((m) => m.id))
  for (const [provider, chains] of Object.entries(TIER_CHAINS)) {
    for (const [tier, chain] of Object.entries(chains)) {
      for (const id of chain) expect(ids.has(id), `${provider}.${tier}: ${id}`).toBe(true)
    }
  }
})

it("routes every chain's models to the provider that owns them", () => {
  for (const [provider, chains] of Object.entries(TIER_CHAINS)) {
    for (const chain of Object.values(chains)) {
      for (const id of chain) {
        const m = MODEL_CATALOG.find((x) => x.id === id)!
        expect(RUNTIME_PROVIDER[m.provider], `${id}`).toBe(provider)
      }
    }
  }
})

// ── 6. The writer does not eat the map (P2) ─────────────────────────────────

let db: PGlite
beforeAll(async () => {
  // Saving a provider key refuses to run without this, by design — it will not
  // store a credential unencrypted. A throwaway value for an in-memory database
  // that exists for the length of this file; it protects nothing real.
  process.env.CONFIG_ENC_KEY ??= "test-only-not-a-real-key"
  db = new PGlite()
  state.query = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE system_settings(key text PRIMARY KEY, value jsonb,
    updated_by text, updated_at timestamptz DEFAULT now());
    CREATE TABLE users(id text PRIMARY KEY, email text);`)
}, 30000)
afterAll(async () => { await db.close() })
beforeEach(async () => { await db.exec("DELETE FROM system_settings"); invalidateRouterConfig() })

it("keeps surfaces through a save that only touches an API key", async () => {
  await patchRouterConfig({ surfaces: { chatbot: { provider: "mistral" } } })
  invalidateRouterConfig()
  // An unrelated save, exactly as the admin API issues one.
  await patchRouterConfig({ mistralApiKey: "rotated-key" })
  invalidateRouterConfig()
  const after = await readRouterConfig()
  // patchRouterConfig REBUILDS the config rather than merging, so a key missing
  // from that object is silently destroyed by any later save.
  expect(after.surfaces).toEqual({ chatbot: { provider: "mistral" } })
})

it("merges one surface without dropping the others", async () => {
  await patchRouterConfig({ surfaces: { chatbot: { provider: "mistral" } } })
  invalidateRouterConfig()
  await patchRouterConfig({ surfaces: { assistant: { provider: "qwen" } } })
  invalidateRouterConfig()
  const after = await readRouterConfig()
  expect(after.surfaces).toEqual({
    chatbot: { provider: "mistral" },
    assistant: { provider: "qwen" },
  })
})

it("drops junk from a hand-edited config instead of routing on it", async () => {
  await db.query(
    `INSERT INTO system_settings(key, value) VALUES ('ai_router_v1', $1::jsonb)`,
    [JSON.stringify({ surfaces: {
      chatbot: { provider: "not-a-provider" },     // unknown vendor
      assistant: { provider: "qwen", task: 42 },   // wrong type
      nonsense: { provider: "qwen" },              // unknown surface
      copilot: "mistral",                          // not an object
    } })],
  )
  invalidateRouterConfig()
  const c = await readRouterConfig()
  // Only the one valid field survives; nothing else becomes a routing decision.
  expect(c.surfaces).toEqual({ assistant: { provider: "qwen" } })
})
