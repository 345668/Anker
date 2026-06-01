import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

const BATCH_SIZE = 200

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || String(BATCH_SIZE)), 500)
    const search = searchParams.get('search') || ''
    const sector = searchParams.get('sector') || ''
    const stage = searchParams.get('stage') || ''
    const type = searchParams.get('type') || ''
    
    const offset = (page - 1) * limit

    // Build dynamic query based on filters
    let firms
    let countResult

    if (search || sector || stage || type) {
      // Filtered query
      const searchPattern = search ? `%${search}%` : '%'
      
      firms = await sql`
        SELECT 
          id, name, type, firm_classification as firm_type, website, hq_location, location,
          description, aum, check_size_min, check_size_max, typical_check_size as check_size_range,
          stages, sectors, industry, portfolio_count,
          logo_url, linkedin_url, twitter_url,
          NULLIF((emails->>0)::text, '') AS email,
          NULLIF((phones->>0)::text, '') AS phone,
          foundation_year as founded_year, status, created_at, updated_at
        FROM investment_firms
        WHERE 
          (${!search} OR name ILIKE ${searchPattern} OR description ILIKE ${searchPattern})
          AND (${!sector} OR sectors::jsonb @> to_jsonb(${sector}::text) OR industry ILIKE ${'%' + sector + '%'})
          AND (${!stage} OR stages::jsonb @> to_jsonb(${stage}::text))
          AND (${!type} OR type ILIKE ${'%' + type + '%'} OR firm_classification ILIKE ${'%' + type + '%'})
        ORDER BY name ASC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `
      
      countResult = await sql`
        SELECT COUNT(*) as count FROM investment_firms
        WHERE 
          (${!search} OR name ILIKE ${searchPattern} OR description ILIKE ${searchPattern})
          AND (${!sector} OR sectors::jsonb @> to_jsonb(${sector}::text) OR industry ILIKE ${'%' + sector + '%'})
          AND (${!stage} OR stages::jsonb @> to_jsonb(${stage}::text))
          AND (${!type} OR type ILIKE ${'%' + type + '%'} OR firm_classification ILIKE ${'%' + type + '%'})
      `
    } else {
      // Unfiltered query - faster
      firms = await sql`
        SELECT 
          id, name, type, firm_classification as firm_type, website, hq_location, location,
          description, aum, check_size_min, check_size_max, typical_check_size as check_size_range,
          stages, sectors, industry, portfolio_count,
          logo_url, linkedin_url, twitter_url,
          NULLIF((emails->>0)::text, '') AS email,
          NULLIF((phones->>0)::text, '') AS phone,
          foundation_year as founded_year, status, created_at, updated_at
        FROM investment_firms
        ORDER BY name ASC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `
      
      countResult = await sql`SELECT COUNT(*) as count FROM investment_firms`
    }

    const total = parseInt(countResult[0]?.count || '0')
    const hasMore = offset + firms.length < total

    return NextResponse.json({
      firms,
      pagination: {
        page,
        limit,
        total,
        hasMore,
        loaded: offset + firms.length,
      }
    })
  } catch (error) {
    console.error('[v0] Error fetching firms:', error)
    return NextResponse.json(
      { error: 'Failed to fetch firms', firms: [], pagination: { total: 0, hasMore: false } },
      { status: 500 }
    )
  }
}
