import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DiscoverContent } from "@/components/tesseract/discover-content"
import { 
  getInvestmentFirms, 
  getInvestorMatches,
  getDashboardStats 
} from "@/lib/db/platform-queries"

export default async function DiscoverPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  // Fetch real data from database
  const [firms, matches, stats] = await Promise.all([
    getInvestmentFirms(100),
    getInvestorMatches(50),
    getDashboardStats()
  ])

  return (
    <DiscoverContent 
      user={user} 
      initialFirms={firms}
      initialMatches={matches}
      stats={stats}
    />
  )
}
