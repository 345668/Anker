import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: Object.assign(() => [], { unsafe: () => [] }) }))
import { evaluateFactors, GUARDS_LP, type EvalRow } from "./evaluate"
import { parseLabelText } from "./labels"
import { DEFAULT_SETTINGS } from "./shadow"

/** A seeded list of labelled LPs where the base score is only weakly related to the label and one factor is strongly related. */
function sample(n: number, signal: "proximity" | "none" | "reverse", knownShare = 1): EvalRow[] {
  // mulberry32: a plain linear generator alternates in step with the alternating labels and fakes a signal
  let a = 12345; const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  return Array.from({ length: n }, (_, i) => {
    const label = (i % 2) as 0 | 1
    const base = 50 + (label ? 3 : 0) + rnd() * 20                                 // a weak base: fits are only slightly higher
    const rel = signal === "none" ? (rnd() < 0.5 ? 1 : 0) : signal === "proximity" ? (label ? (rnd() < 0.8 ? 1 : 0) : (rnd() < 0.1 ? 1 : 0)) : (label ? (rnd() < 0.1 ? 1 : 0) : (rnd() < 0.8 ? 1 : 0))
    return { key: `firm:${i}`, label, source: i % 3 ? "founder_set" : "feedback", base, values: { recent_activity: rnd() < knownShare ? (rnd() < 0.5 ? 1 : 0) : null, emerging_manager_appetite: null, relationship_proximity: rel, data_confidence: 0.5 } }
  })
}

describe("judging an extra factor", () => {
  it("says what is missing, and judges nothing, until there are enough labels of both kinds", () => {
    const r = evaluateFactors(sample(20, "proximity"), DEFAULT_SETTINGS)
    expect(r.blocked).toMatch(/Not enough labels to judge any factor yet. It needs 40 labelled LPs in the run \(there are 20\), 12 marked fit \(10\), 12 marked not a fit \(10\)/)
    expect(r.factors.every((f) => f.verdict === "keep_shadow" && f.reason === r.blocked)).toBe(true)
    expect(r.n).toBe(20); expect(r.fit).toBe(10); expect(r.bySource.founder_set + r.bySource.feedback).toBe(20)
  })
  it("recommends promoting a factor that clearly separates fits from not-fits, with the evidence", () => {
    const r = evaluateFactors(sample(120, "proximity"), DEFAULT_SETTINGS)
    expect(r.blocked).toBeNull()
    const f = r.factors.find((x) => x.key === "relationship_proximity")!
    expect(f.verdict).toBe("promote")
    expect(f.delta).toBeGreaterThanOrEqual(GUARDS_LP.minAucGain)
    expect(f.ciLow).toBeGreaterThan(0)
    expect(f.auc).toBeGreaterThan(r.baselineAuc)
    expect(f.reason).toMatch(/whole interval is above zero/)
    expect(f.coverage).toBe(1)
  })
  it("keeps a factor in shadow that is noise, however many labels", () => {
    const r = evaluateFactors(sample(200, "none"), DEFAULT_SETTINGS)
    const f = r.factors.find((x) => x.key === "relationship_proximity")!
    expect(f.verdict).toBe("keep_shadow")
    expect(f.reason).toMatch(/No measurable gain|may be chance/)
  }, 30000)
  it("recommends retiring a factor that makes the ranking clearly worse", () => {
    const f = evaluateFactors(sample(200, "reverse"), DEFAULT_SETTINGS).factors.find((x) => x.key === "relationship_proximity")!
    expect(f.verdict).toBe("retire")
    expect(f.delta).toBeLessThan(0)
    expect(f.reason).toMatch(/makes the ranking worse/)
  })
  it("will not judge a factor known for too few of the labelled LPs, and unknown values add nothing", () => {
    const r = evaluateFactors(sample(120, "proximity", 0.1), DEFAULT_SETTINGS)
    const a = r.factors.find((x) => x.key === "recent_activity")!
    expect(a.coverage).toBeLessThan(GUARDS_LP.minCoverage + 0.5)
    const em = r.factors.find((x) => x.key === "emerging_manager_appetite")!
    expect(em.coverage).toBe(0)
    expect(em.verdict).toBe("keep_shadow")
    expect(em.reason).toMatch(/Known for only 0%/)
  })
  it("gives the same answer every time for the same labels", () => {
    const rows = sample(100, "proximity")
    expect(evaluateFactors(rows, DEFAULT_SETTINGS)).toEqual(evaluateFactors([...rows], DEFAULT_SETTINGS))
  })
  it("the combined line judges all the factors together", () => {
    const r = evaluateFactors(sample(120, "proximity"), DEFAULT_SETTINGS)
    expect(r.combined.key).toBe("all")
    expect(r.combined.verdict).toBe("promote")
  })
})

describe("reading a labelled list", () => {
  it("takes names or keys with fit or not fit, skips a header and what it cannot read, and counts what it skipped", () => {
    const { lines, skipped } = parseLabelText(`name,label
Alpha Capital, fit
"Beta, Trust",not fit
firm:abc-123,no
contact:77,yes
Gamma Fund,unsure
just a name
,fit`)
    expect(lines).toEqual([
      { name: "Alpha Capital", label: "fit" }, { name: "Beta, Trust", label: "not_fit" },
      { key: "firm:abc-123", label: "not_fit" }, { key: "contact:77", label: "fit" },
    ])
    expect(skipped).toEqual(["Gamma Fund,unsure", "just a name", ",fit"])
  })
})
