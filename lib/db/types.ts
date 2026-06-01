// Tesseract Platform Database Types
// Based on Neon database schema (br-jolly-tree-anub7qrl)

// ============ INVESTMENT FIRMS ============
export type InvestmentFirm = {
  id: string
  name: string
  slug: string | null
  website: string | null
  logo_url: string | null
  description: string | null
  hq_location: string | null
  location: string | null
  firm_type: string | null
  type: string | null
  firm_classification: string | null
  aum: number | null
  aum_string: string | null
  founded_year: number | null
  team_size: number | null
  linkedin_url: string | null
  twitter_url: string | null
  crunchbase_url: string | null
  stages: string[] | null
  sectors: string[] | null
  industries: string[] | null
  industry: string | null
  geographies: string[] | null
  check_size_min: number | null
  check_size_max: number | null
  typical_check_size: string | null
  sweet_spot: number | null
  investment_count: number | null
  exit_count: number | null
  portfolio_companies: string[] | null
  thesis: string | null
  decision_makers: string[] | null
  source: string | null
  created_at: string
  updated_at: string
}

// ============ INVESTORS (Individual) ============
export type Investor = {
  id: string
  user_id: string | null
  firm_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  title: string | null
  linkedin_url: string | null
  twitter_url: string | null
  person_linkedin_url: string | null
  avatar: string | null
  bio: string | null
  stages: string[] | null
  sectors: string[] | null
  location: string | null
  investor_type: string | null
  investor_state: string | null
  investor_country: string | null
  fund_hq: string | null
  hq_location: string | null
  funding_stage: string | null
  typical_investment: string | null
  typical_check_size: string | null
  num_lead_investments: number | null
  total_investments: number | null
  portfolio_count: number | null
  recent_investments: string | null
  investment_thesis: string | null
  preferred_stages: string[] | null
  preferred_sectors: string[] | null
  focus_niches: string[] | null
  geography_focus: string[] | null
  website: string | null
  status: string | null
  is_active: boolean
  source: string | null
  folk_id: string | null
  created_at: string
  updated_at: string
}

// ============ STARTUPS ============
export type Startup = {
  id: string
  founder_id: string | null  // Note: table uses founder_id, not owner_id
  name: string
  slug: string | null
  tagline: string | null
  description: string | null
  website: string | null
  logo_url: string | null
  founded_year: number | null
  stage: string | null
  industry: string | null
  sub_industry: string | null
  business_model: string | null
  hq_location: string | null
  team_size: number | null
  funding_raised: number | null
  funding_target: number | null
  valuation: number | null
  revenue_arr: number | null
  growth_rate: number | null
  burn_rate: number | null
  runway_months: number | null
  linkedin_url: string | null
  twitter_url: string | null
  pitch_deck_url: string | null
  data_room_url: string | null
  created_at: string
  updated_at: string
}

// ============ DEALS ============
export type Deal = {
  id: string
  startup_id: string
  firm_id: string | null
  investor_id: string | null
  contact_id: string | null
  owner_id: string | null
  stage: string
  status: string
  amount: number | null
  valuation: number | null
  equity_percentage: number | null
  term_sheet_url: string | null
  notes: string | null
  next_step: string | null
  next_step_date: string | null
  probability: number | null
  expected_close_date: string | null
  actual_close_date: string | null
  lost_reason: string | null
  source: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// ============ CONTACTS (CRM) ============
export type Contact = {
  id: string
  owner_id: string | null
  firm_id: string | null
  investor_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  title: string | null
  company: string | null
  linkedin_url: string | null
  twitter_url: string | null
  photo_url: string | null
  source: string | null
  tags: string[] | null
  notes: string | null
  last_contacted_at: string | null
  folk_contact_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// ============ INVESTOR MATCHES ============
export type InvestorMatch = {
  id: string
  session_id: string | null
  startup_id: string | null
  startup_name: string | null
  investor_id: string | null
  investor_name: string | null
  investor_email: string | null
  investor_linkedin: string | null
  firm_id: string | null
  firm_name: string | null
  firm_website: string | null
  score: number
  tier: string | null
  tier_label: string | null
  factor_industry: number | null
  factor_stage: number | null
  factor_geo: number | null
  factor_check_size: number | null
  factor_investor_type: number | null
  factor_team_signal: number | null
  semantic_score: number | null
  niche_score: number | null
  document_score: number | null
  economic_score: number | null
  behaviour_score: number | null
  feedback_multiplier: number | null
  win_probability: number | null
  decision_speed: string | null
  value_add: Record<string, unknown> | null
  status: string | null
  folk_contact_id: string | null
  status_notes: string | null
  status_updated_at: string | null
  created_at: string
}

// ============ OUTREACHES (Pipeline) ============
export type Outreach = {
  id: string
  owner_id: string | null
  startup_id: string | null
  contact_id: string | null
  firm_id: string | null
  investor_id: string | null
  template_id: string | null
  email_subject: string | null
  email_body: string | null
  stage: string | null
  sent_at: string | null
  opened_at: string | null
  replied_at: string | null
  scheduled_call_at: string | null
  notes: string | null
  sentiment_analysis: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// ============ AGGREGATED TYPES ============
export type InvestorWithFirm = Investor & {
  firm?: InvestmentFirm | null
}

export type DealWithRelations = Deal & {
  startup?: Startup | null
  firm?: InvestmentFirm | null
  investor?: Investor | null
  contact?: Contact | null
}

export type MatchWithDetails = InvestorMatch & {
  investor?: Investor | null
  firm?: InvestmentFirm | null
}

// ============ PIPELINE STAGES ============
export const DEAL_STAGES = [
  'prospect',
  'contacted',
  'meeting_scheduled',
  'meeting_completed',
  'due_diligence',
  'term_sheet',
  'negotiation',
  'closed_won',
  'closed_lost'
] as const

export type DealStage = typeof DEAL_STAGES[number]

export const OUTREACH_STAGES = [
  'draft',
  'sent',
  'opened',
  'replied',
  'meeting_scheduled',
  'meeting_completed',
  'follow_up',
  'closed'
] as const

export type OutreachStage = typeof OUTREACH_STAGES[number]

// ============ MATCH TIERS ============
export const MATCH_TIERS = {
  'S': { label: 'Perfect Match', color: 'emerald', minScore: 90 },
  'A': { label: 'Excellent', color: 'blue', minScore: 75 },
  'B': { label: 'Good', color: 'amber', minScore: 60 },
  'C': { label: 'Fair', color: 'orange', minScore: 40 },
  'D': { label: 'Low', color: 'red', minScore: 0 }
} as const

export type MatchTier = keyof typeof MATCH_TIERS
