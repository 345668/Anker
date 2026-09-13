import { crmWorkspaceResponse } from "@/lib/crm/workspace"
/**
 * POST /api/twenty/sync
 *   Body: { crmEntryId? } | { all: true, userId?: string, limit?: number }
 *
 * Pushes one or many crm_entries into Twenty.  When `crmEntryId` is
 * supplied, owner OR admin can call.  When `all` is set, admin only.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
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
    const scope = await crmWorkspaceResponse(true)
    if (scope instanceof NextResponse) return scope
    if (!["workspace_owner","admin"].includes(scope.role)) return NextResponse.json({error:"Only workspace owners and admins can export to the connected CRM."},{status:403})
    const body = await req.json().catch(() => ({}))
    const options = {orgId:scope.orgId,actorUserId:scope.userId,limit:Number(body.limit)||undefined}
    if (body.all) return NextResponse.json(await pushAll(options))
    if (body.pull) return NextResponse.json(await pullCrmStages(options))
    if (typeof body.crmEntryId !== "string") return NextResponse.json({error:"Choose a contact or sync the active workspace."},{status:400})
    const [entry] = await sql`SELECT id FROM crm_entries WHERE id=${body.crmEntryId} AND org_id=${scope.orgId}`
    if (!entry) return NextResponse.json({error:"Contact not found in this workspace."},{status:404})
    return NextResponse.json(await pushCrmEntry(body.crmEntryId, options))

  } catch (e: any) {
    console.error("[twenty/sync] error:", e)
    return NextResponse.json({ error: e?.message ?? "sync failed" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ configured: isTwentyConfigured() })
}
