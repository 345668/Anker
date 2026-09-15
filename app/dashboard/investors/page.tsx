import { createClient } from "@/lib/supabase/server"
import { InvestorsContent } from "@/components/tesseract/investors-content"
import { getInvestmentFirms, getInvestors } from "@/lib/db/platform-queries"
import { requirePersona } from "@/lib/auth/persona-guard"

export default async function InvestorsPage() {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch real data from Neon database
  const [firms, investors] = await Promise.all([
    getInvestmentFirms(50),
    getInvestors(100)
  ])

  return <InvestorsContent user={user!} firms={firms} investors={investors} />
}
