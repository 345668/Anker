/**
 * GET /api/ai/status
 *
 * Live snapshot of the AI provider chain — used by the on-page
 * AiStatusBadge on Find Investors, LP Matchmaking, and anywhere else
 * that needs to show "which AI is actually answering right now".
 *
 * User-gated (any signed-in user can see their own chain status).  Never
 * returns secrets — only boolean flags + active provider + chain order
 * + the effective model name.
 */
import { NextResponse } from "next/server"
import { getAiStatus } from "@/lib/ai/provider"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const status = await getAiStatus()
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e: any) {
    console.error("[ai/status] error:", e)
    return NextResponse.json({ error: e?.message ?? "status failed" }, { status: 500 })
  }
}
