/**
 * Founder-facing investor pipeline workbook (matching v3, docs/architecture/11 §5, 13 §8).
 *
 *   Sheet 1  Summary                — profile, run facts, tiers, segments, funnels
 *   Sheet 2  Lead Candidates        — firm groups that can lead the round
 *   Sheet 3  Firm Groups            — every firm with its primary contact and alternates
 *   Sheet 4  Independent Investors  — angels and people with no firm in the directory
 *   Sheet 5  Ready to Email         — primary contacts and independents with a sendable address
 *   Sheet 6  Import Selection       — the one table the CRM import reads
 *
 * Email columns show the verification status: only a provider-confirmed
 * mailbox reads "Verified".
 */
import * as XLSX from "xlsx"
import {
  FirmGroup, FounderMatchingResult, INVESTOR_SEGMENTS, INVESTOR_SEGMENT_META, ScoredInvestorEntity, StartupProfile,
} from "./founder-types"
import { TIER_DEFINITIONS } from "./types"
import { statusLabel, isSendable } from "@/lib/email-verification/types"

/** Rows pre-ticked in Import Selection: the top firm groups' primary contacts. */
export const IMPORT_PRESELECTED = 200

const GROUP_COLS = [
  ["Reference", 10], ["#", 6], ["Score", 7], ["Tier", 11], ["Firm", 34], ["Type", 16], ["Location", 26], ["Stages", 22],
  ["Check size", 18], ["Sectors", 30], ["Why match", 60], ["Primary contact", 26], ["Title", 26], ["Email", 30],
  ["Email status", 13], ["LinkedIn", 30], ["Alternates", 50], ["Website", 28], ["Gates", 18], ["Anker ID", 22],
] as const

const PERSON_COLS = [
  ["Reference", 10], ["#", 6], ["Score", 7], ["Tier", 11], ["Name", 26], ["Title", 28], ["Firm", 26], ["Type", 16],
  ["Location", 26], ["Email", 30], ["Email status", 13], ["LinkedIn", 30], ["Sectors", 30], ["Why match", 55], ["Anker ID", 22],
] as const

function groupsOf(result: FounderMatchingResult): FirmGroup[] {
  // Results persisted before v3 have no groups: present each firm as its own group.
  return result.groups ?? result.firms.map((f) => ({ firm: f, primary: null, alternates: [], scoreFrom: "firm" as const, peopleScored: 0 }))
}
function independentsOf(result: FounderMatchingResult) {
  return result.independents ?? result.contacts
}

export function buildFounderWorkbook(result: FounderMatchingResult, startup: StartupProfile): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const groups = groupsOf(result)
  const independents = independentsOf(result)
  XLSX.utils.book_append_sheet(wb, summarySheet(result, startup, groups, independents), "Summary")
  XLSX.utils.book_append_sheet(wb, groupSheet(`Lead Candidates — firms that can lead`, "Check size can take a lead-sized share of the round, at your stage.",
    groups.filter((g) => g.firm.tags.includes("LEAD") && g.firm.tags.includes("STAGE"))), "Lead Candidates")
  XLSX.utils.book_append_sheet(wb, groupSheet(`Firm Groups — ${result.startupName}`,
    `${groups.length} firms, ranked. Contact the primary; the alternates are there if the first does not reply.`, groups), "Firm Groups")
  XLSX.utils.book_append_sheet(wb, personSheet(`Independent Investors — ${independents.length}`,
    "Angels and investors with no firm in the directory, ranked on their own records.", independents), "Independent Investors")
  const ready = [...groups.map((g) => g.primary).filter(Boolean) as ScoredInvestorEntity[], ...independents]
    .filter((c) => c.email && isSendable(c.emailStatus ?? "unknown"))
    .sort((a, b) => b.score - a.score)
  XLSX.utils.book_append_sheet(wb, personSheet(`Ready to Email — ${ready.length}`,
    "One person per firm, plus independents, with an address that is not known to be invalid. Check the Email status column: only Verified is confirmed.", ready), "Ready to Email")
  XLSX.utils.book_append_sheet(wb, importSheet(groups, independents), "Import Selection")
  return wb
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
}

