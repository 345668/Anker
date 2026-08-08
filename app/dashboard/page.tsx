import { createClient } from "@/lib/supabase/server"
import { DashboardContent } from "@/components/tesseract/dashboard-content"
import { QuickStart } from "@/components/shell/quick-start"
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

  // User is guaranteed to exist due to layout auth check
  return (
    <>
      <div className="px-6 lg:px-8 pt-6 lg:pt-8">
        <QuickStart />
      </div>
      <DashboardContent user={user!} stats={stats} />
    </>
  )
}
