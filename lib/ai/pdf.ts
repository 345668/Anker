/**
 * Server-side PDF → plain-text extraction.
 *
 * Used so local providers (Ollama) — which have no PDF vision modality —
 * can still read pitch decks and data-room PDFs. Anthropic continues to
 * use its native PDF input modality and bypasses this helper.
 *
 * Strategy:
 *
 *   1. Read the text layer with pdfjs-dist (serverless-compatible, no
 *      canvas). pdf-lib is only the fallback: it counts pages, it reads no text.
 *   2. If the deck looks image-heavy (≥50% of pages had < 5 words) AND
 *      the Marker sidecar is reachable, re-extract via Marker which
 *      uses small CV models to OCR + structure the deck.  Marker's
 *      output is markdown with headings, which the LLM downstream
 *      handles dramatically better than empty text-layer output.
 *   3. Provenance is tagged on `source` so callers can show "via Marker".
 */

import { PDFDocument } from "pdf-lib"
import { loadPdfjs } from "./pdfjs"
import { isMarkerAvailable, markerExtractMarkdown } from "./pdf-marker"

export interface PdfText {
  text: string
  pageCount: number
  wordsPerPage: number[]
  imageOnlyPages: number // pages with < 5 words → likely image-only slide
  charCount: number
  /** Provenance — "pdfjs" (the text layer), "pdf-lib" (page count only, when
   *  pdfjs cannot open the file) or "marker" (CV-model markdown, for scans). */
  source?: "pdfjs" | "pdf-lib" | "marker"
}

export async function extractPdfText(
  buffer: Buffer,
  opts: { filename?: string; preferMarker?: boolean } = {},
): Promise<PdfText> {
  const baseline = await pdfParseExtract(buffer)
  const imageHeavy =
    baseline.pageCount > 0 && baseline.imageOnlyPages / baseline.pageCount > 0.5
  const wantMarker = opts.preferMarker || imageHeavy || baseline.charCount < 200
  if (wantMarker && (await isMarkerAvailable())) {
    const result = await markerExtractMarkdown(buffer, opts.filename ?? "deck.pdf")
    if (result?.ok && result.markdown.length > 0) {
      const md = result.markdown
      const cleaned = md.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
      const wordsPerPage = approximateWordsPerPage(cleaned, result.pages || 1)
      return {
        text: cleaned,
        pageCount: result.pages || wordsPerPage.length || 1,
        wordsPerPage,
        imageOnlyPages: wordsPerPage.filter((n) => n < 5).length,
        charCount: cleaned.length,
        source: "marker",
      }
    }
  }
  return baseline
}

/**
 * Read the PDF's text layer with pdfjs-dist — no canvas, so none of the
 * native-binary risk the OCR path carries. Null when pdfjs cannot open the file.
 *
 * pdf-lib (below) replaced pdf-parse in June and can only count pages, so for
 * three months every PDF read as a scan: 0 words on every page. A deck with a
 * perfectly good text layer went to OCR, or to a model with nothing to read.
 */
async function textLayerExtract(buffer: Buffer): Promise<PdfText | null> {
  try {
    // Loaded at runtime like pdf-ocr.ts does; listed in serverExternalPackages.
    const { getDocument } = await loadPdfjs()
    // A copy: pdfjs may detach the array it is given, and the caller still owns
    // this buffer. verbosity 0 = errors only: the font-data warnings concern
    // rendering glyphs, not reading text.
    const task = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false, verbosity: 0 } as any)
    const pdf = await task.promise
    try {
      const pages: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        pages.push(content.items.map((it: any) => (typeof it.str === "string" ? it.str + (it.hasEOL ? "\n" : " ") : "")).join(""))
        page.cleanup()
      }
      const wordsPerPage = pages.map((p) => p.trim().split(/\s+/).filter(Boolean).length)
      const text = pages
        .map((p) => p.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim())
        .join("\n\n")
        .trim()
      return {
        text,
        pageCount: pdf.numPages,
        wordsPerPage,
        imageOnlyPages: wordsPerPage.filter((n) => n < 5).length,
        charCount: text.length,
        source: "pdfjs",
      }
    } finally {
      await task.destroy()
    }
  } catch (err) {
    console.error("[pdf] text layer extraction failed:", (err as Error)?.message)
    return null
  }
}

async function pdfParseExtract(buffer: Buffer): Promise<PdfText> {
  const layer = await textLayerExtract(buffer)
  if (layer) return layer
  try {
    // Fallback when pdfjs cannot open the file: pdf-lib gives a page count
    // only, and every page reads as image-only so Marker/OCR/vision take over.
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
    const pageCount = pdfDoc.getPages().length
    return {
      text: "",
      pageCount,
      wordsPerPage: Array.from({ length: pageCount }, () => 0),
      imageOnlyPages: pageCount,
      charCount: 0,
      source: "pdf-lib",
    }
  } catch (err) {
    console.error("[pdf] extraction failed:", (err as Error)?.message)
    return {
      text: "",
      pageCount: 1,
      wordsPerPage: [0],
      imageOnlyPages: 1,
      charCount: 0,
    }
  }
}

function approximateWordsPerPage(markdown: string, pageCount: number): number[] {
  // Try to split on Marker's "# Page N" markers; otherwise split evenly.
  const byPage = markdown.split(/\n#{1,2}\s+Page\s+\d+/i)
  if (byPage.length >= 2) {
    return byPage.map((s) => s.trim().split(/\s+/).filter(Boolean).length)
  }
  const total = markdown.trim().split(/\s+/).filter(Boolean).length
  const per = Math.max(1, Math.floor(total / Math.max(1, pageCount)))
  return Array.from({ length: pageCount }, () => per)
}
