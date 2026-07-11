/**
 * IP-topic scoring model for the July 16 Family Office IP Playbook webinar.
 *
 * Given a normalized "candidate" (from Neon investors / CRM / LinkedIn export),
 * returns a score plus per-factor detail so the UI can explain WHY a contact
 * scored what it did. Score is unbounded but typical range is 0..150.
 *
 * The mix targets (60% FO / 30% HNW angel / 10% MFO+IFO) are enforced later
 * in the shortlist step; scoring here is per-contact only.
 */
export type LpType =
  | "family_office"
  | "hnw_angel"
  | "mfo_ifo"
  | "vc"
  | "pe"
  | "other"

export interface ScoringCandidate {
  lp_type?: LpType | string | null
  sectors?: string | null            // comma-separated
  location?: string | null
  headline?: string | null
  title?: string | null
  firm?: string | null
  email?: string | null
  linkedin_url?: string | null
  degree?: number | string | null    // 1/2/3 from LinkedIn export
  tags?: string | string[] | null
  // Prior touch signals — from CRM history / outreach_messages
  previously_replied?: boolean
  previously_opened?: boolean
  previously_bounced?: boolean
  previously_sent?: boolean
}

export interface ScoreConfig {
  eventTopic?: string    // free-text, drives sector-fit bonuses
}

export interface ScoreResult {
  total: number
  details: Array<{ factor: string; delta: number; reason: string }>
  derivedLpType: LpType
}

const FAMILY_OFFICE_HINTS = [
  "family office", "family-office", "single family", "multi family", "multi-family",
  "family capital", "private office", "sfo ", " sfo", "mfo ", " mfo",
]
const HNW_ANGEL_HINTS = [
  "angel", "high net worth", "hnw", "private investor", "individual investor",
]
const MFO_IFO_HINTS = [
  "wealth manager", "wealth management", "private bank", "private banker",
  "ifo ", " ifo", "independent financial", "investment advisor",
]
const VC_HINTS = ["venture capital", "venture partner", "vc partner", "general partner", "gp,", "gp "]
const PE_HINTS = ["private equity", "buyout", "growth equity"]

const IP_HEAVY_SECTORS = [
  "saas", "software", "ai", "artificial intelligence", "biotech", "biotechnology",
  "life sciences", "medtech", "medical", "deeptech", "deep tech", "hardware",
  "semiconductor", "materials", "clean tech", "cleantech", "energy",
]

function normalize(s: any): string {
  return typeof s === "string" ? s.toLowerCase() : ""
}

function deriveLpType(c: ScoringCandidate): LpType {
  const explicit = normalize(c.lp_type)
  if (explicit === "family_office" || explicit === "hnw_angel" || explicit === "mfo_ifo" ||
      explicit === "vc" || explicit === "pe" || explicit === "other") {
    return explicit as LpType
  }
  const blob = [
    c.lp_type, c.headline, c.title, c.firm, c.tags,
  ].map(normalize).join(" | ")
  if (FAMILY_OFFICE_HINTS.some((h) => blob.includes(h))) return "family_office"
  if (MFO_IFO_HINTS.some((h) => blob.includes(h))) return "mfo_ifo"
  if (HNW_ANGEL_HINTS.some((h) => blob.includes(h))) return "hnw_angel"
  if (VC_HINTS.some((h) => blob.includes(h))) return "vc"
  if (PE_HINTS.some((h) => blob.includes(h))) return "pe"
  return "other"
}

