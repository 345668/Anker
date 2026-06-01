import { neon } from '@neondatabase/serverless'

// ─── Driver resolution ──────────────────────────────────────────────────
// We support two backends:
//   - Neon (default, cloud) when DATABASE_URL is set.
//   - PGlite (local in-process WASM Postgres) when LOCAL_DB=true.
//
// To keep the export shape stable across bundlers, `sql` is a single
// function (with a `.unsafe` method) that resolves the actual driver
// lazily on first call.
// ────────────────────────────────────────────────────────────────────────

let _resolved: any = null
let _resolving: Promise<any> | null = null

async function resolveDriver(): Promise<any> {
  if (_resolved) return _resolved
  if (_resolving) return _resolving

  _resolving = (async () => {
    if (process.env.LOCAL_DB === 'true') {
      const mod = await import('./local-pglite')
      console.log('[db] Using local PGlite at .local-db/')
      _resolved = mod.sql
    } else {
      const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
      if (!url) {
        throw new Error(
          'DATABASE_URL is required (or set LOCAL_DB=true for the in-process PGlite backend).',
        )
      }
      // Pick driver based on URL: neon.tech / *.neon.* → HTTP serverless,
      // anything else → node-postgres TCP pool.
      if (/neon\.(tech|com|io)/i.test(url) || /serverless/.test(url)) {
        _resolved = neon(url)
        console.log('[db] Using Neon serverless driver')
      } else {
        const mod = await import('./pg-driver')
        _resolved = mod.sql
      }
    }
    return _resolved
  })()

  return _resolving
}

interface SqlFn {
  (strings: TemplateStringsArray, ...values: any[]): Promise<any[]>
  unsafe: (text: string, params?: any[]) => Promise<any[]>
}

// Tagged-template proxy. Resolves the driver on first invocation.
const sqlImpl = async (strings: TemplateStringsArray, ...values: any[]) => {
  const driver = await resolveDriver()
  return driver(strings, ...values)
}

;(sqlImpl as any).unsafe = async (text: string, params: any[] = []) => {
  const driver = await resolveDriver()
  if (typeof driver.unsafe === 'function') return driver.unsafe(text, params)
  // Neon fallback: build tagged-template-like call
  return driver(text, params)
}

export const sql: SqlFn = sqlImpl as SqlFn

// ─── Helper types for database tables ────────────────────────────────────
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
