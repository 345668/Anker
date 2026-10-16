import "server-only"
import { sql } from "@/lib/db"
import { allowanceOf } from "./allowance"

/** The operator's view of cost (docs/architecture/58 sections 5 and 6): totals, workspaces against their limits, cost per job, and the provider bill beside our list-price total. No content. */
export interface Economics {
  month: string
  totals: { aiUsd: number; unitsUsd: number; workspaceUsd: number; platformUsd: number }
  workspaces: Array<{ orgId: string; name: string | null; usd: number; limit: number | null; pct: number | null }>
  tasks: Array<{ task: string; calls: number; usd: number; runs: number; p50: number | null; p95: number | null }>
  units: Array<{ unit: string; events: number; qty: number; usd: number }>
  bills: Array<{ month: string; provider: string; amountUsd: number; note: string | null }>
}

export async function economics(): Promise<Economics> {
  const month = new Date().toISOString().slice(0, 7) + "-01"
  const [ai] = (await sql`SELECT COALESCE(sum(cost_usd), 0)::float AS usd FROM ai_calls WHERE created_at >= date_trunc('month', now())`) as any[]
  const [un] = (await sql`SELECT COALESCE(sum(cost_usd), 0)::float AS usd FROM usage_events WHERE created_at >= date_trunc('month', now())`) as any[]
  const [split] = (await sql`SELECT COALESCE(sum(usd) FILTER (WHERE cost_center LIKE 'workspace:%'), 0)::float AS ws, COALESCE(sum(usd) FILTER (WHERE cost_center NOT LIKE 'workspace:%'), 0)::float AS pf FROM (
      SELECT cost_center, cost_usd AS usd FROM ai_calls WHERE created_at >= date_trunc('month', now()) UNION ALL SELECT cost_center, cost_usd FROM usage_events WHERE created_at >= date_trunc('month', now())) x`) as any[]
  const top = (await sql`SELECT org_id, sum(usd)::float AS usd FROM (
      SELECT workspace_id AS org_id, cost_usd AS usd FROM ai_calls WHERE workspace_id IS NOT NULL AND created_at >= date_trunc('month', now())
      UNION ALL SELECT org_id, cost_usd FROM usage_events WHERE org_id IS NOT NULL AND created_at >= date_trunc('month', now())) x GROUP BY org_id ORDER BY usd DESC NULLS LAST LIMIT 20`) as any[]
  const names = top.length ? ((await sql`SELECT id::text AS id, name FROM organizations WHERE id::text = ANY(${top.map((t) => String(t.org_id))}::text[])`) as any[]) : []
  const workspaces = []
  for (const t of top) {
    const a = await allowanceOf(String(t.org_id)).catch(() => null)
    workspaces.push({ orgId: String(t.org_id), name: names.find((n) => n.id === String(t.org_id))?.name ?? null, usd: Number(t.usd), limit: a?.limit ?? null, pct: a?.pct ?? null })
  }
  // Cost per run (job_costs, doc 58 section 6): each run's calls summed, then the spread per task.
  const tasks = (await sql`SELECT task, sum(calls)::int AS calls, sum(usd)::float AS usd, count(*)::int AS runs,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY usd)::float AS p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY usd)::float AS p95 FROM (
      SELECT COALESCE(task, '(none)') AS task, run_id, count(*) AS calls, COALESCE(sum(cost_usd), 0) AS usd FROM ai_calls WHERE created_at >= date_trunc('month', now()) AND run_id IS NOT NULL GROUP BY 1, 2) r GROUP BY task ORDER BY usd DESC LIMIT 25`) as any[]
  const units = (await sql`SELECT unit, count(*)::int AS events, sum(qty)::float AS qty, COALESCE(sum(cost_usd), 0)::float AS usd FROM usage_events WHERE created_at >= date_trunc('month', now()) GROUP BY unit ORDER BY usd DESC`) as any[]
  const bills = (await sql`SELECT month::text AS month, provider, amount_usd::float AS amount, note FROM provider_bills ORDER BY month DESC, provider LIMIT 24`) as any[]
  return {
    month,
    totals: { aiUsd: Number(ai?.usd ?? 0), unitsUsd: Number(un?.usd ?? 0), workspaceUsd: Number(split?.ws ?? 0), platformUsd: Number(split?.pf ?? 0) },
    workspaces,
    tasks: tasks.map((t) => ({ task: String(t.task), calls: Number(t.calls), usd: Number(t.usd), runs: Number(t.runs), p50: t.p50 == null ? null : Number(t.p50), p95: t.p95 == null ? null : Number(t.p95) })),
    units: units.map((u) => ({ unit: String(u.unit), events: Number(u.events), qty: Number(u.qty), usd: Number(u.usd) })),
    bills: bills.map((b) => ({ month: String(b.month).slice(0, 7), provider: String(b.provider), amountUsd: Number(b.amount), note: b.note ?? null })),
  }
}

export class BillError extends Error {}
/** The provider's bill for a month, entered by the founder, to set beside our list-price total. */
export async function saveBill(input: { month: unknown; provider: unknown; amountUsd: unknown; note?: unknown }, by: string): Promise<void> {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(input.month ?? ""))
  if (!m) throw new BillError("Enter the month as YYYY-MM.")
  const provider = String(input.provider ?? "").trim().toLowerCase()
  if (!/^[a-z0-9 ._-]{2,40}$/.test(provider)) throw new BillError("Enter the provider's name, for example dashscope.")
  const amount = Number(input.amountUsd)
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) throw new BillError("Enter the amount billed in US dollars.")
  await sql`INSERT INTO provider_bills (month, provider, amount_usd, note, entered_by, entered_at) VALUES (${`${m[1]}-${m[2]}-01`}::date, ${provider}, ${amount}, ${input.note ? String(input.note).slice(0, 200) : null}, ${by}, now())
    ON CONFLICT (month, provider) DO UPDATE SET amount_usd = EXCLUDED.amount_usd, note = EXCLUDED.note, entered_by = EXCLUDED.entered_by, entered_at = now()`
}
