import { describe, it, expect } from "vitest"
import { appendReports, keepLatestArtifacts } from "./reports"

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

describe("keepLatestArtifacts", () => {
  const art = (url: string) => ({ name: `${url}.xlsx`, url, kind: "xlsx" as const })
  const run = (tool: string, url: string, report = "r", error?: string) => ({ tool, report, error, artifact: art(url) }) as any
  it("keeps only the workbook from a reporting tool's last run", () => {
    const steps = [run("score_investors", "/a"), run("score_investors", "/b")]
    expect(keepLatestArtifacts([art("/a"), art("/b")], steps).map((x) => x.url)).toEqual(["/b"])
  })
  it("keeps the latest from each tool, and every file from tools that do not report", () => {
    const steps = [run("match_investors", "/m1"), run("match_investors", "/m2"), run("score_investors", "/s1"), { tool: "generate_spreadsheet", artifact: art("/g1") } as any, { tool: "generate_spreadsheet", artifact: art("/g2") } as any]
    const urls = ["/m1", "/m2", "/s1", "/g1", "/g2"].map(art)
    expect(keepLatestArtifacts(urls, steps).map((x) => x.url)).toEqual(["/m2", "/s1", "/g1", "/g2"])
  })
  it("does not drop an earlier file because a later run failed", () => {
    const steps = [run("match_investors", "/m1"), run("match_investors", "/m2", "r", "boom")]
    expect(keepLatestArtifacts([art("/m1")], steps).map((x) => x.url)).toEqual(["/m1"])
  })
  it("leaves a single run alone", () => {
    expect(keepLatestArtifacts([art("/only")], [run("match_investors", "/only")])).toHaveLength(1)
  })
})
