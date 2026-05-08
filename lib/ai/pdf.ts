/**
 * Server-side PDF → plain-text extraction.
 *
 * Used so local providers (Ollama) — which have no PDF vision modality —
 * can still read pitch decks and data-room PDFs. Anthropic continues to
 * use its native PDF input modality and bypasses this helper.
 *
 * Strategy:
 *
 *   1. Run `pdf-parse` (text-layer extraction).  Cheap.
 *   2. If the deck looks image-heavy (≥50% of pages had < 5 words) AND
 *      the Marker sidecar is reachable, re-extract via Marker which
 *      uses small CV models to OCR + structure the deck.  Marker's
 *      output is markdown with headings, which the LLM downstream
 *      handles dramatically better than empty pdf-parse output.
 *   3. Provenance is tagged on `source` so callers can show "via Marker".
 */

import { PDFParse } from "pdf-parse"
import { isMarkerAvailable, markerExtractMarkdown } from "./pdf-marker"

export interface PdfText {
  text: string
  pageCount: number
  wordsPerPage: number[]
  imageOnlyPages: number // pages with < 5 words → likely image-only slide
  charCount: number
  /** Provenance — "pdf-parse" (text layer only) or "marker" (CV-model
   *  markdown). Marker is preferred for image-heavy decks. */
  source?: "pdf-parse" | "marker"
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
  return { ...baseline, source: "pdf-parse" }
}

async function pdfParseExtract(buffer: Buffer): Promise<PdfText> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    const pages = (result as any).pages ?? []
    const wordsPerPage = pages.map((p: any) => {
      const txt: string = p?.text ?? ""
      return txt.trim().split(/\s+/).filter(Boolean).length
    })
    const concatenated: string = (result as any).text ?? ""
    const cleaned = concatenated
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    return {
      text: cleaned,
      pageCount: pages.length || 1,
      wordsPerPage,
      imageOnlyPages: wordsPerPage.filter((n: number) => n < 5).length,
      charCount: cleaned.length,
    }
  } finally {
    try { await parser.destroy() } catch {}
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
