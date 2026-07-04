/**
 * Distribution waterfall — European (whole-fund) carry engine
 * (Phase 4 of FUND_OPS_DESIGN.md §3.3).
 *
 * Given a gross distributable amount, walks the standard four tiers
 * against the fund's cumulative record:
 *
 *   1. Return of capital     — until cumulative distributions return
 *                              cumulative called capital
 *   2. Preferred return      — hurdle % (simple, on called capital) to LPs
 *   3. GP catch-up           — catchUpPct of profits above the pref until
 *                              the GP holds carryPct of profits paid so far
 *   4. Split                 — (1 - carry) to LPs / carry to GP
 *
 * Per-LP allocation is pro-rata on CALLED CAPITAL (not ownership_pct) —
 * that is what a real LPA distributes against. Prior distributions are
 * netted per tier from the record (paid distribution lines).
 *
 * Every run freezes its inputs + outputs into waterfall_runs, and can
 * pre-fill a distribution draft: createDistribution() with the computed
 * totals, then each line item overwritten to the run's per-LP net.
 * The GP carry is recorded on the distribution's carry_deduction.
 */

import { sql } from "@/lib/db"
import { listLps } from "@/lib/portfolio/funds"
import { createDistribution, updateDistributionLineItem } from "@/lib/portfolio/distributions"

// ── types ───────────────────────────────────────────────────────────────

export interface WaterfallInputs {
  grossAmount: number
  hurdlePct: number           // 0.08 = 8% simple pref. 0 = no hurdle.
  carryPct: number            // 0.20
  catchUpPct: number          // 1.0 = 100% catch-up; 0 = no catch-up tier
}

export interface WaterfallLpRow {
  fundLpId: string
  lpName: string
  calledCapital: number
  priorDistributions: number
  returnOfCapital: number
  preferredReturn: number
  residualSplit: number
  totalNet: number
}

export interface WaterfallResult {
  inputs: WaterfallInputs
  totals: {
    gross: number
    returnOfCapital: number
    preferredReturn: number
    gpCatchUp: number
    gpCarry: number
    lpResidual: number
    totalToLps: number
    totalToGp: number
  }
  cumulative: {
    totalCalled: number
    totalPriorDistributions: number
    remainingCapitalToReturn: number
  }
  lps: WaterfallLpRow[]
  notes: string[]
}

export interface WaterfallRunFull {
  id: string
  fund_id: string
  run_number: number
  inputs: WaterfallInputs
  outputs: Omit<WaterfallResult, "inputs">
  distribution_id: string | null
  created_by: string | null
  created_at: string
}

// ── schema-drift guard ──────────────────────────────────────────────────

let probe: Promise<boolean> | null = null
export function hasWaterfallTable(): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      try {
        const rows = await sql`
          SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'waterfall_runs'`
        return rows.length === 1
      } catch { return false }
    })()
  }
  return probe
}

// ── engine ──────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100

export async function computeWaterfall(
  fundId: string,
  inputs: WaterfallInputs,
): Promise<WaterfallResult> {
  const gross = Math.max(0, Number(inputs.grossAmount) || 0)
  const hurdle = Math.max(0, Number(inputs.hurdlePct) || 0)
  const carry = Math.min(0.5, Math.max(0, Number(inputs.carryPct) || 0))
  const catchUp = Math.min(1, Math.max(0, Number(inputs.catchUpPct) || 0))

  // Per-LP called capital + prior distributions from the record.
  const lps = (await listLps(fundId)).filter((l) => l.status !== "transferred")
  const called = new Map<string, number>()
  const prior = new Map<string, number>()
  try {
    const rows = await sql`
      SELECT cli.fund_lp_id, COALESCE(SUM(cli.amount), 0) AS v
        FROM capital_call_line_items cli
        JOIN capital_calls cc ON cc.id = cli.call_id
       WHERE cc.fund_id = ${fundId} AND cli.status = 'paid'
       GROUP BY cli.fund_lp_id`
    for (const r of rows as any[]) called.set(r.fund_lp_id, Number(r.v) || 0)
  } catch { /* calls absent */ }
  try {
    const rows = await sql`
      SELECT dli.fund_lp_id, COALESCE(SUM(dli.amount), 0) AS v
        FROM distribution_line_items dli
        JOIN distributions d ON d.id = dli.distribution_id
       WHERE d.fund_id = ${fundId} AND dli.status = 'paid'
       GROUP BY dli.fund_lp_id`
    for (const r of rows as any[]) prior.set(r.fund_lp_id, Number(r.v) || 0)
  } catch { /* distributions absent */ }

  const totalCalled = [...called.values()].reduce((s, v) => s + v, 0)
  const totalPrior = [...prior.values()].reduce((s, v) => s + v, 0)

  // ── Tier walk on fund level ─────────────────────────────────────────
  let remaining = gross
  const notes: string[] = []

  // Tier 1 — return of capital (net of what's already been returned).
  const capitalOutstanding = Math.max(0, totalCalled - totalPrior)
  const t1 = Math.min(remaining, capitalOutstanding)
  remaining -= t1
  if (totalPrior > 0) {
    notes.push(`Prior paid distributions of ${totalPrior.toLocaleString()} counted toward capital already returned (simplified single-pool netting).`)
  }

  // Tier 2 — preferred return: hurdle % on called capital (simple).
  const prefEntitlement = totalCalled * hurdle
  const t2 = Math.min(remaining, Math.max(0, prefEntitlement))
  remaining -= t2
  if (hurdle > 0 && t2 < prefEntitlement && remaining <= 0) {
    notes.push("Gross amount exhausted inside the preferred-return tier — no carry this run.")
  }

  // Tier 3 — GP catch-up: GP takes catchUpPct of dollars until GP has
  // carry/(1-carry) of the pref paid (i.e. GP holds carryPct of profits).
  let t3 = 0
  if (carry > 0 && catchUp > 0 && remaining > 0) {
    const target = t2 * (carry / (1 - carry))
    t3 = Math.min(remaining, catchUp > 0 ? target / catchUp : 0)
    remaining -= t3
  }

  // Tier 4 — split.
  const t4Gp = r2(remaining * carry)
  const t4Lp = r2(remaining - t4Gp)

  const totalToGp = r2(t3 + t4Gp)
  const totalToLps = r2(gross - totalToGp)

  // ── Per-LP allocation, pro-rata on called capital ───────────────────
  const rows: WaterfallLpRow[] = lps.map((lp) => {
    const c = called.get(lp.id) ?? 0
    const share = totalCalled > 0 ? c / totalCalled : 0
    const roc = r2(t1 * share)
    const pref = r2(t2 * share)
    const split = r2(t4Lp * share)
    return {
      fundLpId: lp.id,
      lpName: lp.lp_name,
      calledCapital: r2(c),
      priorDistributions: r2(prior.get(lp.id) ?? 0),
      returnOfCapital: roc,
      preferredReturn: pref,
      residualSplit: split,
      totalNet: r2(roc + pref + split),
    }
  })

  // Rounding drift → largest LP absorbs the pennies.
  const allocated = rows.reduce((s, r) => s + r.totalNet, 0)
  const drift = r2(totalToLps - allocated)
  if (Math.abs(drift) >= 0.01 && rows.length > 0) {
    const biggest = rows.reduce((a, b) => (a.calledCapital >= b.calledCapital ? a : b))
    biggest.totalNet = r2(biggest.totalNet + drift)
    biggest.residualSplit = r2(biggest.residualSplit + drift)
  }

  if (totalCalled === 0) {
    notes.push("No paid capital-call lines on record — per-LP allocation is empty; everything sits in the GP split. Record calls first.")
  }

  return {
    inputs: { grossAmount: gross, hurdlePct: hurdle, carryPct: carry, catchUpPct: catchUp },
    totals: {
      gross: r2(gross),
      returnOfCapital: r2(t1),
      preferredReturn: r2(t2),
      gpCatchUp: r2(t3),
      gpCarry: t4Gp,
      lpResidual: t4Lp,
      totalToLps,
      totalToGp,
    },
    cumulative: {
      totalCalled: r2(totalCalled),
      totalPriorDistributions: r2(totalPrior),
      remainingCapitalToReturn: r2(Math.max(0, capitalOutstanding - t1)),
    },
    lps: rows,
    notes,
  }
}

