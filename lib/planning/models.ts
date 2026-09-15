import { z } from "zod"
const money = z.number().finite().min(0).max(1e12)
export const runwaySchema = z.object({ cashOnHand: money, monthlyBurn: money, monthlyRevenue: money,
  burnGrowth: z.number().finite().min(-0.99).max(1), revenueGrowth: z.number().finite().min(-0.99).max(1),
  newRaiseMonth: z.number().int().min(0).max(36), newRaiseAmount: money })
export const capTableSchema = z.object({
  holders: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(100), shares: money,
    type: z.enum(["founder", "investor", "esop", "advisor"]) })).min(1).max(100),
  rounds: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(100),
    preMoney: money.refine(v => v > 0, "Pre-money valuation must be positive."), raise: money,
    esopTarget: z.number().finite().min(0).max(0.99) })).max(20),
}).superRefine((v, ctx) => {
  if (!v.holders.some(h => h.shares > 0)) ctx.addIssue({ code: "custom", message: "Add at least one positive shareholding." })
  if (v.holders.filter(h => h.type === "esop").length > 1) ctx.addIssue({ code: "custom", message: "Combine ESOP shares into one pool." })
  if (new Set(v.holders.map(h => h.id)).size !== v.holders.length || new Set(v.rounds.map(r => r.id)).size !== v.rounds.length) ctx.addIssue({ code: "custom", message: "Each holder and round needs a unique identity." })
})
export type RunwayState = z.infer<typeof runwaySchema>
export type CapTableState = z.infer<typeof capTableSchema>
export const DEFAULT_RUNWAY: RunwayState = { cashOnHand: 1800000, monthlyBurn: 180000, monthlyRevenue: 25000, burnGrowth: 0.03, revenueGrowth: 0.12, newRaiseMonth: 0, newRaiseAmount: 0 }
export const DEFAULT_CAP_TABLE: CapTableState = { holders: [
  { id: "h1", name: "Founder A", shares: 4500000, type: "founder" }, { id: "h2", name: "Founder B", shares: 4500000, type: "founder" }, { id: "h3", name: "ESOP pool", shares: 1000000, type: "esop" },
], rounds: [{ id: "seed", name: "Seed", preMoney: 8000000, raise: 2000000, esopTarget: 0.1 }] }

export function projectRunway(input: RunwayState, horizon = 36) {
  runwaySchema.parse(input)
  let cash = input.cashOnHand, burn = input.monthlyBurn, revenue = input.monthlyRevenue
  let zeroMonth: number | null = cash <= 0 ? 0 : null
  const points = []
  for (let month = 0; month <= horizon; month++) {
    // Month zero means no planned raise. Prior depletion remains visible even
    // when a later financing makes the cash balance positive again.
    if (cash <= 0 && zeroMonth === null) zeroMonth = month
    if (month > 0 && month === input.newRaiseMonth) cash += input.newRaiseAmount
    const netBurn = burn - revenue
    points.push({ month, cash, burn, revenue, netBurn })
    cash -= netBurn
    burn *= 1 + input.burnGrowth; revenue *= 1 + input.revenueGrowth
  }
  return { points, zeroMonth }
}
export function calculateCapTable(input: CapTableState) {
  capTableSchema.parse(input)
  let holders = input.holders.map(h => ({ ...h }))
  const stages: { name: string; total: number; holders: (CapTableState["holders"][number] & { pct: number })[] }[] = []
  function addStage(name: string) {
    const total = holders.reduce((n, h) => n + h.shares, 0)
    if (!Number.isFinite(total) || total <= 0) throw new Error("Share count is outside the supported range.")
    stages.push({ name, total, holders: holders.map(h => ({ ...h, pct: h.shares / total })) })
  }
  addStage("Current ownership")
  for (const round of input.rounds) {
    const total = holders.reduce((n, h) => n + h.shares, 0)
    const pool = holders.find(h => h.type === "esop")
    const currentPool = pool?.shares ?? 0
    const investorPct = round.raise / (round.preMoney + round.raise)
    const denominator = 1 - investorPct - round.esopTarget
    if (denominator <= 1e-8) throw new Error(`${round.name}: investor ownership plus the target ESOP pool must be below 100%.`)
    // Never cancel existing options merely because a lower target was entered.
    const postShares = Math.max(total / (1 - investorPct), (total - currentPool) / denominator)
    if (!Number.isFinite(postShares) || postShares > 1e15) throw new Error(`${round.name}: assumptions imply an unsupported share count.`)
    const newInvestor = investorPct * postShares
    const newPool = Math.max(0, postShares - total - newInvestor)
    if (pool) pool.shares += newPool
    else if (newPool > 0) holders.push({ id: `pool-${round.id}`, name: "ESOP pool", shares: newPool, type: "esop" })
    if (newInvestor > 0) holders.push({ id: `investor-${round.id}`, name: round.name, shares: newInvestor, type: "investor" })
    addStage(round.name)
  }
  return stages
}
export function validatePlanning(tool: string, value: unknown) {
  const parsed = tool === "runway" ? runwaySchema.parse(value) : capTableSchema.parse(value)
  if (tool === "cap-table") calculateCapTable(parsed as CapTableState)
  return parsed
}
