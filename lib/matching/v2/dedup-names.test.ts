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
