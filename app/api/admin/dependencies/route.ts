/**
 * GET /api/admin/dependencies
 *
 * Runs the dependency check from the production runtime and returns it. Admin only (it names what is and is not
 * configured). `?store=1` also writes the result to `dependency_checks`.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { runDependencyChecks } from "@/lib/ops/dependencies"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const report = await runDependencyChecks()
  if (req.nextUrl.searchParams.get("store") === "1") {
    try { await sql`INSERT INTO dependency_checks (trigger, ok, results) VALUES ('manual', ${report.ok}, ${JSON.stringify(report.checks)}::jsonb)` } catch { /* table not there yet */ }
  }
  return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } })
}
