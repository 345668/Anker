/**
 * Admin guard for server-side handlers.  Returns the user when they
 * are an admin; throws/returns 401 otherwise.  Centralised here so
 * every admin route uses the same check.
 *
 * Recognised admins:
 *   1. Email is in ADMIN_EMAILS (lib/auth/admin.ts).
 *   2. user.user_metadata.role === 'admin' (Supabase metadata).
 *   3. users.is_admin === true in the database.
 *
 * Any check grants access.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { isAdmin } from "./admin"

export type AdminUser = {
  id: string
  email: string | null
  metadata: Record<string, any>
}

/** Returns the user if admin; otherwise returns a NextResponse to
 *  send back from the route handler. */
export async function requireAdmin(): Promise<AdminUser | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }
  const meta = (user.user_metadata ?? {}) as Record<string, any>
  
  // Check hardcoded list or metadata first
  if (meta.role === "admin" || isAdmin(user.email)) {
    return { id: user.id, email: user.email ?? null, metadata: meta }
  }
  
  // Also check the users table is_admin field
  try {
    const result = await sql`SELECT is_admin FROM users WHERE id = ${user.id} OR email = ${user.email} LIMIT 1`
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isAdmin: false, userId: null, email: null }
  const meta = (user.user_metadata ?? {}) as Record<string, any>
  
  // Check hardcoded list or metadata first
  if (meta.role === "admin" || isAdmin(user.email)) {
    return { isAdmin: true, userId: user.id, email: user.email ?? null }
  }
  
  // Also check the users table is_admin field
  try {
    const result = await sql`SELECT is_admin FROM users WHERE id = ${user.id} OR email = ${user.email} LIMIT 1`
    if (result[0]?.is_admin === true) {
      return { isAdmin: true, userId: user.id, email: user.email ?? null }
    }
  } catch {
    // DB check failed
  }
  
  return { isAdmin: false, userId: user.id, email: user.email ?? null }
}
