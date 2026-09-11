import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DiscoverContent } from "@/components/tesseract/discover-content"
import { sql } from "@/lib/db"
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
  const input = await searchParams
  const filters: Record<string, string> = {}
  for (const key of ["search", "stage", "type", "country", "sector", "check", "hasEmail", "hasLinkedIn"]) {
    if (typeof input[key] === "string") filters[key] = input[key] as string
  }
  // Initial render and subsequent pages use exactly the same filtering contract.
  const query = new URLSearchParams({ ...filters, page: "1", limit: "100" })
  const [investors, firms, matches] = await Promise.all([
    searchDiscovery("investors", query),
    searchDiscovery("firms", query),
    sql`SELECT * FROM investor_matches WHERE startup_id IN (
      SELECT id FROM startups WHERE owner_id = ${user.id}
      UNION SELECT id FROM startups WHERE founder_id = ${user.id}
    ) ORDER BY score DESC`,
  ])
  return <DiscoverContent
    user={user} isAdmin={isAdmin(user.email)}
    initialInvestors={JSON.parse(JSON.stringify(investors.investors))}
    initialFirms={JSON.parse(JSON.stringify(firms.firms))}
    initialMatches={JSON.parse(JSON.stringify(matches))}
    initialFilters={filters}
    initialFacets={{ investors: investors.facets, firms: firms.facets }}
    stats={{ totalInvestors: investors.pagination.total, totalFirms: firms.pagination.total, totalMatches: matches.length }}
  />
}
