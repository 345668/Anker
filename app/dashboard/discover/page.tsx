import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DiscoverContent } from "@/components/tesseract/discover-content"
import { 
  getInvestmentFirmCount,
} from "@/lib/db/platform-queries"
import { sql } from "@/lib/db"
import { isAdmin } from "@/lib/auth/admin"

// Server-side pagination - fetch all records for full dataset access
const ITEMS_PER_PAGE = 50000 // Increased to show full dataset

interface SearchParams {
  page?: string
  search?: string
  stage?: string
  type?: string
  country?: string
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  const userIsAdmin = isAdmin(user.email)
  const params = await searchParams

  // Parse pagination params
  const page = parseInt(params.page || '1', 10)
  const offset = (page - 1) * ITEMS_PER_PAGE

  // Fetch data with pagination
  const [firms, investors, matches, firmCount, investorCountResult] = await Promise.all([
    sql`
      SELECT * FROM investment_firms 
      ORDER BY name ASC 
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `,
    sql`
      SELECT * FROM investors 
      WHERE is_active = true
      ORDER BY total_investments DESC NULLS LAST, last_name ASC 
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `,
    sql`
      SELECT * FROM investor_matches 
      WHERE startup_id IN (
        SELECT id FROM startups WHERE owner_id = ${user.id}
        UNION
        SELECT id FROM startups WHERE founder_id = ${user.id}
      ) 
      ORDER BY score DESC
    `.catch(() => []),
    getInvestmentFirmCount(),
    sql`SELECT COUNT(*) as count FROM investors WHERE is_active = true`
  ])

  const investorCount = Number(investorCountResult[0]?.count || 0)

  // Convert to plain JSON objects to pass to client component
  const firmsArray = JSON.parse(JSON.stringify(firms || []))
  const investorsArray = JSON.parse(JSON.stringify(investors || []))
  const matchesArray = JSON.parse(JSON.stringify(matches || []))

  return (
    <DiscoverContent 
      user={user} 
      initialFirms={firmsArray}
      initialInvestors={investorsArray}
      initialMatches={matchesArray}
      isAdmin={userIsAdmin}
      currentPage={page}
      itemsPerPage={ITEMS_PER_PAGE}
      stats={{
        totalFirms: firmCount,
        totalInvestors: investorCount,
        totalMatches: matchesArray.length,
      }}
    />
  )
}
