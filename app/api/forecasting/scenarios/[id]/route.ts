/**
 * DELETE /api/forecasting/scenarios/[id] — remove one of the user's saved scenarios.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { deleteScenario } from "@/lib/forecasting/scenarios"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { id } = await ctx.params
  const removed = await deleteScenario(user.id, id)
  return NextResponse.json({ ok: removed })
}
