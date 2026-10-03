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

describe("tool notices", () => {
  it("puts a notice above the answer once, from the latest run only", () => {
    const steps: any[] = [
      { tool: "t", report: "Heading A\nrows", notice: "Only 3 found, not 8." },
      { tool: "t", report: "Heading B\nrows", notice: "Only 5 found, not 8." },
    ]
    const out = appendReports("I found 8 firms.", steps)
    expect(out.startsWith("**Only 5 found, not 8.**")).toBe(true)
    expect(out).not.toContain("Only 3")
    expect(out).toContain("Heading B")
  })
  it("a later run without a notice clears an earlier one", () => {
    const out = appendReports("ok", [{ tool: "t", report: "A\nx", notice: "short" }, { tool: "t", report: "B\nx" }] as any)
    expect(out).not.toContain("short")
  })
})

import { correctCountClaims } from "./reports"
describe("correctCountClaims", () => {
  const c = { asked: 40, found: 37 }
  it("puts the found count where the model wrote the asked one", () => {
    expect(correctCountClaims("score_investors scored 40 firms in a single batch.", c)).toBe("score_investors scored 37 firms in a single batch.")
    expect(correctCountClaims("Here are all 40 investors, ranked.", c)).toBe("Here are all 37 investors, ranked.")
    expect(correctCountClaims("I found 40 matches.", c)).toBe("I found 37 matches.")
  })
  it("reads number words", () => {
    expect(correctCountClaims("I scored eight firms.", { asked: 8, found: 5 })).toBe("I scored five firms.")
    expect(correctCountClaims("I scored 8 German VCs.", { asked: 8, found: 5 })).toBe("I scored 5 German VCs.")
  })
  it("leaves the request and other numbers alone", () => {
    expect(correctCountClaims("(keyword: climate, limit: 40)", c)).toBe("(keyword: climate, limit: 40)")
    expect(correctCountClaims("Tier 1 has 14 firms; checks of $40K.", c)).toBe("Tier 1 has 14 firms; checks of $40K.")
    expect(correctCountClaims("Top 25 below, 400 rows.", c)).toBe("Top 25 below, 400 rows.")
  })
  it("does nothing when nothing is short", () => {
    expect(correctCountClaims("scored 40 firms", { asked: 40, found: 40 })).toBe("scored 40 firms")
  })
  it("appendReports applies it from a step's claim and clears it on a later complete run", () => {
    const short: any = { tool: "t", report: "H\nrows", countClaim: { asked: 8, found: 5 } }
    expect(appendReports("I scored 8 firms.", [short])).toContain("I scored 5 firms.")
    expect(appendReports("I scored 8 firms.", [short, { tool: "t", report: "H2\nrows" }] as any)).toContain("I scored 8 firms.")
  })
})
