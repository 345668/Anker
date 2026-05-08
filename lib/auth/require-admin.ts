/**
 * Admin guard for server-side handlers.  Returns the user when they
 * are an admin; throws/returns 401 otherwise.  Centralised here so
 * every admin route uses the same check.
 *
 * Recognised admins:
 *   1. Email is in ADMIN_EMAILS (lib/auth/admin.ts).
 *   2. user.user_metadata.role === 'admin' (Supabase metadata).
 *
 * Both checks are belt-and-braces; either grants access.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
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
  if (meta.role === "admin" || isAdmin(user.email)) {
    return { id: user.id, email: user.email ?? null, metadata: meta }
  }
  return NextResponse.json({ error: "Admin only" }, { status: 403 })
}

/** Server-component helper: returns true / false. */
export async function isAdminUser(): Promise<{ isAdmin: boolean; userId: string | null; email: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isAdmin: false, userId: null, email: null }
  const meta = (user.user_metadata ?? {}) as Record<string, any>
  return {
    isAdmin: meta.role === "admin" || isAdmin(user.email),
    userId: user.id,
    email: user.email ?? null,
  }
}
