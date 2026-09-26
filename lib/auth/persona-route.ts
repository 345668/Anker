import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getMemberships, resolveActiveMembership, type Membership, type Persona } from "@/lib/org/active"
import { isOwner } from "@/lib/auth/admin"
import { WorkspaceError } from "@/lib/auth/workspace-context"

/**
 * Route guard for a persona-prefixed area (`/founder/*`, `/vc/*`, `/lp/*`).
 * Doc: docs/architecture/02-persona-exclusive-routing.md §2.
 *
 * This is deliberately NOT `requirePersona()` from ./persona-guard, which
 * redirects a mismatched persona to its own home. Doc 02 is explicit that a
 * redirect is the exact thing to avoid:
 *
 *   > A VC who follows a stale link to /founder/crm should be told the page does
 *   > not exist for them, not silently deposited in /vc/crm — which would leave
 *   > them looking at a different entity than the one they asked for, with the URL
 *   > quietly rewritten.
 *
 * So: **404 on mismatch**, and return the scope for the requested persona when the
 * user has one.
 *
 * `requirePersona()` keeps its redirect behaviour for the shared `/dashboard/*`
 * pages, where there is no persona in the URL to contradict.
 *
 * ── On "switch the active workspace and render" ──────────────────────────────
 *
 * Doc 02 also wants a user who asks for `/founder/crm` while a VC workspace is
 * active to be switched rather than refused. It cannot be done by writing the
 * `anker_org` cookie here: a React Server Component render may not set cookies,
 * only a Server Action, Route Handler or proxy may. Rather than force a redirect
 * through a handler on every page load, this resolves the membership for the
 * requested persona **directly** and ignores the cookie when it points elsewhere.
 * The page is then correct whatever the cookie says, and aligning the cookie is
 * left to the proxy when doc 02 lands in full.
 */
export type PersonaScope = {
  userId: string
  orgId: string
  name: string
  persona: Persona
  kind: Membership["kind"]
  role: string
  canWrite: boolean
  canSendOutreach: boolean
  /** True when the active-workspace cookie names a different workspace. */
  switchedFromActive: boolean
}

function scopeFrom(userId: string, m: Membership, switched: boolean, write: boolean): PersonaScope {
  const canWrite = ["workspace_owner", "admin", "member"].includes(m.orgRole) && m.persona !== "lp"
  if (write && !canWrite) throw new WorkspaceError("This workspace is read-only.")
  return {
    userId,
    orgId: m.orgId,
    name: m.name,
    persona: m.persona as Persona,
    kind: m.kind,
    role: m.orgRole,
    canWrite,
    canSendOutreach: canWrite && m.canSendOutreach,
    switchedFromActive: switched,
  }
}

/**
 * Resolve the caller's workspace for `persona`, or 404.
 *
 * Owners are not exempted. `requirePersona()` lets an owner through any persona
 * area for navigation preview, but this function returns a *workspace scope* that
 * reads and writes records — and doc 04's owner model firewalls the platform owner
 * from tenant records. An owner with no founder workspace of their own gets the
 * same 404 as anyone else rather than a scope pointing at someone else's data.
 */
export async function requirePersonaWorkspace(persona: Persona, write = false): Promise<PersonaScope> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { active } = await resolveActiveMembership(user.id)
  if (active?.persona === persona) return scopeFrom(user.id, active, false, write)

  const all = await getMemberships(user.id)
  const match = all.find((m) => m.persona === persona)
  if (!match) notFound()

  return scopeFrom(user.id, match, true, write)
}

/** True when the caller could open this persona's area at all. For nav. */
export async function hasPersonaWorkspace(persona: Persona): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  if (isOwner(user.email)) return true
  const all = await getMemberships(user.id)
  return all.some((m) => m.persona === persona)
}
