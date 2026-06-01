/**
 * POST /api/outreach/run-loop
 *
 * Run the singular outreach engine (INGEST → ROUTE → DRAFT → QUEUE) over the
 * signed-in user's scored CRM list. DRAFT-ONLY — nothing is sent. Returns a
 * structured report: ingested, skipped-by-reason, routed-by-channel, drafted,
 * and per-row 7-rule validation.
 *
 * Body:
 *   {
 *     founder: { companyName, oneLiner, facts: string[], calendarUrl?, currency? },
 *     minScore?: number,          // default 35
 *     limit?: number,             // default 25
 *     channelOverride?: "linkedin" | "email",
 *     dedupeWindowDays?: number,  // default 7
 *     force?: boolean
 *   }
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { runOutreachLoop, type FounderBrief } from "@/lib/outreach/engine"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const founder = body?.founder as FounderBrief | undefined
    if (!founder?.companyName || !founder?.oneLiner) {
      return NextResponse.json({ error: "founder.companyName + founder.oneLiner required" }, { status: 400 })
    }
    if (!Array.isArray(founder.facts)) founder.facts = []

    const report = await runOutreachLoop({
      userId: user.id,
      founder,
      minScore: typeof body?.minScore === "number" ? body.minScore : undefined,
      limit: typeof body?.limit === "number" ? body.limit : undefined,
      dedupeWindowDays: typeof body?.dedupeWindowDays === "number" ? body.dedupeWindowDays : undefined,
      channelOverride: body?.channelOverride === "linkedin" || body?.channelOverride === "email" ? body.channelOverride : undefined,
      force: !!body?.force,
      actorUserId: user.id,
    })

    return NextResponse.json(report)
  } catch (e: any) {
    console.error("[outreach/run-loop]", e)
    return NextResponse.json({ error: e?.message ?? "Loop failed" }, { status: 500 })
  }
}
