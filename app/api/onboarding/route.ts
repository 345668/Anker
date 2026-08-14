import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { saveOnboarding, type Persona } from "@/lib/org/provision"

export const runtime = "nodejs"

/**
 * Onboarding step persistence.
 *
 * Writes persona + profile fields into the existing `users` table (progressive,
 * idempotent) and seeds a workspace (organizations + memberships) on completion.
 * When signed in it persists for real; when there's no session (e.g. an
 * ungated preview) it acks without writing so the UX still runs.
 */
export async function POST(req: NextRequest) {
  let userId: string | null = null
  let email: string | null = null
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id ?? null
    email = user?.email ?? null
  } catch {
    /* not signed in */
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* ignore */
  }

  const persona: Persona | null =
    body?.account_type === "vc" ? "vc" : body?.account_type === "founder" ? "founder" : null

  let persisted = false
  if (userId && persona) {
    try {
      await saveOnboarding({
        userId,
        email,
        persona,
        data: body?.data ?? undefined,
        completed: !!body?.completed,
      })
      persisted = true
    } catch (e: any) {
      console.error("[onboarding] persist failed:", e?.message ?? e)
    }
  }

  return NextResponse.json({
    ok: true,
    persisted,
    signedIn: !!userId,
    accountType: persona,
    step: typeof body?.step === "number" ? body.step : null,
    completed: !!body?.completed,
  })
}
