/**
 * Founder-facing investor pipeline workbook.
 *
 *   Sheet 1  Summary            — startup profile + funnel + segment counts
 *   Sheet 2  Lead Candidates    — top firms that can lead the round
 *   Sheet 3  Investor Firms     — all qualified firms, segmented
 *   Sheet 4  Investor Contacts  — partner-level contacts, segmented
 *   Sheet 5  Ready to Email     — flat list of contacts with verified email
 */

import * as XLSX from "xlsx"
import {
  FounderMatchingResult,
  INVESTOR_SEGMENTS,
  INVESTOR_SEGMENT_META,
  InvestorSegment,
  ScoredInvestorEntity,
  StartupProfile,
} from "./founder-types"
import { TIER_DEFINITIONS } from "./types"

const FIRM_COLS = [
  { header: "#", width: 5 },
  { header: "Score", width: 7 },
  { header: "Tier", width: 11 },
  { header: "Firm", width: 36 },
  { header: "Type", width: 14 },
  { header: "Tags", width: 22 },
  { header: "Location", width: 28 },
  { header: "Stages", width: 22 },
  { header: "Check size", width: 22 },
  { header: "Sectors", width: 36 },
  { header: "Why match", width: 55 },
  { header: "Website", width: 30 },
  { header: "LinkedIn", width: 30 },
  { header: "Status", width: 14 },
  { header: "Owner", width: 14 },
  { header: "Notes", width: 30 },
]

const CONTACT_COLS = [
  { header: "#", width: 5 },
  { header: "Score", width: 7 },
  { header: "Tier", width: 11 },
  { header: "Name", width: 26 },
  { header: "Title", width: 30 },
  { header: "Type", width: 14 },
  { header: "Tags", width: 22 },
  { header: "Location", width: 28 },
  { header: "Email", width: 32 },
  { header: "LinkedIn", width: 30 },
  { header: "Sectors", width: 30 },
  { header: "Why match", width: 50 },
  { header: "Status", width: 14 },
  { header: "Owner", width: 14 },
  { header: "Notes", width: 30 },
]

export function buildFounderWorkbook(
  result: FounderMatchingResult,
  startup: StartupProfile,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, summarySheet(result, startup), "Summary")
  XLSX.utils.book_append_sheet(wb, leadCandidatesSheet(result), "Lead Candidates")
  XLSX.utils.book_append_sheet(wb, segmentedFirmsSheet(result), "Investor Firms")
  XLSX.utils.book_append_sheet(wb, segmentedContactsSheet(result), "Investor Contacts")
  XLSX.utils.book_append_sheet(wb, readyToEmailSheet(result), "Ready to Email")
  return wb
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
}

