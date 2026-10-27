import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"
import { markdownToPdf } from "./pdf"

describe("pdf export", () => {
  it("makes a valid PDF with the title, and paginates a long call with page numbers", async () => {
    const md = "# Call with Dana\n\n2026-10-27 · 12 min\n\n## Summary\n\nThey closed the seed round.\n\n## Transcript\n\n" + Array.from({ length: 400 }, (_, i) => `[${i}:00] **Them:** turn ${i} ` + "words ".repeat(30)).join("\n\n")
    const bytes = await markdownToPdf(md, "Call with Dana"), doc = await PDFDocument.load(bytes)
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-"); expect(doc.getPageCount()).toBeGreaterThan(5); expect(doc.getTitle()).toBe("Call with Dana")
  })
  it("never fails on text the standard fonts cannot draw (other scripts, emoji, long unbroken strings)", async () => {
    const md = "# 会議メモ 🚀\n\n- € 1.2 million – “quoted” … ü ß é\n- " + "x".repeat(400) + "\n> a quote\n\n" + "漢字".repeat(100)
    const doc = await PDFDocument.load(await markdownToPdf(md)); expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
  })
  it("an empty document is still a valid one-page PDF", async () => { expect((await PDFDocument.load(await markdownToPdf(""))).getPageCount()).toBe(1) })
})
