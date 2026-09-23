/**
 * Sector vocabulary with the vertical / horizontal distinction doc 11 §4.2
 * scores on. Built from the existing synonym groups so the terms stay in one
 * place; matched as whole words and phrases only.
 */
import { SYNONYM_GROUPS } from "../industry-synonyms"
import { PhraseMap, toList } from "./text"

export type SectorClass = "vertical" | "horizontal"

export interface SectorGroup {
  /** Canonical name — the first term of the synonym group. */
  id: string
  cls: SectorClass
}

/** Technology categories most generalist funds list; weaker evidence of fit than a market. */
const HORIZONTAL = new Set(["ai", "saas", "data"])

/** Synonym groups that describe investors, not sectors — never a sector match. */
const INVESTOR_GROUPS = new Set([
  "venture studio", "venture capital", "private equity", "family office", "fund of funds",
  "sovereign wealth fund", "institutional investor", "asset & wealth manager", "emerging manager",
])

/**
 * Words that say "we invest broadly" rather than naming a sector. "platform"
 * and "api" sit in the SaaS synonym group, but on their own they describe
 * almost every company, so they count as generic here.
 */
const GENERIC = [
  "technology", "technologies", "tech", "internet", "digital", "platform", "platforms", "api",
  "b2b", "enterprise", "generalist", "sector agnostic", "agnostic", "all sectors", "multi sector",
  "multi-sector", "diversified", "startups", "early stage", "innovation", "other",
]

/**
 * Terms removed from a group because they pull in the wrong investors:
 * "gaming" in the sports group makes every games fund a sports-tech
 * specialist; "ev" is also in mobility; "production" and "content" are too loose.
 */
const DROP: Record<string, string[]> = {
  sports: ["gaming"],
  media: ["production", "content"],
}

const SECTORS = new PhraseMap<SectorGroup>()
const GENERIC_MAP = new PhraseMap<true>()
for (const g of GENERIC) GENERIC_MAP.set(g, true)

for (const group of SYNONYM_GROUPS) {
  const id = group[0]
  if (INVESTOR_GROUPS.has(id)) continue
  const cls: SectorClass = HORIZONTAL.has(id) ? "horizontal" : "vertical"
  for (const term of group) {
    if (DROP[id]?.includes(term)) continue
    if (GENERIC_MAP.get(term)) continue
    // First group wins for a term listed in two groups (e.g. "ev").
    if (!SECTORS.get(term)) SECTORS.set(term, { id, cls })
  }
}

export interface SectorProfile {
  /** Group ids found, deduplicated, in order of appearance. */
  groups: string[]
  verticals: string[]
  horizontals: string[]
  /** Only generic markers were listed ("technology", "generalist" …). */
  generalist: boolean
  /** Nothing was listed at all. */
  empty: boolean
}

/** Classify a stored sector list (array, JSON or comma list). */
export function sectorProfile(raw: unknown): SectorProfile {
  const items = toList(raw)
  const found: SectorGroup[] = []
  let generic = false
  for (const item of items) {
    const hits = SECTORS.findAll(item)
    if (hits.length) found.push(...hits)
    else if (GENERIC_MAP.findAll(item).length) generic = true
  }
  const seen = new Set<string>()
  const groups: string[] = [], verticals: string[] = [], horizontals: string[] = []
  for (const g of found) {
    if (seen.has(g.id)) continue
    seen.add(g.id)
    groups.push(g.id)
    ;(g.cls === "vertical" ? verticals : horizontals).push(g.id)
  }
  return { groups, verticals, horizontals, generalist: !groups.length && generic, empty: items.length === 0 }
}

/** The group a single term belongs to, if any. */
export function sectorGroupOf(term: string): SectorGroup | undefined {
  return SECTORS.findAll(term)[0]
}

/**
 * Word-boundary replacement for the old substring overlap. Same return shape
 * as `hasSectorOverlap` so existing callers can switch without other changes.
 */
export function sectorOverlap(a: unknown, b: unknown): { overlap: boolean; matched: string[]; score: number } {
  const ga = new Set(sectorProfile(a).groups)
  const gb = new Set(sectorProfile(b).groups)
  const matched = [...ga].filter((g) => gb.has(g))
  const union = new Set([...ga, ...gb]).size
  return { overlap: matched.length > 0, matched, score: union ? matched.length / union : 0 }
}

const LABELS: Record<string, string> = {
  ai: "AI", saas: "SaaS", data: "Data & analytics", sports: "Sports tech", healthcare: "Healthcare", fintech: "Fintech",
  edtech: "Edtech", consumer: "Consumer", "e-commerce": "E-commerce & retail", biotech: "Biotech", cleantech: "Climate & cleantech",
  proptech: "Proptech", foodtech: "Food & agtech", mobility: "Mobility & logistics", cybersecurity: "Cybersecurity",
  media: "Media & entertainment", social: "Social & community", hr: "HR tech", "deep tech": "Deep tech", iot: "IoT & hardware",
  ar: "AR/VR", blockchain: "Web3", travel: "Travel", legaltech: "Legaltech", govtech: "Govtech & defense",
}
/** Readable name for a sector group id. */
export function sectorLabel(id: string): string {
  return LABELS[id] ?? id.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}
