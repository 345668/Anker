"use client"

import { useEffect, useState } from "react"
import { mergePdfs, pdfToWord, wordToPdf } from "@/lib/tools/doc-engines"
import { humanBytes } from "@/lib/uploads/limits"
import { convertExact, exactAvailable } from "@/lib/tools/convert-client"

const btn = "h-10 rounded-md px-5 text-sm font-medium disabled:opacity-50"
const primary = { background: "var(--primary)", color: "var(--primary-foreground)" }

function Download({ file, note }: { file: File; note: string }) {
  const [url] = useState(() => URL.createObjectURL(file))
  return (
    <div className="mt-4 rounded-lg border border-border p-4 text-sm">
      <p>{note}</p>
      <a href={url} download={file.name} className={`${btn} mt-3 inline-flex items-center`} style={primary}>Download {file.name} ({humanBytes(file.size)})</a>
    </div>
  )
}

function Frame({ children, limits, selfTest, local = true }: { children: React.ReactNode; limits: string; selfTest: () => Promise<string>; local?: boolean }) {
  const [check, setCheck] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">{children}</div>
      <p className="text-xs text-muted-foreground">{local ? "Done in this browser tab: your file is never uploaded. " : ""}{limits}</p>
      <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Check that it works</summary>
        <button className={`${btn} mt-3 border border-border`} disabled={running} onClick={async () => { setRunning(true); setCheck("Running…"); try { setCheck(await selfTest()) } catch (e) { setCheck(`FAIL: ${(e as Error).message}`) } finally { setRunning(false) } }}>Run a self-test</button>
        {check && <p className="mt-2 font-mono text-xs" data-testid="selftest">{check}</p>}
      </details>
    </div>
  )
}

type Mode = "exact" | "browser"

/** Whether the exact-layout converter is set up, and the caller's upload folder for it. */
function useExact() {
  const [state, setState] = useState<{ available: boolean; prefix: string } | null>(null)
  useEffect(() => { exactAvailable().then(setState) }, [])
  return state
}

function ModePicker({ exact, mode, setMode, exactText, browserText }: { exact: { available: boolean } | null; mode: Mode; setMode: (m: Mode) => void; exactText: string; browserText: string }) {
  if (!exact) return null
  if (!exact.available) return <p className="mb-4 text-xs text-muted-foreground">Exact-layout conversion is not set up on this deployment, so this tool uses the in-browser converter.</p>
  const row = "flex items-start gap-2 rounded-md border border-border p-3 text-sm cursor-pointer"
  return (
    <fieldset className="mb-4 grid gap-2 sm:grid-cols-2">
      <label className={`${row} ${mode === "exact" ? "border-[var(--accent)]" : ""}`}><input type="radio" checked={mode === "exact"} onChange={() => setMode("exact")} className="mt-1" /><span><b>Exact layout</b><br /><span className="text-xs text-muted-foreground">{exactText}</span></span></label>
      <label className={`${row} ${mode === "browser" ? "border-[var(--accent)]" : ""}`}><input type="radio" checked={mode === "browser"} onChange={() => setMode("browser")} className="mt-1" /><span><b>Private, in your browser</b><br /><span className="text-xs text-muted-foreground">{browserText}</span></span></label>
    </fieldset>
  )
}

const pdfText = async (file: File) => {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  let text = ""
  for (let i = 1; i <= doc.numPages; i++) text += ((await (await doc.getPage(i)).getTextContent()).items as any[]).map((x) => x.str).join(" ") + "\n"
  return { text, pages: doc.numPages }
}

// ── merge ───────────────────────────────────────────────────────────────

