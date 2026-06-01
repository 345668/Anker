import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DiscoverContent } from "@/components/tesseract/discover-content"
import { sql } from "@/lib/db"
import { isAdmin } from "@/lib/auth/admin"

// Server-side pagination - use smaller batches for fast initial load
// Client-side SWR infinite loading will fetch more as user scrolls/clicks
const ITEMS_PER_PAGE = 100 // Small initial batch for fast page load

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

  // Fetch investors with error handling - use correct column names from investors table
  // The investors table has: id, user_id, firm_id, first_name, last_name, email, phone, title, 
  // linkedin_url, twitter_url, avatar, bio, stages, sectors, location, is_active, created_at, updated_at
  investors = await safeQuery(async () => {
    return await sql`
      SELECT 
        i.id, i.user_id, i.firm_id, i.first_name, i.last_name, i.email, i.phone,
        i.title, i.linkedin_url, i.twitter_url, i.avatar, i.bio, i.stages, i.sectors,
        i.location, i.is_active, i.created_at, i.updated_at, i.folk_id, i.source,
        f.name as firm_name
      FROM investors i
      LEFT JOIN investment_firms f ON i.firm_id = f.id
      ORDER BY i.last_name ASC NULLS LAST, i.first_name ASC NULLS LAST
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `
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

  // Get investor count - don't filter by is_active to show all 46k+ investors
  investorCount = await safeCount(async () => {
    return await sql`SELECT COUNT(*) as count FROM investors`
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
