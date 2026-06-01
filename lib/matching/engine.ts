import { sql } from '@/lib/db'
import type { InvestmentFirm, Startup, InvestorMatch } from '@/lib/db/types'
import { hasSectorOverlap, synonymJaccard, expandSynonyms } from './industry-synonyms'

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

/**
 * Jaccard similarity with synonym expansion
 * Fixes the issue where "ai" !== "artificial intelligence" → score = 0
 */
export function jaccardWithSynonyms(a: string[], b: string[]): number {
  return synonymJaccard(a, b)
}

/**
 * Robust check size range parser
 * Handles: "$250K", "1-5M", "Typically $500K-$2M", "$1M+", etc.
 */
export function parseCheckSizeRange(raw?: string | null): [number, number] | null {
  if (!raw) return null
  
  const cleaned = raw
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .replace(/typically|about|approximately|around|up to|upto/gi, "")
    .trim()
  
  if (!cleaned) return null
  
  function parseAmount(str: string): number | null {
    const match = str.match(/\$?\s*([\d.]+)\s*(b|bn|billion|m|mn|mm|million|k|thousand)?/i)
    if (!match) return null
    const num = parseFloat(match[1])
    if (isNaN(num)) return null
    const unit = (match[2] ?? "").toLowerCase()
    if (unit.startsWith("b")) return num * 1_000_000_000
    if (unit.startsWith("m")) return num * 1_000_000
    if (unit.startsWith("k") || unit.startsWith("t")) return num * 1_000
    // No unit - guess based on size
    if (num >= 1000) return num // looks like raw dollars
    if (num >= 1) return num * 1_000_000 // likely millions
    return num
  }
  
  // Range pattern: "$500K - $2M", "$1M-$5M", "500k-2m"
  const rangeMatch = cleaned.match(/\$?\s*([\d.]+)\s*([bkmnt][\w]*)?[\s]*[-–—to]+[\s]*\$?\s*([\d.]+)\s*([bkmnt][\w]*)?/i)
  if (rangeMatch) {
    const lo = parseAmount(`${rangeMatch[1]}${rangeMatch[2] ?? ""}`)
    const hi = parseAmount(`${rangeMatch[3]}${rangeMatch[4] ?? rangeMatch[2] ?? ""}`)
    if (lo !== null && hi !== null) return [Math.min(lo, hi), Math.max(lo, hi)]
  }
  
  // Plus pattern: "$1M+", "500K+"
  const plusMatch = cleaned.match(/\$?\s*([\d.]+)\s*([bkmnt][\w]*)?\s*\+/i)
  if (plusMatch) {
    const val = parseAmount(`${plusMatch[1]}${plusMatch[2] ?? ""}`)
    if (val !== null) return [val, val * 10]
  }
  
  // Single value: "$500K", "$2M", "250000"
  const singleVal = parseAmount(cleaned)
  if (singleVal !== null) return [0, singleVal * 2]
  
  return null
}

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

