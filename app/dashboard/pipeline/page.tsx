import { createClient } from "@/lib/supabase/server"
import { PipelineContent } from "@/components/tesseract/pipeline-content"
import { getDeals, getInvestmentFirms } from "@/lib/db/platform-queries"
import { sql } from "@/lib/db"

// Safe query helper
async function safeQuery<T>(query: Promise<T[]>, fallback: T[] = []): Promise<T[]> {
  try {
    return await query
  } catch {
    return fallback
  }
}

// Helper to get startup ID for the user
async function getStartupIdForUser(userId: string): Promise<string | null> {
  try {
    let startups = await sql`SELECT id FROM startups WHERE owner_id = ${userId} LIMIT 1`
    if (!startups.length) {
      startups = await sql`SELECT id FROM startups WHERE founder_id = ${userId} LIMIT 1`
    }
    return startups[0]?.id || null
  } catch {
    return null
  }
}

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return <div>Please sign in</div>
  }

  // Get startup ID for the user
  const startupId = await getStartupIdForUser(user.id)

  // Fetch deals, firms, and matches for the pipeline
  const [deals, firms] = await Promise.all([
    getDeals(200),
    getInvestmentFirms(200)
  ])

  // Fetch AI matches for this user's startup
  const matches = startupId 
    ? await safeQuery(sql`
        SELECT * FROM investor_matches 
        WHERE startup_id = ${startupId}
        ORDER BY score DESC
        LIMIT 100
      `)
    : []

  // Create lookup map for firms
  const firmMap = new Map(firms.map(f => [f.id, f]))
  
  // Enrich deals with firm data
  const enrichedDeals = deals.map(deal => ({
    ...deal,
    firm: deal.firm_id ? firmMap.get(deal.firm_id) : null
  }))

  return (
    <PipelineContent 
      user={user} 
      deals={enrichedDeals} 
      firms={firms} 
      matches={matches}
      startupId={startupId}
    />
  )
}
