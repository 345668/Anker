/**
 * Doc 34 — native tool calling. Acceptance §4.
 *
 * The one to read first is the schema-coverage invariant at the bottom: native
 * calling is only as safe as its schemas, and a tool without one silently gets
 * "accept any object". That test is why tool 52 cannot do that quietly.
 */
import { beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  generateText: vi.fn(),
  config: null as any,
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: Object.assign(() => [], { unsafe: () => [] }) }))
// The SDK is the only thing stubbed: everything else — the chain, recording,
// charging, the agent loop, policy — runs for real.
vi.mock("ai", async (orig) => ({ ...(await orig<any>()), generateText: state.generateText }))
vi.mock("@/lib/ai/runtime-config", async (orig) => ({
  ...(await orig<any>()),
  readRouterConfig: async () => state.config,
  readRouterConfigSync: () => state.config,
}))

import { nativeToolsEnabled } from "@/lib/ai/model-router"
import { ALL_TOOLS, toolsFor } from "./registry"
import { TOOL_SCHEMAS, inputSchemaFor } from "./tool-schemas"
import type { AiRouterConfig } from "@/lib/ai/runtime-config"

const cfg = (surfaces: any = {}): AiRouterConfig =>
  ({ surfaces, qwenApiKey: "k", enabled: {}, modelOverride: {} } as AiRouterConfig)

beforeEach(() => { state.generateText.mockReset(); state.config = cfg() })

// ── The switch: two gates, both required (acceptance 4) ─────────────────────

it("stays off unless the surface switches it on", () => {
  // claude-opus-5-5 declares tools: true, so only the surface gate is in play.
  expect(nativeToolsEnabled("assistant", "claude-opus-5-5", cfg())).toBe(false)
  expect(nativeToolsEnabled("assistant", "claude-opus-5-5",
    cfg({ assistant: { nativeTools: true } }))).toBe(true)
})

it("stays off for a model that does not declare the capability", () => {
  // The surface is on; the model is not capable. qwen-plus carries no tools flag.
  const on = cfg({ assistant: { nativeTools: true } })
  expect(nativeToolsEnabled("assistant", "qwen-plus", on)).toBe(false)
  // ...which is acceptance 4: it runs the JSON loop instead of failing.
})

it("stays off for an unknown model, and when no model was named", () => {
  const on = cfg({ assistant: { nativeTools: true } })
  expect(nativeToolsEnabled("assistant", "gpt-9-ultra", on)).toBe(false)
  // No model named means the tier router will choose and we cannot know its
  // capability here, so the conservative path is the one that works for all.
  expect(nativeToolsEnabled("assistant", null, on)).toBe(false)
})

it("stays off for a caller with no surface", () => {
  expect(nativeToolsEnabled(undefined, "claude-opus-5-5",
    cfg({ assistant: { nativeTools: true } }))).toBe(false)
})

it("refuses to be switched on by a non-boolean in config", async () => {
  // Same posture as userSelectable: a hand-edited truthy string must not move a
  // surface onto a different transport.
  const { readRouterConfig } = await vi.importActual<any>("@/lib/ai/runtime-config")
  expect(typeof readRouterConfig).toBe("function")
  expect(nativeToolsEnabled("assistant", "claude-opus-5-5",
    cfg({ assistant: { nativeTools: "yes" } }))).toBe(false)
})

// ── The provider entry point ────────────────────────────────────────────────

it("offers exactly the allowlisted tools, and executes none of them", async () => {
  state.generateText.mockResolvedValueOnce({
    text: "done", toolCalls: [], usage: { inputTokens: 10, outputTokens: 2 }, finishReason: "stop",
  })
  const { generateWithTools } = await import("@/lib/ai/provider")
  const specs = [
    { name: "web_search", description: "search", inputSchema: inputSchemaFor("web_search") },
    { name: "web_crawl", description: "crawl", inputSchema: inputSchemaFor("web_crawl") },
  ]
  const r = await generateWithTools([{ role: "user", content: "hi" }], specs,
    { provider: "qwen", model: "qwen-plus" })
  expect(r.text).toBe("done")
  const passed = state.generateText.mock.calls[0][0]
  expect(Object.keys(passed.tools).sort()).toEqual(["web_crawl", "web_search"])
  // Acceptance: described, never executed. An `execute` here would run tools
  // inside the provider layer, where the principal and the event log are not in
  // scope and tool.requested has not been logged yet.
  for (const t of Object.values(passed.tools) as any[]) {
    expect(t.execute).toBeUndefined()
  }
})

