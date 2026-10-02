import { describe, it, expect, vi, afterEach } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("./qwen-standard", () => ({ standardQwen: vi.fn(async () => ({ apiKey: "k", baseUrl: "https://qwen.test/v1" })) }))
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getViewport: () => ({ width: 10, height: 10 }), render: () => ({ promise: Promise.resolve() }) }) }) }),
}))
vi.mock("@napi-rs/canvas", () => ({ createCanvas: () => ({ getContext: () => ({}), toBuffer: () => Buffer.from("png") }) }))
import { ocrPdfBuffer } from "./pdf-ocr"
import { clearQwenExhausted } from "./qwen-lanes"

afterEach(() => { vi.unstubAllGlobals(); clearQwenExhausted() })
const ok = (t: string) => new Response(JSON.stringify({ choices: [{ message: { content: t } }] }), { status: 200 })

describe("ocrPdfBuffer", () => {
  it("retries a transient 429 and reads the page", async () => {
    let n = 0
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? new Response("Requests rate limit exceeded", { status: 429 }) : ok("slide text"))))
    const r = await ocrPdfBuffer(Buffer.from("x"), { maxPages: 1 })
    expect(r.pagesSucceeded).toBe(1)
    expect(r.text).toContain("slide text")
    expect(n).toBe(2)
  }, 15000)
  it("moves to the next model when the OCR model's free allowance is spent", async () => {
    const models: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
      const m = JSON.parse(init.body).model; models.push(m)
      return m === "qwen-vl-ocr" ? new Response("AllocationQuota.FreeTierOnly: free tier exhausted", { status: 403 }) : ok("fallback text")
    }))
    const r = await ocrPdfBuffer(Buffer.from("x"), { maxPages: 1 })
    expect(models).toEqual(["qwen-vl-ocr", "qwen3-vl-plus"])
    expect(r.text).toContain("fallback text")
    // and it remembers, so the next document skips the spent model
    models.length = 0
    await ocrPdfBuffer(Buffer.from("x"), { maxPages: 1 })
    expect(models).toEqual(["qwen3-vl-plus"])
  })
  it("reports a failure reason when nothing could be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad key", { status: 401 })))
    const r = await ocrPdfBuffer(Buffer.from("x"), { maxPages: 1 })
    expect(r.pagesSucceeded).toBe(0)
    expect(r.failure).toBe("all_pages_failed")
  })
})
