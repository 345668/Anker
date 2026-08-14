import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { getFundNav, getFundPerformance } from "@/lib/portfolio/investments"
import { sql } from "@/lib/db"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fund performance — Anker" }

const money = (v: number | null | undefined) => (v == null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Number(v).toLocaleString()}`)
const mult = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}×`)
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`)

export default async function FundPerformancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  const [nav, perf, meta] = fund
    ? await Promise.all([
        getFundNav(fund.id),
        getFundPerformance(fund.id),
        sql`SELECT vintage_year, target_size, currency FROM funds WHERE id = ${fund.id} LIMIT 1`.then((r: any) => r[0] ?? null),
      ])
    : [null, null, null]

  const summary: Metric[] = [
    { label: "Vintage", value: meta?.vintage_year ?? "—" },
    { label: "Fund size", value: money(meta?.target_size ? Number(meta.target_size) : null) },
    { label: "Total invested", value: money(nav?.totalInvested), hint: nav && meta?.target_size ? `${((nav.totalInvested / Number(meta.target_size)) * 100).toFixed(0)}% of fund` : undefined },
    { label: "Investments", value: nav?.activePositionCount ?? 0, hint: nav ? `${nav.positionCount} total` : undefined },
    { label: "Fund NAV", value: money(nav?.positionsFairValue) },
  ]

  const metrics: { key: string; label: string; value: string; def: string }[] = [
    { key: "tvpi", label: "TVPI", value: mult(perf?.tvpi), def: "Total Value to Paid-in Capital — (distributions + NAV) ÷ called capital." },
    { key: "dpi", label: "DPI", value: mult(perf?.dpi), def: "Distributions to Paid-in Capital — cash returned ÷ called capital." },
    { key: "rvpi", label: "RVPI", value: mult(perf?.rvpi), def: "Residual Value to Paid-in Capital — NAV ÷ called capital." },
    { key: "moic", label: "Gross MOIC", value: mult(perf?.grossMoic), def: "(Fair value + realized) ÷ total invested." },
    { key: "irr", label: "Net IRR", value: pct(perf?.netIrr), def: "Annualized net return from dated LP cashflows + terminal NAV." },
  ]

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> {fund?.name ?? "Fund"}
        </div>
        <h1 className="text-3xl font-display tracking-tight">Fund performance</h1>
        <p className="mt-2 text-sm text-muted-foreground">Called {money(perf?.totalCalled)} · distributed {money(perf?.totalDistributed)} — computed from dated cashflows, not estimates.</p>
      </div>

      <MetricTiles metrics={summary} columns={5} />

      <div className="mt-8">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Performance metrics</div>
        <div className="overflow-x-auto border border-foreground/10 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-4 py-3">Metric</th>
                <th className="text-right px-4 py-3">Value</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Definition</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.key} className="border-b border-foreground/[0.06] last:border-0">
                  <td className="px-4 py-3.5 font-medium">{m.label}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-lg">{m.value}</td>
                  <td className="px-4 py-3.5 text-muted-foreground hidden md:table-cell">{m.def}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
