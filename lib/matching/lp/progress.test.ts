import { describe, expect, it } from "vitest"
import { fromEngineEvent, throttled, type Progress } from "./progress"

describe("progress of a run", () => {
  it("places each engine phase on one 0 to 100 scale, in the order the work happens", () => {
    const at = (e: any) => fromEngineEvent(e)!.pct
    const order = [
      at({ phase: "loading", message: "Loading firms from database…" }), at({ phase: "loading", message: "Loading investors from database…" }),
      at({ phase: "scoring", entity: "firms", processed: 0, total: 20000 }), at({ phase: "scoring", entity: "firms", processed: 20000, total: 20000 }),
      at({ phase: "scoring", entity: "contacts", processed: 1000, total: 50000 }), at({ phase: "scoring", entity: "contacts", processed: 50000, total: 50000 }),
      at({ phase: "deduplication", merged: 3 }), at({ phase: "ai_enrichment", processed: 10, total: 200 }),
    ]
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order[0]).toBeGreaterThan(3)       // after "applying your rules"
    expect(order.at(-1)!).toBeLessThan(95)    // before "saving"
  })
  it("says what it is doing, with the counts", () => {
    expect(fromEngineEvent({ phase: "scoring", entity: "firms", processed: 1500, total: 21024 })!.label).toBe("Scoring firms (1,500 of 21,024)")
    expect(fromEngineEvent({ phase: "loading", message: "Loading investors from database…" })!.label).toBe("Loading people from the directory")
  })
  it("ignores events that do not move it, and never leaves 0 to 100", () => {
    expect(fromEngineEvent({ phase: "done", result: {} as any })).toBeNull()
    expect(fromEngineEvent({ phase: "filtering", total: 1, passed: 1 } as any)).toBeNull()
    expect(fromEngineEvent({ phase: "scoring", entity: "firms", processed: 5, total: 0 })!.pct).toBeLessThanOrEqual(40)
    expect(fromEngineEvent({ phase: "scoring", entity: "contacts", processed: 99999, total: 10 })!.pct).toBe(82)
  })
  it("writes at most every gap within a phase, always on a new phase, and flushes in order", async () => {
    const written: Progress[] = []
    let t = 0
    const w = throttled((p) => { written.push(p) }, 1000, () => t)
    const p = (phase: any, pct: number): Progress => ({ phase, label: phase, pct })
    w.push(p("scoring", 20)); t = 300; w.push(p("scoring", 25)); t = 900; w.push(p("scoring", 30))
    t = 1200; w.push(p("scoring", 35)); t = 1250; w.push(p("finishing", 84)); t = 1260; w.push(p("saving", 95))
    await w.flush()
    expect(written.map((x) => x.pct)).toEqual([20, 35, 84, 95])
  })
})
