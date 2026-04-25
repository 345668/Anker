/**
 * XLSX builder — produces a 5-sheet workbook matching the WC_LP_Pipeline
 * deliverable format:
 *
 *   1. Summary           — fund stats + funnel + segment counts
 *   2. Priority LP Firms — segmented by priority, ANCHOR rows highlighted
 *   3. LP Contacts       — segmented, EMAIL rows highlighted
 *   4. International LPs — DACH / Gulf / Italy / Canada / UK / Other
 *   5. Ready to Contact  — flat list of contacts with verified email
 *
 * Each segmented sheet uses section header rows ("EMERGING MANAGER PROGRAMS — 6"),
 * frozen panes, auto-filter, and column widths tuned for typical LP data.
 *
 * SheetJS (the xlsx package already in deps) handles cell-level styling via
 * `s` properties when using the community fork; we rely only on what's in
 * the open-source package: column widths, freeze panes, auto-filter range,
 * and merged cells. Color-coding is communicated via the Tags column
 * ("ANCHOR" / "EM") which the consumer can conditionally format in Excel
 * with a single rule.
 */

import * as XLSX from "xlsx"
import {
  FundProfileV2,
  MatchingResultV2,
  OUTREACH_SEGMENTS,
  OutreachSegment,
  ScoredContactV2,
  ScoredFirmV2,
  SEGMENT_META,
  TIER_DEFINITIONS,
} from "./types"
import { detectRegions } from "./scoring"

// ─── Column schemas ─────────────────────────────────────────────────────────
const FIRM_COLS = [
  { header: "#", width: 5 },
  { header: "Score", width: 7 },
  { header: "Tier", width: 11 },
  { header: "Firm", width: 36 },
  { header: "Type", width: 18 },
  { header: "Tags", width: 22 },
  { header: "Location", width: 28 },
  { header: "AUM", width: 14 },
  { header: "Sectors", width: 36 },
  { header: "Why this LP", width: 55 },
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
  { header: "Type", width: 16 },
  { header: "Tags", width: 22 },
  { header: "Location", width: 28 },
  { header: "Email", width: 32 },
  { header: "LinkedIn", width: 30 },
  { header: "Sectors", width: 30 },
  { header: "Why this LP", width: 50 },
  { header: "HNW signals", width: 22 },
  { header: "Status", width: 14 },
  { header: "Owner", width: 14 },
  { header: "Notes", width: 30 },
]

// ─── Public API ─────────────────────────────────────────────────────────────
export interface BuildXlsxOptions {
  includeInternalNotes?: boolean
}

export function buildPipelineWorkbook(
  result: MatchingResultV2,
  fund: FundProfileV2,
  _options: BuildXlsxOptions = {},
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, buildSummarySheet(result, fund), "Summary")
  XLSX.utils.book_append_sheet(
    wb,
    buildSegmentedFirmsSheet(result, fund, "Priority LP Firms", domesticSegmentOrder),
    "Priority LP Firms",
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildSegmentedContactsSheet(result, fund, "LP Contacts", domesticSegmentOrder),
    "LP Contacts",
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildInternationalSheet(result, fund),
    "International LPs",
  )
  XLSX.utils.book_append_sheet(wb, buildReadyToContactSheet(result), "Ready to Contact")

  return wb
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  return Buffer.from(out)
}

