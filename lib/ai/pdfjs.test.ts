import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { readFileSync, existsSync } from "node:fs"
import { loadPdfjs } from "./pdfjs"

describe("loadPdfjs", () => {
  it("hands pdfjs its worker as a global so no worker path is resolved at run time", async () => {
    delete (globalThis as any).pdfjsWorker
    await loadPdfjs()
    expect(typeof (globalThis as any).pdfjsWorker?.WorkerMessageHandler).toBe("function")
  })
  it("opens an image-only PDF and sees every page", async () => {
    const p = process.env.IMAGE_PDF_FIXTURE
    if (!p || !existsSync(p)) return // fixture is optional and local
    const { getDocument } = await loadPdfjs()
    const pdf = await getDocument({ data: new Uint8Array(readFileSync(p)), isEvalSupported: false } as any).promise
    expect(pdf.numPages).toBe(7)
  })
})
