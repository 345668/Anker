/**
 * Fund inbound intake: the pure model (NO database or AI imports, so client components can use it).
 * docs/architecture/39-fund-inbound-deal-intake.md.
 *
 * Gates are deterministic and decide "fit"; the AI rubric ranks. A gate on information the applicant did not give is
 * `unknown`, never `fail`. The category is a pure function of gates, score and thresholds, so it is testable without a model.
 */
import { z } from "zod"

// ── config ──────────────────────────────────────────────────────────────

export const STAGES = ["Pre-seed", "Seed", "Series A", "Series B", "Growth"] as const
export type Category = "passed" | "review" | "not_a_fit"
export type GateResult = "pass" | "fail" | "unknown"

export const gatesSchema = z.object({
  stages: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  sectors: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  excludedSectors: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  geographies: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  excludedGeographies: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  raiseMin: z.number().nonnegative().nullable().default(null),
  raiseMax: z.number().nonnegative().nullable().default(null),
  chequeMin: z.number().nonnegative().nullable().default(null),
  chequeMax: z.number().nonnegative().nullable().default(null),
  /** Which gates reject on a clear miss. Others only lower the rank and raise a question. */
  hard: z.array(z.enum(["stage", "sector", "excludedSector", "geography", "excludedGeography", "raise", "cheque"])).default(["excludedSector", "excludedGeography"]),
})
export type Gates = z.infer<typeof gatesSchema>

export const rubricDimensionSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,30}$/),
  label: z.string().trim().min(1).max(60),
  weight: z.number().min(0).max(1),
  guidance: z.string().trim().max(400).default(""),
})
export type RubricDimension = z.infer<typeof rubricDimensionSchema>

export const thresholdsSchema = z.object({
  pass: z.number().min(0).max(100).default(70),
  review: z.number().min(0).max(100).default(50),
}).refine((t) => t.review <= t.pass, { message: "The review line cannot be above the pass line" })
export type Thresholds = z.infer<typeof thresholdsSchema>

export const customQuestionSchema = z.object({
  id: z.string().trim().regex(/^[a-z][a-z0-9_]{0,30}$/),
  label: z.string().trim().min(1).max(200),
  required: z.boolean().default(false),
  long: z.boolean().default(true),
})
export const formSchema = z.object({
  askRaise: z.boolean().default(true),
  askTraction: z.boolean().default(true),
  askTeam: z.boolean().default(true),
  askLocation: z.boolean().default(true),
  questions: z.array(customQuestionSchema).max(8).default([]),
})
export type FormConfig = z.infer<typeof formSchema>

/** Who hears about a new application: the fund workspace's owners and admins, by email, for the categories ticked. */
export const notifySchema = z.object({
  onNew: z.boolean().default(true),
  passed: z.boolean().default(true),
  review: z.boolean().default(true),
  notAFit: z.boolean().default(false),
})
export type NotifyConfig = z.infer<typeof notifySchema>
export const wantsNotice = (n: NotifyConfig, category: Category): boolean => n.onNew && (category === "passed" ? n.passed : category === "review" ? n.review : n.notAFit)

export const configSchema = z.object({
  enabled: z.boolean().default(false),
  headline: z.string().trim().max(120).default(""),
  intro: z.string().trim().max(1200).default(""),
  thesis: z.string().trim().max(3000).default(""),
  instructions: z.string().trim().max(3000).default(""),
  gates: gatesSchema.default(() => gatesSchema.parse({})),
  rubric: z.array(rubricDimensionSchema).min(1).max(10).default(() => DEFAULT_RUBRIC),
  thresholds: thresholdsSchema.default(() => thresholdsSchema.parse({})),
  form: formSchema.default(() => formSchema.parse({})),
  notify: notifySchema.default(() => notifySchema.parse({})),
}).superRefine((c, ctx) => {
  const sum = c.rubric.reduce((s, d) => s + d.weight, 0)
  if (Math.abs(sum - 1) > 0.011) ctx.addIssue({ code: "custom", path: ["rubric"], message: `Rubric weights must add up to 100% (now ${(sum * 100).toFixed(0)}%)` })
  const keys = new Set(c.rubric.map((d) => d.key))
  if (keys.size !== c.rubric.length) ctx.addIssue({ code: "custom", path: ["rubric"], message: "Rubric dimensions need unique keys" })
})
export type IntakeConfig = z.infer<typeof configSchema>

export const DEFAULT_RUBRIC: RubricDimension[] = [
  { key: "team", label: "Team", weight: 0.30, guidance: "Founder-market fit, prior exits, speed of execution." },
  { key: "market", label: "Market", weight: 0.20, guidance: "Size and growth of the market, why now." },
  { key: "product", label: "Product and moat", weight: 0.15, guidance: "Differentiation, defensibility, technical depth." },
  { key: "traction", label: "Traction", weight: 0.15, guidance: "Revenue or usage, growth, quality of demand." },
  { key: "thesis", label: "Thesis fit", weight: 0.10, guidance: "Fit with this fund's thesis, stage, sector and geography." },
  { key: "valuation", label: "Valuation and terms", weight: 0.10, guidance: "Entry price against comparable rounds and the exit maths." },
]

