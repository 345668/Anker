/**
 * Local PGlite adapter — exposes the same `sql` tagged-template + `sql.unsafe()`
 * surface as `@neondatabase/serverless`, but backed by Electric SQL's PGlite
 * (in-process WASM Postgres). Used when LOCAL_DB=true.
 *
 * Works for read-mostly Anker workloads: Neon's `sql` returns row arrays,
 * PGlite's query() returns `{ rows }`. We translate.
 *
 * Persists to ./.local-db/ so data survives process restarts.
 */

import { PGlite } from "@electric-sql/pglite"
import path from "node:path"

const DATA_DIR = path.resolve(process.cwd(), ".local-db")

let _db: PGlite | null = null
let _ready: Promise<PGlite> | null = null

async function getDb(): Promise<PGlite> {
  if (_db) return _db
  if (_ready) return _ready
  _ready = (async () => {
    const db = new PGlite(DATA_DIR)
    await db.waitReady
    _db = db
    return db
  })()
  return _ready
}

// PGlite's WASM runtime is single-threaded and crashes on concurrent
// query() calls. We serialize all queries through a single promise chain.
let _queue: Promise<any> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = _queue.then(fn, fn)
  _queue = next.catch(() => {})
  return next
}

/**
 * Convert tagged template into ($1, $2, …) style for PGlite, hoisting array
 * values to UNNEST so multi-row INSERTs from persistence.ts still work.
 */
function buildQuery(strings: TemplateStringsArray, values: any[]): { text: string; params: any[] } {
  let text = strings[0]
  const params: any[] = []
  for (let i = 0; i < values.length; i++) {
    params.push(values[i])
    text += `$${params.length}` + strings[i + 1]
  }
  return { text, params }
}

interface SqlFn {
  (strings: TemplateStringsArray, ...values: any[]): Promise<any[]>
  unsafe: (text: string, params?: any[]) => Promise<any[]>
}

export const sql: SqlFn = (() => {
  const fn = async (strings: TemplateStringsArray, ...values: any[]) => {
    const db = await getDb()
    const { text, params } = buildQuery(strings, values)
    return enqueue(async () => {
      const res = await db.query(text, params)
      return (res as any).rows ?? []
    })
  }
  ;(fn as SqlFn).unsafe = async (text: string, params: any[] = []) => {
    const db = await getDb()
    return enqueue(async () => {
      const res = await db.query(text, params)
      return (res as any).rows ?? []
    })
  }
  return fn as SqlFn
})()

export async function execLocal(text: string, params: any[] = []): Promise<void> {
  const db = await getDb()
  await db.query(text, params)
}

export async function execMany(statements: string): Promise<void> {
  const db = await getDb()
  await db.exec(statements)
}

export async function localDbReady(): Promise<PGlite> {
  return getDb()
}
