/**
 * Admin reply-inbox API.
 *
 * GET  /api/admin/inbox?status=pending|classified|actioned|all&limit=N
 *   List inbox rows (admin sees ALL users) + bucket counts.
 *
 * POST /api/admin/inbox
 *   { action: "classify", replyId, founder } — classify a pending reply
 *   { action: "approve",  replyId, markSent? } — mark approved + sync stage
 *   { action: "update",   replyId, draft?, classification?, recommendedStage?, notes? }
 *
 * Admin-gated.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  listInbox, inboxCounts, classifyInboxRow, approveInboxRow, updateInboxDraft,
  type InboxStatus,
} from "@/lib/admin/inbox"

export const runtime = "nodejs"
export const maxDuration = 120

const VALID_STATUS: InboxStatus[] = ["pending", "classified", "actioned", "all"]

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const url = new URL(req.url)
    const status = (url.searchParams.get("status") ?? "all") as InboxStatus
    if (!VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
    }
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100))
    const [rows, counts] = await Promise.all([
      listInbox({ status, limit }),
      inboxCounts({}),
    ])
    return NextResponse.json({ rows, counts })
  } catch (e: any) {
    console.error("[admin/inbox GET]", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json()
    const action = String(body?.action ?? "").toLowerCase()
    const replyId = String(body?.replyId ?? "")
    if (!replyId) return NextResponse.json({ error: "replyId required" }, { status: 400 })

    if (action === "classify") {
      if (!body?.founder?.companyName || !body?.founder?.oneLiner) {
        return NextResponse.json({ error: "founder.companyName + founder.oneLiner required" }, { status: 400 })
      }
      const row = await classifyInboxRow(replyId, body.founder)
      return NextResponse.json({ row })
    }
    if (action === "approve") {
      const row = await approveInboxRow(replyId, { markSent: !!body?.markSent })
      return NextResponse.json({ row })
    }
    if (action === "update") {
      const row = await updateInboxDraft(replyId, {
        draft: typeof body?.draft === "string" ? body.draft : undefined,
        classification: typeof body?.classification === "string" ? body.classification : undefined,
        recommendedStage: typeof body?.recommendedStage === "string" ? body.recommendedStage : undefined,
        notes: typeof body?.notes === "string" ? body.notes : undefined,
      })
      return NextResponse.json({ row })
    }
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e: any) {
    console.error("[admin/inbox POST]", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}
