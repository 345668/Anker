/**
 * Legal templates → PDF export.
 *
 * pdf-lib has no Markdown renderer — we tokenize the same Markdown
 * subset the DOCX exporter handles and emit a paginated PDF in
 * Times-Roman 11pt with 1-inch margins and a centered title page.
 *
 * Empty field slots are already inlined as plain "[ Label · TBD ]" text
 * by renderTemplate({ plainText: true }), so the PDF is a fillable
 * starting point — operator/counsel can use a normal PDF editor to
 * replace the TBD spans.
 *
 * Why pdf-lib instead of html-pdf/puppeteer?
 *   - pdf-lib is already in package.json (capital-account.ts uses it)
 *   - No headless-chrome subprocess on the Vercel runtime
 *   - The legal templates are pure prose; we don't need a browser
 *     renderer's layout engine
 */

import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib"

interface LegalPdfArgs {
  title: string
  source: string
  body: string
  fundName?: string
}

const PAGE_W = 612         // 8.5"
const PAGE_H = 792         // 11"
const MARGIN = 72          // 1"
const TEXT_W = PAGE_W - 2 * MARGIN
const BODY_SIZE = 11
const LINE_H = BODY_SIZE * 1.45
const FOOTER_RESERVE = 36

interface Ctx {
  pdf: PDFDocument
  page: PDFPage
  cursorY: number
  fonts: { body: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont; display: PDFFont; displayBold: PDFFont }
  pageNo: number
}

export async function legalTemplateToPdfBuffer(args: LegalPdfArgs): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(args.title)
  pdf.setAuthor("Anker · Legal & Compliance")
  pdf.setProducer("Anker")
  const fonts = {
    body: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    boldItalic: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
    display: await pdf.embedFont(StandardFonts.Helvetica),
    displayBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  const ctx: Ctx = {
    pdf,
    page: pdf.addPage([PAGE_W, PAGE_H]),
    cursorY: PAGE_H - MARGIN,
    fonts,
    pageNo: 1,
  }

  // Letterhead.
  drawCentered(ctx, args.title, fonts.displayBold, 20, 0)
  ctx.cursorY -= 24
  if (args.fundName) {
    drawCentered(ctx, args.fundName, fonts.display, 13, 0.4)
    ctx.cursorY -= 18
  }
  drawCentered(ctx, `Source: ${args.source}`, fonts.display, 9, 0.55)
  ctx.cursorY -= 24
  drawHr(ctx)

  // Body.
  parseAndDraw(ctx, args.body)

  // Footers.
  paginateFooters(ctx)

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

// ─── token-stream parser ─────────────────────────────────────────────────

function parseAndDraw(ctx: Ctx, body: string): void {
  const lines = body.split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === "") { i++; continue }

    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      drawHeading(ctx, h[2], h[1].length)
      i++; continue
    }
    if (/^---+$/.test(line.trim())) {
      drawHr(ctx)
      i++; continue
    }
    // Table.
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[-:|\s]+\|/.test(lines[i + 1])) {
      const tbl: string[] = []
      while (i < lines.length && lines[i].includes("|")) {
        tbl.push(lines[i])
        i++
      }
      drawTable(ctx, tbl)
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        const item = lines[i].replace(/^[-*]\s+/, "")
        drawListItem(ctx, item, "•")
        i++
      }
      ctx.cursorY -= 4
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      let n = 1
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\d+\.\s+/, "")
        drawListItem(ctx, item, `${n}.`)
        n++; i++
      }
      ctx.cursorY -= 4
      continue
    }
    // Paragraph.
    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== "" && !/^#{1,4}\s/.test(lines[i]) && !/^---+$/.test(lines[i].trim()) && !/^[-*]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i])) {
      para.push(lines[i])
      i++
    }
    if (para.length > 0) {
      drawParagraph(ctx, para.join(" "))
    }
  }
}

// ─── drawing primitives ──────────────────────────────────────────────────

