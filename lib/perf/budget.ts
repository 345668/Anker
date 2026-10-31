import { appendFileSync } from "node:fs"

/**
 * The scale and time budget (docs/architecture/59 section 7, R5). Fixtures at PRODUCTION size, built from a seed so a failure reproduces, and a `within` that times the work and fails the
 * build when it is slower than its budget. The budgets are checked in nightly (`pnpm budget`) and on demand, not on every push: they build large fixtures and take minutes.
 *
 * A budget starts at about twice the time measured when it was written, and never below `FLOOR_MS`, so a slow CI machine does not make a budget flaky. Raising one is a decision
 * that goes in the commit message: it means the code got slower. The point of the suite is the regression class that cost us a 504 in production (a quadratic loop that unit tests with
 * ten rows never notice).
 */
export const SCALE = { firms: 21_000, people: 50_000, callsPerYear: 300_000, workspaces: 200 } as const
export const FLOOR_MS = 1000
export const enabled = () => process.env.RUN_BUDGET === "1"

/** A small, fast, seedable generator (mulberry32): the same numbers on every machine. */
export function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]

const HEAD = ["Nord", "Alpha", "Beta", "Atlas", "Summit", "Harbor", "Crest", "Vertex", "Orbit", "Ember", "Lumen", "Nova", "Pioneer", "Granite", "Cobalt", "Juniper", "Meridian", "Quartz", "Tidal", "Zenith", "Aurora", "Basalt", "Cedar", "Delta", "Evergreen"]
const TAIL = ["Capital", "Ventures", "Partners", "Fund", "Gründerfonds", "Holdings", "Growth", "Seed", "VC", "Investments"]
const LEGAL = ["", "", "", " GmbH", " Management GmbH", " LLC", " Ltd", " Inc.", " GmbH & Co. KG", " Management Company"]
const CITIES = ["Berlin", "London", "Paris", "Munich", "Zurich", "Amsterdam", "Stockholm", "New York", "San Francisco", "Lisbon"]

/**
 * 21,000 firm names with the collisions real data has: legal-tail variants of the same firm, acronym-beside-full-name pairs, accents, spacing, and genuinely different firms that share words.
 * About 15% are variants of another record, so the clustering has real work to merge.
 */
export function firmNames(n: number = SCALE.firms, seed = 1): string[] {
  const r = rng(seed), base: string[] = [], out: string[] = []
  for (let i = 0; out.length < n; i++) {
    if (base.length && r() < 0.15) {
      const b = pick(r, base), v = r()
      out.push(v < 0.35 ? b + pick(r, LEGAL) : v < 0.6 ? b.toUpperCase() : v < 0.8 ? b.replace(/ü/g, "ue").replace(/ /g, "") : `${b.split(" ").map((w) => w[0]).join("")} | ${b}`)
      continue
    }
    const name = `${pick(r, HEAD)} ${pick(r, HEAD)}${r() < 0.3 ? "" : " " + pick(r, TAIL)}${i % 7 === 0 ? ` ${i}` : ""}`
    base.push(name); out.push(name + pick(r, LEGAL))
  }
  return out
}
export const cityOf = (r: () => number) => pick(r, CITIES)

export interface Timing { label: string; ms: number; limitMs: number }
export const timings: Timing[] = []
/** Runs `fn`, records how long it took, and throws when it took longer than `limitMs`. Returns what `fn` returned. */
export async function within<T>(label: string, limitMs: number, fn: () => Promise<T> | T): Promise<T> {
  const t0 = performance.now(), out = await fn(), ms = Math.round(performance.now() - t0)
  timings.push({ label, ms, limitMs })
  if (process.env.BUDGET_REPORT) { try { appendFileSync(process.env.BUDGET_REPORT, JSON.stringify({ label, ms, limitMs }) + "\n") } catch { /* the report is a courtesy */ } }
  if (ms > limitMs) throw new Error(`BUDGET EXCEEDED: ${label} took ${ms} ms, the budget is ${limitMs} ms (about twice what it took when the budget was set). Something got slower at production size.`)
  return out
}
/** Twice the measured time, never below the floor, rounded up to 50 ms: how a budget is first set. */
export const budgetFor = (measuredMs: number) => Math.max(FLOOR_MS, Math.ceil((measuredMs * 2) / 50) * 50)
