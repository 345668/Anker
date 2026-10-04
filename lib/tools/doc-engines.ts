/**
 * Document tools that run entirely in the browser: merge PDFs, Word to PDF, PDF to Word.
 *
 * Nothing is uploaded: the file is read, converted and offered back as a download in the tab, so confidential documents
 * (term sheets, decks, contracts) never reach a server. The price is fidelity, stated on each tool: these are text-first
 * conversions. Word to PDF keeps headings, paragraphs, bold and italic, lists, simple tables and pictures; it does not
 * reproduce headers and footers, columns, text boxes or exact fonts. PDF to Word recovers the text in reading order with
 * headings and lists; it cannot read a scanned PDF (no text to recover) and does not rebuild the page layout.
 *
 * The pure helpers (wrapping, line grouping, block building) are unit tested; the engines need the browser.
 */

// ── shared helpers ──────────────────────────────────────────────────────

/** Standard PDF fonts speak WinAnsi (Western European). Map the common typographic characters and replace the rest. */
export function sanitizeWinAnsi(s: string): string {
  return s
    .replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[–—]/g, "-")
    .replace(/…/g, "...").replace(/[   ]/g, " ").replace(/[•●▪]/g, "•")
    .replace(/\t/g, "    ").replace(/[​-‍﻿]/g, "")
    .replace(/[^ -~¡-ÿ€•]/g, "?")
}

export interface Run { text: string; bold?: boolean; italic?: boolean }

/** Greedy word wrap of styled runs into lines no wider than maxWidth. `measure` gives the width of one styled word. */
export function wrapRuns(runs: Run[], maxWidth: number, measure: (text: string, r: Run) => number): Run[][] {
  const lines: Run[][] = []
  let line: Run[] = []
  let width = 0
  const push = (text: string, r: Run) => {
    const last = line[line.length - 1]
    if (last && !!last.bold === !!r.bold && !!last.italic === !!r.italic) last.text += text
    else line.push({ text, bold: r.bold, italic: r.italic })
  }
  for (const r of runs) {
    for (const tok of r.text.split(/(\s+)/).filter((t) => t !== "")) {
      const isSpace = /^\s+$/.test(tok)
      const w = measure(isSpace ? " " : tok, r)
      if (isSpace) { if (line.length) { push(" ", r); width += w } continue }
      if (width + w > maxWidth && line.length) {
        if (line[line.length - 1].text.endsWith(" ")) line[line.length - 1].text = line[line.length - 1].text.trimEnd()
        lines.push(line); line = []; width = 0
      }
      // A single word longer than the line is broken by character so it cannot run off the page.
      if (w > maxWidth) {
        let chunk = ""
        for (const ch of tok) {
          if (measure(chunk + ch, r) > maxWidth && chunk) { push(chunk, r); lines.push(line); line = []; width = 0; chunk = "" }
          chunk += ch
        }
        if (chunk) { push(chunk, r); width = measure(chunk, r) }
        continue
      }
      push(tok, r); width += w
    }
  }
  if (line.length) { if (line[line.length - 1].text.endsWith(" ")) line[line.length - 1].text = line[line.length - 1].text.trimEnd(); lines.push(line) }
  return lines
}

// ── PDF merge ───────────────────────────────────────────────────────────

export async function mergePdfs(files: File[], onProgress?: (i: number, n: number) => void): Promise<{ file: File; pages: number }> {
  const { PDFDocument } = await import("pdf-lib")
  const out = await PDFDocument.create()
  let pages = 0
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i + 1, files.length)
    let src
    try { src = await PDFDocument.load(await files[i].arrayBuffer()) } catch {
      throw new Error(`${files[i].name} could not be read. It may be password-protected or damaged.`)
    }
    const copied = await out.copyPages(src, src.getPageIndices())
    copied.forEach((p) => out.addPage(p)); pages += copied.length
  }
  const bytes = await out.save({ useObjectStreams: true })
  return { file: new File([bytes as BlobPart], "merged.pdf", { type: "application/pdf" }), pages }
}

// ── Word to PDF ─────────────────────────────────────────────────────────

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; runs: Run[] }
  | { kind: "paragraph"; runs: Run[] }
  | { kind: "item"; runs: Run[]; marker: string; depth: number }
  | { kind: "table"; rows: Run[][][] }
  | { kind: "image"; bytes: Uint8Array; mime: "image/png" | "image/jpeg" }
  | { kind: "rule" }

