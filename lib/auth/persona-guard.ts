import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership, type Persona } from "@/lib/org/active"
import { isOwner } from "@/lib/auth/admin"

/**
 * Server-side persona route guard. Call from a layout/page for a persona-scoped
 * area. Owners can preview navigation; other users must have a workspace persona. A persona not in `allowed` is redirected to
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
  if (!user) redirect("/auth/login")
  if (isOwner(user.email)) return

  const { active } = await resolveActiveMembership(user.id)
  const persona = active?.persona ?? null
  if (persona === null) redirect("/onboarding")
  if (allowed.includes(persona)) return

  redirect(persona === "lp" ? "/lp" : "/dashboard")
}
