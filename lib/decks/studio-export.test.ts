import { it, expect } from "vitest"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { PDFDocument } from "pdf-lib"
import * as XLSX from "xlsx"
import { STUDIO_TEMPLATES, slideSchema } from "./studio-model"
import { exportStudioDeck } from "./studio-export"

for (const template of STUDIO_TEMPLATES) {
  it(`exports every ${template.key} slide to PowerPoint, PDF and Word`, async () => {
    const slides = template.slides.map(s => slideSchema.parse(s))
    for (const format of ["pptx", "pdf", "docx"]) {
      const response = await exportStudioDeck(`Sample ${template.name}`, slides, format)
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      const bytes = Buffer.from(await response.arrayBuffer())
      if (format === "pdf") expect((await PDFDocument.load(bytes)).getPageCount()).toBe(slides.length)
      else {
        const zip = XLSX.CFB.read(bytes, { type: "buffer" })
        const entries = zip.FileIndex.filter((e: { name: string; content: Uint8Array }) => format === "pptx" ? /^slide\d+\.xml$/.test(e.name) : e.name === "document.xml")
        expect(entries.length).toBe(format === "pptx" ? slides.length : 1)
        const text = entries.map((e: { content: Uint8Array }) => Buffer.from(e.content).toString()).join("\n")
        for (const slide of slides) expect(text).toContain(slide.title)
      }
      if (process.env.ANKER_WRITE_DECK_SAMPLES === "1") {
        const dir = path.resolve("docs/deck-studio-samples")
        mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, `${template.key}.${format}`), bytes)
      }
    }
  })
}
it("rejects unsupported formats", async () => {
  await expect(exportStudioDeck("Test", STUDIO_TEMPLATES[0].slides, "html")).rejects.toThrow(/Choose/)
})
it("rejects PDF text that would extend beyond the slide", async () => {
  await expect(exportStudioDeck("Test", [{ ...STUDIO_TEMPLATES[0].slides[0], title: "W".repeat(100) }], "pdf")).rejects.toMatchObject({ status: 422 })
})
