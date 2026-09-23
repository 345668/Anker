/**
 * The learned ranker's arithmetic — docs/architecture/17.
 *
 * Labels in, weights out, plus the guard that decides whether those weights
 * are allowed anywhere near a founder's results. Pure: no database, no clock
 * beyond what the caller passes, so every rule here is testable directly.
 *
 * The features are the seven components the scorer already records for every
 * result, each in [0, 1]. Fitted weights are rescaled to sum to 100 so a score
 * stays the 0–100 number the tiers are defined on (doc 11 §4.1).
 */
import { WEIGHTS } from "./founder-scoring"

export const COMPONENT_KEYS = ["thesis", "stage", "checkSize", "geography", "lead", "investorType", "quality"] as const
export type ComponentKey = (typeof COMPONENT_KEYS)[number]
export type Weights = Record<ComponentKey, number>

/** The white paper's expert weights — the incumbent, and the fallback. */
export const EXPERT_WEIGHTS: Weights = { ...WEIGHTS }

/** doc 17 §3. Every one of these must hold before fitted weights are used. */
export const GUARDS = {
  minExamples: 200,
  minPositive: 50,
  minNegative: 50,
  minWorkspaces: 5,
  minAucGain: 0.03,
} as const

export interface LabelledExample {
  /** Which workspace produced it — one company's taste is not the platform's. */
  orgId: string
  runId: string
  entityId: string
  /** The seven components, in COMPONENT_KEYS order, each in [0, 1]. */
  features: number[]
  label: 0 | 1
}

// ─── Labels ─────────────────────────────────────────────────────────────────

const POSITIVE_STAGES = new Set(["responded", "replied", "meeting", "diligence", "in_diligence", "due_diligence", "soft_circle", "term_sheet", "committed", "wired", "closed"])
const NEGATIVE_STAGES = new Set(["passed", "declined", "lost", "rejected"])
/** Contacted this recently, silence is not yet an answer. */
export const SILENCE_DAYS = 21

export interface LabelInput {
  stage: string | null | undefined
  /** When outreach actually went out; falls back to when the row was added. */
  contactedAt: Date | string | null | undefined
  addedAt?: Date | string | null | undefined
  /** A replied/committed outcome event for this investor, from any surface. */
  acted?: boolean
  now?: Date
}

/**
 * One shown investor → 1, 0, or excluded.
 *
 * Excluding the never-contacted is the point: a founder works down the list,
 * so counting the untouched rest as failures would teach the model that its
 * own ordering was wrong (doc 17 §1).
 */
export function labelFor(input: LabelInput): 0 | 1 | null {
  const stage = (input.stage ?? "").toLowerCase().trim()
  if (input.acted) return 1
  if (POSITIVE_STAGES.has(stage)) return 1
  if (NEGATIVE_STAGES.has(stage)) return 0
  if (stage !== "contacted") return null // queued, identified, researched, or no row at all
  const when = input.contactedAt ?? input.addedAt
  if (!when) return null
  const at = when instanceof Date ? when : new Date(when)
  if (Number.isNaN(at.getTime())) return null
  const now = input.now ?? new Date()
  return now.getTime() - at.getTime() >= SILENCE_DAYS * 86_400_000 ? 0 : null
}

// ─── Fit ────────────────────────────────────────────────────────────────────

export interface Fit {
  /** Raw logistic coefficients, in COMPONENT_KEYS order. */
  coefficients: number[]
  bias: number
  iterations: number
}

function sigmoid(z: number): number {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z))
}

/**
 * Logistic regression by gradient descent with L2. Small and inspectable on
 * purpose: the coefficients live in the same space as the expert weights, so
 * the two can be compared and argued about.
 */
export function fitLogistic(examples: LabelledExample[], opts: { iterations?: number; learningRate?: number; l2?: number } = {}): Fit {
  const iterations = opts.iterations ?? 400
  const lr = opts.learningRate ?? 0.5
  const l2 = opts.l2 ?? 0.01
  const d = COMPONENT_KEYS.length
  const w = new Array(d).fill(0)
  let b = 0
  if (!examples.length) return { coefficients: w, bias: b, iterations: 0 }

  for (let it = 0; it < iterations; it++) {
    const gw = new Array(d).fill(0)
    let gb = 0
    for (const ex of examples) {
      let z = b
      for (let j = 0; j < d; j++) z += w[j] * ex.features[j]
      const err = sigmoid(z) - ex.label
      for (let j = 0; j < d; j++) gw[j] += err * ex.features[j]
      gb += err
    }
    const n = examples.length
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + l2 * w[j])
    b -= lr * (gb / n)
  }
  return { coefficients: w, bias: b, iterations }
}

/**
 * Coefficients → weights that sum to 100.
 *
 * Returns null when the fit has nothing positive to scale (all coefficients
 * ≤ 0): there is no reading of that as "how much each component is worth".
 */
export function rescale(coefficients: number[]): Weights | null {
  const total = coefficients.reduce((a, c) => a + c, 0)
  if (!Number.isFinite(total) || total <= 0) return null
  const out = {} as Weights
  COMPONENT_KEYS.forEach((k, i) => { out[k] = Math.round((100 * coefficients[i]) / total * 10) / 10 })
  return out
}

