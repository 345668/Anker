import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { sql } from "@/lib/db"
import { PartnersTable, type Lp } from "@/components/portfolio/partners-table"

export const dynamic = "force-dynamic"
export const metadata = { title: "Partners — Anker" }

export default async function PartnersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  let rows: Lp[] = []
  if (fund) {
    try {
      rows = (await sql`
        SELECT id, lp_name, lp_type, commitment_amount, called_amount, distributed_amount,
               ownership_pct, status, to_char(signed_at, 'YYYY-MM-DD') AS signed_at
        FROM fund_lps WHERE fund_id = ${fund.id} ORDER BY commitment_amount DESC NULLS LAST
      `) as Lp[]
    } catch { rows = [] }
  }
  const asOf = new Date().toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#2f45e0]" />
          Limited Partners
        </div>
        <h1 className="text-3xl font-display tracking-tight">Partners</h1>
        <p className="mt-2 text-sm text-muted-foreground">{fund?.name ?? "Fund"} — commitments, capital called, distributions, and ownership.</p>
      </div>
      <PartnersTable rows={rows} asOf={asOf} />
    </div>
  )
}
