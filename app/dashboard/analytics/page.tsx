import { createClient } from "@/lib/supabase/server"
import { AnalyticsContent } from "@/components/tesseract/analytics-content"
import { getDeals, getInvestmentFirms, getContacts } from "@/lib/db/platform-queries"

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch data for analytics
  const [deals, firms, contacts] = await Promise.all([
    getDeals(500),
    getInvestmentFirms(500),
    getContacts(200)
  ])

  // Calculate analytics metrics
  const analytics = {
    deals: {
      total: deals.length,
      byStage: deals.reduce((acc, d) => {
        const stage = d.stage || 'prospect'
        acc[stage] = (acc[stage] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      totalValue: deals.reduce((sum, d) => sum + Number(d.amount || 0), 0),
      avgDealSize: deals.length > 0 ? deals.reduce((sum, d) => sum + Number(d.amount || 0), 0) / deals.length : 0,
      closedWon: deals.filter(d => ['closed_won', 'won'].includes(d.stage || '')).length,
      closedLost: deals.filter(d => ['closed_lost', 'lost'].includes(d.stage || '')).length,
    },
    firms: {
      total: firms.length,
      byType: firms.reduce((acc, f) => {
        const type = f.type || 'Other'
        acc[type] = (acc[type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    },
    contacts: {
      total: contacts.length
    }
  }

  return <AnalyticsContent user={user!} analytics={analytics} />
}