export function PdfMergeTool() {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [out, setOut] = useState<{ file: File; pages: number } | null>(null)
  const move = (i: number, d: number) => setFiles((f) => { const n = [...f]; const j = i + d; if (j < 0 || j >= n.length) return f; [n[i], n[j]] = [n[j], n[i]]; return n })

  async function run() {
    setBusy(true); setError(null); setOut(null)
    try { setOut(await mergePdfs(files)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function selfTest() {
    const { PDFDocument } = await import("pdf-lib")
    const mk = async (n: number, name: string) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([300, 300]); return new File([(await d.save()) as BlobPart], name, { type: "application/pdf" }) }
    const r = await mergePdfs([await mk(3, "a.pdf"), await mk(2, "b.pdf")])
    return r.pages === 5 ? `PASS: 3 + 2 pages merged into ${r.pages} pages.` : `FAIL: expected 5 pages, got ${r.pages}.`
  }

  return (
    <Frame limits="Password-protected PDFs cannot be merged; remove the password first." selfTest={selfTest}>
      <label className="block text-sm font-medium">Add PDFs (select several; choose again to add more)
        <input type="file" multiple accept="application/pdf,.pdf" className="mt-2 block w-full text-sm" onChange={(e) => { setFiles((f) => [...f, ...Array.from(e.target.files ?? []).filter((x) => /\.pdf$/i.test(x.name))]); setOut(null); e.target.value = "" }} />
      </label>
      {files.length > 0 && (
        <ol className="mt-4 space-y-1.5 text-sm">{files.map((f, i) => (
          <li key={i} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
            <span className="w-5 tabular-nums text-muted-foreground">{i + 1}</span><span className="flex-1 truncate">{f.name}</span><span className="text-xs text-muted-foreground">{humanBytes(f.size)}</span>
            <button className="px-1 text-xs underline" disabled={i === 0} onClick={() => move(i, -1)}>Up</button>
            <button className="px-1 text-xs underline" disabled={i === files.length - 1} onClick={() => move(i, 1)}>Down</button>
            <button className="px-1 text-xs text-muted-foreground underline" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>Remove</button>
          </li>))}</ol>)}
      <button className={`${btn} mt-4`} style={primary} disabled={busy || files.length < 2} onClick={run}>{busy ? "Merging…" : `Merge ${files.length || ""} PDFs`}</button>
      {files.length === 1 && <span className="ml-3 text-xs text-muted-foreground">Add at least two.</span>}
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      {out && <Download file={out.file} note={`Merged ${files.length} files into ${out.pages} pages.`} />}
    </Frame>
  )
}

// ── Word to PDF ─────────────────────────────────────────────────────────

export function WordToPdfTool() {
  const exact = useExact()
  const [mode, setMode] = useState<Mode>("exact")
  const useExactMode = !!exact?.available && mode === "exact"
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [out, setOut] = useState<{ file: File; pages: number; images: number } | null>(null)

  async function run(f: File) {
    setBusy(true); setError(null); setOut(null)
    try {
      if (useExactMode) { const file = await convertExact(f, "word-to-pdf", exact!.prefix); setOut({ file, pages: 0, images: 0 }) }
      else setOut(await wordToPdf(f))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function selfTest() {
    const d = await import("docx")
    const doc = new d.Document({ sections: [{ children: [
      new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, children: [new d.TextRun("Quarterly Report")] }),
      new d.Paragraph({ children: [new d.TextRun("Revenue grew "), new d.TextRun({ text: "strongly", bold: true }), new d.TextRun(" this quarter, with café sales up 12% and a new € price list.")] }),
      new d.Paragraph({ bullet: { level: 0 }, children: [new d.TextRun("First point")] }), new d.Paragraph({ bullet: { level: 0 }, children: [new d.TextRun("Second point")] }),
      new d.Table({ rows: [new d.TableRow({ children: ["Region", "Sales"].map((t) => new d.TableCell({ children: [new d.Paragraph(t)] })) }), new d.TableRow({ children: ["Berlin", "120"].map((t) => new d.TableCell({ children: [new d.Paragraph(t)] })) })] }),
    ] }] })
    const r = await wordToPdf(new File([await d.Packer.toBlob(doc)], "report.docx"))
    const { text, pages } = await pdfText(r.file)
    const want = ["Quarterly Report", "strongly", "First point", "Second point", "Berlin", "120"]
    const missing = want.filter((w) => !text.includes(w))
    return missing.length ? `FAIL: missing ${missing.join(", ")} in the PDF text.` : `PASS: ${pages} page(s), headings, bold, list and table text all present (${humanBytes(r.file.size)}).`
  }

  return (
    <Frame limits={useExactMode ? "Exact layout sends the file to Anker's own converter, which deletes it as soon as the PDF is made. Calibri, Cambria, Arial and Times New Roman documents match Word; other fonts are replaced by the closest one." : "Keeps headings, paragraphs, bold and italic, lists, simple tables and pictures. Does not reproduce headers and footers, columns, text boxes or exact fonts."} selfTest={selfTest} local={!useExactMode}>
      <ModePicker exact={exact} mode={mode} setMode={setMode} exactText="Headers, footers, columns, tables and fonts as in Word. The file goes to Anker's converter and is deleted straight after. Up to 25 MB." browserText="Nothing leaves your computer. Text, headings, lists, simple tables and pictures; no headers, footers or columns." />
      <label className="block text-sm font-medium">Word document ({useExactMode ? ".docx, .doc, .odt, .rtf" : ".docx"})
        <input type="file" accept={useExactMode ? ".docx,.doc,.odt,.rtf" : ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"} disabled={busy} className="mt-2 block w-full text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f) }} />
      </label>
      {busy && <p className="mt-3 text-sm text-muted-foreground">Converting…</p>}
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      {out && <Download file={out.file} note={out.pages ? `${out.pages} page${out.pages === 1 ? "" : "s"}${out.images ? `, ${out.images} picture${out.images === 1 ? "" : "s"}` : ""}.` : "Converted with the exact-layout converter."} />}
    </Frame>
  )
}

