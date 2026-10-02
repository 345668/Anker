/**
 * Deduplication utilities.
 *
 * The raw Anker investor database has duplicates — same firm appearing as
 * "GroveStreet" and "GROVE STREET ADVISORS LLC", same person appearing twice
 * with different email casings. The engine merges these so the deliverable
 * doesn't double-count.
 */

import type { ScoredFirmV2, ScoredContactV2 } from "./types"

const COMPANY_SUFFIXES = [
  "llc", "l.l.c.", "lp", "l.p.", "llp",
  "inc", "inc.", "incorporated",
  "corp", "corp.", "corporation",
  "co", "co.", "company",
  "ltd", "ltd.", "limited",
  "gmbh", "ag", "kg", "ohg",
  "sa", "s.a.", "sas", "sarl",
  "plc", "pty",
  "advisors", "advisers", "partners", "capital", "management", "group", "holdings",
  "fund", "funds", "investments", "ventures",
]

/**
 * Normalize a firm name: lowercase, strip suffixes, collapse whitespace.
 * "GROVE STREET ADVISORS LLC" → "grove street"
 */
export function normalizeFirmName(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return ""
  let s = name
    .toLowerCase()
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  // Strip trailing suffixes (one or more)
  let changed = true
  while (changed) {
    changed = false
    for (const suf of COMPANY_SUFFIXES) {
      if (s.endsWith(" " + suf)) {
        s = s.slice(0, -suf.length - 1).trim()
        changed = true
        break
      }
    }
  }
  return s
}

export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return ""
  return email.toLowerCase().trim()
}

/**
 * Merge duplicate firms. Keeps the highest-scored variant; merges tags &
 * reasons; carries over website/linkedin/aum from non-empty sources.
 */
export function dedupFirms(firms: ScoredFirmV2[]): { merged: ScoredFirmV2[]; mergedCount: number } {
  const groups = new Map<string, ScoredFirmV2[]>()
  for (const f of firms) {
    const key = f.normalizedName || f.name.toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }

  const merged: ScoredFirmV2[] = []
  let mergedCount = 0

  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0])
      continue
    }
    mergedCount += group.length - 1
    // Pick winner = highest score
    group.sort((a, b) => b.score - a.score)
    const winner = { ...group[0] }
    const tags = new Set(winner.tags)
    const reasons = new Set(winner.reasons)
    for (const other of group.slice(1)) {
      other.tags.forEach((t) => tags.add(t))
      other.reasons.forEach((r) => reasons.add(r))
      // Backfill missing fields from runners-up
      winner.website = winner.website || other.website
      winner.linkedin = winner.linkedin || other.linkedin
      winner.aumRaw = winner.aumRaw || other.aumRaw
      winner.aumUsd = winner.aumUsd ?? other.aumUsd
      winner.description = winner.description || other.description
    }
    // ANCHOR is a statement about THIS firm's capacity for THIS fund
    // (doc 19 §3), so it is never inherited from a merged duplicate.
    if (!winner.isAnchor) tags.delete("ANCHOR")
    winner.tags = Array.from(tags)
    winner.reasons = Array.from(reasons).slice(0, 6)
    merged.push(winner)
  }
  return { merged, mergedCount }
}

/**
 * Merge duplicate contacts by normalized email (primary) or name+location.
 */
export function dedupContacts(contacts: ScoredContactV2[]): { merged: ScoredContactV2[]; mergedCount: number } {
  const groups = new Map<string, ScoredContactV2[]>()
  for (const c of contacts) {
    const emailKey = normalizeEmail(c.email)
    const key = emailKey || `${c.name.toLowerCase()}|${c.location.toLowerCase()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  const merged: ScoredContactV2[] = []
  let mergedCount = 0

  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0])
      continue
    }
    mergedCount += group.length - 1
    group.sort((a, b) => b.score - a.score)
    const winner = { ...group[0] }
    const tags = new Set(winner.tags)
    const reasons = new Set(winner.reasons)
    const hnw = new Set(winner.hnwSignals)
    for (const other of group.slice(1)) {
      other.tags.forEach((t) => tags.add(t))
      other.reasons.forEach((r) => reasons.add(r))
      other.hnwSignals.forEach((s) => hnw.add(s))
      winner.email = winner.email || other.email
      winner.linkedin = winner.linkedin || other.linkedin
      winner.title = winner.title || other.title
      winner.bio = winner.bio || other.bio
    }
    winner.tags = Array.from(tags)
    winner.reasons = Array.from(reasons).slice(0, 6)
    winner.hnwSignals = Array.from(hnw)
    merged.push(winner)
  }
  return { merged, mergedCount }
}

/** Hosts that say nothing about which firm a record is. */
const GENERIC_HOSTS = new Set([
  "linkedin.com", "facebook.com", "twitter.com", "x.com", "instagram.com", "crunchbase.com", "angel.co",
  "wellfound.com", "pitchbook.com", "medium.com", "github.com", "youtube.com", "linktr.ee", "notion.so", "google.com",
])

/** "https://www.Example.com/about" -> "example.com", or "" when absent or not informative. */
export function siteHost(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return ""
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "")
    return host && !GENERIC_HOSTS.has(host) && host.includes(".") ? host : ""
  } catch { return "" }
}

/**
 * The key two records share when they are the same firm written differently.
 *
 * normalizeFirmName strips legal suffixes but keeps spaces, so "CourtsideVC" ("courtsidevc")
 * and "Courtside VC" ("courtside vc") stayed two firms and the same fund appeared twice in a
 * founder's top 25. Removing the spaces makes them equal. It deliberately does NOT strip "vc":
 * "Lead VC" and "Lead Capital" are different firms.
 */
export function firmDedupKey(name: string | null | undefined): string {
  return normalizeFirmName(name).replace(/[^a-z0-9]/g, "")
}

/**
 * Cluster firm records that are the same firm. Two records join when their dedup keys are
 * equal, or when they share a real website and one key begins with the other (at least five
 * characters), which catches "Courtside Ventures LLC" next to "CourtsideVC" on one site.
 * Returns, for each input index, the index of its cluster's first member.
 */
export function clusterFirms(records: { name: string | null | undefined; website?: string | null }[]): number[] {
  const parent = records.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb) }
  const keys = records.map((r) => firmDedupKey(r.name))
  const hosts = records.map((r) => siteHost(r.website))
  const byKey = new Map<string, number>()
  const byHost = new Map<string, number[]>()
  records.forEach((_, i) => {
    if (keys[i]) { const j = byKey.get(keys[i]); if (j === undefined) byKey.set(keys[i], i); else union(i, j) }
    if (hosts[i]) { const l = byHost.get(hosts[i]) ?? []; l.push(i); byHost.set(hosts[i], l) }
  })
  for (const idx of byHost.values()) {
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
      const ka = keys[idx[a]], kb = keys[idx[b]]
      const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka]
      if (short.length >= 5 && long.startsWith(short)) union(idx[a], idx[b])
    }
  }
  return records.map((_, i) => find(i))
}