it("returns tool calls for the agent to run, rather than running them", async () => {
  state.generateText.mockResolvedValueOnce({
    text: "", finishReason: "tool-calls",
    toolCalls: [{ toolCallId: "c1", toolName: "web_search", input: { query: "anker" } }],
    usage: { inputTokens: 40, outputTokens: 9 },
  })
  const { generateWithTools } = await import("@/lib/ai/provider")
  const r = await generateWithTools([{ role: "user", content: "hi" }],
    [{ name: "web_search", description: "search", inputSchema: inputSchemaFor("web_search") }],
    { provider: "qwen", model: "qwen-plus" })
  expect(r.toolCalls).toEqual([{ id: "c1", name: "web_search", input: { query: "anker" } }])
  expect(r.text).toBe("")
})

it("captures usage on the native path, so phase 4 still measures it", async () => {
  state.generateText.mockResolvedValueOnce({
    text: "ok", toolCalls: [], usage: { inputTokens: 1000, outputTokens: 250 }, finishReason: "stop",
  })
  const { generateWithTools } = await import("@/lib/ai/provider")
  const r = await generateWithTools([{ role: "user", content: "hi" }], [],
    { provider: "qwen", model: "qwen-plus" })
  // Doc 34 §1.1: routing tools through an uninstrumented SDK path would have
  // lost this silently.
  expect(r.usage).toEqual({ promptTokens: 1000, outputTokens: 250 })
})

it("fails over to the next provider, exactly as the JSON path does", async () => {
  state.config = cfg()
  ;(state.config as any).qwenApiKey = "k"
  ;(state.config as any).mistralApiKey = "m"
  state.generateText
    .mockRejectedValueOnce(Object.assign(new Error("429 rate limited"), { statusCode: 429 }))
    .mockResolvedValueOnce({ text: "second provider answered", toolCalls: [], usage: undefined, finishReason: "stop" })
  const { generateWithTools } = await import("@/lib/ai/provider")
  const r = await generateWithTools([{ role: "user", content: "hi" }], [], {})
  expect(state.generateText.mock.calls.length).toBe(2)
  expect(r.text).toBe("second provider answered")
})

it("treats a tool-call-only turn as a success, not a failure", async () => {
  // A turn that produced no prose but did ask for a tool is the normal case.
  // Judging it by `text` would mark every tool step failed in ai_calls.
  state.generateText.mockResolvedValueOnce({
    text: "", finishReason: "tool-calls",
    toolCalls: [{ toolCallId: "c1", toolName: "web_search", input: {} }],
    usage: undefined,
  })
  const { generateWithTools } = await import("@/lib/ai/provider")
  const r = await generateWithTools([{ role: "user", content: "hi" }],
    [{ name: "web_search", description: "s", inputSchema: inputSchemaFor("web_search") }],
    { provider: "qwen", model: "qwen-plus" })
  expect(r.error).toBeNull()
  expect(r.toolCalls).toHaveLength(1)
})

// ── The invariant native calling rests on (acceptance 8) ────────────────────

it("has a real schema for every tool in the registry", () => {
  const tools = Object.keys(ALL_TOOLS)
  const missing = tools.filter((t) => !(t in TOOL_SCHEMAS))
  // A tool with no entry silently gets `{type:"object", additionalProperties:true}`
  // — "accept anything" — which on the native path means the model's arguments
  // reach executeTool unvalidated by shape. validateToolInput still guards
  // authority and depth, but the schema is the first gate and it must exist.
  expect(missing, `tools without a schema: ${missing.join(", ")}`).toEqual([])
  expect(tools.length).toBeGreaterThan(40)
})

it("has no schema for a tool that no longer exists", () => {
  const stale = Object.keys(TOOL_SCHEMAS).filter((s) => !(s in ALL_TOOLS))
  // A stale schema is a rename that half-landed: harmless today, and exactly the
  // kind of drift that makes the coverage check above pass while meaning less.
  expect(stale, `schemas with no tool: ${stale.join(", ")}`).toEqual([])
})

