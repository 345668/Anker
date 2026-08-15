/**
 * browser-export.ts — browser-safe export helpers.
 *
 * Safe to import from "use client" components.
 * Contains NO Node.js built-ins (no node:child_process, node:fs, node:path).
 *
 * Exports:
 *   buildXlsxBuffer  — SheetJS 6-sheet workbook → Uint8Array (download in browser)
 *   buildHtmlString  — self-contained HTML review UI string (re-exported)
 *
 * The server-only variants (Python openpyxl, fs writes) live in
 * excelExporter.ts and must never be imported by client components.
 */

import * as XLSX from "xlsx"
import type { PipelineResult } from "./types"
import { SENDER_PROFILE } from "./sender-profile"
export { buildHtmlReviewUI as buildHtmlString } from "./htmlReviewUI"

// ─── Style helpers ────────────────────────────────────────────────────────────

const NAVY = "1A3A5C"
const TEAL = "185FA5"
const WHITE = "FFFFFF"
const ALT  = "EBF3FB"

function hdr(col = NAVY) {
  return {
    font: { bold: true, color: { rgb: WHITE }, sz: 10 },
    fill: { fgColor: { rgb: col }, patternType: "solid" as const },
    alignment: { horizontal: "center", vertical: "top" },
  }
}

function rowStyle(idx: number, wrap = false) {
  return {
    font: { sz: 9 },
    fill: { fgColor: { rgb: idx % 2 === 0 ? ALT : WHITE }, patternType: "solid" as const },
    alignment: { vertical: "top", wrapText: wrap },
  }
}

function applyHeaders(ws: XLSX.WorkSheet, headers: string[], tealCols: Set<number> = new Set()) {
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) ws[addr] = { t: "s", v: headers[c] }
    ws[addr].s = hdr(tealCols.has(c) ? TEAL : NAVY)
  }
}

function applyDataStyles(ws: XLSX.WorkSheet, numRows: number, numCols: number, wrapCols: Set<number>) {
  for (let r = 1; r <= numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      if (!ws[addr]) continue
      ws[addr].s = rowStyle(r, wrapCols.has(c))
    }
  }
}

function autoColWidths(headers: string[], ws: XLSX.WorkSheet, max = 65): XLSX.ColInfo[] {
  const w = headers.map((h) => Math.min(h.length + 4, max))
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1")
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell) continue
      const fl = String(cell.v ?? "").split("\n")[0] ?? ""
      w[c] = Math.min(Math.max(w[c] ?? 10, fl.length + 2), max)
    }
  }
  return w.map((wch) => ({ wch }))
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build a 6-sheet XLSX workbook in the browser using SheetJS.
 * Returns a Uint8Array suitable for creating a Blob and triggering a download.
 *
 * Usage in a client component:
 *   const buf = buildXlsxBuffer(result)
 *   const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
 *   const url = URL.createObjectURL(blob)
 *   Object.assign(document.createElement("a"), { href: url, download: "campaign.xlsx" }).click()
 *   URL.revokeObjectURL(url)
 */
