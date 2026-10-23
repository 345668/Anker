import { NextRequest, NextResponse } from "next/server"
import { createClient, isLocalMode } from "@/lib/supabase/server"
import { setSessionCookie, verifyUser } from "@/lib/auth/local"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? "").trim().toLowerCase()
    const password = String(body.password ?? "")

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    // Local mode (a local database, never a production deployment): the local users table and a signed session cookie.
    if (isLocalMode) {
      const r = await verifyUser(email, password)
      if (!r.ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
      await setSessionCookie(r.user)
      return NextResponse.json({ user: { id: r.user.id, email: r.user.email, role: r.user.role } })
    }

    // Authenticate against Supabase. The SSR server client sets the sb-* session
    // cookies on success, which the dashboard's getUser() reads.
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      console.error("[sign-in] Supabase error:", error.message)
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    if (!data.user) {
      return NextResponse.json({ error: "Sign-in failed" }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || "founder",
      },
    })
  } catch (e: any) {
    console.error("[sign-in] error:", e)
    return NextResponse.json({ error: e?.message ?? "Sign-in failed" }, { status: 500 })
  }
}
