import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DiscoverContent } from "@/components/tesseract/discover-content"
import { 
  getInvestmentFirms, 
  getInvestors,
  getInvestorMatches,
  getInvestmentFirmCount,
} from "@/lib/db/platform-queries"
import { sql } from "@/lib/db"

export default async function DiscoverPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  // Fetch real data from database
  const [firms, investors, matches, firmCount, investorCountResult] = await Promise.all([
    getInvestmentFirms(200),
    getInvestors(200),
    getInvestorMatches(user.id).catch(() => []),
    getInvestmentFirmCount(),
    sql`SELECT COUNT(*) as count FROM investors WHERE is_active = true`
  ])

  const investorCount = Number(investorCountResult[0]?.count || 0)

  return (
    <DiscoverContent 
      user={user} 
      initialFirms={firms}
      initialInvestors={investors}
      initialMatches={matches}
      stats={{
        totalFirms: firmCount,
        totalInvestors: investorCount,
        totalMatches: matches.length,
      }}
    />
  )
}
