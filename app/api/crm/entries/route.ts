/**
 * GET  /api/crm/entries        — list current user's CRM rows.  Optional
 *                                 ?boardId=, ?stage=, ?source= filters.
 *                                 boardId="__none__" returns unassigned rows.
 * POST /api/crm/entries        — add a single entry manually.  Optional
 *                                 boardId assigns it to a board.
 *
 * Stage transitions go through PATCH /api/crm/entries/[id].
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { recordOutcomeEvent, recordStageTransition } from "@/lib/matching/outcome-events"

export const runtime = "nodejs"

const ALLOWED_STAGES = [
  "queued",
  "contacted",
  "responded",
  "meeting",
  "in_diligence",
  "committed",
  "passed",
] as const
type Stage = (typeof ALLOWED_STAGES)[number]

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const url = new URL(req.url)
    const stage = url.searchParams.get("stage")
    const source = url.searchParams.get("source")
    const boardId = url.searchParams.get("boardId")

    let rows: any[]
    if (boardId === "__none__") {
      // Rows not yet assigned to any board.
      rows = await sql`
        SELECT * FROM crm_entries
        WHERE user_id = ${user.id}
          AND board_id IS NULL
          AND (${stage}::text IS NULL OR stage = ${stage})
          AND (${source}::text IS NULL OR source = ${source})
        ORDER BY added_at DESC
      `
    } else {
      // Unified filter: a NULL param means "don't filter on this column".
      rows = await sql`
        SELECT * FROM crm_entries
        WHERE user_id = ${user.id}
          AND (${boardId}::text IS NULL OR board_id = ${boardId})
          AND (${stage}::text   IS NULL OR stage = ${stage})
          AND (${source}::text  IS NULL OR source = ${source})
        ORDER BY added_at DESC
      `
    }

    // Aggregate counts per stage so the UI can render column headers
    // without a second round trip.
    const counts: Record<string, number> = Object.fromEntries(ALLOWED_STAGES.map((s) => [s, 0]))
    for (const r of rows as any[]) counts[r.stage] = (counts[r.stage] ?? 0) + 1

    return NextResponse.json({ entries: rows, counts })
  } catch (e: any) {
    console.error("[crm/entries GET] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to load CRM" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json()
    const {
      source = "manual",
      sourceSessionId = null,
      boardId = null,
      firmId = null,
      investorId = null,
      displayName,
      displayTitle = null,
      displayEmail = null,
      displayLinkedin = null,
      displayLocation = null,
      displayType = null,
      displayScore = null,
      displayTier = null,
      whyMatch = null,
      stage = "queued",
    } = body ?? {}

    if (!displayName) {
      return NextResponse.json({ error: "displayName required" }, { status: 400 })
    }
    if (!ALLOWED_STAGES.includes(stage as Stage)) {
      return NextResponse.json({ error: `invalid stage: ${stage}` }, { status: 400 })
    }

    const inserted = await sql`
      INSERT INTO crm_entries (
        user_id, source, source_session_id, board_id, firm_id, investor_id,
        display_name, display_title, display_email, display_linkedin,
        display_location, display_type, display_score, display_tier, why_match,
        stage, added_at, updated_at
      ) VALUES (
        ${user.id}, ${source}, ${sourceSessionId}, ${boardId}, ${firmId}, ${investorId},
        ${displayName}, ${displayTitle}, ${displayEmail}, ${displayLinkedin},
        ${displayLocation}, ${displayType}, ${displayScore}, ${displayTier}, ${whyMatch},
        ${stage}, NOW(), NOW()
      )
      ON CONFLICT (user_id, source, firm_id, investor_id) DO NOTHING
      RETURNING *
    `

    if (!inserted.length) {
      return NextResponse.json({ alreadyPresent: true }, { status: 200 })
    }

    // Outcome capture (best-effort): a newly promoted entry is a match the
    // engine surfaced — the match_shown baseline for the learned ranker. If
    // it's created already past 'queued', also log that milestone.
    const row = inserted[0] as any
    await recordOutcomeEvent({
      userId: user.id,
      eventType: "match_shown",
      source: "crm_entry",
      subjectId: row.id,
      firmId: row.firm_id ?? null,
      investorId: row.investor_id ?? null,
      matchScore: row.display_score ?? null,
      newStage: row.stage ?? null,
      metadata: { crmSource: row.source ?? null, sourceSessionId: row.source_session_id ?? null },
    })
    if (row.stage && row.stage !== "queued") {
      await recordStageTransition({
        userId: user.id, source: "crm_entry", subjectId: row.id,
        firmId: row.firm_id ?? null, investorId: row.investor_id ?? null,
        matchScore: row.display_score ?? null, prevStage: "queued", newStage: row.stage,
      })
    }

    return NextResponse.json({ entry: inserted[0], created: true }, { status: 201 })
  } catch (e: any) {
    console.error("[crm/entries POST] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to add" }, { status: 500 })
  }
}
