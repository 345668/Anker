/**
 * POST /api/admin/imports
 *   multipart with:
 *     file:  CSV or XLSX
 *     kind:  "firm" | "investor"
 *     source: tag string (e.g. "csv:partner-list-2026")
 *     dry_run: "true" to skip DB writes
 *     default_firm_type:  optional fallback type for firm rows
 *
 * Returns the ImportReport from lib/admin/csv-importer.ts.
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { importCsv } from "@/lib/admin/csv-importer"

export const runtime = "nodejs"
export const maxDuration = 600

const MAX_BYTES = 30 * 1024 * 1024

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    const kind = String(form.get("kind") ?? "").toLowerCase() as "firm" | "investor"
    const source = String(form.get("source") ?? "").trim()
    const dryRun = String(form.get("dry_run") ?? "") === "true"
    const defaultFirmType = String(form.get("default_firm_type") ?? "venture capital")

    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 })
    if (kind !== "firm" && kind !== "investor")
      return NextResponse.json({ error: "kind must be 'firm' or 'investor'" }, { status: 400 })
    if (!source) return NextResponse.json({ error: "source tag required (e.g. csv:partner-list-2026)" }, { status: 400 })
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: `file too large (max ${MAX_BYTES / 1e6}MB)` }, { status: 400 })

    const ab = await file.arrayBuffer()
    const report = await importCsv({
      kind,
      source,
      bytes: new Uint8Array(ab),
      dryRun,
      defaultFirmType,
    })
    return NextResponse.json(report)
  } catch (e: any) {
    console.error("[admin/imports]", e)
    return NextResponse.json({ error: e?.message ?? "import failed" }, { status: 500 })
  }
}
