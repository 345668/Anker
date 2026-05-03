/**
 * Shared xlsx export helpers for native calculator tools.
 *
 * Every tool ships with a `buildWorkbook(state)` function that returns a
 * SheetJS workbook. This helper formats the workbook consistently (column
 * widths, freeze panes, title rows) and serializes it to a Buffer that
 * the API route can hand back to the browser.
 */

import * as XLSX from "xlsx"

export interface SheetSpec {
  name: string
  /** 2D array of cells. First row inside `headers` is shown above this. */
  rows: any[][]
  headers?: any[]
  /** Optional column widths in characters */
  colWidths?: number[]
  /** Optional title (row 0, merged across all columns) and subtitle (row 1) */
  title?: string
  subtitle?: string
  /** Freeze rows after the header */
  freeze?: boolean
}

export function buildWorkbook(sheets: SheetSpec[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const sh of sheets) {
    XLSX.utils.book_append_sheet(wb, buildSheet(sh), sh.name.slice(0, 31))
  }
  return wb
}

export function buildSheet(s: SheetSpec): XLSX.WorkSheet {
  const data: any[][] = []
  let headerRow: number | null = null

  if (s.title) data.push([s.title])
  if (s.subtitle) data.push([s.subtitle])
  if (s.title || s.subtitle) data.push([])

  if (s.headers) {
    headerRow = data.length
    data.push(s.headers)
  }
  for (const r of s.rows) data.push(r)

  const ws = XLSX.utils.aoa_to_sheet(data)

  // Column widths
  const cols = Math.max(
    ...data.map((r) => r.length),
    s.colWidths?.length ?? 0,
  )
  if (s.colWidths) {
    ws["!cols"] = s.colWidths.map((w) => ({ wch: w }))
  } else {
    ws["!cols"] = Array.from({ length: cols }, () => ({ wch: 18 }))
  }

  // Title merge across all columns
  const merges: XLSX.Range[] = []
  if (s.title) merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: cols - 1 } })
  if (s.subtitle) merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: cols - 1 } })
  if (merges.length) ws["!merges"] = merges

  if (s.freeze && headerRow !== null) {
    ws["!freeze"] = { xSplit: 0, ySplit: headerRow + 1 } as any
  }
  if (headerRow !== null && s.rows.length) {
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: headerRow, c: 0 },
        e: { r: headerRow + s.rows.length, c: cols - 1 },
      }),
    }
  }

  return ws
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
}

/**
 * Standardised attachment headers for downloadable xlsx files.
 */
export function xlsxResponseHeaders(filename: string): Record<string, string> {
  return {
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${sanitizeFilename(filename)}"`,
  }
}

function sanitizeFilename(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "-")
}

// ─── Tiny helpers tools can reuse ──────────────────────────────────────────
export const fmtUsd = (n: number, digits = 0) =>
  n == null || !isFinite(n) ? "" : `$${n.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
export const fmtPct = (n: number, digits = 1) =>
  n == null || !isFinite(n) ? "" : `${(n * 100).toFixed(digits)}%`
export const fmtNum = (n: number, digits = 0) =>
  n == null || !isFinite(n) ? "" : n.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
