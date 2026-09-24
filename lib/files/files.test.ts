import { describe, it, expect, vi } from "vitest"
import * as XLSX from "xlsx"
import { zipFiles, unzipEntries, crc32 } from "./zip"
import { pptxText, docxText } from "./office-text"
import { safeFetch, isPrivateAddress, UnsafeUrlError } from "../net/safe-fetch"

describe("zip", () => {
  it("round-trips stored files", () => {
    const files = [{ name: "a.txt", data: Buffer.from("hello") }, { name: "dir/ü.txt", data: Buffer.from("world") }]
    const back = unzipEntries(zipFiles(files))
    expect(back.get("a.txt")!.toString()).toBe("hello")
    expect(back.get("dir/ü.txt")!.toString()).toBe("world")
  })

  it("reads deflated entries written by another ZIP writer", () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"]]), "S")
    const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }))
    expect(unzipEntries(buf).get("xl/workbook.xml")!.toString()).toContain("<workbook")
  })

  it("computes the standard CRC-32", () => expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926))

  it("refuses something that is not a ZIP", () => expect(() => unzipEntries(Buffer.from("nope"))).toThrow(/not a ZIP/))
})

describe("office text", () => {
  const slide = (t: string[]) => `<p:sld><p:cSld>${t.map((x) => `<a:p><a:r><a:t>${x}</a:t></a:r></a:p>`).join("")}</p:cSld></p:sld>`
  it("reads slides in slide order, with notes", () => {
    const pptx = zipFiles([
      { name: "ppt/slides/slide10.xml", data: Buffer.from(slide(["Ask"])) },
      { name: "ppt/slides/slide2.xml", data: Buffer.from(slide(["Northwind Sports", "RAISING $2MM &amp; SAFE"])) },
      { name: "ppt/notesSlides/notesSlide2.xml", data: Buffer.from(slide(["Pre-seed, post-money cap"])) },
    ])
    const r = pptxText(pptx)
    expect(r.slides).toBe(2)
    expect(r.text.indexOf("Slide 2")).toBeLessThan(r.text.indexOf("Slide 10"))
    expect(r.text).toContain("RAISING $2MM & SAFE")
    expect(r.text).toContain("[notes] Pre-seed, post-money cap")
  })

  it("reads Word paragraphs", () => {
    const docx = zipFiles([{ name: "word/document.xml", data: Buffer.from(`<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p></w:body></w:document>`) }])
    expect(docxText(docx).text).toBe("Hello world")
  })
})

describe("safeFetch", () => {
  const ok = (body = "%PDF-1.4", headers: Record<string, string> = { "content-type": "application/pdf" }) =>
    new Response(body, { status: 200, headers })

  it.each([
    ["127.0.0.1", true], ["10.1.2.3", true], ["172.16.0.1", true], ["192.168.1.1", true], ["169.254.169.254", true],
    ["100.64.0.1", true], ["::1", true], ["fd00::1", true], ["fe80::1", true], ["::ffff:10.0.0.1", true],
    ["8.8.8.8", false], ["2606:4700:4700::1111", false],
  ])("%s private=%s", (ip, expected) => expect(isPrivateAddress(ip)).toBe(expected))

  it("refuses http, credentials, odd ports and internal names", async () => {
    for (const url of ["http://example.com/deck.pdf", "https://u:p@example.com/x", "https://example.com:8443/x", "https://localhost/x", "https://metadata.internal/x"]) {
      await expect(safeFetch(url, { lookup: async () => ["93.184.216.34"] })).rejects.toBeInstanceOf(UnsafeUrlError)
    }
  })

  it("refuses a public name that resolves to a private address", async () => {
    await expect(safeFetch("https://evil.example/deck.pdf", { lookup: async () => ["10.0.0.5"] })).rejects.toThrow(/not reachable/)
  })

  it("re-checks every redirect", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://inner.example/x" } }))
    const lookup = async (h: string) => (h === "inner.example" ? ["169.254.169.254"] : ["93.184.216.34"])
    await expect(safeFetch("https://outer.example/deck", { lookup, fetchImpl: fetchImpl as any })).rejects.toThrow(/not reachable/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("caps the size", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok("x".repeat(100)))
    await expect(safeFetch("https://ok.example/deck.pdf", { lookup: async () => ["93.184.216.34"], fetchImpl: fetchImpl as any, maxBytes: 10 })).rejects.toThrow(/too large/)
  })

  it("returns the body and type of a public file", async () => {
    const r = await safeFetch("https://ok.example/deck.pdf", { lookup: async () => ["93.184.216.34"], fetchImpl: vi.fn().mockResolvedValue(ok()) as any })
    expect(r.contentType).toBe("application/pdf")
    expect(r.body.toString()).toBe("%PDF-1.4")
  })
})
