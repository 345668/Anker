/**
 * SVS Fund II — 6-Sheet Excel Exporter
 *
 * Sheets:
 *   1. Enriched Profiles   — full enrichment data per LP
 *   2. Email Drafts        — generated outreach emails
 *   3. Campaign Summary    — stats + LP-type breakdown
 *   4. Multi-Touch Tracker — same-firm contacts flagged
 *   5. LinkedIn DMs        — condensed 300-char DM versions
 *   6. Methodology         — pipeline explanation + tone guide
 *
 * Formatting (openpyxl-style via SheetJS cell styles):
 *   - Navy (#1B3A6B) headers, white bold text
 *   - Alternating rows: white / light-blue (#EBF0FA)
 *   - Frozen panes on row 1
 *   - Auto-filter on data sheets
 *   - Colour-coded tab colours per sheet
 *   - Auto-width columns (capped at 60 chars)
 */

import * as XLSX from "xlsx"
import type { EnrichedProfile, CampaignResult } from "./svs-campaign"
import { LP_TONE } from "./svs-campaign"
import { SENDER_PROFILE } from "./sender-profile"

// ─── Colour palette ─────────────────────────────────────────────────────────

const NAVY = "1B3A6B"
const WHITE = "FFFFFF"
const ALT_ROW = "EBF0FA"
const ACCENT = "2E6DB4"

const TAB_COLOURS = {
  enriched: "1B3A6B",   // Navy
  drafts: "2E6DB4",    // Blue
  summary: "217346",   // Green
  multitouch: "C55A11", // Orange
  linkedin: "0A66C2",  // LinkedIn blue
  methodology: "7030A0", // Purple
}

// ─── Cell style helpers ──────────────────────────────────────────────────────

function headerStyle() {
  return {
    font: { bold: true, color: { rgb: WHITE }, sz: 11 },
    fill: { fgColor: { rgb: NAVY }, patternType: "solid" },
    alignment: { horizontal: "center", vertical: "center", wrapText: false },
    border: {
      bottom: { style: "thin", color: { rgb: ACCENT } },
    },
  }
}

function dataStyle(rowIdx: number, wrap = false) {
  const isAlt = rowIdx % 2 === 0
  return {
    font: { sz: 10 },
    fill: {
      fgColor: { rgb: isAlt ? ALT_ROW : WHITE },
      patternType: "solid",
    },
    alignment: { vertical: "top", wrapText: wrap },
  }
}

function accentStyle() {
  return {
    font: { bold: true, color: { rgb: ACCENT }, sz: 10 },
    fill: { fgColor: { rgb: "F0F5FF" }, patternType: "solid" },
  }
}

/** Apply styles to a range of cells in a worksheet */
function styleRange(
  ws: XLSX.WorkSheet,
  startRow: number,
  endRow: number,
  cols: number,
  styleFactory: (row: number, col: number) => object
) {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = 0; c < cols; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      if (!ws[addr]) continue
      ws[addr].s = styleFactory(r - startRow, c)
    }
  }
}

/** Set all header cells (row 0) to header style */
function applyHeaderStyles(ws: XLSX.WorkSheet, numCols: number) {
  for (let c = 0; c < numCols; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) ws[addr] = { t: "s", v: "" }
    ws[addr].s = headerStyle()
  }
}

/** Auto-width: measure column content up to maxWidth chars */
function autoWidth(ws: XLSX.WorkSheet, headers: string[], maxWidth = 60): XLSX.ColInfo[] {
  const widths = headers.map((h) => Math.min(h.length + 4, maxWidth))

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1")
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr]
      if (!cell) continue
      const val = String(cell.v ?? "")
      // For long text cells use the first line only for width measurement
      const firstLine = val.split("\n")[0] ?? ""
      widths[c] = Math.min(Math.max(widths[c] ?? 10, firstLine.length + 2), maxWidth)
    }
  }

  return widths.map((w) => ({ wch: w }))
}

// ─── Sheet 1: Enriched Profiles ─────────────────────────────────────────────

const ENRICHED_HEADERS = [
  "#",
  "Name",
  "Role",
  "LP Type",
  "Location",
  "Email",
  "Sectors",
  "Firm Intelligence",
  "Investment Mandate",
  "Personalisation Hook",
  "Enriched Subject",
  "Multi-Touch Note",
  "Batch",
  "Fit Score",
  "Outreach Status",
]

