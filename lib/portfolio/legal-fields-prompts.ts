/**
 * Legal & Compliance — prompt library for the 8 generated narrative fields.
 *
 * Mirrors lib/portfolio/fund-assessment-prompts.ts in shape. Each builder
 * takes the fund + current legal_fields values + relevant assessment
 * values (when set) as context and returns the prompt + token budget +
 * min word-count for the confidence scorer.
 *
 * Adding a new generated field:
 *   1. Mark it inputType: "generated" in legal-fields-taxonomy.ts
 *   2. Add a builder here keyed by the same slug
 *   3. Done — the generation endpoint dispatches by key automatically.
 *
 * PROMPT_VERSION is stamped onto each generation. Bumping it invalidates
 * the cache and lets the UI surface "regenerate recommended" on stale
 * rows (future polish).
 */

import type { FundFull } from "@/lib/portfolio/funds"
import type { LegalFieldValues } from "@/lib/portfolio/legal-fields"
import type { AssessmentValues } from "@/lib/portfolio/fund-assessment"

export const PROMPT_VERSION = "v1"

export interface BuiltLegalPrompt {
  prompt: string
  maxTokens: number
  minWords: number
}

const HOUSE_STYLE = `You write fund-formation legal narrative for an institutional venture
capital private placement memorandum. Voice is precise, factual,
and conservative — these sections will appear inside a PPM the LP
reads alongside their lawyer. Avoid marketing clichés ("uniquely
positioned", "passionate about"). Every claim should be grounded in
supplied facts. Output PLAIN PROSE only — no preamble, no markdown
headers, no bullet lists unless the section explicitly asks. Do NOT
mention that you are an AI.`

function legalContext(fund: FundFull, legal: LegalFieldValues, assessment: AssessmentValues): string {
  // Compact fact dump that grounds every prompt. Pulls from BOTH the
  // legal taxonomy (the editor's primary input) AND the assessment
  // taxonomy (where richer strategy/thesis context already lives).
  const facts: string[] = []
  facts.push(`Fund: ${legal.fund_name || fund.name}`)
  if (fund.vintage_year) facts.push(`Vintage: ${fund.vintage_year}`)
  const stage = legal.target_investment_stage || assessment.target_investment_stage
  if (stage) facts.push(`Target stage: ${stage}`)
  const sector = legal.sector_focus || assessment.sector_focus
  if (sector) facts.push(`Sector focus: ${sector}`)
  const geo = legal.target_geography_country
    || (Array.isArray(assessment.target_geography) ? assessment.target_geography.join(", ") : assessment.target_geography)
  if (geo) facts.push(`Geography: ${geo}`)
  if (legal.target_fund_size) facts.push(`Target fund size: ${formatMoney(legal.target_fund_size)}`)
  if (legal.target_net_irr) facts.push(`Target net IRR: ${legal.target_net_irr}%`)
  if (legal.target_net_moic) facts.push(`Target net MOIC: ${legal.target_net_moic}×`)
  if (legal.fund_term) facts.push(`Fund term: ${legal.fund_term} yrs`)
  if (legal.investment_period) facts.push(`Investment period: ${legal.investment_period} yrs`)
  if (legal.management_fee) facts.push(`Management fee: ${legal.management_fee}%`)
  if (legal.carried_interest) facts.push(`Carried interest: ${legal.carried_interest}%`)
  if (legal.gp_managing_member) facts.push(`GP managing member: ${legal.gp_managing_member}`)
  if (legal.key_person_names) facts.push(`Key persons: ${legal.key_person_names}`)
  return facts.join(" · ")
}

// ── builders by field key ───────────────────────────────────────────────

type Builder = (fund: FundFull, legal: LegalFieldValues, assessment: AssessmentValues) => BuiltLegalPrompt

