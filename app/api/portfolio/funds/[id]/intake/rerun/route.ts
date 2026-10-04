/** POST /api/portfolio/funds/[id]/intake/rerun { submissionId } — assess an existing submission again under the current config. */
import { NextRequest, NextResponse } from "next/server"
import { requireFundAccess } from "@/lib/auth/fund-access"
import { rerunSubmission } from "@/lib/intake/store"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireFundAccess((await ctx.params).id)
  if (guard instanceof NextResponse) return guard
  const b = await req.json().catch(() => ({}))
  if (typeof b?.submissionId !== "string") return NextResponse.json({ error: "submissionId required" }, { status: 400 })
  return NextResponse.json(await rerunSubmission(b.submissionId, guard.fund.id))
}
