import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)
    const search = searchParams.get('search') || ''
    const sector = searchParams.get('sector') || ''
    const stage = searchParams.get('stage') || ''
    const offset = (page - 1) * limit

    // Build query based on filters
    let investors
    
    if (search) {
      investors = await sql`
        SELECT 
          i.id, i.firm_id, i.first_name, i.last_name, i.email, i.phone,
          i.title, i.linkedin_url, i.avatar, i.bio, i.stages, i.sectors,
          i.location, i.created_at,
          f.name as firm_name
        FROM investors i
        LEFT JOIN investment_firms f ON i.firm_id = f.id
        WHERE 
          i.first_name ILIKE ${'%' + search + '%'}
          OR i.last_name ILIKE ${'%' + search + '%'}
          OR i.email ILIKE ${'%' + search + '%'}
          OR i.title ILIKE ${'%' + search + '%'}
          OR f.name ILIKE ${'%' + search + '%'}
        ORDER BY i.last_name ASC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `
    } else if (sector && sector !== 'All Sectors') {
      investors = await sql`
        SELECT 
          i.id, i.firm_id, i.first_name, i.last_name, i.email, i.phone,
          i.title, i.linkedin_url, i.avatar, i.bio, i.stages, i.sectors,
          i.location, i.created_at,
          f.name as firm_name
        FROM investors i
        LEFT JOIN investment_firms f ON i.firm_id = f.id
        WHERE ${sector} = ANY(i.sectors) OR ${sector} = ANY(f.sectors) OR f.industry ILIKE ${'%' + sector + '%'}
        ORDER BY i.last_name ASC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `
    } else if (stage && stage !== 'All Stages') {
      investors = await sql`
        SELECT 
          i.id, i.firm_id, i.first_name, i.last_name, i.email, i.phone,
          i.title, i.linkedin_url, i.avatar, i.bio, i.stages, i.sectors,
          i.location, i.created_at,
          f.name as firm_name
        FROM investors i
        LEFT JOIN investment_firms f ON i.firm_id = f.id
        WHERE ${stage} = ANY(i.stages) OR ${stage} = ANY(f.stages)
        ORDER BY i.last_name ASC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      investors = await sql`
        SELECT 
          i.id, i.firm_id, i.first_name, i.last_name, i.email, i.phone,
          i.title, i.linkedin_url, i.avatar, i.bio, i.stages, i.sectors,
          i.location, i.created_at,
          f.name as firm_name
        FROM investors i
        LEFT JOIN investment_firms f ON i.firm_id = f.id
        ORDER BY i.last_name ASC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    // Get total count
    const countResult = await sql`SELECT COUNT(*) as count FROM investors`
    const total = Number(countResult[0]?.count || 0)

    return NextResponse.json({
      investors,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + investors.length < total
      }
    })
  } catch (error) {
    console.error('[v0] Error fetching investors:', error)
    return NextResponse.json({ error: 'Failed to fetch investors' }, { status: 500 })
  }
}