// ─── Summary ────────────────────────────────────────────────────────────────
function summarySheet(result: FounderMatchingResult, startup: StartupProfile, groups: FirmGroup[], independents: ScoredInvestorEntity[]): XLSX.WorkSheet {
  const d: any[][] = []
  d.push([`${result.startupName} — Investor Pipeline`])
  d.push([`${startup.stage}${startup.askAmount ? `  |  ${money(startup.askAmount)} raise` : ""}${startup.location ? `  |  ${startup.location}` : ""}  |  Generated ${result.ranAt.slice(0, 10)}  |  ${result.engineVersion ?? "founder-v2"}`])
  d.push([])
  d.push(["STARTUP"])
  d.push(["One-liner", startup.oneLiner ?? "—"])
  d.push(["Stage", startup.stage])
  d.push(["Location", startup.location ?? "—"])
  d.push(["Primary sector", startup.primarySector ?? "—"])
  d.push(["All sectors", (startup.sectors ?? []).join(", ")])
  d.push(["Round size", startup.askAmount ? money(startup.askAmount) : "—"])
  d.push(["Instrument", [startup.instrument, startup.valuationCap ? `${money(startup.valuationCap)} ${startup.valuationCapType ?? ""} cap` : null].filter(Boolean).join(", ") || "—"])
  d.push(["Pre-money", startup.preMoneyValuation ? money(startup.preMoneyValuation) : "—"])
  d.push(["Lead", startup.leadStatus ?? "—"])
  d.push(["Target regions", (startup.geographyTargetRegions ?? []).join(", ") || "—"])
  d.push([])
  d.push(["THIS RUN"])
  d.push(["Thesis matching", result.semantic?.status === "ok" ? `Sector tags + semantic similarity (${result.semantic.models.firms})` : `Sector tags only — semantic unavailable: ${result.semantic?.reason ?? "not run"}`])
  d.push(["Firms scored", result.totals.rawFirms])
  d.push(["People scored", result.totals.rawContacts])
  d.push(["Firm groups qualified (before cap)", result.qualifiedBeforeCap?.groups ?? groups.length])
  d.push(["Firm groups returned", groups.length])
  d.push(["Independent investors qualified (before cap)", result.qualifiedBeforeCap?.independents ?? independents.length])
  d.push(["Independent investors returned", independents.length])
  d.push(["Reachable by email", result.totals.contactsWithEmail])
  d.push(["Emails verified this run (provider)", result.emailVerification?.provider ?? 0])
  if (result.exclusions) {
    d.push(["Excluded — already in your CRM", result.exclusions.inCrm])
    d.push(["Excluded — declined before", result.exclusions.declined])
    d.push(["Excluded — you excluded them", result.exclusions.excludedByFounder])
    d.push(["Excluded — suppressed addresses", result.exclusions.suppressed])
    d.push(["Excluded — investor types", result.exclusions.excludedTypes])
  }
  d.push(["Duplicates merged", result.totals.duplicatesMerged])
  d.push([])
  d.push(["TIERS (score out of 100)"])
  d.push(["Tier", "From", "Firm groups", "Independents"])
  for (const t of TIER_DEFINITIONS) d.push([t.label, t.min, result.tierCounts.firms[t.id], result.tierCounts.contacts[t.id]])
  d.push([])
  d.push(["OUTREACH SEGMENTS (priority order)"])
  d.push(["#", "Segment", "Firm groups", "Independents", "Rationale"])
  for (const seg of [...INVESTOR_SEGMENTS].sort((a, b) => INVESTOR_SEGMENT_META[a].priority - INVESTOR_SEGMENT_META[b].priority)) {
    d.push([INVESTOR_SEGMENT_META[seg].priority, INVESTOR_SEGMENT_META[seg].label, result.segmentCounts.firms[seg], result.segmentCounts.contacts[seg], INVESTOR_SEGMENT_META[seg].rationale])
  }
  d.push([])
  d.push(["FIRM FUNNEL"])
  d.push(["Stage", "Count", "% of directory", "Notes"])
  for (const f of result.funnel.firms) d.push([f.label, f.count, `${f.pct}%`, f.notes ?? ""])
  d.push([])
  d.push(["PEOPLE FUNNEL"])
  d.push(["Stage", "Count", "% of directory", "Notes"])
  for (const f of result.funnel.contacts) d.push([f.label, f.count, `${f.pct}%`, f.notes ?? ""])
  const ws = XLSX.utils.aoa_to_sheet(d)
  ws["!cols"] = [{ wch: 42 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 60 }]
  return ws
}

