import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { sql } from "@/lib/db"
import { FinancialReportProgress, type FinancialReport } from "@/components/portfolio/financial-report-progress"

export const dynamic = "force-dynamic"
export const metadata = { title: "Financial reporting — Anker" }

export default async function FundReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  const rows = fund
    ? await sql`
        SELECT id, entity_name, period, status, steps
        FROM financial_reports
        WHERE fund_id = ${fund.id}
        ORDER BY created_at DESC
      `
    : []

  const reports: FinancialReport[] = rows.map((r: any) => ({
    id: r.id,
    entityName: r.entity_name ?? fund?.name ?? "Fund",
    period: r.period,
    status: r.status,
    steps: r.steps ?? [],
  }))

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> {fund?.name ?? "Fund"}
        </div>
        <h1 className="text-3xl lg:text-4xl font-serif tracking-tight leading-[1.05]">Financial reporting</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Track each quarterly close from bank transactions through to publishing financials to your LPs.
        </p>
      </div>

      {reports.length ? (
        <FinancialReportProgress reports={reports} />
      ) : (
        <p className="text-sm text-muted-foreground">No reporting periods have been opened for this fund yet.</p>
      )}
    </div>
  )
}
