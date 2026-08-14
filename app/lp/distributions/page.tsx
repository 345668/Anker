import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getLpMembershipsForEmail, getLpDistributions, getLpCapitalCalls } from "@/lib/portfolio/data-room"
import { LpActivityClient } from "@/components/lp/lp-activity-client"

export const dynamic = "force-dynamic"

export default async function LpDistributionsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login?redirect=/lp/distributions")

  const memberships = await getLpMembershipsForEmail(user.email ?? "")
  const fundLpIds = memberships.map((m) => m.fund_lp_id)
  const [distributions, calls] = await Promise.all([getLpDistributions(fundLpIds), getLpCapitalCalls(fundLpIds)])

  return (
    <main className="max-w-6xl mx-auto px-6 lg:px-10 py-8 lg:py-10 space-y-8">
      <div>
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#127c78]" /> Capital activity
        </div>
        <h1 className="text-3xl font-display tracking-tight">Distributions &amp; capital calls</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every notice addressed to you. Acknowledge a call to signal intent to wire, or confirm receipt of a distribution.
        </p>
      </div>

      <LpActivityClient distributions={distributions} calls={calls} />
    </main>
  )
}
