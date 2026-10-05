/** Runs cases and stores the result. Case names and pass/fail only: results never carry tenant content. */
import { sql } from "@/lib/db"
import { staticCases, liveCases, type EvalCase } from "./cases"

export interface Outcome { suite: string; name: string; ok: boolean; detail: string }

export async function runCases(suite: string, cases: EvalCase[]): Promise<Outcome[]> {
  const out: Outcome[] = []
  for (const c of cases) {
    try { const r = await c.run(); out.push({ suite, name: c.name, ok: r.ok, detail: r.detail.slice(0, 300) }) }
    catch (e: any) { out.push({ suite, name: c.name, ok: false, detail: `threw: ${String(e?.message ?? e).slice(0, 250)}` }) }
  }
  return out
}

export async function runAll(): Promise<Outcome[]> { return [...(await runCases("static", staticCases)), ...(await runCases("live", liveCases))] }

export async function store(outcomes: Outcome[]): Promise<void> {
  for (const o of outcomes) await sql`INSERT INTO eval_runs (suite, case_name, passed, detail) VALUES (${o.suite}, ${o.name}, ${o.ok}, ${o.detail})`
  await sql`DELETE FROM eval_runs WHERE ran_at < now() - interval '60 days'`
}