// ─── Sheets ─────────────────────────────────────────────────────────────────
function groupSheet(title: string, subtitle: string, groups: FirmGroup[]): XLSX.WorkSheet {
  const d: any[][] = [[title], [subtitle], [], GROUP_COLS.map((c) => c[0])]
  groups.forEach((g, i) => {
    const f = g.firm, p = g.primary
    d.push([
      "", i + 1, f.score, tierLabel(f.tier), f.name, f.type, f.location, (f.stages ?? []).join(", "),
      range(f.checkSizeMin, f.checkSizeMax), (f.sectors ?? []).slice(0, 6).join(", "), f.whyMatch,
      p?.name ?? "", p?.title ?? "", p?.email ?? "", p?.email ? statusLabel(p.emailStatus) : "", p?.linkedin ?? "",
      g.alternates.map((a) => `${a.name}${a.title ? ` (${a.title})` : ""}${a.email ? ` <${a.email}>` : ""}`).join("; "),
      f.website ?? "", (f.gates ?? []).join(", "), `firm:${f.id}`,
    ])
  })
  return finish(d, GROUP_COLS)
}

function personSheet(title: string, subtitle: string, people: ScoredInvestorEntity[]): XLSX.WorkSheet {
  const d: any[][] = [[title], [subtitle], [], PERSON_COLS.map((c) => c[0])]
  people.forEach((p, i) => d.push([
    "", i + 1, p.score, tierLabel(p.tier), p.name, p.title ?? "", p.firmName ?? "", p.type, p.location,
    p.email ?? "", p.email ? statusLabel(p.emailStatus) : "", p.linkedin ?? "", (p.sectors ?? []).slice(0, 6).join(", "), p.whyMatch, `contact:${p.id}`,
  ]))
  return finish(d, PERSON_COLS)
}

/** One row per firm group (its primary contact) and per independent; alternates listed unticked. */
function importSheet(groups: FirmGroup[], independents: ScoredInvestorEntity[]): XLSX.WorkSheet {
  const headers = ["Contact", "Anker ID", "Name", "Firm", "Title", "Email", "Email status", "LinkedIn", "Location", "Type", "Score", "Tier", "Why match", "Status", "Owner", "Notes"]
  const rows: any[][] = []
  const seen = new Set<string>()
  const add = (selected: boolean, key: string, e: ScoredInvestorEntity, firm: string, why: string) => {
    if (seen.has(key)) return
    seen.add(key)
    rows.push([selected, key, e.name, firm, e.title ?? "", e.email ?? "", e.email ? statusLabel(e.emailStatus) : "", e.linkedin ?? "", e.location, e.type, e.score, tierLabel(e.tier), why, "queued", "", ""])
  }
  groups.forEach((g, i) => {
    const pre = i < IMPORT_PRESELECTED
    if (g.primary) add(pre, `contact:${g.primary.id}`, { ...g.primary, score: g.firm.score, tier: g.firm.tier }, g.firm.name, g.firm.whyMatch)
    else add(pre, `firm:${g.firm.id}`, g.firm, g.firm.name, g.firm.whyMatch)
    for (const a of g.alternates) add(false, `contact:${a.id}`, { ...a, score: g.firm.score, tier: g.firm.tier }, g.firm.name, `Alternate at ${g.firm.name}`)
  })
  for (const p of independents) add(false, `contact:${p.id}`, p, "", p.whyMatch)
  const ws = XLSX.utils.aoa_to_sheet([
    ["Import Selection — edit this sheet only for CRM import"],
    [`The top ${IMPORT_PRESELECTED} firm groups' primary contacts are ticked. Alternates and independents are listed unticked — set Contact to TRUE for anyone else you want. Status, Owner and Notes are used for new entries.`],
    [], headers, ...rows,
  ])
  ws["!cols"] = headers.map((h) => ({ wch: h === "Why match" || h === "Notes" ? 50 : h === "Contact" ? 10 : 24 }))
  ws["!autofilter"] = { ref: `A4:${XLSX.utils.encode_col(headers.length - 1)}${Math.max(4, rows.length + 4)}` }
  return ws
}

function finish(d: any[][], cols: readonly (readonly [string, number])[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(d)
  ws["!cols"] = cols.map((c) => ({ wch: c[1] }))
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: Math.max(3, d.length - 1), c: cols.length - 1 } }) }
  return ws
}

function tierLabel(t: string): string {
  return TIER_DEFINITIONS.find((td) => td.id === t)?.label ?? t
}
function money(n: number): string {
  return n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`
}
function range(min: number | null | undefined, max: number | null | undefined): string {
  if (!min && !max) return ""
  if (min && max && min !== max) return `${money(min)}–${money(max)}`
  return money((max ?? min) as number)
}
