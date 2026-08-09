import { createClient } from "@/lib/supabase/server"
import { DashboardContent } from "@/components/tesseract/dashboard-content"
import { QuickStart } from "@/components/shell/quick-start"
import { TaskFeed } from "@/components/tasks/task-feed"
import { Spotlight, type SpotlightItem } from "@/components/shell/spotlight"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { sql } from "@/lib/db"

async function getSpotlight(userId: string | undefined): Promise<SpotlightItem[]> {
  const items: SpotlightItem[] = []
  try {
    const fund = await getFundBySlug("svs-fund-ii")
    if (fund) {
      const lpCount = await sql`SELECT count(*)::int c FROM fund_lps WHERE fund_id = ${fund.id}`
      const dists = await sql`SELECT title, to_char(payment_date,'Mon DD, YYYY') d FROM distributions WHERE fund_id = ${fund.id} AND status = 'notified' ORDER BY payment_date LIMIT 1`
      for (const d of dists) items.push({ title: `Distribution — ${d.title}`, sub: `${fund.name} · ${d.d}`, href: "/dashboard/portfolio/fund/distributions", cta: "View details", progress: { done: 0, total: lpCount[0].c, label: `0/${lpCount[0].c} investors paid` } })
      const calls = await sql`SELECT title, to_char(due_date,'Mon DD, YYYY') d FROM capital_calls WHERE fund_id = ${fund.id} AND status = 'sent' ORDER BY due_date LIMIT 1`
      for (const c of calls) items.push({ title: `Capital call — ${c.title}`, sub: `${fund.name} · due ${c.d}`, href: "/dashboard/portfolio/fund/calls", cta: "Review call", accent: "#e5380f" })
    }
    if (userId) {
      const overdue = await sql`SELECT count(*)::int c FROM tasks WHERE assignee_id = ${userId} AND stage <> 'done' AND due_date < CURRENT_DATE`
      if (overdue[0].c > 0) items.push({ title: `Review: ${overdue[0].c} overdue to-do${overdue[0].c === 1 ? "" : "s"}`, sub: "Items past their due date", href: "/dashboard", cta: "View tasks", accent: "#e5380f" })
    }
  } catch { /* best-effort */ }
  return items
}
import { getInvestmentFirms, getDeals, getContacts, getInvestors, getOutreaches, getInvestorMatches } from "@/lib/db/platform-queries"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch comprehensive platform stats from Neon database
  const [firms, deals, contacts, investors] = await Promise.all([
    getInvestmentFirms(500),
    getDeals(100),
    getContacts(100),
    getInvestors(100)
  ])

  // Calculate real metrics
  const activeDeals = deals.filter(d => !['closed_won', 'closed_lost', 'lost'].includes(d.stage || ''))
  const closedDeals = deals.filter(d => ['closed_won', 'won'].includes(d.stage || ''))
  const pipelineValue = activeDeals.reduce((sum, d) => sum + Number(d.amount || 0), 0)
  const closedValue = closedDeals.reduce((sum, d) => sum + Number(d.amount || 0), 0)

  // Get recent deals for activity feed
  const recentDeals = deals.slice(0, 5).map(deal => ({
    id: deal.id,
    name: deal.name || 'Unnamed Deal',
    stage: deal.stage || 'prospect',
    amount: deal.amount,
    firmName: deal.firm_name ?? null,
    updatedAt: deal.updated_at
  }))

  const stats = {
    totalFirms: firms.length,
    totalDeals: deals.length,
    totalContacts: contacts.length,
    totalInvestors: investors.length,
    activeDeals: activeDeals.length,
    closedDeals: closedDeals.length,
    pipelineValue,
    closedValue,
    recentDeals
  }

  const spotlight = await getSpotlight(user?.id)

  // User is guaranteed to exist due to layout auth check
  return (
    <>
      <div className="px-6 lg:px-8 pt-6 lg:pt-8">
        <QuickStart />
        <Spotlight items={spotlight} />
        <TaskFeed />
      </div>
      <DashboardContent user={user!} stats={stats} />
    </>
  )
}
