/**
 * GET /api/linkedin/inbox — list conversations (dashboard-facing).
 *   ?unread=1&campaignId=…  → { ok, conversations, counts }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { listConversations, inboxCounts } from "@/lib/linkedin/inbox"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const url = new URL(req.url)
  const [conversations, counts] = await Promise.all([
    listConversations(auth.id, {
      unreadOnly: url.searchParams.get("unread") === "1",
      campaignId: url.searchParams.get("campaignId") || undefined,
    }),
    inboxCounts(auth.id),
  ])
  return NextResponse.json({ ok: true, conversations, counts })
}
