import { createClient } from "@/lib/supabase/server"
import { DashboardContent } from "@/components/tesseract/dashboard-content"
import { getInvestmentFirms, getDeals, getContacts, getInvestors } from "@/lib/db/platform-queries"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch platform stats from Neon database
  const [firms, deals, contacts, investors] = await Promise.all([
    getInvestmentFirms(100),
    getDeals(50),
    getContacts(50),
    getInvestors(50)
  ])

  const stats = {
    totalFirms: firms.length,
    totalDeals: deals.length,
    totalContacts: contacts.length,
    totalInvestors: investors.length,
    activeDeals: deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage || '')).length,
    pipelineValue: deals.reduce((sum, d) => sum + (d.amount || 0), 0)
  }

  // User is guaranteed to exist due to layout auth check
  return <DashboardContent user={user!} stats={stats} />
}
