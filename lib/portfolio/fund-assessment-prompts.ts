/**
 * Prompt builders for the 19 AI-generated fund-assessment fields.
 *
 * Each builder takes the current assessment values (the entire jsonb blob)
 * and produces a prompt scoped to one field. Prompts share a "house style"
 * preamble so the LLM produces narratives that read like editorial-grade
 * fund-marketing copy — concise, specific, and grounded in the supplied
 * facts rather than generic.
 *
 * Adding a new generated field?
 *   1. Mark it inputType: "generated" in fund-assessment-taxonomy.ts.
 *   2. Add a builder here, keyed by the same slug.
 *   3. Done — the generation endpoint dispatches by key automatically.
 *
 * PROMPT_VERSION below is stamped onto each generation. Bumping it
 * invalidates the cache and causes the editor to surface "regenerate
 * recommended" on stale rows (phase 4 UX).
 */

import type { AssessmentValues } from "@/lib/portfolio/fund-assessment"
import type { FundFull } from "@/lib/portfolio/funds"

export const PROMPT_VERSION = "v1"

export interface BuiltPrompt {
  prompt: string
  /** Target token budget for the response. Most narratives are 80-200 words. */
  maxTokens: number
  /** Heuristic min-word-count we expect; used by the confidence scorer. */
  minWords: number
}

const HOUSE_STYLE = `You write editorial-grade fund-marketing copy for an institutional venture capital
publication. Voice is precise and confident — never vague. Every sentence
carries a specific fact, number, or claim grounded in the supplied context.
You avoid clichés ("at the intersection of", "we believe", "uniquely
positioned", "passionate about"). Output PLAIN PROSE only — no preamble,
no markdown headers, no bullet lists unless the field explicitly asks
for them. Do NOT mention that you are an AI.`

function header(fund: FundFull, values: AssessmentValues): string {
  // The compact fact dump that grounds every prompt. Keep keys narrow so
  // the LLM can't be confused by 158 fields when most are irrelevant to
  // any single narrative.
  const facts: string[] = []
  facts.push(`Fund name: ${fund.name}`)
  if (fund.vintage_year) facts.push(`Vintage: ${fund.vintage_year}`)
  if (values.asset_class) facts.push(`Asset class: ${values.asset_class}`)
  if (values.sub_asset_class) facts.push(`Sub-asset class: ${values.sub_asset_class}`)
  if (values.target_geography) {
    const geo = Array.isArray(values.target_geography)
      ? values.target_geography.join(", ")
      : String(values.target_geography)
    facts.push(`Target geography: ${geo}`)
  }
  if (values.sector_focus) facts.push(`Sector focus: ${values.sector_focus}`)
  if (values.target_investment_stage) facts.push(`Target stage: ${values.target_investment_stage}`)
  const ts = midpointLabel(values.target_fund_size, fund.currency)
  if (ts) facts.push(`Target fund size: ${ts}`)
  if (values.target_gross_irr) facts.push(`Target gross IRR: ${values.target_gross_irr}%`)
  if (values.target_hold_period) facts.push(`Target hold: ${values.target_hold_period} yrs`)
  if (values.gp_location) facts.push(`GP location: ${values.gp_location}`)
  return facts.join(" · ")
}

// ── builders by field key ───────────────────────────────────────────────

type Builder = (fund: FundFull, values: AssessmentValues) => BuiltPrompt

const BUILDERS: Record<string, Builder> = {
  // ─── Narratives ───────────────────────────────────────────────────
  investment_philosophy: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Investment Philosophy" section of this fund's LP-facing
deck. 100-160 words. Answer: what does this fund believe about how
venture returns are generated, and how does that belief shape its
behaviour? One specific belief, one specific behaviour it drives.`,
    maxTokens: 320,
    minWords: 100,
  }),

  market_opportunity: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Market Opportunity" section. 120-180 words. Open with a
quantitative anchor (TAM, growth rate, share, or comparable). Then
explain what specifically is changing in this market right now that
opens a window for a new fund. Avoid the generic "trillion-dollar
opportunity" framing; cite something concrete.`,
    maxTokens: 380,
    minWords: 120,
  }),

  key_risks: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Key Risks" section honestly — the way a credible LP brief
would. 100-150 words. Identify 3 risks specific to this fund (not
generic venture risks). For each, name the risk in 5-8 words and
follow with 1-2 sentences on how the GP is mitigating it. Do not
soft-pedal.`,
    maxTokens: 320,
    minWords: 100,
  }),

  competitive_edge: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Competitive Edge" section. 100-150 words. State what this
fund does differently from the median fund in its stage/geography.
Be specific about WHO they compete with for deals and HOW they win.
Avoid "unique network" / "deep expertise" framing — name the
mechanism.`,
    maxTokens: 320,
    minWords: 100,
  }),

  // ─── Strategy ─────────────────────────────────────────────────────
  strategy_summary: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write a 3-sentence "Strategy Summary" suitable for the top of a fund
one-pager. Sentence 1: what the fund invests in (sector × stage ×
geography). Sentence 2: how it adds value beyond capital. Sentence 3:
the target outcome (return profile, hold, exit type).`,
    maxTokens: 220,
    minWords: 50,
  }),

  market_landscape: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Describe the "Market Landscape" this fund operates in. 100-150 words.
Cover: incumbent positioning, recent shifts (last 24 months), and 2-3
adjacent markets that are converging. Cite specific company names
where possible.`,
    maxTokens: 320,
    minWords: 100,
  }),

  why_now: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Answer "Why Now?" in 80-130 words. What technological, regulatory,
