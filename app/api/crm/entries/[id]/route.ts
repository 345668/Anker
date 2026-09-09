/**
 * PATCH  /api/crm/entries/[id]   — partial update. Accepts stage, notes,
 *                                    owner, lastContactedAt, boardId, plus
 *                                    inline-editable display fields (the
 *                                    Excel-style grid edits cells directly).
 * DELETE /api/crm/entries/[id]   — drop a row from the CRM (hard delete).
 *
 * COALESCE semantics: a field that is omitted (undefined → null param) is
 * left untouched.  A field sent as an empty string overwrites with "".
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { recordStageTransition } from "@/lib/matching/outcome-events"
import { resolveActiveMembership } from "@/lib/org/active"

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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json()
    const {
      stage, notes, owner, lastContactedAt, boardId, checkSize,
      displayName, displayTitle, displayEmail, displayLinkedin,
      displayLocation, displayType, displayScore, displayTier, whyMatch,
    } = body ?? {}

    if (checkSize !== undefined && checkSize !== null && (typeof checkSize !== "number" || !Number.isFinite(checkSize) || checkSize < 0 || checkSize > 1e12)) {
      return NextResponse.json({ error: "Enter a valid non-negative check size." }, { status: 400 })
    }
    if (body?.roundId !== undefined) {
      const { active } = await resolveActiveMembership(user.id)
      if (active?.persona !== "founder" || active.orgRole === "viewer") return NextResponse.json({ error: "This workspace cannot edit the round." }, { status: 403 })
      const [scoped] = await sql`SELECT r.id FROM fundraising_rounds r JOIN crm_entries e ON e.board_id = r.board_id AND e.user_id = r.user_id
        WHERE r.id = ${body.roundId} AND r.user_id = ${user.id} AND r.org_id = ${active.orgId} AND e.id = ${id}`
      if (!scoped) return NextResponse.json({ error: "This investor is no longer in the selected round. Reload the page." }, { status: 409 })
    }

    if (stage !== undefined && !ALLOWED_STAGES.includes(stage)) {
      return NextResponse.json({ error: `invalid stage: ${stage}` }, { status: 400 })
    }

    // displayScore: only update when a finite number is supplied.
    const scoreParam =
      displayScore === undefined || displayScore === null || Number.isNaN(Number(displayScore))
        ? null
        : Math.round(Number(displayScore))

    // Capture the prior stage before the update so we can log the transition
    // as an outcome event (training data for the ranker). Only when a stage
    // change is actually requested.
    let prevStage: string | null = null
    if (stage !== undefined) {
      const [before] = await sql`
        SELECT stage FROM crm_entries WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
      `
      prevStage = (before as any)?.stage ?? null
    }

    const updated = await sql`
      UPDATE crm_entries SET
        stage              = COALESCE(${stage ?? null}, stage),
        notes              = COALESCE(${notes ?? null}, notes),
        owner              = COALESCE(${owner ?? null}, owner),
        board_id           = COALESCE(${boardId ?? null}, board_id),
        last_contacted_at  = COALESCE(${lastContactedAt ?? null}::timestamptz, last_contacted_at),
        display_name       = COALESCE(${displayName ?? null}, display_name),
        display_title      = COALESCE(${displayTitle ?? null}, display_title),
        display_email      = COALESCE(${displayEmail ?? null}, display_email),
        display_linkedin   = COALESCE(${displayLinkedin ?? null}, display_linkedin),
        display_location   = COALESCE(${displayLocation ?? null}, display_location),
        display_type       = COALESCE(${displayType ?? null}, display_type),
        display_score      = COALESCE(${scoreParam}::int, display_score),
        display_tier       = COALESCE(${displayTier ?? null}, display_tier),
        why_match          = COALESCE(${whyMatch ?? null}, why_match),
        check_size         = CASE WHEN ${checkSize !== undefined} THEN ${checkSize ?? null}::numeric ELSE check_size END,
        updated_at         = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING *
    `
    if (!updated.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Outcome capture (best-effort, non-blocking): log milestone stage moves
    // for the learned ranker.
    const row = updated[0] as any
    await recordStageTransition({
      userId: user.id,
      source: "crm_entry",
      subjectId: id,
      firmId: row.firm_id ?? null,
      investorId: row.investor_id ?? null,
      matchScore: row.display_score ?? null,
      prevStage,
      newStage: row.stage ?? null,
      metadata: { crmSource: row.source ?? null, sourceSessionId: row.source_session_id ?? null },
    })

    return NextResponse.json({ entry: updated[0] })
  } catch (e: any) {
    console.error("[crm/entries PATCH] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const deleted = await sql`
      DELETE FROM crm_entries WHERE id = ${id} AND user_id = ${user.id} RETURNING id
    `
    if (!deleted.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[crm/entries DELETE] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to delete" }, { status: 500 })
  }
}
