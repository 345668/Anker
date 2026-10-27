import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib"

/**
 * A finished call as a PDF, from the same Markdown the other exports use (docs/architecture/62 section 9). Plain by design: A4, Helvetica, headings, bullets, quotes, wrapped
 * paragraphs, page numbers. The standard PDF fonts hold Western European text; any other character is replaced with "?" rather than failing the export (use the Word or
 * Markdown export for other scripts).
 */
const W = 595.28, H = 841.89, M = 56, BODY = 10.5, LEAD = 15
const win = (s: string) => s.replace(/\*\*/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x09\x0a\x20-\x7e\xa0-\xff€]/g, "?")

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of text.split("\n")) {
    let line = ""
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word
      while (font.widthOfTextAtSize(w, size) > width) {          // a word wider than the line (a long URL) is cut
        let n = w.length; while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > width) n--
        if (line) { out.push(line); line = "" }
        out.push(w.slice(0, n)); w = w.slice(n)
      }
      const t = line ? line + " " + w : w
      if (font.widthOfTextAtSize(t, size) <= width) line = t; else { out.push(line); line = w }
    }
    out.push(line)
  }
  return out
}

export async function markdownToPdf(markdown: string, title = "Halyard call"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(), reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  pdf.setTitle(win(title)); pdf.setCreator("Anker"); pdf.setProducer("Anker")
  let page = pdf.addPage([W, H]), y = H - M
  const room = (need: number) => { if (y - need < M) { page = pdf.addPage([W, H]); y = H - M } }
  const put = (text: string, o: { font?: PDFFont; size?: number; indent?: number; gap?: number; color?: [number, number, number]; bar?: boolean } = {}) => {
    const font = o.font ?? reg, size = o.size ?? BODY, indent = o.indent ?? 0, lead = size === BODY ? LEAD : size * 1.35
    for (const l of wrap(win(text), font, size, W - 2 * M - indent)) { room(lead); if (o.bar) page.drawRectangle({ x: M + indent - 8, y: y - 3, width: 2, height: lead, color: rgb(0.7, 0.7, 0.7) }); page.drawText(l, { x: M + indent, y: y - size, size, font, color: rgb(...(o.color ?? [0.1, 0.1, 0.1])) }); y -= lead }
    y -= o.gap ?? 0
  }
  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd()
    if (!line.trim()) { y -= 4; continue }
    if (line.startsWith("# ")) put(line.slice(2), { font: bold, size: 20, gap: 4 })
    else if (line.startsWith("## ")) { y -= 8; room(40); put(line.slice(3), { font: bold, size: 13, gap: 2 }) }
    else if (/^[-*] /.test(line)) { room(LEAD); page.drawText("-", { x: M + 4, y: y - BODY, size: BODY, font: reg }); put(line.slice(2), { indent: 16 }) }
    else if (line.startsWith("> ")) put(line.slice(2), { indent: 14, color: [0.3, 0.3, 0.3], bar: true })
    else put(line)
  }
  const pages = pdf.getPages()
  pages.forEach((p, i) => p.drawText(`${i + 1} / ${pages.length}`, { x: W - M - 30, y: M / 2, size: 8, font: reg, color: rgb(0.5, 0.5, 0.5) }))
  return pdf.save()
}
