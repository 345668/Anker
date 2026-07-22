/**
 * Signed-in-user guard for server-side handlers. The sibling of
 * requireAdmin() for routes that any authenticated user may call but the
 * public may not — e.g. the AI-heavy analysis + chat endpoints, which each
 * spend real provider tokens per request and must not be an open proxy.
 *
 * Returns the user when a valid session exists; otherwise returns a
 * NextResponse (401) for the route to return directly:
 *
 *   const auth = await requireUser()
 *   if (auth instanceof NextResponse) return auth
 *   // …auth.id is now available
 *
 * Works in both auth modes: createClient() returns the local-JWT shim when
 * LOCAL_AUTH_BYPASS / LOCAL_DB is set and the real Supabase SSR client
 * otherwise, so this needs no mode-specific branching.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export type AuthedUser = {
  id: string
  email: string | null
  metadata: Record<string, any>
}

export async function requireUser(): Promise<AuthedUser | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }
  return {
    id: user.id,
    email: user.email ?? null,
    metadata: (user.user_metadata ?? {}) as Record<string, any>,
  }
}
