/**
 * POST /api/agents/tick
 *   { mode?, limit?, founder? }
 *
 * Cron-style: pull the oldest N entries in `queued` / `contacted` /
 * `responded` and run the agent on each.  Admin-gated (this is a
 * background-worker hook, not a per-user action).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { tick } from "@/lib/agents/outreach-agent"

export const runtime = "nodejs"
export const maxDuration = 600

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  try {
    const body = await req.json().catch(() => ({}))
    const result = await tick({
      mode: body?.mode,
      limit: Number(body?.limit) || undefined,
      userId: body?.userId,
      founder: body?.founder,
      actorUserId: admin.id,
      trigger: body?.trigger === "schedule" ? "schedule" : "tick",
    })
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[agents/tick] error:", e)
    return NextResponse.json({ error: e?.message ?? "tick failed" }, { status: 500 })
  }
}
