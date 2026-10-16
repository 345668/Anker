import { createHash, timingSafeEqual } from "node:crypto"
import { sql } from "@/lib/db"
import { schemaBehind } from "@/lib/migrations/schema-state"

/**
 * The deep half of the post-deploy smoke test (docs/architecture/59 R6). Read-only, returns only pass or fail per check: no data, no names of customers, no secrets.
 * Guarded by SMOKE_TOKEN, a shared secret the founder sets in Vercel and in GitHub; it is not a user session and opens nothing else.
 */
export function tokenOk(presented: string | null | undefined, env: string | undefined = process.env.SMOKE_TOKEN): boolean | "unset" {
  if (!env || env.length < 24) return "unset"
  if (!presented) return false
  const a = createHash("sha256").update(presented).digest(), b = createHash("sha256").update(env).digest()
  return timingSafeEqual(a, b)
}

export interface SmokeCheck { name: string; ok: boolean; ms: number; error?: string }
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`took longer than ${ms / 1000} s`)), ms))])

async function one(name: string, fn: () => Promise<void>): Promise<SmokeCheck> {
  const t = Date.now()
  try { await withTimeout(fn(), 8000); return { name, ok: true, ms: Date.now() - t } }
  catch (e) { return { name, ok: false, ms: Date.now() - t, error: String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 160) } }
}

export async function deepChecks(): Promise<SmokeCheck[]> {
  return Promise.all([
    one("database", async () => { await sql`SELECT 1`; const [r] = (await sql`SELECT count(*)::int AS n FROM platform_flags`) as any[]; if (r == null) throw new Error("platform_flags unreadable") }),
    one("schema", async () => { const b = await schemaBehind(true); if (b.length) throw new Error(`${b.length} migration(s) missing`) }),
    one("entitlements", async () => { const { getEffective } = await import("@/lib/entitlements"); const e = await getEffective("smoke-check-no-such-workspace"); if (!e || typeof e.state !== "string") throw new Error("no entitlements answer") }),
    one("ai configuration", async () => { const { readRouterConfig } = await import("@/lib/ai/runtime-config"); await readRouterConfig() }),
    one("cron ledger", async () => { await sql`SELECT 1 FROM cron_runs LIMIT 1` }),
  ])
}

export interface SmokeReport { sha: string | null; baseUrl: string | null; ok: boolean; skipped: number; failures: Array<{ name: string; error: string }> }
export function parseReport(b: any): SmokeReport | null {
  if (!b || typeof b.ok !== "boolean" || !Array.isArray(b.failures)) return null
  const failures = b.failures.slice(0, 20).map((f: any) => ({ name: String(f?.name ?? "").slice(0, 80), error: String(f?.error ?? "").slice(0, 300) })).filter((f: { name: string }) => f.name)
  if (!b.ok && failures.length === 0) failures.push({ name: "unknown", error: "failed without detail" })
  return { sha: b.sha ? String(b.sha).slice(0, 40) : null, baseUrl: b.baseUrl ? String(b.baseUrl).slice(0, 200) : null, ok: b.ok && failures.length === 0, skipped: Number.isFinite(b.skipped) ? Math.max(0, Math.min(10, Number(b.skipped))) : 0, failures }
}

export async function storeReport(r: SmokeReport): Promise<void> {
  await sql`INSERT INTO smoke_runs (sha, base_url, ok, skipped, failures) VALUES (${r.sha}, ${r.baseUrl}, ${r.ok}, ${r.skipped}, ${JSON.stringify(r.failures)}::jsonb)`
  await sql`DELETE FROM smoke_runs WHERE id < (SELECT COALESCE(max(id), 0) - 200 FROM smoke_runs)`
}
