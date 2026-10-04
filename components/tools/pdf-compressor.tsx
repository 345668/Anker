"use client"

import { useRef, useState } from "react"
import { compressPdf, CompressError, isPdf, type Progress } from "@/lib/pdf/compress"
import { humanBytes } from "@/lib/uploads/limits"

const TARGETS = [5, 10, 20, 40, 80]
const btn = "h-10 rounded-md px-5 text-sm font-medium disabled:opacity-50"

/** Builds a deliberately heavy PDF (noisy photos) in the browser, so the compressor can be checked without a real deck. */
async function syntheticDeck(pages = 16): Promise<File> {
  const { PDFDocument } = await import("pdf-lib")
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const c = document.createElement("canvas"); c.width = 2000; c.height = 1125
    const ctx = c.getContext("2d")!
    const img = ctx.createImageData(c.width, c.height)
    for (let p = 0; p < img.data.length; p += 4) { img.data[p] = Math.random() * 255; img.data[p + 1] = Math.random() * 255; img.data[p + 2] = Math.random() * 255; img.data[p + 3] = 255 }
    ctx.putImageData(img, 0, 0)
    ctx.fillStyle = "#fff"; ctx.font = "bold 120px sans-serif"; ctx.fillText(`Page ${i + 1}`, 120, 220)
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.95))
    const jpg = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()))
    const page = doc.addPage([960, 540]); page.drawImage(jpg, { x: 0, y: 0, width: 960, height: 540 })
  }
  return new File([(await doc.save()) as BlobPart], "synthetic-heavy-deck.pdf", { type: "application/pdf" })
}

export function PdfCompressor() {
  const [target, setTarget] = useState(20)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ file: File; from: number; url: string; pages: number } | null>(null)
  const [check, setCheck] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function run(file: File) {
    setBusy(true); setError(null); setResult(null)
    try {
      if (!isPdf(file)) throw new CompressError("Please choose a PDF file.")
      const out = await compressPdf(file, { targetBytes: target * 1024 * 1024, onProgress: setProgress })
      const pdfjs = await import("pdfjs-dist")
      const pages = (await pdfjs.getDocument({ data: new Uint8Array(await out.arrayBuffer()) }).promise).numPages
      setResult({ file: out, from: file.size, url: URL.createObjectURL(out), pages })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false); setProgress(null) }
  }

  async function selfTest() {
    setBusy(true); setError(null); setResult(null); setCheck("Building a heavy test deck…")
    try {
      const deck = await syntheticDeck()
      setCheck(`Built a ${humanBytes(deck.size)} test deck with 16 pages. Compressing to ${Math.min(target, 10)} MB…`)
      const t0 = performance.now()
      const out = await compressPdf(deck, { targetBytes: Math.min(target, 10) * 1024 * 1024, onProgress: setProgress })
      const pdfjs = await import("pdfjs-dist")
      const pages = (await pdfjs.getDocument({ data: new Uint8Array(await out.arrayBuffer()) }).promise).numPages
      const ok = out.size < deck.size && pages === 16
      setCheck(`${ok ? "PASS" : "FAIL"}: ${humanBytes(deck.size)} to ${humanBytes(out.size)} in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${pages} of 16 pages readable.`)
    } catch (e) { setCheck(`FAIL: ${(e as Error).message}`) } finally { setBusy(false); setProgress(null) }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <label className="block text-sm font-medium">PDF to shrink
          <input ref={input} type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f) }} className="mt-2 block w-full text-sm" />
        </label>
        <label className="mt-4 block text-sm font-medium">Aim for under
          <select value={target} onChange={(e) => setTarget(Number(e.target.value))} className="ml-2 rounded-md border border-border bg-background px-2 py-1 text-sm">{TARGETS.map((t) => <option key={t} value={t}>{t} MB</option>)}</select>
        </label>
        {progress && <p className="mt-3 text-sm text-muted-foreground">Page {progress.page} of {progress.pages}{progress.attempts > 1 ? `, pass ${progress.attempt}` : ""}…</p>}
        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
        {result && (
          <div className="mt-4 rounded-lg border border-border p-4 text-sm">
            <p><b>{humanBytes(result.from)}</b> to <b>{humanBytes(result.file.size)}</b> ({Math.round((1 - result.file.size / result.from) * 100)}% smaller), {result.pages} pages.</p>
            <a href={result.url} download={result.file.name} className={`${btn} mt-3 inline-flex items-center`} style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Download {result.file.name}</a>
          </div>)}
      </div>
      <p className="text-xs text-muted-foreground">The file never leaves your computer: it is shrunk in this browser tab. The copy is made of page images, so its text cannot be selected or searched, but it looks the same and Anker reads decks by image anyway. Keep your original.</p>
      <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Check that it works</summary>
        <button onClick={selfTest} disabled={busy} className={`${btn} mt-3 border border-border`}>Run a self-test</button>
        {check && <p className="mt-2 font-mono text-xs" data-testid="selftest">{check}</p>}
      </details>
    </div>
  )
}
