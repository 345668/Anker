/**
 * GET /api/portfolio/network/export?format=csv|xlsx
 *
 * One-click export of the signed-in admin's captured LinkedIn network —
 * every linkedin_connections row with profile fields, job-change history,
 * and edit metadata. CSV for pipelines, XLSX for humans.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { buildWorkbook, workbookToBuffer, xlsxResponseHeaders } from "@/lib/tools/xlsx-export"

export const runtime = "nodejs"
export const maxDuration = 60

const HEADERS = [
  "name", "linkedin_url", "headline", "company", "title", "location",
  "degree", "summary", "notes", "previous_company", "previous_title",
  "job_changed_at", "captured_at", "updated_at",
]

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  const rows = await sql`
    select full_name, linkedin_url, headline, company, title, location, degree,
           summary, notes, previous_company, previous_title,
           job_changed_at, created_at, updated_at
    from linkedin_connections
    where owner_id = ${guard.id}
    order by full_name asc
    limit 25000
  ` as Array<Record<string, unknown>>

  const data = rows.map((r) => [
    r.full_name, r.linkedin_url ? `https://${r.linkedin_url}` : "", r.headline, r.company,
    r.title, r.location, r.degree, r.summary, r.notes, r.previous_company,
    r.previous_title, iso(r.job_changed_at), iso(r.created_at), iso(r.updated_at),
  ].map((v) => (v == null ? "" : String(v))))

  const stamp = new Date().toISOString().slice(0, 10)
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv"

  if (format === "xlsx") {
    const wb = buildWorkbook([{ name: "Network", rows: [HEADERS, ...data] }])
    const buf = workbookToBuffer(wb)
    return new NextResponse(new Uint8Array(buf), {
      headers: xlsxResponseHeaders(`anker-network-${stamp}.xlsx`),
    })
  }

  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const csv = [HEADERS, ...data].map((row) => row.map(esc).join(",")).join("\n")
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="anker-network-${stamp}.csv"`,
    },
  })
}

function iso(v: unknown): string {
  if (!v) return ""
  try { return new Date(v as string).toISOString().slice(0, 10) } catch { return "" }
}
