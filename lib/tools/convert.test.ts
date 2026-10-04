import { describe, it, expect, vi, beforeEach } from "vitest"
const h = vi.hoisted(() => ({ principal: vi.fn(), read: vi.fn(), convert: vi.fn(), configured: vi.fn(), del: vi.fn() }))
vi.mock("@/lib/assistant/principal", () => ({ requireAiPrincipal: h.principal }))
vi.mock("@/lib/campaign/util", () => ({ readBlobBytes: h.read }))
vi.mock("@/lib/docworker/client", () => ({ convertViaDocWorker: h.convert, isDocWorkerConfigured: h.configured }))
vi.mock("@vercel/blob", () => ({ del: h.del }))
import { GET, POST } from "@/app/api/tools/convert/route"
import { NextRequest } from "next/server"
import { planConvert, isConvertBlobUrl, convertPrefix } from "./convert-files"

const scope = "ws_1"
const goodUrl = `https://abc.private.blob.vercel-storage.com/${convertPrefix(scope)}x7/report.docx`
const post = (body: unknown) => POST(new NextRequest("https://x.test/api/tools/convert", { method: "POST", body: JSON.stringify(body) }))
beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset()
  h.principal.mockResolvedValue({ scopeKey: scope }); h.configured.mockReturnValue(true); h.read.mockResolvedValue(Buffer.from("docx bytes")); h.del.mockResolvedValue(undefined)
  h.convert.mockResolvedValue({ ok: true, response: new Response("PDFBYTES", { headers: { "content-type": "application/pdf" } }) })
})

describe("planning and validation", () => {
  it("each direction takes only its own kind of file", () => {
    expect(planConvert("word-to-pdf", "a.DOCX")).toEqual({ format: "pdf", ext: "docx" })
    expect(planConvert("pdf-to-word", "a.pdf")).toEqual({ format: "docx", ext: "pdf" })
    expect("error" in planConvert("word-to-pdf", "a.pdf")).toBe(true)
    expect("error" in planConvert("pdf-to-word", "a.docx")).toBe(true)
    expect("error" in planConvert("mystery", "a.docx")).toBe(true)
    expect(planConvert("excel-to-pdf", "Budget.XLSX")).toEqual({ format: "pdf", ext: "xlsx" })
    expect(planConvert("excel-to-pdf", "data.csv")).toEqual({ format: "pdf", ext: "csv" })
    expect(planConvert("powerpoint-to-pdf", "deck.pptx")).toEqual({ format: "pdf", ext: "pptx" })
    expect("error" in planConvert("excel-to-pdf", "deck.pptx")).toBe(true)
    expect("error" in planConvert("powerpoint-to-pdf", "a.xlsx")).toBe(true)
    expect("error" in planConvert("toString", "a.docx")).toBe(true)
  })
  it("only the caller's own upload folder in our store is accepted", () => {
    expect(isConvertBlobUrl(goodUrl, scope)).toBe(true)
    expect(isConvertBlobUrl(goodUrl, "ws_2")).toBe(false)
    expect(isConvertBlobUrl("https://evil.example.com/" + convertPrefix(scope) + "a.docx", scope)).toBe(false)
    expect(isConvertBlobUrl(goodUrl.replace("tools-convert/", "tools-convert/../"), scope)).toBe(false)
    expect(isConvertBlobUrl("http://abc.blob.vercel-storage.com/x", scope)).toBe(false)
  })
})

describe("POST /api/tools/convert", () => {
  it("converts, streams the result with a download name, and deletes the upload", async () => {
    const r = await post({ direction: "word-to-pdf", blobUrl: goodUrl, filename: "Q3 report.docx" })
    expect(r.status).toBe(200); expect(await r.text()).toBe("PDFBYTES")
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="Q3 report.pdf"')
    expect(h.convert).toHaveBeenCalledWith(expect.any(Buffer), "input.docx", "pdf", 110000, undefined); expect(h.del).toHaveBeenCalledWith(goodUrl, expect.anything())
  })
  it("spreadsheets pass the one-page-per-sheet option, and nothing else does", async () => {
    await post({ direction: "excel-to-pdf", blobUrl: goodUrl.replace("report.docx", "b.xlsx"), filename: "b.xlsx", singlePageSheets: true })
    expect(h.convert).toHaveBeenLastCalledWith(expect.any(Buffer), "input.xlsx", "pdf", 110000, { singlePageSheets: true })
    await post({ direction: "powerpoint-to-pdf", blobUrl: goodUrl.replace("report.docx", "s.pptx"), filename: "s.pptx", singlePageSheets: true })
    expect(h.convert).toHaveBeenLastCalledWith(expect.any(Buffer), "input.pptx", "pdf", 110000, undefined)
  })
  it("needs a session, a configured worker, a valid direction and the caller's own upload", async () => {
    h.principal.mockRejectedValueOnce(new Error("no")); expect((await post({})).status).toBe(401)
    h.configured.mockReturnValueOnce(false); expect((await post({ direction: "word-to-pdf", blobUrl: goodUrl, filename: "a.docx" })).status).toBe(501)
    expect((await post({ direction: "word-to-pdf", blobUrl: goodUrl, filename: "a.pdf" })).status).toBe(400)
    expect((await post({ direction: "word-to-pdf", blobUrl: goodUrl.replace(scope, "other"), filename: "a.docx" })).status).toBe(400)
    expect(h.convert).not.toHaveBeenCalled()
  })
  it("a missing upload and an oversized file are refused; a worker failure is passed on plainly and still cleans up", async () => {
    h.read.mockResolvedValueOnce(null); expect((await post({ direction: "word-to-pdf", blobUrl: goodUrl, filename: "a.docx" })).status).toBe(400)
    h.read.mockResolvedValueOnce(Buffer.alloc(26 * 1024 * 1024)); expect((await post({ direction: "word-to-pdf", blobUrl: goodUrl, filename: "a.docx" })).status).toBe(413)
    h.convert.mockResolvedValueOnce({ ok: false, status: 422, error: "LibreOffice produced no .pdf" })
    const r = await post({ direction: "word-to-pdf", blobUrl: goodUrl, filename: "a.docx" })
    expect(r.status).toBe(422); expect((await r.json()).error).toMatch(/LibreOffice/)
    expect(h.del).toHaveBeenCalledTimes(2)
  })
  it("GET says whether the converter is available", async () => {
    expect(await (await GET()).json()).toEqual({ available: true, prefix: convertPrefix(scope) })
    h.configured.mockReturnValue(false); expect((await (await GET()).json()).available).toBe(false)
  })
})