function ensureRoom(ctx: Ctx, needed: number): void {
  if (ctx.cursorY - needed < MARGIN + FOOTER_RESERVE) {
    ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H])
    ctx.cursorY = PAGE_H - MARGIN
    ctx.pageNo++
  }
}

function drawCentered(ctx: Ctx, text: string, font: PDFFont, size: number, gray: number): void {
  ensureRoom(ctx, size + 4)
  const w = font.widthOfTextAtSize(text, size)
  const x = (PAGE_W - w) / 2
  ctx.page.drawText(text, { x, y: ctx.cursorY - size, font, size, color: rgb(gray, gray, gray) })
}

function drawHr(ctx: Ctx): void {
  ensureRoom(ctx, 8)
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.cursorY - 4 },
    end:   { x: PAGE_W - MARGIN, y: ctx.cursorY - 4 },
    thickness: 0.5,
    color: rgb(0.65, 0.65, 0.65),
  })
  ctx.cursorY -= 14
}

function drawHeading(ctx: Ctx, text: string, level: number): void {
  const sizes = [0, 20, 16, 13, 12]
  const size = sizes[level] ?? 12
  ensureRoom(ctx, size + 12)
  ctx.cursorY -= size + 6
  // Render headings without the inline-bold rune so "## **A**" doesn't double-bold.
  const plain = text.replace(/\*\*/g, "").replace(/\*/g, "")
  ctx.page.drawText(plain, { x: MARGIN, y: ctx.cursorY, font: ctx.fonts.displayBold, size, color: rgb(0.1, 0.1, 0.1) })
  if (level === 2) {
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.cursorY - 3 },
      end:   { x: PAGE_W - MARGIN, y: ctx.cursorY - 3 },
      thickness: 0.4,
      color: rgb(0.75, 0.75, 0.75),
    })
  }
  ctx.cursorY -= 8
}

function drawParagraph(ctx: Ctx, text: string): void {
  const runs = tokenizeInline(text)
  drawRichWrappedLines(ctx, runs, MARGIN, TEXT_W)
  ctx.cursorY -= 4
}

function drawListItem(ctx: Ctx, text: string, marker: string): void {
  // Marker hangs in a 16pt indent.
  ensureRoom(ctx, LINE_H)
  ctx.page.drawText(marker, { x: MARGIN + 6, y: ctx.cursorY - BODY_SIZE, font: ctx.fonts.body, size: BODY_SIZE, color: rgb(0.15, 0.15, 0.15) })
  const runs = tokenizeInline(text)
  drawRichWrappedLines(ctx, runs, MARGIN + 24, TEXT_W - 24)
}

function drawTable(ctx: Ctx, lines: string[]): void {
  const split = (l: string) =>
    l.split("|").map((c) => c.trim()).filter((_, ix, arr) =>
      !(ix === 0 && arr[0] === "") && !(ix === arr.length - 1 && arr[arr.length - 1] === ""),
    )
  const header = split(lines[0])
  const rows = lines.slice(2).map(split)
  const colW = TEXT_W / Math.max(1, header.length)
  const rowH = LINE_H + 6
  // Header.
  ensureRoom(ctx, rowH + 4)
  for (let c = 0; c < header.length; c++) {
    ctx.page.drawRectangle({
      x: MARGIN + c * colW,
      y: ctx.cursorY - rowH,
      width: colW,
      height: rowH,
      color: rgb(0.95, 0.95, 0.95),
    })
    drawCellText(ctx, header[c].replace(/\*\*/g, ""), MARGIN + c * colW + 4, ctx.cursorY - BODY_SIZE - 4, colW - 8, ctx.fonts.bold)
  }
  ctx.cursorY -= rowH
  // Body.
  for (const r of rows) {
    ensureRoom(ctx, rowH)
    for (let c = 0; c < r.length; c++) {
      ctx.page.drawLine({
        start: { x: MARGIN + c * colW, y: ctx.cursorY },
        end:   { x: MARGIN + (c + 1) * colW, y: ctx.cursorY },
        thickness: 0.4,
        color: rgb(0.85, 0.85, 0.85),
      })
      drawCellText(ctx, (r[c] ?? "").replace(/\*\*/g, ""), MARGIN + c * colW + 4, ctx.cursorY - BODY_SIZE - 4, colW - 8, ctx.fonts.body)
    }
    ctx.cursorY -= rowH
  }
  ctx.cursorY -= 6
}

