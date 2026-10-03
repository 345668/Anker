import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { withAiContext, checkAiBudget, runBatch, remainingMs, MAX_MODEL_CALLS } from "./context"

const principal = { userId: "u", orgId: "o", scopeKey: "org:o", persona: "founder" } as any
const run = <T,>(fn: () => Promise<T>) => withAiContext(principal, fn)

describe("run model-call budget", () => {
  it("still stops a loop that never ends", async () => {
    await run(async () => {
      for (let i = 0; i < MAX_MODEL_CALLS; i++) checkAiBudget(true)
      expect(() => checkAiBudget(true)).toThrow(/budget/)
    })
  })
  it("lets a 40-prompt batch run: one decision, not forty loop steps", async () => {
    await run(async () => {
      await runBatch(40, async () => { for (let i = 0; i < 40; i++) checkAiBudget(true) })
      // the loop steps around it still fit: 4 batch units + 7 steps
      for (let i = 0; i < 7; i++) checkAiBudget(true)
    })
  })
  it("still bounds the run: batches that together exceed the cap are refused", async () => {
    await run(async () => {
      await runBatch(40, async () => {})   // 4 units
      await runBatch(40, async () => {})   // 8
      await runBatch(40, async () => {})   // 12
      await runBatch(40, async () => {})   // 16
      await expect(runBatch(10, async () => {})).rejects.toThrow(/budget/)
    })
  })
  it("does not leave the batch flag set after it finishes or throws", async () => {
    await run(async () => {
      await expect(runBatch(10, async () => { throw new Error("boom") })).rejects.toThrow("boom")
      for (let i = 0; i < MAX_MODEL_CALLS - 1; i++) checkAiBudget(true)
      expect(() => { checkAiBudget(true); checkAiBudget(true) }).toThrow(/budget/)
    })
  })
  it("is a no-op outside a run", async () => {
    await expect(runBatch(40, async () => 7)).resolves.toBe(7)
  })
})

describe("one clock per request", () => {
  it("an explicit deadline governs the run and the time left is readable", async () => {
    await withAiContext(principal, async () => {
      expect(remainingMs()).toBeGreaterThan(50_000)
      expect(remainingMs()).toBeLessThanOrEqual(60_000)
    }, undefined, null, Date.now() + 60_000)
  })
  it("a call after the deadline is refused with the time-limit message", async () => {
    await withAiContext(principal, async () => {
      expect(() => checkAiBudget(true)).toThrow(/time limit/)
    }, undefined, null, Date.now() - 1)
  })
  it("outside a run there is no limit", () => { expect(remainingMs()).toBe(Infinity) })
})
