/**
 * Pipeline stage update endpoint.
 *
 * Patches a firm or contact match's `stage` plus optional notes/owner/
 * commitment_amount. Writes an audit trail row to `lp_match_audit`.
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/matching/v2"

interface PatchBody {
  matchId: string
  matchType: "firm" | "contact"
  stage?: PipelineStage
  notes?: string
  owner?: string
  commitmentAmount?: number
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const body = (await req.json()) as PatchBody

    if (!body.matchId || !body.matchType) {
      return NextResponse.json({ error: "matchId and matchType required" }, { status: 400 })
    }
    if (body.stage && !PIPELINE_STAGES.includes(body.stage)) {
      return NextResponse.json({ error: `Invalid stage: ${body.stage}` }, { status: 400 })
    }

    const table = body.matchType === "firm" ? "lp_firm_matches" : "lp_contact_matches"

    // Read current row for audit
    const [current] = await sql.unsafe(`SELECT * FROM ${table} WHERE id = $1 LIMIT 1`, [body.matchId])
    if (!current) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 })
    }
    const prevStage = (current as any).stage ?? "identified"

    // Patch — only set fields that are present in the body
    const sets: string[] = []
    const params: any[] = []
    let p = 1
    if (body.stage) { sets.push(`stage = $${p++}`); params.push(body.stage) }
    if (body.notes !== undefined) { sets.push(`notes = $${p++}`); params.push(body.notes) }
    if (body.owner !== undefined) { sets.push(`owner = $${p++}`); params.push(body.owner) }
    if (body.commitmentAmount !== undefined && body.matchType === "firm") {
      sets.push(`commitment_amount = $${p++}`); params.push(body.commitmentAmount)
    }
    sets.push(`updated_at = NOW()`)
    params.push(body.matchId)

    await sql.unsafe(
      `UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${p}`,
      params,
    )

    // Audit row
    if (body.stage && body.stage !== prevStage) {
      await sql`
        INSERT INTO lp_match_audit (
          id, match_id, match_type, prev_stage, new_stage,
          notes, user_id, created_at
        ) VALUES (
          ${'au_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)},
          ${body.matchId}, ${body.matchType}, ${prevStage}, ${body.stage},
          ${body.notes ?? null}, ${user?.id ?? null}, NOW()
        )
      `
    }

    return NextResponse.json({ ok: true, prevStage, newStage: body.stage ?? prevStage })
  } catch (error: any) {
    console.error("[Stage Update] Error:", error)
    return NextResponse.json({ error: error?.message ?? "Unknown" }, { status: 500 })
  }
}