// Calculate industry match score using synonym-aware matching
function calculateIndustryScore(startupIndustry: string, firmIndustries: string[]): number {
  // Handle empty inputs
  if (!firmIndustries?.length) return 0.5 // agnostic investor
  if (!startupIndustry) return 0.3
  
  // Use synonym-aware overlap detection
  const startupIndustries = [startupIndustry.toLowerCase().trim()]
  const normalizedFirm = firmIndustries.map(i => i.toLowerCase().trim())
  
  const overlap = hasSectorOverlap(startupIndustries, normalizedFirm)
  
  if (!overlap.overlap) {
    // Fall back to legacy INDUSTRY_GROUPS matching
    const normalizedStartup = startupIndustry.toLowerCase().trim()
    
    // Check if in same industry group
    for (const [_group, industries] of Object.entries(INDUSTRY_GROUPS)) {
      const startupInGroup = industries.some(i => normalizedStartup.includes(i) || i.includes(normalizedStartup))
      const firmInGroup = normalizedFirm.some(fi => industries.some(i => fi.includes(i) || i.includes(fi)))
      
      if (startupInGroup && firmInGroup) return 0.6
    }
    
    return 0.2 // no match at all
  }
  
  // Base score from overlap ratio
  let score = overlap.score
  
  // Exact canonical match bonus
  if (overlap.matched.length >= 3) score = Math.min(1.0, score + 0.2)
  else if (overlap.matched.length >= 2) score = Math.min(1.0, score + 0.1)
  
  return Math.min(1.0, Math.max(0, score))
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

// User settings type for matching
interface UserSettingsForMatching {
  company_industry?: string | null
  company_stage?: string | null
  target_raise?: number | null
}

// Algorithm types
export type MatchingAlgorithm = 'balanced' | 'stage-focused' | 'sector-focused' | 'check-size-focused' | 'geographic-focused'

// Get weights based on algorithm
function getAlgorithmWeights(algorithm: MatchingAlgorithm) {
  switch (algorithm) {
    case 'stage-focused':
      return {
        industry: 0.15,
        stage: 0.40,
        geography: 0.10,
        checkSize: 0.15,
        investorType: 0.10,
        teamSignals: 0.10,
      }
    case 'sector-focused':
      return {
        industry: 0.40,
        stage: 0.15,
        geography: 0.10,
        checkSize: 0.15,
        investorType: 0.10,
        teamSignals: 0.10,
      }
    case 'check-size-focused':
      return {
        industry: 0.15,
        stage: 0.15,
        geography: 0.10,
        checkSize: 0.40,
        investorType: 0.10,
        teamSignals: 0.10,
      }
    case 'geographic-focused':
      return {
        industry: 0.15,
        stage: 0.15,
        geography: 0.40,
        checkSize: 0.10,
        investorType: 0.10,
        teamSignals: 0.10,
      }
    case 'balanced':
    default:
      return WEIGHTS
  }
}

// Main matching function - now also syncs with user_settings
export async function runMatchingEngine(startupId: string, algorithmOrUserId?: MatchingAlgorithm | string): Promise<MatchResult[]> {
  // Determine if the second param is an algorithm or userId
  const isAlgorithm = algorithmOrUserId && ['balanced', 'stage-focused', 'sector-focused', 'check-size-focused', 'geographic-focused'].includes(algorithmOrUserId)
  const algorithm: MatchingAlgorithm = isAlgorithm ? algorithmOrUserId as MatchingAlgorithm : 'balanced'
  const passedUserId = !isAlgorithm ? algorithmOrUserId : undefined
  
  // Fetch startup profile
  const startups = await sql<Startup[]>`
    SELECT * FROM startups WHERE id = ${startupId}
  `
  
  if (!startups.length) {
    throw new Error('Startup not found')
  }
  
  const startup = startups[0]
  
  // Also fetch user_settings if user ID available (settings may have more up-to-date data)
  let userSettings: UserSettingsForMatching | null = null
  const effectiveUserId = passedUserId || startup.founder_id
  
  if (effectiveUserId) {
    const settings = await sql<UserSettingsForMatching[]>`
      SELECT company_industry, company_stage, target_raise 
      FROM user_settings 
      WHERE user_id = ${effectiveUserId}
      LIMIT 1
    `
    if (settings.length) {
      userSettings = settings[0]
    }
  }
  
  // Merge startup data with user_settings (user_settings takes priority if set)
  const effectiveIndustry = userSettings?.company_industry || startup.industry || ''
  const effectiveStage = userSettings?.company_stage || startup.stage || ''
  const effectiveFundingTarget = userSettings?.target_raise || startup.funding_target
  
  // Fetch all investment firms
  const firms = await sql<InvestmentFirm[]>`
    SELECT * FROM investment_firms 
    WHERE status = 'active' OR status IS NULL
    ORDER BY name
  `
  
  const matches: MatchResult[] = []
  
  for (const firm of firms) {
    // Use sectors if industries not available
    const firmIndustries = (firm.industries as string[])?.length 
      ? (firm.industries as string[]) 
      : (firm.sectors as string[]) || []
    
    const factors = {
      industry: calculateIndustryScore(
        effectiveIndustry,
        firmIndustries
      ),
      stage: calculateStageScore(
        effectiveStage,
        firm.stages as string[] || []
      ),
      geography: calculateGeographyScore(
        startup.location,
        firm.hq_location || firm.location
      ),
      checkSize: calculateCheckSizeScore(
        effectiveFundingTarget ? Number(effectiveFundingTarget) : null,
        firm.check_size_min ? Number(firm.check_size_min) : null,
        firm.check_size_max ? Number(firm.check_size_max) : null
      ),
      investorType: calculateInvestorTypeScore(
        null,
        firm.type || firm.firm_classification
      ),
      teamSignals: calculateTeamSignalsScore(
        firm.portfolio_count,
        firm.aum ? Number(String(firm.aum).replace(/[^\d.]/g, '')) : null
      ),
    }
    
    // Get weights based on algorithm
    const weights = getAlgorithmWeights(algorithm)
    
    // Calculate weighted score
    const score = (
      factors.industry * weights.industry +
      factors.stage * weights.stage +
      factors.geography * weights.geography +
      factors.checkSize * weights.checkSize +
      factors.investorType * weights.investorType +
      factors.teamSignals * weights.teamSignals
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
  
  // Calculate tier based on score
  const getTier = (score: number) => {
    if (score >= 0.9) return 'S'
    if (score >= 0.75) return 'A'
    if (score >= 0.6) return 'B'
    if (score >= 0.4) return 'C'
    return 'D'
  }
  
  const getTierLabel = (tier: string) => {
    switch (tier) {
      case 'S': return 'Champion (90+)'
      case 'A': return 'Priority A (75-89)'
      case 'B': return 'Priority B (60-74)'
      case 'C': return 'Prospect C (40-59)'
      default: return 'Prospect D (<40)'
    }
  }
  
  for (const match of topMatches) {
    const id = crypto.randomUUID()
    const tier = getTier(match.score)
    const scoreInt = Math.round(match.score * 100)
    
    await sql`
      INSERT INTO investor_matches (
        id,
        startup_id,
        firm_id,
        firm_name,
        score,
        factor_industry,
        factor_stage,
        factor_geo,
        factor_check_size,
        factor_investor_type,
        tier,
        tier_label,
        status,
        created_at
      ) VALUES (
        ${id},
        ${startupId},
        ${match.firmId},
        ${match.firmName},
        ${scoreInt},
        ${match.factors.industry},
        ${match.factors.stage},
        ${match.factors.geography},
        ${match.factors.checkSize},
        ${match.factors.investorType},
        ${tier},
        ${getTierLabel(tier)},
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
           if.hq_location as headquarters, if.website, if.sectors as industries, if.stages
    FROM investor_matches im
    JOIN investment_firms if ON im.firm_id = if.id
    WHERE im.startup_id = ${startupId}
    ORDER BY im.score DESC
  `
}
