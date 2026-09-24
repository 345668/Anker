import { describe, it, expect, vi } from "vitest"
// The Marker sidecar is a separate service; these tests are about the text layer.
vi.mock("./pdf-marker", () => ({ isMarkerAvailable: vi.fn(async () => false), markerExtractMarkdown: vi.fn() }))

import { PDFDocument, StandardFonts } from "pdf-lib"
import { extractPdfText } from "./pdf"

async function pdfWith(pages: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const text of pages) {
    const page = doc.addPage([600, 400])
    if (text) page.drawText(text, { x: 40, y: 300, size: 14, font })
  }
  return Buffer.from(await doc.save())
}

describe("extractPdfText", () => {
  it("reads the text layer, which pdf-lib alone never could", async () => {
    const r = await extractPdfText(await pdfWith(["RAISING $2MM. SAFE, $8MM POST-MONEY VAL CAP."]))
    expect(r.text).toContain("RAISING $2MM")
    expect(r.wordsPerPage).toEqual([7])
    expect(r.imageOnlyPages).toBe(0)
    expect(r.source).toBe("pdfjs")
  })

  it("counts a page with no text as image-only, and only that page", async () => {
    const r = await extractPdfText(await pdfWith(["Page one has enough words to count as text", ""]))
    expect(r.pageCount).toBe(2)
    expect(r.imageOnlyPages).toBe(1)
  })

  it("leaves the caller's buffer intact", async () => {
    const buf = await pdfWith(["Some words on a page here"])
    const before = buf.length
    await extractPdfText(buf)
    expect(buf.length).toBe(before)
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("degrades to the old empty result for bytes that are not a PDF, instead of throwing", async () => {
    const r = await extractPdfText(Buffer.from("not a pdf"))
    expect(r.text).toBe("")
    expect(r.imageOnlyPages).toBe(r.pageCount)
  })
})
