/**
 * /dashboard/portfolio/fund/syndication — SPVs + co-invest network.
 *
 * Phase 5 of FUND_OPS_DESIGN.md §3.2: an SPV is a fund (vehicle_kind=
 * 'spv'), so calls / distributions / statements / ledger work on it
 * unchanged. This page manages the syndicate layer on top: partner
 * directory, SPV creation from committed/closed deals, and the
 * invited → funded commitment funnel per SPV.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { listSyndicates, listPartners, hasSyndicationTables } from "@/lib/portfolio/syndication"
import { listDeals } from "@/lib/portfolio/deal-pipeline"
import { SyndicationClient } from "@/components/portfolio/syndication-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Syndication — Anker" }

export default async function SyndicationPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const tablesReady = await hasSyndicationTables()
  const [syndicates, partners, deals] = tablesReady
    ? await Promise.all([
        listSyndicates(fund.id),
        listPartners(fund.id),
        listDeals(fund.id),
      ])
    : [[], [], []]

  // SPVs syndicate committed or closed deals.
  const syndicatableDeals = deals
    .filter((d) => d.stage === "committed" || d.stage === "closed")
    .map((d) => ({ id: d.id, companyName: d.company_name, stage: d.stage }))

  return (
    <SyndicationClient
      fund={fund}
      initialSyndicates={syndicates}
      initialPartners={partners}
      syndicatableDeals={syndicatableDeals}
      tablesReady={tablesReady}
    />
  )
}
