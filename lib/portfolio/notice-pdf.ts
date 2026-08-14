/**
 * LP notice PDFs — capital call & distribution.
 *
 * Uses pdf-lib (already a dependency; no headless-chrome on Vercel). Produces
 * a single-page A4 notice styled after the Carta capital-call / distribution
 * notice: header rule, "Details for {LP}", a key/value details block, a
 * commitment summary, and a Confidential footer.
 */
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib"

export interface NoticeRow {
  label: string
  value: string
  bold?: boolean
  rule?: boolean // draw a section heading rule above
}

export interface NoticePdfInput {
  fundName: string
  kind: "Capital Call Notice" | "Distribution Notice"
  lpName: string
  noticeDate: string
  meta: { label: string; value: string }[] // Initiated by / Date / Due date
  detailRows: NoticeRow[]
  summaryRows: NoticeRow[]
  purpose?: string | null
  brand?: string
}

const A4 = { w: 595.28, h: 841.89 }
const MARGIN = 56

export async function renderNoticePdf(input: NoticePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([A4.w, A4.h])
  const serif = await doc.embedFont(StandardFonts.TimesRoman)
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const mono = await doc.embedFont(StandardFonts.Courier)
  const brand = input.brand ?? "Anker"

  let y = A4.h - MARGIN
  const left = MARGIN
  const right = A4.w - MARGIN
  const ink = rgb(0.07, 0.07, 0.09)
  const muted = rgb(0.42, 0.45, 0.5)

  const text = (s: string, x: number, yy: number, f: PDFFont, size: number, color = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color })
  const textRight = (s: string, xr: number, yy: number, f: PDFFont, size: number, color = ink) =>
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color })
  const rule = (yy: number, color = rgb(0.85, 0.86, 0.88), thickness = 1) =>
    page.drawLine({ start: { x: left, y: yy }, end: { x: right, y: yy }, thickness, color })

  // Header
  text(input.fundName, left, y, serifBold, 18)
  textRight(brand, right, y, serifBold, 14)
  y -= 18
  text(input.kind, left, y, serif, 11, muted)
  y -= 10
  rule(y, ink, 1.5)
  y -= 26

  // Details for {LP}
  text(`Details for ${input.lpName}`, left, y, serifBold, 12)
  y -= 20
  for (const m of input.meta) {
    text(m.label, left, y, serif, 10.5, muted)
    textRight(m.value, right, y, serif, 10.5)
    y -= 16
  }
  y -= 8

  const section = (title: string) => {
    text(title, left, y, serifBold, 11)
    y -= 6
    rule(y)
    y -= 16
  }
  const kv = (rows: NoticeRow[]) => {
    for (const r of rows) {
      const f = r.bold ? serifBold : serif
      text(r.label, left, y, f, 10.5, r.bold ? ink : muted)
      textRight(r.value, right, y, f, 10.5)
      y -= 16
    }
    y -= 8
  }

  section(input.kind === "Capital Call Notice" ? "Capital Call details" : "Distribution details")
  kv(input.detailRows)

  section("Commitment summary")
  kv(input.summaryRows)

  if (input.purpose) {
    section("Purpose")
    const wrapped = wrapText(input.purpose, serif, 10.5, right - left)
    for (const line of wrapped) {
      text(line, left, y, serif, 10.5, muted)
      y -= 15
    }
  }

  // Footer
  const footY = MARGIN
  rule(footY + 16)
  text(brand, left, footY, monoOrSerif(mono), 9, muted)
  page.drawText("CONFIDENTIAL", {
    x: A4.w / 2 - mono.widthOfTextAtSize("CONFIDENTIAL", 8) / 2,
    y: footY, size: 8, font: mono, color: muted,
  })
  textRight(input.noticeDate, right, footY, serif, 9, muted)

  return doc.save()
}

function monoOrSerif(f: PDFFont): PDFFont { return f }

function wrapText(s: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = s.split(/\s+/)
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 12)
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64")
}
