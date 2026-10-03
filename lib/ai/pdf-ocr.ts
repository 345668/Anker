/**
 * PDF OCR fallback.
 *
 * When pdf-parse returns sparse text (typical for visually-rendered
 * pitch decks where every slide is a single rasterised image), we
 * render each page to a PNG via pdfjs-dist + @napi-rs/canvas, then
 * OCR each page through Qwen-VL-OCR (Alibaba DashScope's specialised
 * OCR model, OpenAI-compatible chat completions endpoint).
 *
 * Both dependencies ship prebuilt binaries / pure ESM that work on
 * Vercel Lambda's Node runtime.  No system poppler required.
 *
 * Used by lib/ai/pdf-vision.ts to convert image-only PDFs into text
 * BEFORE they reach the extractor / analyzer prompts.
 */

import { standardQwen } from "./qwen-standard"
import { loadPdfjs } from "./pdfjs"
import { isFreeAllowanceExhausted, isQwenExhausted, markQwenExhausted } from "./qwen-lanes"

export interface OcrPageResult {
  page: number
  text: string
  ms: number
  ok: boolean
  error?: string
}

export interface OcrPdfResult {
  pages: OcrPageResult[]
  text: string                // joined "── Page N ──\n<text>" sections
  pageCount: number
  pagesAttempted: number
  pagesSucceeded: number
  totalChars: number
  truncated: boolean          // true when we stopped at maxPages or at the deadline
  /** True when the deadline, not the page cap, ended the read. */
  timedOut?: boolean
  /** Why nothing was read, when that is the outcome (never provider text or keys). */
  failure?: "no_key" | "render_failed" | "all_pages_failed"
}

export interface OcrOpts {
  /** Cap on pages we OCR (each one costs a Qwen-VL call). Default 15. */
  maxPages?: number
  /** Render scale.  1.5–2.0 is the sweet spot for OCR vs payload size. */
  scale?: number
  /** Override the OCR model.  Default qwen-vl-ocr (specialised). */
  model?: string
  /** Tag for log lines. */
  tag?: string
  /** Epoch ms after which no new page is started and a running page is cut short. Pages read so far are returned. */
  deadlineAt?: number
}

/** Render every page of a PDF buffer to a PNG buffer.  Caps at maxPages. */
async function renderPdfPagesToPng(buf: Buffer, maxPages: number, scale: number): Promise<Buffer[]> {
  // Defer both to runtime — @napi-rs/canvas loads a native .node binary
  // that the Turbopack bundler trips over at module-eval time, and
  // pdfjs-dist is an ESM-only legacy build we resolve at runtime too.
  const { getDocument } = await loadPdfjs()
  const { createCanvas } = await import("@napi-rs/canvas")
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  const pdf = await getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
  } as any).promise
  const out: Buffer[] = []
  const limit = Math.min(pdf.numPages, maxPages)
  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext("2d")
    await page.render({ canvasContext: ctx as any, viewport } as any).promise
    out.push(canvas.toBuffer("image/png"))
  }
  return out
}

