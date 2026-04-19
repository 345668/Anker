import { createClient } from "@/lib/supabase/server"
import { PipelineContent } from "@/components/tesseract/pipeline-content"
import { getDeals, getInvestmentFirms } from "@/lib/db/platform-queries"

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch deals and firms for the pipeline
  const [deals, firms] = await Promise.all([
    getDeals(200),
    getInvestmentFirms(200)
  ])

  // Create lookup map for firms
  const firmMap = new Map(firms.map(f => [f.id, f]))
  
  // Enrich deals with firm data
  const enrichedDeals = deals.map(deal => ({
    ...deal,
    firm: deal.firm_id ? firmMap.get(deal.firm_id) : null
  }))

  return <PipelineContent user={user!} deals={enrichedDeals} firms={firms} />
}
