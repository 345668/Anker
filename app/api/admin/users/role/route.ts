/**
 * POST /api/admin/users/role — grant/revoke platform admin on an account.
 * Owner/admin-gated. Body: { userId: string, isAdmin: boolean }.
 * The engine (lib/admin/users.setUserAdmin) enforces the no-self-lockout and
 * owner-immutable guardrails and writes to the audit log.
 */
import { NextResponse } from "next/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { setUserAdmin } from "@/lib/admin/users"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const { isAdmin, userId, email } = await isAdminUser()
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { userId?: string; isAdmin?: boolean }
  if (!body.userId || typeof body.isAdmin !== "boolean") {
    return NextResponse.json({ error: "Provide userId and isAdmin (boolean)." }, { status: 400 })
  }

  const result = await setUserAdmin({
    actorId: userId, actorEmail: email,
    targetUserId: body.userId, makeAdmin: body.isAdmin,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
  return NextResponse.json({ ok: true })
}
