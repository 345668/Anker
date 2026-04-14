import { createClient } from "@/lib/supabase/server"
import { DealsContent } from "@/components/tesseract/deals-content"
import { getDeals, getInvestmentFirms, getInvestors } from "@/lib/db/platform-queries"

export default async function DealsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch real deals, firms, and investors from Neon database
  const [deals, firms, investors] = await Promise.all([
    getDeals(100),
    getInvestmentFirms(100),
    getInvestors(100)
  ])

  return <DealsContent user={user!} deals={deals} firms={firms} investors={investors} />
}
