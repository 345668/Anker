import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getMemberships, resolveActiveMembership, setActiveOrgCookie } from "@/lib/org/active"

export const runtime = "nodejs"

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

/** GET → { activeOrgId, memberships } for the current user. */
export async function GET() {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ activeOrgId: null, memberships: [] })
  const { active, all } = await resolveActiveMembership(userId)
  return NextResponse.json({ activeOrgId: active?.orgId ?? null, memberships: all })
}

/** POST { orgId } → switch active workspace (must be a membership of the user). */
export async function POST(req: NextRequest) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  let orgId = ""
  try {
    orgId = String((await req.json())?.orgId ?? "")
  } catch { /* ignore */ }
  const all = await getMemberships(userId)
  if (!all.some((m) => m.orgId === orgId)) {
    return NextResponse.json({ error: "Not a member of that workspace" }, { status: 403 })
  }
  await setActiveOrgCookie(orgId)
  return NextResponse.json({ ok: true, activeOrgId: orgId })
}
