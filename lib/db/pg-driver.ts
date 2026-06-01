/**
 * node-postgres adapter exposing the Neon-compatible `sql` interface.
 * Used when DATABASE_URL points at a real Postgres (Docker, RDS, etc.)
 * rather than a Neon serverless endpoint.
 */

import { Pool, type QueryResult } from "pg"

let _pool: Pool | null = null

function pool(): Pool {
  if (_pool) return _pool
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is required for the pg backend")
  _pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
  console.log("[db] Using node-postgres pool for", url.replace(/:[^:@]+@/, ":***@"))
  return _pool
}

interface SqlFn {
  (strings: TemplateStringsArray, ...values: any[]): Promise<any[]>
  unsafe: (text: string, params?: any[]) => Promise<any[]>
}

function buildQuery(strings: TemplateStringsArray, values: any[]): { text: string; params: any[] } {
  let text = strings[0]
  const params: any[] = []
  for (let i = 0; i < values.length; i++) {
    params.push(values[i])
    text += `$${params.length}` + strings[i + 1]
  }
  return { text, params }
}

export const sql: SqlFn = (() => {
  const fn = async (strings: TemplateStringsArray, ...values: any[]) => {
    const { text, params } = buildQuery(strings, values)
    const r: QueryResult = await pool().query(text, params)
    return r.rows
  }
  ;(fn as SqlFn).unsafe = async (text: string, params: any[] = []) => {
    const r: QueryResult = await pool().query(text, params)
    return r.rows
  }
  return fn as SqlFn
})()
