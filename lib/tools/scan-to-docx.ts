/** Recognised text of a scanned PDF to a Word file: one section per page, paragraphs split on blank lines, a page break between pages. */
import { Document, Packer, Paragraph, TextRun, PageBreak, HeadingLevel } from "docx"

export interface ScanPage { page: number; text: string }

export function paragraphsOf(text: string): string[] {
  return text.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean)
}

export async function scanToDocx(pages: ScanPage[], title: string): Promise<Buffer> {
  const children: Paragraph[] = []
  pages.forEach((pg, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: `Page ${pg.page}`, color: "888888" })] }))
    for (const para of paragraphsOf(pg.text)) children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun(para)] }))
  })
  return Packer.toBuffer(new Document({ title, sections: [{ children }] }))
}
