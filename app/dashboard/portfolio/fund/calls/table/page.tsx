import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { sql } from "@/lib/db"
import { CapitalCallsTable, type CallRow } from "@/components/portfolio/capital-calls-table"

export const dynamic = "force-dynamic"
export const metadata = { title: "Capital calls — table | Anker" }

export default async function CapitalCallsTablePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const fund = await getFundBySlug("svs-fund-ii")
  let rows: CallRow[] = []
  if (fund) {
    try {
      rows = (await sql`
        SELECT id, call_number, title, purpose, default_call_pct, total_amount,
               to_char(sent_at,'YYYY-MM-DD') AS sent_at, to_char(due_date,'YYYY-MM-DD') AS due_date, status
        FROM capital_calls WHERE fund_id = ${fund.id} ORDER BY call_number DESC
      `) as CallRow[]
    } catch { rows = [] }
  }
  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> Fund back-office
        </div>
        <h1 className="text-3xl lg:text-4xl font-serif tracking-tight leading-[1.05]">Capital calls</h1>
        <p className="mt-2 text-sm text-muted-foreground">{fund?.name ?? "Fund"} — called capital by tranche. Filter, sort, and export.</p>
      </div>
      <CapitalCallsTable rows={rows} />
    </div>
  )
}
