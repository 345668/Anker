/**
 * Doc 35 — AI availability: Qwen first, doors open to the rest.
 *
 * Each describe block is one finding from the 2026-09-30 audit, asserted against
 * the code that ships. Real encryption (CONFIG_ENC_KEY) and a captured database
 * are used so the secret-handling checks exercise the actual write path; the
 * network is stubbed so failover is observable call by call.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
vi.mock("server-only", () => ({}))

// A system_settings row we can seed and inspect, standing in for Neon.
const db = vi.hoisted(() => ({ row: null as any, writes: [] as any[] }))
vi.mock("@/lib/db", () => ({
  sql: Object.assign(
    async (parts: TemplateStringsArray, ...vals: any[]) => {
      const q = parts.join("?")
      if (/SELECT value FROM system_settings/i.test(q)) return db.row === null ? [] : [{ value: db.row }]
      if (/INSERT INTO system_settings/i.test(q)) {
        const json = vals.find((v) => typeof v === "string" && v.startsWith("{"))
        db.row = JSON.parse(json)
        db.writes.push(db.row)
      }
      return []
    },
    {},
  ),
}))

import { classifyFailure, buildFailure, failureBody, httpStatusFor, retryAfterFrom } from "./failure"
import { resolveQwenEndpoint, parseQwenRegion, qwenRegionHint } from "./qwen-endpoint"
import {
  providerChain, qwenModelChain, aiReadiness, generateDetailed, resetProvider, getAiStatus, resolveProvider,
} from "./provider"
import {
  patchRouterConfig, clearTaskOverride, readRouterConfig, readRouterConfigSync, invalidateConfig,
  redactRouterConfig, SECRET_CONFIG_FIELDS, type AiRouterConfig,
} from "./runtime-config"
import { withAiContext } from "@/lib/assistant/context"

const ENV = [
  "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "MISTRAL_API_KEY",
  "DASHSCOPE_API_KEY", "QWEN_API_KEY", "QWEN_WORKSPACE_ID", "QWEN_REGION", "QWEN_BASE_URL",
  "AI_PROVIDER", "LOCAL_AI_ENABLED", "CONFIG_ENC_KEY",
]
let saved: Record<string, string | undefined> = {}
beforeEach(() => {
  saved = {}
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k] }
  process.env.CONFIG_ENC_KEY = "vitest-config-enc-key-0123456789"
  db.row = null
  db.writes = []
  invalidateConfig()
  resetProvider()
})
afterEach(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  vi.unstubAllGlobals()
})

function cfg(o: Partial<AiRouterConfig> = {}): AiRouterConfig {
  return {
    enabled: {}, modelOverride: {}, surfaces: {}, providerOverride: null, providerStrict: false,
    geminiApiKey: null, anthropicApiKey: null, openaiApiKey: null, mistralApiKey: null, qwenApiKey: null,
    qwenWorkspaceId: null, geminiModel: null, anthropicModel: null, openaiModel: null, mistralModel: null,
    qwenModel: null, localEnabled: false, emailVerificationProvider: null, emailVerificationApiKey: null, ...o,
  }
}

// ─── #5 typed failures ─────────────────────────────────────────────────────
describe("classifyFailure", () => {
  it.each([
    [{ status: 429, error: "HTTP 429: Rate limit exceeded" }, "rate_limited"],
    [{ status: 429, error: "HTTP 429: Allocated quota exceeded" }, "quota_exhausted"],
    [{ status: 401, error: "HTTP 401: Incorrect API key provided" }, "credentials_invalid"],
    [{ status: 403, error: "HTTP 403: model qwen-max is not entitled for this account" }, "model_unavailable"],
    [{ status: 404, error: "HTTP 404: the model does not exist" }, "model_unavailable"],
    [{ error: "task 'assistant_chat' disabled by admin" }, "task_disabled"],
    [{ error: "no Qwen (Alibaba) API key configured" }, "no_provider"],
    [{ error: "no AI provider configured" }, "no_provider"],
    [{ error: "a provider key could not be decrypted" }, "config_unreadable"],
    [{ error: "request timed out (120s)" }, "timeout"],
    [{ error: "This operation was aborted" }, "cancelled"],
    [{ status: 503, error: "HTTP 503: upstream overloaded" }, "provider_error"],
  ])("%j → %s", (input, kind) => expect(classifyFailure(input as any)).toBe(kind))

  it("marks only the retryable kinds retryable, with a wait for a rate limit", () => {
    expect(buildFailure({ status: 429, error: "Rate limit exceeded" })).toMatchObject({ kind: "rate_limited", retryable: true, retryAfterSec: 30 })
    expect(buildFailure({ status: 429, error: "Rate limit exceeded, retry in 12s" }).retryAfterSec).toBe(12)
    expect(buildFailure({ status: 401, error: "bad key" }).retryable).toBe(false)
    expect(buildFailure({ status: 429, error: "insufficient quota" }).retryable).toBe(false)
  })

  it("never puts provider wording in the user message or the response body", () => {
    const f = buildFailure({ status: 429, error: "HTTP 429: Rate limit exceeded (code 1300) via mistral-small-latest" })
    const body = failureBody(f, "abc123")
    expect(JSON.stringify(body)).not.toMatch(/1300|mistral|Rate limit exceeded/)
    expect(body).toMatchObject({ code: "rate_limited", retryable: true, requestId: "abc123" })
  })

  it("maps kinds to statuses a route can use", () => {
    expect(httpStatusFor("rate_limited")).toBe(429)
    expect(httpStatusFor("timeout")).toBe(504)
    expect(httpStatusFor("credentials_invalid")).toBe(503)
    expect(retryAfterFrom("nothing here")).toBeUndefined()
  })
})

// ─── #2 one Qwen endpoint ──────────────────────────────────────────────────
describe("resolveQwenEndpoint", () => {
  it("defaults to the international endpoint, matching embeddings", () => {
    expect(resolveQwenEndpoint({ env: {} })).toMatchObject({ baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", source: "default", region: "intl" })
  })
  it("takes a region from config or env, accepting the names people type", () => {
    expect(resolveQwenEndpoint({ region: "cn", env: {} }).baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1")
    expect(resolveQwenEndpoint({ env: { QWEN_REGION: "Virginia" } }).baseUrl).toBe("https://dashscope-us.aliyuncs.com/compatible-mode/v1")
    expect(parseQwenRegion("Singapore")).toBe("intl")
    expect(parseQwenRegion("mars")).toBeNull()
  })
  it("treats the legacy workspace value 'intl' as a region, and a real workspace as its own host", () => {
    expect(resolveQwenEndpoint({ workspaceId: "intl", env: {} }).source).toBe("region")
    expect(resolveQwenEndpoint({ workspaceId: "ws-123", env: {} }).baseUrl).toBe("https://ws-123.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1")
  })
  it("lets an explicit base URL win over everything, trimming the slash", () => {
    expect(resolveQwenEndpoint({ region: "cn", workspaceId: "ws", env: { QWEN_BASE_URL: "https://proxy.example/v1/" } }))
      .toMatchObject({ baseUrl: "https://proxy.example/v1", source: "base_url_env" })
  })
  it("explains a 401 in terms of region", () => {
    expect(qwenRegionHint(resolveQwenEndpoint({ env: {} }))).toMatch(/QWEN_REGION/)
  })
})

// ─── #1 Qwen leads, the rest stay ──────────────────────────────────────────
describe("provider order", () => {
  const all = { qwenApiKey: "q", anthropicApiKey: "a", openaiApiKey: "o", mistralApiKey: "m", geminiApiKey: "g" }
  it("puts Qwen first and keeps every other provider as a fallback", () => {
    expect(providerChain(cfg(all))).toEqual(["qwen", "anthropic", "openai", "mistral", "gemini"])
  })
  it("still honours a pin, with Qwen then backing it up", () => {
    expect(providerChain(cfg({ ...all, providerOverride: "mistral" }))).toEqual(["mistral", "qwen", "anthropic", "openai", "gemini"])
  })
  it("never fails over when the pin is strict", () => {
    expect(providerChain(cfg({ ...all, providerOverride: "qwen", providerStrict: true }))).toEqual(["qwen"])
  })
  it("works with any single provider alone, so nothing is Qwen-only", () => {
    for (const k of ["anthropicApiKey", "openaiApiKey", "mistralApiKey", "geminiApiKey"] as const) {
      expect(providerChain(cfg({ [k]: "x" }))).toHaveLength(1)
    }
  })
  it("resolves the active provider from the same order the chain uses", async () => {
    db.row = { qwenApiKey: "qk-1234567890123456", mistralApiKey: "mk-1234567890123456" }
    expect(await resolveProvider()).toBe("qwen")
    const st = await getAiStatus()
    expect(st.chain[0]).toBe("qwen")
    expect(st.configured).toMatchObject({ qwen: true, mistral: true })
    expect(st.model).toBeTruthy()      // was null for Qwen
  })
})

// ─── #3 saved models are the models sent ───────────────────────────────────
describe("qwenModelChain", () => {
  it("falls to the tier chain with no saved setting", () => {
    expect(qwenModelChain(cfg(), { task: "deep_research" })).toEqual(["glm-5.2", "glm-5.2-fast-preview", "qwq-plus", "qwen3-max"])
  })
  it("leads with the saved per-task model and keeps the tier chain behind it", () => {
    const c = cfg({ modelOverride: { deep_research: "qwen3-max" } })
    expect(qwenModelChain(c, { task: "deep_research" })).toEqual(["qwen3-max", "glm-5.2", "glm-5.2-fast-preview", "qwq-plus"])
  })
  it("lets the per-task model beat the provider-wide Qwen model", () => {
    const c = cfg({ qwenModel: "qwen-plus", modelOverride: { deep_research: "qwen3-max" } })
    expect(qwenModelChain(c, { task: "deep_research" })[0]).toBe("qwen3-max")
    expect(qwenModelChain(cfg({ qwenModel: "qwen-plus" }), { task: "deep_research" })[0]).toBe("qwen-plus")
  })
  it("never second-guesses an explicit pick", () => {
    expect(qwenModelChain(cfg({ qwenModel: "qwen-plus" }), { model: "qwen3.7-max", task: "deep_research" })).toEqual(["qwen3.7-max"])
  })
})

// ─── failover, observed on the wire ────────────────────────────────────────
const calls: { url: string; body: any }[] = []
const ok = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 3 } }), { status: 200 })
const fail = (status: number, message: string) => new Response(JSON.stringify({ error: { message } }), { status })
function stubFetch(handler: (url: string, body: any) => Response) {
  calls.length = 0
  vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : {}
    calls.push({ url: String(url), body })
    return handler(String(url), body)
  }))
}
const KEYS = { qwenApiKey: "qk-test-1234567890123456", openaiApiKey: "ok-test-1234567890123456" }

describe("generateDetailed", () => {
  it("calls Qwen first, on the international endpoint, with the task's model", async () => {
    db.row = KEYS
    stubFetch(() => ok("fine"))
    const r = await generateDetailed("hi", { task: "doc_summary", retries: 0 })
    expect(r).toMatchObject({ text: "fine", provider: "qwen" })
    expect(calls[0].url).toBe("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions")
    expect(calls[0].body.model).toBe("qwen-flash")
  })

  it("sends the saved per-task model, not the tier default", async () => {
    db.row = { ...KEYS, modelOverride: { doc_summary: "qwen3-max" } }
    stubFetch(() => ok("fine"))
    await generateDetailed("hi", { task: "doc_summary", retries: 0 })
    expect(calls[0].body.model).toBe("qwen3-max")
  })

  it("falls over to another configured provider when Qwen is rate-limited", async () => {
    db.row = KEYS
    stubFetch((url) => (url.includes("dashscope") ? fail(429, "Rate limit exceeded") : ok("rescued")))
    const r = await generateDetailed("hi", { task: "doc_summary", retries: 0 })
    expect(r).toMatchObject({ text: "rescued", provider: "openai" })
    expect(calls.some((c) => c.url.includes("api.openai.com"))).toBe(true)
  })

  it("does not escape a strict pin: only Qwen is called, and the failure is typed", async () => {
    db.row = { ...KEYS, providerOverride: "qwen", providerStrict: true }
    stubFetch(() => fail(429, "Rate limit exceeded"))
    const r = await generateDetailed("hi", { task: "doc_summary", retries: 0 })
    expect(r.text).toBe("")
    expect(calls.every((c) => c.url.includes("dashscope"))).toBe(true)
    expect(r.failure).toMatchObject({ kind: "rate_limited", retryable: true })
  })

  it("reports the actionable cause when every provider fails", async () => {
    db.row = KEYS
    stubFetch((url) => (url.includes("dashscope") ? fail(401, "Incorrect API key provided") : fail(429, "Rate limit exceeded")))
    const r = await generateDetailed("hi", { task: "doc_summary", retries: 0 })
    // A retryable cause is the useful one, even though Qwen's was a bad key.
    expect(r.failure?.kind).toBe("rate_limited")
    expect(r.error).toMatch(/all providers failed/)
  })

  it("says which region was used when Qwen rejects the key", async () => {
    db.row = { qwenApiKey: KEYS.qwenApiKey }
    stubFetch(() => fail(401, "Incorrect API key provided"))
    const r = await generateDetailed("hi", { task: "doc_summary", retries: 0 })
    expect(r.failure?.kind).toBe("credentials_invalid")
    expect(r.error).toMatch(/QWEN_REGION/)
  })

  it("labels a missing Qwen key as Qwen, not Mistral", async () => {
    db.row = { providerOverride: "qwen", providerStrict: true }
    const r = await generateDetailed("hi", { task: "doc_summary", retries: 0 })
    expect(r.error).not.toMatch(/mistral/i)
    expect(r.failure?.kind).toBe("no_provider")
  })

  it("makes no provider call for a task an admin switched off, and says so", async () => {
    db.row = { ...KEYS, enabled: { doc_summary: false } }
    stubFetch(() => ok("x"))
    const r = await generateDetailed("hi", { task: "doc_summary", retries: 0 })
    expect(calls).toHaveLength(0)
    expect(r.failure?.kind).toBe("task_disabled")
  })

  it("stops at once when the caller is already gone", async () => {
    db.row = KEYS
    stubFetch(() => ok("x"))
    const ctl = new AbortController(); ctl.abort()
    await expect(withAiContext({ userId: "u", orgId: null, scopeKey: "s", persona: "vc", membership: null, lpMemberships: [], canWrite: false, readonly: true, allowedTools: null } as any,
      () => generateDetailed("hi", { task: "doc_summary", retries: 0 }), ctl.signal)).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it("does not walk on to the next provider once cancelled mid-chain", async () => {
    db.row = KEYS
    const ctl = new AbortController()
    stubFetch((url) => { if (url.includes("dashscope")) ctl.abort(); return fail(429, "Rate limit exceeded") })
    const p = { userId: "u", orgId: null, scopeKey: "s", persona: "vc", membership: null, lpMemberships: [], canWrite: false, readonly: true, allowedTools: null } as any
    const r = await withAiContext(p, () => generateDetailed("hi", { task: "doc_summary", retries: 0 }), ctl.signal)
    expect(r.text).toBe("")
    expect(calls.some((c) => c.url.includes("api.openai.com"))).toBe(false)
  })
})

// ─── #6 no inference to ask "is AI up?" ────────────────────────────────────
describe("aiReadiness", () => {
  it("answers from configuration with no network call", async () => {
    db.row = KEYS
    stubFetch(() => ok("x"))
    expect(await aiReadiness({ task: "assistant_chat" })).toMatchObject({ ok: true, provider: "qwen" })
    expect(calls).toHaveLength(0)
  })
  it("names the cause when nothing can run", async () => {
    expect(await aiReadiness({ task: "assistant_chat" })).toMatchObject({ ok: false, failure: { kind: "no_provider" } })
    db.row = { ...KEYS, enabled: { assistant_chat: false } }; invalidateConfig()
    expect(await aiReadiness({ task: "assistant_chat" })).toMatchObject({ ok: false, failure: { kind: "task_disabled" } })
  })
  it("is independent of the research-dossier switch (the assistants have their own task)", async () => {
    db.row = { ...KEYS, enabled: { deep_research: false } }
    expect(await aiReadiness({ task: "assistant_chat" })).toMatchObject({ ok: true })
  })
  it("treats a pinned provider with no key as not ready, rather than probing it", async () => {
    db.row = { qwenApiKey: KEYS.qwenApiKey }
    expect(await aiReadiness({ task: "assistant_chat", provider: "mistral" })).toMatchObject({ ok: false, failure: { kind: "no_provider" } })
  })
})

// ─── #7 / #8 secrets: ciphertext in storage, plaintext in memory, nothing in responses
describe("provider keys", () => {
  it("encrypts on write and returns the usable key, not the ciphertext", async () => {
    const next = await patchRouterConfig({ qwenApiKey: "sk-live-abcdef-0123456789" })
    expect(db.row.qwenApiKey).toMatch(/^enc:v1:/)
    expect(JSON.stringify(db.row)).not.toContain("sk-live-abcdef-0123456789")
    expect(next.qwenApiKey).toBe("sk-live-abcdef-0123456789")
  })

  it("never leaves ciphertext in the runtime cache for the next provider call to send", async () => {
    await patchRouterConfig({ qwenApiKey: "sk-live-abcdef-0123456789" })
    const cached = readRouterConfigSync()
    expect(cached === null || !String(cached.qwenApiKey).startsWith("enc:")).toBe(true)
    expect((await readRouterConfig()).qwenApiKey).toBe("sk-live-abcdef-0123456789")
  })

  it("keeps keys encrypted when a task override is cleared", async () => {
    await patchRouterConfig({ qwenApiKey: "sk-live-abcdef-0123456789", openaiApiKey: "sk-openai-abcdef-0123456789", modelOverride: { deep_research: "x" } })
    const after = await clearTaskOverride("deep_research")
    expect(db.row.qwenApiKey).toMatch(/^enc:v1:/)
    expect(db.row.openaiApiKey).toMatch(/^enc:v1:/)
    expect(JSON.stringify(db.row)).not.toMatch(/sk-live-abcdef|sk-openai-abcdef/)
    expect(after.modelOverride.deep_research).toBeUndefined()
  })

  it("re-encrypts a legacy plaintext key on the next write instead of preserving it", async () => {
    db.row = { qwenApiKey: "legacy-plaintext-key-1234567890", modelOverride: { deep_research: "x" } }
    await clearTaskOverride("deep_research")
    expect(db.row.qwenApiKey).toMatch(/^enc:v1:/)
  })

  it("keeps a task override clear from touching the region or surfaces", async () => {
    await patchRouterConfig({ qwenRegion: "cn", surfaces: { assistant: { provider: "qwen" } } })
    await clearTaskOverride("deep_research")
    expect(db.row.qwenRegion).toBe("cn")
    expect(db.row.surfaces.assistant.provider).toBe("qwen")
  })
})

describe("redactRouterConfig", () => {
  it("removes every secret field, including the email-verification key", () => {
    const c = cfg({ qwenApiKey: "q-secret-1234", anthropicApiKey: "a-secret-1234", emailVerificationApiKey: "e-secret-1234", emailVerificationProvider: "zerobounce" })
    const { config, keys } = redactRouterConfig(c)
    for (const f of SECRET_CONFIG_FIELDS) expect(Object.keys(config)).not.toContain(f)
    expect(JSON.stringify(config)).not.toMatch(/secret-1234/)
    expect(keys.qwen).toEqual({ set: true, hint: null })
    expect(keys.emailVerification.set).toBe(true)
    expect(keys.openai.set).toBe(false)
  })
  it("adds a last-four hint only when asked", () => {
    expect(redactRouterConfig(cfg({ qwenApiKey: "q-secret-1234" }), { hints: true }).keys.qwen.hint).toBe("••••1234")
  })
})

describe("Qwen lanes: free allowance first, then the plan", () => {
  it("skips an exhausted free model, then falls through to the plan key and endpoint", async () => {
    const { clearQwenExhausted } = await import("./qwen-lanes")
    clearQwenExhausted()
    process.env.QWEN_FREE_API_KEY = "free-key"
    process.env.QWEN_PLAN_API_KEY = "plan-key"
    process.env.QWEN_PLAN_MODEL_BALANCED = "qwen3.6-plus"
    const calls: { url: string; auth: string; model: string }[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body)
      calls.push({ url, auth: init.headers.Authorization, model: body.model })
      if (url.includes("coding-intl")) {
        return new Response(JSON.stringify({ choices: [{ message: { content: "from plan" }, finish_reason: "stop" }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ error: { message: "AllocationQuota.FreeTierOnly: free tier exhausted" } }), { status: 403 })
    }))
    resetProvider()
    const res = await generateDetailed("hi", { retries: 0 })
    expect(res.text).toBe("from plan")
    const free = calls.filter((c) => !c.url.includes("coding-intl"))
    expect(free.length).toBeGreaterThan(0)
    expect(free.every((c) => c.auth === "Bearer free-key")).toBe(true)
    expect(calls.at(-1)!.auth).toBe("Bearer plan-key")
    // Second call does not re-hit the models already known to be spent.
    const before = free.length
    calls.length = 0
    await generateDetailed("again", { retries: 0 })
    expect(calls.filter((c) => !c.url.includes("coding-intl")).length).toBeLessThan(before + 1)
    delete process.env.QWEN_FREE_API_KEY; delete process.env.QWEN_PLAN_API_KEY; delete process.env.QWEN_PLAN_MODEL_BALANCED
    clearQwenExhausted()
  })
})

import { classifyFailure as classifyTimeLimit } from "./failure"
describe("the run's own time limit", () => {
  it("is a timeout, not a provider fault", () => {
    expect(classifyTimeLimit({ error: "AI request time limit reached." })).toBe("timeout")
  })
})