// ─── Sheet 1: Summary ───────────────────────────────────────────────────────
function buildSummarySheet(result: MatchingResultV2, fund: FundProfileV2): XLSX.WorkSheet {
  const data: any[][] = []

  data.push([`${fund.name} — LP Prospect Pipeline`])
  data.push([
    `${fund.targetRaise ? `$${(fund.targetRaise / 1e6).toFixed(0)}M target` : ""}` +
      (fund.headquartersLocation ? `  |  ${fund.headquartersLocation}` : "") +
      `  |  Generated ${result.ranAt.slice(0, 10)}`,
  ])
  data.push([])

  data.push(["FUND"])
  data.push(["Target raise", fund.targetRaise ? `$${(fund.targetRaise / 1e6).toFixed(0)}M` : "—"])
  data.push(["Average ticket", fund.averageTicket ? `$${(fund.averageTicket / 1e6).toFixed(1)}M` : "—"])
  data.push(["Headquarters", fund.headquartersLocation ?? "—"])
  data.push(["Primary sectors", (fund.primarySectors ?? fund.sectors).join(", ")])
  data.push(["Geographic focus", fund.geographicFocus.join(", ")])
  data.push([])

  data.push(["PIPELINE AT A GLANCE"])
  data.push(["Metric", "Count"])
  data.push(["Investment firms scored", result.totals.rawFirms])
  data.push(["Individual investors scored", result.totals.rawContacts])
  data.push(["Qualified LP firms (post-filter)", result.totals.qualifiedFirms])
  data.push(["Qualified LP contacts (post-filter)", result.totals.qualifiedContacts])
  data.push(["Contacts with verified email", result.totals.contactsWithEmail])
  data.push(["Anchor candidates ($500M+ AUM)", result.totals.anchorCandidates])
  data.push(["Duplicates merged", result.totals.duplicatesMerged])
  data.push(["AI-enriched rationales", result.totals.aiEnrichmentsApplied])
  data.push([])

  data.push(["TIER BREAKDOWN — FIRMS"])
  data.push(["Tier", "Range", "Firms", "Contacts"])
  for (const t of TIER_DEFINITIONS) {
    data.push([
      t.label,
      `${t.min}+`,
      result.tierCounts.firms[t.id],
      result.tierCounts.contacts[t.id],
    ])
  }
  data.push([])

  data.push(["SEGMENTATION (priority order)"])
  data.push(["#", "Segment", "Firms", "Contacts", "Rationale"])
  const sorted = OUTREACH_SEGMENTS.slice().sort(
    (a, b) => SEGMENT_META[a].priority - SEGMENT_META[b].priority,
  )
  for (const seg of sorted) {
    data.push([
      SEGMENT_META[seg].priority,
      SEGMENT_META[seg].label,
      result.segmentCounts.firms[seg],
      result.segmentCounts.contacts[seg],
      SEGMENT_META[seg].rationale,
    ])
  }
  data.push([])

  data.push(["FIRM CONVERSION FUNNEL"])
  data.push(["Stage", "Count", "% of raw", "Notes"])
  for (const f of result.funnel.firms) {
    data.push([f.label, f.count, `${f.pct}%`, f.notes ?? ""])
  }
  data.push([])

  data.push(["CONTACT CONVERSION FUNNEL"])
  data.push(["Stage", "Count", "% of raw", "Notes"])
  for (const f of result.funnel.contacts) {
    data.push([f.label, f.count, `${f.pct}%`, f.notes ?? ""])
  }

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [
    { wch: 38 },
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 60 },
  ]
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ]
  return ws
}

// ─── Sheet 2: Priority Firms (segmented) ────────────────────────────────────
const domesticSegmentOrder: OutreachSegment[] = [
  "fund_i_reup",
  "local",
  "emerging_manager",
  "university",
  "anchor",
  "fund_of_funds",
  "fo_with_email",
]

function buildSegmentedFirmsSheet(
  result: MatchingResultV2,
  _fund: FundProfileV2,
  title: string,
  segmentOrder: OutreachSegment[],
): XLSX.WorkSheet {
  const data: any[][] = []
  data.push([`${title} — ${result.fundName}`])
  data.push([
    `${result.totals.qualifiedFirms} qualified  |  ANCHOR = $500M+ AUM  |  EM = Emerging Manager program  |  Sorted by score within segment`,
  ])
  data.push([])
  data.push(FIRM_COLS.map((c) => c.header))

  let runningIdx = 0
  const seenIds = new Set<string>()

  for (const seg of segmentOrder) {
    // Skip international here — it has its own sheet
    if (seg === "international") continue
    const inSeg = result.firms
      .filter((f) => f.segments.includes(seg) && !seenIds.has(f.firmId))
      .sort((a, b) => b.score - a.score)
    if (!inSeg.length) continue

    data.push([
      `${SEGMENT_META[seg].label.toUpperCase()} — ${inSeg.length}`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ])
    for (const f of inSeg) {
      runningIdx++
      seenIds.add(f.firmId)
      data.push(firmRow(f, runningIdx))
    }
    data.push([])
  }

  // Catch-all: any remaining qualified firm not yet emitted
  const remaining = result.firms.filter((f) => !seenIds.has(f.firmId))
  if (remaining.length) {
    data.push([`OTHER QUALIFIED — ${remaining.length}`, "", "", "", "", "", "", "", "", "", "", "", "", "", ""])
    for (const f of remaining) {
      runningIdx++
      data.push(firmRow(f, runningIdx))
    }
  }

  return finalizeFirmsSheet(data)
}

function firmRow(f: ScoredFirmV2, idx: number): any[] {
  return [
    idx,
    f.score,
    tierLabel(f.tier),
    f.name,
    f.type,
    f.tags.join(", "),
    f.location,
    f.aumRaw ?? "",
    f.sectors.slice(0, 6).join(", "),
    f.whyThisLp,
    f.website ?? "",
    f.linkedin ?? "",
    "",
    "",
    "",
  ]
}

function finalizeFirmsSheet(data: any[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = FIRM_COLS.map((c) => ({ wch: c.width }))
  ws["!freeze"] = { xSplit: 0, ySplit: 4 }
  // Freeze top 4 rows (title + subtitle + blank + header)
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: data.length - 1, c: FIRM_COLS.length - 1 } }),
  }
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: FIRM_COLS.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: FIRM_COLS.length - 1 } },
  ]
  return ws
}