/** What a set of weights scores an example at — the engine's arithmetic, minus the gates. */
export function scoreWith(weights: Weights, features: number[]): number {
  return COMPONENT_KEYS.reduce((sum, k, i) => sum + weights[k] * features[i], 0)
}

/** Area under the ROC curve, by rank. Ties share their average rank. */
export function auc(scores: number[], labels: number[]): number {
  const pos = labels.filter((l) => l === 1).length
  const neg = labels.length - pos
  if (!pos || !neg) return 0.5
  const order = scores.map((s, i) => ({ s, l: labels[i] })).sort((a, b) => a.s - b.s)
  const ranks = new Array(order.length).fill(0)
  for (let i = 0; i < order.length;) {
    let j = i
    while (j + 1 < order.length && order[j + 1].s === order[i].s) j++
    const shared = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) ranks[k] = shared
    i = j + 1
  }
  const rankSum = order.reduce((sum, o, i) => sum + (o.l === 1 ? ranks[i] : 0), 0)
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg)
}

/**
 * A deterministic 70/30 split, keyed by the example itself, so re-running a
 * fit on the same data gives the same held-out answer.
 */
export function split(examples: LabelledExample[], holdout = 0.3): { train: LabelledExample[]; test: LabelledExample[] } {
  const hashed = examples.map((ex) => {
    const key = `${ex.runId}:${ex.entityId}`
    let h = 2166136261
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
    return { ex, h: (h >>> 0) / 4294967295 }
  })
  return {
    train: hashed.filter((x) => x.h >= holdout).map((x) => x.ex),
    test: hashed.filter((x) => x.h < holdout).map((x) => x.ex),
  }
}

// ─── The guard ──────────────────────────────────────────────────────────────

export interface FitOutcome {
  counts: { examples: number; positive: number; negative: number; workspaces: number; train: number; test: number }
  weights: Weights | null
  bias: number
  metrics: { aucFitted: number; aucExpert: number; gain: number }
  activate: boolean
  /** The first condition that failed, in the words the report uses. */
  blockedBy: string | null
}

/**
 * Fit, evaluate against the expert weights on held-out data, and decide.
 * Every refusal names its reason — a ranker that silently declines to learn
 * is indistinguishable from one that is broken.
 */
export function fitAndEvaluate(examples: LabelledExample[]): FitOutcome {
  const positive = examples.filter((e) => e.label === 1).length
  const negative = examples.length - positive
  const workspaces = new Set(examples.map((e) => e.orgId)).size
  const { train, test } = split(examples)
  const counts = { examples: examples.length, positive, negative, workspaces, train: train.length, test: test.length }
  const empty = (blockedBy: string): FitOutcome => ({
    counts, weights: null, bias: 0, metrics: { aucFitted: 0.5, aucExpert: 0.5, gain: 0 }, activate: false, blockedBy,
  })

  if (examples.length < GUARDS.minExamples) return empty(`not enough data: ${examples.length} of ${GUARDS.minExamples} labelled examples`)
  if (positive < GUARDS.minPositive) return empty(`not enough positives: ${positive} of ${GUARDS.minPositive}`)
  if (negative < GUARDS.minNegative) return empty(`not enough negatives: ${negative} of ${GUARDS.minNegative}`)
  if (workspaces < GUARDS.minWorkspaces) return empty(`too few workspaces: ${workspaces} of ${GUARDS.minWorkspaces}`)
  if (!train.length || !test.length) return empty("the split left nothing to train or test on")

  const fit = fitLogistic(train)
  const weights = rescale(fit.coefficients)
  if (!weights) return empty("the fit produced no positive weight to scale")

  const labels = test.map((e) => e.label)
  const aucFitted = auc(test.map((e) => scoreWith(weights, e.features)), labels)
  const aucExpert = auc(test.map((e) => scoreWith(EXPERT_WEIGHTS, e.features)), labels)
  const gain = Math.round((aucFitted - aucExpert) * 1000) / 1000
  const metrics = { aucFitted: Math.round(aucFitted * 1000) / 1000, aucExpert: Math.round(aucExpert * 1000) / 1000, gain }

  const negativeWeight = COMPONENT_KEYS.find((k) => weights[k] < 0)
  if (negativeWeight) {
    // Not a rounding matter: a negative weight says the data disagrees with
    // the model in a way nobody has explained yet. That goes to a human.
    return { counts, weights, bias: fit.bias, metrics, activate: false, blockedBy: `${negativeWeight} came out negative (${weights[negativeWeight]}) — needs a human before it ranks anything` }
  }
  if (gain < GUARDS.minAucGain) {
    return { counts, weights, bias: fit.bias, metrics, activate: false, blockedBy: `no measurable gain: ${metrics.aucFitted} against the expert weights' ${metrics.aucExpert} (needs +${GUARDS.minAucGain})` }
  }
  return { counts, weights, bias: fit.bias, metrics, activate: true, blockedBy: null }
}