// ─── Summary ────────────────────────────────────────────────────────────────
function summarySheet(result: FounderMatchingResult, startup: StartupProfile): XLSX.WorkSheet {
  const data: any[][] = []
  data.push([`${result.startupName} — Investor Pipeline`])
  data.push([
    `${startup.stage}` +
      (startup.askAmount ? `  |  $${(startup.askAmount / 1e6).toFixed(1)}M raise` : "") +
      (startup.location ? `  |  ${startup.location}` : "") +
      `  |  Generated ${result.ranAt.slice(0, 10)}`,
  ])
  data.push([])

  data.push(["STARTUP"])
  data.push(["One-liner", startup.oneLiner ?? "—"])
  data.push(["Stage", startup.stage])
  data.push(["Location", startup.location ?? "—"])
  data.push(["Primary sector", startup.primarySector ?? "—"])
  data.push(["All sectors", startup.sectors.join(", ")])
  data.push(["Round size", startup.askAmount ? `$${(startup.askAmount / 1e6).toFixed(1)}M` : "—"])
  data.push(["Pre-money", startup.preMoneyValuation ? `$${(startup.preMoneyValuation / 1e6).toFixed(1)}M` : "—"])
  data.push(["Ideal check range",
    startup.checkSizeIdealMin || startup.checkSizeIdealMax
      ? `$${((startup.checkSizeIdealMin ?? 0) / 1e6).toFixed(1)}M – $${((startup.checkSizeIdealMax ?? 0) / 1e6).toFixed(1)}M`
      : "—"])
  data.push(["ARR / MRR",
    startup.arr ? `$${(startup.arr / 1e6).toFixed(2)}M ARR` :
    startup.mrr ? `$${(startup.mrr / 1e3).toFixed(0)}K MRR` : "—"])
  data.push(["Team size", startup.teamSize ?? "—"])
  data.push([])

  data.push(["PIPELINE AT A GLANCE"])
  data.push(["Metric", "Count"])
  data.push(["Investment firms scored", result.totals.rawFirms])
  data.push(["Individual investors scored", result.totals.rawContacts])
  data.push(["Qualified firms (post-filter)", result.totals.qualifiedFirms])
  data.push(["Qualified contacts (post-filter)", result.totals.qualifiedContacts])
  data.push(["Contacts with verified email", result.totals.contactsWithEmail])
  data.push(["Lead candidates", result.totals.leadCandidates])
  data.push(["Duplicates merged", result.totals.duplicatesMerged])
  data.push([])

  data.push(["TIER BREAKDOWN"])
  data.push(["Tier", "Range", "Firms", "Contacts"])
  for (const t of TIER_DEFINITIONS) {
    data.push([t.label, `${t.min}+`, result.tierCounts.firms[t.id], result.tierCounts.contacts[t.id]])
  }
  data.push([])

  data.push(["OUTREACH SEGMENTS (priority order)"])
  data.push(["#", "Segment", "Firms", "Contacts", "Rationale"])
  for (const seg of INVESTOR_SEGMENTS.slice().sort(
    (a, b) => INVESTOR_SEGMENT_META[a].priority - INVESTOR_SEGMENT_META[b].priority,
  )) {
    data.push([
      INVESTOR_SEGMENT_META[seg].priority,
      INVESTOR_SEGMENT_META[seg].label,
      result.segmentCounts.firms[seg],
      result.segmentCounts.contacts[seg],
      INVESTOR_SEGMENT_META[seg].rationale,
    ])
  }
  data.push([])

  data.push(["FIRM CONVERSION FUNNEL"])
  data.push(["Stage", "Count", "% of raw", "Notes"])
  for (const f of result.funnel.firms) data.push([f.label, f.count, `${f.pct}%`, f.notes ?? ""])
  data.push([])

  data.push(["CONTACT CONVERSION FUNNEL"])
  data.push(["Stage", "Count", "% of raw", "Notes"])
  for (const f of result.funnel.contacts) data.push([f.label, f.count, `${f.pct}%`, f.notes ?? ""])

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [{ wch: 38 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 60 }]
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ]
  return ws
}

// ─── Lead candidates ────────────────────────────────────────────────────────
function leadCandidatesSheet(result: FounderMatchingResult): XLSX.WorkSheet {
  const leads = result.firms
    .filter((f) => f.segments.includes("lead") || f.tags.includes("LEAD"))
    .sort((a, b) => b.score - a.score)
  const data: any[][] = []
  data.push([`Lead Candidates — ${leads.length} firms`])
  data.push([`Stage + check-size match. Highest priority outreach.`])
  data.push([])
  data.push(FIRM_COLS.map((c) => c.header))
  leads.forEach((f, i) => data.push(firmRow(f, i + 1)))
  return finalizeFirmsSheet(data)
}

function segmentedFirmsSheet(result: FounderMatchingResult): XLSX.WorkSheet {
  const data: any[][] = []
  data.push([`Investor Firms — ${result.startupName}`])
  data.push([`${result.totals.qualifiedFirms} qualified, sorted by score within segment`])
  data.push([])
  data.push(FIRM_COLS.map((c) => c.header))
  let runningIdx = 0
  const seen = new Set<string>()
  const order: InvestorSegment[] = ["lead", "warm_local", "follow_on", "stage_match", "sector_match", "active_recent"]
  for (const seg of order) {
    const inSeg = result.firms.filter((f) => f.segments.includes(seg) && !seen.has(f.id))
      .sort((a, b) => b.score - a.score)
    if (!inSeg.length) continue
    data.push([`${INVESTOR_SEGMENT_META[seg].label.toUpperCase()} — ${inSeg.length}`,
      ...Array(FIRM_COLS.length - 1).fill("")])
    for (const f of inSeg) {
      runningIdx++
      seen.add(f.id)
      data.push(firmRow(f, runningIdx))
    }
    data.push([])
  }
  const remaining = result.firms.filter((f) => !seen.has(f.id))
  if (remaining.length) {
    data.push([`OTHER — ${remaining.length}`, ...Array(FIRM_COLS.length - 1).fill("")])
    for (const f of remaining) {
      runningIdx++
      data.push(firmRow(f, runningIdx))
    }
  }
  return finalizeFirmsSheet(data)
}

