/**
 * The microphone hears the speakers, and the words come back as yours (ported from the Halyard desktop `src/echo-filter.js`).
 *
 * Deliberately reluctant: suppressing a real turn is much worse than keeping an echoed one. A turn is dropped only when a remote turn landed within a short window AND nearly all
 * of its content words appear in that remote turn AND it is long enough that the overlap cannot be coincidence. Every suppression is counted and reported.
 */
const STOPWORDS = new Set(["the", "a", "an", "and", "or", "but", "so", "of", "to", "in", "on", "at", "for", "is", "it", "this", "that", "we", "you", "i", "they", "he", "she", "with", "as", "be", "are", "was", "were", "have", "has", "had", "do", "does", "did", "not"])
export function tokenize(text: unknown): string[] { return String(text || "").toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean) }
function contentWords(tokens: string[]): string[] {
  const content = tokens.filter((t) => !STOPWORDS.has(t))
  return content.length ? content : tokens          // an utterance of nothing but stopwords falls back to the raw tokens
}
/** How much of the candidate is already present in the reference, as a multiset (containment, not Jaccard: an echo is a degraded, shorter copy). */
export function containment(candidate: string[], reference: string[]): number {
  if (!candidate.length) return 0
  const pool = new Map<string, number>()
  for (const word of reference) pool.set(word, (pool.get(word) || 0) + 1)
  let covered = 0
  for (const word of candidate) { const left = pool.get(word) || 0; if (left > 0) { pool.set(word, left - 1); covered += 1 } }
  return covered / candidate.length
}
export interface EchoOptions { windowMs?: number; similarity?: number; minContentWords?: number; history?: number }
export const DEFAULTS = { windowMs: 8000, similarity: 0.8, minContentWords: 5, history: 12 }

export function createEchoFilter(options: EchoOptions = {}) {
  const config = { ...DEFAULTS, ...options }
  let remote: Array<{ tokens: string[]; ts: number; text: string }> = []
  let suppressed = 0
  let lastSuppressed: { text: string; similarity: number; ts: number } | null = null
  const api = {
    /** Records a remote turn, which is what a local echo would be a copy of. */
    noteRemote(text: string, ts: number = Date.now()) {
      const tokens = contentWords(tokenize(text))
      if (!tokens.length) return
      remote.push({ tokens, ts, text })
      if (remote.length > config.history) remote.shift()
    },
    inspect(text: string, ts: number = Date.now()): { echo: boolean; similarity: number; of: string | null } {
      const tokens = contentWords(tokenize(text))
      const miss = { echo: false, similarity: 0, of: null as string | null }
      if (tokens.length < config.minContentWords) return miss
      let best = miss
      for (const turn of remote) {
        if (Math.abs(ts - turn.ts) > config.windowMs) continue
        const score = containment(tokens, turn.tokens)
        if (score > best.similarity) best = { echo: score >= config.similarity, similarity: score, of: turn.text }
      }
      return best
    },
    isEcho(text: string, ts: number = Date.now()): boolean {
      const verdict = api.inspect(text, ts)
      if (verdict.echo) { suppressed += 1; lastSuppressed = { text, similarity: verdict.similarity, ts } }
      return verdict.echo
    },
    reset() { remote = []; suppressed = 0; lastSuppressed = null },
    get report() { return { suppressed, last: lastSuppressed } },
  }
  return api
}
