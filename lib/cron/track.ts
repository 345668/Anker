/**
 * Cron run tracking (docs/architecture/37 §5.4, 38 §3.1).
 *
 * Fifteen scheduled jobs ran with no record that they had: a job that stopped working was noticed only when a customer
 * asked why nothing arrived. `trackCron` wraps a job's GET handler and writes one row per execution to `cron_runs`:
 * a `running` row when it starts, finished with status, HTTP status, duration and a small result when it ends. A row
 * still `running` past the job's `maxDuration` means the platform killed it.
 *
 * Only AUTHORISED invocations are recorded (the platform's cron call carries the secret), so a stranger probing the
 * URL cannot fill the table. The handler is unchanged and still does its own authorisation; this only observes.
 * Recording never blocks or fails the job.
 */
import { timingSafeEqual } from "node:crypto"
import { sql } from "@/lib/db"
import { logEvent } from "@/lib/observability/log"

export function isCronAuthorised(req: Request, env: Record<string, string | undefined> = process.env): boolean {
  const secret = env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get("authorization") || ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : ""
  let query = ""
  try { query = new URL(req.url).searchParams.get("secret") || "" } catch { /* not a URL */ }
  const same = (a: string) => a.length === secret.length && timingSafeEqual(Buffer.from(a), Buffer.from(secret))
  return same(bearer) || same(query)
}

const small = (v: unknown) => { try { const t = JSON.stringify(v); return t.length > 2000 ? { truncated: true } : v } catch { return null } }

export function trackCron<R extends Request>(job: string, handler: (req: R) => Promise<Response> | Response): (req: R) => Promise<Response> {
  return async (req: R) => {
    if (!isCronAuthorised(req)) return handler(req)          // the handler answers the 401; nothing is recorded
    const startedAt = Date.now()
    let rowId: number | null = null
    try {
      const rows = (await sql`INSERT INTO cron_runs (job) VALUES (${job}) RETURNING id`) as any[]
      rowId = rows[0]?.id ?? null
    } catch { /* telemetry must not stop the job */ }
    logEvent("cron.start", { job, row: rowId })
    const finish = async (status: "ok" | "failed", httpStatus: number | null, error: string | null, result: unknown) => {
      const ms = Date.now() - startedAt
      logEvent("cron.end", { job, status, http: httpStatus, ms, error })
      if (rowId == null) return
      try {
        await sql`UPDATE cron_runs SET finished_at = now(), status = ${status}, http_status = ${httpStatus}, duration_ms = ${ms}, error = ${error}, result = ${result == null ? null : JSON.stringify(small(result))}::jsonb WHERE id = ${rowId}`
      } catch { /* best effort */ }
    }
    try {
      const res = await handler(req)
      let body: unknown = null
      try { body = await res.clone().json() } catch { /* not JSON */ }
      await finish(res.status < 400 ? "ok" : "failed", res.status, res.status < 400 ? null : String((body as any)?.error ?? `HTTP ${res.status}`).slice(0, 300), body)
      return res
    } catch (e: any) {
      await finish("failed", 500, String(e?.message ?? e).slice(0, 300), null)
      throw e
    }
  }
}
