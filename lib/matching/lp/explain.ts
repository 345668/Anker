/**
 * What a match says about itself (docs/architecture/63 section 4.4): which facts it rests on, which are missing, and how much weight that leaves it.
 * Pure. Nothing here invents a fact: a sentence is built only from fields the directory row actually has.
 */
import type { ScoredContactV2, ScoredFirmV2, FactorBreakdown } from "@/lib/matching/v2/types"

export type Confidence = "high" | "medium" | "low"
export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" }

const money = (n: number) => (n >= 1e9 ? `$${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : `$${Math.round(n / 1e3)}K`)
const has = (s: string | null | undefined) => !!s && s.trim().length > 0

export interface Facts { gaps: string[]; confidence: Confidence }

/** Five facts a firm's score leans on. Four or five known = high, three = medium, fewer = low. */
export function firmFacts(f: Pick<ScoredFirmV2, "type" | "aumUsd" | "sectors" | "location" | "description" | "expectedTicket">): Facts {
  const gaps: string[] = []
  let known = 0
  if (has(f.type)) known++; else gaps.push("Investor type not recorded")
  if (f.aumUsd != null && f.aumUsd > 0) known++; else gaps.push("AUM not in the directory, so the likely cheque is not estimated")
  if (f.sectors?.length) known++; else gaps.push("No sectors listed")
  if (has(f.location)) known++; else gaps.push("Location not recorded")
  if (has(f.description)) known++; else gaps.push("No description to read a thesis from")
  return { gaps, confidence: known >= 4 ? "high" : known === 3 ? "medium" : "low" }
}

/** A person: type, a way to reach them, a role, sectors and a place. */
export function contactFacts(c: Pick<ScoredContactV2, "type" | "email" | "emailVerified" | "linkedin" | "title" | "sectors" | "location">): Facts {
  const gaps: string[] = []
  let known = 0
  if (has(c.type)) known++; else gaps.push("Investor type not recorded")
  if (c.email && c.emailVerified) known++; else if (has(c.linkedin)) known++; else gaps.push("No email or LinkedIn profile on record")
  if (has(c.title)) known++; else gaps.push("Role not recorded")
  if (c.sectors?.length) known++; else gaps.push("No sectors listed")
  if (has(c.location)) known++; else gaps.push("Location not recorded")
  return { gaps, confidence: known >= 4 ? "high" : known === 3 ? "medium" : "low" }
}

/** One factual sentence from the row. The engine's own reasons carry the fit; this adds the kind of LP and the size. */
export function firmSentence(f: Pick<ScoredFirmV2, "name" | "type" | "location" | "aumUsd" | "expectedTicket" | "reasons">): string {
  const who = [has(f.type) ? f.type : "Investor", has(f.location) ? `in ${f.location}` : ""].filter(Boolean).join(" ")
  const size = f.aumUsd ? `${money(f.aumUsd)} AUM${f.expectedTicket ? `, a likely cheque of about ${money(f.expectedTicket)}` : ""}` : ""
  const fit = (f.reasons ?? []).filter((r) => !/cheque/i.test(r) || !f.expectedTicket).slice(0, 2).join("; ")
  return [`${who}${size ? `, ${size}` : ""}`, fit].filter(Boolean).join(". ") + "."
}

export function contactSentence(c: Pick<ScoredContactV2, "type" | "title" | "location" | "emailVerified" | "reasons">): string {
  const who = [has(c.title) ? c.title : has(c.type) ? c.type : "Investor", has(c.location) ? `in ${c.location}` : ""].filter(Boolean).join(" ")
  const fit = (c.reasons ?? []).slice(0, 2).join("; ")
  return [who + (c.emailVerified ? ", email on record" : ""), fit].filter(Boolean).join(". ") + "."
}

export const FACTOR_LABELS: Record<keyof FactorBreakdown, string> = {
  lpType: "Kind of investor", aum: "Size and likely cheque", sector: "Sector overlap", geography: "Geography", thesis: "Thesis signals", contact: "Reachability",
}
/** The points the scorer gave each factor, in the order it weighs them. Points are the engine's own and are not a percentage. */
export function factorRows(f: FactorBreakdown, kind: "firm" | "contact"): Array<{ key: string; label: string; points: number }> {
  const order: Array<keyof FactorBreakdown> = kind === "firm" ? ["aum", "lpType", "thesis", "sector", "geography"] : ["lpType", "contact", "geography", "sector", "thesis", "aum"]
  return order.filter((k) => f[k] != null).map((k) => ({ key: k, label: FACTOR_LABELS[k], points: Number(f[k]) || 0 }))
}

export function confidenceCounts(items: Array<{ confidence?: Confidence }>): Record<Confidence, number> {
  const c: Record<Confidence, number> = { high: 0, medium: 0, low: 0 }
  for (const i of items) if (i.confidence) c[i.confidence]++
  return c
}
