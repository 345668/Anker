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

import { readRouterConfig } from "./runtime-config"

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
  truncated: boolean          // true when we stopped at maxPages
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
}

function qwenKey(): string | null {
  const k = (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || "").trim()
  return k || null
}
async function qwenKeyFromConfig(): Promise<string | null> {
  const env = qwenKey()
  if (env) return env
  try {
    const cfg = await readRouterConfig()
    const k = (cfg.qwenApiKey || "").trim()
    return k || null
  } catch { return null }
}
async function qwenWorkspaceFromConfig(): Promise<string> {
  const env = (process.env.QWEN_WORKSPACE_ID || "").trim()
  if (env) return env
  try {
    const cfg = await readRouterConfig()
    return (cfg.qwenWorkspaceId || "intl").trim() || "intl"
  } catch { return "intl" }
}
function qwenBaseUrl(workspace: string): string {
  const explicit = process.env.QWEN_BASE_URL
  if (explicit) return explicit.replace(/\/$/, "")
  return `https://${workspace}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`
}

/** Render every page of a PDF buffer to a PNG buffer.  Caps at maxPages. */
async function renderPdfPagesToPng(buf: Buffer, maxPages: number, scale: number): Promise<Buffer[]> {
  // Defer both to runtime — @napi-rs/canvas loads a native .node binary
  // that the Turbopack bundler trips over at module-eval time, and
  // pdfjs-dist is an ESM-only legacy build we resolve at runtime too.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
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
async function ocrPagePng(png: Buffer, apiKey: string, baseUrl: string, model: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const txt = await res.text()
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
  const model = opts.model ?? "qwen-vl-ocr"
  const tag = opts.tag ?? "pdf-ocr"

  const apiKey = await qwenKeyFromConfig()
  if (!apiKey) {
    return {
      pages: [], text: "", pageCount: 0, pagesAttempted: 0,
      pagesSucceeded: 0, totalChars: 0, truncated: false,
    }
  }
  const workspace = await qwenWorkspaceFromConfig()
  const baseUrl = qwenBaseUrl(workspace)

  let pngs: Buffer[]
  try {
    pngs = await renderPdfPagesToPng(buf, maxPages, scale)
  } catch (e: any) {
    console.error(`[${tag}] render failed: ${e?.message ?? e}`)
    return {
      pages: [], text: "", pageCount: 0, pagesAttempted: 0,
      pagesSucceeded: 0, totalChars: 0, truncated: false,
    }
  }
  const total = pngs.length
  const pages: OcrPageResult[] = []
  // Sequential — Qwen-VL-OCR free tier has rate caps; parallelism would 429.
  for (let i = 0; i < pngs.length; i++) {
    const start = Date.now()
    const r = await ocrPagePng(pngs[i], apiKey, baseUrl, model)
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
    truncated: total >= maxPages,
  }
}
