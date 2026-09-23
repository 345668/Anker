/**
 * Word-and-phrase matching — the only way vocabulary is matched in matching
 * and Discover (docs/architecture/14 §4).
 *
 * The previous matchers tested substrings, so "ai" matched "retail", "ar"
 * (AR/VR) matched "software" and "healthcare", and "la" (Los Angeles) matched
 * "Netherlands" — 92% of firms "overlapped" a sports-tech startup and 1,648
 * non-US firms were scored as US-based.
 */

/** Lower-case, strip accents, and reduce every run of non-alphanumerics to one space. */
export function normPhrase(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function words(s: string): string[] {
  const n = normPhrase(s)
  return n ? n.split(" ") : []
}

/**
 * A dictionary of phrases (1–`maxWords` words) to values, matched on whole
 * words only. Longest match wins at each position, so "digital health" is one
 * phrase rather than "digital" + "health".
 */
export class PhraseMap<V> {
  private readonly map = new Map<string, V>()
  private maxWords = 1

  set(phrase: string, value: V): this {
    const key = normPhrase(phrase)
    if (!key) return this
    this.map.set(key, value)
    this.maxWords = Math.max(this.maxWords, key.split(" ").length)
    return this
  }

  get(phrase: string): V | undefined {
    return this.map.get(normPhrase(phrase))
  }

  /** Every value found in `text`, in order of appearance, longest phrase first at each position. */
  findAll(text: string): V[] {
    const w = words(text)
    const out: V[] = []
    for (let i = 0; i < w.length; ) {
      let matched = 0
      for (let n = Math.min(this.maxWords, w.length - i); n >= 1; n--) {
        const v = this.map.get(w.slice(i, i + n).join(" "))
        if (v !== undefined) { out.push(v); matched = n; break }
      }
      i += matched || 1
    }
    return out
  }
}

/** Parse a stored list: a JS array, a JSON array string, or a comma/semicolon/pipe list. */
export function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim())
  if (typeof v === "string" && v.trim()) {
    const s = v.trim()
    if (s.startsWith("[")) {
      try {
        const p = JSON.parse(s)
        if (Array.isArray(p)) return toList(p)
      } catch { /* fall through to splitting */ }
    }
    return s.split(/[,;|]/).map((x) => x.trim()).filter(Boolean)
  }
  return []
}
