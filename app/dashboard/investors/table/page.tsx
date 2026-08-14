import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getInvestmentFirms } from "@/lib/db/platform-queries"
import { FirmsTable, type FirmRow } from "@/components/data/firms-table"

export const dynamic = "force-dynamic"
export const metadata = { title: "Investors — table | Anker" }

export default async function InvestorsTablePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const firms = (await getInvestmentFirms(500)) as unknown as FirmRow[]

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> Investor database
        </div>
        <h1 className="text-3xl font-display tracking-tight">Investment firms</h1>
        <p className="mt-2 text-sm text-muted-foreground">Firms by stage, check size, and activity — filter, sort, and export.</p>
      </div>
      <FirmsTable rows={firms} />
    </div>
  )
}