// ── runs (frozen) ───────────────────────────────────────────────────────

function normalizeRun(r: any): WaterfallRunFull {
  return {
    id: r.id,
    fund_id: r.fund_id,
    run_number: Number(r.run_number),
    inputs: r.inputs,
    outputs: r.outputs,
    distribution_id: r.distribution_id ?? null,
    created_by: r.created_by ?? null,
    created_at: String(r.created_at),
  }
}

export async function listRuns(fundId: string): Promise<WaterfallRunFull[]> {
  if (!(await hasWaterfallTable())) return []
  const rows = await sql`
    SELECT * FROM waterfall_runs WHERE fund_id = ${fundId} ORDER BY run_number DESC`
  return rows.map(normalizeRun)
}

export async function saveRun(
  fundId: string,
  result: WaterfallResult,
  by: string | null,
): Promise<WaterfallRunFull> {
  const [{ next }] = await sql`
    SELECT COALESCE(MAX(run_number), 0) + 1 AS next FROM waterfall_runs WHERE fund_id = ${fundId}` as any[]
  const { inputs, ...outputs } = result
  const rows = await sql`
    INSERT INTO waterfall_runs (fund_id, run_number, inputs, outputs, created_by)
    VALUES (${fundId}, ${Number(next)}, ${JSON.stringify(inputs)}::jsonb,
            ${JSON.stringify(outputs)}::jsonb, ${by})
    RETURNING *`
  return normalizeRun(rows[0])
}

/**
 * Pre-fill a distribution draft from a saved run: creates the draft with
 * the run's gross/carry/net totals, then overwrites each LP line with the
 * run's per-LP net (createDistribution seeds pro-rata-on-ownership, which
 * a waterfall deliberately overrides).
 */
export async function createDistributionFromRun(
  runId: string,
  by: string | null,
): Promise<{ run: WaterfallRunFull; distributionId: string }> {
  const rows = await sql`SELECT * FROM waterfall_runs WHERE id = ${runId} LIMIT 1`
  if (!rows[0]) throw new Error("Waterfall run not found")
  const run = normalizeRun(rows[0])
  if (run.distribution_id) throw new Error("This run already pre-filled a distribution.")

  const { distribution, lineItems } = await createDistribution({
    fundId: run.fund_id,
    title: `Waterfall run #${run.run_number}`,
    source: "waterfall",
    grossAmount: run.outputs.totals.gross,
    carryDeduction: run.outputs.totals.totalToGp,
    netAmount: run.outputs.totals.totalToLps,
    createdBy: by,
  })

  // Overwrite the pro-rata seed with the waterfall's per-LP nets.
  const netByLp = new Map(run.outputs.lps.map((l) => [l.fundLpId, l.totalNet]))
  for (const line of lineItems) {
    const target = netByLp.get(line.fund_lp_id) ?? 0
    if (Math.abs((line.amount ?? 0) - target) >= 0.01) {
      await updateDistributionLineItem(line.id, { amount: target })
    }
  }

  await sql`
    UPDATE waterfall_runs SET distribution_id = ${distribution.id} WHERE id = ${runId}`
  return { run: { ...run, distribution_id: distribution.id }, distributionId: distribution.id }
}
