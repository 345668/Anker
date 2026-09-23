import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
// Pure-function tests: the extractor is imported by the module under test but
// never called here, so no AI provider and no database are involved.
vi.mock("./document-extractor", () => ({ extractStartupProfile: vi.fn() }))

import {
  chunkInvestors, rankInvestors, buildInvestorLists, buildGroupLists, readListRows,
  LIST_SIZE, FIRM_LIST_HEADERS, PEOPLE_LIST_HEADERS, GROUP_LIST_HEADERS,
} from "./pdf-pipeline"
import type { ScoredInvestorEntity } from "./founder-types"
import { tierFor } from "./types"

function investor(i: number, score: number, kind: "firm" | "person" = "firm"): ScoredInvestorEntity {
  return {
    id: `id-${String(i).padStart(5, "0")}`, kind, name: `Investor ${String(i).padStart(5, "0")}`,
    type: "VC", location: "United States", sectors: ["saas"], website: null, linkedin: null,
    email: kind === "person" ? `p${i}@example.invalid` : null,
    score, tier: tierFor(score), factors: {} as any, reasons: [], whyMatch: "fit", tags: [], stage: "queued" as any,
  }
}

describe("chunkInvestors", () => {
  it("never puts more than 200 in one list", () => {
    expect(LIST_SIZE).toBe(200)
    for (const c of chunkInvestors(Array.from({ length: 1000 }, (_, i) => i))) expect(c.length).toBeLessThanOrEqual(200)
  })

  it.each([
    [0, []], [1, [1]], [199, [199]], [200, [200]], [201, [200, 1]], [400, [200, 200]], [401, [200, 200, 1]],
  ])("splits %i items into %j", (n, sizes) => {
    expect(chunkInvestors(Array.from({ length: n as number }, (_, i) => i)).map((c) => c.length)).toEqual(sizes)
  })

  it("loses nothing, repeats nothing, and keeps the order across files", () => {
    const items = Array.from({ length: 1234 }, (_, i) => i)
    expect(chunkInvestors(items).flat()).toEqual(items)
  })

  it("refuses a size that is not a positive integer", () => {
    expect(() => chunkInvestors([1], 0)).toThrow()
    expect(() => chunkInvestors([1], 2.5)).toThrow()
  })
})

describe("rankInvestors", () => {
  it("orders by score, highest first", () => {
    const r = rankInvestors([investor(1, 40), investor(2, 90), investor(3, 65)])
    expect(r.map((e) => e.score)).toEqual([90, 65, 40])
  })

  it("breaks ties deterministically, so two runs never disagree about who is #200", () => {
    // Equal scores at a file boundary would otherwise let an investor move
    // between list 1 and list 2 from one run to the next.
    const tied = [investor(3, 50), investor(1, 50), investor(2, 50)]
    expect(rankInvestors(tied).map((e) => e.id)).toEqual(rankInvestors([...tied].reverse()).map((e) => e.id))
  })

  it("does not mutate its input", () => {
    const input = [investor(1, 10), investor(2, 90)]
    rankInvestors(input)
    expect(input.map((e) => e.score)).toEqual([10, 90])
  })
})

describe("buildInvestorLists", () => {
  const firms = Array.from({ length: 450 }, (_, i) => investor(i, 20 + ((i * 37) % 80)))

  it("produces ceil(n / 200) files with global ranks that continue across files", () => {
    const files = buildInvestorLists("firms", firms, { name: "Acme" })
    expect(files.map((f) => [f.index, f.of, f.firstRank, f.lastRank, f.rows])).toEqual([
      [1, 3, 1, 200, 200], [2, 3, 201, 400, 200], [3, 3, 401, 450, 50],
    ])
  })

  it("writes every investor exactly once, in rank order, across all files", () => {
    const files = buildInvestorLists("firms", firms, { name: "Acme" })
    const ids = files.flatMap((f) => readListRows(f.workbook).rows.map((r) => r[r.length - 1]))
    expect(ids).toHaveLength(450)
    expect(new Set(ids).size).toBe(450)
    const scores = files.flatMap((f) => readListRows(f.workbook).rows.map((r) => Number(r[1])))
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    const ranks = files.flatMap((f) => readListRows(f.workbook).rows.map((r) => Number(r[0])))
    expect(ranks).toEqual(Array.from({ length: 450 }, (_, i) => i + 1))
  })

  it("uses the product's tier labels, so a list and the shortlist never disagree", () => {
    const [file] = buildInvestorLists("firms", [investor(1, 85), investor(2, 45)], { name: "Acme" })
    expect(readListRows(file.workbook).rows.map((r) => r[2])).toEqual(["Champion", "Priority B"])
  })

  it("has the right columns for each kind", () => {
    expect(readListRows(buildInvestorLists("firms", [investor(1, 50)], { name: "A" })[0].workbook).headers).toEqual([...FIRM_LIST_HEADERS])
    expect(readListRows(buildInvestorLists("people", [investor(1, 50, "person")], { name: "A" })[0].workbook).headers).toEqual([...PEOPLE_LIST_HEADERS])
  })

  it("produces no files at all for no investors, rather than an empty one", () => {
    expect(buildInvestorLists("people", [], { name: "A" })).toEqual([])
  })
})

describe("buildGroupLists", () => {
  const group = (i: number, score: number) => ({
    firm: { ...investor(i, score), kind: "firm" as const, checkSizeMin: 250_000, checkSizeMax: 1_000_000, stages: ["pre-seed"], segments: [] },
    primary: { ...investor(1000 + i, score, "person"), title: "Partner", emailStatus: "valid" as const, segments: [] },
    alternates: [{ ...investor(2000 + i, score, "person"), title: "Principal", segments: [] }],
    scoreFrom: "firm" as const,
    peopleScored: 2,
  })

  it("keeps the engine's order, splits at 200, and numbers ranks across files", () => {
    const groups = Array.from({ length: 450 }, (_, i) => group(i, 100 - i / 10))
    const files = buildGroupLists(groups, { name: "Northwind Sports" })
    expect(files.map((f) => [f.index, f.of, f.firstRank, f.lastRank, f.rows])).toEqual([
      [1, 3, 1, 200, 200], [2, 3, 201, 400, 200], [3, 3, 401, 450, 50],
    ])
    const rows = files.flatMap((f) => readListRows(f.workbook).rows)
    expect(rows.map((r) => Number(r[0]))).toEqual(Array.from({ length: 450 }, (_, i) => i + 1))
    expect(rows.map((r) => String(r[r.length - 1]))).toEqual(groups.map((g) => `firm:${g.firm.id}`))
  })

  it("carries the primary contact, their verification status and the alternates", () => {
    const [file] = buildGroupLists([group(1, 95)], { name: "Northwind Sports" })
    const { headers, rows } = readListRows(file.workbook)
    expect(headers).toEqual([...GROUP_LIST_HEADERS])
    const row = Object.fromEntries(headers.map((h, i) => [h, rows[0][i]]))
    expect(row["Primary contact"]).toBe("Investor 01001")
    expect(row["Email status"]).toBe("Verified")
    expect(row["Check size"]).toBe("$250K–$1.0M")
    expect(String(row["Alternates"])).toContain("Investor 02001")
  })

  it("produces no files for no groups", () => expect(buildGroupLists([], { name: "Northwind Sports" })).toEqual([]))
})