export function scoreContact(c: ScoringCandidate, _cfg: ScoreConfig = {}): ScoreResult {
  const details: ScoreResult["details"] = []
  const add = (factor: string, delta: number, reason: string) => {
    if (delta === 0) return
    details.push({ factor, delta, reason })
  }

  const lpType = deriveLpType(c)

  // ── LP type fit ────────────────────────────────────────────────
  switch (lpType) {
    case "family_office": add("lp_type", 40, "Direct family office"); break
    case "mfo_ifo":       add("lp_type", 30, "Multi-family office / IFO"); break
    case "hnw_angel":     add("lp_type", 30, "HNW angel investor"); break
    case "vc":            add("lp_type",  5, "VC (not the target buyer, low fit)"); break
    case "pe":            add("lp_type",  5, "PE (adjacent, low fit)"); break
    case "other":         add("lp_type",  0, "LP type unknown"); break
  }

  // ── Sector fit (IP-heavy sectors = more likely to sit on hidden IP) ──
  const sectorsBlob = normalize(c.sectors) + " " + normalize(c.headline)
  const matchedSectors = IP_HEAVY_SECTORS.filter((s) => sectorsBlob.includes(s))
  if (matchedSectors.length >= 2) {
    add("sectors", 15, `Multiple IP-heavy sectors: ${matchedSectors.slice(0,3).join(", ")}`)
  } else if (matchedSectors.length === 1) {
    add("sectors", 10, `IP-heavy sector: ${matchedSectors[0]}`)
  }

  // ── Reachability ───────────────────────────────────────────────
  const hasEmail = !!c.email && c.email.includes("@")
  const hasLinkedin = !!c.linkedin_url && c.linkedin_url.length > 10
  if (hasEmail && hasLinkedin) add("reach", 25, "Email + LinkedIn present")
  else if (hasEmail)           add("reach", 15, "Email only")
  else if (hasLinkedin)        add("reach", 10, "LinkedIn only")

  // ── LinkedIn degree ────────────────────────────────────────────
  const degree = typeof c.degree === "string" ? parseInt(c.degree, 10) : (c.degree || null)
  if (degree === 1) add("degree", 20, "1st-degree LinkedIn connection")
  else if (degree === 2) add("degree", 10, "2nd-degree LinkedIn connection")

  // ── Prior touch signals ────────────────────────────────────────
  if (c.previously_bounced) add("touch", -60, "Email hard-bounced previously — SKIP")
  if (c.previously_replied) add("touch",  40, "Previously replied — warm")
  if (c.previously_opened && !c.previously_replied) add("touch", 15, "Previously opened but did not reply")
  if (!c.previously_sent && !c.previously_bounced) add("touch", 30, "Never contacted — first impression")

  // ── Location signal (Europe + US preferred for SVS timezone alignment) ──
  const loc = normalize(c.location)
  if (/switzerland|germany|austria|liechtenstein|monaco|netherlands|luxembourg|united kingdom|uk|london|dubai|uae|singapore/.test(loc)) {
    add("location", 5, "European or Gulf FO hub")
  } else if (/united states|usa|new york|san francisco|utah|texas|florida|chicago|boston/.test(loc)) {
    add("location", 5, "US FO hub")
  }

  const total = details.reduce((s, d) => s + d.delta, 0)
  return { total, details, derivedLpType: lpType }
}

// ─── Shortlist selection with LP-mix targets + tier bands ───────────────

export interface ShortlistConfig {
  target: number                       // total shortlist size, e.g. 500
  mix?: Partial<Record<LpType, number>> // proportions summing to 1
  tierBands?: {
    t1Cap: number                      // top-N in T1
    t2Min: number                      // min score for T2
  }
}

const DEFAULT_MIX: Record<LpType, number> = {
  family_office: 0.6,
  hnw_angel: 0.3,
  mfo_ifo: 0.1,
  vc: 0,
  pe: 0,
  other: 0,
}

const DEFAULT_TIER_BANDS = { t1Cap: 100, t2Min: 60 }

export interface RankedMember {
  id: string
  score: number
  lpType: LpType
}

export interface ShortlistPick extends RankedMember {
  tier: "t1" | "t2" | "t3"
  selected: true
}

/**
 * Given all scored members, pick the top-N respecting the LP-type mix and
 * dropping anything with score <= -50 (hard-bounced skip signal). Returns
 * one selection decision per input member; only `selected: true` rows are
 * in the shortlist.
 */
export function pickShortlist(
  members: RankedMember[],
  cfg: ShortlistConfig,
): ShortlistPick[] {
  const target = Math.max(1, Math.floor(cfg.target || 500))
  const mix: Record<LpType, number> = { ...DEFAULT_MIX, ...(cfg.mix || {}) }
  const bands = { ...DEFAULT_TIER_BANDS, ...(cfg.tierBands || {}) }

  // Filter out disqualifiers first.
  const eligible = members.filter((m) => m.score > -50)

  // Bucket by lp type, sorted by score desc.
  const byLp: Partial<Record<LpType, RankedMember[]>> = {}
  for (const m of eligible) {
    ;(byLp[m.lpType] ||= []).push(m)
  }
  for (const arr of Object.values(byLp)) {
    if (arr) arr.sort((a, b) => b.score - a.score)
  }

  // Slot allocations per lp type based on mix.
  const slots: Partial<Record<LpType, number>> = {}
  for (const [lp, prop] of Object.entries(mix)) {
    slots[lp as LpType] = Math.floor(target * (prop || 0))
  }
  // Rounding remainder → largest mix bucket
  const allocated = Object.values(slots).reduce((s: number, v) => s + (v || 0), 0)
  const remainder = target - allocated
  if (remainder > 0) {
    const winner = (Object.entries(mix).sort((a, b) => (b[1] || 0) - (a[1] || 0))[0]?.[0]) as LpType | undefined
    if (winner) slots[winner] = (slots[winner] || 0) + remainder
  }

  // Pick top-N per lp type.
  const picks: ShortlistPick[] = []
  for (const lp of Object.keys(slots) as LpType[]) {
    const n = slots[lp] || 0
    const bucket = byLp[lp] || []
    for (let i = 0; i < Math.min(n, bucket.length); i++) {
      const m = bucket[i]
      picks.push({ ...m, tier: "t3", selected: true })  // tier fixed up below
    }
  }

  // Assign tiers by overall score.
  picks.sort((a, b) => b.score - a.score)
  for (let i = 0; i < picks.length; i++) {
    if (i < bands.t1Cap) picks[i].tier = "t1"
    else if (picks[i].score >= bands.t2Min) picks[i].tier = "t2"
    else picks[i].tier = "t3"
  }

  return picks
}