/** Turns the HTML mammoth produces into blocks. Needs a DOM, so it runs in the browser. */
export function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
  const blocks: Block[] = []
  const runsOf = (node: Node, st: { bold?: boolean; italic?: boolean } = {}): Run[] => {
    const out: Run[] = []
    node.childNodes.forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) { const t = (c.textContent ?? "").replace(/\s+/g, " "); if (t) out.push({ text: t, ...st }) }
      else if (c instanceof HTMLElement) {
        const tag = c.tagName.toLowerCase()
        if (tag === "br") out.push({ text: "\n", ...st })
        else out.push(...runsOf(c, { bold: st.bold || tag === "strong" || tag === "b", italic: st.italic || tag === "em" || tag === "i" }))
      }
    })
    return out
  }
  const walk = (el: Element, depth: number, ordered: boolean, counter: { n: number }) => {
    el.childNodes.forEach((n) => {
      if (!(n instanceof HTMLElement)) return
      const tag = n.tagName.toLowerCase()
      if (/^h[1-6]$/.test(tag)) { const lv = Math.min(3, Number(tag[1])) as 1 | 2 | 3; blocks.push({ kind: "heading", level: lv, runs: runsOf(n, { bold: true }) }) }
      else if (tag === "p") {
        const img = n.querySelector("img")
        if (img) pushImage(img)
        const runs = runsOf(n)
        if (runs.some((r) => r.text.trim())) blocks.push({ kind: "paragraph", runs })
      }
      else if (tag === "ul" || tag === "ol") walk(n, depth + 1, tag === "ol", { n: 0 })
      else if (tag === "li") {
        counter.n++
        const own = document.createElement("div"); n.childNodes.forEach((c) => { if (!(c instanceof HTMLElement && /^(ul|ol)$/i.test(c.tagName))) own.appendChild(c.cloneNode(true)) })
        blocks.push({ kind: "item", runs: runsOf(own), marker: ordered ? `${counter.n}.` : "•", depth: Math.max(0, depth - 1) })
        n.childNodes.forEach((c) => { if (c instanceof HTMLElement && /^(ul|ol)$/i.test(c.tagName)) walk(n, depth, false, { n: 0 }) })
      }
      else if (tag === "table") {
        const rows: Run[][][] = []
        n.querySelectorAll("tr").forEach((tr) => rows.push(Array.from(tr.children).map((td) => runsOf(td))))
        if (rows.length) blocks.push({ kind: "table", rows })
      }
      else if (tag === "img") pushImage(n as HTMLImageElement)
      else if (tag === "hr") blocks.push({ kind: "rule" })
      else walk(n, depth, ordered, counter)
    })
  }
  const pushImage = (img: Element) => {
    const m = (img.getAttribute("src") || "").match(/^data:(image\/(?:png|jpeg));base64,(.+)$/)
    if (!m) return
    const bin = atob(m[2]); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    blocks.push({ kind: "image", bytes, mime: m[1] as "image/png" | "image/jpeg" })
  }
  walk(doc.body, 0, false, { n: 0 })
  return blocks
}

const PAGE = { w: 595.28, h: 841.89, margin: 60 }
const SIZE = { body: 11, h1: 22, h2: 17, h3: 14 }

