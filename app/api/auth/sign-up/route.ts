import { NextRequest, NextResponse } from "next/server"
import { createUser, setSessionCookie } from "@/lib/auth/local"
import { createClient } from "@/lib/supabase/server"
import { SIGNUPS_ENABLED, SIGNUPS_CLOSED_MESSAGE, isValidInviteCode } from "@/lib/auth/signups"

export const runtime = "nodejs"

// Local mode mirror of lib/supabase/server.ts — when true, accounts live in
// the local users table; otherwise they MUST be created in Supabase Auth,
// because sign-in and the /dashboard middleware authenticate via Supabase.
const LOCAL =
  process.env.LOCAL_AUTH_BYPASS === "true" ||
  process.env.LOCAL_DB === "true" ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === "https://stub.supabase.co"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Registration kill-switch — reject new accounts when sign-ups are closed,
    // unless the request carries a valid invite code (?invite=… links).
    if (!SIGNUPS_ENABLED && !isValidInviteCode(body.invite)) {
      return NextResponse.json({ error: SIGNUPS_CLOSED_MESSAGE }, { status: 403 })
    }

    const email = String(body.email ?? "").trim()
    const password = String(body.password ?? "")
    const name = body.name ? String(body.name) : undefined
    const role = body.role === "vc" ? "vc" : "founder"

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    if (LOCAL) {
      const result = await createUser({ email, password, name, role })
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      await setSessionCookie(result.user)
      return NextResponse.json({ user: result.user })
    }

    // Production path: create a confirmed user in Supabase Auth (the system
    // sign-in and the dashboard middleware check), then sign them in so the
    // SSR client sets the session cookies on this response.
    const adminRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { role, name },
      }),
    })
    const created = await adminRes.json().catch(() => ({}))
    if (!adminRes.ok) {
      const msg: string = created?.msg || created?.message || "Sign-up failed"
      const status = /already|registered|exists/i.test(msg) ? 400 : 500
      return NextResponse.json(
        { error: status === 400 ? "An account with this email already exists" : msg },
        { status },
      )
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      // Account exists but auto-login failed — send them to the login page.
      return NextResponse.json({ user: { id: created.id, email }, requiresLogin: true })
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || role,
      },
    })
  } catch (e: any) {
    console.error("[sign-up] error:", e)
    return NextResponse.json({ error: e?.message ?? "Sign-up failed" }, { status: 500 })
  }
}
