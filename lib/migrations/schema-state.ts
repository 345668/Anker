import { sql } from "@/lib/db"
import manifest from "./manifest.json"

/**
 * Is the database behind the code? (docs/architecture/59 R3.) The manifest lists the migration files this build expects; the ledger lists what has been applied.
 * Deploys are automatic and migrations are run by hand, so a deploy can land first. The answer is cached for 30 seconds.
 */
let cache: { at: number; behind: string[] } | null = null
export const expectedMigrations = (): string[] => manifest.files

export function behindOf(expected: string[], applied: Iterable<string>): string[] {
  const have = new Set(applied)
  return expected.filter((f) => !have.has(f))
}

/** Migration files the code expects that the ledger does not have. Throws if the ledger cannot be read. */
export async function schemaBehind(fresh = false): Promise<string[]> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.behind
  const rows = (await sql`SELECT filename FROM schema_migrations`) as Array<{ filename: string }>
  const behind = behindOf(expectedMigrations(), rows.map((r) => r.filename))
  cache = { at: Date.now(), behind }
  return behind
}
