import { NextRequest, NextResponse } from "next/server"
import { setSessionCookie, verifyUser } from "@/lib/auth/local"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await verifyUser(String(body.email ?? ""), String(body.password ?? ""))
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 })
    }
    await setSessionCookie(result.user)
    // Update last_login_at
    await sql`UPDATE local_users SET last_login_at = NOW() WHERE id = ${result.user.id}`
    return NextResponse.json({ user: result.user })
  } catch (e: any) {
    console.error("[sign-in] error:", e)
    return NextResponse.json({ error: e?.message ?? "Sign-in failed" }, { status: 500 })
  }
}
