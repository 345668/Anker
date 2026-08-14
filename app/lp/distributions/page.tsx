import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getLpMembershipsForEmail, getLpDistributions, getLpCapitalCalls } from "@/lib/portfolio/data-room"

export const dynamic = "force-dynamic"

const money = (v: number) => `$${Math.round(v).toLocaleString()}`
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")

const STATUS_CLS: Record<string, string> = {
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  notified: "bg-[#127c78]/10 text-[#127c78]",
  sent: "bg-[#127c78]/10 text-[#127c78]",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  settled: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  waived: "bg-foreground/[0.06] text-muted-foreground",
}
const badge = (s: string) => STATUS_CLS[s] ?? "bg-foreground/[0.06] text-muted-foreground"

export default async function LpDistributionsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login?redirect=/lp/distributions")

  const memberships = await getLpMembershipsForEmail(user.email ?? "")
  const fundLpIds = memberships.map((m) => m.fund_lp_id)
  const [distributions, calls] = await Promise.all([getLpDistributions(fundLpIds), getLpCapitalCalls(fundLpIds)])

  const totalDistributed = distributions.filter((d) => d.status === "paid").reduce((s, d) => s + d.amount, 0)
  const totalCalled = calls.filter((c) => c.status === "paid" || c.status === "settled").reduce((s, c) => s + c.amount, 0)

  return (
    <main className="max-w-6xl mx-auto px-6 lg:px-10 py-8 lg:py-10 space-y-10">
      <div>
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#127c78]" /> Capital activity
        </div>
        <h1 className="text-3xl font-display tracking-tight">Distributions &amp; capital calls</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every notice addressed to you across the funds you&apos;re invested in.
        </p>
      </div>

      {/* Distributions */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-xl tracking-tight">Distributions received</h2>
          <span className="text-xs text-muted-foreground tabular-nums">Paid to date {money(totalDistributed)}</span>
        </div>
        {distributions.length ? (
          <div className="overflow-x-auto border border-foreground/10 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2.5">Fund</th>
                  <th className="text-left px-4 py-2.5">Distribution</th>
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {distributions.map((d, i) => (
                  <tr key={i} className="border-b border-foreground/[0.06] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{d.fund_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{d.title ?? `Distribution #${d.distribution_number}`}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(d.paid_at ?? d.date)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(d.amount)}</td>
                    <td className="px-4 py-2.5"><span className={`text-[11px] font-medium px-1.5 py-0.5 rounded capitalize ${badge(d.status)}`}>{d.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground border border-foreground/10 rounded-lg p-6">No distributions have been made to you yet.</p>
        )}
      </section>

      {/* Capital calls */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-xl tracking-tight">Capital calls</h2>
          <span className="text-xs text-muted-foreground tabular-nums">Paid to date {money(totalCalled)}</span>
        </div>
        {calls.length ? (
          <div className="overflow-x-auto border border-foreground/10 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2.5">Fund</th>
                  <th className="text-left px-4 py-2.5">Call</th>
                  <th className="text-left px-4 py-2.5">Due</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c, i) => (
                  <tr key={i} className="border-b border-foreground/[0.06] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{c.fund_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.title ?? `Capital call #${c.call_number}`}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(c.due_date)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(c.amount)}</td>
                    <td className="px-4 py-2.5"><span className={`text-[11px] font-medium px-1.5 py-0.5 rounded capitalize ${badge(c.status)}`}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground border border-foreground/10 rounded-lg p-6">No capital calls addressed to you yet.</p>
        )}
      </section>
    </main>
  )
}
