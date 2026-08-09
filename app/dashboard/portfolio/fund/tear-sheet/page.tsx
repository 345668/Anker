import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { listInvestments, getFundNav, getFundPerformance } from "@/lib/portfolio/investments"
import { TearSheetBuilder, type TearSheetData } from "@/components/portfolio/tear-sheet-builder"

export const dynamic = "force-dynamic"
export const metadata = { title: "Tear sheet builder — Anker" }

const money = (v: number | null | undefined) => (v == null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(Number(v)).toLocaleString()}`)
const mult = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}×`)
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`)

export default async function TearSheetPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  const [investments, nav, perf] = fund
    ? await Promise.all([listInvestments(fund.id), getFundNav(fund.id), getFundPerformance(fund.id)])
    : [[], null, null]

  const positions = investments
    .map((i) => {
      const fv = Number(i.current_fair_value ?? i.cost_basis) || 0
      const invested = Number(i.cost_basis) || 0
      const moic = invested > 0 ? (fv + Number(i.realized_proceeds || 0)) / invested : 0
      return { company: i.company_name, round: i.round_name ?? "—", investedNum: invested, invested: money(invested), fairValue: money(fv), moic: mult(moic) }
    })
    .sort((a, b) => b.investedNum - a.investedNum)

  // Allocation by investment kind (share of invested capital).
  const byKind = new Map<string, number>()
  for (const i of investments) byKind.set(i.investment_kind, (byKind.get(i.investment_kind) ?? 0) + (Number(i.cost_basis) || 0))
  const totalInvested = Array.from(byKind.values()).reduce((s, v) => s + v, 0)
  const allocation = Array.from(byKind.entries())
    .map(([k, v]) => ({ name: k.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), pct: totalInvested > 0 ? (v / totalInvested) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct)

  const data: TearSheetData = {
    fundName: fund?.name ?? "Fund",
    vintage: fund?.vintage_year ?? "—",
    strategy: fund?.description?.split(".")[0] ?? "Early-stage venture",
    currency: fund?.currency ?? "USD",
    asOf: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    metrics: [
      { label: "Fund size", value: money(fund?.target_size ? Number(fund.target_size) : null) },
      { label: "TVPI", value: mult(perf?.tvpi) },
      { label: "Net IRR", value: pct(perf?.netIrr) },
      { label: "DPI", value: mult(perf?.dpi) },
      { label: "Fund NAV", value: money(nav?.positionsFairValue) },
      { label: "Invested", value: money(nav?.totalInvested), hint: `${nav?.activePositionCount ?? 0} active positions` },
    ],
    positions,
    allocation,
    summary: fund?.description ?? "",
  }

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-8" data-noprint>
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> {fund?.name ?? "Fund"}
        </div>
        <h1 className="text-3xl font-display tracking-tight">Tear sheet builder</h1>
        <p className="mt-2 text-sm text-muted-foreground">Compose a confidential one-pager for LPs — toggle sections, then print or save to PDF.</p>
      </div>
      <TearSheetBuilder data={data} />
    </div>
  )
}
