import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership } from "@/lib/org/active"
import { createRaiseRound, updateRaiseTarget, ROUND_CURRENCIES } from "@/lib/fundraising/rounds"

async function mutate(request: NextRequest, update: boolean) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
  const { active } = await resolveActiveMembership(user.id)
  if (active?.persona !== "founder" || active.orgRole === "viewer") return NextResponse.json({ error: "Select a founder workspace you can edit." }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.target !== "number" || !Number.isFinite(body.target) || body.target < 0 || body.target > 1e12) return NextResponse.json({ error: "Enter a valid target between 0 and 1 trillion." }, { status: 400 })
  if (update && (typeof body.id !== "string" || !Number.isInteger(body.revision) || body.revision < 0)) return NextResponse.json({ error: "Reload the round before saving." }, { status: 400 })
  if (!update && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120 || typeof body.boardId !== "string" || !ROUND_CURRENCIES.includes(body.currency))) return NextResponse.json({ error: "Enter a round name, board and supported currency." }, { status: 400 })
  try {
    const round = update
      ? await updateRaiseTarget(user.id, active.orgId, body.id, body.target, body.revision)
      : await createRaiseRound(user.id, active.orgId, { name: body.name.trim(), boardId: body.boardId, target: body.target, currency: body.currency })
    if (!round) return NextResponse.json({ error: update ? "This round changed or is unavailable. Reload before trying again." : "This board is unavailable or already belongs to a round." }, { status: 409 })
    return NextResponse.json({ round })
  } catch {
    return NextResponse.json({ error: "The round could not be saved. Please try again." }, { status: 503 })
  }
}
export const POST = (request: NextRequest) => mutate(request, false)
export const PATCH = (request: NextRequest) => mutate(request, true)
