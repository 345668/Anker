/**
 * Discover — founder and fund-manager lenses (docs/architecture/12 §6).
 * The first page is rendered on the server; the client pages and filters
 * through /api/discovery.
 */
import { redirect } from "next/navigation"
import { DiscoverContent } from "@/components/tesseract/discover-content"
import { WorkspaceSetupStatus } from "@/components/workspaces/setup-status"
import { getUserWorkspace } from "@/lib/org/workspaces"
import { isAdmin } from "@/lib/auth/admin"
import { requirePersona } from "@/lib/auth/persona-guard"
import { requireWorkspace, WorkspaceError } from "@/lib/auth/workspace-context"
import { parseDiscoveryParams, searchDiscovery } from "@/lib/platform/discovery"
import { LENSES, lensesFor } from "@/lib/platform/discovery-lenses"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePersona(["founder", "vc"])
  const scope = await requireWorkspace().catch((error) => {
    if (error instanceof WorkspaceError) redirect(error.status === 401 ? "/auth/login" : "/onboarding")
    throw error
  })
  const persona = scope.persona as "founder" | "vc"
  const [workspace, { data: { user } }] = await Promise.all([
    getUserWorkspace(scope.userId, scope.orgId),
    (await createClient()).auth.getUser(),
  ])

  const input = await searchParams
  const params = new URLSearchParams()
  for (const key of ["lens", "kind", "search", "stage", "class", "country", "region", "sector", "check", "hasEmail", "hasLinkedIn", "sort"]) {
    if (typeof input[key] === "string") params.set(key, input[key] as string)
  }
  params.set("limit", "50")
  const query = parseDiscoveryParams(params, persona)
  const [result, saved] = await Promise.all([
    searchDiscovery({ orgId: scope.orgId, persona, userId: scope.userId }, query),
    sql`SELECT id, name, lens, filters FROM discovery_saved_searches WHERE org_id = ${scope.orgId} AND user_id = ${scope.userId} ORDER BY created_at DESC LIMIT 50`,
  ])

  return (
    <>
      <div className="px-6 pt-6 lg:px-8"><WorkspaceSetupStatus workspace={workspace?.persona ? workspace : null} /></div>
      <DiscoverContent
        persona={persona}
        lenses={lensesFor(persona).map((id) => ({ id, label: LENSES[id].label, description: LENSES[id].description, kinds: LENSES[id].kinds, canSave: LENSES[id].canSave }))}
        matchingHref={persona === "founder" ? "/dashboard/find-investors" : "/dashboard/matchmaking"}
        canSave={scope.canWrite}
        isAdmin={isAdmin(user?.email)}
        initial={{ lens: query.lens, kind: query.kind, rows: JSON.parse(JSON.stringify(result.rows)), total: result.total, facets: result.facets }}
        savedSearches={saved as any}
      />
    </>
  )
}
