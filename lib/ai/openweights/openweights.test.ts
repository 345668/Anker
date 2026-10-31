import { describe, expect, it, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))
const st = vi.hoisted(() => ({ flag: true }))
vi.mock("@/lib/db", () => ({ sql: async () => [{ enabled: st.flag }] }))
import { createBreaker } from "./breaker"
import { clearance, MODEL_LICENCES, type ModelLicence } from "./licences"
import { planChain, FAST_TASKS } from "./policy"
import { laneConfig, modelFor, status, runLane, breaker, applyLane, _resetLane } from "./lane"

const CLEARED: ModelLicence[] = [{ id: "m-fast", family: "f", source: "s", licence: "Apache-2.0", commercial: true, checked: "2026-10-31", checksum: "abc", note: "" }]
const CFG = laneConfig({ OPENWEIGHTS_BASE_URL: "https://gw.example/", OPENWEIGHTS_API_KEY: "KEY", OPENWEIGHTS_MODEL_FAST: "m-fast", OPENWEIGHTS_EVAL_PASSED: "campaign_draft, deck_critique" })

describe("the licence register", () => {
  it("ships with nothing cleared: no candidate is usable until a person records reading the licence", () => {
    expect(MODEL_LICENCES.length).toBeGreaterThan(0); for (const m of MODEL_LICENCES) { expect(m.commercial).toBe(false); expect(clearance(m.id).ok).toBe(false) }
  })
  it("a model is cleared only when listed, marked commercial AND dated; each refusal says why", () => {
    expect(clearance("m-fast", CLEARED)).toMatchObject({ ok: true, reason: null }); expect(clearance(undefined).reason).toMatch(/No open-weights model/); expect(clearance("other", CLEARED).reason).toMatch(/not in the licence register/)
    expect(clearance("m-fast", [{ ...CLEARED[0], commercial: false }]).reason).toMatch(/not been cleared/); expect(clearance("m-fast", [{ ...CLEARED[0], checked: "" }]).reason).toMatch(/Nobody has recorded reading/)
  })
})
describe("the circuit breaker", () => {
  it("opens after three failures, lets one trial through after the cool-down, closes on success, re-opens on failure; a cold start changes nothing", () => {
    const b = createBreaker({ threshold: 3, coolMs: 1000 })
    b.failure(0); b.failure(0); expect(b.allow(0)).toBe(true); b.failure(0); expect(b.state(10)).toBe("open"); expect(b.allow(10)).toBe(false)
    expect(b.state(1000)).toBe("half-open"); expect(b.allow(1000)).toBe(true); expect(b.allow(1001)).toBe(false)      // only one trial
    b.failure(1002); expect(b.state(1500)).toBe("open"); expect(b.state(2003)).toBe("half-open"); b.allow(2003); b.success(); expect(b.state(2004)).toBe("closed"); expect(b.failures()).toBe(0)
    const c = createBreaker({ threshold: 2, coolMs: 100 }); c.failure(0); c.cold(); expect(c.failures()).toBe(1); expect(c.state(1)).toBe("closed")
  })
})
describe("the routing policy", () => {
  const on = { flagOn: true, usable: true, healthy: true }
  it("fast tasks go to open weights first; other tasks never do, unless their evaluation passed", () => {
    for (const t of FAST_TASKS) expect(planChain(["qwen", "anthropic"], t, on)).toEqual(["openweights", "qwen", "anthropic"])
    expect(planChain(["qwen"], "deck_critique", on)).toEqual(["qwen"]); expect(planChain(["qwen"], "assistant_chat", on)).toEqual(["qwen"]); expect(planChain(["qwen"], undefined, on)).toEqual(["qwen"])
    expect(planChain(["qwen"], "campaign_draft", { ...on, evalPassed: ["campaign_draft"] })).toEqual(["openweights", "qwen"])
  })
  it("the lane is removed when the flag is off, it is unusable or the breaker is open, and a chain without it is untouched", () => {
    for (const s of [{ ...on, flagOn: false }, { ...on, usable: false }, { ...on, healthy: false }]) expect(planChain(["openweights", "qwen"], "reply_classify", s)).toEqual(["qwen"])
    const c = ["qwen", "anthropic"]; expect(planChain(c, "reply_classify", { ...on, flagOn: false })).toBe(c)
  })
  it("private mode (the no_external data policy) puts the lane first for EVERY task, so the policy filter leaves it alone", () => {
    expect(planChain(["qwen", "anthropic"], "assistant_chat", { ...on, preset: "no_external" })).toEqual(["openweights", "qwen", "anthropic"])
    expect(planChain(["qwen"], "deck_critique", { ...on, preset: "eu_only" })).toEqual(["qwen"])         // eu_only is a different promise: not the private lane
  })
})
describe("the lane", () => {
  beforeEach(() => { st.flag = true; _resetLane(); for (let i = 0; i < 5; i++) breaker.success() })
  it("reads its settings, picks the model by tier, and reports why it is not usable, in order", () => {
    expect(CFG).toMatchObject({ baseUrl: "https://gw.example", modelFast: "m-fast", modelBalanced: "m-fast", evalPassed: ["campaign_draft", "deck_critique"], timeoutMs: 45000 }); expect(modelFor(CFG, "fast")).toBe("m-fast"); expect(modelFor(CFG, "deep")).toBe("m-fast")
    expect(status(CFG, false).reason).toMatch(/flag ai_openweights is off/); expect(status(laneConfig({}), true).reason).toMatch(/not set/); expect(status(CFG, true).reason).toMatch(/not in the licence register/)
    expect(laneConfig({ OPENWEIGHTS_TIMEOUT_MS: "999999" }).timeoutMs).toBe(120000); expect(laneConfig({ OPENWEIGHTS_TIMEOUT_MS: "10" }).timeoutMs).toBe(5000)
  })
  it("sends one chat completion with the key in x-api-key and returns text and token counts; the key is not in the body", async () => {
    const calls: any[] = []; const f: any = async (url: string, init: any) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: " Hello " } }], usage: { prompt_tokens: 12, completion_tokens: 3 } }) } }
    const r = await runLane({ prompt: "P", model: "m-fast", max: 50, temp: 0.2, json: true }, CFG, f)
    expect(r).toMatchObject({ text: "Hello", error: null, usage: { promptTokens: 12, outputTokens: 3 } }); expect(calls[0].url).toBe("https://gw.example/v1/chat/completions"); expect(calls[0].init.headers["x-api-key"]).toBe("KEY")
    expect(JSON.parse(calls[0].init.body)).toEqual({ model: "m-fast", messages: [{ role: "user", content: "P" }], max_tokens: 50, temperature: 0.2, response_format: { type: "json_object" } }); expect(calls[0].init.body).not.toContain("KEY")
  })
  it("failures count against the breaker, three open it and stop calling; a timeout is a cold start and does not", async () => {
    const bad: any = async () => ({ ok: false, status: 503, json: async () => ({}) }); let n = 0; const counted: any = async (...a: any[]) => { n++; return bad(...a) }
    for (let i = 0; i < 3; i++) expect((await runLane({ prompt: "P", model: "m", max: 5, temp: 0 }, CFG, counted)).status).toBe(503)
    expect((await runLane({ prompt: "P", model: "m", max: 5, temp: 0 }, CFG, counted)).error).toMatch(/paused/); expect(n).toBe(3)
    for (let i = 0; i < 5; i++) breaker.success()
    const slow: any = async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }) }
    const r = await runLane({ prompt: "P", model: "m", max: 5, temp: 0 }, CFG, slow); expect(r).toMatchObject({ cold: true }); expect(r.error).toMatch(/starting up/); expect(breaker.failures()).toBe(0)
    const empty: any = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "" } }] }) }); expect((await runLane({ prompt: "P", model: "m", max: 5, temp: 0 }, CFG, empty)).error).toMatch(/empty/)
  })
  it("applyLane leaves every existing chain alone when nothing is configured", async () => {
    const before = process.env.OPENWEIGHTS_BASE_URL; delete process.env.OPENWEIGHTS_BASE_URL
    const chain = ["qwen", "anthropic"]; expect(await applyLane(chain, "reply_classify", "standard")).toBe(chain); if (before) process.env.OPENWEIGHTS_BASE_URL = before
  })
})
