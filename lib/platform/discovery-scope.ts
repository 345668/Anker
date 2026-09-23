/**
 * Who is asking, and which lens they may use (docs/architecture/12 §6).
 *
 * Founder and fund workspaces come from the active membership. LPs have no
 * workspace: they are the people a GP attached to a fund, so LP access is
 * checked against those memberships.
 */
import { createClient } from "@/lib/supabase/server"
import { requireWorkspace, WorkspaceError } from "@/lib/auth/workspace-context"
import { getLpMembershipsForUser } from "@/lib/portfolio/data-room"
import type { DiscoveryScope } from "./discovery"

export async function discoveryScope(): Promise<DiscoveryScope> {
  try {
    const ws = await requireWorkspace()
    if (ws.persona === "founder" || ws.persona === "vc") return { orgId: ws.orgId, persona: ws.persona, userId: ws.userId }
  } catch (e) {
    if (e instanceof WorkspaceError && e.status === 401) throw e
  }
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) throw new WorkspaceError("Sign in to continue.", 401)
  const { memberships } = await getLpMembershipsForUser(user.email ?? "")
  if (memberships.length) return { orgId: null, persona: "lp", userId: user.id }
  throw new WorkspaceError("Select a workspace to browse the directory.", 403)
}
