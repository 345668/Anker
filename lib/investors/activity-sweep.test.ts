import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ firms: [] as any[], lpFirms: [] as any[], updates: [] as string[], checked: 0 }))
vi.mock("@/lib/db", () => ({ sql: Object.assign(async (s: TemplateStringsArray, ...v: unknown[]) => {
  const q = s.join("?")
  if (q.includes("count(*)")) return [{ n: state.checked }]
  if (q.startsWith("UPDATE")) { state.updates.push(String(v[v.length - 1])); return [] }
  return q.includes("lp_firm_matches") ? state.lpFirms : state.firms
}, { unsafe: async () => [] }) }))
vi.mock("@/lib/ai/provider", () => ({ generate: vi.fn(async () => "{}") }))
import { runActivitySweep } from "./activity"

const firm = (i: number) => ({ id: `f${i}`, name: `Firm ${i}`, website: `https://firm${i}.example` })
const page = (text: string) => async () => ({ finalUrl: "https://x.example/", body: Buffer.from(`<html><body>${text}</body></html>`), contentType: "text/html" })
beforeEach(() => { state.firms = []; state.lpFirms = []; state.updates = []; state.checked = 0 })

describe("runActivitySweep: it must finish inside the platform's time limit", () => {
  it("runs several firms at once, not one after another", async () => {
    state.firms = Array.from({ length: 8 }, (_, i) => firm(i))
    let live = 0, peak = 0
    const deps = { fetchPage: async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 20)); live--; throw new Error("unreachable") }, ask: async () => "{}" }
    const r = await runActivitySweep({ limit: 8, deps, concurrency: 4 })
    expect(r).toMatchObject({ checked: 8, errors: 0, deferred: 0 }); expect(peak).toBeGreaterThan(1); expect(peak).toBeLessThanOrEqual(4)
    expect(state.updates).toHaveLength(8)
  })
  it("starts no new firm after the time budget and reports how many were left for tomorrow", async () => {
    state.firms = Array.from({ length: 10 }, (_, i) => firm(i))
    let t = 0
    const deps = { fetchPage: async () => { t += 100; throw new Error("slow site") }, ask: async () => "{}" }
    const r = await runActivitySweep({ limit: 10, deps, concurrency: 1, timeBudgetMs: 350, now: () => t })
    expect(r.checked).toBeLessThan(10); expect(r.checked + r.deferred).toBe(10); expect(r.deferred).toBeGreaterThan(0)
  })
  it("one firm that throws does not stop the others, and is counted", async () => {
    state.firms = [firm(1), firm(2), firm(3)]
    const deps = { fetchPage: page("short"), ask: async () => "{}" }
    const r = await runActivitySweep({ limit: 3, deps, concurrency: 2 })
    expect(r.checked).toBe(3)
  })
  it("does nothing when the daily budget is spent", async () => {
    state.checked = 10_000
    expect(await runActivitySweep({ limit: 60 })).toMatchObject({ checked: 0, deferred: 0, budgetLeft: 0 })
  })
  it("a model call that hangs is cut off after a minute and the firm is recorded as having no answer", async () => {
    vi.useFakeTimers()
    try {
      state.firms = [firm(1)]
      const long = "Portfolio update. ".repeat(40)
      const deps = { fetchPage: page(long), ask: () => new Promise<string>(() => {}) }
      const run = runActivitySweep({ limit: 1, deps, concurrency: 1, timeBudgetMs: 10 * 60_000 })
      await vi.advanceTimersByTimeAsync(61_000)
      expect(await run).toMatchObject({ checked: 1, errors: 0, withDate: 0 })
    } finally { vi.useRealTimers() }
  })
})

describe("runActivitySweep: the LPs funds are shown are checked too (docs/architecture/63 M6)", () => {
  it("takes turns between the founders' firms and the funds' LPs so neither starves the other, without checking a firm twice", async () => {
    state.firms = [firm(1), firm(2), firm(3), firm(4)]
    state.lpFirms = [firm(11), firm(12), firm(2)]            // firm 2 is on both lists
    const seen: string[] = []
    const deps = { fetchPage: async (u: string) => { seen.push(u); throw new Error("unreachable") }, ask: async () => "{}" }
    const r = await runActivitySweep({ limit: 5, deps, concurrency: 1 })
    expect(r).toMatchObject({ checked: 5, fromLp: 2 })        // two LP firms, in the first five turns
    expect(seen.map((u) => u.replace("https://", "").replace(".example", ""))).toEqual(["firm1", "firm11", "firm2", "firm12", "firm3"])
    expect(new Set(state.updates).size).toBe(5)
  })
  it("gives the whole budget to LPs when no founder run has been shown lately, and to founders when no LP run has", async () => {
    state.lpFirms = Array.from({ length: 6 }, (_, i) => firm(100 + i))
    const deps = { fetchPage: async () => { throw new Error("unreachable") }, ask: async () => "{}" }
    expect(await runActivitySweep({ limit: 4, deps, concurrency: 1 })).toMatchObject({ checked: 4, fromLp: 4 })
    state.lpFirms = []; state.firms = Array.from({ length: 3 }, (_, i) => firm(i)); state.updates = []
    expect(await runActivitySweep({ limit: 4, deps, concurrency: 1 })).toMatchObject({ checked: 3, fromLp: 0 })
  })
})
