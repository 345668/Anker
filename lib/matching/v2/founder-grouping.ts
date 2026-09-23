/**
 * Group matches by firm (docs/architecture/11 §5).
 *
 * The unit a founder contacts is a firm; the question for people is who at
 * that firm. Each firm group carries a primary contact and up to two
 * alternates, chosen by contact rank. People with no firm in the directory
 * are independent investors, ranked on their own.
 *
 * Pure — no database. The engine scores; this only arranges.
 */
import { normalizeFirmName, normalizeEmail } from "./dedup"
import { tierFor } from "./types"
import type { FirmGroup, InvestorSegment, ScoredInvestorEntity } from "./founder-types"

export type Scored = ScoredInvestorEntity & {
  segments: InvestorSegment[]
  /** Tie-breakers (doc 11 §4.11). */
  semanticValue?: number
  qualityValue?: number
  /** Firm record has neither sectors nor stages. */
  sparse?: boolean
}

export const ALTERNATES = 2

/** Doc 11 §5: 0.60·fit + 0.25·seniority + 0.15·contact quality. */
export function contactRank(p: Scored): number {
  const fit = Math.max(0, Math.min(1, p.score / 100))
  const status = p.emailStatus
  const contact = p.email && status !== "invalid"
    ? (status === "valid" ? 1 : status === "risky" ? 0.45 : 0.6)
    : p.linkedin ? 0.3 : 0
  return 0.6 * fit + 0.25 * (p.seniority ?? 0.5) + 0.15 * contact
}

/** Verified first, then unconfirmed, then risky; never an invalid address. */
function sendableOrder(p: Scored): number {
  if (!p.email || p.emailStatus === "invalid") return 3
  if (p.emailStatus === "valid") return 0
  if (p.emailStatus === "risky") return 2
  return 1
}

export function compareRanked(a: Scored, b: Scored): number {
  return b.score - a.score
    || (b.semanticValue ?? 0) - (a.semanticValue ?? 0)
    || (b.qualityValue ?? 0) - (a.qualityValue ?? 0)
    || a.name.localeCompare(b.name)
    || String(a.id).localeCompare(String(b.id))
}

/** Choose the primary contact and alternates from a firm's people. */
export function chooseContacts(people: Scored[]): { primary: Scored | null; alternates: Scored[] } {
  const ranked = [...people].sort((a, b) => (b.contactRank ?? contactRank(b)) - (a.contactRank ?? contactRank(a)) || compareRanked(a, b))
  if (!ranked.length) return { primary: null, alternates: [] }
  // The best-ranked person who can actually be emailed, preferring verified addresses among near-equals.
  const reachable = ranked.filter((p) => sendableOrder(p) < 3)
  const top = reachable.length ? reachable : ranked
  const bestRank = top[0].contactRank ?? contactRank(top[0])
  const nearBest = top.filter((p) => bestRank - (p.contactRank ?? contactRank(p)) <= 0.05)
  const primary = [...nearBest].sort((a, b) => sendableOrder(a) - sendableOrder(b))[0]
  return { primary, alternates: ranked.filter((p) => p !== primary).slice(0, ALTERNATES) }
}

export interface GroupingResult {
  groups: FirmGroup[]
  independents: Scored[]
  duplicatesMerged: number
}

/**
 * @param firms       every scored firm (no floor applied yet)
 * @param people      every scored person
 * @param directoryFirmIds every firm id in the directory, qualified or not
 */
export function groupByFirm(firms: Scored[], people: Scored[], directoryFirmIds: Set<string>, minScore: number): GroupingResult {
  // ─── Duplicate firms: keep the best-scored record, alias the others to it ─
  const byName = new Map<string, Scored[]>()
  for (const f of firms) {
    const key = normalizeFirmName(f.name) || String(f.id)
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key)!.push(f)
  }
  const alias = new Map<string, string>()
  const firmById = new Map<string, Scored>()
  let duplicatesMerged = 0
  for (const dupes of byName.values()) {
    dupes.sort(compareRanked)
    const winner = { ...dupes[0] }
    for (const other of dupes.slice(1)) {
      duplicatesMerged++
      alias.set(String(other.id), String(winner.id))
      winner.website = winner.website || other.website
      winner.linkedin = winner.linkedin || other.linkedin
    }
    firmById.set(String(winner.id), winner)
  }

  // ─── Duplicate people: same email is the same person ─────────────────────
  const seenEmail = new Map<string, Scored>()
  const uniquePeople: Scored[] = []
  for (const p of [...people].sort(compareRanked)) {
    const e = normalizeEmail(p.email)
    if (e && seenEmail.has(e)) { duplicatesMerged++; continue }
    if (e) seenEmail.set(e, p)
    uniquePeople.push(p)
  }

  // ─── People to firms ─────────────────────────────────────────────────────
  const peopleByFirm = new Map<string, Scored[]>()
  const independents: Scored[] = []
  for (const p of uniquePeople) {
    const raw = p.firmId ? String(p.firmId) : null
    const fid = raw ? alias.get(raw) ?? raw : null
    if (fid && firmById.has(fid)) {
      if (!peopleByFirm.has(fid)) peopleByFirm.set(fid, [])
      peopleByFirm.get(fid)!.push({ ...p, firmId: fid, firmName: firmById.get(fid)!.name, contactRank: contactRank(p) })
    } else if (!fid || !directoryFirmIds.has(raw!)) {
      // No firm, or a firm the directory does not hold: an independent investor.
      if (p.score >= minScore) independents.push(p)
    }
    // A person whose firm is in the directory follows that firm; if the firm
    // does not qualify, neither do they.
  }

  // ─── Groups ──────────────────────────────────────────────────────────────
  const groups: FirmGroup[] = []
  for (const [fid, firm] of firmById) {
    const members = peopleByFirm.get(fid) ?? []
    let score = firm.score
    let scoreFrom: FirmGroup["scoreFrom"] = "firm"
    const best = members.reduce((m, p) => Math.max(m, p.score), 0)
    if (firm.sparse && best - 5 > firm.score) { score = Math.round((best - 5) * 10) / 10; scoreFrom = "people" }
    if (score < minScore) continue
    const { primary, alternates } = chooseContacts(members)
    groups.push({
      firm: { ...firm, score, tier: tierFor(score) },
      primary, alternates, scoreFrom, peopleScored: members.length,
    })
  }
  groups.sort((a, b) => compareRanked(a.firm as Scored, b.firm as Scored))
  independents.sort(compareRanked)
  return { groups, independents, duplicatesMerged }
}