function segmentedContactsSheet(result: FounderMatchingResult): XLSX.WorkSheet {
  const data: any[][] = []
  data.push([`Investor Contacts — ${result.startupName}`])
  data.push([`${result.totals.qualifiedContacts} qualified  |  ${result.totals.contactsWithEmail} with verified email`])
  data.push([])
  data.push(CONTACT_COLS.map((c) => c.header))
  let runningIdx = 0
  const seen = new Set<string>()
  const order: InvestorSegment[] = ["lead", "warm_local", "follow_on", "stage_match", "sector_match", "active_recent"]
  for (const seg of order) {
    const inSeg = result.contacts.filter((c) => c.segments.includes(seg) && !seen.has(c.id))
      .sort((a, b) => b.score - a.score)
    if (!inSeg.length) continue
    data.push([`${INVESTOR_SEGMENT_META[seg].label.toUpperCase()} — ${inSeg.length}`,
      ...Array(CONTACT_COLS.length - 1).fill("")])
    for (const c of inSeg) {
      runningIdx++
      seen.add(c.id)
      data.push(contactRow(c, runningIdx))
    }
    data.push([])
  }
  const remaining = result.contacts.filter((c) => !seen.has(c.id))
  if (remaining.length) {
    data.push([`OTHER — ${remaining.length}`, ...Array(CONTACT_COLS.length - 1).fill("")])
    for (const c of remaining) {
      runningIdx++
      data.push(contactRow(c, runningIdx))
    }
  }
  return finalizeContactsSheet(data)
}

function readyToEmailSheet(result: FounderMatchingResult): XLSX.WorkSheet {
  const ready = result.contacts.filter((c) => c.emailVerified).sort((a, b) => b.score - a.score)
  const data: any[][] = []
  data.push([`Contacts with Email — ${ready.length} ready for outreach`])
  data.push([])
  data.push([])
  data.push(CONTACT_COLS.map((c) => c.header))
  ready.forEach((c, i) => data.push(contactRow(c, i + 1)))
  return finalizeContactsSheet(data)
}

// ─── Row builders ───────────────────────────────────────────────────────────
function firmRow(f: ScoredInvestorEntity & { segments: InvestorSegment[] }, idx: number): any[] {
  return [
    idx,
    f.score,
    tierLabel(f.tier),
    f.name,
    f.type,
    f.tags.join(", "),
    f.location,
    (f.stages ?? []).join(", "),
    formatCheckRange(f.checkSizeMin ?? null, f.checkSizeMax ?? null),
    f.sectors.slice(0, 6).join(", "),
    f.whyMatch,
    f.website ?? "",
    f.linkedin ?? "",
    "",
    "",
    "",
  ]
}

function contactRow(c: ScoredInvestorEntity & { segments: InvestorSegment[] }, idx: number): any[] {
  return [
    idx,
    c.score,
    tierLabel(c.tier),
    c.name,
    c.title ?? "",
    c.type,
    c.tags.join(", "),
    c.location,
    c.email ?? "",
    c.linkedin ?? "",
    c.sectors.slice(0, 6).join(", "),
    c.whyMatch,
    "",
    "",
    "",
  ]
}

function finalizeFirmsSheet(data: any[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = FIRM_COLS.map((c) => ({ wch: c.width }))
  ws["!freeze"] = { xSplit: 0, ySplit: 4 }
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 3, c: 0 },
      e: { r: data.length - 1, c: FIRM_COLS.length - 1 },
    }),
  }
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: FIRM_COLS.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: FIRM_COLS.length - 1 } },
  ]
  return ws
}

function finalizeContactsSheet(data: any[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = CONTACT_COLS.map((c) => ({ wch: c.width }))
  ws["!freeze"] = { xSplit: 0, ySplit: 4 }
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 3, c: 0 },
      e: { r: data.length - 1, c: CONTACT_COLS.length - 1 },
    }),
  }
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: CONTACT_COLS.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: CONTACT_COLS.length - 1 } },
  ]
  return ws
}

function tierLabel(t: string): string {
  return TIER_DEFINITIONS.find((td) => td.id === t)?.label ?? t
}
function formatCheckRange(min: number | null, max: number | null): string {
  if (!min && !max) return ""
  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`
  if (min && max && min !== max) return `${fmt(min)}–${fmt(max)}`
  return fmt((max ?? min) as number)
}
