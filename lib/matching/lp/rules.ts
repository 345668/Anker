/**
 * The hard rules of an LP run (docs/architecture/63 section 4.2): who is left out before anything is scored, and why.
 * Pure: the loaded facts go in, a decision per row comes out, and the reasons are counted so nothing disappears silently.
 */
import { decideUse, type SourceRow } from "@/lib/directory/use-gate"

export type LpExclusionReason =
  | "source" | "restrictedPerson" | "jurisdiction" | "suppressed" | "saved" | "alreadyYours" | "declined" | "inCrm"

export type LpExclusionCounts = Record<LpExclusionReason, number> & { total: number }
export const emptyExclusionCounts = (): LpExclusionCounts =>
  ({ source: 0, restrictedPerson: 0, jurisdiction: 0, suppressed: 0, saved: 0, alreadyYours: 0, declined: 0, inCrm: 0, total: 0 })

/** What the run needs to know about the workspace and the directory before it starts. */
export interface LpRuleData {
  /** `firm:<id>` and `contact:<id>` the workspace already holds, and the strongest reason (see priority below). */
  keys: Map<string, "inCrm" | "declined" | "saved" | "alreadyYours">
  /** Addresses suppressed for this user or for everyone. Lower-cased. */
  emails: Set<string>
  /** Investors already in this fund: lower-cased addresses and normalised names. */
  yoursEmails: Set<string>
  yoursNames: Set<string>
  /** The directory source register by source name, and whether the use gate flag is on. */
  sources: Map<string, SourceRow>
  gateOn: boolean
  /** Upper-case country codes the fund does not approach. */
  excludedCountries: Set<string>
  /** Show the LPs already in the CRM anyway (the "show them anyway" switch). Declined, saved and already-yours stay out. */
  includeKnown?: boolean
}

export const emptyRuleData = (): LpRuleData => ({
  keys: new Map(), emails: new Set(), yoursEmails: new Set(), yoursNames: new Set(),
  sources: new Map(), gateOn: false, excludedCountries: new Set(),
})

export const normName = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
const sourceKey = (s: string | null | undefined) => (s ?? "").trim() || "unknown"

export interface FirmRowFacts { id: string; name: string | null; source: string | null; norm_country: string | null }
export interface PersonRowFacts { id: string; email: string | null; source: string | null; restricted_at: unknown; norm_country: string | null; firm_id: string | null; name: string }

export interface LpRules {
  firm: (row: FirmRowFacts) => LpExclusionReason | null
  person: (row: PersonRowFacts) => LpExclusionReason | null
}

/** A source the gate refuses for internal matching: withdrawn, or a recorded licence that does not list matching. An unreviewed source is allowed (doc 54). */
function sourceBlocked(src: string | null, data: LpRuleData): boolean {
  const d = decideUse(data.sources.get(sourceKey(src)) ?? null, "internal_matching", data.gateOn)
  return !d.ok && d.enforce
}

export function buildLpRules(data: LpRuleData): LpRules {
  const known = (key: string, firmKey?: string | null): LpExclusionReason | null => {
    const own = data.keys.get(key) ?? null
    // What a firm decided or the fund already holds also covers the people who work there; being merely in the CRM does not.
    const inherited = firmKey ? data.keys.get(firmKey) : undefined
    const reason = own ?? (inherited && inherited !== "inCrm" ? inherited : null)
    if (!reason) return null
    if (reason === "inCrm" && data.includeKnown) return null
    return reason
  }
  return {
    firm(r) {
      if (sourceBlocked(r.source, data)) return "source"
      if (r.norm_country && data.excludedCountries.has(r.norm_country.toUpperCase())) return "jurisdiction"
      if (data.yoursNames.has(normName(r.name)) && normName(r.name)) return "alreadyYours"
      return known(`firm:${r.id}`)
    },
    person(r) {
      if (r.restricted_at) return "restrictedPerson"
      if (sourceBlocked(r.source, data)) return "source"
      if (r.norm_country && data.excludedCountries.has(r.norm_country.toUpperCase())) return "jurisdiction"
      const email = (r.email ?? "").trim().toLowerCase()
      if (email && data.emails.has(email)) return "suppressed"
      if (email && data.yoursEmails.has(email)) return "alreadyYours"
      return known(`contact:${r.id}`, r.firm_id ? `firm:${r.firm_id}` : null)
    },
  }
}

export function countExclusion(counts: LpExclusionCounts, reason: LpExclusionReason) {
  counts[reason]++
  counts.total++
}

/** Plain words for a run summary, only for the reasons that removed something. */
export function describeExclusions(c: LpExclusionCounts): string {
  const parts: string[] = []
  if (c.inCrm) parts.push(`${c.inCrm.toLocaleString("en-US")} already in your CRM`)
  if (c.declined) parts.push(`${c.declined.toLocaleString("en-US")} passed or declined`)
  if (c.saved) parts.push(`${c.saved.toLocaleString("en-US")} excluded by you`)
  if (c.alreadyYours) parts.push(`${c.alreadyYours.toLocaleString("en-US")} already your investors`)
  if (c.suppressed) parts.push(`${c.suppressed.toLocaleString("en-US")} suppressed addresses`)
  if (c.jurisdiction) parts.push(`${c.jurisdiction.toLocaleString("en-US")} in jurisdictions your fund does not approach`)
  if (c.source) parts.push(`${c.source.toLocaleString("en-US")} from sources not cleared for matching`)
  if (c.restrictedPerson) parts.push(`${c.restrictedPerson.toLocaleString("en-US")} people who asked us to restrict their data`)
  return parts.join("; ")
}
