import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { listInvestments } from "@/lib/portfolio/investments"
import { DataExplorer, type ExplorerRow } from "@/components/portfolio/data-explorer"

export const dynamic = "force-dynamic"
export const metadata = { title: "Data explorer — Anker" }

export default async function DataExplorerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  const investments = fund ? await listInvestments(fund.id) : []

  const rows: ExplorerRow[] = investments.map((i) => ({
    company: i.company_name,
    kind: i.investment_kind,
    security: i.security_type,
    status: i.status,
    round: i.round_name ?? "",
    year: i.invested_at ? new Date(i.invested_at).getFullYear().toString() : "",
    invested: Number(i.cost_basis) || 0,
    fairValue: Number(i.current_fair_value ?? i.cost_basis) || 0,
    realized: Number(i.realized_proceeds) || 0,
  }))

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif tracking-tight">Data Explorer</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Spend less time on manual tasks, unlock insights using extensive fund and port-co data in Anker, and empower your team to answer their own questions. Computed live from {rows.length} position{rows.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
          <span className="font-mono uppercase tracking-[0.15em]">Powered by</span>
          <span className="inline-flex items-center rounded border border-foreground/15 overflow-hidden">
            <span className="px-2 py-1 font-display font-semibold">Anker</span>
            <span className="px-2 py-1 border-l border-foreground/15">Data Warehouse</span>
          </span>
        </div>
      </div>
      <DataExplorer rows={rows} />
    </div>
  )
}
