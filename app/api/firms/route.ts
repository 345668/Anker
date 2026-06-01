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

<<<<<<< HEAD
    // Use only columns that actually exist in the investment_firms table
    // Columns: id, name, description, website, logo, type, aum, location, stages, sectors,
    // check_size_min, check_size_max, portfolio_count, linkedin_url, twitter_url,
    // created_at, hq_location, industry, emails, phones, status, logo_url, etc.
    
    // Build search pattern
    const searchPattern = search ? `%${search}%` : null
    const sectorPattern = sector && sector !== 'All Sectors' ? `%${sector}%` : null
    const stagePattern = stage && stage !== 'All Stages' ? `%${stage}%` : null
    const typePattern = type && type !== 'All Types' ? `%${type}%` : null
    
    // Single query with optional filters using COALESCE pattern
    firms = await sql`
      SELECT 
        id, name, type, website, hq_location, location,
        description, aum, check_size_min, check_size_max, typical_check_size,
        stages, sectors, industry, portfolio_count,
        logo, logo_url, linkedin_url, twitter_url, emails, phones,
        foundation_year, status, created_at, updated_at
      FROM investment_firms
      WHERE 
        (${searchPattern}::text IS NULL OR name ILIKE ${searchPattern} OR COALESCE(description, '') ILIKE ${searchPattern})
        AND (${sectorPattern}::text IS NULL OR COALESCE(sectors::text, '') ILIKE ${sectorPattern} OR COALESCE(industry, '') ILIKE ${sectorPattern})
        AND (${stagePattern}::text IS NULL OR COALESCE(stages::text, '') ILIKE ${stagePattern})
        AND (${typePattern}::text IS NULL OR COALESCE(type, '') ILIKE ${typePattern})
      ORDER BY name ASC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `
    
    countResult = await sql`
      SELECT COUNT(*) as count FROM investment_firms
      WHERE 
        (${searchPattern}::text IS NULL OR name ILIKE ${searchPattern} OR COALESCE(description, '') ILIKE ${searchPattern})
        AND (${sectorPattern}::text IS NULL OR COALESCE(sectors::text, '') ILIKE ${sectorPattern} OR COALESCE(industry, '') ILIKE ${sectorPattern})
        AND (${stagePattern}::text IS NULL OR COALESCE(stages::text, '') ILIKE ${stagePattern})
        AND (${typePattern}::text IS NULL OR COALESCE(type, '') ILIKE ${typePattern})
    `
=======
    if (search || sector || stage || type) {
      // Filtered query
      const searchPattern = search ? `%${search}%` : '%'
      
      firms = await sql`
        SELECT 
          id, name, type, firm_type, website, hq_location, location,
          description, aum, check_size_min, check_size_max, check_size_range,
          stages, sectors, industry, portfolio_count, investment_count,
          logo_url, linkedin_url, twitter_url,
          NULLIF((emails->>0)::text, '') AS email,
          NULLIF((phones->>0)::text, '') AS phone,
          founded_year, status, created_at, updated_at
        FROM investment_firms
        WHERE 
          (${!search} OR name ILIKE ${searchPattern} OR description ILIKE ${searchPattern})
          AND (${!sector} OR sectors::jsonb @> to_jsonb(${sector}::text) OR industry ILIKE ${'%' + sector + '%'})
          AND (${!stage} OR stages::jsonb @> to_jsonb(${stage}::text))
          AND (${!type} OR type ILIKE ${'%' + type + '%'} OR firm_type ILIKE ${'%' + type + '%'})
        ORDER BY name ASC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `
      
      countResult = await sql`
        SELECT COUNT(*) as count FROM investment_firms
        WHERE 
          (${!search} OR name ILIKE ${searchPattern} OR description ILIKE ${searchPattern})
          AND (${!sector} OR sectors::jsonb @> to_jsonb(${sector}::text) OR industry ILIKE ${'%' + sector + '%'})
          AND (${!stage} OR stages::jsonb @> to_jsonb(${stage}::text))
          AND (${!type} OR type ILIKE ${'%' + type + '%'} OR firm_type ILIKE ${'%' + type + '%'})
      `
    } else {
      // Unfiltered query - faster
      firms = await sql`
        SELECT 
          id, name, type, firm_type, website, hq_location, location,
          description, aum, check_size_min, check_size_max, check_size_range,
          stages, sectors, industry, portfolio_count, investment_count,
          logo_url, linkedin_url, twitter_url,
          NULLIF((emails->>0)::text, '') AS email,
          NULLIF((phones->>0)::text, '') AS phone,
          founded_year, status, created_at, updated_at
        FROM investment_firms
        ORDER BY name ASC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `
      
      countResult = await sql`SELECT COUNT(*) as count FROM investment_firms`
    }
>>>>>>> 1b7b1a42aaa812ac35eab39b4f1bcfb2161d299b

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