export async function blocksToPdf(blocks: Block[]): Promise<{ bytes: Uint8Array; pages: number }> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib")
  const doc = await PDFDocument.create()
  const fonts = {
    r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold),
    i: await doc.embedFont(StandardFonts.HelveticaOblique), bi: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  }
  const fontOf = (r: Run) => (r.bold && r.italic ? fonts.bi : r.bold ? fonts.b : r.italic ? fonts.i : fonts.r)
  let page = doc.addPage([PAGE.w, PAGE.h]); let y = PAGE.h - PAGE.margin
  const room = (need: number) => { if (y - need < PAGE.margin) { page = doc.addPage([PAGE.w, PAGE.h]); y = PAGE.h - PAGE.margin } }
  const clean = (runs: Run[]): Run[] => runs.map((r) => ({ ...r, text: sanitizeWinAnsi(r.text) }))

  const drawLines = (lines: Run[][], x: number, size: number, lead: number) => {
    for (const line of lines) {
      room(lead)
      let cx = x
      for (const r of line) { const f = fontOf(r); page.drawText(r.text, { x: cx, y: y - size, size, font: f, color: rgb(0.1, 0.1, 0.1) }); cx += f.widthOfTextAtSize(r.text, size) }
      y -= lead
    }
  }
  const wrap = (runs: Run[], width: number, size: number) => wrapRuns(clean(runs), width, (t, r) => fontOf(r).widthOfTextAtSize(t, size))

  for (const b of blocks) {
    if (b.kind === "heading") {
      const size = b.level === 1 ? SIZE.h1 : b.level === 2 ? SIZE.h2 : SIZE.h3
      y -= size * 0.5; drawLines(wrap(b.runs.map((r) => ({ ...r, bold: true })), PAGE.w - 2 * PAGE.margin, size), PAGE.margin, size, size * 1.3); y -= 4
    } else if (b.kind === "paragraph") {
      drawLines(wrap(b.runs, PAGE.w - 2 * PAGE.margin, SIZE.body), PAGE.margin, SIZE.body, SIZE.body * 1.4); y -= 6
    } else if (b.kind === "item") {
      const indent = 14 + b.depth * 16, x = PAGE.margin + indent
      const lines = wrap(b.runs, PAGE.w - PAGE.margin - x, SIZE.body)
      room(SIZE.body * 1.4); page.drawText(sanitizeWinAnsi(b.marker), { x: x - 12, y: y - SIZE.body, size: SIZE.body, font: fonts.r })
      drawLines(lines, x, SIZE.body, SIZE.body * 1.4); y -= 2
    } else if (b.kind === "rule") {
      room(10); page.drawLine({ start: { x: PAGE.margin, y: y - 4 }, end: { x: PAGE.w - PAGE.margin, y: y - 4 }, thickness: 0.7, color: rgb(0.6, 0.6, 0.6) }); y -= 12
    } else if (b.kind === "image") {
      try {
        const img = b.mime === "image/png" ? await doc.embedPng(b.bytes) : await doc.embedJpg(b.bytes)
        const maxW = PAGE.w - 2 * PAGE.margin; const s = Math.min(1, maxW / img.width, (PAGE.h - 2 * PAGE.margin) / img.height)
        const w = img.width * s, h = img.height * s; room(h); page.drawImage(img, { x: PAGE.margin, y: y - h, width: w, height: h }); y -= h + 8
      } catch { /* an image the format cannot embed is skipped, the text still converts */ }
    } else if (b.kind === "table") {
      const cols = Math.max(...b.rows.map((r) => r.length)); const cw = (PAGE.w - 2 * PAGE.margin) / Math.max(1, cols); const pad = 4, size = 10, lead = 13
      for (const row of b.rows) {
        const cells = row.map((c) => wrap(c, cw - 2 * pad, size)); const h = Math.max(1, ...cells.map((c) => c.length)) * lead + 2 * pad
        room(h)
        cells.forEach((lines, ci) => {
          const x = PAGE.margin + ci * cw
          page.drawRectangle({ x, y: y - h, width: cw, height: h, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.6 })
          let ty = y - pad
          for (const line of lines) { let cx = x + pad; for (const r of line) { const f = fontOf(r); page.drawText(r.text, { x: cx, y: ty - size, size, font: f }); cx += f.widthOfTextAtSize(r.text, size) } ty -= lead }
        })
        y -= h
      }
      y -= 8
    }
  }
  return { bytes: await doc.save({ useObjectStreams: true }), pages: doc.getPageCount() }
}

export async function wordToPdf(file: File): Promise<{ file: File; pages: number; images: number }> {
  if (!/\.docx$/i.test(file.name)) throw new Error("Please choose a .docx file. Older .doc files: open them in Word and save as .docx first.")
  const mammoth = await import("mammoth")
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }).catch(() => { throw new Error(`${file.name} could not be read. It may be damaged or password-protected.`) })
  const blocks = htmlToBlocks(html)
  if (!blocks.length) throw new Error("The document has no text to convert.")
  const { bytes, pages } = await blocksToPdf(blocks)
  return { file: new File([bytes as BlobPart], file.name.replace(/\.docx$/i, "") + ".pdf", { type: "application/pdf" }), pages, images: blocks.filter((b) => b.kind === "image").length }
}

// ── PDF to Word ─────────────────────────────────────────────────────────

export interface TextItem { str: string; x: number; y: number; h: number; w: number }
export interface TextLine { text: string; y: number; h: number; x: number }

