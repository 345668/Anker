import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DiscoverContent } from "@/components/tesseract/discover-content"
import { WorkspaceSetupStatus } from "@/components/workspaces/setup-status"
import { resolveActiveMembership } from "@/lib/org/active"
import { getUserWorkspace } from "@/lib/org/workspaces"
import { isAdmin } from "@/lib/auth/admin"
import { requirePersona } from "@/lib/auth/persona-guard"
import { searchDiscovery } from "@/lib/platform/discovery"

export const dynamic = "force-dynamic"

export default async function DiscoverPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePersona(["founder", "vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { active } = await resolveActiveMembership(user.id)
  const workspace = active ? await getUserWorkspace(user.id, active.orgId) : null
  const input = await searchParams
  const filters: Record<string, string> = {}
  for (const key of ["search", "stage", "type", "country", "sector", "check", "hasEmail", "hasLinkedIn"]) {
    if (typeof input[key] === "string") filters[key] = input[key] as string
  }
  // Initial render and subsequent pages use exactly the same filtering contract.
  const query = new URLSearchParams({ ...filters, page: "1", limit: "100" })
  const [investors, firms] = await Promise.all([
    searchDiscovery("investors", query),
    searchDiscovery("firms", query),
  ])
  return <><div className="px-6 pt-6 lg:px-8"><WorkspaceSetupStatus workspace={workspace?.persona ? workspace : null} /></div><DiscoverContent
    user={user} isAdmin={isAdmin(user.email)}
    initialInvestors={JSON.parse(JSON.stringify(investors.investors))}
    initialFirms={JSON.parse(JSON.stringify(firms.firms))}
    matchingHref={!workspace?.persona ? "/onboarding" : workspace.persona === "founder" ? "/dashboard/find-investors" : workspace.persona === "vc" ? "/dashboard/matchmaking" : "/lp"}
    initialFilters={filters}
    initialFacets={{ investors: investors.facets, firms: firms.facets }}
    stats={{ totalInvestors: investors.pagination.total, totalFirms: firms.pagination.total, totalMatches: 0 }}
  /></>
}
