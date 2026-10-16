/**
 * Detecting duplicate firms and people in the directory (docs/architecture/55, E1). Pure: rows in, proposed pairs out. Nothing here decides anything or touches a database.
 *
 * The rules are the ones in lib/matching/v2/dedup.ts, used to PROPOSE pairs and never to build clusters: a cluster is transitive, and one acronym record ("FFO") would join four
 * different family offices to each other. A pair is evidence between two records, scored on its own; an ambiguous acronym proposes nothing.
 */
import { firmDedupKeys, firmDedupKey, firmNameParts, foldAccents, siteHost, acronymKey, initialsKey } from "@/lib/matching/v2/dedup"

export type Tier = "certain" | "probable" | "possible"
export interface Candidate { kind: "firm" | "person"; a: string; b: string; tier: Tier; score: number; suggest: "same" | "related"; evidence: Record<string, unknown> }

/** A block bigger than this is a generic word or a shared address, not an identity; it proposes nothing. */
export const MAX_BLOCK = 12
/** An acronym that fits more full names than this is ambiguous. */
export const MAX_ACRONYM_FANOUT = 3

const order = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x])
const keyOf = (x: string, y: string) => { const [a, b] = order(x, y); return `${a}\u0000${b}` }

// ───────────── firms ─────────────
export interface FirmRec { id: string; name: string | null; website?: string | null; source?: string | null }
interface FirmFacts { keys: string[]; own: string; host: string; acr: string | null; ini: string | null }

export function detectFirms(firms: FirmRec[], sharedPeople: Map<string, number> = new Map()): Candidate[] {
  const facts = new Map<string, FirmFacts>()
  const byId = new Map(firms.map((f) => [f.id, f]))
  for (const f of firms) {
    const keys = firmDedupKeys(f.name)
    facts.set(f.id, { keys, own: keys[0] ?? firmDedupKey(f.name), host: siteHost(f.website), acr: acronymKey(f.name), ini: initialsKey(f.name) })
  }
  const pairs = new Map<string, { a: string; b: string; ev: Record<string, any> }>()
  const touch = (x: string, y: string) => {
    const k = keyOf(x, y); let p = pairs.get(k)
    if (!p) { const [a, b] = order(x, y); p = { a, b, ev: {} }; pairs.set(k, p) }
    return p.ev
  }

  // 1. A shared name key (own name or a stated former name).
  const byKey = new Map<string, string[]>()
  for (const [id, f] of facts) for (const k of f.keys) { if (k.length < 3) continue; const l = byKey.get(k); if (l) l.push(id); else byKey.set(k, [id]) }
  for (const [k, ids] of byKey) {
    if (ids.length < 2 || ids.length > MAX_BLOCK) continue
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const ev = touch(ids[i], ids[j]); (ev.sharedKeys ??= []).push(k); if (facts.get(ids[i])!.own === facts.get(ids[j])!.own) ev.sameName = true }
  }

  // 2. A shared real website, where one name begins with the other (at least five characters): "Courtside Ventures LLC" and "CourtsideVC".
  const byHost = new Map<string, string[]>()
  for (const [id, f] of facts) if (f.host) { const l = byHost.get(f.host); if (l) l.push(id); else byHost.set(f.host, [id]) }
  for (const [host, ids] of byHost) {
    if (ids.length < 2 || ids.length > MAX_BLOCK) continue
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const ka = facts.get(ids[i])!.own, kb = facts.get(ids[j])!.own
      const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka]
      if (short !== long && short.length >= 5 && long.startsWith(short)) { const ev = touch(ids[i], ids[j]); ev.prefix = { short, long }; ev.sameHost = host }
      else if (pairs.has(keyOf(ids[i], ids[j]))) pairs.get(keyOf(ids[i], ids[j]))!.ev.sameHost = host
    }
  }

  // 3. An acronym beside the full names whose initials spell it: possible only, and nothing at all when it fits too many.
  const longBy = new Map<string, string[]>()
  for (const [id, f] of facts) if (f.ini) { const l = longBy.get(f.ini); if (l) l.push(id); else longBy.set(f.ini, [id]) }
  for (const [id, f] of facts) {
    const hits = f.acr ? longBy.get(f.acr) : undefined
    if (!hits || !hits.length || hits.length > MAX_ACRONYM_FANOUT) continue
    for (const other of hits) if (other !== id) touch(id, other).initials = f.acr
  }

  // 4. People who sit at both firms.
  for (const [k, n] of sharedPeople) { const [a, b] = k.split("\u0000"); if (byId.has(a) && byId.has(b)) touch(a, b).sharedPeople = n }

  const out: Candidate[] = []
  for (const { a, b, ev } of pairs.values()) {
    const fa = facts.get(a)!, fb = facts.get(b)!
    const hostConflict = !!fa.host && !!fb.host && fa.host !== fb.host
    const hostOk = !hostConflict
    const sameName = !!ev.sameName, aliasKey = !!ev.sharedKeys?.length && !sameName
    const sp = Number(ev.sharedPeople ?? 0)
    let tier: Tier | null = null, suggest: "same" | "related" = "same", score = 0
    if (sameName && ev.sameHost) { tier = "probable"; score = 90 }
    else if (sameName && hostOk) { tier = "probable"; score = 75 }
    else if (sameName && hostConflict) { tier = "possible"; score = 40 }
    else if (aliasKey && hostOk) { tier = "probable"; score = 70 }
    else if (ev.prefix) { tier = "probable"; score = 60; suggest = "related" }
    else if (ev.initials) { tier = "possible"; score = 25 }
    if (sp > 0) { if (tier === "possible" && (sameName || ev.prefix)) tier = "probable"; if (!tier) { tier = "possible"; score = 30 }; score += Math.min(10, sp * 3) }
    if (!tier) continue
    out.push({ kind: "firm", a, b, tier, score: Math.min(99, score), suggest, evidence: { names: [byId.get(a)!.name, byId.get(b)!.name], sources: [byId.get(a)!.source ?? null, byId.get(b)!.source ?? null], ...ev, hostConflict: hostConflict || undefined, hosts: [fa.host || null, fb.host || null] } })
  }
  return out
}

