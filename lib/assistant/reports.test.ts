import { describe, it, expect } from "vitest"
import { appendReports } from "./reports"

const step = (report?: string, error?: string) => ({ tool: "match_investors", report, error }) as any
const REPORT = "Investor matches for Acme: 50 firms ranked (11,092 qualified in total)\nTop 2\n1. A — 100\n2. B — 99"

describe("appendReports", () => {
  it("adds the tool's verified block after the model's answer", () => {
    const out = appendReports("Here is what it means.", [step(REPORT)])
    expect(out).toBe(`Here is what it means.\n\n${REPORT}`)
  })
  it("does not print it twice when the model already retyped the heading", () => {
    const answer = `Summary.\n\n${REPORT.split("\n")[0]}\n1. A`
    expect(appendReports(answer, [step(REPORT)])).toBe(answer)
  })
  it("ignores steps without a report, and failed steps", () => {
    expect(appendReports("x", [step(undefined), step(REPORT, "boom")])).toBe("x")
  })
  it("shows only the last report when the same tool ran again, so a corrected run does not contradict itself", () => {
    const first = "Investor matches for Acme: 50 firms ranked (9,518 qualified in total)\n1. A — 100"
    const second = "Investor matches for Acme: 75 firms ranked (9,208 qualified in total)\n1. A — 100"
    const out = appendReports("Done.", [step(first), step(second)])
    expect(out).toContain("75 firms ranked")
    expect(out).not.toContain("50 firms ranked")
    expect(out.split("Investor matches for").length - 1).toBe(1)
  })
  it("keeps one report from each different tool, in order", () => {
    const other = "Draft sequences for Acme: 10 firms\n1. C"
    const out = appendReports("x", [step(REPORT), { tool: "draft_outreach_batch", report: other } as any])
    expect(out.indexOf(REPORT)).toBeLessThan(out.indexOf(other))
  })
})
