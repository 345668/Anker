import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sql } from "@/lib/db"
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

    const email = String(body.email ?? "").trim().toLowerCase()
    const password = String(body.password ?? "")
    const name = body.name ? String(body.name).trim() : ""
    const role = body.role === "vc" ? "vc" : "founder"

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    // Create the account in Supabase Auth with the email pre-confirmed, so the
    // user can sign in immediately (no confirmation email needed). Uses the
    // service-role Admin API.
    const admin = createAdminClient()
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name || undefined,
        first_name: name ? name.split(" ")[0] : undefined,
        last_name: name ? name.split(" ").slice(1).join(" ") || undefined : undefined,
        role,
      },
    })

    if (createErr) {
      // Supabase returns a 422 for an already-registered email.
      const msg = /already been registered|already registered|exists/i.test(createErr.message)
        ? "An account with that email already exists"
        : createErr.message
      const status = /already/i.test(msg) ? 409 : 400
      return NextResponse.json({ error: msg }, { status })
    }

    // Mirror into the Neon `profiles` table (keyed by the Supabase user id) for
    // downstream code that reads profiles. Best-effort — don't fail signup on it.
    const userId = created.user?.id
    if (userId) {
      try {
        await sql`
          INSERT INTO profiles (id, email, full_name)
          VALUES (${userId}, ${email}, ${name || null})
          ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name
        `
      } catch (e) {
        console.error("[sign-up] profiles mirror failed:", e)
      }
    }

    // Establish the session (sets sb-* cookies) using the SSR server client.
    const supabase = await createClient()
    const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr || !signIn.user) {
      // Account was created but session couldn't be established — the user can
      // still sign in from the login page.
      return NextResponse.json({
        user: { id: created.user?.id, email: created.user?.email, role },
        note: "Account created. Please sign in.",
      })
    }

    return NextResponse.json({
      user: {
        id: signIn.user.id,
        email: signIn.user.email,
        role: signIn.user.user_metadata?.role || role,
      },
    })
  } catch (e: any) {
    console.error("[sign-up] error:", e)
    return NextResponse.json({ error: e?.message ?? "Sign-up failed" }, { status: 500 })
  }
}
