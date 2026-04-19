import { sql } from '@/lib/db'
import type { InvestmentFirm, Startup, InvestorMatch } from '@/lib/db/types'

// Matching criteria weights
const WEIGHTS = {
  industry: 0.25,
  stage: 0.20,
  geography: 0.15,
  checkSize: 0.15,
  investorType: 0.10,
  teamSignals: 0.10,
  recency: 0.05,
}

// Industry similarity mapping
const INDUSTRY_GROUPS: Record<string, string[]> = {
  'tech': ['saas', 'software', 'ai', 'ml', 'data', 'cloud', 'devtools', 'enterprise'],
  'fintech': ['fintech', 'payments', 'banking', 'insurance', 'lending', 'crypto', 'blockchain', 'defi'],
  'health': ['healthtech', 'biotech', 'medtech', 'digital health', 'pharma', 'healthcare'],
  'consumer': ['consumer', 'e-commerce', 'retail', 'marketplace', 'dtc', 'd2c'],
  'climate': ['climate', 'cleantech', 'sustainability', 'energy', 'greentech'],
  'deep-tech': ['deeptech', 'robotics', 'hardware', 'semiconductors', 'space', 'quantum'],
}

// Stage mapping for compatibility
const STAGE_ORDER = ['pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'growth', 'late-stage']

export interface MatchResult {
  firmId: string
  firmName: string
  score: number
  factors: {
    industry: number
    stage: number
    geography: number
    checkSize: number
    investorType: number
    teamSignals: number
  }
  reasoning: string[]
}

// Calculate industry match score
function calculateIndustryScore(startupIndustry: string, firmIndustries: string[]): number {
  if (!startupIndustry || !firmIndustries?.length) return 0.3
  
  const normalizedStartup = startupIndustry.toLowerCase().trim()
  const normalizedFirm = firmIndustries.map(i => i.toLowerCase().trim())
  
  // Direct match
  if (normalizedFirm.includes(normalizedStartup)) return 1.0
  
  // Check if in same industry group
  for (const [group, industries] of Object.entries(INDUSTRY_GROUPS)) {
    const startupInGroup = industries.some(i => normalizedStartup.includes(i) || i.includes(normalizedStartup))
    const firmInGroup = normalizedFirm.some(fi => industries.some(i => fi.includes(i) || i.includes(fi)))
    
    if (startupInGroup && firmInGroup) return 0.8
  }
  
  // Partial keyword match
  const startupKeywords = normalizedStartup.split(/[\s,\/]+/)
  const firmKeywords = normalizedFirm.flatMap(f => f.split(/[\s,\/]+/))
  const overlap = startupKeywords.filter(k => firmKeywords.some(fk => fk.includes(k) || k.includes(fk)))
  
  if (overlap.length > 0) return 0.5 + (overlap.length / startupKeywords.length) * 0.3
  
  return 0.2
}

// Calculate stage match score
function calculateStageScore(startupStage: string, firmStages: string[]): number {
  if (!startupStage || !firmStages?.length) return 0.3
  
  const normalizedStartup = startupStage.toLowerCase().replace(/[_\s]/g, '-')
  const normalizedFirm = firmStages.map(s => s.toLowerCase().replace(/[_\s]/g, '-'))
  
  // Direct match
  if (normalizedFirm.includes(normalizedStartup)) return 1.0
  
  // Adjacent stage (investors often invest in adjacent stages)
  const startupIdx = STAGE_ORDER.findIndex(s => normalizedStartup.includes(s) || s.includes(normalizedStartup))
  if (startupIdx === -1) return 0.3
  
  for (const firmStage of normalizedFirm) {
    const firmIdx = STAGE_ORDER.findIndex(s => firmStage.includes(s) || s.includes(firmStage))
    if (firmIdx === -1) continue
    
    const distance = Math.abs(startupIdx - firmIdx)
    if (distance === 0) return 1.0
    if (distance === 1) return 0.7
    if (distance === 2) return 0.4
  }
  
  return 0.2
}

// Calculate geography match score
function calculateGeographyScore(startupLocation: string | null, firmLocation: string | null): number {
  if (!startupLocation || !firmLocation) return 0.5 // Neutral if unknown
  
  const normalizedStartup = startupLocation.toLowerCase()
  const normalizedFirm = firmLocation.toLowerCase()
  
  // Same city/location
  if (normalizedStartup === normalizedFirm) return 1.0
  
  // Same country
  const countries = ['usa', 'us', 'united states', 'uk', 'germany', 'france', 'india', 'china', 'japan', 'canada', 'australia']
  for (const country of countries) {
    if (normalizedStartup.includes(country) && normalizedFirm.includes(country)) return 0.8
  }
  
  // Same region
  const regions: Record<string, string[]> = {
    'north-america': ['usa', 'us', 'united states', 'canada', 'mexico'],
    'europe': ['uk', 'germany', 'france', 'spain', 'italy', 'netherlands', 'sweden', 'switzerland', 'berlin', 'london', 'paris'],
    'asia': ['china', 'japan', 'korea', 'india', 'singapore', 'hong kong'],
    'global': ['global', 'worldwide', 'international'],
  }
  
  for (const [region, locations] of Object.entries(regions)) {
    const startupInRegion = locations.some(l => normalizedStartup.includes(l))
    const firmInRegion = locations.some(l => normalizedFirm.includes(l))
    if (startupInRegion && firmInRegion) return 0.6
  }
  
  // Check if firm invests globally
  if (normalizedFirm.includes('global') || normalizedFirm.includes('worldwide')) return 0.5
  
  return 0.3
}

// Calculate check size match score
function calculateCheckSizeScore(
  targetRaise: number | null,
  firmMinCheck: number | null,
  firmMaxCheck: number | null
): number {
  if (!targetRaise) return 0.5
  if (!firmMinCheck && !firmMaxCheck) return 0.5
  
  const minCheck = firmMinCheck || 0
  const maxCheck = firmMaxCheck || Infinity
  
  // Perfect fit - target is within range
  if (targetRaise >= minCheck && targetRaise <= maxCheck) return 1.0
  
  // Slightly outside range
  if (targetRaise < minCheck) {
    const ratio = targetRaise / minCheck
    if (ratio > 0.5) return 0.6
    if (ratio > 0.25) return 0.4
    return 0.2
  }
  
  if (targetRaise > maxCheck) {
    const ratio = maxCheck / targetRaise
    if (ratio > 0.5) return 0.6
    if (ratio > 0.25) return 0.4
    return 0.2
  }
  
  return 0.3
}

// Calculate investor type preference score
function calculateInvestorTypeScore(startupPreferences: string[] | null, firmType: string | null): number {
  if (!startupPreferences?.length || !firmType) return 0.5
  
  const normalizedFirmType = firmType.toLowerCase()
  const normalizedPrefs = startupPreferences.map(p => p.toLowerCase())
  
  if (normalizedPrefs.some(p => normalizedFirmType.includes(p) || p.includes(normalizedFirmType))) {
    return 1.0
  }
  
  return 0.4
}

// Calculate team signals score (based on firm's track record)
function calculateTeamSignalsScore(firmPortfolioCount: number | null, firmAUM: number | null): number {
  let score = 0.5
  
  // Prefer firms with proven track record
  if (firmPortfolioCount) {
    if (firmPortfolioCount > 100) score += 0.2
    else if (firmPortfolioCount > 50) score += 0.15
    else if (firmPortfolioCount > 20) score += 0.1
  }
  
  // Consider AUM as signal of resources
  if (firmAUM) {
    if (firmAUM > 1000000000) score += 0.2 // $1B+
    else if (firmAUM > 500000000) score += 0.15
    else if (firmAUM > 100000000) score += 0.1
  }
  
  return Math.min(score, 1.0)
}

// Generate reasoning for match
function generateReasoning(factors: MatchResult['factors'], firmName: string): string[] {
  const reasons: string[] = []
  
  if (factors.industry >= 0.8) {
    reasons.push(`Strong industry alignment with ${firmName}'s focus areas`)
  } else if (factors.industry >= 0.5) {
    reasons.push(`Related industry interests`)
  }
  
  if (factors.stage >= 0.8) {
    reasons.push(`Actively investing at your current stage`)
  } else if (factors.stage >= 0.5) {
    reasons.push(`Has invested in adjacent stages`)
  }
  
  if (factors.checkSize >= 0.8) {
    reasons.push(`Check size aligns well with your raise target`)
  }
  
  if (factors.geography >= 0.7) {
    reasons.push(`Geographic presence in your market`)
  }
  
  if (factors.teamSignals >= 0.7) {
    reasons.push(`Strong track record with portfolio companies`)
  }
  
  if (reasons.length === 0) {
    reasons.push(`Potential strategic fit based on overall profile`)
  }
  
  return reasons
}

// Main matching function
export async function runMatchingEngine(startupId: string): Promise<MatchResult[]> {
  // Fetch startup profile
  const startups = await sql<Startup[]>`
    SELECT * FROM startups WHERE id = ${startupId}
  `
  
  if (!startups.length) {
    throw new Error('Startup not found')
  }
  
  const startup = startups[0]
  
  // Fetch all investment firms
  const firms = await sql<InvestmentFirm[]>`
    SELECT * FROM investment_firms 
    WHERE status = 'active' OR status IS NULL
    ORDER BY name
  `
  
  const matches: MatchResult[] = []
  
  for (const firm of firms) {
    const factors = {
      industry: calculateIndustryScore(
        startup.industry || '',
        firm.industries as string[] || []
      ),
      stage: calculateStageScore(
        startup.stage || '',
        firm.stages as string[] || []
      ),
      geography: calculateGeographyScore(
        startup.location,
        firm.headquarters
      ),
      checkSize: calculateCheckSizeScore(
        startup.funding_target ? Number(startup.funding_target) : null,
        firm.check_size_min ? Number(firm.check_size_min) : null,
        firm.check_size_max ? Number(firm.check_size_max) : null
      ),
      investorType: calculateInvestorTypeScore(
        null, // Could add investor type preferences to startup profile
        firm.type
      ),
      teamSignals: calculateTeamSignalsScore(
        firm.portfolio_count,
        firm.aum ? Number(firm.aum) : null
      ),
    }
    
    // Calculate weighted score
    const score = (
      factors.industry * WEIGHTS.industry +
      factors.stage * WEIGHTS.stage +
      factors.geography * WEIGHTS.geography +
      factors.checkSize * WEIGHTS.checkSize +
      factors.investorType * WEIGHTS.investorType +
      factors.teamSignals * WEIGHTS.teamSignals
    )
    
    matches.push({
      firmId: firm.id,
      firmName: firm.name,
      score: Math.round(score * 100) / 100,
      factors,
      reasoning: generateReasoning(factors, firm.name),
    })
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score)
  
  return matches
}

// Save matches to database
export async function saveMatches(
  startupId: string,
  matches: MatchResult[],
  limit: number = 100
): Promise<void> {
  // Clear existing matches for this startup
  await sql`DELETE FROM investor_matches WHERE startup_id = ${startupId}`
  
  // Insert top matches
  const topMatches = matches.slice(0, limit)
  
  for (const match of topMatches) {
    await sql`
      INSERT INTO investor_matches (
        startup_id,
        firm_id,
        match_score,
        industry_score,
        stage_score,
        geography_score,
        check_size_score,
        investor_type_score,
        team_signals_score,
        match_reasons,
        status,
        created_at
      ) VALUES (
        ${startupId},
        ${match.firmId},
        ${match.score},
        ${match.factors.industry},
        ${match.factors.stage},
        ${match.factors.geography},
        ${match.factors.checkSize},
        ${match.factors.investorType},
        ${match.factors.teamSignals},
        ${JSON.stringify(match.reasoning)},
        'pending',
        NOW()
      )
    `
  }
}

// Get matches for a startup
export async function getMatchesForStartup(startupId: string): Promise<InvestorMatch[]> {
  return sql<InvestorMatch[]>`
    SELECT im.*, if.name as firm_name, if.logo_url, if.type as firm_type, 
           if.headquarters, if.website, if.industries, if.stages
    FROM investor_matches im
    JOIN investment_firms if ON im.firm_id = if.id
    WHERE im.startup_id = ${startupId}
    ORDER BY im.match_score DESC
  `
}
