import { requirePersona } from "@/lib/auth/persona-guard"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { getFundNav, getFundPerformance } from "@/lib/portfolio/investments"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { ForecastingClient, type ForecastBase } from "@/components/modules/forecasting-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fund Forecasting — Anker" }

export default async function ForecastingPage() {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  const [nav, perf] = fund ? await Promise.all([getFundNav(fund.id), getFundPerformance(fund.id)]) : [null, null]

  const base: ForecastBase = {
    size: fund?.target_size ? Number(fund.target_size) : 0,
    invested: nav?.totalInvested ?? 0,
    called: perf?.totalCalled ?? 0,
    distributed: perf?.totalDistributed ?? 0,
    navFV: nav?.positionsFairValue ?? 0,
    grossMoic: perf?.grossMoic ?? null,
  }

  return (
    <PageShell>
      <PageHeader eyebrow="Fund back-office" title="Fund Forecasting" description="Guide your fund's strategy with data-driven precision — model pacing, reserves, and projected returns under downside, base, and upside scenarios." />
      <ForecastingClient base={base} />
    </PageShell>
  )
}