// ── PDF to Word ─────────────────────────────────────────────────────────

export function PdfToWordTool() {
  const exact = useExact()
  const [mode, setMode] = useState<Mode>("exact")
  const useExactMode = !!exact?.available && mode === "exact"
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [out, setOut] = useState<{ file: File; pages: number; paragraphs: number } | null>(null)

  async function run(f: File) {
    setBusy(true); setError(null); setOut(null)
    try {
      if (useExactMode) { setProgress("Converting on the server, this can take up to a minute for a long document…"); const file = await convertExact(f, "pdf-to-word", exact!.prefix); setOut({ file, pages: 0, paragraphs: 0 }) }
      else setOut(await pdfToWord(f, (p, n) => setProgress(`Page ${p} of ${n}…`)))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false); setProgress(null) }
  }
  async function selfTest() {
    const { PDFDocument, StandardFonts } = await import("pdf-lib")
    const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); const fb = await d.embedFont(StandardFonts.HelveticaBold)
    const p = d.addPage([595, 842])
    p.drawText("Investment Memo", { x: 56, y: 780, size: 24, font: fb })
    ;["The company sells software to hospitals and", "has two signed pilots this year."].forEach((t, i) => p.drawText(t, { x: 56, y: 740 - i * 15, size: 11, font: f }))
    p.drawText("- Founders hold the patent", { x: 56, y: 690, size: 11, font: f })
    p.drawText("- Pilots start in March", { x: 56, y: 675, size: 11, font: f })
    const r = await pdfToWord(new File([(await d.save()) as BlobPart], "memo.pdf", { type: "application/pdf" }))
    const mammoth = await import("mammoth")
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await r.file.arrayBuffer() })
    const checks = { heading: /<h1[^>]*>Investment Memo/.test(html), joinedParagraph: html.includes("hospitals and has two signed pilots"), list: /<li>[^<]*Founders hold the patent/.test(html) }
    const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k)
    return bad.length ? `FAIL: ${bad.join(", ")}. Got: ${html.slice(0, 200)}` : `PASS: heading, joined paragraph and bullet list recovered (${humanBytes(r.file.size)}).`
  }

  return (
    <Frame limits={useExactMode ? "Exact layout keeps every line where it sits on the page, as positioned text, so it looks like the PDF but is awkward to re-flow when you edit. Scanned pages come through as pictures (no OCR)." : "Recovers the text in reading order with headings and lists. It does not rebuild the page layout, and cannot read a scanned PDF or a deck made of images (that needs OCR)."} selfTest={selfTest} local={!useExactMode}>
      <ModePicker exact={exact} mode={mode} setMode={setMode} exactText="Looks like the PDF: text boxes placed where they are on each page. Harder to edit as flowing text. The file goes to Anker's converter and is deleted straight after. Up to 25 MB." browserText="Nothing leaves your computer. Clean, editable text in reading order with headings and lists; no page layout." />
      <label className="block text-sm font-medium">PDF
        <input type="file" accept="application/pdf,.pdf" disabled={busy} className="mt-2 block w-full text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f) }} />
      </label>
      {progress && <p className="mt-3 text-sm text-muted-foreground">{progress}</p>}
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      {out && <Download file={out.file} note={out.pages ? `${out.pages} page${out.pages === 1 ? "" : "s"}, ${out.paragraphs} paragraphs of text recovered.` : "Converted with the exact-layout converter."} />}
    </Frame>
  )
}