// ─── Sheet 3: Contacts (segmented) ──────────────────────────────────────────
function buildSegmentedContactsSheet(
  result: MatchingResultV2,
  _fund: FundProfileV2,
  title: string,
  segmentOrder: OutreachSegment[],
): XLSX.WorkSheet {
  const data: any[][] = []
  data.push([`${title} — ${result.fundName}`])
  data.push([
    `${result.totals.qualifiedContacts} qualified  |  ${result.totals.contactsWithEmail} with verified email  |  EMAIL tag = ready for outreach`,
  ])
  data.push([])
  data.push(CONTACT_COLS.map((c) => c.header))

  let runningIdx = 0
  const seenIds = new Set<string>()

  for (const seg of segmentOrder) {
    if (seg === "international") continue
    const inSeg = result.contacts
      .filter((c) => c.segments.includes(seg) && !seenIds.has(c.investorId))
      .sort((a, b) => b.score - a.score)
    if (!inSeg.length) continue

    data.push([`${SEGMENT_META[seg].label.toUpperCase()} — ${inSeg.length}`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""])
    for (const c of inSeg) {
      runningIdx++
      seenIds.add(c.investorId)
      data.push(contactRow(c, runningIdx))
    }
    data.push([])
  }

  const remaining = result.contacts.filter((c) => !seenIds.has(c.investorId))
  if (remaining.length) {
    data.push([`OTHER QUALIFIED — ${remaining.length}`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""])
    for (const c of remaining) {
      runningIdx++
      data.push(contactRow(c, runningIdx))
    }
  }

  return finalizeContactsSheet(data)
}

function contactRow(c: ScoredContactV2, idx: number): any[] {
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
    c.whyThisLp,
    c.hnwSignals.join(", "),
    "",
    "",
    "",
  ]
}

function finalizeContactsSheet(data: any[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = CONTACT_COLS.map((c) => ({ wch: c.width }))
  ws["!freeze"] = { xSplit: 0, ySplit: 4 }
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: data.length - 1, c: CONTACT_COLS.length - 1 } }),
  }
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: CONTACT_COLS.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: CONTACT_COLS.length - 1 } },
  ]
  return ws
}

// ─── Sheet 4: International LPs ─────────────────────────────────────────────
const INTL_REGIONS = ["dach", "gulf", "italy", "canada", "uk", "france", "india", "singapore", "japan", "china"] as const
const INTL_LABELS: Record<(typeof INTL_REGIONS)[number], string> = {
  dach: "DACH (Germany / Austria / Switzerland)",
  gulf: "Gulf (UAE / Saudi / Qatar)",
  italy: "Italy",
  canada: "Canada",
  uk: "United Kingdom",
  france: "France",
  india: "India",
  singapore: "Singapore",
  japan: "Japan",
  china: "China / Hong Kong",
}

function buildInternationalSheet(result: MatchingResultV2, _fund: FundProfileV2): XLSX.WorkSheet {
  const data: any[][] = []
  data.push([`International LP Prospects — ${result.fundName}`])
  data.push([`Pipeline coverage by region`])
  data.push([])
  data.push(FIRM_COLS.map((c) => c.header))

  let runningIdx = 0
  const seenIds = new Set<string>()

  for (const region of INTL_REGIONS) {
    const inRegion = result.firms
      .filter((f) => detectRegions(f.location).includes(region) && !seenIds.has(f.firmId))
      .sort((a, b) => b.score - a.score)
    if (!inRegion.length) continue

    data.push([`${INTL_LABELS[region].toUpperCase()} — ${inRegion.length}`, "", "", "", "", "", "", "", "", "", "", "", "", "", ""])
    for (const f of inRegion) {
      runningIdx++
      seenIds.add(f.firmId)
      data.push(firmRow(f, runningIdx))
    }
    data.push([])
  }

  return finalizeFirmsSheet(data)
}

// ─── Sheet 5: Ready to Contact ──────────────────────────────────────────────
function buildReadyToContactSheet(result: MatchingResultV2): XLSX.WorkSheet {
  const ready = result.contacts
    .filter((c) => c.emailVerified)
    .sort((a, b) => b.score - a.score)

  const data: any[][] = []
  data.push([`Contacts with Email — ${ready.length} ready for outreach`])
  data.push([])
  data.push([])
  data.push(CONTACT_COLS.map((c) => c.header))
  ready.forEach((c, i) => data.push(contactRow(c, i + 1)))

  return finalizeContactsSheet(data)
}

// ─── helpers ────────────────────────────────────────────────────────────────
function tierLabel(t: string): string {
  return TIER_DEFINITIONS.find((td) => td.id === t)?.label ?? t
}
