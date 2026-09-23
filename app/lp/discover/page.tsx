/**
 * LP Discover — fund managers and the funds listed for LPs
 * (docs/architecture/12 §3.3). Inside the LP portal, so only people a GP has
 * attached to a fund can reach it.
 */
import { DiscoverContent } from "@/components/tesseract/discover-content"
import { parseDiscoveryParams, searchDiscovery } from "@/lib/platform/discovery"
import { LENSES, lensesFor } from "@/lib/platform/discovery-lenses"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function LpDiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect("/auth/login?redirect=/lp/discover")

  const input = await searchParams
  const params = new URLSearchParams()
  for (const key of ["lens", "kind", "search", "stage", "class", "country", "region", "sector", "check", "sort"]) {
    if (typeof input[key] === "string") params.set(key, input[key] as string)
  }
  params.set("limit", "50")
  const query = parseDiscoveryParams(params, "lp")
  const result = await searchDiscovery({ orgId: null, persona: "lp", userId: user.id }, query)

  return (
    <div className="max-w-6xl mx-auto">
      <DiscoverContent
        persona="lp"
        lenses={lensesFor("lp").map((id) => ({ id, label: LENSES[id].label, description: LENSES[id].description, kinds: LENSES[id].kinds, canSave: LENSES[id].canSave }))}
        matchingHref="/lp"
        canSave={false}
        initial={{ lens: query.lens, kind: query.kind, rows: JSON.parse(JSON.stringify(result.rows)), total: result.total, facets: result.facets }}
      />
    </div>
  )
}