/** OCR a single page PNG via Qwen-VL-OCR. */
async function ocrPagePng(png: Buffer, apiKey: string, baseUrl: string, model: string, deadlineAt?: number): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const url = baseUrl + "/chat/completions"
  const body = {
    model,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } },
          {
            type: "text",
            text:
              "Extract ALL visible text from this image, preserving the slide's reading order " +
              "(left-to-right, top-to-bottom; columns left then right). Include numbers, dates, " +
              "URLs, footer text, and chart labels. Output ONLY the extracted text — no commentary, " +
              "no markdown fences, no introduction. If the image contains no text, output an empty string.",
          },
        ],
      },
    ],
  }
  // One slow or rate-limited page used to fail the page outright. Retry the transient cases.
  let res: Response | undefined
  let txt = ""
  for (let attempt = 0; attempt < 3; attempt++) {
    // Never wait past the request's deadline: the page times out with what time is left, and a retry is skipped.
    const left = deadlineAt ? deadlineAt - Date.now() : Infinity
    if (left < 4_000) return { ok: false, error: "deadline reached" }
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(60_000, left)),
      })
      txt = await res.text()
    } catch (e: any) {
      res = undefined
      txt = e?.name === "TimeoutError" ? "timed out" : String(e?.message ?? e)
      if (attempt < 2 && (!deadlineAt || deadlineAt - Date.now() > 12_000)) { await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt)); continue }
      return { ok: false, error: `request failed: ${txt}` }
    }
    const transient = res.status === 429 || res.status >= 500
    // A spent free allowance is not transient: retrying the same model cannot help.
    if (!res.ok && transient && !isFreeAllowanceExhausted(res.status, txt) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt)); continue
    }
    break
  }
  if (!res) return { ok: false, error: "no response" }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 240)}` }
  let json: any
  try { json = JSON.parse(txt) } catch { return { ok: false, error: `non-json: ${txt.slice(0, 240)}` } }
  const out = json?.choices?.[0]?.message?.content
  if (typeof out !== "string") return { ok: false, error: "no content in response" }
  return { ok: true, text: out.trim() }
}

/** Public entry: OCR a PDF's pages via Qwen-VL-OCR. */
export async function ocrPdfBuffer(buf: Buffer, opts: OcrOpts = {}): Promise<OcrPdfResult> {
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? 15, 40))
  const scale = opts.scale ?? 1.7
  // qwen-vl-ocr first; when its free allowance is spent, a general vision model reads the page.
  const models = opts.model ? [opts.model] : ["qwen-vl-ocr", "qwen3-vl-plus"]
  const tag = opts.tag ?? "pdf-ocr"

  const std = await standardQwen()
  const apiKey = std?.apiKey ?? null
  if (!apiKey) {
    return {
      pages: [], text: "", pageCount: 0, pagesAttempted: 0,
      pagesSucceeded: 0, totalChars: 0, truncated: false, failure: "no_key",
    }
  }
  const baseUrl = std!.baseUrl

  let pngs: Buffer[]
  try {
    pngs = await renderPdfPagesToPng(buf, maxPages, scale)
  } catch (e: any) {
    console.error(`[${tag}] render failed: ${e?.message ?? e}`)
    return {
      pages: [], text: "", pageCount: 0, pagesAttempted: 0,
      pagesSucceeded: 0, totalChars: 0, truncated: false, failure: "render_failed",
    }
  }
  const total = pngs.length
  const pages: OcrPageResult[] = []
  let timedOut = false
  // Sequential — Qwen-VL-OCR free tier has rate caps; parallelism would 429.
  for (let i = 0; i < pngs.length; i++) {
    if (opts.deadlineAt && Date.now() > opts.deadlineAt - 4_000) { timedOut = true; break }
    const start = Date.now()
    let r: Awaited<ReturnType<typeof ocrPagePng>> = { ok: false, error: "no model available" }
    for (const model of models) {
      if (isQwenExhausted("free", `ocr:${model}`)) continue
      r = await ocrPagePng(pngs[i], apiKey, baseUrl, model, opts.deadlineAt)
      if (r.ok) break
      if (!r.ok && isFreeAllowanceExhausted(undefined, r.error)) { markQwenExhausted("free", `ocr:${model}`); continue }
      break
    }
    const ms = Date.now() - start
    if (r.ok) {
      pages.push({ page: i + 1, text: r.text, ms, ok: true })
    } else {
      pages.push({ page: i + 1, text: "", ms, ok: false, error: r.error })
      console.error(`[${tag}] page ${i + 1}: ${r.error}`)
    }
  }
  const joined = pages
    .filter((p) => p.ok && p.text)
    .map((p) => `── Page ${p.page} ──\n${p.text}`)
    .join("\n\n")
  return {
    pages,
    text: joined,
    pageCount: total,
    pagesAttempted: pages.length,
    pagesSucceeded: pages.filter((p) => p.ok && p.text).length,
    totalChars: joined.length,
    truncated: total >= maxPages || timedOut,
    timedOut: timedOut || undefined,
    failure: pages.some((p) => p.ok && p.text) ? undefined : "all_pages_failed",
  }
}
