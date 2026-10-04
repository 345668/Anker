/**
 * Exact-layout document conversion through the doc worker (LibreOffice). docs/architecture/40.
 *   GET  /api/tools/convert              { available } so the page knows whether to offer it
 *   POST /api/tools/convert              { direction: "word-to-pdf" | "pdf-to-word" | "excel-to-pdf" | "powerpoint-to-pdf", blobUrl, filename, singlePageSheets? }
 * The browser uploads the file straight to private storage (convert-upload); this route reads it, sends it to the worker,
 * streams the result back, and deletes the upload. Signed-in workspace members only, rate limited, 25 MB.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { convertViaDocWorker, isDocWorkerConfigured } from "@/lib/docworker/client"
import { readBlobBytes } from "@/lib/campaign/util"
import { CONVERT_MAX_BYTES, convertPrefix, isConvertBlobUrl, planConvert } from "@/lib/tools/convert-files"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120
const SCAN_MAX_PAGES = 25

export async function GET() {
  let scopeKey: string
  try { scopeKey = (await requireAiPrincipal()).scopeKey } catch { return NextResponse.json({ error: "Not signed in" }, { status: 401 }) }
  // The prefix is the caller's own upload folder; the token route re-derives it, so a forged one is refused.
  return NextResponse.json({ available: isDocWorkerConfigured(), ocr: true, prefix: convertPrefix(scopeKey) })
}

export async function POST(req: NextRequest) {
  let scopeKey: string
  let orgId: string | null = null
  try { const p = await requireAiPrincipal(); scopeKey = p.scopeKey; orgId = p.orgId } catch (e) {
    if (e instanceof WorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }
  if (orgId) {
    try { await (await import("@/lib/entitlements")).assertAllowed(orgId, "convert", "tools") } catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }
  }
  const rl = rateLimit(`tools-convert:${scopeKey}`, { limit: 20, windowMs: 60 * 60_000 })
  if (!rl.ok) return rateLimitResponse(rl)
  const b = await req.json().catch(() => ({}))
  const plan = planConvert(b?.direction, b?.filename)
  if ("error" in plan) return NextResponse.json({ error: plan.error }, { status: 400 })
  const scan = b?.direction === "scan-to-word"
  // Text recognition does not need the document converter; it needs AI, so it is held to the workspace's AI plan and allowance.
  if (!scan && !isDocWorkerConfigured()) return NextResponse.json({ error: "The exact-layout converter is not set up on this deployment." }, { status: 501 })
  if (scan && orgId) {
    try { const e = await import("@/lib/entitlements"); await e.assertAllowed(orgId, "ai", "assistant"); await e.assertWithinLimit(orgId, "ai_spend_usd_month") } catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 403 }) }
  }
  if (!isConvertBlobUrl(b?.blobUrl, scopeKey)) return NextResponse.json({ error: "That upload is not valid. Please attach the file again." }, { status: 400 })

  const bytes = await readBlobBytes(b.blobUrl)
  // The upload has done its job whatever happens next: do not leave a customer's document in storage.
  const cleanup = async () => { try { const { del } = await import("@vercel/blob"); await del(b.blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }) } catch { /* swept later */ } }
  if (!bytes) return NextResponse.json({ error: "The uploaded file could not be found. Please attach it again." }, { status: 400 })
  if (bytes.length > CONVERT_MAX_BYTES) { await cleanup(); return NextResponse.json({ error: "The file is over 25 MB." }, { status: 413 }) }

  if (scan) {
    // Scanned pages: render each to an image and read it with the OCR model. At most SCAN_MAX_PAGES pages, inside the request's time.
    try {
      const { ocrPdfBuffer } = await import("@/lib/ai/pdf-ocr")
      const { scanToDocx } = await import("@/lib/tools/scan-to-docx")
      const ocr = await ocrPdfBuffer(bytes, { maxPages: SCAN_MAX_PAGES, tag: "tools-scan", deadlineAt: Date.now() + 100_000 })
      await cleanup()
      if (ocr.failure === "no_key") return NextResponse.json({ error: "Text recognition is not set up on this deployment." }, { status: 501 })
      if (ocr.failure) return NextResponse.json({ error: "No text could be read from this PDF. It may be blank, protected or too faint." }, { status: 422 })
      const docx = await scanToDocx(ocr.pages.filter((p) => p.ok && p.text).map((p) => ({ page: p.page, text: p.text })), String(b.filename))
      const note = ocr.truncated ? `; only the first ${ocr.pagesAttempted} of ${ocr.pageCount || "?"} pages were read` : ""
      const base = String(b.filename).replace(/\.[^.]+$/, "").replace(/[^\w.\- ]/g, "_").slice(0, 100) || "document"
      return new Response(new Uint8Array(docx), { status: 200, headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${base}.docx"`, "X-Scan-Pages": `${ocr.pagesSucceeded}/${ocr.pageCount}${note}`, "Cache-Control": "private, no-store",
      } })
    } catch { await cleanup(); return NextResponse.json({ error: "Reading the scan failed. Please try again." }, { status: 502 }) }
  }

  // Only spreadsheets take an option: print each sheet on one page instead of splitting a wide sheet across pages.
  const options = b?.direction === "excel-to-pdf" && b?.singlePageSheets === true ? { singlePageSheets: true } : undefined
  const out = await convertViaDocWorker(bytes, `input.${plan.ext}`, plan.format, 110_000, options)
  await cleanup()
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status })
  const base = String(b.filename).replace(/\.[^.]+$/, "").replace(/[^\w.\- ]/g, "_").slice(0, 100) || "document"
  const ext = plan.format
  return new Response(out.response.body, { status: 200, headers: {
    "Content-Type": out.response.headers.get("content-type") ?? (ext === "pdf" ? "application/pdf" : "application/octet-stream"),
    "Content-Disposition": `attachment; filename="${base}.${ext}"`, "Cache-Control": "private, no-store",
  } })
}
