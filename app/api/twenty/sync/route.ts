/**
 * POST /api/twenty/sync
 *   Body: { crmEntryId? } | { all: true, userId?: string, limit?: number }
 *
 * Pushes one or many crm_entries into Twenty.  When `crmEntryId` is
 * supplied, owner OR admin can call.  When `all` is set, admin only.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { isTwentyConfigured } from "@/lib/twenty/client"
import { pushCrmEntry, pushAll, pullCrmStages } from "@/lib/twenty/sync"

export const runtime = "nodejs"
export const maxDuration = 600

export async function POST(req: NextRequest) {
  try {
    if (!isTwentyConfigured()) {
      return NextResponse.json({
        skipped: true,
        error: "Twenty not configured (TWENTY_BASE_URL + TWENTY_API_KEY).",
      }, { status: 503 })
    }
    const body = await req.json().catch(() => ({}))

    if (body?.all) {
      const guard = await requireAdmin()
      if (guard instanceof NextResponse) return guard
      const out = await pushAll({ userId: body?.userId, limit: Number(body?.limit) || undefined })
      return NextResponse.json(out)
    }
    if (body?.pull) {
      const guard = await requireAdmin()
      if (guard instanceof NextResponse) return guard
      const out = await pullCrmStages({ userId: body?.userId, limit: Number(body?.limit) || undefined })
      return NextResponse.json(out)
    }
    if (!body?.crmEntryId) {
      return NextResponse.json({ error: "crmEntryId or all required" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const [entry] = await sql`SELECT user_id FROM crm_entries WHERE id = ${body.crmEntryId} LIMIT 1`
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    const meta = (user.user_metadata ?? {}) as Record<string, any>
    const isAdmin = meta.role === "admin"
    if (!isAdmin && (entry as any).user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const result = await pushCrmEntry(String(body.crmEntryId))
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[twenty/sync] error:", e)
    return NextResponse.json({ error: e?.message ?? "sync failed" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ configured: isTwentyConfigured() })
}
