/**
 * Provider-agnostic PDF + text "vision" call.
 *
 * Used by the deck extractors / analyzers (find-investors + LP-matchmaking
 * pages). Replaces the previous pattern of `new Anthropic({ apiKey:
 * process.env.ANTHROPIC_API_KEY })` calls scattered through 4 files,
 * which bypassed the admin-managed runtime config and broke when the env
 * key was missing or set to the dev "stub" placeholder.
 *
 * Resolution order (first key that's set wins, unless `providerHint`
 * forces it):
 *
 *   1. providerHint  (caller forces a specific provider — used by callers
 *                     that want explicit fallback control)
 *   2. Anthropic     (PDF documents API, native PDF vision)
 *   3. OpenAI        (Responses API with input_file parts)
 *   4. Gemini        (generateContent with inline_data parts)
 *
 * Falls through to the caller's heuristic fallback when no provider can
 * be reached.
 *
 * Each provider receives the same input shape: an array of files
 * (PDF base64 or plain text) and a single instruction prompt. The
 * function returns the raw text the model produced — the caller is
 * responsible for parsing JSON (each call-site has its own schema).
 */

import Anthropic from "@anthropic-ai/sdk"
import { readRouterConfig, type AiRouterConfig } from "./runtime-config"
import { extractPdfText } from "./pdf"
import { ocrPdfBuffer } from "./pdf-ocr"

export interface PdfVisionFile {
  name: string
  /** Either application/pdf (with base64) or text/plain (with text). */
  contentType: string
  base64?: string
  text?: string
}

export interface PdfVisionCallOpts {
  /** Force a specific provider — skip the auto-resolution chain. */
  providerHint?: "anthropic" | "openai" | "gemini" | "qwen"
  /** Max output tokens for the model (default 2400). */
  maxTokens?: number
  /** Sampling temperature (default 0.2). */
  temperature?: number
  /** Per-call debug tag — surfaces in error logs. */
  tag?: string
}

export interface PdfVisionResult {
  text: string
  provider: "anthropic" | "openai" | "gemini" | "qwen" | "none"
  model: string | null
  error: string | null
}

const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-6"
const OPENAI_DEFAULT_MODEL = "gpt-4.1"
const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash"
const QWEN_DEFAULT_MODEL = "qwen3-vl-plus"

