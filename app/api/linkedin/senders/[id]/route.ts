/**
 * /api/linkedin/senders/[id] — update + delete a sender (dashboard-facing).
 *
 *   PATCH  → { ok, sender }   partial update (status, caps, hours, notes…)
 *   DELETE → { ok }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { updateSender, deleteSender } from "@/lib/linkedin/senders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const sender = await updateSender(auth.id, id, {
    displayName: body.displayName,
    status: body.status,
    dailyConnectCap: body.dailyConnectCap,
    dailyMessageCap: body.dailyMessageCap,
    workingHoursStart: body.workingHoursStart,
    workingHoursEnd: body.workingHoursEnd,
    timezone: body.timezone,
    notes: body.notes,
  })
  if (!sender) return NextResponse.json({ ok: false, error: "Sender not found" }, { status: 404 })
  return NextResponse.json({ ok: true, sender })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const ok = await deleteSender(auth.id, id)
  if (!ok) return NextResponse.json({ ok: false, error: "Sender not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
