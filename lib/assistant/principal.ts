import { createClient } from "@/lib/supabase/server"
import { getMemberships, resolveActiveMembership } from "@/lib/org/active"
import { getLpMembershipsForEmail } from "@/lib/portfolio/data-room"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { currentAiContext, type AiPrincipal } from "./context"

export async function resolveAiPrincipal(userId: string, options: {
  orgId?: string | null; verifiedEmail?: string; readonly?: boolean; tools?: string[] | null
} = {}): Promise<AiPrincipal> {
  if (!userId) throw new WorkspaceError("Sign in to continue.", 401)
  // A token-bound workspace may never silently fall back to a cookie or another org.
  const membership = options.orgId !== undefined
    ? (await getMemberships(userId)).find(m => m.orgId === options.orgId) ?? null
    : (await resolveActiveMembership(userId)).active
  if (options.orgId !== undefined && !membership) throw new WorkspaceError("Workspace access denied.")
  const lpMemberships = options.verifiedEmail && (!membership || membership.persona === "lp")
    ? await getLpMembershipsForEmail(options.verifiedEmail) : []
  const persona = membership?.persona ?? (!membership && lpMemberships.length ? "lp" : null)
  if (!persona || !["founder","vc","lp"].includes(persona) || (persona === "founder" && membership?.kind !== "company") || (persona === "vc" && membership?.kind !== "fund")) {
    throw new WorkspaceError("Select a company, fund or investor workspace to use Anker AI.")
  }
  const readonly = !!options.readonly
  return {userId, orgId:membership?.orgId ?? null, scopeKey:membership ? `org:${membership.orgId}` : `lp:${userId}`,
    persona, membership, lpMemberships:persona === "lp" ? lpMemberships : [], readonly, allowedTools:options.tools ?? null,
    canWrite:!readonly && persona !== "lp" && !!membership && ["workspace_owner","admin","member"].includes(membership.orgRole)}
}
export async function requireAiPrincipal() {
  const bound = currentAiContext()?.principal
  if (bound) return bound
  const client = await createClient()
  const {data:{user},error} = await client.auth.getUser()
  if (error || !user) throw new WorkspaceError("Sign in to continue.",401)
  return resolveAiPrincipal(user.id, {verifiedEmail:user.email_confirmed_at ? user.email : undefined})
}
