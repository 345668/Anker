import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DiscoverContent } from "@/components/tesseract/discover-content"
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

// Safe query helper that returns empty array on error
async function safeQuery<T>(queryFn: () => Promise<T[]>, fallback: T[] = []): Promise<T[]> {
  try {
    return await queryFn()
  } catch (error) {
    console.error('[v0] Query failed:', error)
    return fallback
  }
}

// Safe count query
async function safeCount(queryFn: () => Promise<{ count: number | string }[]>): Promise<number> {
  try {
    const result = await queryFn()
    return Number(result[0]?.count || 0)
  } catch (error) {
    console.error('[v0] Count query failed:', error)
    return 0
  }
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

  // Initialize with safe defaults
  let firms: Record<string, unknown>[] = []
  let investors: Record<string, unknown>[] = []
  let matches: Record<string, unknown>[] = []
  let firmCount = 0
  let investorCount = 0

  // Fetch firms with error handling
  firms = await safeQuery(async () => {
    return await sql`
      SELECT * FROM investment_firms 
      ORDER BY name ASC 
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `
  })

  // Fetch investors with error handling
  investors = await safeQuery(async () => {
    // Try with is_active first
    try {
      return await sql`
        SELECT * FROM investors 
        WHERE is_active = true
        ORDER BY total_investments DESC NULLS LAST, last_name ASC 
        LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
      `
    } catch {
      // Fallback without is_active column
      return await sql`
        SELECT * FROM investors 
        ORDER BY last_name ASC 
        LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
      `
    }
  })

  // Fetch matches with error handling
  matches = await safeQuery(async () => {
    return await sql`
      SELECT * FROM investor_matches 
      WHERE startup_id IN (
        SELECT id FROM startups WHERE owner_id = ${user.id}
        UNION
        SELECT id FROM startups WHERE founder_id = ${user.id}
      ) 
      ORDER BY score DESC
    `
  })

  // Get firm count
  firmCount = await safeCount(async () => {
    return await sql`SELECT COUNT(*) as count FROM investment_firms`
  })

  // Get investor count
  investorCount = await safeCount(async () => {
    try {
      return await sql`SELECT COUNT(*) as count FROM investors WHERE is_active = true`
    } catch {
      return await sql`SELECT COUNT(*) as count FROM investors`
    }
  })

  // Convert to plain JSON objects to pass to client component
  const firmsArray = JSON.parse(JSON.stringify(firms))
  const investorsArray = JSON.parse(JSON.stringify(investors))
  const matchesArray = JSON.parse(JSON.stringify(matches))

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
