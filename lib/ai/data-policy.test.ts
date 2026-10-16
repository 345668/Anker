import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ policy: {} as Record<string, string>, regions: [] as any[], orgId: null as string | null, fail: false }))
vi.mock("@/lib/db", () => ({ sql: async (s: TemplateStringsArray, ...v: unknown[]) => {
  if (state.fail) throw new Error("db down")
  const q = s.join("?")
  if (q.includes("FROM workspace_data_policy")) return state.policy[String(v[0])] ? [{ preset: state.policy[String(v[0])] }] : []
  if (q.includes("FROM ai_subprocessors")) return state.regions
  return []
} }))
vi.mock("@/lib/assistant/context", () => ({ currentAiContext: () => (state.orgId ? { principal: { orgId: state.orgId } } : undefined) }))
import { regionAllowed, filterChainForPolicy, assertProviderAllowed, DataPolicyError, _resetPolicyCache, REFUSAL } from "./data-policy"

beforeEach(() => { state.policy = {}; state.regions = [{ slug: "qwen", region: "sg" }, { slug: "mistral", region: "eu" }, { slug: "openai", region: "us" }, { slug: "ollama", region: "self" }]; state.orgId = null; state.fail = false; _resetPolicyCache() })

describe("regionAllowed", () => {
  it("standard allows everything; eu_only allows the EU and our own servers; no_external only our own", () => {
    for (const r of ["eu", "us", "sg", "self", "other", "unknown"] as const) expect(regionAllowed("standard", r)).toBe(true)
    expect(["eu", "us", "sg", "self", "other", "unknown"].map((r) => regionAllowed("eu_only", r as any))).toEqual([true, false, false, true, false, false])
    expect(["eu", "us", "sg", "self", "other", "unknown"].map((r) => regionAllowed("no_external", r as any))).toEqual([false, false, false, true, false, false])
  })
})

describe("filterChainForPolicy", () => {
  it("leaves the chain alone for a workspace with no policy, and outside any workspace", async () => {
    expect(await filterChainForPolicy(["qwen", "openai"], "o1")).toEqual({ chain: ["qwen", "openai"], refusal: null })
    expect(await filterChainForPolicy(["qwen"])).toEqual({ chain: ["qwen"], refusal: null })
  })
  it("EU only keeps the EU provider and drops the rest, in order", async () => {
    state.policy.o1 = "eu_only"
    expect(await filterChainForPolicy(["qwen", "mistral", "openai", "ollama"], "o1")).toEqual({ chain: ["mistral", "ollama"], refusal: null })
  })
  it("fails closed with the message when nothing is allowed", async () => {
    state.policy.o1 = "eu_only"
    expect(await filterChainForPolicy(["qwen", "openai"], "o1")).toEqual({ chain: [], refusal: REFUSAL.eu_only })
    state.policy.o2 = "no_external"
    expect((await filterChainForPolicy(["mistral", "qwen"], "o2")).refusal).toBe(REFUSAL.no_external)
  })
  it("takes the workspace from the ambient principal", async () => {
    state.policy.o1 = "eu_only"; state.orgId = "o1"
    expect((await filterChainForPolicy(["qwen"])).refusal).toBe(REFUSAL.eu_only)
    state.orgId = "o9"; _resetPolicyCache()
    expect((await filterChainForPolicy(["qwen"])).refusal).toBeNull()
  })
  it("a provider whose region is unknown is refused under a restrictive preset", async () => {
    state.policy.o1 = "eu_only"; state.regions = []
    expect((await filterChainForPolicy(["gemini"], "o1")).refusal).toBe(REFUSAL.eu_only)
  })
  it("uses the built-in regions if the register cannot be read, and treats an unreadable policy as standard", async () => {
    state.policy.o1 = "eu_only"; _resetPolicyCache()
    expect((await filterChainForPolicy(["mistral"], "o1")).refusal).toBeNull()
    state.fail = true; _resetPolicyCache()
    expect((await filterChainForPolicy(["qwen"], "o1")).refusal).toBeNull()
  })
  it("assertProviderAllowed throws DataPolicyError for a direct caller", async () => {
    state.policy.o1 = "eu_only"
    await expect(assertProviderAllowed("qwen", "o1")).rejects.toBeInstanceOf(DataPolicyError)
    await expect(assertProviderAllowed("mistral", "o1")).resolves.toBeUndefined()
  })
})