it("never offers a tool the principal cannot use", () => {
  // The allowlist filters before the model sees anything (doc 34 §1.4): the spec
  // list is built from toolsFor(p), so out of scope means not offered.
  const lp = {
    userId: "u", orgId: null, scopeKey: "lp:u", persona: "lp" as const,
    membership: null, lpMemberships: [], canWrite: false, readonly: true, allowedTools: null,
  }
  const offered = Object.keys(toolsFor(lp as any))
  expect(offered.length).toBeGreaterThan(0)
  expect(offered.length).toBeLessThan(Object.keys(ALL_TOOLS).length)
  expect(offered).not.toContain("send_outreach")
})

it("keeps executeTool's own guards, which a JSON Schema cannot express", async () => {
  const { executeTool } = await import("./registry")
  const p = {
    userId: "gp", orgId: "org-a", scopeKey: "org:org-a", persona: "vc" as const,
    membership: null, lpMemberships: [], canWrite: true, readonly: false, allowedTools: null,
  } as any
  // Prototype pollution and depth are not expressible in JSON Schema, so the
  // provider's validation cannot catch them. validateToolInput still runs on the
  // native path for exactly this reason (doc 34 §1.4).
  await expect(executeTool(p, "web_search", JSON.parse('{"query":"x","__proto__":{"a":1}}')))
    .rejects.toThrow(/Unsupported input key|not supported/)
  let deep: any = "x"
  for (let i = 0; i < 16; i++) deep = { nested: deep }
  await expect(executeTool(p, "web_search", { query: deep })).rejects.toThrow()
})

// ── The loop, end to end (acceptance 2, 3) ──────────────────────────────────

it("runs a native tool call: no catalogue in the prompt, events in order", async () => {
  state.config = cfg({ assistant: { nativeTools: true } })
  ;(state.config as any).qwenApiKey = "k"
  const order: string[] = []
  vi.doMock("./registry", async (orig) => ({
    ...(await orig<any>()),
    executeTool: vi.fn(async (_p: any, name: string) => {
      order.push(`execute:${name}`)
      return { observation: "SEARCH RESULT", artifacts: [] }
    }),
  }))
  state.generateText
    .mockResolvedValueOnce({
      text: "", finishReason: "tool-calls", usage: { inputTokens: 5, outputTokens: 1 },
      toolCalls: [{ toolCallId: "c1", toolName: "web_search", input: { query: "anker" } }],
    })
    .mockResolvedValueOnce({
      text: "Anker is a venture platform.", toolCalls: [],
      usage: { inputTokens: 9, outputTokens: 3 }, finishReason: "stop",
    })

  // The agent probes for a live provider before the loop, and that probe runs on
  // the BESPOKE path even for a native run — so the SDK stub alone is not enough.
  // Stubbed here rather than left to reach the network from a test.
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200, text: async () => "",
    json: async () => ({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }),
  })))
  const { runAssistant } = await import("./agent")
  const { withAiContext } = await import("./context")
  const principal = {
    userId: "gp", orgId: "org-a", scopeKey: "org:org-a", persona: "vc" as const,
    membership: null, lpMemberships: [], canWrite: true, readonly: false, allowedTools: null,
  } as any

  const res = await withAiContext(principal, () => runAssistant("find anker", {
    surface: "assistant", model: "claude-opus-5-5", maxSteps: 3,
    onEvent: (e) => order.push(e.kind),
  }))

  expect(res.answer).toBe("Anker is a venture platform.")
  // Acceptance 3: the intent is durable before the work happens (doc 28 §4.1).
  expect(order.indexOf("tool.requested")).toBeLessThan(order.indexOf("execute:web_search"))
  expect(order.indexOf("execute:web_search")).toBeLessThan(order.indexOf("tool.completed"))

  // Acceptance 2: the catalogue is gone from the prompt. In the JSON loop every
  // step carried all 51 tools as prose; here they travel as schemas instead.
  const system = String(state.generateText.mock.calls[0][0].messages[0].content)
  expect(system).not.toContain("web_crawl")
  expect(system).not.toContain("AVAILABLE TOOLS")
  // And the tool result re-enters the thread fenced as untrusted.
  const thread = state.generateText.mock.calls[1][0].messages
  expect(JSON.stringify(thread)).toContain("UNTRUSTED_TOOL_DATA")
  vi.unstubAllGlobals()
  vi.doUnmock("./registry")
})
