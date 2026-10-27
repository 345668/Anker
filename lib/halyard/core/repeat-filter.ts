/**
 * The same speech, transcribed twice, on the same channel (ported from the Halyard desktop `src/repeat-filter.js`; behaviour identical, proved by the differential test).
 *
 * Deliberately reluctant: people do repeat themselves. A turn is dropped only when it is long AND nearly all of its word trigrams already occurred on the same channel within
 * the window. Trigrams rather than a bag of words: a re-transcription preserves word order, a new sentence on the same topic shares vocabulary but almost no three-word runs.
 */
export function tokenize(text: unknown): string[] {
  return String(text || "").toLowerCase().replace(/[$€£]/g, " ").replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean)
}
function trigrams(tokens: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i + 2 < tokens.length; i++) out.push(tokens[i] + " " + tokens[i + 1] + " " + tokens[i + 2])
  return out
}
/** Share of the candidate's trigrams present anywhere in the reference's. */
export function trigramContainment(candidateTokens: string[], referenceTokens: string[]): number {
  const grams = trigrams(candidateTokens)
  if (!grams.length) return 0
  const pool = new Set(trigrams(referenceTokens))
  let hit = 0
  for (const g of grams) if (pool.has(g)) hit += 1
  return hit / grams.length
}
export interface RepeatOptions { windowMs?: number; similarity?: number; minTokens?: number; history?: number }
export const DEFAULTS = { windowMs: 120000, similarity: 0.7, minTokens: 10, history: 16 }
type Remembered = { tokens: string[]; ts: number }

export function createRepeatFilter(options: RepeatOptions = {}) {
  const config = { ...DEFAULTS, ...options }
  const recent: Record<string, Remembered[]> = { you: [], them: [] }
  let suppressed = 0
  let last: { channel: string; text: string; similarity: number; ts: number } | null = null
  const prune = (list: Remembered[], ts: number) => { while (list.length && (ts - list[0].ts > config.windowMs || list.length > config.history)) list.shift() }
  const api = {
    /** Without recording anything. */
    inspect(channel: string, text: string, ts: number = Date.now()): { repeat: boolean; similarity: number } {
      const tokens = tokenize(text)
      const list = recent[channel] || []
      prune(list, ts)
      if (tokens.length < config.minTokens || !list.length) return { repeat: false, similarity: 0 }
      const similarity = trigramContainment(tokens, list.flatMap((t) => t.tokens))
      return { repeat: similarity >= config.similarity, similarity }
    },
    /** Checks a turn and, when it is new, remembers it. A repeat is counted and NOT remembered, so it cannot vouch for a third copy. */
    isRepeat(channel: string, text: string, ts: number = Date.now()): boolean {
      const verdict = api.inspect(channel, text, ts)
      if (verdict.repeat) { suppressed += 1; last = { channel, text, similarity: verdict.similarity, ts }; return true }
      if (!recent[channel]) recent[channel] = []
      recent[channel].push({ tokens: tokenize(text), ts })
      prune(recent[channel], ts)
      return false
    },
    reset() { recent.you = []; recent.them = []; suppressed = 0; last = null },
    get report() { return { suppressed, last } },
  }
  return api
}
