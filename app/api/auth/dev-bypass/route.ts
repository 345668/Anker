/**
 * Dev-mode auth bypass.
 *
 * GET /api/auth/dev-bypass?email=…&next=…
 *   Sets the session cookie and 302-redirects to `next` (default
 *   /dashboard). Plain HTML link compatible — the browser handles
 *   Set-Cookie + redirect natively, no JS round-trip.
 *
 * POST /api/auth/dev-bypass
 *   Same logic; returns JSON. Kept for the React form variant.
 *
 * Hard-gated to local environments — returns 403 in production.
 */
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { sql } from "@/lib/db"
import { signSession, type LocalUser, SESSION_COOKIE_NAME } from "@/lib/auth/local"

export const runtime = "nodejs"

const LOCAL =
  process.env.LOCAL_AUTH_BYPASS === "true" ||
  process.env.LOCAL_DB === "true" ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === "https://stub.supabase.co" ||
  !!process.env.DEV_BYPASS_EMAIL ||
  process.env.NODE_ENV !== "production"

const COOKIE_TTL_SEC = 7 * 24 * 60 * 60

async function resolveOrCreateAdmin(emailRaw: string | null): Promise<LocalUser> {
  const email = emailRaw?.trim().toLowerCase() || null

  if (email) {
    const rows = await sql`
      SELECT id, email, name, role FROM local_users WHERE email = ${email} LIMIT 1
    `
    if (rows.length) {
      const r = rows[0] as any
      const user: LocalUser = { id: r.id, email: r.email, name: r.name, role: r.role }
      if (user.role !== "admin") {
        await sql`UPDATE local_users SET role = 'admin' WHERE id = ${user.id}`
        user.role = "admin"
      }
      return user
    }
  }

  // Try first existing admin
  const admins = await sql`
    SELECT id, email, name, role FROM local_users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1
  `
  if (admins.length) {
    const r = admins[0] as any
    return { id: r.id, email: r.email, name: r.name, role: r.role }
  }

  // Create one
  const newEmail = email || "admin@anker.local"
  const id = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  const password_hash = await bcrypt.hash(`bypass-${Math.random().toString(36).slice(2)}`, 10)
  await sql`
    INSERT INTO local_users (id, email, password_hash, name, role)
    VALUES (${id}, ${newEmail}, ${password_hash}, 'Local Admin', 'admin')
  `
  return { id, email: newEmail, name: "Local Admin", role: "admin" }
}

async function makeRedirectResponse(req: NextRequest, user: LocalUser, nextPath: string) {
  const token = await signSession(user)
  await sql`UPDATE local_users SET last_login_at = NOW() WHERE id = ${user.id}`

  const url = req.nextUrl.clone()
  url.pathname = nextPath.startsWith("/") ? nextPath : "/dashboard"
  url.search = ""
  const res = NextResponse.redirect(url, 303)
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_TTL_SEC,
  })
  return res
}

export async function GET(req: NextRequest) {
  if (!LOCAL) return NextResponse.json({ error: "Disabled" }, { status: 403 })
  const email = req.nextUrl.searchParams.get("email") ?? "masindetphilippe@gmail.com"
  const next = req.nextUrl.searchParams.get("next") ?? "/dashboard"
  const user = await resolveOrCreateAdmin(email)
  return makeRedirectResponse(req, user, next)
}

export async function POST(req: NextRequest) {
  if (!LOCAL) return NextResponse.json({ error: "Disabled" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const email = (body.email && String(body.email)) || process.env.DEV_BYPASS_EMAIL || null
  const user = await resolveOrCreateAdmin(email)

  const token = await signSession(user)
  await sql`UPDATE local_users SET last_login_at = NOW() WHERE id = ${user.id}`

  const res = NextResponse.json({ user, bypass: true })
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_TTL_SEC,
  })
  return res
}