function readRuntimeKeys(cfg: AiRouterConfig | null) {
  const qwenWorkspace = cfg?.qwenWorkspaceId || process.env.QWEN_WORKSPACE_ID || "intl"
  return {
    anthropicKey: (cfg?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "").trim(),
    openaiKey: (cfg?.openaiApiKey || process.env.OPENAI_API_KEY || "").trim(),
    geminiKey:
      (cfg?.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim(),
    qwenKey:
      (cfg?.qwenApiKey || process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || "").trim(),
    anthropicModel: cfg?.anthropicModel || process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL,
    openaiModel: cfg?.openaiModel || process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL,
    geminiModel: cfg?.geminiModel || process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
    qwenModel: cfg?.qwenModel || process.env.QWEN_MODEL || QWEN_DEFAULT_MODEL,
    qwenBaseUrl: (process.env.QWEN_BASE_URL ?? `https://${qwenWorkspace}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`).replace(/\/$/, ""),
  }
}

function isUsableKey(k: string): boolean {
  // Treat dev placeholders as "no key" so we don't ship them to the API
  // and get a 401 that masquerades as a real failure.
  if (!k) return false
  const lower = k.toLowerCase()
  if (lower === "stub" || lower === "placeholder" || lower === "todo") return false
  if (lower.startsWith("test-") && k.length < 20) return false
  return k.length >= 20
}

/** Pick the first provider whose key is usable. */
export async function resolveVisionProvider(
  hint?: "anthropic" | "openai" | "gemini" | "qwen",
): Promise<"anthropic" | "openai" | "gemini" | "qwen" | "none"> {
  const cfg = await readRouterConfig().catch(() => null)
  const k = readRuntimeKeys(cfg)
  if (hint === "anthropic" && isUsableKey(k.anthropicKey)) return "anthropic"
  if (hint === "openai" && isUsableKey(k.openaiKey)) return "openai"
  if (hint === "gemini" && isUsableKey(k.geminiKey)) return "gemini"
  if (hint === "qwen" && isUsableKey(k.qwenKey)) return "qwen"
  if (isUsableKey(k.anthropicKey)) return "anthropic"
  if (isUsableKey(k.openaiKey)) return "openai"
  if (isUsableKey(k.geminiKey)) return "gemini"
  if (isUsableKey(k.qwenKey)) return "qwen"
  return "none"
}

/**
 * Main entry-point. Sends documents + a prompt to whichever PDF-capable
 * provider is configured, returning the raw text the model produced.
 */
export async function analyzePdfDocuments(
  docs: PdfVisionFile[],
  prompt: string,
  opts: PdfVisionCallOpts = {},
): Promise<PdfVisionResult> {
  const cfg = await readRouterConfig().catch(() => null)
  const k = readRuntimeKeys(cfg)
  const maxTokens = opts.maxTokens ?? 2400
  const temperature = opts.temperature ?? 0.2
  const tag = opts.tag ?? "pdf-vision"

  const chain: ("anthropic" | "openai" | "gemini" | "qwen")[] = []
  if (opts.providerHint) {
    chain.push(opts.providerHint)
  } else {
    if (isUsableKey(k.anthropicKey)) chain.push("anthropic")
    if (isUsableKey(k.openaiKey)) chain.push("openai")
    if (isUsableKey(k.geminiKey)) chain.push("gemini")
    if (isUsableKey(k.qwenKey)) chain.push("qwen")
  }
  if (!chain.length) {
    return { text: "", provider: "none", model: null, error: "no usable provider key" }
  }

  // ─── Pre-extract PDF text for ALL inputs that don't already carry it.
  // Anthropic-only could lean on its native PDF document API, but every
  // other provider in the chain (Qwen-VL, OpenAI, Gemini) needs either
  // pre-extracted text or an image part — they cannot consume raw PDF
  // base64 directly.  Without this step, when the chain lands on Qwen,
  // the model receives only the filename and FABRICATES every field
  // (this was the root cause of the "Wildcat Capital Fund I /
  // Dr. Elena Rodriguez" hallucination from a PDF actually titled
  // "WC Investor Deck March '26").
  const docsWithText: PdfVisionFile[] = []
  for (const d of docs) {
    if (d.contentType === "application/pdf" && d.base64 && !d.text) {
      try {
        const buf = Buffer.from(d.base64, "base64")
        const parsed = await extractPdfText(buf)
        const sparseSignal =
          (parsed.imageOnlyPages > parsed.pageCount * 0.5) ||
          (parsed.text || "").trim().length < 200
        let bodyText = parsed.text || ""
        let bodyNote = ""
        if (sparseSignal) {
          // ── OCR fallback ──────────────────────────────────────────
          // pdf-parse saw < 5 words/page or essentially no text — the
          // deck is image-rendered slides (typical for polished VC
          // pitch decks).  Rasterise each page via pdfjs-dist + napi
          // canvas, then OCR via Qwen-VL-OCR.  Previously this case
          // returned the sparse-tag and produced the all-null /
          // "Filename is not evidence" outputs the user reported.
          console.log(`[${tag}] PDF sparse (${parsed.imageOnlyPages}/${parsed.pageCount} pages image-only, ${bodyText.trim().length} chars text) — running OCR fallback`)
          const ocr = await ocrPdfBuffer(buf, { tag: `${tag}/ocr`, maxPages: 15 })
          if (ocr.pagesSucceeded > 0 && ocr.totalChars > bodyText.length + 50) {
            // Replace the sparse text with the OCR'd content; keep a
            // small audit trail for the model so it knows the source
            // was OCR (lower-confidence than direct PDF text).
            bodyText = ocr.text
            bodyNote = ` [source: Qwen-VL-OCR pass over ${ocr.pagesSucceeded}/${ocr.pageCount} rendered pages${ocr.truncated ? " (truncated)" : ""}; treat OCR output as evidence but be conservative with numbers]`
          } else {
            bodyNote = ` [note: ${parsed.imageOnlyPages}/${parsed.pageCount} pages had < 5 words of extractable text and OCR ${ocr.pagesAttempted === 0 ? "could not run (no Qwen key)" : "yielded no usable text"} — likely image/diagram-heavy; treat unmentioned facts as UNKNOWN and return null rather than infer]`
          }
        } else {
          bodyNote = ` [extracted ${parsed.pageCount} pages of text]`
        }
        docsWithText.push({ ...d, text: bodyText + bodyNote })
      } catch (e: any) {
        console.error(`[${tag}] pre-extract failed for ${d.name}: ${e?.message ?? e}`)
        docsWithText.push(d)  // keep original; provider may still handle it (Anthropic path)
      }
    } else {
      docsWithText.push(d)
    }
  }

  let lastErr: string | null = null
  for (const p of chain) {
    try {
      if (p === "anthropic") {
        if (!isUsableKey(k.anthropicKey)) { lastErr = "anthropic key missing"; continue }
        const text = await callAnthropic(docsWithText, prompt, k.anthropicKey, k.anthropicModel, maxTokens, temperature)
        return { text, provider: "anthropic", model: k.anthropicModel, error: null }
      }
      if (p === "openai") {
        if (!isUsableKey(k.openaiKey)) { lastErr = "openai key missing"; continue }
        const text = await callOpenAI(docsWithText, prompt, k.openaiKey, k.openaiModel, maxTokens, temperature)
        return { text, provider: "openai", model: k.openaiModel, error: null }
      }
      if (p === "gemini") {
        if (!isUsableKey(k.geminiKey)) { lastErr = "gemini key missing"; continue }
        const text = await callGemini(docsWithText, prompt, k.geminiKey, k.geminiModel, maxTokens, temperature)
        return { text, provider: "gemini", model: k.geminiModel, error: null }
      }
      if (p === "qwen") {
        if (!isUsableKey(k.qwenKey)) { lastErr = "qwen key missing"; continue }
        const text = await callQwen(docsWithText, prompt, k.qwenKey, k.qwenBaseUrl, k.qwenModel, maxTokens, temperature)
        return { text, provider: "qwen", model: k.qwenModel, error: null }
      }
    } catch (e: any) {
      lastErr = e?.message ?? String(e)
      console.error(`[${tag}/${p}] ${lastErr}`)
      // Fall through to next provider in chain
    }
  }
  return { text: "", provider: "none", model: null, error: lastErr ?? "all providers failed" }
}

// ─── Anthropic — native PDF input ──────────────────────────────────────────
async function callAnthropic(
  docs: PdfVisionFile[],
  prompt: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const client = new Anthropic({ apiKey })
  const content: any[] = []
  for (const d of docs) {
    if (d.contentType === "application/pdf" && d.base64) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: d.base64 },
        title: d.name,
      })
    } else if (d.text) {
      content.push({ type: "text", text: `--- ${d.name} ---\n${d.text}` })
    }
  }
  if (!content.length) throw new Error("no usable docs for anthropic")
  content.push({ type: "text", text: prompt })
  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content }],
  })
  return resp.content[0]?.type === "text" ? resp.content[0].text : ""
}

