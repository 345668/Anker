import { firmDedupKeys } from "@/lib/matching/v2/dedup"

/**
 * Batches of `score_investors` in one run, merged into one ranking.
 *
 * Each call used to write its own workbook, so a run that scored a "sports" search and then a
 * "health" search handed the user two files, each ranked only against itself. Rows from every
 * call that used the SAME thesis are now merged, de-duplicated and ranked together, and the
 * latest workbook holds all of them. A different thesis is a different question, so it is kept
 * apart: scores written against one thesis mean nothing next to scores for another.
 */
export interface ScoredRow {
  name: string; type: string; location: string; website: string; score: number; tier: string; reason: string
}

const thesisKey = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim()

export class ScoredBatches {
  private readonly rows = new Map<string, Map<string, ScoredRow>>()
  private readonly aliases = new Map<string, Map<string, string>>()
  private readonly counts = new Map<string, number>()

  /** Merge one batch. A firm already scored under this thesis keeps its higher score. */
  add(thesis: string, batch: ScoredRow[]): { ranked: ScoredRow[]; batches: number; added: number } {
    const t = thesisKey(thesis)
    const map = this.rows.get(t) ?? new Map<string, ScoredRow>()
    const alias = this.aliases.get(t) ?? new Map<string, string>()    // any name a firm answers to -> its row key
    this.rows.set(t, map)
    this.aliases.set(t, alias)
    this.counts.set(t, (this.counts.get(t) ?? 0) + 1)
    let added = 0
    for (const row of batch) {
      const keys = firmDedupKeys(row.name)
      if (!keys.length) keys.push(row.name.toLowerCase())
      // One firm may already be held under any of its names: "500 Global (prev 500 Startups)" meets
      // both the plain "500 Global" and the plain "500 Startups".
      const owners = [...new Set(keys.map((k) => alias.get(k)).filter((k): k is string => !!k))]
      if (!owners.length) { map.set(keys[0], row); added++; keys.forEach((k) => alias.set(k, keys[0])); continue }
      const [target, ...others] = owners
      let best = map.get(target)!
      for (const o of others) {                   // this record bridges two held rows: fold them into one
        const extra = map.get(o)!
        if (extra.score > best.score) best = extra
        map.delete(o)
        for (const [k, v] of alias) if (v === o) alias.set(k, target)
      }
      map.set(target, row.score > best.score ? row : best)
      keys.forEach((k) => alias.set(k, target))
    }
    return { ranked: [...map.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)), batches: this.counts.get(t)!, added }
  }
}
