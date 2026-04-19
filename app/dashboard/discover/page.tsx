import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DiscoverContent } from "@/components/tesseract/discover-content"
import { 
  getInvestmentFirms, 
  getInvestors,
  getInvestorMatches,
  getInvestorStats,
  getInvestorCountByType,
  getInvestorCountByCountry
} from "@/lib/db/platform-queries"

export default async function DiscoverPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  // Fetch real data from database - firms, investors, and matches
  const [firms, investors, matches, investorStats, typeDistribution, countryDistribution] = await Promise.all([
    getInvestmentFirms(100),
    getInvestors(100),
    getInvestorMatches(user.id).catch(() => []), // May fail if no startup exists
    getInvestorStats(),
    getInvestorCountByType(),
    getInvestorCountByCountry()
  ])

  const stats = {
    totalFirms: firms.length,
    totalInvestors: investorStats.total,
    investorsWithEmail: investorStats.withEmail,
    investorsWithLinkedIn: investorStats.withLinkedIn,
    typeDistribution,
    countryDistribution
  }

  return (
    <DiscoverContent 
      user={user} 
      initialFirms={firms}
      initialInvestors={investors}
      initialMatches={matches}
      stats={stats}
    />
  )
}
