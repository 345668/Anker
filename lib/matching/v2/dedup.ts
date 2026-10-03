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
/**
 * Spell accented letters the way a keyboard without them does: "Gründerfonds" and "Gruenderfonds" are
 * one word, "Société" and "Societe" too. German umlauts and ß take their two-letter forms; every
 * other accent is simply dropped. Without this "ü" became a space and the two spellings never met.
 */
export function foldAccents(s: string): string {
  return s
    .replace(/ä/gi, (m) => (m === "Ä" ? "Ae" : "ae")).replace(/ö/gi, (m) => (m === "Ö" ? "Oe" : "oe"))
    .replace(/ü/gi, (m) => (m === "Ü" ? "Ue" : "ue")).replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

export function normalizeFirmName(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return ""
  let s = foldAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  // Strip trailing suffixes (one or more)
  let changed = true
  while (changed) {
    changed = false
    // "… Management GmbH & Co. KG": once "KG" and "Co" are gone a dangling "&" is left.
    if (s.endsWith(" &")) { s = s.slice(0, -2).trim(); changed = true; continue }
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
  // Two records are one firm when they share ANY name key: the name as written (as before), the same
  // name without spacing ("CourtsideVC" / "Courtside VC"), or a former name the record states
  // ("500 Global (prev 500 Startups)" meets a plain "500 Startups" and a plain "500 Global").
  const parent = firms.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const owner = new Map<string, number>()
  firms.forEach((f, i) => {
    const compactStored = (f.normalizedName || "").replace(/[^a-z0-9]/g, "")
    const keys = new Set([...firmDedupKeys(f.name), ...(compactStored ? [compactStored] : [])])
    if (!keys.size) keys.add(f.name.toLowerCase())
    for (const k of keys) {
      const j = owner.get(k)
      if (j === undefined) owner.set(k, i)
      else { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b) }
    }
  })
  const groups = new Map<number, ScoredFirmV2[]>()
  firms.forEach((f, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(f)
  })

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

// ─── Renames ────────────────────────────────────────────────────────────────

const MARK = "(?:formerly|previously|prev\\.?|fka|f\\/k\\/a|aka|a\\/k\\/a|n[ée]e|was)"
/** "500 Global (prev 500 Startups)", "Acme (fka Beta, Gamma)": the rename sits in brackets. */
const PAREN_RENAME = new RegExp(`\\(\\s*${MARK}[\\s:.-]+([^)]+)\\)`, "gi")
/** "Acme Capital, formerly Beta Partners", "Acme - fka Beta": the rename trails the name. */
const TRAIL_RENAME = new RegExp(`(?:,|;|\\s[-–—])\\s*(?:formerly|previously|prev\\.?|fka|f\\/k\\/a|aka)[\\s:.-]+(.+)$`, "i")

/**
 * A firm record's current name and the other names it says it has or had.
 *
 * "500 Global (prev 500 Startups)" is one firm with two names, and the directory also holds a
 * plain "500 Global" and a plain "500 Startups". Only an explicit rename marker counts: a bracket
 * such as "AAF Management (AAF VC)" or "Cashmere Fund (Josh Allen)" is a brand or a person, and a
 * "/" in "Innovate Mississippi / MS Angel Network" joins programmes of one record, so neither is
 * read as an alias.
 */
/** "HTGF", "TGFS": a short all-capitals token, how a firm's acronym sits next to its full name. */
const isAcronym = (t: string) => /^[A-Z0-9]{2,8}$/.test(t.trim())

/**
 * "HTGF | High-Tech Gründerfonds" and "TGFS – Technologiegründerfonds Sachsen" write the acronym and the
 * full name side by side. A pipe always separates two names; a spaced dash does only when one side is a
 * bare acronym ("Acme - Berlin" is one name). The longer, non-acronym side is the firm's name; the
 * others are what it is also called.
 */
function splitBrand(name: string): string[] {
  const bar = name.split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean)
  const parts = bar.flatMap((p) => {
    const d = p.split(/\s+[-–—]\s+/).map((x) => x.trim()).filter(Boolean)
    return d.length === 2 && d.some(isAcronym) ? d : [p]
  })
  return parts.length > 1 ? parts : [name]
}

export function firmNameParts(name: string | null | undefined): { main: string; aliases: string[] } {
  if (!name || typeof name !== "string") return { main: "", aliases: [] }
  const brand = splitBrand(name)
  if (brand.length > 1) {
    const sorted = [...brand].sort((a, b) => Number(isAcronym(a)) - Number(isAcronym(b)) || b.length - a.length)
    const [lead, ...rest] = sorted
    const inner = firmNameParts(lead)
    return { main: inner.main, aliases: [...inner.aliases, ...rest] }
  }
  const found: string[] = []
  let main = name.replace(PAREN_RENAME, (_m, alias: string) => { found.push(alias); return " " })
  const trail = TRAIL_RENAME.exec(main)
  if (trail) { found.push(trail[1]); main = main.slice(0, trail.index) }
  const aliases = found.flatMap((a) => a.split(/\s*(?:\/|,|;|\band\b|\bor\b)\s*/i)).map((a) => a.trim()).filter(Boolean)
  return { main: main.replace(/\s+/g, " ").trim(), aliases }
}

/**
 * The key two records share when they are the same firm written differently.
 *
 * normalizeFirmName strips legal suffixes but keeps spaces, so "CourtsideVC" ("courtsidevc")
 * and "Courtside VC" ("courtside vc") stayed two firms and the same fund appeared twice in a
 * founder's top 25. Removing the spaces makes them equal. It deliberately does NOT strip "vc":
 * "Lead VC" and "Lead Capital" are different firms. A rename marker is not part of the name.
 */
export function firmDedupKey(name: string | null | undefined): string {
  return normalizeFirmName(firmNameParts(name).main).replace(/[^a-z0-9]/g, "")
}

/**
 * Every key a record answers to: its own, then those of the names it says it was or is also called.
 * An alias too short to be distinctive (under three characters) is ignored, as is one equal to the
 * firm's own key.
 */
export function firmDedupKeys(name: string | null | undefined): string[] {
  const { main, aliases } = firmNameParts(name)
  const own = firmDedupKey(main)
  const keys = own ? [own] : []
  for (const a of aliases) {
    const k = firmDedupKey(a)
    if (k.length >= 3 && !keys.includes(k)) keys.push(k)
  }
  return keys
}

/**
 * Cluster firm records that are the same firm. Two records join when any of their dedup keys
 * (own name or a stated former name) are equal, or when they share a real website and one key begins with the other (at least five
 * characters), which catches "Courtside Ventures LLC" next to "CourtsideVC" on one site.
 * Returns, for each input index, the index of its cluster's first member.
 */
export function clusterFirms(records: { name: string | null | undefined; website?: string | null }[]): number[] {
  const parent = records.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb) }
  const allKeys = records.map((r) => firmDedupKeys(r.name))
  const keys = allKeys.map((k) => k[0] ?? "")
  const hosts = records.map((r) => siteHost(r.website))
  const byKey = new Map<string, number>()
  const byHost = new Map<string, number[]>()
  records.forEach((_, i) => {
    // Any shared key joins two records: a record that says "prev 500 Startups" answers to both names.
    for (const key of allKeys[i]) { const j = byKey.get(key); if (j === undefined) byKey.set(key, i); else union(i, j) }
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
