/**
 * GET /api/agents/runs?limit=50&crmEntryId=…
 *   Admin-gated.  Returns the most recent agent_runs rows, optionally
 *   filtered by crm_entry_id.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const url = new URL(req.url)
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50))
    const entryId = url.searchParams.get("crmEntryId")
    const rows = entryId
      ? await sql`
          SELECT r.id, r.crm_entry_id, r.mode, r.trigger, r.steps, r.duration_ms,
                 r.final_stage, r.error, r.started_at, r.finished_at,
                 e.display_name
          FROM agent_runs r
          LEFT JOIN crm_entries e ON e.id = r.crm_entry_id
          WHERE r.crm_entry_id = ${entryId}
          ORDER BY r.started_at DESC
          LIMIT ${limit}`
      : await sql`
          SELECT r.id, r.crm_entry_id, r.mode, r.trigger, r.steps, r.duration_ms,
                 r.final_stage, r.error, r.started_at, r.finished_at,
                 e.display_name
          FROM agent_runs r
          LEFT JOIN crm_entries e ON e.id = r.crm_entry_id
          ORDER BY r.started_at DESC
          LIMIT ${limit}`

    const runs = (rows as any[]).map((r) => ({
      id: r.id,
      crmEntryId: r.crm_entry_id,
      displayName: r.display_name ?? null,
      mode: r.mode,
      trigger: r.trigger,
      steps: typeof r.steps === "string" ? JSON.parse(r.steps) : (r.steps ?? []),
      durationMs: Number(r.duration_ms) || 0,
      finalStage: r.final_stage ?? null,
      error: r.error ?? null,
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
      finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    }))
    return NextResponse.json({ runs })
  } catch (e: any) {
    console.error("[agents/runs GET]", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}
