import { describe, it, expect } from "vitest"
import { decideUse, decideForSources, type SourceRow } from "./use-gate"

const row = (status: SourceRow["status"], permitted_use: string[] = []): SourceRow => ({ source: "s", status, permitted_use })

describe("decideUse", () => {
  it("allows internal matching for an unreviewed or unregistered source, and warns (does not enforce) for outreach until the gate is on", () => {
    for (const r of [null, row("unreviewed")]) {
      expect(decideUse(r, "internal_matching", false).ok).toBe(true)
      expect(decideUse(r, "outreach_email", false)).toMatchObject({ ok: false, enforce: false, code: "unreviewed" })
      expect(decideUse(r, "outreach_email", true)).toMatchObject({ ok: false, enforce: true, code: "unreviewed" })
    }
  })
  it("enforces a restricted source's list at once, whatever the flag", () => {
    const r = row("restricted", ["internal_matching"])
    expect(decideUse(r, "internal_matching", false).ok).toBe(true)
    for (const p of ["outreach_email", "outreach_linkedin", "display_to_customers", "resale"] as const) expect(decideUse(r, p, false)).toMatchObject({ ok: false, enforce: true, code: "not_permitted" })
  })
  it("a recorded source allows exactly what is listed", () => {
    const r = row("recorded", ["internal_matching", "outreach_email"])
    expect(decideUse(r, "outreach_email", false).ok).toBe(true)
    expect(decideUse(r, "outreach_linkedin", false)).toMatchObject({ ok: false, enforce: true })
  })
  it("a withdrawn source allows nothing, not even matching", () => {
    for (const p of ["internal_matching", "outreach_email"] as const) expect(decideUse(row("withdrawn", ["internal_matching", "outreach_email"]), p, false)).toMatchObject({ ok: false, enforce: true, code: "withdrawn" })
  })
})

describe("decideForSources", () => {
  it("is allowed when the person is not in the directory", () => expect(decideForSources([], "outreach_email", true).ok).toBe(true))
  it("is allowed when any one source allows the use", () => {
    expect(decideForSources([row("restricted", ["internal_matching"]), row("recorded", ["outreach_email"])], "outreach_email", true).ok).toBe(true)
  })
  it("reports the enforced refusal when every source refuses", () => {
    const d = decideForSources([row("unreviewed"), row("restricted", ["internal_matching"])], "outreach_email", false)
    expect(d).toMatchObject({ ok: false, enforce: true, code: "not_permitted" })
  })
})