// ── presets ─────────────────────────────────────────────────────────────

export interface Preset { id: string; name: string; blurb: string; rubric: RubricDimension[]; thresholds: Thresholds }
const reweight = (w: Record<string, number>): RubricDimension[] => DEFAULT_RUBRIC.map((d) => ({ ...d, weight: w[d.key] ?? d.weight }))

export const PRESETS: Preset[] = [
  { id: "balanced", name: "Balanced early-stage", blurb: "Team first, then market, product and traction. A sensible start for pre-seed to Series A.", rubric: DEFAULT_RUBRIC, thresholds: { pass: 70, review: 50 } },
  { id: "thesis_first", name: "Thesis first", blurb: "Fit with your thesis counts most; a strong team is next.", rubric: reweight({ team: 0.25, market: 0.15, product: 0.10, traction: 0.10, thesis: 0.30, valuation: 0.10 }), thresholds: { pass: 70, review: 50 } },
  { id: "traction_first", name: "Traction first", blurb: "For later seed and Series A: evidence of demand outweighs the story.", rubric: reweight({ team: 0.20, market: 0.15, product: 0.10, traction: 0.35, thesis: 0.10, valuation: 0.10 }), thresholds: { pass: 70, review: 50 } },
  { id: "strict", name: "Strict screen", blurb: "A high bar: only clear fits pass, so you read fewer.", rubric: DEFAULT_RUBRIC, thresholds: { pass: 80, review: 60 } },
  { id: "open", name: "Open funnel", blurb: "A low bar: most things that fit your gates reach you for a look.", rubric: DEFAULT_RUBRIC, thresholds: { pass: 60, review: 40 } },
]

export function defaultConfig(): IntakeConfig {
  return configSchema.parse({})
}

// ── submission ──────────────────────────────────────────────────────────

export interface Submission {
  companyName: string
  website?: string | null
  oneLiner?: string | null
  stage?: string | null
  sectors?: string[]
  location?: string | null
  raiseAmount?: number | null
  chequeAsk?: number | null
  /** Free-text answers keyed by field or custom question id. Untrusted. */
  answers: Record<string, string>
  deckSummary?: string | null
}

// ── gates ───────────────────────────────────────────────────────────────

const norm = (s: string) => s.trim().toLowerCase()
const anyMatch = (values: string[], wanted: string[]) => values.some((v) => wanted.some((w) => norm(v).includes(norm(w)) || norm(w).includes(norm(v))))

export interface GateOutcome { gate: string; label: string; result: GateResult; hard: boolean; detail: string }

export function evaluateGates(g: Gates, s: Submission): GateOutcome[] {
  const out: GateOutcome[] = []
  const hard = (k: Gates["hard"][number]) => g.hard.includes(k)
  const add = (gate: string, label: string, hardKey: Gates["hard"][number], result: GateResult, detail: string) =>
    out.push({ gate, label, result, hard: hard(hardKey), detail })

  if (g.stages.length) {
    if (!s.stage) add("stage", "Stage", "stage", "unknown", "No stage given")
    else if (anyMatch([s.stage], g.stages)) add("stage", "Stage", "stage", "pass", `${s.stage} is in scope`)
    else add("stage", "Stage", "stage", "fail", `${s.stage} is outside ${g.stages.join(", ")}`)
  }
  const sectors = s.sectors ?? []
  if (g.sectors.length) {
    if (!sectors.length) add("sector", "Sector", "sector", "unknown", "No sector given")
    else if (anyMatch(sectors, g.sectors)) add("sector", "Sector", "sector", "pass", "A sector matches")
    else add("sector", "Sector", "sector", "fail", `${sectors.join(", ")} is outside ${g.sectors.join(", ")}`)
  }
  if (g.excludedSectors.length && sectors.length) {
    const hit = sectors.filter((x) => anyMatch([x], g.excludedSectors))
    add("excludedSector", "Excluded sector", "excludedSector", hit.length ? "fail" : "pass", hit.length ? `Excluded: ${hit.join(", ")}` : "No excluded sector")
  }
  const place = s.location?.trim()
  if (g.geographies.length) {
    if (!place) add("geography", "Geography", "geography", "unknown", "No location given")
    else if (anyMatch([place], g.geographies)) add("geography", "Geography", "geography", "pass", `${place} is in scope`)
    else add("geography", "Geography", "geography", "fail", `${place} is outside ${g.geographies.join(", ")}`)
  }
  if (g.excludedGeographies.length && place) {
    const hit = anyMatch([place], g.excludedGeographies)
    add("excludedGeography", "Excluded geography", "excludedGeography", hit ? "fail" : "pass", hit ? `${place} is excluded` : "Not excluded")
  }
  if ((g.raiseMin != null || g.raiseMax != null)) {
    const r = s.raiseAmount
    if (r == null) add("raise", "Round size", "raise", "unknown", "No raise amount given")
    else if ((g.raiseMin != null && r < g.raiseMin) || (g.raiseMax != null && r > g.raiseMax)) add("raise", "Round size", "raise", "fail", `Raise ${r.toLocaleString("en-US")} is outside the range`)
    else add("raise", "Round size", "raise", "pass", "Raise is in range")
  }
  if ((g.chequeMin != null || g.chequeMax != null)) {
    const c = s.chequeAsk
    if (c == null) add("cheque", "Cheque", "cheque", "unknown", "No cheque asked of us")
    else if ((g.chequeMax != null && c > g.chequeMax) || (g.chequeMin != null && c < g.chequeMin)) add("cheque", "Cheque", "cheque", "fail", `Cheque ${c.toLocaleString("en-US")} does not fit our range`)
    else add("cheque", "Cheque", "cheque", "pass", "Cheque fits")
  }
  return out
}

