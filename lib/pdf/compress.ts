/**
 * In-browser PDF compressor. No server, no upload of the large file, nothing leaves the machine until it is small enough.
 *
 * It re-renders each page to a JPEG and rebuilds the PDF from those images, stepping down in resolution and quality until
 * the file is under the target. That is the only way to shrink a deck whose weight is in its pictures without a native
 * tool. The trade-off is stated to the user: the copy is image-based, so its text is not selectable. Anker reads decks
 * with OCR, so assessment is unaffected.
 *
 * Browser only (canvas, pdf.js, pdf-lib). The planning helpers are pure and are unit tested.
 */

export interface Step { scale: number; quality: number }
/** From gentle to aggressive. A page is rendered at `scale` x its natural size (CSS px at 72 dpi). */
export const LADDER: Step[] = [
  { scale: 1.6, quality: 0.74 },
  { scale: 1.3, quality: 0.64 },
  { scale: 1.05, quality: 0.55 },
  { scale: 0.85, quality: 0.46 },
  { scale: 0.7, quality: 0.38 },
]
export const MAX_SIDE_PX = 2400

/** Which rung to start on: a file several times over target skips the gentle rungs. */
export function startStep(size: number, target: number): number {
  const ratio = size / Math.max(1, target)
  return ratio > 6 ? 3 : ratio > 3.5 ? 2 : ratio > 1.8 ? 1 : 0
}

/** The scale for one page, capped so a poster-sized page cannot produce a huge canvas. */
export function pageScale(widthPt: number, heightPt: number, step: Step): number {
  const longest = Math.max(widthPt, heightPt) * step.scale
  return longest > MAX_SIDE_PX ? (MAX_SIDE_PX / Math.max(widthPt, heightPt)) : step.scale
}

export const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)

export interface Progress { page: number; pages: number; attempt: number; attempts: number }

export class CompressError extends Error {}

export async function compressPdf(file: File, opts: { targetBytes: number; onProgress?: (p: Progress) => void; signal?: AbortSignal }): Promise<File> {
  const [pdfjs, { PDFDocument }] = await Promise.all([import("pdfjs-dist"), import("pdf-lib")])
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data: data.slice() })
  const src = await task.promise
  const first = startStep(file.size, opts.targetBytes)
  const steps = LADDER.slice(first)
  let best: Uint8Array | null = null
  try {
    for (let a = 0; a < steps.length; a++) {
      const out = await PDFDocument.create()
      for (let i = 1; i <= src.numPages; i++) {
        if (opts.signal?.aborted) throw new CompressError("Cancelled")
        opts.onProgress?.({ page: i, pages: src.numPages, attempt: a + 1, attempts: steps.length })
        const page = await src.getPage(i)
        const natural = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: pageScale(natural.width, natural.height, steps[a]) })
        const canvas = document.createElement("canvas")
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext("2d", { alpha: false })!
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height)
        // intent "print" renders without requestAnimationFrame, which a hidden browser tab never fires: the default intent
        // stalls forever when the user switches tabs during a long compression.
        await page.render({ canvas, canvasContext: ctx, viewport, intent: "print" }).promise
        const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new CompressError("The browser could not encode a page"))), "image/jpeg", steps[a].quality))
        const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()))
        const p = out.addPage([natural.width, natural.height])
        p.drawImage(img, { x: 0, y: 0, width: natural.width, height: natural.height })
        canvas.width = 0; canvas.height = 0 // release the bitmap now, a long deck would otherwise hold hundreds of them
        page.cleanup()
      }
      const bytes = await out.save({ useObjectStreams: true })
      if (!best || bytes.length < best.length) best = bytes
      if (bytes.length <= opts.targetBytes) break
    }
  } finally { await task.destroy() }
  if (!best) throw new CompressError("Nothing to compress")
  if (best.length > opts.targetBytes) throw new CompressError(`Even at the lowest quality the deck is ${(best.length / 1048576).toFixed(0)} MB. Please send a lighter export.`)
  const name = file.name.replace(/\.pdf$/i, "") + "-compressed.pdf"
  return new File([best as BlobPart], name, { type: "application/pdf" })
}

/** Returns the file to upload: the original when it fits, a compressed copy when it is a PDF that does not. */
export async function prepareUpload(file: File, maxBytes: number, onProgress?: (p: Progress) => void): Promise<{ file: File; compressed: boolean; from: number }> {
  if (file.size <= maxBytes) return { file, compressed: false, from: file.size }
  if (!isPdf(file)) throw new CompressError(`${file.name} is over ${(maxBytes / 1048576).toFixed(0)} MB. Only PDFs can be compressed automatically; please send a smaller file.`)
  // Aim a little under the ceiling so the multipart overhead never tips it over.
  const out = await compressPdf(file, { targetBytes: Math.floor(maxBytes * 0.92), onProgress })
  return { file: out, compressed: true, from: file.size }
}
