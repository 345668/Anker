// Tesseract Platform Database Queries
import { sql } from './index'
import type { 
  InvestmentFirm, 
  Investor, 
  Startup, 
  Deal, 
  Contact, 
  InvestorMatch, 
  Outreach,
  DealStage,
  OutreachStage
} from './types'

// ============ INVESTMENT FIRMS ============

export async function getInvestmentFirms(limit = 50, offset = 0): Promise<InvestmentFirm[]> {
  return sql`
    SELECT * FROM investment_firms 
    ORDER BY name ASC 
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function getInvestmentFirmById(id: string): Promise<InvestmentFirm | null> {
  const results = await sql`SELECT * FROM investment_firms WHERE id = ${id}`
  return results[0] || null
}

export async function searchInvestmentFirms(query: string, limit = 20): Promise<InvestmentFirm[]> {
  return sql`
    SELECT * FROM investment_firms 
    WHERE name ILIKE ${'%' + query + '%'} 
       OR description ILIKE ${'%' + query + '%'}
    ORDER BY name ASC 
    LIMIT ${limit}
  `
}

export async function getInvestmentFirmsByStage(stage: string, limit = 50): Promise<InvestmentFirm[]> {
  return sql`
    SELECT * FROM investment_firms 
    WHERE ${stage} = ANY(stages)
    ORDER BY name ASC 
    LIMIT ${limit}
  `
}

export async function getInvestmentFirmsByIndustry(industry: string, limit = 50): Promise<InvestmentFirm[]> {
  return sql`
    SELECT * FROM investment_firms 
    WHERE ${industry} = ANY(industries)
    ORDER BY name ASC 
    LIMIT ${limit}
  `
}

// ============ INVESTORS ============

export interface InvestorFilters {
  search?: string
  investorType?: string
  fundingStage?: string
  country?: string
  checkSize?: string
  hasEmail?: boolean
  hasLinkedIn?: boolean
  limit?: number
  offset?: number
}

export async function getInvestors(limit = 50, offset = 0): Promise<Investor[]> {
  return sql`
    SELECT * FROM investors 
    WHERE is_active = true
    ORDER BY total_investments DESC NULLS LAST, last_name ASC 
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function getInvestorsWithFilters(filters: InvestorFilters): Promise<Investor[]> {
  const { search, investorType, fundingStage, country, checkSize, hasEmail, hasLinkedIn, limit = 50, offset = 0 } = filters
  
  let query = sql`
    SELECT * FROM investors 
    WHERE is_active = true
  `
  
  if (search) {
    query = sql`${query} AND (
      first_name ILIKE ${'%' + search + '%'} 
      OR last_name ILIKE ${'%' + search + '%'}
      OR email ILIKE ${'%' + search + '%'}
      OR title ILIKE ${'%' + search + '%'}
    )`
  }
  
  if (investorType && investorType !== 'all') {
    query = sql`${query} AND investor_type = ${investorType}`
  }
  
  if (fundingStage && fundingStage !== 'all') {
    query = sql`${query} AND funding_stage = ${fundingStage}`
  }
  
  if (country && country !== 'all') {
    query = sql`${query} AND investor_country = ${country}`
  }
  
  if (checkSize && checkSize !== 'all') {
    query = sql`${query} AND typical_check_size = ${checkSize}`
  }
  
  if (hasEmail) {
    query = sql`${query} AND email IS NOT NULL`
  }
  
  if (hasLinkedIn) {
    query = sql`${query} AND (linkedin_url IS NOT NULL OR person_linkedin_url IS NOT NULL)`
  }
  
  query = sql`${query} ORDER BY total_investments DESC NULLS LAST, last_name ASC LIMIT ${limit} OFFSET ${offset}`
  
  return query
}

export async function getInvestorById(id: string): Promise<Investor | null> {
  const results = await sql`SELECT * FROM investors WHERE id = ${id}`
  return results[0] || null
}

export async function getInvestorsByFirm(firmId: string): Promise<Investor[]> {
  return sql`
    SELECT * FROM investors 
    WHERE firm_id = ${firmId}
    ORDER BY total_investments DESC NULLS LAST, last_name ASC
  `
}

export async function searchInvestors(query: string, limit = 20): Promise<Investor[]> {
  return sql`
    SELECT * FROM investors 
    WHERE is_active = true AND (
      first_name ILIKE ${'%' + query + '%'} 
      OR last_name ILIKE ${'%' + query + '%'}
      OR email ILIKE ${'%' + query + '%'}
      OR title ILIKE ${'%' + query + '%'}
    )
    ORDER BY total_investments DESC NULLS LAST 
    LIMIT ${limit}
  `
}

export async function getInvestorsByType(investorType: string, limit = 50): Promise<Investor[]> {
  return sql`
    SELECT * FROM investors 
    WHERE is_active = true AND investor_type = ${investorType}
    ORDER BY total_investments DESC NULLS LAST 
    LIMIT ${limit}
  `
}

export async function getInvestorCountByType(): Promise<{ investor_type: string; count: number }[]> {
  return sql`
    SELECT investor_type, COUNT(*) as count
    FROM investors 
    WHERE is_active = true AND investor_type IS NOT NULL
    GROUP BY investor_type
    ORDER BY count DESC
  `
}

export async function getInvestorCountByCountry(): Promise<{ country: string; count: number }[]> {
  return sql`
    SELECT investor_country as country, COUNT(*) as count
    FROM investors 
    WHERE is_active = true AND investor_country IS NOT NULL
    GROUP BY investor_country
    ORDER BY count DESC
    LIMIT 20
  `
}

export async function getInvestorStats(): Promise<{
  total: number
  withEmail: number
  withLinkedIn: number
  byType: Record<string, number>
}> {
  const [totals, byType] = await Promise.all([
    sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE email IS NOT NULL) as with_email,
        COUNT(*) FILTER (WHERE linkedin_url IS NOT NULL OR person_linkedin_url IS NOT NULL) as with_linkedin
      FROM investors WHERE is_active = true
    `,
    sql`
      SELECT investor_type, COUNT(*) as count
      FROM investors 
      WHERE is_active = true AND investor_type IS NOT NULL
      GROUP BY investor_type
    `
  ])
  
  const typeMap: Record<string, number> = {}
  byType.forEach((row: { investor_type: string; count: string }) => {
    typeMap[row.investor_type] = Number(row.count)
  })
  
  return {
    total: Number(totals[0]?.total || 0),
    withEmail: Number(totals[0]?.with_email || 0),
    withLinkedIn: Number(totals[0]?.with_linkedin || 0),
    byType: typeMap
  }
}

// ============ STARTUPS ============

export async function getStartups(limit = 50, offset = 0): Promise<Startup[]> {
  return sql`
    SELECT * FROM startups 
    ORDER BY created_at DESC 
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function getStartupById(id: string): Promise<Startup | null> {
  const results = await sql`SELECT * FROM startups WHERE id = ${id}`
  return results[0] || null
}

export async function getStartupByOwnerId(ownerId: string): Promise<Startup | null> {
  // startups table uses founder_id, not owner_id
  const results = await sql`SELECT * FROM startups WHERE founder_id = ${ownerId}`
  return results[0] || null
}

export async function getStartupsByStage(stage: string, limit = 50): Promise<Startup[]> {
  return sql`
    SELECT * FROM startups 
    WHERE stage = ${stage}
    ORDER BY created_at DESC 
    LIMIT ${limit}
  `
}

export async function updateStartup(id: string, data: Partial<Startup>): Promise<Startup | null> {
  const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'created_at')
  if (fields.length === 0) return getStartupById(id)
  
  const setClauses = fields.map(f => `${f} = ${data[f as keyof Startup]}`).join(', ')
  const results = await sql`
    UPDATE startups 
    SET ${sql.unsafe(setClauses)}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return results[0] || null
}

// ============ DEALS ============

export async function getDeals(limit = 50, offset = 0): Promise<Deal[]> {
  return sql`
    SELECT d.*, d.title as name, d.deal_size as amount, f.name as firm_name 
    FROM deals d
    LEFT JOIN investment_firms f ON d.firm_id = f.id
    ORDER BY d.created_at DESC 
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function getDealById(id: string): Promise<Deal | null> {
  const results = await sql`SELECT * FROM deals WHERE id = ${id}`
  return results[0] || null
}

export async function getDealsByStartup(startupId: string): Promise<Deal[]> {
  return sql`
    SELECT * FROM deals 
    WHERE startup_id = ${startupId}
    ORDER BY created_at DESC
  `
}

export async function getDealsByStage(stage: DealStage): Promise<Deal[]> {
  return sql`
    SELECT * FROM deals 
    WHERE stage = ${stage}
    ORDER BY created_at DESC
  `
}

export async function getDealsByFirm(firmId: string): Promise<Deal[]> {
  return sql`
    SELECT * FROM deals 
    WHERE firm_id = ${firmId}
    ORDER BY created_at DESC
  `
}

export async function getActiveDeals(startupId: string): Promise<Deal[]> {
  return sql`
    SELECT * FROM deals 
    WHERE startup_id = ${startupId}
      AND status NOT IN ('closed_won', 'closed_lost')
    ORDER BY probability DESC, created_at DESC
  `
}

export async function getDealsPipeline(startupId: string): Promise<{ stage: string; count: number; total_amount: number }[]> {
  return sql`
    SELECT stage, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
    FROM deals 
    WHERE startup_id = ${startupId}
    GROUP BY stage
    ORDER BY stage
  `
}

export async function updateDealStage(id: string, stage: DealStage, notes?: string): Promise<Deal | null> {
  const results = await sql`
    UPDATE deals 
    SET stage = ${stage}, 
        notes = COALESCE(${notes}, notes),
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return results[0] || null
}

// ============ CONTACTS (CRM) ============

export async function getContacts(limit = 50, offset = 0): Promise<Contact[]> {
  return sql`
    SELECT * FROM contacts 
    ORDER BY last_contacted_at DESC NULLS LAST, created_at DESC 
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function getContactById(id: string): Promise<Contact | null> {
  const results = await sql`SELECT * FROM contacts WHERE id = ${id}`
  return results[0] || null
}

export async function getContactsByOwner(ownerId: string, limit = 100): Promise<Contact[]> {
  return sql`
    SELECT * FROM contacts 
    WHERE owner_id = ${ownerId}
    ORDER BY last_contacted_at DESC NULLS LAST 
    LIMIT ${limit}
  `
}

export async function getContactsByFirm(firmId: string): Promise<Contact[]> {
  return sql`
    SELECT * FROM contacts 
    WHERE firm_id = ${firmId}
    ORDER BY last_name ASC
  `
}

export async function searchContacts(query: string, limit = 20): Promise<Contact[]> {
  return sql`
    SELECT * FROM contacts 
    WHERE first_name ILIKE ${'%' + query + '%'} 
       OR last_name ILIKE ${'%' + query + '%'}
       OR email ILIKE ${'%' + query + '%'}
       OR company ILIKE ${'%' + query + '%'}
    ORDER BY last_name ASC 
    LIMIT ${limit}
  `
}

export async function updateContactLastContacted(id: string): Promise<void> {
  await sql`
    UPDATE contacts 
    SET last_contacted_at = NOW(), updated_at = NOW()
    WHERE id = ${id}
  `
}

// ============ INVESTOR MATCHES ============

export async function getInvestorMatches(startupId: string, limit = 100): Promise<InvestorMatch[]> {
  return sql`
    SELECT * FROM investor_matches 
    WHERE startup_id = ${startupId}
    ORDER BY score DESC 
    LIMIT ${limit}
  `
}

export async function getInvestorMatchesByTier(startupId: string, tier: string): Promise<InvestorMatch[]> {
  return sql`
    SELECT * FROM investor_matches 
    WHERE startup_id = ${startupId} AND tier = ${tier}
    ORDER BY score DESC
  `
}

export async function getTopMatches(startupId: string, limit = 10): Promise<InvestorMatch[]> {
  return sql`
    SELECT * FROM investor_matches 
    WHERE startup_id = ${startupId}
    ORDER BY score DESC 
    LIMIT ${limit}
  `
}

export async function getMatchById(id: string): Promise<InvestorMatch | null> {
  const results = await sql`SELECT * FROM investor_matches WHERE id = ${id}`
  return results[0] || null
}

export async function updateMatchStatus(id: string, status: string, notes?: string): Promise<InvestorMatch | null> {
  const results = await sql`
    UPDATE investor_matches 
    SET status = ${status}, 
        status_notes = COALESCE(${notes}, status_notes),
        status_updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return results[0] || null
}

export async function getMatchStats(startupId: string): Promise<{ tier: string; count: number; avg_score: number }[]> {
  return sql`
    SELECT tier, COUNT(*) as count, ROUND(AVG(score)) as avg_score
    FROM investor_matches 
    WHERE startup_id = ${startupId}
    GROUP BY tier
    ORDER BY avg_score DESC
  `
}

// ============ OUTREACHES (Pipeline) ============

export async function getOutreaches(startupId: string, limit = 100): Promise<Outreach[]> {
  return sql`
    SELECT * FROM outreaches 
    WHERE startup_id = ${startupId}
    ORDER BY created_at DESC 
    LIMIT ${limit}
  `
}

export async function getOutreachById(id: string): Promise<Outreach | null> {
  const results = await sql`SELECT * FROM outreaches WHERE id = ${id}`
  return results[0] || null
}

export async function getOutreachesByStage(startupId: string, stage: OutreachStage): Promise<Outreach[]> {
  return sql`
    SELECT * FROM outreaches 
    WHERE startup_id = ${startupId} AND stage = ${stage}
    ORDER BY created_at DESC
  `
}

export async function getOutreachPipeline(startupId: string): Promise<{ stage: string; count: number }[]> {
  return sql`
    SELECT stage, COUNT(*) as count
    FROM outreaches 
    WHERE startup_id = ${startupId}
    GROUP BY stage
    ORDER BY stage
  `
}

export async function updateOutreachStage(id: string, stage: OutreachStage): Promise<Outreach | null> {
  const results = await sql`
    UPDATE outreaches 
    SET stage = ${stage}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return results[0] || null
}

export async function markOutreachOpened(id: string): Promise<void> {
  await sql`
    UPDATE outreaches 
    SET opened_at = NOW(), stage = 'opened', updated_at = NOW()
    WHERE id = ${id} AND opened_at IS NULL
  `
}

export async function markOutreachReplied(id: string): Promise<void> {
  await sql`
    UPDATE outreaches 
    SET replied_at = NOW(), stage = 'replied', updated_at = NOW()
    WHERE id = ${id}
  `
}

export async function getOutreachesWithDetails(startupId: string, limit = 100): Promise<(Outreach & { 
  investor_name?: string
  investor_email?: string
  firm_name?: string
})[]> {
  return sql`
    SELECT 
      o.*,
      CONCAT(i.first_name, ' ', i.last_name) as investor_name,
      i.email as investor_email,
      f.name as firm_name
    FROM outreaches o
    LEFT JOIN investors i ON o.investor_id = i.id
    LEFT JOIN investment_firms f ON o.firm_id = f.id
    WHERE o.startup_id = ${startupId}
    ORDER BY o.created_at DESC 
    LIMIT ${limit}
  `
}

export async function createOutreach(data: {
  owner_id: string
  startup_id: string
  investor_id?: string
  firm_id?: string
  stage?: string
  notes?: string
}): Promise<Outreach> {
  const id = crypto.randomUUID()
  const results = await sql`
    INSERT INTO outreaches (id, owner_id, startup_id, investor_id, firm_id, stage, notes, created_at, updated_at)
    VALUES (${id}, ${data.owner_id}, ${data.startup_id}, ${data.investor_id || null}, ${data.firm_id || null}, ${data.stage || 'draft'}, ${data.notes || null}, NOW(), NOW())
    RETURNING *
  `
  return results[0]
}

export async function getOutreachCountByStage(startupId: string): Promise<Record<string, number>> {
  const results = await sql`
    SELECT stage, COUNT(*) as count
    FROM outreaches 
    WHERE startup_id = ${startupId}
    GROUP BY stage
  `
  const counts: Record<string, number> = {}
  results.forEach((r: { stage: string; count: string }) => {
    counts[r.stage] = Number(r.count)
  })
  return counts
}

export async function getInvestmentFirmCount(): Promise<number> {
  const results = await sql`SELECT COUNT(*) as count FROM investment_firms`
  return Number(results[0]?.count || 0)
}

// ============ DASHBOARD STATS ============

export async function getDashboardStats(startupId: string): Promise<{
  totalMatches: number
  topTierMatches: number
  activeDeals: number
  totalOutreaches: number
  repliedOutreaches: number
  meetingsScheduled: number
}> {
  const [matches, deals, outreaches] = await Promise.all([
    sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE tier IN ('S', 'A')) as top_tier
      FROM investor_matches 
      WHERE startup_id = ${startupId}
    `,
    sql`
      SELECT COUNT(*) as count
      FROM deals 
      WHERE startup_id = ${startupId} AND status NOT IN ('closed_won', 'closed_lost')
    `,
    sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE replied_at IS NOT NULL) as replied,
        COUNT(*) FILTER (WHERE scheduled_call_at IS NOT NULL) as meetings
      FROM outreaches 
      WHERE startup_id = ${startupId}
    `
  ])

  return {
    totalMatches: Number(matches[0]?.total || 0),
    topTierMatches: Number(matches[0]?.top_tier || 0),
    activeDeals: Number(deals[0]?.count || 0),
    totalOutreaches: Number(outreaches[0]?.total || 0),
    repliedOutreaches: Number(outreaches[0]?.replied || 0),
    meetingsScheduled: Number(outreaches[0]?.meetings || 0)
  }
}
