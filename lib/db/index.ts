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
  <T extends any[] = any[]>(strings: TemplateStringsArray, ...values: any[]): Promise<T>
  unsafe: (text: string, params?: any[]) => Promise<any[]>
}

// Tagged-template proxy. Resolves the driver on first invocation.
// Every caller in the codebase assumes the return is `T[]` (array of rows).
// Some pg-style drivers wrap results as `{ rows: [...] }`; we unwrap here so
// callers never have to discriminate, and never crash on .map() if a driver
// hiccup produces a non-array.
const sqlImpl = async (strings: TemplateStringsArray, ...values: any[]) => {
  const driver = await resolveDriver()
  const r = await driver(strings, ...values)
  if (Array.isArray(r)) return r
  if (r && Array.isArray((r as any).rows)) return (r as any).rows
  return []
}

/**
 * Run parameterised SQL text on whichever driver is active.
 *
 * `.query` comes first. Neon's serverless driver (v1) has BOTH methods, and
 * its `.unsafe(text)` does not run anything: it builds a raw-SQL fragment for
 * interpolation into a tagged template (an `UnsafeRawSql` object). Checking
 * `.unsafe` first therefore returned no rows for every caller in production,
 * without an error — Discover, semantic matching, portfolio lists, the data
 * room, match access checks. The local wrappers (PGlite, node-postgres) have
 * only `.unsafe`, and theirs does run the query.
 */
export async function runUnsafe(driver: any, text: string, params: any[] = []): Promise<any[]> {
  const unwrap = (r: any) => Array.isArray(r) ? r : (Array.isArray(r?.rows) ? r.rows : null)
  if (typeof driver.query === 'function') {
    const rows = unwrap(await driver.query(text, params))
    if (rows) return rows
    throw new Error("[lib/db] sql.unsafe(): driver.query returned neither rows nor { rows }.")
  }
  if (typeof driver.unsafe === 'function') {
    const rows = unwrap(await driver.unsafe(text, params))
    if (rows) return rows
    // A fragment builder, not a query runner — refuse rather than return [].
    throw new Error("[lib/db] sql.unsafe(): driver.unsafe returned neither rows nor { rows }.")
  }
  throw new Error(
    "[lib/db] sql.unsafe(): driver exposes neither .query nor .unsafe — " +
    "can't run parameterised SQL on this backend.",
  )
}

;(sqlImpl as any).unsafe = async (text: string, params: any[] = []) => runUnsafe(await resolveDriver(), text, params)

/**
 * Run one query with transaction-scoped settings, e.g.
 * `[["hnsw.ef_search", "1000"]]` — without it pgvector's HNSW index returns at
 * most 40 neighbours. Settings go through `set_config(name, value, true)`, so
 * names and values are bound, never interpolated. On drivers without
 * transactions (local PGlite/pg wrappers) the query runs without the settings.
 */
export async function unsafeWithSettings(settings: [string, string][], text: string, params: any[] = []): Promise<any[]> {
  const driver = await resolveDriver()
  if (typeof driver.transaction === 'function' && typeof driver.query === 'function') {
    const results = await driver.transaction([
      ...settings.map(([k, v]) => driver.query('SELECT set_config($1, $2, true)', [k, v])),
      driver.query(text, params),
    ])
    const last = results[results.length - 1]
    return Array.isArray(last) ? last : (Array.isArray(last?.rows) ? last.rows : [])
  }
  return runUnsafe(driver, text, params)
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