// ── score and category ──────────────────────────────────────────────────

export interface DimensionScore { key: string; score: number; note: string }

/** Weighted 1-5 scores to 0-100. Missing dimensions are skipped and the weights renormalised. */
export function scoreOf(rubric: RubricDimension[], scores: DimensionScore[]): number {
  let total = 0, used = 0
  for (const d of rubric) {
    const s = scores.find((x) => x.key === d.key)
    if (!s) continue
    total += Math.max(1, Math.min(5, s.score)) * d.weight
    used += d.weight
  }
  if (!used) return 0
  return Math.round(((total / used - 1) / 4) * 1000) / 10
}

export interface CategoryDecision { category: Category; reason: string }

export function categorise(input: { gates: GateOutcome[]; score: number | null; thresholds: Thresholds; engineOk: boolean }): CategoryDecision {
  const failedHard = input.gates.filter((g) => g.hard && g.result === "fail")
  if (failedHard.length) return { category: "not_a_fit", reason: `Outside what the fund backs: ${failedHard.map((g) => g.detail).join("; ")}` }
  // Fail safe: a machine fault never rejects a deal.
  if (!input.engineOk || input.score === null) return { category: "review", reason: "The assessment could not be completed, so a person should look." }
  if (input.score < input.thresholds.review) return { category: "not_a_fit", reason: `Scored ${input.score}, below the review line of ${input.thresholds.review}.` }
  const softFails = input.gates.filter((g) => !g.hard && g.result === "fail")
  const unknownHard = input.gates.filter((g) => g.hard && g.result === "unknown")
  if (input.score >= input.thresholds.pass && !softFails.length && !unknownHard.length) return { category: "passed", reason: `Scored ${input.score}, at or above the pass line of ${input.thresholds.pass}, and clear of every gate.` }
  const why = [
    input.score < input.thresholds.pass ? `Scored ${input.score}, between the review (${input.thresholds.review}) and pass (${input.thresholds.pass}) lines` : "",
    softFails.length ? `soft gate missed: ${softFails.map((g) => g.label).join(", ")}` : "",
    unknownHard.length ? `not stated: ${unknownHard.map((g) => g.label).join(", ")}` : "",
  ].filter(Boolean).join("; ")
  return { category: "review", reason: why || "Needs a person's judgement." }
}

export const CATEGORY_LABEL: Record<Category, string> = { passed: "Passed", review: "Review", not_a_fit: "Not a fit" }
export const CATEGORY_ORDER: Record<Category, number> = { passed: 0, review: 1, not_a_fit: 2 }

/** Board order inside a column: category, then score, then newest. Deals without an engine result sort last. */
export function compareDeals(a: { category?: Category | null; score?: number | null; created_at: string }, b: { category?: Category | null; score?: number | null; created_at: string }): number {
  const ca = a.category ? CATEGORY_ORDER[a.category] : 3, cb = b.category ? CATEGORY_ORDER[b.category] : 3
  if (ca !== cb) return ca - cb
  const sa = a.score ?? -1, sb = b.score ?? -1
  if (sa !== sb) return sb - sa
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

// ── engine result ───────────────────────────────────────────────────────

export interface EngineResult {
  category: Category
  score: number | null
  reason: string
  gates: GateOutcome[]
  dimensions: DimensionScore[]
  summary: string
  strengths: string[]
  concerns: string[]
  questions: string[]
  engineOk: boolean
  configVersion: number
  usedAi: boolean
  at: string
}
