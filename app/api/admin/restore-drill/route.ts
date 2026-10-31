/**
 * The restore drills, called by SAIL (docs/architecture/59 R4). Portal service principal only. Dates, counts and the per-table comparison; never any row content.
 *   GET -> { drills: [{ startedAt, ageMin, seconds, passed, tablesChecked, tablesOff, offTables, error, branchDeleted }], lastPassedAt, overdueAfterDays }
 */
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { RESTORE_DRILL_MAX_DAYS } from "@/lib/ops/alerts/rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET() {
  const g = await requireAdmin()
  if (g instanceof NextResponse) return g
  if (g.id !== "portal-service") return NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
  try {
    const rows = (await sql`SELECT started_at, branch_age_min, seconds, passed, tables_checked, tables_off, detail FROM restore_drills ORDER BY started_at DESC LIMIT 20`) as any[]
    const drills = rows.map((r) => {
      const d = typeof r.detail === "string" ? JSON.parse(r.detail) : r.detail ?? {}
      return { startedAt: r.started_at, ageMin: r.branch_age_min, seconds: r.seconds, passed: r.passed, tablesChecked: r.tables_checked, tablesOff: r.tables_off, error: d.error ?? null, branchDeleted: d.branchDeleted ?? null,
        offTables: (d.tables ?? []).filter((t: any) => !t.ok).map((t: any) => ({ table: t.table, production: t.prod, restored: t.restored, expected: t.expected })) }
    })
    return NextResponse.json({ drills, lastPassedAt: drills.find((d) => d.passed)?.startedAt ?? null, overdueAfterDays: RESTORE_DRILL_MAX_DAYS })
  } catch (e) { console.error("[admin/restore-drill]", (e as Error)?.message); return NextResponse.json({ error: "The drill record could not be read." }, { status: 503 }) }
}
