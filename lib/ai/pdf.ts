/**
 * Server-side PDF → plain-text extraction.
 *
 * Used so local providers (Ollama) — which have no PDF vision modality —
 * can still read pitch decks and data-room PDFs. Anthropic continues to
 * use its native PDF input modality and bypasses this helper.
 *
 * Returns the concatenated text plus per-page word counts so callers
 * can spot decks with image-only slides.
 */

import { PDFParse } from "pdf-parse"

export interface PdfText {
  text: string
  pageCount: number
  wordsPerPage: number[]
  imageOnlyPages: number // pages with < 5 words → likely image-only slide
  charCount: number
}

export async function extractPdfText(buffer: Buffer): Promise<PdfText> {
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
