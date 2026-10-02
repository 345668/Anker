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
  it("ignores steps without a report, failed steps, and identical repeats", () => {
    expect(appendReports("x", [step(undefined), step(REPORT, "boom")])).toBe("x")
    const twice = appendReports("x", [step(REPORT), step(REPORT)])
    expect(twice.split(REPORT).length - 1).toBe(1)
  })
  it("keeps separate reports from separate runs, in order", () => {
    const other = "Investor matches for Beta: 10 firms ranked\n1. C — 90"
    const out = appendReports("x", [step(REPORT), step(other)])
    expect(out.indexOf(REPORT)).toBeLessThan(out.indexOf(other))
  })
})
