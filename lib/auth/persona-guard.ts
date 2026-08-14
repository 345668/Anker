import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership, type Persona } from "@/lib/org/active"
import { isOwner } from "@/lib/auth/admin"

/**
 * Server-side persona route guard. Call from a layout/page for a persona-scoped
 * area. Owners and members with no persona (null) always pass — matching the
 * sidebar's unfiltered-nav rule. A persona not in `allowed` is redirected to
 * its own home so it never lands on another persona's surface by URL.
 *
 * Where each persona is sent when blocked:
 *   lp      → /lp                (the LP portal)
 *   founder → /dashboard         (founder home)
 *   vc      → /dashboard         (GP home)
 */
export async function requirePersona(allowed: Persona[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return // auth is enforced by the dashboard layout already
  if (isOwner(user.email)) return

  const { active } = await resolveActiveMembership(user.id)
  const persona = active?.persona ?? null
  if (persona === null) return // membership-less users keep full access
  if (allowed.includes(persona)) return

  redirect(persona === "lp" ? "/lp" : "/dashboard")
}
