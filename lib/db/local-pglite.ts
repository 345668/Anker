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
import { vector } from "@electric-sql/pglite/vector"
import path from "node:path"

const DATA_DIR = path.resolve(process.cwd(), ".local-db")

// One database per process, held on globalThis: the dev server reloads this module whenever a file changes, and a second PGlite opened on the same directory aborts
// ("Aborted()") and can corrupt it.
const G = globalThis as unknown as { __ankerPglite?: { db: PGlite | null; ready: Promise<PGlite> | null; queue: Promise<any> } }
const state = (G.__ankerPglite ??= { db: null, ready: null, queue: Promise.resolve() })

async function getDb(): Promise<PGlite> {
  if (state.db) return state.db
  if (state.ready) return state.ready
  state.ready = (async () => {
    // The schema has vector columns (embeddings); the extension must be loaded every time the database is opened.
    const db = new PGlite(DATA_DIR, { extensions: { vector } })
    await db.waitReady
    state.db = db
    return db
  })()
  return state.ready
}

// PGlite's WASM runtime is single-threaded and crashes on concurrent
// query() calls. We serialize all queries through a single promise chain.
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = state.queue.then(fn, fn)
  state.queue = next.catch(() => {})
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
