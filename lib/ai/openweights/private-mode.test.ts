import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
vi.mock("server-only", () => ({}))
const st = vi.hoisted(() => ({ flag: true, policy: {} as Record<string, string>, regions: [] as any[] }))
vi.mock("@/lib/db", () => ({ sql: async (s: TemplateStringsArray, ...v: unknown[]) => {
  const q = s.join("?")
  if (q.includes("FROM platform_flags")) return [{ enabled: st.flag }]
  if (q.includes("FROM workspace_data_policy")) return st.policy[String(v[0])] ? [{ preset: st.policy[String(v[0])] }] : []
  if (q.includes("FROM ai_subprocessors")) return st.regions
  return []
} }))
vi.mock("@/lib/assistant/context", () => ({ currentAiContext: () => undefined }))
import { filterChainForPolicy, presetFor, _resetPolicyCache, REFUSAL } from "@/lib/ai/data-policy"
import { applyLane, breaker, _resetLane } from "./lane"
import { MODEL_LICENCES } from "./licences"

/** The whole decision a call goes through, in the order generateDetailed runs it: the lane is placed by the routing policy, then the workspace's data policy filters. */
async function route(chain: string[], task: string, orgId: string) {
  const preset = await presetFor(orgId), placed = await applyLane(chain, task, preset)
  return filterChainForPolicy(placed, orgId)
}
const ENV = ["OPENWEIGHTS_BASE_URL", "OPENWEIGHTS_API_KEY", "OPENWEIGHTS_MODEL_FAST"] as const
let saved: Record<string, string | undefined> = {}
beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))
  process.env.OPENWEIGHTS_BASE_URL = "https://gw.example"; process.env.OPENWEIGHTS_API_KEY = "KEY"; process.env.OPENWEIGHTS_MODEL_FAST = "test/cleared-model"
  MODEL_LICENCES.push({ id: "test/cleared-model", family: "t", source: "s", licence: "test", commercial: true, checked: "2026-10-31", checksum: "x", note: "test only" })
  st.flag = true; st.policy = {}; st.regions = [{ slug: "qwen", region: "sg" }, { slug: "anthropic", region: "us" }]; _resetPolicyCache(); _resetLane(); for (let i = 0; i < 5; i++) breaker.success()
})
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }; const i = MODEL_LICENCES.findIndex((m) => m.id === "test/cleared-model"); if (i >= 0) MODEL_LICENCES.splice(i, 1) })

describe("the lane inside the data policy", () => {
  it("an ordinary workspace: a fast task tries the lane first and keeps its fallbacks; a writing task never touches it", async () => {
    expect((await route(["qwen", "anthropic"], "reply_classify", "o1")).chain).toEqual(["openweights", "qwen", "anthropic"])
    expect((await route(["qwen", "anthropic"], "deck_critique", "o1")).chain).toEqual(["qwen", "anthropic"])
  })
  it("with the flag off, or nothing configured, every chain is exactly what it was", async () => {
    st.flag = false; expect((await route(["qwen", "anthropic"], "reply_classify", "o1")).chain).toEqual(["qwen", "anthropic"])
    st.flag = true; delete process.env.OPENWEIGHTS_BASE_URL; _resetLane(); expect((await route(["qwen", "anthropic"], "reply_classify", "o1")).chain).toEqual(["qwen", "anthropic"])
  })
  it("a model nobody has cleared keeps the lane out, even with the flag on", async () => {
    process.env.OPENWEIGHTS_MODEL_FAST = "Qwen/Qwen3-8B"; _resetLane(); expect((await route(["qwen"], "reply_classify", "o1")).chain).toEqual(["qwen"])
  })
  it("PRIVATE MODE, host recorded as ours ('self'): only the lane is left, for every task, and nothing goes to a third party", async () => {
    st.policy.o1 = "no_external"; st.regions.push({ slug: "openweights", region: "self" })
    for (const task of ["reply_classify", "assistant_chat", "deck_critique"]) expect(await route(["qwen", "anthropic"], task, "o1")).toEqual({ chain: ["openweights"], refusal: null })
  })
  it("PRIVATE MODE fails closed when the lane is down: the person gets the policy's message and no other provider is tried", async () => {
    st.policy.o1 = "no_external"; st.regions.push({ slug: "openweights", region: "self" })
    for (let i = 0; i < 3; i++) breaker.failure()
    expect(await route(["qwen", "anthropic"], "assistant_chat", "o1")).toEqual({ chain: [], refusal: REFUSAL.no_external })
  })
  it("PRIVATE MODE refuses while the host's region is not recorded (no data-processing agreement yet), even though the lane is healthy", async () => {
    st.policy.o1 = "no_external"           // no ai_subprocessors row for openweights: region unknown
    expect(await route(["qwen"], "reply_classify", "o1")).toEqual({ chain: [], refusal: REFUSAL.no_external })
  })
  it("EU-only workspaces never get the lane unless its region is recorded as EU", async () => {
    st.policy.o2 = "eu_only"; expect((await route(["qwen", "openai"], "reply_classify", "o2")).refusal).toBe(REFUSAL.eu_only)
    st.regions.push({ slug: "openweights", region: "eu" }); _resetPolicyCache(); expect((await route(["qwen"], "reply_classify", "o2")).chain).toEqual(["openweights"])
  })
})
