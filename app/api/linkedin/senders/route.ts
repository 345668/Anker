/**
 * /api/linkedin/senders — list + create LinkedIn senders (dashboard-facing).
 *
 *   GET  → { ok, senders }   the caller's senders + today's usage
 *   POST → { ok, sender }    create a sender  { displayName, linkedinUrl?, caps…, hours… }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { listSenders, createSender } from "@/lib/linkedin/senders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const senders = await listSenders(auth.id)
  return NextResponse.json({ ok: true, senders })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const body = await req.json().catch(() => ({}))
  try {
    const sender = await createSender(auth.id, {
      displayName: body.displayName,
      linkedinUrl: body.linkedinUrl,
      memberUrn: body.memberUrn,
      avatarUrl: body.avatarUrl,
      dailyConnectCap: body.dailyConnectCap,
      dailyMessageCap: body.dailyMessageCap,
      workingHoursStart: body.workingHoursStart,
      workingHoursEnd: body.workingHoursEnd,
      timezone: body.timezone,
      notes: body.notes,
      warmup: body.warmup,
    })
    return NextResponse.json({ ok: true, sender })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to create sender" }, { status: 400 })
  }
}