function buildEnrichedSheet(profiles: EnrichedProfile[]): XLSX.WorkSheet {
  const rows: (string | number)[][] = [ENRICHED_HEADERS]

  for (const p of profiles) {
    rows.push([
      p.id,
      p.name,
      p.role,
      LP_TONE[p.lpType]?.label ?? p.lpType,
      p.location,
      p.email,
      p.sectors.join(", "),
      p.firmIntelligence,
      p.investmentMandate,
      p.personalisationHook,
      p.enrichedSubject,
      p.multiTouchNote,
      p.batch,
      p.fitScore,
      p.outreachStatus,
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Frozen pane below header
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft" }

  // Auto-filter
  ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" }

  // Column widths
  ws["!cols"] = autoWidth(ws, ENRICHED_HEADERS)

  // Tall rows for text columns
  ws["!rows"] = rows.map((_, i) =>
    i === 0 ? { hpt: 22 } : { hpt: 60 }
  )

  // Styles
  applyHeaderStyles(ws, ENRICHED_HEADERS.length)
  styleRange(ws, 1, profiles.length, ENRICHED_HEADERS.length, (rowIdx, colIdx) => {
    const wrap = colIdx >= 7 && colIdx <= 11 // text-heavy columns
    return dataStyle(rowIdx, wrap)
  })

  return ws
}

// ─── Sheet 2: Email Drafts ───────────────────────────────────────────────────

const DRAFT_HEADERS = [
  "#",
  "Name",
  "LP Type",
  "Email",
  "Subject",
  "Body",
  "Batch",
  "Multi-Touch Note",
]

function buildDraftsSheet(profiles: EnrichedProfile[]): XLSX.WorkSheet {
  const rows: (string | number)[][] = [DRAFT_HEADERS]

  for (const p of profiles) {
    rows.push([
      p.id,
      p.name,
      LP_TONE[p.lpType]?.label ?? p.lpType,
      p.email,
      p.emailDraft.subject,
      p.emailDraft.body,
      p.batch,
      p.multiTouchNote,
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft" }
  ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" }
  ws["!cols"] = autoWidth(ws, DRAFT_HEADERS, 80)
  ws["!rows"] = rows.map((_, i) => (i === 0 ? { hpt: 22 } : { hpt: 120 }))

  applyHeaderStyles(ws, DRAFT_HEADERS.length)
  styleRange(ws, 1, profiles.length, DRAFT_HEADERS.length, (rowIdx, colIdx) => {
    return dataStyle(rowIdx, colIdx === 5) // wrap body column
  })

  return ws
}

// ─── Sheet 3: Campaign Summary ───────────────────────────────────────────────

function buildSummarySheet(result: CampaignResult): XLSX.WorkSheet {
  const { stats } = result

  const rows: (string | number | Date)[][] = [
    [`${SENDER_PROFILE.fundShortName} — Campaign Summary`],
    [],
    ["Generated", new Date().toISOString().slice(0, 10)],
    ["Total LPs", stats.total],
    ["Batches", stats.batches],
    ["Multi-Touch Pairs", stats.multiTouchPairs],
    ["Average Fit Score", stats.avgFitScore],
    [],
    ["LP Type Breakdown", "", "Count", "% of Total"],
  ]

  const total = stats.total || 1
  for (const [type, count] of Object.entries(stats.byLPType)) {
    const label = LP_TONE[type as keyof typeof LP_TONE]?.label ?? type
    rows.push([label, "", count, `${Math.round((count / total) * 100)}%`])
  }

  rows.push([], ["Score Tiers", "", "Count"])
  const tiers = { "90-100 (Excellent)": 0, "70-89 (Strong)": 0, "50-69 (Moderate)": 0, "< 50 (Low)": 0 }
  for (const p of result.enriched) {
    if (p.fitScore >= 90) tiers["90-100 (Excellent)"]++
    else if (p.fitScore >= 70) tiers["70-89 (Strong)"]++
    else if (p.fitScore >= 50) tiers["50-69 (Moderate)"]++
    else tiers["< 50 (Low)"]++
  }
  for (const [tier, count] of Object.entries(tiers)) {
    rows.push([tier, "", count])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!cols"] = [{ wch: 28 }, { wch: 4 }, { wch: 14 }, { wch: 14 }]

  // Title style
  const titleCell = ws["A1"]
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 14, color: { rgb: NAVY } },
      alignment: { horizontal: "left" },
    }
  }

  // Section header styles
  for (const addr of ["A3", "A9", "A" + (11 + Object.keys(stats.byLPType).length)]) {
    if (ws[addr]) ws[addr].s = accentStyle()
  }

  return ws
}

// ─── Sheet 4: Multi-Touch Tracker ───────────────────────────────────────────

const MT_HEADERS = ["Firm", "Contact #1 Name", "Contact #1 Email", "Contact #2 Name", "Contact #2 Email", "Note"]

function buildMultiTouchSheet(profiles: EnrichedProfile[]): XLSX.WorkSheet {
  // Group by firm
  const byFirm: Record<string, EnrichedProfile[]> = {}
  for (const p of profiles) {
    const key = p.firm.toLowerCase().trim()
    if (!byFirm[key]) byFirm[key] = []
    byFirm[key].push(p)
  }

  const rows: string[][] = [MT_HEADERS]
  for (const [, group] of Object.entries(byFirm)) {
    if (group.length < 2) continue
    const [first, second, ...rest] = group
    rows.push([
      first!.firm,
      first!.name,
      first!.email,
      second?.name ?? "",
      second?.email ?? "",
      rest.length > 0
        ? `+${rest.length} more: ${rest.map((r) => r.name).join(", ")}`
        : "Coordinated outreach recommended — reference peer contact in follow-up",
    ])
  }

  if (rows.length === 1) {
    rows.push(["No multi-touch pairs detected in this batch", "", "", "", "", ""])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft" }
  ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" }
  ws["!cols"] = autoWidth(ws, MT_HEADERS)

  applyHeaderStyles(ws, MT_HEADERS.length)
  styleRange(ws, 1, rows.length - 1, MT_HEADERS.length, (rowIdx) => dataStyle(rowIdx, true))

  return ws
}

// ─── Sheet 5: LinkedIn DMs ───────────────────────────────────────────────────

const LI_HEADERS = ["#", "Name", "Firm", "LP Type", "LinkedIn DM (≤300 chars)", "Character Count"]

function buildLinkedInSheet(profiles: EnrichedProfile[]): XLSX.WorkSheet {
  const rows: (string | number)[][] = [LI_HEADERS]

  for (const p of profiles) {
    // Condense the email body to a LinkedIn DM (≤300 chars)
    const fullBody = p.emailDraft.body
    const tone = LP_TONE[p.lpType]

    // Strip formal salutation/sign-off, take first substantive sentence(s)
    const sentences = fullBody
      .replace(/^(Dear|Hi|Hello)[^.!?]*[.!?]\s*/i, "")
      .replace(/\[Sender Name\][^$]*/gi, "")
      .split(/[.!?]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20)

    let dm = ""
    for (const s of sentences) {
      const candidate = dm ? `${dm}. ${s}` : s
      if (candidate.length <= 280) {
        dm = candidate
      } else break
    }

    if (!dm) dm = fullBody.slice(0, 280)
    dm = dm.replace(/\s+/g, " ").trim()
    if (dm.length > 280) dm = dm.slice(0, 277) + "…"

    // Add CTA
    const cta = tone?.ctaStyle.includes("call") ? " Worth a quick call?" : " Happy to share more."
    if ((dm + cta).length <= 300) dm += cta

    rows.push([p.id, p.name, p.firm, LP_TONE[p.lpType]?.label ?? p.lpType, dm, dm.length])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft" }
  ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" }
  ws["!cols"] = autoWidth(ws, LI_HEADERS, 70)
  ws["!rows"] = rows.map((_, i) => (i === 0 ? { hpt: 22 } : { hpt: 72 }))

  applyHeaderStyles(ws, LI_HEADERS.length)
  styleRange(ws, 1, profiles.length, LI_HEADERS.length, (rowIdx, colIdx) =>
    dataStyle(rowIdx, colIdx === 4)
  )

  return ws
}

// ─── Sheet 6: Methodology ───────────────────────────────────────────────────

function buildMethodologySheet(): XLSX.WorkSheet {
  const rows: string[][] = [
    [`${SENDER_PROFILE.fundShortName} — Outreach Campaign Methodology`],
    [],
    ["PIPELINE OVERVIEW"],
    ["Step 1", "Profile Enrichment", "AI-powered research on each LP's firm mandate, investment focus, and personalisation hook. Processed in batches of ≤10 to avoid rate limits."],
    ["Step 2", "Email Drafting", "Tone-matched email per LP type using Claude claude-opus-4-6. Multi-touch detection identifies same-firm contacts and references prior outreach."],
    ["Step 3", "Excel Export", "This workbook — 6 sheets covering enrichment, drafts, summary, multi-touch, LinkedIn DMs, and methodology."],
    ["Step 4", "HTML Review UI", "Self-contained HTML file with expandable LP cards, type/score badges, filter pills, and copy-to-clipboard email drafts."],
    [],
    ["LP TYPE TONE GUIDE"],
    ["LP Type", "Tone", "Opening Frame", "CTA Style"],
    ...Object.entries(LP_TONE).map(([, v]) => [
      v.label,
      v.tone,
      v.openingFrame,
      v.ctaStyle,
    ]),
    [],
    ["RULES"],
    ["R1", "Never auto-send — all drafts require human review and approval before sending."],
    ["R2", "Multi-touch pairs at the same firm must coordinate messaging — reference prior contact in follow-up."],
    ["R3", "Fit score < 40 = flag for manual review before including in campaign."],
    ["R4", "Enrichment batches capped at 10 profiles per run with 2-second inter-batch pause."],
    ["R5", "LP-class allocators (family offices, FoFs, endowments) are never cold-DM'd on LinkedIn — email or warm-intro only."],
    [],
    ["SENDER BRIEF"],
    ["Fund", SENDER_PROFILE.fundShortName],
    ["Strategy", SENDER_PROFILE.strategy],
    ["Check Size", SENDER_PROFILE.checkSize],
    ["AUM Target", SENDER_PROFILE.aumTarget],
    ["Close Target", SENDER_PROFILE.closeTarget],
    ["Contact", SENDER_PROFILE.gpEmail],
  ]

  const ws = XLSX.utils.aoa_to_sheet(rows)

  ws["!cols"] = [{ wch: 10 }, { wch: 22 }, { wch: 60 }, { wch: 28 }]

  // Title
  if (ws["A1"]) ws["A1"].s = { font: { bold: true, sz: 14, color: { rgb: NAVY } } }

  // Section headers
  for (const addr of ["A3", "A9", "A18", "A24"]) {
    if (ws[addr]) ws[addr].s = accentStyle()
  }

  // Column header row for LP types
  if (ws["A10"]) ws["A10"].s = headerStyle()
  if (ws["B10"]) ws["B10"].s = headerStyle()
  if (ws["C10"]) ws["C10"].s = headerStyle()
  if (ws["D10"]) ws["D10"].s = headerStyle()

  return ws
}

// ─── Main export function ────────────────────────────────────────────────────

/**
 * Build and return the XLSX workbook as a Node.js Buffer.
 * Caller writes it to disk.
 */
export function buildXlsx(result: CampaignResult): Buffer {
  const wb = XLSX.utils.book_new()

  const sheetEnriched = buildEnrichedSheet(result.enriched)
  const sheetDrafts = buildDraftsSheet(result.enriched)
  const sheetSummary = buildSummarySheet(result)
  const sheetMultiTouch = buildMultiTouchSheet(result.enriched)
  const sheetLinkedIn = buildLinkedInSheet(result.enriched)
  const sheetMethodology = buildMethodologySheet()

  XLSX.utils.book_append_sheet(wb, sheetEnriched, "Enriched Profiles")
  XLSX.utils.book_append_sheet(wb, sheetDrafts, "Email Drafts")
  XLSX.utils.book_append_sheet(wb, sheetSummary, "Campaign Summary")
  XLSX.utils.book_append_sheet(wb, sheetMultiTouch, "Multi-Touch Tracker")
  XLSX.utils.book_append_sheet(wb, sheetLinkedIn, "LinkedIn DMs")
  XLSX.utils.book_append_sheet(wb, sheetMethodology, "Methodology")

  // Tab colours (SheetJS Pro feature — degrades gracefully in community edition)
  try {
    const names = Object.keys(TAB_COLOURS) as (keyof typeof TAB_COLOURS)[]
    const sheetNames = ["Enriched Profiles", "Email Drafts", "Campaign Summary", "Multi-Touch Tracker", "LinkedIn DMs", "Methodology"]
    for (let i = 0; i < sheetNames.length; i++) {
      const colourKey = names[i]!
      const sheetName = sheetNames[i]!
      if (wb.Sheets[sheetName]) {
        if (!wb.Sheets[sheetName]["!tabcolor"]) {
          wb.Sheets[sheetName]["!tabcolor"] = { rgb: TAB_COLOURS[colourKey] }
        }
      }
    }
  } catch {
    // Non-fatal — tab colours may not render in all XLSX viewers
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer
}
