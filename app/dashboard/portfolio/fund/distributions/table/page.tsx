import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { sql } from "@/lib/db"
import { DistributionsTable, type DistRow } from "@/components/portfolio/distributions-table"

export const dynamic = "force-dynamic"
export const metadata = { title: "Distributions — table | Anker" }

export default async function DistributionsTablePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const fund = await getFundBySlug("svs-fund-ii")
  let rows: DistRow[] = []
  if (fund) {
    try {
      rows = (await sql`
        SELECT id, distribution_number, title, source, gross_amount, mgmt_fee_deduction,
               carry_deduction, net_amount, to_char(payment_date,'YYYY-MM-DD') AS payment_date, status
        FROM distributions WHERE fund_id = ${fund.id} ORDER BY distribution_number DESC
      `) as DistRow[]
    } catch { rows = [] }
  }
  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> Fund back-office
        </div>
        <h1 className="text-3xl font-display tracking-tight">Distributions</h1>
        <p className="mt-2 text-sm text-muted-foreground">{fund?.name ?? "Fund"} — gross, fees, carry, and net distributed. Filter, sort, and export.</p>
      </div>
      <DistributionsTable rows={rows} />
    </div>
  )
}
