import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// An image-only deck: 14 pages, no text layer — a deck with no text layer.
vi.mock("./pdf", () => ({
  extractPdfText: vi.fn(async () => ({ text: "", pageCount: 14, imageOnlyPages: 14 })),
}))
vi.mock("./pdf-ocr", () => {
  const text = "── Page 1 ──\nNorthwind Sports · Pre-seed investment opportunity\n── Page 13 ──\nRAISING $1MM. SAFE, $8MM POST-MONEY VAL CAP."
  return {
    ocrPdfBuffer: vi.fn(async () => ({
      pages: [], text, pageCount: 14, pagesAttempted: 14, pagesSucceeded: 14, totalChars: text.length, truncated: false,
    })),
  }
})
const config = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock("./runtime-config", () => ({ readRouterConfig: vi.fn(async () => config.value) }))

import { analyzePdfDocuments } from "./pdf-vision"
import { ocrPdfBuffer } from "./pdf-ocr"
import { extractPdfText } from "./pdf"

const KEY = "k".repeat(32)
const deck = [{ name: "deck.pdf", contentType: "application/pdf", base64: Buffer.from("%PDF").toString("base64") }]
const qwenReply = { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: "{}" } }] }) }

/** Every request body the providers were sent, by host. */
function bodiesTo(host: string) {
  return vi.mocked(fetch).mock.calls
    .filter(([url]) => String(url).includes(host))
    .map(([, init]) => String((init as RequestInit).body))
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn())
  // Keys come only from the config each test sets, never from the shell.
  for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "DASHSCOPE_API_KEY", "QWEN_API_KEY", "MISTRAL_API_KEY"]) vi.stubEnv(k, "")
  vi.mocked(ocrPdfBuffer).mockClear()
  vi.mocked(extractPdfText).mockClear()
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("analyzePdfDocuments on an image-only PDF", () => {
  it("gives Qwen the OCR text when a native lead fails and the chain falls through", async () => {
    config.value = { providerOverride: "mistral", mistralApiKey: KEY, qwenApiKey: KEY }
    vi.mocked(fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes("mistral.ai/v1/ocr")) return { ok: false, status: 429, text: async () => "Rate limit exceeded" } as Response
      if (u.includes("mistral.ai")) return { ok: false, status: 403, text: async () => "not available in your subscription tier" } as Response
      return qwenReply as Response
    })

    const r = await analyzePdfDocuments(deck, "extract")

    expect(r.provider).toBe("qwen")
    expect(ocrPdfBuffer).toHaveBeenCalledTimes(1)
    const [sent] = bodiesTo("aliyuncs.com")
    expect(sent).toContain("RAISING $1MM")
    // The note meant for native readers must not reach a model that gets no pages.
    expect(sent).not.toContain("read the attached PDF pages")
  })

  it("skips the OCR pass entirely when the native lead succeeds", async () => {
    config.value = { providerOverride: "mistral", mistralApiKey: KEY, qwenApiKey: KEY }
    vi.mocked(fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes("mistral.ai/v1/ocr")) return { ok: true, status: 200, json: async () => ({ pages: [{ markdown: "Northwind Sports" }] }) } as Response
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "{}" } }] }) } as Response
    })

    const r = await analyzePdfDocuments(deck, "extract")

    expect(r.provider).toBe("mistral")
    expect(ocrPdfBuffer).not.toHaveBeenCalled()
  })

  it("prepares the documents once per kind of provider, not once per attempt", async () => {
    config.value = { providerOverride: "mistral", mistralApiKey: KEY, openaiApiKey: KEY, qwenApiKey: KEY }
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, text: async () => "down" } as Response)

    const r = await analyzePdfDocuments(deck, "extract")

    expect(r.provider).toBe("none")
    // mistral and openai (both native) share one preparation; qwen gets the OCR one.
    expect(extractPdfText).toHaveBeenCalledTimes(2)
    expect(ocrPdfBuffer).toHaveBeenCalledTimes(1)
  })

  it("does not OCR for a provider it cannot call", async () => {
    config.value = {}
    const r = await analyzePdfDocuments(deck, "extract", { providerHint: "qwen" })
    expect(r.error).toMatch(/qwen key missing/)
    expect(ocrPdfBuffer).not.toHaveBeenCalled()
  })
})
