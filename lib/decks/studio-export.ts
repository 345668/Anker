import { readFileSync } from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Header, Footer, ImageRun, PageNumber, AlignmentType } from "docx"
import { buildDeckPdf, buildDeckPptx } from "./pitch-deck-builder"
import type { StudioSlide } from "./studio-model"
import { WorkspaceError } from "@/lib/auth/workspace-context"

export async function exportStudioDeck(title: string, slides: StudioSlide[], format: string) {
  let bytes: Buffer, type: string
  const spec = { title, author: "Anker", theme: { accent: "163C56", background: "FFFFFF", text: "142B40", muted: "52667A" }, slides }
  if (format === "pptx") {
    bytes = await buildDeckPptx(spec)
    type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  } else if (format === "pdf") {
    try { bytes = await buildDeckPdf(spec) }
    catch { throw new WorkspaceError("The PDF could not fit or render this slide text. Shorten the slide or download PowerPoint or Word, which support a wider range of characters.", 422) }
    type = "application/pdf"
  } else if (format === "docx") {
    const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })]
    for (const [i, s] of slides.entries()) {
      children.push(new Paragraph({ text: `${i + 1}. ${s.title}`, heading: HeadingLevel.HEADING_1 }))
      if (s.subtitle) children.push(new Paragraph({ text: s.subtitle }))
      for (const b of s.bullets) children.push(new Paragraph({ text: b, bullet: { level: 0 } }))
      if (s.notes) children.push(new Paragraph({ children: [new TextRun({ text: `Speaker notes: ${s.notes}`, italics: true })] }))
    }
    bytes = await Packer.toBuffer(new Document({ creator: "Anker", title, styles: { default: { document: { run: { font: "Calibri", size: 24, color: "142B40" }, paragraph: { spacing: { after: 180 } } } } }, sections: [{ headers: { default: new Header({ children: [new Paragraph({ children: [new ImageRun({ type: "png", data: readFileSync(path.join(process.cwd(), "lib/branding/anker-silver.png")), transformation: { width: 88, height: 38.4 } })] })] }) }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun("Anker / "), new TextRun({ children: [PageNumber.CURRENT] })] })] }) }, children }] }))
    type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  } else throw new WorkspaceError("Choose PowerPoint, PDF or Word.", 400)
  const name = title.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) || "Anker_Deck"
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}.${format}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
}
