import { describe, it, expect, beforeEach } from "vitest"
import {
  qwenLanes, laneModels, lanesConfigured, isFreeAllowanceExhausted, isLaneFailure,
  markQwenExhausted, isQwenExhausted, clearQwenExhausted, qwenLaneStatus, isFreeTierModel,
} from "./qwen-lanes"
import { classifyFailure } from "./failure"
import { MODEL_CATALOG } from "./model-catalog"

const FREE = "k-free", PLAN = "k-plan"

describe("qwen lanes", () => {
  beforeEach(() => clearQwenExhausted())

  it("is a single default lane when no lane variable is set", () => {
    const l = qwenLanes({ qwenApiKey: "saved" }, {})
    expect(l.map((x) => x.id)).toEqual(["default"])
    expect(lanesConfigured({})).toBe(false)
    expect(laneModels(l[0], ["a", "b"], {}, {})).toEqual(["a", "b"])
  })

  it("orders free before plan and uses the plan endpoint for the plan key", () => {
    const env = { QWEN_FREE_API_KEY: FREE, QWEN_PLAN_API_KEY: PLAN }
    const l = qwenLanes(null, env)
    expect(l.map((x) => x.id)).toEqual(["free", "plan"])
    expect(l[0].baseUrl).toContain("compatible-mode")
    expect(l[1].baseUrl).toBe("https://coding-intl.dashscope.aliyuncs.com/v1")
    expect(l[0].apiKey).toBe(FREE)
  })

  it("routes an sk-sp- key to the plan endpoint wherever it is stored", () => {
    const saved = qwenLanes({ qwenApiKey: "sk-sp-abc" }, {})
    expect(saved.map((x) => x.id)).toEqual(["plan"])
    expect(saved[0].baseUrl).toContain("coding-intl")
    const env = qwenLanes(null, { DASHSCOPE_API_KEY: "sk-sp-abc" })
    expect(env.map((x) => x.id)).toEqual(["plan"])
    const both = qwenLanes({ qwenApiKey: "sk-sp-abc" }, { QWEN_FREE_API_KEY: "sk-ws-x" })
    expect(both.map((x) => x.id)).toEqual(["free", "plan"])
    expect(both[0].apiKey).toBe("sk-ws-x")
  })

  it("free lane keeps only free-tier models", () => {
    const free = MODEL_CATALOG.find((m) => m.provider === "dashscope" && m.freeTier)!.id
    const [lane] = qwenLanes(null, { QWEN_FREE_API_KEY: FREE })
    expect(isFreeTierModel(free)).toBe(true)
    expect(laneModels(lane, [free, "not-a-free-model"], {}, {})).toEqual([free])
  })

  it("plan lane uses its own tier list and rejects unserved explicit picks", () => {
    const env = { QWEN_PLAN_API_KEY: PLAN, QWEN_PLAN_MODEL_BALANCED: "qwen3.6-plus" }
    const plan = qwenLanes(null, env).find((x) => x.id === "plan")!
    // The plan's own models for the tier first; behind them the neighbouring tiers' plan models.
    expect(laneModels(plan, ["whatever"], { task: "assistant_chat" as never }, { ...env, QWEN_PLAN_MODEL_DEEP: "glm-5" })).toEqual(["glm-5", "qwen3.6-plus"].concat(["qwen3.7-plus"]))
    expect(laneModels(plan, ["whatever"], { task: "assistant_chat" as never }, { ...env, QWEN_PLAN_MODEL_DEEP: "glm-5", QWEN_TIER_SPILL: "off" })).toEqual(["glm-5"])
    expect(laneModels(plan, [], { model: "qwen-turbo" }, env)).toEqual([])
    expect(laneModels(plan, [], { model: "glm-5" }, env)).toEqual(["glm-5"])
  })

  it("remembers exhausted models per lane and expires them", () => {
    markQwenExhausted("free", "m1", 1000)
    expect(isQwenExhausted("free", "m1", 2000)).toBe(true)
    expect(isQwenExhausted("plan", "m1", 2000)).toBe(false)
    expect(isQwenExhausted("free", "m1", 1000 + 31 * 60_000)).toBe(false)
    markQwenExhausted("free", "m2")
    const st = qwenLaneStatus(null, { QWEN_FREE_API_KEY: FREE })
    expect(st.lanes[0].exhausted.map((e) => e.model)).toEqual(["m2"])
    expect(JSON.stringify(st)).not.toContain(FREE)
  })

  it("tells a spent free allowance from a plain rate limit", () => {
    expect(isFreeAllowanceExhausted(403, "HTTP 403: AllocationQuota.FreeTierOnly: The free tier of the model has been exhausted")).toBe(true)
    expect(isFreeAllowanceExhausted(429, "Throttling.AllocationQuota: Free allocated quota exceeded")).toBe(true)
    expect(isFreeAllowanceExhausted(429, "HTTP 429: Requests rate limit exceeded, please try again later")).toBe(false)
    expect(isFreeAllowanceExhausted(401, "Incorrect API key provided")).toBe(false)
    expect(isLaneFailure("HTTP 401: Incorrect API key provided")).toBe(true)
    expect(isLaneFailure("HTTP 500: boom")).toBe(false)
  })

  it("reads a failed call as: this model's allowance, this model is closed to the key, the whole key, or just a bad moment", async () => {
    const { classifyQwenFault } = await import("./qwen-lanes")
    // The wording DashScope used when a model's free use ran out for the account.
    expect(classifyQwenFault(403, "HTTP 403: Access to model denied. Please make sure you are eligible for using the model.")).toBe("model_denied")
    expect(classifyQwenFault(403, "HTTP 403: AllocationQuota.FreeTierOnly: The free tier of the model has been exhausted")).toBe("allowance")
    expect(classifyQwenFault(429, "Throttling.AllocationQuota: Free allocated quota exceeded")).toBe("allowance")
    expect(classifyQwenFault(400, "The model `qwen3-foo` does not exist or you do not have access to it")).toBe("model_denied")
    expect(classifyQwenFault(404, "model not found")).toBe("model_denied")
    expect(classifyQwenFault(404, "Not Found")).toBe("transient")           // a wrong URL must not close every model for hours
    expect(classifyQwenFault(401, "Incorrect API key provided")).toBe("lane")
    expect(classifyQwenFault(403, "Forbidden")).toBe("lane")
    expect(classifyQwenFault(400, "Arrearage: your account is not in good standing")).toBe("lane")
    expect(classifyQwenFault(429, "Requests rate limit exceeded, please try again later")).toBe("transient")
    expect(classifyQwenFault(500, "internal error")).toBe("transient")
    expect(classifyQwenFault(undefined, "request timed out (120s)")).toBe("transient")
  })

  it("remembers a closed model far longer than a spent allowance, and says why", () => {
    markQwenExhausted("free", "spent", 0, "allowance")
    markQwenExhausted("free", "closed", 0, "model_denied")
    expect(isQwenExhausted("free", "spent", 31 * 60_000)).toBe(false)     // an allowance renews
    expect(isQwenExhausted("free", "closed", 31 * 60_000)).toBe(true)     // a closed model stays closed for hours
    expect(isQwenExhausted("free", "closed", 3 * 60 * 60_000)).toBe(false)
    markQwenExhausted("free", "now-closed", Date.now(), "model_denied")
    const st = qwenLaneStatus(null, { QWEN_FREE_API_KEY: FREE })
    expect(st.lanes[0].exhausted.find((e) => e.model === "now-closed")?.reason).toBe("model_denied")
  })

  it("holds a refused model for hours only once another model has answered; if none does, it is the key and the hold is a minute", async () => {
    const { qwenWalk } = await import("./qwen-lanes")
    // Every model refused in one request: the key or the endpoint is wrong, and fixing it must not wait for a long hold to run out.
    const nobody = qwenWalk()
    nobody.refused("free", "a", 0); nobody.refused("free", "b", 0)
    expect(isQwenExhausted("free", "a", 30_000)).toBe(true)
    expect(isQwenExhausted("free", "a", 61_000)).toBe(false)
    // A later model answered: the key works, the refusals were about those models.
    const some = qwenWalk()
    some.refused("free", "c", 0); some.refused("free", "d", 0); some.answered(0)
    expect(isQwenExhausted("free", "c", 61_000)).toBe(true)
    expect(isQwenExhausted("free", "d", 60 * 60_000)).toBe(true)
    expect(isQwenExhausted("free", "d", 3 * 60 * 60_000)).toBe(false)
  })

  it("classifies free-tier exhaustion as quota, not a bad key", () => {
    expect(classifyFailure({ status: 403, error: "AllocationQuota.FreeTierOnly" })).toBe("quota_exhausted")
    expect(classifyFailure({ status: 403, error: "Access denied" })).toBe("credentials_invalid")
    expect(classifyFailure({ status: 429, error: "Requests rate limit exceeded" })).toBe("rate_limited")
  })
})

describe("qwen lane keys saved in the shared config (SAIL fields)", () => {
  it("builds both lanes from the saved free and plan keys, plan on its own endpoint", () => {
    const l = qwenLanes({ qwenFreeApiKey: "sk-ws-1", qwenPlanApiKey: "sk-sp-1" }, {})
    expect(l.map((x) => x.id)).toEqual(["free", "plan"])
    expect(l[0].apiKey).toBe("sk-ws-1")
    expect(l[1].baseUrl).toContain("coding-intl")
    expect(lanesConfigured({}, { qwenFreeApiKey: "sk-ws-1" })).toBe(true)
  })
})
