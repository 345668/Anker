import { requirePersona } from "@/lib/auth/persona-guard"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { getFundNav, getFundPerformance } from "@/lib/portfolio/investments"
import { ModuleScaffold } from "@/components/shell/module-scaffold"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fund Forecasting — Anker" }

const money = (v: number | null | undefined) => (v == null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(Number(v)).toLocaleString()}`)
const mult = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}×`)

export default async function ForecastingPage() {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  const [nav, perf] = fund ? await Promise.all([getFundNav(fund.id), getFundPerformance(fund.id)]) : [null, null]

  // Simple forward projection: assume current gross MOIC holds on uncalled capital.
  const size = fund?.target_size ? Number(fund.target_size) : 0
  const invested = nav?.totalInvested ?? 0
  const dryPowder = Math.max(0, size - invested)
  const grossMoic = perf?.grossMoic ?? null
  const projectedValue = grossMoic != null ? (nav?.positionsFairValue ?? 0) + dryPowder * grossMoic : null
  const projectedTvpi = grossMoic != null && (perf?.totalCalled ?? 0) > 0 && projectedValue != null
    ? (projectedValue + (perf?.totalDistributed ?? 0)) / (perf?.totalCalled ?? 1)
    : null

  const projection: Metric[] = [
    { label: "Dry powder", value: money(dryPowder), hint: size ? `${Math.round((dryPowder / size) * 100)}% of fund` : undefined },
    { label: "Current NAV", value: money(nav?.positionsFairValue) },
    { label: "Projected value", value: money(projectedValue), hint: "at current gross MOIC" },
    { label: "Projected TVPI", value: mult(projectedTvpi) },
  ]

  return (
    <ModuleScaffold
      eyebrow="Fund back-office"
      title="Fund Forecasting"
      description="Guide your fund's strategy with data-driven precision — pacing, reserves, and projected returns from your live book."
      capabilities={[
        { title: "Deployment pacing", desc: "Model how fast to deploy remaining commitments against the investment period." },
        { title: "Reserve planning", desc: "Set aside follow-on reserves per position and see the impact on new deals." },
        { title: "Return projections", desc: "Project TVPI, DPI, and IRR forward under multiple exit assumptions." },
        { title: "Scenario modeling", desc: "Compare base / upside / downside cases side by side." },
        { title: "Cashflow forecast", desc: "Forecast calls and distributions to help LPs plan liquidity." },
        { title: "LP-ready outputs", desc: "Export the forecast straight into LP reporting and the tear sheet." },
      ]}
    >
      <div className="mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Live projection · at current gross MOIC</div>
      <div className="mb-8"><MetricTiles metrics={projection} columns={4} /></div>
    </ModuleScaffold>
  )
}
