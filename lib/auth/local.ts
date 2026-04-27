/**
 * Local-mode auth: bcrypt password hashing + JWT session cookies.
 *
 * Used when running without Supabase (the typical local-Postgres / PGlite
 * setup). Production swap-in: keep these helpers and just add a SIWE/SAML
 * provider or point the SignIn form at Supabase.
 *
 * Cookie:    `anker_session`  (HttpOnly, SameSite=Lax, Secure in prod)
 * Algorithm: HS256, signed with SECRET_KEY from .env
 * Payload:   { sub, email, name, role }
 * TTL:       7 days
 */

import bcrypt from "bcryptjs"
import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"
import { sql } from "@/lib/db"

const COOKIE_NAME = "anker_session"
const COOKIE_TTL_SEC = 7 * 24 * 60 * 60
const ALG = "HS256"

let _key: Uint8Array | null = null
function key(): Uint8Array {
  if (_key) return _key
  const secret = process.env.SECRET_KEY
  if (!secret) {
    throw new Error("SECRET_KEY env var is required for local auth (used as JWT signing key).")
  }
  _key = new TextEncoder().encode(secret)
  return _key
}

export interface LocalUser {
  id: string
  email: string
  name: string | null
  role: "founder" | "vc" | "admin"
}

export interface SessionPayload {
  sub: string
  email: string
  name: string | null
  role: "founder" | "vc" | "admin"
}

// ─── Sign up ────────────────────────────────────────────────────────────────
export async function createUser(args: {
  email: string
  password: string
  name?: string
  role?: "founder" | "vc"
}): Promise<{ ok: true; user: LocalUser } | { ok: false; error: string }> {
  const email = args.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Invalid email address" }
  }
  if (!args.password || args.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters" }
  }

  // Check unique email
  const existing = await sql`SELECT id FROM local_users WHERE email = ${email} LIMIT 1`
  if (existing.length) {
    return { ok: false, error: "An account with that email already exists" }
  }

  const id = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  const password_hash = await bcrypt.hash(args.password, 10)
  const name = args.name?.trim() || null
  const role = args.role ?? "founder"

  await sql`
    INSERT INTO local_users (id, email, password_hash, name, role)
    VALUES (${id}, ${email}, ${password_hash}, ${name}, ${role})
  `
  // Mirror into profiles for compatibility with downstream code
  await sql`
    INSERT INTO profiles (id, email, full_name)
    VALUES (${id}, ${email}, ${name})
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name
  `
  return { ok: true, user: { id, email, name, role } }
}

// ─── Sign in ────────────────────────────────────────────────────────────────
export async function verifyUser(
  email: string,
  password: string,
): Promise<{ ok: true; user: LocalUser } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase()
  const rows = await sql`SELECT id, email, password_hash, name, role FROM local_users WHERE email = ${e} LIMIT 1`
  if (!rows.length) return { ok: false, error: "Invalid email or password" }
  const row = rows[0] as any
  const ok = await bcrypt.compare(password, row.password_hash)
  if (!ok) return { ok: false, error: "Invalid email or password" }
  return {
    ok: true,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
    },
  }
}

// ─── Session JWT ────────────────────────────────────────────────────────────
export async function signSession(user: LocalUser): Promise<string> {
  const jwt = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_TTL_SEC}s`)
    .setSubject(user.id)
    .sign(key())
  return jwt
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key())
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: (payload.name as string) ?? null,
      role: (payload.role as SessionPayload["role"]) ?? "founder",
    }
  } catch {
    return null
  }
}

// ─── Cookie helpers (server-only) ───────────────────────────────────────────
export async function setSessionCookie(user: LocalUser): Promise<void> {
  const token = await signSession(user)
  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_TTL_SEC,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  return verifySession(token)
}

export const SESSION_COOKIE_NAME = COOKIE_NAME
