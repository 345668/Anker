// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { enabled, within, firmNames } from "./budget"

/**
 * Acceptance of doc 59 R5: "the first all-pairs style regression added on purpose is caught." This is the shape of loop that took founder matching down on 2026-10-03 (every firm compared
 * with every other; 4,000 firms took 24 s, the real directory took minutes), run over the full 21,000 names under the same 1,000 ms budget the real clustering has. If this stops
 * failing, the suite has stopped protecting anything. (The comparison here is cheap on purpose: the real one was far more expensive per pair, so it would fail by more.)
 */
describe.skipIf(!enabled())("the budget catches the regression it exists for", () => {
  it("an all-pairs pass over the 21,000 firm names exceeds the budget", async () => {
    const names = firmNames()
    await expect(within("DELIBERATE all-pairs over 21,000 firm names", 1_000, () => { let n = 0; for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (names[i].slice(0, 3) === names[j].slice(0, 3)) n++; return n })).rejects.toThrow(/BUDGET EXCEEDED/)
  }, 300_000)
})
