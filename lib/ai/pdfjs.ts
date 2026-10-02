/**
 * Load pdfjs-dist so it works in a serverless bundle.
 *
 * pdfjs-dist is kept external (next.config), so the file tracer ships pdf.mjs but not the
 * worker it imports dynamically at run time. In production every PDF then failed with
 * "Setting up fake worker failed: Cannot find module …/pdf.worker.mjs": text extraction fell
 * back to a bare page count and OCR could not render a single page, which read as "OCR keeps
 * failing" for every image-heavy deck. Importing the worker here, by a literal specifier, puts
 * it in the trace, and handing it to pdfjs as `globalThis.pdfjsWorker` makes pdfjs use it
 * directly instead of resolving a path at run time.
 */
export async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  if (!(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker) {
    // @ts-ignore the worker module ships without a declaration file
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs")
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
  }
  return pdfjs
}
