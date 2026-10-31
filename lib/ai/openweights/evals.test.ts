import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { ask, runSuite, percentile, markdown, type Endpoint, type Suite } from "./evals"
import { SUITES } from "./evals-suites"

const EP: Endpoint = { baseUrl: "https://gw", apiKey: "KEY", model: "m", label: "candidate" }, REF: Endpoint = { ...EP, label: "reference", model: "ref" }
const replyTruth: Record<string, string> = {}
/** A fake chat endpoint: answers each prompt through `answer(prompt, model)`; records nothing secret. */
const fake = (answer: (prompt: string, model: string) => string | null, delayMs = 0): any => async (_u: string, init: any) => {
  const b = JSON.parse(init.body); if (delayMs) await new Promise((r) => setTimeout(r, delayMs)); const t = answer(b.messages[0].content, b.model)
  return t === null ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: t } }] }) }
}
const urlSuite = SUITES.find((s) => s.task === "url_classify")!, replySuite = SUITES.find((s) => s.task === "reply_classify")!, jsonSuite = SUITES.find((s) => s.task === "structured_json")!
const urlOracle = (p: string) => { const u = p.split("URL: ")[1]; return JSON.stringify({ label: /team/.test(u) ? "team" : /portfolio|investments/.test(u) ? "portfolio" : /about/.test(u) ? "about" : /contact/.test(u) ? "contact" : /news/.test(u) ? "news" : "homepage" }) }

describe("the suites", () => {
  it("replies use the production prompt, with the human's label per case; every case is answerable by its own scorer", () => {
    expect(replySuite.cases).toHaveLength(10); expect(replySuite.cases[0].prompt).toContain("CLASSIFICATION RULES"); expect(replySuite.cases[0].prompt).toContain("THEIR REPLY:"); expect(replySuite.cases[0].prompt).toContain("Can you send the deck")
    expect(replySuite.cases[0].score('{"classification":"INTERESTED","draft":"Great, here is my calendar."}')).toMatchObject({ valid: true, correct: true, label: "INTERESTED" })
    expect(replySuite.cases[4].score('{"classification":"INTERESTED","draft":"x"}')).toMatchObject({ valid: true, correct: false })
    expect(replySuite.cases[0].score('{"classification":"MAYBE","draft":"x"}').valid).toBe(false); expect(replySuite.cases[0].score("not json").valid).toBe(false); expect(replySuite.cases[0].score(`{"classification":"INTERESTED","draft":"${"x".repeat(321)}"}`)).toMatchObject({ valid: false, note: "draft_over_320" })
    expect(jsonSuite.cases[0].score('{"name":"L","city":"B","founded":2023,"employees":14,"funding_eur":1500000}').valid).toBe(true); expect(jsonSuite.cases[0].score('{"name":"L","founded":"2023"}').valid).toBe(false)
  })
})
describe("running a suite", () => {
  it("a model that answers every case correctly meets the bar; latency percentiles are reported", async () => {
    const { report, runs } = await runSuite(urlSuite, EP, REF, fake(urlOracle, 2))
    expect(report).toMatchObject({ task: "url_classify", n: 8, validRate: 1, accuracy: 1, agreement: 1, passed: true, failures: {}, misses: [] }); expect(report.p95).toBeGreaterThanOrEqual(report.p50); expect(runs.every((r) => r.ok)).toBe(true)
  })
  it("wrong labels lower accuracy and name the misses; a suite below its bar is not passed", async () => {
    const f = fake((p, m) => (m === "m" ? JSON.stringify({ label: "homepage" }) : urlOracle(p)))
    const { report } = await runSuite(urlSuite, EP, REF, f); expect(report.accuracy).toBeCloseTo(1 / 8); expect(report.agreement).toBeCloseTo(1 / 8); expect(report.passed).toBe(false); expect(report.misses).toHaveLength(7)
  })
  it("invalid output, an HTTP error, an empty answer and a timeout are counted by kind", async () => {
    let n = 0; const f: any = async (...a: any[]) => { n++; if (n === 1) throw Object.assign(new Error("t"), { name: "TimeoutError" }); if (n === 2) return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "" } }] }) }; if (n === 3) return fake(() => null)(...a); if (n === 4) return fake(() => "not json at all")(...a); return fake(urlOracle)(...a) }
    const { report } = await runSuite(urlSuite, EP, undefined, f, 1); expect(report.failures).toEqual({ timeout: 1, empty: 1, http_503: 1, no_valid_label: 1 }); expect(report.validRate).toBe(0.5); expect(report.agreement).toBeNull(); expect(report.passed).toBe(false)
  })
  it("a suite with only a validity bar needs no truth", async () => {
    const { report } = await runSuite(jsonSuite, EP, undefined, fake(() => '{"name":"X","city":"Y","founded":null,"employees":null,"funding_eur":null}')); expect(report).toMatchObject({ validRate: 1, accuracy: null, passed: true })
  })
  it("the key goes in headers only, never the body", async () => {
    let seen: any; await ask(EP, urlSuite.cases[0], (async (_u: string, init: any) => { seen = init; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"label":"about"}' } }] }) } }) as any)
    expect(seen.headers["x-api-key"]).toBe("KEY"); expect(seen.body).not.toContain("KEY"); expect(JSON.parse(seen.body)).toMatchObject({ temperature: 0, response_format: { type: "json_object" } })
  })
})
describe("the report", () => {
  it("percentiles, and a table a person can read with the bar stated and the word NOT met where it was not", async () => {
    expect(percentile([5, 1, 9, 3, 7], 50)).toBe(5); expect(percentile([], 95)).toBe(0); expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10)
    const a = (await runSuite(urlSuite, EP, REF, fake(urlOracle))).report, b = (await runSuite(urlSuite, EP, REF, fake((p, m) => (m === "m" ? "{}" : urlOracle(p))))).report
    const md = markdown([a, b], "2026-10-31"); expect(md).toContain("# Open-weights evaluation, 2026-10-31"); expect(md).toContain("| url_classify | candidate | 8 | 100% | 100% | 100%"); expect(md).toContain("NOT met"); expect(md).toContain("OPENWEIGHTS_EVAL_PASSED")
  })
})
void replyTruth
