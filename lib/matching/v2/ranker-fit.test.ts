/**
 * The learned ranker's arithmetic and its guard (docs/architecture/17 §7).
 *
 * The guard is the point of this file: weights fitted to thin or one-sided
 * evidence must not reach a founder's results, and every refusal must say
 * which condition stopped it.
 */
import { describe, it, expect } from "vitest"
import {
  COMPONENT_KEYS, EXPERT_WEIGHTS, GUARDS, auc, fitAndEvaluate, fitLogistic,
  labelFor, rescale, scoreWith, split, type LabelledExample,
} from "./ranker-fit"

// ─── Labels ─────────────────────────────────────────────────────────────────

describe("labelFor", () => {
  const now = new Date("2026-09-23T00:00:00Z")
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

  it("counts a reply as a positive", () => {
    expect(labelFor({ stage: "responded", contactedAt: daysAgo(3), now })).toBe(1)
    expect(labelFor({ stage: "contacted", contactedAt: daysAgo(1), acted: true, now })).toBe(1)
  })

  it("counts three weeks of silence after contact as a negative", () => {
    expect(labelFor({ stage: "contacted", contactedAt: daysAgo(21), now })).toBe(0)
    expect(labelFor({ stage: "passed", contactedAt: daysAgo(2), now })).toBe(0)
  })

  it("excludes an investor nobody approached", () => {
    expect(labelFor({ stage: "queued", contactedAt: null, addedAt: daysAgo(90), now })).toBeNull()
    expect(labelFor({ stage: null, contactedAt: null, now })).toBeNull()
  })

  it("excludes contact too recent to read as a refusal", () => {
    expect(labelFor({ stage: "contacted", contactedAt: daysAgo(6), now })).toBeNull()
  })

  it("falls back to when the row was added when no send is recorded", () => {
    expect(labelFor({ stage: "contacted", contactedAt: null, addedAt: daysAgo(40), now })).toBe(0)
  })
})

// ─── Fit ────────────────────────────────────────────────────────────────────

/** Examples whose label is decided by one component, so the fit has a right answer. */
function synthetic(count: number, decisiveIndex: number, workspaces = 8): LabelledExample[] {
  const out: LabelledExample[] = []
  for (let i = 0; i < count; i++) {
    const decisive = i % 2 === 0 ? 0.9 : 0.1
    const features = COMPONENT_KEYS.map((_, j) => (j === decisiveIndex ? decisive : ((i * 37 + j * 11) % 100) / 100))
    out.push({ orgId: `org-${i % workspaces}`, runId: `run-${i % 5}`, entityId: `firm-${i}`, features, label: i % 2 === 0 ? 1 : 0 })
  }
  return out
}

/**
 * Evidence shaped like the real thing: every component reads a little better
 * on the investors who worked, and one of them reads much better.
 */
function believable(count: number, decisive: string, workspaces = 8): LabelledExample[] {
  let seed = 7
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  return Array.from({ length: count }, (_, i) => {
    const label = (i % 2 === 0 ? 1 : 0) as 0 | 1
    const features = COMPONENT_KEYS.map((k) => {
      const lift = label ? (k === decisive ? 0.45 : 0.05) : 0
      return Math.max(0, Math.min(1, rnd() * 0.55 + lift))
    })
    return { orgId: `org-${i % workspaces}`, runId: `run-${i % 5}`, entityId: `firm-${i}`, features, label }
  })
}

describe("fitLogistic", () => {
  it("gives the deciding component the largest weight", () => {
    const fit = fitLogistic(synthetic(400, 1), { iterations: 600 })
    const weights = rescale(fit.coefficients)!
    const largest = COMPONENT_KEYS.reduce((a, b) => (weights[a] >= weights[b] ? a : b))
    expect(largest).toBe(COMPONENT_KEYS[1]) // "stage" decided every label
  })

  it("rescales to weights that sum to 100", () => {
    const weights = rescale(fitLogistic(synthetic(300, 0)).coefficients)!
    const total = Object.values(weights).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(99)
    expect(total).toBeLessThan(101)
  })

  it("refuses to rescale a fit with nothing positive in it", () => {
    expect(rescale([0, 0, 0, 0, 0, 0, 0])).toBeNull()
    expect(rescale([-1, -2, -0.5, -1, -1, -1, -1])).toBeNull()
  })
})

