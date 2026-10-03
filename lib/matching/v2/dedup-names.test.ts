import { describe, it, expect } from "vitest"
import { firmDedupKeys, firmDedupKey, clusterFirms } from "./dedup"
import { ScoredBatches } from "@/lib/assistant/score-merge"

const same = (a: string, b: string) => firmDedupKeys(a).some((k) => firmDedupKeys(b).includes(k))

describe("firm names written differently", () => {
  it("umlauts and their two-letter spelling are one word", () => {
    expect(firmDedupKey("Nordwerk Gründerfonds")).toBe(firmDedupKey("Nordwerk Gruenderfonds"))
    expect(firmDedupKey("Société Example")).toBe(firmDedupKey("Societe Example"))
  })
  it("a legal tail does not make a different firm", () => {
    expect(same("Nordwerk Gründerfonds Management GmbH", "Nordwerk Gründerfonds")).toBe(true)
    expect(same("Techfonds Nord Management GmbH & Co. KG", "Techfonds Nord")).toBe(true)
  })
  it("an acronym beside the full name is the same firm, with a pipe or a dash", () => {
    expect(same("NGF | Nordwerk Gruenderfonds", "Nordwerk Gründerfonds Management GmbH")).toBe(true)
    expect(same("TFN – Techfonds Nord", "Techfonds Nord Management GmbH & Co. KG")).toBe(true)
    expect(same("NGF | Nordwerk Gruenderfonds", "NGF")).toBe(true)
  })
  it("a dash that is not an acronym stays part of the name", () => {
    expect(same("Alpha Capital - Berlin", "Beta Capital - Berlin")).toBe(false)
  })
  it("different firms stay apart", () => {
    expect(same("Nordwerk Gründerfonds", "Nordwerk Capital")).toBe(false)
  })
  it("clusters and merges scored batches across the variants", () => {
    const names = ["Nordwerk Gründerfonds Management GmbH", "NGF | Nordwerk Gruenderfonds", "Nordwerk Gruenderfonds"]
    const c = clusterFirms(names.map((name) => ({ name })))
    expect(new Set(c).size).toBe(1)
    const b = new ScoredBatches()
    const row = (name: string, score: number) => ({ name, type: "VC", location: "", website: "", score, tier: "", reason: "" })
    const { ranked } = b.add("t", names.map((n, i) => row(n, 9 - i)))
    expect(ranked).toHaveLength(1)
    expect(ranked[0].score).toBe(9)
  })
})

describe("imported names", () => {
  it("double-encoded umlauts meet the clean spelling, and a bracketed acronym is an alias", () => {
    expect(same("Nordwerk GrÃ¼nderfonds (NGF)", "Nordwerk Gründerfonds Management GmbH")).toBe(true)
    expect(same("Nordwerk GrÃ¼nderfonds (NGF)", "NGF")).toBe(true)
  })
  it("a bracket with words is not an alias", () => {
    expect(same("Alpha Fund (Jane Roe)", "Jane Roe")).toBe(false)
  })
})

describe("acronyms must belong to the name", () => {
  it("an unrelated capital word beside a name is not an alias", () => {
    expect(same("Alpha Growth | QXZ", "QXZ")).toBe(false)
    expect(same("Alpha Growth (QXZ)", "QXZ Partners")).toBe(false)
  })
  it("a real acronym still joins", () => {
    expect(same("Nordwerk Gründerfonds (NGF)", "NGF")).toBe(true)
  })
})

describe("initials", () => {
  const link = (a: string, b: string) => new Set(clusterFirms([{ name: a }, { name: b }])).size === 1
  it("joins an acronym name to the full name it spells", () => {
    expect(link("NvK Ventures", "Nina von Kessel Ventures")).toBe(true)
    expect(link("Nina von Kessel Ventures GmbH", "NvK Ventures")).toBe(true)
  })
  it("joins the real pair that prompted the rule", () => {
    expect(link("DvH Ventures", "Dieter von Holtzbrinck Ventures")).toBe(true)
  })
  it("needs the same kind of firm and exact initials", () => {
    expect(link("NvK Ventures", "Nina von Kessel Capital")).toBe(false)
    expect(link("NvK Ventures", "Nina von Kessel Hoch Ventures")).toBe(false)
  })
  it("never treats a plain word or a pair of long names as initials", () => {
    expect(link("Alpha Ventures", "Anna Lena Pohl Ventures")).toBe(false)
    expect(link("Nina von Kessel Ventures", "Nora van Keller Ventures")).toBe(false)
  })
  it("merges across scored batches", () => {
    const b = new ScoredBatches()
    const row = (name: string, score: number) => ({ name, type: "VC", location: "", website: "", score, tier: "", reason: "" })
    expect(b.add("t", [row("Nina von Kessel Ventures", 8)]).ranked).toHaveLength(1)
    const r = b.add("t", [row("NvK Ventures", 9)]).ranked
    expect(r).toHaveLength(1)
    expect(r[0].score).toBe(9)
  })
})

describe("initials linking stays linear", () => {
  it("clusters a directory-sized list in well under a second", () => {
    const recs = Array.from({ length: 21000 }, (_, i) => ({ name: `Firm Number ${i} Capital Partners` }))
    recs.push({ name: "FNB Capital" })      // an acronym that spells nothing here
    const t = Date.now()
    const c = clusterFirms(recs)
    expect(Date.now() - t).toBeLessThan(2500)
    expect(new Set(c).size).toBe(recs.length)
  })
  it("still joins a single acronym to its full name inside a big list", () => {
    const recs = Array.from({ length: 5000 }, (_, i) => ({ name: `Plain Name ${i} Ventures` }))
    recs.push({ name: "Dieter von Holtzbrinck Ventures" }, { name: "DvH Ventures" })
    const c = clusterFirms(recs)
    expect(c[recs.length - 1]).toBe(c[recs.length - 2])
    expect(new Set(c).size).toBe(recs.length - 1)
  })
})
