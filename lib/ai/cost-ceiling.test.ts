/**
 * Doc 33 — the cost ceiling. Acceptance §5, in order.
 *
 * The thing worth remembering while reading these: before this phase,
 * `ai_calls.prompt_tokens` was null on all 2531 rows because nothing parsed a
 * provider's usage block. A ceiling built on that data would have capped every
 * run at zero spend forever, passed its own tests, and never fired. So the first
 * tests here are about tokens existing at all.
 */
import { beforeEach, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: Object.assign(() => [], { unsafe: () => [] }) }))

import { costOf, getModel } from "./model-catalog"
import { SURFACE_DEFAULTS, maxRunCostFor } from "./model-router"
import {
  withAiContext, checkAiBudget, chargeAiBudget, currentRunBudget, AiBudgetExceeded,
} from "@/lib/assistant/context"
import type { AiRouterConfig } from "./runtime-config"

const principal = {
  userId: "u1", orgId: "org-a", scopeKey: "org:org-a", persona: "vc" as const,
  membership: null, lpMemberships: [], canWrite: true, readonly: false, allowedTools: null,
}
const cfg = (surfaces: AiRouterConfig["surfaces"] = {}): AiRouterConfig =>
  ({ surfaces } as AiRouterConfig)

// ── Pricing: what a call cost, or honestly nothing ──────────────────────────

it("prices a call from the catalogue, using the high end of a range", () => {
  // qwen-plus is priceIn "0.4-1.2" / priceOut "1.2-3.6", USD per 1M tokens.
  const cost = costOf("qwen-plus", { promptTokens: 1_000_000, outputTokens: 1_000_000 })
  // High end deliberately: a ceiling that under-estimates is a ceiling that does
  // not hold, so the safe direction to be wrong in is "too expensive".
  expect(cost).toBeCloseTo(1.2 + 3.6, 6)
})

it("scales linearly and handles a one-sided count", () => {
  expect(costOf("qwen-plus", { promptTokens: 500_000 })).toBeCloseTo(0.6, 6)
  expect(costOf("qwen-plus", { outputTokens: 100_000 })).toBeCloseTo(0.36, 6)
})

it("returns null — not zero — when the model carries no price", () => {
  // Every frontier model, by doc 32 §1.3: listed but unpriced rather than guessed.
  expect(getModel("claude-opus-5-5")).toBeTruthy()
  expect(getModel("claude-opus-5-5")?.priceIn).toBeUndefined()
  expect(costOf("claude-opus-5-5", { promptTokens: 1_000_000, outputTokens: 1_000_000 })).toBeNull()
})

it("returns null when the provider reported no usage at all", () => {
  expect(costOf("qwen-plus", undefined)).toBeNull()
  expect(costOf("qwen-plus", {})).toBeNull()
  expect(costOf("not-a-model", { promptTokens: 100 })).toBeNull()
  expect(costOf(null, { promptTokens: 100 })).toBeNull()
})

// ── The ceiling per surface (E2) ────────────────────────────────────────────

it("defaults every surface to a ceiling, ordered by what each does", () => {
  expect(SURFACE_DEFAULTS.chatbot.maxRunCostUsd).toBe(0.10)
  expect(SURFACE_DEFAULTS.copilot.maxRunCostUsd).toBe(0.25)
  expect(SURFACE_DEFAULTS.assistant.maxRunCostUsd).toBe(1.00)
  expect(SURFACE_DEFAULTS.batch.maxRunCostUsd).toBe(2.00)
  // An agentic run may make 16 calls; a single chat turn makes one.
  expect(SURFACE_DEFAULTS.assistant.maxRunCostUsd)
    .toBeGreaterThan(SURFACE_DEFAULTS.chatbot.maxRunCostUsd)
})

it("takes the ceiling from config when set, and the default when not", () => {
  expect(maxRunCostFor("assistant", cfg())).toBe(1.00)
  expect(maxRunCostFor("assistant", cfg({ assistant: { maxRunCostUsd: 5 } }))).toBe(5)
})

it("treats a configured 0 as 'no money ceiling', distinct from unconfigured", () => {
  expect(maxRunCostFor("assistant", cfg({ assistant: { maxRunCostUsd: 0 } }))).toBeNull()
  expect(maxRunCostFor("assistant", cfg())).toBe(1.00)
})

it("gives a caller with no surface no money ceiling", () => {
  // Acceptance 6: every call site not yet given a surface behaves as before.
  expect(maxRunCostFor(undefined, cfg())).toBeNull()
})

// ── Enforcement ─────────────────────────────────────────────────────────────

it("stops a run once its priced spend reaches the ceiling", async () => {
  await withAiContext(principal, async () => {
    checkAiBudget(true)                     // first call is allowed
    chargeAiBudget(0.4)
    checkAiBudget(true)                     // still under
    chargeAiBudget(0.7)                     // now 1.1 > 1.00
    expect(() => checkAiBudget(true)).toThrow(AiBudgetExceeded)
    try { checkAiBudget(true) } catch (e) {
      expect(e).toBeInstanceOf(AiBudgetExceeded)
      // The message has to say what to do, not just that something stopped.
      expect((e as Error).message).toContain("cost ceiling")
      expect((e as Error).message).toContain("1.00")
    }
  }, undefined, 1.00)
})

