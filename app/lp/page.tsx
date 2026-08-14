import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  getLpMembershipsForEmail, listDocumentsForLp,
} from "@/lib/portfolio/data-room"
import { getFundNav } from "@/lib/portfolio/investments"
import { getFundLpRollup } from "@/lib/portfolio/funds"
import { LpDashboardClient, type LpPortfolioSummary } from "@/components/lp/lp-dashboard-client"

export const dynamic = "force-dynamic"

/**
 * /lp — Landing page for the LP portal.
 *
 * Renders:
 *   - Summary card per fund the user is an LP on (commitment / called /
 *     distributed / uncalled / DPI-like ratio)
 *   - Documents list (filter by category) scoped to docs the LP can see
 *
 * Both pieces are read-only.  When LPs need to act (submit a sub doc back,
 * acknowledge a capital call), that's a separate flow we'll add later.
 */
export default async function LpHome() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login?redirect=/lp")

  const memberships = await getLpMembershipsForEmail(user.email ?? "")
  // Layout already shows the "no LP access" stub when memberships is empty,
  // so by the time we get here we know there's at least one.
  const documents = await listDocumentsForLp(memberships, { limit: 200 })

  // Portfolio roll-up + estimated NAV (LP's pro-rata share of fund fair value).
  const committed = memberships.reduce((s, m) => s + (m.commitment_amount ?? 0), 0)
  const called = memberships.reduce((s, m) => s + m.called_amount, 0)
  const distributed = memberships.reduce((s, m) => s + m.distributed_amount, 0)
  let estNav = 0
  for (const m of memberships) {
    if (!m.commitment_amount) continue
    const [nav, rollup] = await Promise.all([getFundNav(m.fund_id), getFundLpRollup(m.fund_id)])
    if (nav && rollup.total_committed > 0) {
      estNav += nav.positionsFairValue * (m.commitment_amount / rollup.total_committed)
    }
  }
  const summary: LpPortfolioSummary = {
    committed,
    called,
    uncalled: Math.max(0, committed - called),
    distributed,
    estNav,
    tvpi: called > 0 ? (distributed + estNav) / called : null,
  }

  return (
    <LpDashboardClient
      memberships={memberships}
      initialDocuments={documents}
      view="overview"
      summary={summary}
    />
  )
}