describe("auc", () => {
  it("is 1 for a perfect ordering and 0.5 for a constant score", () => {
    expect(auc([1, 2, 3, 4], [0, 0, 1, 1])).toBe(1)
    expect(auc([5, 5, 5, 5], [0, 1, 0, 1])).toBe(0.5)
  })
})

describe("split", () => {
  it("is deterministic and holds out roughly 30%", () => {
    const examples = synthetic(1000, 2)
    const a = split(examples), b = split(examples)
    expect(a.test.map((e) => e.entityId)).toEqual(b.test.map((e) => e.entityId))
    expect(a.test.length / examples.length).toBeGreaterThan(0.2)
    expect(a.test.length / examples.length).toBeLessThan(0.4)
    expect(a.train.length + a.test.length).toBe(examples.length)
  })
})

// ─── The guard ──────────────────────────────────────────────────────────────

describe("fitAndEvaluate — each guard blocks on its own and says so", () => {
  it("refuses too little data, and counts it out loud", () => {
    const out = fitAndEvaluate(synthetic(GUARDS.minExamples - 1, 1))
    expect(out.activate).toBe(false)
    expect(out.blockedBy).toContain(`${GUARDS.minExamples - 1} of ${GUARDS.minExamples}`)
  })

  it("refuses a one-sided set", () => {
    const positives = synthetic(400, 1).map((e) => ({ ...e, label: 1 as const }))
    const out = fitAndEvaluate(positives)
    expect(out.activate).toBe(false)
    expect(out.blockedBy).toContain("not enough negatives")
  })

  it("refuses one workspace's taste", () => {
    const out = fitAndEvaluate(synthetic(400, 1, 2))
    expect(out.activate).toBe(false)
    expect(out.blockedBy).toContain("too few workspaces")
  })

  it("refuses a fit that does not beat the expert weights", () => {
    // Outcomes driven by thesis — what the expert weights already lead on, so
    // there is no 0.03 to be had.
    const out = fitAndEvaluate(believable(600, "thesis"))
    expect(out.metrics.gain).toBeLessThan(GUARDS.minAucGain)
    expect(out.activate).toBe(false)
    expect(out.blockedBy).toContain("no measurable gain")
  })

  it("refuses a weight that came out negative, however good the AUC", () => {
    // Noise that happens to run against the label — a better AUC than the
    // expert weights, and still not something to ship.
    const out = fitAndEvaluate(synthetic(600, COMPONENT_KEYS.indexOf("quality")))
    expect(out.metrics.gain).toBeGreaterThan(GUARDS.minAucGain)
    expect(out.activate).toBe(false)
    expect(out.blockedBy).toMatch(/came out negative .* needs a human/)
  })

  it("activates when the data is plentiful, mixed, and genuinely better", () => {
    // Outcomes driven by the component the expert weights value least.
    const out = fitAndEvaluate(believable(600, "quality"))
    expect(out.counts.examples).toBe(600)
    expect(out.counts.workspaces).toBe(8)
    expect(out.metrics.gain).toBeGreaterThanOrEqual(GUARDS.minAucGain)
    expect(out.activate).toBe(true)
    expect(out.blockedBy).toBeNull()
    expect(Object.values(out.weights!).every((w) => w >= 0)).toBe(true)
    expect(out.weights!.quality).toBeGreaterThan(EXPERT_WEIGHTS.quality)
    expect(Object.values(out.weights!).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0)
  })

  it("keeps the expert weights comparable — same space, same total", () => {
    expect(Object.values(EXPERT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
    expect(scoreWith(EXPERT_WEIGHTS, COMPONENT_KEYS.map(() => 1))).toBe(100)
    expect(scoreWith(EXPERT_WEIGHTS, COMPONENT_KEYS.map(() => 0))).toBe(0)
  })
})
