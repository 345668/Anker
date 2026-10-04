/**
 * Exact-layout document conversion through the doc worker (LibreOffice). docs/architecture/40.
 *   GET  /api/tools/convert              { available } so the page knows whether to offer it
 *   POST /api/tools/convert              { direction: "word-to-pdf" | "pdf-to-word", blobUrl, filename }
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

export async function GET() {
  let scopeKey: string
  try { scopeKey = (await requireAiPrincipal()).scopeKey } catch { return NextResponse.json({ error: "Not signed in" }, { status: 401 }) }
  // The prefix is the caller's own upload folder; the token route re-derives it, so a forged one is refused.
  return NextResponse.json({ available: isDocWorkerConfigured(), prefix: convertPrefix(scopeKey) })
}

export async function POST(req: NextRequest) {
  let scopeKey: string
  try { scopeKey = (await requireAiPrincipal()).scopeKey } catch (e) {
    if (e instanceof WorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }
  const rl = rateLimit(`tools-convert:${scopeKey}`, { limit: 20, windowMs: 60 * 60_000 })
  if (!rl.ok) return rateLimitResponse(rl)
  if (!isDocWorkerConfigured()) return NextResponse.json({ error: "The exact-layout converter is not set up on this deployment." }, { status: 501 })

  const b = await req.json().catch(() => ({}))
  const plan = planConvert(b?.direction, b?.filename)
  if ("error" in plan) return NextResponse.json({ error: plan.error }, { status: 400 })
  if (!isConvertBlobUrl(b?.blobUrl, scopeKey)) return NextResponse.json({ error: "That upload is not valid. Please attach the file again." }, { status: 400 })

  const bytes = await readBlobBytes(b.blobUrl)
  // The upload has done its job whatever happens next: do not leave a customer's document in storage.
  const cleanup = async () => { try { const { del } = await import("@vercel/blob"); await del(b.blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }) } catch { /* swept later */ } }
  if (!bytes) return NextResponse.json({ error: "The uploaded file could not be found. Please attach it again." }, { status: 400 })
  if (bytes.length > CONVERT_MAX_BYTES) { await cleanup(); return NextResponse.json({ error: "The file is over 25 MB." }, { status: 413 }) }

  const out = await convertViaDocWorker(bytes, `input.${plan.ext}`, plan.format)
  await cleanup()
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status })
  const base = String(b.filename).replace(/\.[^.]+$/, "").replace(/[^\w.\- ]/g, "_").slice(0, 100) || "document"
  const ext = plan.format
  return new Response(out.response.body, { status: 200, headers: {
    "Content-Type": out.response.headers.get("content-type") ?? (ext === "pdf" ? "application/pdf" : "application/octet-stream"),
    "Content-Disposition": `attachment; filename="${base}.${ext}"`, "Cache-Control": "private, no-store",
  } })
}
