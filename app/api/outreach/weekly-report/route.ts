/**
 * GET /api/outreach/weekly-report?days=7
 *
 * The playbook's weekly reporting view for the signed-in user: sent,
 * opened, replied, meetings, and reply-rate by channel, plus flags for
 * channels under 20% reply rate and replies not actioned within 24h.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { weeklyReport } from "@/lib/outreach/engine"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const daysParam = Number(req.nextUrl.searchParams.get("days") ?? "7")
    const report = await weeklyReport({ userId: user.id, days: Number.isFinite(daysParam) ? daysParam : 7 })
    return NextResponse.json(report)
  } catch (e: any) {
    console.error("[outreach/weekly-report]", e)
    return NextResponse.json({ error: e?.message ?? "Report failed" }, { status: 500 })
  }
}
