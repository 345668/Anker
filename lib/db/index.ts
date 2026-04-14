import { neon } from '@neondatabase/serverless'

// Create a reusable SQL client for Neon database
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL or NEON_DATABASE_URL environment variable is required')
}

export const sql = neon(databaseUrl)

// Helper types for database tables
export type Company = {
  id: string
  user_id: string
  name: string
  description: string | null
  industry: string | null
  stage: 'pre-seed' | 'seed' | 'series-a' | 'series-b' | 'series-c' | 'growth' | null
  location: string | null
  website: string | null
  logo_url: string | null
  founded_year: number | null
  team_size: number | null
  funding_target: number | null
  funding_raised: number | null
  pitch_deck_url: string | null
  data_room_url: string | null
  created_at: string
  updated_at: string
}

export type Investor = {
  id: string
  name: string
  type: 'angel' | 'vc' | 'family-office' | 'corporate' | 'accelerator' | 'crowdfunding' | null
  firm_name: string | null
  description: string | null
  website: string | null
  logo_url: string | null
  location: string | null
  check_size_min: number | null
  check_size_max: number | null
  industries: string[]
  stages: string[]
  portfolio_count: number | null
  contact_email: string | null
  linkedin_url: string | null
  twitter_url: string | null
  is_verified: boolean
  created_at: string
  updated_at: string
}

export type Deal = {
  id: string
  company_id: string
  investor_id: string
  status: 'prospect' | 'contacted' | 'meeting' | 'due-diligence' | 'term-sheet' | 'closed' | 'passed'
  amount: number | null
  equity_percentage: number | null
  valuation: number | null
  notes: string | null
  next_step: string | null
  next_step_date: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export type InvestorMatch = {
  id: string
  company_id: string
  investor_id: string
  match_score: number | null
  match_factors: Record<string, unknown>
  status: string
  created_at: string
}

export type PitchDeck = {
  id: string
  company_id: string
  title: string
  file_url: string
  file_size: number | null
  slides_count: number | null
  ai_analysis: Record<string, unknown> | null
  ai_score: number | null
  version: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Activity = {
  id: string
  user_id: string | null
  company_id: string | null
  deal_id: string | null
  type: string
  title: string
  description: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type DataRoomFile = {
  id: string
  company_id: string
  name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  folder: string
  is_confidential: boolean
  uploaded_by: string | null
  created_at: string
}

export type Contact = {
  id: string
  user_id: string
  investor_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  title: string | null
  notes: string | null
  last_contacted_at: string | null
  created_at: string
  updated_at: string
}
