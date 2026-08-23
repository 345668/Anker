/**
 * Fund-returns Monte-Carlo engine (probabilistic forecasting).
 *
 * The deterministic forecaster projects TVPI/MOIC under three fixed exit multiples.
 * This engine instead treats the blended exit multiple on deployed capital as
 * *uncertain* — drawn from a lognormal (the standard heavy-tailed shape for venture
 * outcomes) — and runs N trials to produce a full distribution of fund outcomes:
 * percentiles (P5…P95), mean, and the probability of key thresholds (return capital,
 * 3× home-run, loss).
 *
 * Deterministic + reproducible: a seeded PRNG means the same inputs + seed always
 * give the same result — a sealed engine, not a slot machine. Pure TS, no deps →
 * runs client-side in the forecasting panel and server-side for the agent tool.
 */

export interface MonteCarloInput {
  /** Live book. */
  navFV: number
  called: number
  distributed: number
  invested: number
  /** Capital about to be deployed (dry powder × deploy%). */
  deployable: number
  /** Follow-on reserve % held for the existing book (0–100). */
  reservePct: number
  /** Median blended exit multiple on deployed capital (lognormal median). */
  medianMultiple: number
  /** Lognormal volatility (σ of ln multiple). Higher = fatter tail. Default 0.6. */
  sigma?: number
  /** Trials. Default 10,000 (clamped 1k–100k). */
  trials?: number
  /** PRNG seed for reproducibility. Default 1. */
  seed?: number
}

export interface Distribution {
  mean: number
  p5: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  p95: number
}

export interface MonteCarloResult {
  trials: number
  seed: number
  medianMultiple: number
  sigma: number
  /** Distribution of projected fund NAV/value at the horizon. */
  value: Distribution
  tvpi: Distribution
  moic: Distribution
  /** Probabilities over TVPI (net of the model's assumptions). */
  probReturnCapital: number // P(TVPI ≥ 1)
  probHomeRun: number       // P(TVPI ≥ 3)
  probLoss: number          // P(TVPI < 1)
  /** TVPI histogram for a distribution chart: evenly-spaced buckets. */
  histogram: { from: number; to: number; count: number }[]
}

/** mulberry32 — a tiny, fast, well-distributed seeded PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard-normal sample via Box-Muller from a uniform PRNG. */
function normal(rand: () => number): number {
  let u = 0, v = 0
  while (u === 0) u = rand() // avoid log(0)
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const round2 = (n: number) => Math.round(n * 100) / 100

/** Percentile of a PRE-SORTED ascending array (linear interpolation). */
function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = clamp(p, 0, 1) * (sorted.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function distribution(sorted: number[]): Distribution {
  const mean = sorted.reduce((s, x) => s + x, 0) / (sorted.length || 1)
  return {
    mean: round2(mean),
    p5: round2(pct(sorted, 0.05)), p10: round2(pct(sorted, 0.10)), p25: round2(pct(sorted, 0.25)),
    p50: round2(pct(sorted, 0.50)), p75: round2(pct(sorted, 0.75)), p90: round2(pct(sorted, 0.90)),
    p95: round2(pct(sorted, 0.95)),
  }
}

export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  const trials = clamp(Math.floor(input.trials ?? 10_000), 1_000, 100_000)
  const sigma = clamp(input.sigma ?? 0.6, 0.05, 2)
  const seed = Math.floor(input.seed ?? 1) || 1
  const median = Math.max(0.01, input.medianMultiple)
  const rand = mulberry32(seed)
  const mu = Math.log(median) // lognormal median = e^mu

  const values: number[] = new Array(trials)
  const tvpis: number[] = new Array(trials)
  const moics: number[] = new Array(trials)
  const investedTotal = input.invested + input.deployable

  for (let i = 0; i < trials; i++) {
    // Blended exit multiple on deployed capital, lognormal.
    const m = Math.exp(mu + sigma * normal(rand))
    // Same projection shape as the deterministic model: new capital returns at m;
    // reserves compound onto the current book at half the excess multiple.
    const newCapValue = input.deployable * m
    const reserveBoost = input.navFV * (input.reservePct / 100) * (m - 1) * 0.5
    const projValue = Math.max(0, input.navFV + newCapValue + reserveBoost)
    values[i] = projValue
    tvpis[i] = input.called > 0 ? (projValue + input.distributed) / input.called : 0
    moics[i] = investedTotal > 0 ? (projValue + input.distributed) / investedTotal : 0
  }

  const tvpiSorted = [...tvpis].sort((a, b) => a - b)
  const valSorted = [...values].sort((a, b) => a - b)
  const moicSorted = [...moics].sort((a, b) => a - b)

  const countAtLeast = (sorted: number[], thr: number) => sorted.length - lowerBound(sorted, thr)
  const probReturnCapital = countAtLeast(tvpiSorted, 1) / trials
  const probHomeRun = countAtLeast(tvpiSorted, 3) / trials
  const probLoss = 1 - probReturnCapital

  // TVPI histogram: 20 buckets across [P1, P99] to keep the tail from flattening it.
  const lo = pct(tvpiSorted, 0.01), hi = Math.max(lo + 0.01, pct(tvpiSorted, 0.99))
  const BUCKETS = 20
  const width = (hi - lo) / BUCKETS
  const histogram = Array.from({ length: BUCKETS }, (_, b) => ({ from: round2(lo + b * width), to: round2(lo + (b + 1) * width), count: 0 }))
  for (const t of tvpis) {
    let b = Math.floor((t - lo) / width)
    b = clamp(b, 0, BUCKETS - 1)
    histogram[b].count++
  }

  return {
    trials, seed, medianMultiple: round2(median), sigma: round2(sigma),
    value: distribution(valSorted), tvpi: distribution(tvpiSorted), moic: distribution(moicSorted),
    probReturnCapital: round2(probReturnCapital), probHomeRun: round2(probHomeRun), probLoss: round2(probLoss),
    histogram,
  }
}

/** First index in a sorted ascending array whose value ≥ target (binary search). */
function lowerBound(sorted: number[], target: number): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid] < target) lo = mid + 1
    else hi = mid
  }
  return lo
}
