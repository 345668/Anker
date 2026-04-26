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
