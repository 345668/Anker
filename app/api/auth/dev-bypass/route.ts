/**
 * Dev-mode auth bypass.
 *
 * One-click sign-in as the admin user for local development. Hard-gated to
 * local mode — returns 403 anywhere it shouldn't be reachable (e.g. when
 * deployed to Vercel).
 *
 * The user it signs in as is, in priority order:
 *   1. The email passed in the request body
 *   2. The DEV_BYPASS_EMAIL env var
 *   3. The first row in local_users with role='admin'
 *
 * If no matching user exists, it creates one (email = the provided value
 * or 'admin@anker.local', role = admin) with a random password — so even
 * a brand-new local DB can hit /dashboard in a single click.
 */
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { sql } from "@/lib/db"
import { setSessionCookie, type LocalUser } from "@/lib/auth/local"

export const runtime = "nodejs"

const LOCAL =
  process.env.LOCAL_AUTH_BYPASS === "true" ||
  process.env.LOCAL_DB === "true" ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === "https://stub.supabase.co" ||
  !!process.env.DEV_BYPASS_EMAIL ||
  process.env.NODE_ENV !== "production"

export async function POST(req: NextRequest) {
  if (!LOCAL) {
    return NextResponse.json({ error: "Disabled" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const email =
    (body.email && String(body.email).trim().toLowerCase()) ||
    process.env.DEV_BYPASS_EMAIL?.trim().toLowerCase() ||
    null

  let user: LocalUser | null = null

  if (email) {
    const rows = await sql`
      SELECT id, email, name, role FROM local_users
      WHERE email = ${email} LIMIT 1
    `
    if (rows.length) {
      const r = rows[0] as any
      user = { id: r.id, email: r.email, name: r.name, role: r.role }
    }
  }

  if (!user) {
    // Try first admin
    const admins = await sql`
      SELECT id, email, name, role FROM local_users
      WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1
    `
    if (admins.length) {
      const r = admins[0] as any
      user = { id: r.id, email: r.email, name: r.name, role: r.role }
    }
  }

  if (!user) {
    // Create a fresh admin
    const newEmail = email || "admin@anker.local"
    const id = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    const password_hash = await bcrypt.hash(
      `bypass-${Math.random().toString(36).slice(2)}`,
      10,
    )
    await sql`
      INSERT INTO local_users (id, email, password_hash, name, role)
      VALUES (${id}, ${newEmail}, ${password_hash}, 'Local Admin', 'admin')
    `
    user = { id, email: newEmail, name: "Local Admin", role: "admin" }
  }

  // Promote target email to admin if it wasn't already (so the bypass
  // is idempotent and reliable for the requested account)
  if (user.role !== "admin") {
    await sql`UPDATE local_users SET role = 'admin' WHERE id = ${user.id}`
    user.role = "admin"
  }

  await setSessionCookie(user)
  await sql`UPDATE local_users SET last_login_at = NOW() WHERE id = ${user.id}`

  return NextResponse.json({ user, bypass: true })
}