// ───────────── people ─────────────
export interface PersonRow { id: string; first: string | null; last: string | null }
/** Letters only, accents dropped, and the two-letter German spellings (ue, oe, ae) read as the plain vowel, so "Jürgen Müller" meets "Jurgen Muller". */
const fold = (s: string | null | undefined) => foldAccents(String(s ?? "")).toLowerCase().replace(/[^a-z]/g, "").replace(/([aou])e/g, "$1")

/** Two names that could be one person: same surname (or one missing) and the same first name or one first name the initial of the other. */
export function namesCompatible(a: PersonRow, b: PersonRow): boolean {
  const fa = fold(a.first), fb = fold(b.first), la = fold(a.last), lb = fold(b.last)
  if (!fa || !fb) return false
  const first = fa === fb || (fa.length === 1 && fb.startsWith(fa)) || (fb.length === 1 && fa.startsWith(fb))
  const last = la === lb || !la || !lb
  return first && last
}

/** Mailboxes that belong to a team, not a person. */
const ROLE_LOCAL = /^(info|contact|hello|office|admin|team|mail|enquiries|enquiry|invest|investments|investor|investors|ir|press|support|sales|general|reception|deals|submissions|pitch|apply)$/i
export const isRoleMailbox = (email: string) => ROLE_LOCAL.test(email.split("@")[0] ?? "")

export interface PersonGroup { by: "email" | "profile" | "name_firm"; value: string; rows: PersonRow[] }

export function detectPeople(groups: PersonGroup[]): Candidate[] {
  const best = new Map<string, Candidate>()
  const rank = { certain: 3, probable: 2, possible: 1 }
  for (const g of groups) {
    if (g.rows.length < 2 || g.rows.length > MAX_BLOCK) continue
    for (let i = 0; i < g.rows.length; i++) for (let j = i + 1; j < g.rows.length; j++) {
      const x = g.rows[i], y = g.rows[j]
      if (x.id === y.id) continue
      const [a, b] = order(x.id, y.id)
      const compat = namesCompatible(x, y)
      let tier: Tier, score: number
      if (g.by === "email") {
        if (isRoleMailbox(g.value)) { tier = "possible"; score = 20 } else if (compat) { tier = "certain"; score = 96 } else { tier = "possible"; score = 30 }
      } else if (g.by === "profile") { if (compat) { tier = "certain"; score = 97 } else { tier = "probable"; score = 55 } }
      else { tier = "probable"; score = 72 }
      const c: Candidate = { kind: "person", a, b, tier, score, suggest: "same", evidence: { by: [g.by], namesCompatible: compat, roleMailbox: g.by === "email" ? isRoleMailbox(g.value) || undefined : undefined } }
      const k = `${a}\u0000${b}`, old = best.get(k)
      if (!old) best.set(k, c)
      else {
        const by = [...new Set([...(old.evidence.by as string[]), g.by])]
        const win = rank[c.tier] > rank[old.tier] || (rank[c.tier] === rank[old.tier] && c.score > old.score) ? c : old
        best.set(k, { ...win, score: Math.min(99, win.score + (by.length > 1 ? 2 : 0)), evidence: { ...win.evidence, by } })
      }
    }
  }
  return [...best.values()]
}