or behavioural change in the last 12-36 months makes this fund's
thesis urgent — i.e. why couldn't this fund have launched 5 years ago
and why does waiting 3 years cost return? Be concrete.`,
    maxTokens: 280,
    minWords: 80,
  }),

  exit_assumptions: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Exit Assumptions" the fund underwrites against. 80-130
words. Cover: realistic exit timeline (years from initial cheque),
exit mix (IPO / strategic / secondary), and the multiple range
expected at exit. Reference comparable exits in the target market.`,
    maxTokens: 280,
    minWords: 80,
  }),

  thesis_statement: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write a single, declarative "Thesis Statement" — one paragraph, 60-90
words. Open with a claim about how venture value is created in this
fund's category, then explain what that claim implies for portfolio
construction. The thesis should be falsifiable.`,
    maxTokens: 220,
    minWords: 60,
  }),

  strategy_problem: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Strategy Problem" section: 80-120 words. What problem in
the existing venture / portfolio-company landscape does this fund
exist to solve? Frame it from the founder's perspective, not the
LP's.`,
    maxTokens: 260,
    minWords: 80,
  }),

  strategy_opportunity: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Strategy Opportunity" section: 80-130 words. Given the
problem identified above, what is the size and shape of the
opportunity? What's the upper bound on capture? Quantify where
possible.`,
    maxTokens: 280,
    minWords: 80,
  }),

  strategy_market_gap: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Market Gap" section: 60-100 words. What is missing in the
current market that this fund's strategy fills? Be specific about the
gap (geographic, stage, sector, capability) and why other funds have
not addressed it.`,
    maxTokens: 240,
    minWords: 60,
  }),

  target_market_description: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Target Market Description". 100-140 words. Describe the
ideal portfolio company at the moment of investment: stage, revenue
band, team profile, capital structure, traction signals. The reader
should be able to identify a fit in 30 seconds.`,
    maxTokens: 300,
    minWords: 100,
  }),

  strategy_solution: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Strategy Solution" section: 100-140 words. How exactly
does this fund's investment activity solve the problem identified
earlier? What does the GP do at portfolio companies that other
funds don't?`,
    maxTokens: 300,
    minWords: 100,
  }),

  value_creation_strategies: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

List 4-6 specific "Value Creation Strategies" this fund uses with
portfolio companies. Each strategy: name it (3-5 words), then 1-2
sentences explaining mechanics. Output as a markdown list.`,
    maxTokens: 380,
    minWords: 80,
  }),

  strategy_differentiation: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Strategy Differentiation" section: 80-130 words. What
makes this fund's approach genuinely different — not from a marketing
standpoint, but operationally? What can this fund do that the median
peer cannot?`,
    maxTokens: 280,
    minWords: 80,
  }),

  // ─── Regulatory ───────────────────────────────────────────────────
  affiliate_services: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Affiliate Services" disclosure section for the fund's PPM.
80-140 words. Disclose any services the GP, its affiliates, or
related parties provide to portfolio companies, and whether those
services are compensated separately from the management fee. If
none, state that plainly and explain the structure preventing such
arrangements.`,
    maxTokens: 300,
    minWords: 80,
  }),

  // ─── Team / Experience ────────────────────────────────────────────
  investment_manager_experience: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Investment Manager Experience" section. 100-160 words.
Cover: where the principals trained, what they've built or invested
in before, and the specific deals/exits that prepared them for this
fund's strategy. Cite firms and outcomes.`,
    maxTokens: 340,
    minWords: 100,
  }),

  ic_experience: (fund, v) => ({
    prompt: `${HOUSE_STYLE}

Context: ${header(fund, v)}

Write the "Investment Committee Experience" section. 100-140 words.
Describe the IC members' collective backgrounds, decision-making
processes, dissent norms, and any structural rules (e.g. unanimity,
veto rights, recusal). End with the average IC tenure.`,
    maxTokens: 300,
    minWords: 100,
  }),
}

// ── public API ──────────────────────────────────────────────────────────

export function buildPrompt(fieldKey: string, fund: FundFull, values: AssessmentValues): BuiltPrompt | null {
  const builder = BUILDERS[fieldKey]
  if (!builder) return null
  return builder(fund, values)
}

export function listGeneratedFieldKeys(): string[] {
  return Object.keys(BUILDERS)
}

// ── helpers ─────────────────────────────────────────────────────────────

function midpointLabel(v: any, currency: string): string | null {
  if (v == null) return null
  if (typeof v === "number") {
    return formatMoney(v, currency)
  }
  if (typeof v === "object") {
    const min = v.min != null ? Number(v.min) : null
    const max = v.max != null ? Number(v.max) : null
    if (min != null && max != null) return `${formatMoney(min, currency)}–${formatMoney(max, currency)}`
    if (min != null) return `>${formatMoney(min, currency)}`
    if (max != null) return `<${formatMoney(max, currency)}`
  }
  return null
}

function formatMoney(n: number, currency: string): string {
  if (!Number.isFinite(n)) return ""
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B ${currency}`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M ${currency}`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K ${currency}`
  return `${n} ${currency}`
}
