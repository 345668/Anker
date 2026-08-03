import { NextRequest, NextResponse } from "next/server"
import { createUser, setSessionCookie } from "@/lib/auth/local"
import { SIGNUPS_ENABLED, SIGNUPS_CLOSED_MESSAGE, SIGNUP_REQUIRES_INVITE, SIGNUP_INVITE_REQUIRED_MESSAGE } from "@/lib/auth/signups"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  // Registration kill-switch — reject all new accounts when sign-ups are closed.
  if (!SIGNUPS_ENABLED) {
    return NextResponse.json({ error: SIGNUPS_CLOSED_MESSAGE }, { status: 403 })
  }

  try {
    const body = await req.json()

    // Invite-only: require a valid token matching the SIGNUP_INVITE_CODE secret.
    // Fails closed — if no code is configured, nobody can register.
    if (SIGNUP_REQUIRES_INVITE) {
      const code = (process.env.SIGNUP_INVITE_CODE || "").trim()
      const invite = String(body.invite ?? "").trim()
      if (!code || invite !== code) {
        return NextResponse.json({ error: SIGNUP_INVITE_REQUIRED_MESSAGE }, { status: 403 })
      }
    }

    const result = await createUser({
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      name: body.name ? String(body.name) : undefined,
      role: body.role === "vc" ? "vc" : "founder",
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    await setSessionCookie(result.user)
    return NextResponse.json({ user: result.user })
  } catch (e: any) {
    console.error("[sign-up] error:", e)
    return NextResponse.json({ error: e?.message ?? "Sign-up failed" }, { status: 500 })
  }
}