// ─── OpenAI — Responses API with input_file parts ──────────────────────────
//
// We deliberately use direct fetch instead of the OpenAI SDK (not in the
// repo's deps) so that adding OpenAI vision doesn't require pulling in
// another package. The Responses API accepts inline base64 PDFs via
// `input_file` parts.
//
async function callOpenAI(
  docs: PdfVisionFile[],
  prompt: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const content: any[] = []
  for (const d of docs) {
    if (d.contentType === "application/pdf" && d.base64) {
      content.push({
        type: "input_file",
        filename: d.name,
        file_data: `data:application/pdf;base64,${d.base64}`,
      })
    } else if (d.text) {
      content.push({ type: "input_text", text: `--- ${d.name} ---\n${d.text}` })
    }
  }
  if (!content.length) throw new Error("no usable docs for openai")
  content.push({ type: "input_text", text: prompt })

  const url = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "") + "/responses"
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_output_tokens: maxTokens,
      temperature,
      input: [{ role: "user", content }],
    }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`openai ${res.status}: ${body.slice(0, 240)}`)
  let json: any
  try { json = JSON.parse(body) } catch { throw new Error(`openai non-json response: ${body.slice(0, 240)}`) }
  // Responses API: `output_text` is a convenience flat string; otherwise
  // walk the structured output array.
  if (typeof json.output_text === "string" && json.output_text) return json.output_text
  const out = Array.isArray(json.output) ? json.output : []
  const parts: string[] = []
  for (const o of out) {
    if (o?.type !== "message") continue
    for (const c of o.content ?? []) {
      if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text)
    }
  }
  return parts.join("\n").trim()
}