it("does not stop a run whose calls could not be priced", async () => {
  // Doc 33 §1.3: unpriceable is not free, but it also cannot bind the money
  // ceiling — the call cap stays the only bound, and the run is labelled.
  await withAiContext(principal, async () => {
    for (let i = 0; i < 10; i++) { chargeAiBudget(null); checkAiBudget(true) }
    const b = currentRunBudget()!
    expect(b.spendUsd).toBe(0)
    expect(b.unpricedCalls).toBe(10)
    expect(b.pricedCalls).toBe(0)
  }, undefined, 1.00)
})

it("still enforces the 16-call cap on an unpriced run", async () => {
  await withAiContext(principal, async () => {
    expect(() => {
      for (let i = 0; i < 20; i++) { chargeAiBudget(null); checkAiBudget(true) }
    }).toThrow(/model-call budget/)
  }, undefined, 1.00)
})

it("keeps a run with no ceiling behaving exactly as before", async () => {
  await withAiContext(principal, async () => {
    for (let i = 0; i < 10; i++) { chargeAiBudget(5.0); checkAiBudget(true) }
    expect(currentRunBudget()!.spendUsd).toBeCloseTo(50, 6)   // spent, never stopped
  })  // no ceiling passed
})

it("separates a genuinely cheap run from an unmeasured one", async () => {
  // Both spend ~0. Without the counts they would read identically, and a run made
  // entirely of unpriced frontier calls would look like the cheapest of the day.
  await withAiContext(principal, async () => {
    chargeAiBudget(0.0001); chargeAiBudget(0.0001)
    const b = currentRunBudget()!
    expect(b.pricedCalls).toBe(2)
    expect(b.unpricedCalls).toBe(0)
  }, undefined, 1.00)
  await withAiContext(principal, async () => {
    chargeAiBudget(null); chargeAiBudget(null)
    const b = currentRunBudget()!
    expect(b.spendUsd).toBe(0)
    expect(b.pricedCalls).toBe(0)
    expect(b.unpricedCalls).toBe(2)
  }, undefined, 1.00)
})

// ── Acceptance 1: tokens are actually captured ──────────────────────────────
// The reason this phase exists. Before it, ai_calls.prompt_tokens was null on all
// 2531 rows — the column was written, the number was never produced.

const okJson = (body: unknown) => Promise.resolve({
  ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(""),
} as any)

it("parses usage from an OpenAI-compatible response (qwen, openai, mistral)", async () => {
  process.env.DASHSCOPE_API_KEY = "test-only-not-a-real-key"
  const fetchMock = vi.fn(() => okJson({
    choices: [{ message: { content: "Answered." }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1234, completion_tokens: 56 },
  }))
  vi.stubGlobal("fetch", fetchMock)
  try {
    const { generateDetailed } = await import("./provider")
    const r = await generateDetailed("hi", { provider: "qwen", model: "qwen-plus", retries: 0 })
    expect(r.text).toBe("Answered.")
    expect(r.usage).toEqual({ promptTokens: 1234, outputTokens: 56 })
    // And the whole point: that figure prices into real money.
    expect(costOf(r.model, r.usage)).toBeGreaterThan(0)
  } finally {
    vi.unstubAllGlobals(); delete process.env.DASHSCOPE_API_KEY
  }
})

it("leaves usage absent when the provider reports none, rather than zero", async () => {
  process.env.DASHSCOPE_API_KEY = "test-only-not-a-real-key"
  vi.stubGlobal("fetch", vi.fn(() => okJson({
    choices: [{ message: { content: "Answered." }, finish_reason: "stop" }],
    // no usage block at all
  })))
  try {
    const { generateDetailed } = await import("./provider")
    const r = await generateDetailed("hi", { provider: "qwen", model: "qwen-plus", retries: 0 })
    expect(r.text).toBe("Answered.")
    expect(r.usage).toBeUndefined()
    expect(costOf(r.model, r.usage)).toBeNull()   // unpriceable, not free
  } finally {
    vi.unstubAllGlobals(); delete process.env.DASHSCOPE_API_KEY
  }
})

it("captures usage on an empty completion too", async () => {
  // An empty answer still consumed the prompt. A ceiling that ignored these would
  // let a loop of empty responses run free.
  process.env.DASHSCOPE_API_KEY = "test-only-not-a-real-key"
  vi.stubGlobal("fetch", vi.fn(() => okJson({
    choices: [{ message: { content: "" }, finish_reason: "length" }],
    usage: { prompt_tokens: 900, completion_tokens: 0 },
  })))
  try {
    const { generateDetailed } = await import("./provider")
    const r = await generateDetailed("hi", { provider: "qwen", model: "qwen-plus", retries: 0 })
    expect(r.text).toBe("")
    expect(r.usage).toEqual({ promptTokens: 900, outputTokens: 0 })
  } finally {
    vi.unstubAllGlobals(); delete process.env.DASHSCOPE_API_KEY
  }
})

it("charges nothing and throws nothing outside a run", () => {
  // Background jobs run without a context; telemetry must not crash them.
  expect(() => chargeAiBudget(1.23)).not.toThrow()
  expect(() => checkAiBudget(true)).not.toThrow()
  expect(currentRunBudget()).toBeNull()
})
