import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getDeals } from "@/lib/db/platform-queries"
import { DealsTable, type DealRow } from "@/components/data/deals-table"

export const dynamic = "force-dynamic"
export const metadata = { title: "Deals — table | Anker" }

export default async function DealsTablePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const deals = (await getDeals(500)) as unknown as DealRow[]

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#e5380f]" /> Deal pipeline
        </div>
        <h1 className="text-3xl font-display tracking-tight">Deals</h1>
        <p className="mt-2 text-sm text-muted-foreground">Every deal — filter, sort, choose columns, and export.</p>
      </div>
      <DealsTable rows={deals} />
    </div>
  )
}
