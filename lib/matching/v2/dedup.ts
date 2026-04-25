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
export function normalizeFirmName(name: string): string {
  if (!name) return ""
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
