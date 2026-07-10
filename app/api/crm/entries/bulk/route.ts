/**
 * POST /api/crm/entries/bulk — one round-trip for multi-select actions.
 *
 *   { ids: string[], set: { stage?, tier?, boardId?, addTags?, removeTags?, owner? } }
 *
 * Also supports { ids, action: "delete" } for bulk removal.
 * User-scoped; ids are TEXT. Max 500 ids per call.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

const ALLOWED_STAGES = ["queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed"]

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((v: unknown) => typeof v === "string").slice(0, 500) : []
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 })

  if (body.action === "delete") {
    const rows = await sql`
      delete from crm_entries where user_id = ${user.id} and id = any(${ids}) returning id
    ` as Array<{ id: string }>
    return NextResponse.json({ ok: true, deleted: rows.length })
  }

  const set = body.set && typeof body.set === "object" ? body.set : {}
  const stage = typeof set.stage === "string" && ALLOWED_STAGES.includes(set.stage) ? set.stage : null
  const tier = typeof set.tier === "string" ? set.tier.trim().slice(0, 40) || null : null
  const hasTier = "tier" in set
  const boardId = typeof set.boardId === "string" && set.boardId ? set.boardId : null
  const hasBoard = "boardId" in set
  const owner = typeof set.owner === "string" ? set.owner.trim().slice(0, 120) || null : null
  const hasOwner = "owner" in set
  const addTags: string[] = Array.isArray(set.addTags) ? set.addTags.map(String).map((t: string) => t.trim()).filter(Boolean).slice(0, 20) : []
  const removeTags: string[] = Array.isArray(set.removeTags) ? set.removeTags.map(String).map((t: string) => t.trim()).filter(Boolean).slice(0, 20) : []

  if (!stage && !hasTier && !hasBoard && !hasOwner && !addTags.length && !removeTags.length) {
    return NextResponse.json({ error: "Nothing to set" }, { status: 400 })
  }

  const rows = await sql`
    update crm_entries set
      stage        = coalesce(${stage}, stage),
      display_tier = case when ${hasTier} then ${tier} else display_tier end,
      board_id     = case when ${hasBoard} then ${boardId} else board_id end,
      owner        = case when ${hasOwner} then ${owner} else owner end,
      tags = (
        select coalesce(array_agg(distinct t), '{}')
        from unnest(coalesce(tags, '{}') || ${addTags}::text[]) as t
        where not (t = any(${removeTags}::text[]))
      ),
      updated_at   = now()
    where user_id = ${user.id} and id = any(${ids})
    returning id
  ` as Array<{ id: string }>

  return NextResponse.json({ ok: true, updated: rows.length })
}