const BUILDERS: Record<string, Builder> = {
  investment_philosophy: (fund, l, a) => ({
    prompt: `${HOUSE_STYLE}

Context: ${legalContext(fund, l, a)}

Write the "Investment Philosophy" section of this fund's PPM. 100-160
words. Answer: what does this fund believe about how venture returns
are generated in its target stage/sector, and how does that belief
shape its portfolio-construction behaviour? One specific belief, one
specific behaviour it drives.`,
    maxTokens: 320, minWords: 100,
  }),

  market_opportunity: (fund, l, a) => ({
    prompt: `${HOUSE_STYLE}

Context: ${legalContext(fund, l, a)}

Write the "Market Opportunity" section of the PPM. 120-180 words.
Open with a quantitative anchor (TAM, growth rate, share). Then
explain what specifically is changing in this market right now that
opens a window for the fund. Cite concrete data points; avoid the
"trillion-dollar opportunity" framing.`,
    maxTokens: 380, minWords: 120,
  }),

  target_market_description: (fund, l, a) => ({
    prompt: `${HOUSE_STYLE}

Context: ${legalContext(fund, l, a)}

Write the "Target Market Description" section of the PPM. 100-140
words. Describe the ideal portfolio company at the moment of
investment: stage, revenue band, team profile, capital structure,
traction signals. The reader should be able to identify a fit in 30
seconds.`,
    maxTokens: 300, minWords: 100,
  }),

  thesis_statement: (fund, l, a) => ({
    prompt: `${HOUSE_STYLE}

Context: ${legalContext(fund, l, a)}

Write a single, declarative "Thesis Statement" for the PPM — one
paragraph, 60-90 words. Open with a claim about how venture value is
created in this fund's category, then explain what that claim implies
for the fund's portfolio construction. The thesis must be
falsifiable.`,
    maxTokens: 220, minWords: 60,
  }),

  why_now: (fund, l, a) => ({
    prompt: `${HOUSE_STYLE}

Context: ${legalContext(fund, l, a)}

Answer "Why Now?" in 80-130 words for the PPM. What technological,
regulatory, or behavioural change in the last 12-36 months makes
this fund's thesis urgent — i.e. why couldn't this fund have launched
5 years ago, and why does waiting 3 years cost return? Be concrete.`,
    maxTokens: 280, minWords: 80,
  }),

  investment_manager_experience: (fund, l, a) => ({
    prompt: `${HOUSE_STYLE}

Context: ${legalContext(fund, l, a)}

Write the "Investment Manager Experience" PPM section. 100-160 words.
Cover where the principals trained, what they've built or invested
in before, and the specific deals/exits that prepared them for this
fund's strategy. Cite firms and outcomes where possible. Conservative
tone — this is a PPM, not a pitch deck.`,
    maxTokens: 340, minWords: 100,
  }),

  ic_experience: (fund, l, a) => ({
    prompt: `${HOUSE_STYLE}

Context: ${legalContext(fund, l, a)}

Write the "Investment Committee Experience" PPM section. 100-140
words. Describe the IC members' collective backgrounds, decision-
making process, dissent norms, and any structural rules (e.g.
unanimity, veto rights, recusal). End with the average IC tenure.`,
    maxTokens: 300, minWords: 100,
  }),

  affiliate_services: (fund, l, a) => ({
    prompt: `${HOUSE_STYLE}

Context: ${legalContext(fund, l, a)}

Write the "Affiliate Services" disclosure section for the PPM. 80-140
words. Disclose any services the GP, its affiliates, or related
parties provide to portfolio companies, and whether those services
are compensated separately from the management fee. If none, state
that plainly and explain the structure preventing such arrangements.
Reads like a regulatory disclosure, not marketing copy.`,
    maxTokens: 300, minWords: 80,
  }),
}

// ── public API ──────────────────────────────────────────────────────────

export function buildLegalPrompt(
  fieldKey: string,
  fund: FundFull,
  legal: LegalFieldValues,
  assessment: AssessmentValues,
): BuiltLegalPrompt | null {
  const b = BUILDERS[fieldKey]
  if (!b) return null
  return b(fund, legal, assessment)
}

export function listGeneratedLegalFieldKeys(): string[] {
  return Object.keys(BUILDERS)
}

// ── helpers ─────────────────────────────────────────────────────────────

function formatMoney(v: any): string {
  if (v == null) return ""
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return ""
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B USD`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M USD`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K USD`
  return `${n} USD`
}
