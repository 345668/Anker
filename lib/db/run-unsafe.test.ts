import { describe, it, expect, vi } from "vitest"
import { runUnsafe } from "./index"

const rows = [{ one: 1 }]

describe("runUnsafe", () => {
  it("runs the query on a Neon-shaped driver, whose .unsafe only builds a fragment", async () => {
    // Neon v1: .query runs SQL; .unsafe returns an UnsafeRawSql object synchronously.
    const neonLike = {
      query: vi.fn(async () => rows),
      unsafe: vi.fn(() => ({ sql: "SELECT 1" })),
    }
    expect(await runUnsafe(neonLike, "SELECT 1 WHERE $1 = 1", [1])).toEqual(rows)
    expect(neonLike.query).toHaveBeenCalledWith("SELECT 1 WHERE $1 = 1", [1])
    expect(neonLike.unsafe).not.toHaveBeenCalled()
  })

  it("uses .unsafe on the local wrappers, which have no .query", async () => {
    const pgliteLike = { unsafe: vi.fn(async () => ({ rows })) }
    expect(await runUnsafe(pgliteLike, "SELECT 1")).toEqual(rows)
  })

  it("refuses a result that is not rows, instead of returning an empty list", async () => {
    await expect(runUnsafe({ unsafe: () => ({ sql: "SELECT 1" }) }, "SELECT 1")).rejects.toThrow(/neither rows/)
    await expect(runUnsafe({ query: async () => ({ fields: [] }) }, "SELECT 1")).rejects.toThrow(/neither rows/)
    await expect(runUnsafe({}, "SELECT 1")).rejects.toThrow(/neither .query nor .unsafe/)
  })
})