function drawCellText(ctx: Ctx, text: string, x: number, y: number, w: number, font: PDFFont): void {
  let line = ""
  const words = text.split(/\s+/)
  for (const word of words) {
    const candidate = line ? line + " " + word : word
    if (font.widthOfTextAtSize(candidate, BODY_SIZE) > w) {
      ctx.page.drawText(line, { x, y, font, size: BODY_SIZE, color: rgb(0.1, 0.1, 0.1) })
      line = word
      y -= LINE_H
    } else line = candidate
  }
  if (line) ctx.page.drawText(line, { x, y, font, size: BODY_SIZE, color: rgb(0.1, 0.1, 0.1) })
}

// ─── inline tokenizer (bold + italic) + word-wrap drawer ─────────────────-

interface Run { text: string; bold: boolean; italic: boolean }

function tokenizeInline(text: string): Run[] {
  // Strip escaped underscores used in signature lines.
  let s = text.replace(/\\_/g, "_")
  const runs: Run[] = []
  let bold = false, italic = false, buf = ""
  let i = 0
  while (i < s.length) {
    if (s.slice(i, i + 2) === "**") {
      if (buf) runs.push({ text: buf, bold, italic })
      buf = ""
      bold = !bold
      i += 2
    } else if (s[i] === "*") {
      if (buf) runs.push({ text: buf, bold, italic })
      buf = ""
      italic = !italic
      i += 1
    } else {
      buf += s[i]
      i += 1
    }
  }
  if (buf) runs.push({ text: buf, bold, italic })
  return runs
}

function pickFont(ctx: Ctx, r: Run): PDFFont {
  if (r.bold && r.italic) return ctx.fonts.boldItalic
  if (r.bold) return ctx.fonts.bold
  if (r.italic) return ctx.fonts.italic
  return ctx.fonts.body
}

function drawRichWrappedLines(ctx: Ctx, runs: Run[], xLeft: number, width: number): void {
  // Flatten into word-level segments retaining bold/italic flags.
  type Seg = { text: string; font: PDFFont; w: number; space?: boolean }
  const segs: Seg[] = []
  for (const r of runs) {
    const words = r.text.split(/(\s+)/)
    for (const w of words) {
      if (!w) continue
      const font = pickFont(ctx, r)
      const width = font.widthOfTextAtSize(w, BODY_SIZE)
      segs.push({ text: w, font, w: width, space: /\s/.test(w) })
    }
  }
  // Greedy line break.
  let lineWidth = 0
  let line: Seg[] = []
  const flush = () => {
    ensureRoom(ctx, LINE_H)
    let x = xLeft
    for (const s of line) {
      ctx.page.drawText(s.text, { x, y: ctx.cursorY - BODY_SIZE, font: s.font, size: BODY_SIZE, color: rgb(0.1, 0.1, 0.1) })
      x += s.w
    }
    ctx.cursorY -= LINE_H
    line = []
    lineWidth = 0
  }
  for (const s of segs) {
    if (lineWidth + s.w > width && line.length > 0) {
      flush()
      if (s.space) continue  // skip leading whitespace on the new line
    }
    line.push(s)
    lineWidth += s.w
  }
  if (line.length > 0) flush()
}

function paginateFooters(ctx: Ctx): void {
  const pages = ctx.pdf.getPages()
  const total = pages.length
  pages.forEach((p, ix) => {
    const txt = `Page ${ix + 1} of ${total}`
    const w = ctx.fonts.display.widthOfTextAtSize(txt, 9)
    p.drawText(txt, {
      x: (PAGE_W - w) / 2,
      y: MARGIN / 2,
      font: ctx.fonts.display,
      size: 9,
      color: rgb(0.55, 0.55, 0.55),
    })
  })
}
