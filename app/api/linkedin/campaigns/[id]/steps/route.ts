/**
 * PUT /api/linkedin/campaigns/[id]/steps — replace the whole sequence.
 * Body: { steps: [{ actionType, template?, delayHours?, condition? }, …] }
 * → { ok, steps }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { setSteps } from "@/lib/linkedin/campaigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const steps = Array.isArray(body.steps) ? body.steps : []
  try {
    return NextResponse.json({ ok: true, steps: await setSteps(auth.id, id, steps) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to save steps" }, { status: 400 })
  }
}
