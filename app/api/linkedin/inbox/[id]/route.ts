/**
 * /api/linkedin/inbox/[id] — one conversation (dashboard-facing).
 *   GET   → { ok, conversation, messages }
 *   PATCH → { ok }   { unread: boolean }   local read/unread toggle
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { getConversation, setConversationRead } from "@/lib/linkedin/inbox"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const data = await getConversation(auth.id, id)
  if (!data) return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 })
  return NextResponse.json({ ok: true, ...data })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const ok = await setConversationRead(auth.id, id, body.unread === true)
  if (!ok) return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