/** Group positioned text fragments into lines (same baseline within a tolerance), left to right, top to bottom. */
export function groupLines(items: TextItem[]): TextLine[] {
  const sorted = items.filter((i) => i.str.trim() !== "" || i.str === " ").sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; h: number; parts: TextItem[] }[] = []
  for (const it of sorted) {
    const tol = Math.max(2, it.h * 0.45)
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tol)
    if (line) { line.parts.push(it); line.h = Math.max(line.h, it.h) } else lines.push({ y: it.y, h: it.h, parts: [it] })
  }
  return lines.sort((a, b) => b.y - a.y).map((l) => {
    const parts = l.parts.sort((a, b) => a.x - b.x)
    let text = ""; let prevEnd = -Infinity
    for (const p of parts) {
      const gap = p.x - prevEnd
      if (text && gap > p.h * 0.18 && !text.endsWith(" ") && !p.str.startsWith(" ")) text += " "
      text += p.str; prevEnd = p.x + p.w
    }
    return { text: text.replace(/\s+/g, " ").trim(), y: l.y, h: l.h, x: parts[0].x }
  }).filter((l) => l.text)
}

export interface Para { kind: "heading" | "paragraph" | "bullet"; text: string; level?: 1 | 2 | 3 }

const BULLET = /^([•●▪\-–\*])\s+/
const NUMBERED = /^(\d{1,2}[.)])\s+/

/** Lines to paragraphs: a bigger font is a heading, a gap bigger than a line break starts a new paragraph, a marker is a list item. */
export function linesToParas(lines: TextLine[]): Para[] {
  if (!lines.length) return []
  const hs = lines.map((l) => l.h).sort((a, b) => a - b); const body = hs[Math.floor(hs.length / 2)] || 10
  const out: Para[] = []
  let prev: TextLine | null = null
  for (const l of lines) {
    const ratio = l.h / body
    const bullet = BULLET.test(l.text) || NUMBERED.test(l.text)
    const gap = prev ? prev.y - l.y : 0
    if (ratio >= 1.25 && l.text.length < 140) {
      out.push({ kind: "heading", text: l.text, level: ratio >= 1.8 ? 1 : ratio >= 1.45 ? 2 : 3 })
    } else if (bullet) {
      out.push({ kind: "bullet", text: l.text.replace(BULLET, "").replace(NUMBERED, "") })
    } else {
      const last = out[out.length - 1]
      const continues = last && last.kind === "paragraph" && prev && gap <= Math.max(prev.h, l.h) * 1.7 && Math.abs(l.h - prev.h) / body < 0.2
      if (continues) last.text += (last.text.endsWith("-") ? "" : " ") + l.text
      else out.push({ kind: "paragraph", text: l.text })
    }
    prev = l
  }
  return out
}

export async function pdfToWord(file: File, onProgress?: (page: number, pages: number) => void): Promise<{ file: File; pages: number; paragraphs: number }> {
  const [pdfjs, docx] = await Promise.all([import("pdfjs-dist"), import("docx")])
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const src = await task.promise.catch(() => { throw new Error(`${file.name} could not be read. It may be password-protected or damaged.`) })
  const children: any[] = []
  let paragraphs = 0, withText = 0
  try {
    for (let p = 1; p <= src.numPages; p++) {
      onProgress?.(p, src.numPages)
      const page = await src.getPage(p)
      const tc = await page.getTextContent()
      const items: TextItem[] = (tc.items as any[]).filter((i) => typeof i.str === "string").map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], h: Math.abs(i.transform[3]) || i.height || 10, w: i.width || 0 }))
      const paras = linesToParas(groupLines(items))
      if (paras.length) withText++
      for (const para of paras) {
        paragraphs++
        if (para.kind === "heading") children.push(new docx.Paragraph({ heading: [docx.HeadingLevel.HEADING_1, docx.HeadingLevel.HEADING_1, docx.HeadingLevel.HEADING_2, docx.HeadingLevel.HEADING_3][para.level!], children: [new docx.TextRun(para.text)] }))
        else if (para.kind === "bullet") children.push(new docx.Paragraph({ bullet: { level: 0 }, children: [new docx.TextRun(para.text)] }))
        else children.push(new docx.Paragraph({ spacing: { after: 120 }, children: [new docx.TextRun(para.text)] }))
      }
      if (p < src.numPages && paras.length) children.push(new docx.Paragraph({ children: [new docx.PageBreak()] }))
      page.cleanup()
    }
  } finally { await task.destroy() }
  if (!withText) throw new Error("This PDF has no text to recover. It looks like a scan or a deck made of images; text recognition (OCR) is needed, which this tool does not do.")
  const blob = await docx.Packer.toBlob(new docx.Document({ sections: [{ children }] }))
  return { file: new File([blob], file.name.replace(/\.pdf$/i, "") + ".docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), pages: src.numPages, paragraphs }
}
