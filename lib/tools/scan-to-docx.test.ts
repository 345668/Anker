import { describe, it, expect } from "vitest"
import { paragraphsOf, scanToDocx } from "./scan-to-docx"

describe("scan to docx", () => {
  it("splits recognised text into paragraphs on blank lines and joins wrapped lines", () => {
    expect(paragraphsOf("Hello\nworld\n\n\nSecond   paragraph\r\n\r\n  \nThird")).toEqual(["Hello world", "Second paragraph", "Third"])
    expect(paragraphsOf("")).toEqual([])
  })
  it("builds a real Word file with a section per page", async () => {
    const buf = await scanToDocx([{ page: 1, text: "Invoice 42\n\nTotal 1,200 EUR" }, { page: 3, text: "Terms apply" }], "scan.pdf")
    expect(buf.subarray(0, 2).toString()).toBe("PK")
    const mammoth = await import("mammoth")
    const { value } = await mammoth.extractRawText({ buffer: buf })
    expect(value).toContain("Invoice 42"); expect(value).toContain("Total 1,200 EUR"); expect(value).toContain("Page 3"); expect(value).toContain("Terms apply")
  })
})