export function buildXlsxBuffer(result: PipelineResult): Uint8Array {
  const { enriched, drafts, stats } = result
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Enriched Profiles ─────────────────────────────────────────────
  const EP_H = [
    "#", "Tier", "Score", "Name", "Title/Role", "LP Type", "Tags",
    "Location", "Email", "LinkedIn", "Sectors", "Why This Contact",
    "Firm Intelligence", "Investment Mandate", "Personalisation Hook",
    "Multi-Touch Note", "Batch", "Channel", "Status",
  ]
  const EP_TEAL = new Set([12, 13, 14, 15])
  const epRows: unknown[][] = [EP_H]
  for (const p of enriched) {
    epRows.push([
      p.id, p.tier, p.score, p.name, p.titleRole, p.lpType, p.tags,
      p.location, p.email, p.linkedin, p.sectors, p.whyThisContact,
      p.firmIntelligence, p.investmentMandate, p.personalisationHook,
      p.isMultiTouch ? `Prior: ${p.multiTouchPriorContact}` : "",
      p.batch, "", "Draft",
    ])
  }
  const ws1 = XLSX.utils.aoa_to_sheet(epRows)
  ws1["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft" }
  ws1["!autofilter"] = { ref: ws1["!ref"] ?? "A1" }
  ws1["!cols"] = autoColWidths(EP_H, ws1)
  ws1["!rows"] = epRows.map((_, i) => (i === 0 ? { hpt: 22 } : { hpt: 64 }))
  applyHeaders(ws1, EP_H, EP_TEAL)
  applyDataStyles(ws1, enriched.length, EP_H.length, new Set([12, 13, 14, 15]))
  XLSX.utils.book_append_sheet(wb, ws1, "Enriched Profiles")

  // ── Sheet 2: Email Drafts ──────────────────────────────────────────────────
  const ED_H = ["#", "Name", "LP Type", "Email", "Subject", "Body", "Channel", "Voice Notes", "Status"]
  const edRows: unknown[][] = [ED_H]
  for (const d of drafts) {
    edRows.push([d.investorId, d.name, d.lpType, d.email, d.subject, d.body, d.primaryChannel, d.voiceNotes, d.outreachStatus])
  }
  const ws2 = XLSX.utils.aoa_to_sheet(edRows)
  ws2["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft" }
  ws2["!autofilter"] = { ref: ws2["!ref"] ?? "A1" }
  ws2["!cols"] = autoColWidths(ED_H, ws2, 80)
  ws2["!rows"] = edRows.map((_, i) => (i === 0 ? { hpt: 22 } : { hpt: 120 }))
  applyHeaders(ws2, ED_H)
  applyDataStyles(ws2, drafts.length, ED_H.length, new Set([5]))
  XLSX.utils.book_append_sheet(wb, ws2, "Email Drafts")

  // ── Sheet 3: LinkedIn DMs ──────────────────────────────────────────────────
  const LI_H = ["#", "Name", "LP Type", "LinkedIn URL", "DM (first touch)", "Chars", "Voice Notes"]
  const draftMap = new Map(drafts.map((d) => [d.investorId, d]))
  const liRows: unknown[][] = [LI_H]
  for (const p of enriched) {
    const d = draftMap.get(p.id)
    const dm = d?.linkedInDM ?? ""
    liRows.push([p.id, p.name, p.lpType, p.linkedin, dm, dm.length, d?.voiceNotes ?? ""])
  }
  const ws3 = XLSX.utils.aoa_to_sheet(liRows)
  ws3["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft" }
  ws3["!autofilter"] = { ref: ws3["!ref"] ?? "A1" }
  ws3["!cols"] = autoColWidths(LI_H, ws3, 70)
  ws3["!rows"] = liRows.map((_, i) => (i === 0 ? { hpt: 22 } : { hpt: 72 }))
  applyHeaders(ws3, LI_H)
  applyDataStyles(ws3, enriched.length, LI_H.length, new Set([4]))
  XLSX.utils.book_append_sheet(wb, ws3, "LinkedIn DMs")

  // ── Sheet 4: Campaign Summary ──────────────────────────────────────────────
  const sumRows: unknown[][] = [
    [`${SENDER_PROFILE.fundName} — Campaign Summary`],
    [],
    ["Generated", result.generatedAt.slice(0, 10)],
    ["Total LPs", stats.total],
    ["Batches", stats.batches],
    ["Multi-Touch Pairs", stats.multiTouchCount],
    ["Avg Score", stats.avgScore],
    [],
    ["LP Type", "Count", "% of Total"],
    ...Object.entries(stats.byLPType).map(([t, c]) => [t, c, `${Math.round((c / stats.total) * 100)}%`]),
    [],
    ["Channel", "Count"],
    ...Object.entries(stats.byChannel).map(([ch, c]) => [ch, c]),
  ]
  const ws4 = XLSX.utils.aoa_to_sheet(sumRows)
  ws4["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws4, "Campaign Summary")

  // ── Sheet 5: Multi-Touch Tracker ───────────────────────────────────────────
  const MT_H = ["Firm / Website", "Contact 1", "Email 1", "Contact 2", "Email 2", "Note"]
  const byDomain = new Map<string, typeof enriched>()
  for (const p of enriched) {
    const key = (p.inferredWebsite || p.name.slice(0, 20)).toLowerCase()
    const g = byDomain.get(key) ?? []
    g.push(p)
    byDomain.set(key, g)
  }
  const mtRows: unknown[][] = [MT_H]
  for (const [domain, group] of byDomain) {
    if (group.length < 2) continue
    const [a, b] = group
    mtRows.push([domain, a!.name, a!.email, b!.name, b!.email, "Coordinate outreach — reference prior contact"])
  }
  if (mtRows.length === 1) mtRows.push(["No multi-touch pairs", "", "", "", "", ""])
  const ws5 = XLSX.utils.aoa_to_sheet(mtRows)
  ws5["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft" }
  applyHeaders(ws5, MT_H)
  applyDataStyles(ws5, mtRows.length - 1, MT_H.length, new Set([5]))
  ws5["!cols"] = autoColWidths(MT_H, ws5)
  XLSX.utils.book_append_sheet(wb, ws5, "Multi-Touch Tracker")

  // ── Sheet 6: Methodology ───────────────────────────────────────────────────
  const methRows: unknown[][] = [
    [`${SENDER_PROFILE.fundName} — Methodology`],
    [],
    ["Step 1", "Profile Enrichment", "AI research on each LP in batches of ≤10"],
    ["Step 2", "Email Drafting", "Tone-matched email + DM per LP type"],
    ["Step 3", "Excel Export", "This workbook — 6 sheets"],
    ["Step 4", "HTML Review UI", "Self-contained HTML with expandable cards"],
    [],
    ["Voice Rules"],
    ["V1", "Relationship before transaction"],
    ["V2", "Quiet credibility — one specific reason this LP was chosen"],
    ["V3", "No em-dashes, no hype, no generic compliments"],
    ["V4", "Concrete proof points only (Fund I $10M, 200+ uni partnerships)"],
    ["V5", "One clear ask: 20-30 min intro call"],
  ]
  const ws6 = XLSX.utils.aoa_to_sheet(methRows)
  ws6["!cols"] = [{ wch: 10 }, { wch: 22 }, { wch: 55 }]
  XLSX.utils.book_append_sheet(wb, ws6, "Methodology")

  // Tab colours (degrades gracefully in viewers that don't support them)
  try {
    const tabs: Record<string, string> = {
      "Enriched Profiles": NAVY, "Email Drafts": TEAL,
      "LinkedIn DMs": "0A66C2", "Campaign Summary": "217346",
      "Multi-Touch Tracker": "C55A11", "Methodology": "7030A0",
    }
    for (const [name, color] of Object.entries(tabs)) {
      if (wb.Sheets[name]) wb.Sheets[name]["!tabcolor"] = { rgb: color }
    }
  } catch { /* non-fatal */ }

  // Return as Uint8Array (browser-compatible — no Buffer)
  return XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true }) as Uint8Array
}
