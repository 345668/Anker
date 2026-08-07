import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

/**
 * Onboarding step persistence.
 *
 * UX-branch stub: accepts each step's data and acks. Real persistence
 * (profiles.account_type, organizations, memberships, per-step seeding) lands
 * with the migrations in the implementation plan §10/§14 — wired here without
 * changing this contract. Best-effort attaches the current user id when signed
 * in; never fails the flow.
 */
export async function POST(req: NextRequest) {
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch {
    // not signed in (e.g. preview) — fine, onboarding UX still runs
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* ignore */
  }

  const accountType = body?.account_type === "vc" ? "vc" : body?.account_type === "founder" ? "founder" : null

  return NextResponse.json({
    ok: true,
    userId,
    accountType,
    step: typeof body?.step === "number" ? body.step : null,
    completed: !!body?.completed,
  })
}
