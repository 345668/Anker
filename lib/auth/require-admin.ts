/**
 * Admin guard for server-side handlers.  Returns the user when they
 * are an admin; throws/returns 401 otherwise.  Centralised here so
 * every admin route uses the same check.
 *
 * Recognised admins:
 *   1. Email is in ADMIN_EMAILS (lib/auth/admin.ts).
 *   3. users.is_admin === true in the database.
 *
 * Any check grants access.
 */

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { timingSafeEqual } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { isAdmin } from "./admin"

export type AdminUser = {
  id: string
  email: string | null
  metadata: Record<string, any>
}

/**
 * Service-to-service admin access for the staff portal (SAIL).
 *
 * The portal hosts the UI for tools whose engines live here (AI enrichment,
 * deep research, the reply inbox) and proxies to these admin routes rather than
 * duplicating the AI stack. Those calls carry no Supabase cookie, so they
 * authenticate with a shared bearer instead.
 *
 * Deliberately constrained, because this is a bearer path into EVERY admin
 * route:
 *   • Opt-in — disabled entirely unless PORTAL_SERVICE_TOKEN is set.
 *   • Minimum 32 chars, so a weak value cannot be configured by accident.
 *   • Constant-time comparison.
 *   • Resolves to a synthetic principal, never a real user, so audit entries
 *     read "portal-service" instead of impersonating a person.
 *
 * Keep the token env-only (like CRON_SECRET) and never expose it to a browser.
 */
const PORTAL_PRINCIPAL_ID = "portal-service"

function portalTokenConfigured(): string | null {
  const t = process.env.PORTAL_SERVICE_TOKEN
  return t && t.length >= 32 ? t : null
}

function bearerMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The portal principal when this request carries a valid service bearer. */
async function portalPrincipal(): Promise<AdminUser | null> {
  const expected = portalTokenConfigured()
  if (!expected) return null
  try {
    const h = await headers()
    const m = (h.get("authorization") || "").match(/^Bearer\s+(\S+)$/i)
    if (!m || !bearerMatches(m[1], expected)) return null
    return {
      id: PORTAL_PRINCIPAL_ID,
      // `email` stays null ON PURPOSE. Owner-only routes step up with
      // isOwner(user.email); resolving that from a request header would let
      // anyone holding the service token clear the owner check by claiming an
      // address. The portal therefore reaches admin routes but never
      // owner-only ones — it has its own native MCP-token page and does not
      // need to proxy them.
      email: null,
      // Advisory attribution for audit only, never an authentication factor.
      metadata: {
        role: "admin",
        via: "portal-service",
        portalStaffEmail: h.get("x-portal-staff-email") || null,
      },
    }
  } catch {
    return null
  }
}

/** Returns the user if admin; otherwise returns a NextResponse to
 *  send back from the route handler. */
export async function requireAdmin(): Promise<AdminUser | NextResponse> {
  // Server-to-server first: a portal call carries a bearer, never a cookie.
  const portal = await portalPrincipal()
  if (portal) return portal

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }
  const meta = (user.user_metadata ?? {}) as Record<string, any>
  
  // Only server-controlled sources may grant staff privileges
  if (isAdmin(user.email)) {
    return { id: user.id, email: user.email ?? null, metadata: meta }
  }
  
  // Also check the users table is_admin field
  try {
    const result = await sql`SELECT is_admin FROM users WHERE id = ${user.id} LIMIT 1`
    if (result[0]?.is_admin === true) {
      return { id: user.id, email: user.email ?? null, metadata: meta }
    }
  } catch {
    // DB check failed, fall through to 403
  }
  
  return NextResponse.json({ error: "Admin only" }, { status: 403 })
}

/** Server-component helper: returns true / false. */
export async function isAdminUser(): Promise<{ isAdmin: boolean; userId: string | null; email: string | null }> {
  const portal = await portalPrincipal()
  if (portal) return { isAdmin: true, userId: portal.id, email: portal.email }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isAdmin: false, userId: null, email: null }
  const meta = (user.user_metadata ?? {}) as Record<string, any>
  
  // Only server-controlled sources may grant staff privileges
  if (isAdmin(user.email)) {
    return { isAdmin: true, userId: user.id, email: user.email ?? null }
  }
  
  // Also check the users table is_admin field
  try {
    const result = await sql`SELECT is_admin FROM users WHERE id = ${user.id} LIMIT 1`
    if (result[0]?.is_admin === true) {
      return { isAdmin: true, userId: user.id, email: user.email ?? null }
    }
  } catch {
    // DB check failed
  }
  
  return { isAdmin: false, userId: user.id, email: user.email ?? null }
}
