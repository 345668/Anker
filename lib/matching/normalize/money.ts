/**
 * Money ranges as investors' records write them: "$50K-$250K", "$1M+",
 * "Up to $500K", "€500k – €2m", "$50,000 - $100,000", "$1MM". Currency is
 * ignored (the directory is overwhelmingly USD and scoring works on ratios).
 */

export interface MoneyRange { min: number | null; max: number | null }

const AMOUNT = /(\d+(?:[.,]\d+)*)\s*(k|m|mm|mn|b|bn|thousand|million|billion)?\b/gi

function scale(n: string, unit: string | undefined): number | null {
  // "50,000" → 50000; "1.5" stays decimal. A comma followed by exactly three
  // digits is a thousands separator; otherwise treat it as a decimal point.
  const cleaned = /,\d{3}(\D|$)/.test(n) ? n.replace(/,/g, "") : n.replace(",", ".")
  const v = Number(cleaned)
  if (!Number.isFinite(v)) return null
  const u = (unit ?? "").toLowerCase()
  if (u === "k" || u === "thousand") return v * 1e3
  if (u === "m" || u === "mm" || u === "mn" || u === "million") return v * 1e6
  if (u === "b" || u === "bn" || u === "billion") return v * 1e9
  return v
}

/** Parse a range; null when no amount can be read. */
export function parseMoneyRange(input: unknown): MoneyRange | null {
  if (typeof input === "number") return Number.isFinite(input) && input > 0 ? { min: input, max: input } : null
  if (typeof input !== "string" || !input.trim()) return null
  const s = input.trim()
  const found: { v: number; unit?: string }[] = []
  for (const m of s.matchAll(AMOUNT)) {
    const v = scale(m[1], m[2])
    if (v != null && v > 0) found.push({ v, unit: m[2] })
  }
  if (!found.length) return null
  // "$1-5M": the unit on the second number applies to the first.
  if (found.length >= 2 && !found[0].unit && found[1].unit) {
    const fixed = scale(String(found[0].v), found[1].unit)
    if (fixed != null) found[0] = { v: fixed, unit: found[1].unit }
  }
  const lower = s.toLowerCase()
  if (/\b(up to|upto|max|maximum|under|below|<)\b/.test(lower) || /^\s*</.test(s)) return { min: null, max: found[0].v }
  if (/\+\s*$/.test(s) || /\b(and above|or more|min|minimum|from|over|above)\b/.test(lower)) {
    return found.length >= 2 ? { min: found[0].v, max: found[1].v } : { min: found[0].v, max: null }
  }
  if (found.length >= 2) {
    const [a, b] = [found[0].v, found[1].v]
    return { min: Math.min(a, b), max: Math.max(a, b) }
  }
  return { min: found[0].v, max: found[0].v }
}

/** Numeric min/max from a record, falling back to a text range. */
export function checkRange(min: unknown, max: unknown, ...texts: unknown[]): MoneyRange | null {
  const num = (v: unknown) => {
    if (v == null || v === "") return null
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const lo = num(min), hi = num(max)
  if (lo != null || hi != null) return { min: lo, max: hi }
  for (const t of texts) {
    const r = parseMoneyRange(t)
    if (r) return r
  }
  return null
}