// ─── Gemini — generateContent with inline_data PDF parts ───────────────────
async function callGemini(
  docs: PdfVisionFile[],
  prompt: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const parts: any[] = []
  for (const d of docs) {
    if (d.contentType === "application/pdf" && d.base64) {
      parts.push({
        inline_data: { mime_type: "application/pdf", data: d.base64 },
      })
    } else if (d.text) {
      parts.push({ text: `--- ${d.name} ---\n${d.text}` })
    }
  }
  if (!parts.length) throw new Error("no usable docs for gemini")
  parts.push({ text: prompt })

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`gemini ${res.status}: ${body.slice(0, 240)}`)
  let json: any
  try { json = JSON.parse(body) } catch { throw new Error(`gemini non-json response: ${body.slice(0, 240)}`) }
  const cand = json.candidates?.[0]
  const textParts = cand?.content?.parts ?? []
  return textParts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("").trim()
}

// ─── Qwen — OpenAI-compatible Chat Completions (text + image_url parts)
//
// Qwen3-VL accepts image inputs as `image_url` parts in the OpenAI-style
// messages payload.  PDF is not natively supported, so for PDF docs we
// fall back to sending the document filename + any extracted text in a
// single user message.  When the caller has pre-extracted text (e.g. our
// extractPdfText path), Qwen-VL sees the full document text and produces
// the same JSON shape as Anthropic / OpenAI for parsing downstream.
async function callQwen(
  docs: PdfVisionFile[],
  prompt: string,
  apiKey: string,
  baseUrl: string,
  model: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const content: any[] = []
  for (const d of docs) {
    if (d.text) {
      // Either pre-extracted by analyzePdfDocuments, or supplied by the
      // caller for text/markdown/etc.  This is the ONLY path that gives
      // Qwen anything substantive to reason about — never send a
      // placeholder string, the model will fabricate to fill the schema.
      content.push({ type: "text", text: `--- ${d.name} ---\n${d.text}` })
    } else if (d.contentType === "application/pdf" && d.base64) {
      // Reached only when pre-extraction failed AND no fallback text.
      // Fail loudly so the caller sees the real reason and can fall
      // back to a heuristic instead of returning a confident hallucination.
      throw new Error(
        `Qwen-VL cannot consume raw PDF binaries and pre-extraction yielded no text for "${d.name}". ` +
        `The source is likely image-only / scanned; try Anthropic (Claude) for native PDF vision.`
      )
    }
  }
  if (!content.length) throw new Error("no usable docs for qwen-vl")
  content.push({ type: "text", text: prompt })

  const url = baseUrl.replace(/\/$/, "") + "/chat/completions"
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content }],
    }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`qwen ${res.status}: ${body.slice(0, 240)}`)
  const json: any = JSON.parse(body)
  return json?.choices?.[0]?.message?.content ?? ""
}
