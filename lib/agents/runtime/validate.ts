/** Checks run by code on what a model step wrote, before it is used. docs/architecture/45 §4. The model decides words; the numbers must already exist. */

const NUM = /\d+(?:[.,]\d+)?/g
const toNum = (s: string) => Number(s.replace(",", "."))

/** Every number a piece of text states. */
export const numbersIn = (text: string): number[] => (text.match(NUM) ?? []).map(toNum).filter(Number.isFinite)

/** Every number that appears in a facts object (values, nested), plus the sum of each array of {n} counts. */
export function factNumbers(facts: unknown): Set<number> {
  const out = new Set<number>()
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.add(v)
    else if (typeof v === "string") numbersIn(v).forEach((n) => out.add(n))
    else if (Array.isArray(v)) {
      const counts = v.map((x) => (x && typeof x === "object" ? (x as any).n : undefined)).filter((n): n is number => typeof n === "number")
      if (counts.length) out.add(counts.reduce((a, b) => a + b, 0))
      v.forEach(walk)
    } else if (v && typeof v === "object") Object.values(v).forEach(walk)
  }
  walk(facts)
  return out
}

/** A narrative is usable only if it is short, has no link, and states no number that is not in the facts. Returns the reason it is not, or null. */
export function narrativeProblem(text: string, facts: unknown, maxChars = 700): string | null {
  const t = text.trim()
  if (!t) return "empty"
  if (t.length > maxChars) return "too long"
  if (/https?:\/\/|www\./i.test(t)) return "contains a link"
  const allowed = factNumbers(facts)
  const stray = numbersIn(t).find((n) => !allowed.has(n))
  return stray === undefined ? null : `states ${stray}, which is not in the data`
}
