import { describe, it, expect, vi, beforeEach } from "vitest"

const inserts: unknown[][] = []
vi.mock("@/lib/db", () => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    inserts.push(values)
    return Promise.resolve([])
  }),
}))

import { diff, redact, recordChange, scopeKey } from "./record-change"

beforeEach(() => { inserts.length = 0 })

describe("diff", () => {
  it("records old and new for every changed field", () => {
    expect(diff({ status: "draft", options: 10000 }, { status: "granted", options: 12000 }))
      .toEqual({ status: ["draft", "granted"], options: [10000, 12000] })
  })

  it("treats a numeric string and a number as the same value", () => {
    // The drivers return NUMERIC columns as strings. Without this, re-saving an
    // untouched grant would record its strike price as having changed.
    expect(diff({ strike_price: "0.25" }, { strike_price: 0.25 })).toEqual({})
  })

  it("ignores bookkeeping the database maintains", () => {
    expect(diff({ status: "draft", updated_at: "2026-01-01" }, { status: "draft", updated_at: "2026-09-21" }))
      .toEqual({})
  })

  it("reports every field of a created record as new", () => {
    expect(diff(null, { options: 5000 })).toEqual({ options: [null, 5000] })
  })

  it("reports every field of a deleted record as removed", () => {
    expect(diff({ options: 5000 }, null)).toEqual({ options: [5000, null] })
  })
})

describe("redact", () => {
  it("never stores a secret, even inside a snapshot", () => {
    const out = redact({ id: "g1", access_token: "sk-live", webhook_secret: "x", apiKey: "y", grantee_name: "Ada" })
    expect(out).toEqual({ id: "g1", access_token: "[redacted]", webhook_secret: "[redacted]", apiKey: "[redacted]", grantee_name: "Ada" })
  })
})

describe("recordChange", () => {
  const base = {
    actor: { userId: "u1", email: "founder@acme.test" },
    scope: { type: "company" as const, id: "c1" },
    target: { type: "option_grant", id: "g1", label: "Ada Lovelace" },
  }

  it("writes a created record with a null `before`", async () => {
    await recordChange({ ...base, action: "option_grant.created", before: null, after: { options: 5000 } })
    expect(inserts).toHaveLength(1)
    const values = inserts[0]
    expect(values).toContain("company:c1")
    const changes = JSON.parse(values[values.length - 1] as string)
    expect(changes.before).toBeNull()
    expect(changes.diff).toEqual({ options: [null, 5000] })
  })

  it("does not record a save that changed nothing", async () => {
    // A trail full of no-op saves hides the real changes in it.
    await recordChange({
      ...base, action: "option_grant.updated",
      before: { options: "5000", updated_at: "a" }, after: { options: 5000, updated_at: "b" },
    })
    expect(inserts).toHaveLength(0)
  })

  it("keeps the deleted row recoverable from `before`", async () => {
    await recordChange({ ...base, action: "option_grant.deleted", before: { options: 5000, grantee_name: "Ada" }, after: null })
    const changes = JSON.parse(inserts[0][inserts[0].length - 1] as string)
    expect(changes.before).toEqual({ options: 5000, grantee_name: "Ada" })
    expect(changes.after).toBeNull()
  })

  it("retries a transient failure instead of losing the record", async () => {
    // A live verification run lost one event of six and could not reproduce it
    // in eleven further runs — consistent with a swallowed transient error. One
    // blip must not cost a record.
    const { sql } = await import("@/lib/db")
    ;(sql as any).mockImplementationOnce(() => Promise.reject(new Error("connection reset")))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await recordChange({ ...base, action: "option_grant.created", after: { options: 1 } })
    expect(inserts).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("on attempt 2 after a transient failure"))
    warn.mockRestore()
  })

  it("never throws when every attempt fails, and says so loudly", async () => {
    const { sql } = await import("@/lib/db")
    ;(sql as any)
      .mockImplementationOnce(() => Promise.reject(new Error("connection reset")))
      .mockImplementationOnce(() => Promise.reject(new Error("connection reset")))
      .mockImplementationOnce(() => Promise.reject(new Error("connection reset")))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(recordChange({ ...base, action: "option_grant.created", after: { options: 1 } })).resolves.toBeUndefined()
    // A silently missing row is the failure this replaces.
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("FAILED to record option_grant.created"), "connection reset")
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("after 3 attempts"), "connection reset")
    spy.mockRestore()
  })
})

describe("scopeKey", () => {
  it("matches the persona scope-key convention", () => {
    expect(scopeKey({ type: "fund", id: "f9" })).toBe("fund:f9")
  })
})
