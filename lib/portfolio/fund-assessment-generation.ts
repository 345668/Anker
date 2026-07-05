/**
 * AI-generation pipeline for the 19 'generated' fields on the fund
 * assessment.
 *
 * For each requested field this module:
 *   1. Builds the prompt from lib/portfolio/fund-assessment-prompts.ts
 *      using the fund + current assessment values as context.
 *   2. Calls lib/ai/provider.generate() — resolves via the AI router.
 *   3. Trims the output and computes a confidence heuristic (0-1).
 *   4. Writes the text to funds.assessment[fieldKey] and the metadata
 *      to funds.assessment_meta[fieldKey] = { confidence, generated_at,
 *      model, prompt_version, generated_by }.
 *   5. Returns the updated assessment snapshot.
 *
 * Confidence heuristic
 * ───────────────────
 * No model self-rating in phase 3 — kept simple/deterministic so the UI
 * stays predictable. We measure proxies of quality:
 *   - Word count vs the prompt's expected minimum
 *   - Presence of numeric facts (numbers, percentages, years)
 *   - Presence of named entities (capitalised multi-word phrases)
 *   - Absence of obvious bail-out phrases ("As an AI", "I cannot")
 *
 * The score lands in roughly the 50-95% range — matches the screenshot's
 * 57% / 66% confidence-bar look without overclaiming.
 *
 * Storage schema (jsonb)
 * ──────────────────────
 *   funds.assessment        — { fieldKey: textValue, ... }       (phase 1)
 *   funds.assessment_meta   — { fieldKey: { confidence, generated_at,
 *                                            model, prompt_version,
 *                                            generated_by }, ... }  (phase 3)
 *
 * The migration (run-funds-assessment-meta-column.mjs) creates the meta
 * column. Schema-drift guard so generation fails gracefully before it
 * runs (text writes still land in funds.assessment).
 */

import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"
import { getFundById, type FundFull } from "@/lib/portfolio/funds"
import { getAssessment, type AssessmentValues } from "@/lib/portfolio/fund-assessment"
import { buildPrompt, PROMPT_VERSION } from "@/lib/portfolio/fund-assessment-prompts"
import { FIELD_BY_KEY } from "@/lib/portfolio/fund-assessment-taxonomy"

// ── types ───────────────────────────────────────────────────────────────

export interface GenerationMeta {
  confidence: number
  generated_at: string
  model: string | null
  prompt_version: string
  generated_by: string | null
}

export type AssessmentMeta = Record<string, GenerationMeta>

export interface GenerateFieldResult {
  fieldKey: string
  text: string | null
  meta: GenerationMeta | null
  error?: string
}

// ── meta column probe (schema-drift safe) ───────────────────────────────

let _metaColumnCheck: Promise<boolean> | null = null
export function hasAssessmentMetaColumn(): Promise<boolean> {
  if (_metaColumnCheck) return _metaColumnCheck
  _metaColumnCheck = (async () => {
    try {
      const r: any[] = await sql`
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'funds'
           AND column_name  = 'assessment_meta'
         LIMIT 1
      `
      return r.length > 0
    } catch {
      return false
    }
  })()
  return _metaColumnCheck
}

// ── reads ───────────────────────────────────────────────────────────────

export async function getAssessmentMeta(fundId: string): Promise<AssessmentMeta> {
  if (!(await hasAssessmentMetaColumn())) return {}
  try {
    const rows = await sql`SELECT assessment_meta FROM funds WHERE id = ${fundId} LIMIT 1`
    const raw = rows[0]?.assessment_meta
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as AssessmentMeta
    if (typeof raw === "string") {
      try { return JSON.parse(raw) } catch { return {} }
    }
  } catch (e) {
    console.error("[fund-assessment-generation getAssessmentMeta]", e)
  }
  return {}
}

// ── public generation API ───────────────────────────────────────────────

export interface GenerateFieldsInput {
  fundId: string
  fieldKeys: string[]
  /** When true, regenerates even if the field already has text. Default true —
   *  the editor always asks for a fresh draft on click. */
  regenerate?: boolean
  /** Stamped onto each meta row for the audit log. */
  generatedBy?: string | null
}

export async function generateFields(input: GenerateFieldsInput): Promise<GenerateFieldResult[]> {
  const fund = await getFundById(input.fundId)
  if (!fund) throw new Error(`Fund not found: ${input.fundId}`)
  const { values } = await getAssessment(fund.id)
  const meta = await getAssessmentMeta(fund.id)

  const out: GenerateFieldResult[] = []
  // Run sequentially — narratives are 100-200 words each, and a parallel
  // burst against the AI provider risks 429s on a busy day. Phase 4 can
  // add a small concurrency window if latency becomes a problem.
  for (const key of input.fieldKeys) {
    const def = FIELD_BY_KEY[key]
    if (!def) {
      out.push({ fieldKey: key, text: null, meta: null, error: "Unknown field" })
      continue
    }
    if (def.inputType !== "generated") {
      out.push({ fieldKey: key, text: null, meta: null, error: "Field is not AI-generated" })
      continue
    }
    if (!input.regenerate && isPresent(values[key])) {
      // Skip if value already exists and the caller didn't ask to overwrite.
      out.push({ fieldKey: key, text: String(values[key] ?? ""), meta: meta[key] ?? null })
      continue
    }

    const built = buildPrompt(key, fund, values)
    if (!built) {
      out.push({ fieldKey: key, text: null, meta: null, error: "No prompt builder for field" })
      continue
    }

    try {
      const start = Date.now()
      const text = await generate(built.prompt, {
        // Reuse the existing 'deep_research' task tag — same shape (multi-
        // paragraph synthesis grounded in supplied context) as the capital-
        // call notice drafter, so the router picks an appropriate model.
        task: "deep_research",
        maxTokens: built.maxTokens,
        temperature: 0.7,
        retries: 1,
      })
      const cleaned = stripBoilerplate(text).trim()
      if (!cleaned) {
        out.push({ fieldKey: key, text: null, meta: null, error: "Empty model response" })
        continue
      }

      // Stamp meta, persist into the row jsonbs.
      const confidence = scoreConfidence(cleaned, built.minWords)
      const newMeta: GenerationMeta = {
        confidence,
        generated_at: new Date().toISOString(),
        model: process.env.QWEN_MODEL ?? process.env.AI_MODEL ?? null,
        prompt_version: PROMPT_VERSION,
        generated_by: input.generatedBy ?? null,
      }
      await persistGeneration(fund.id, key, cleaned, newMeta)
      // Mirror the new value into our in-memory snapshot so subsequent
      // fields in this batch see the previous one's text (useful when
      // narratives reference each other, e.g. strategy_summary after
      // thesis_statement).
      values[key] = cleaned
      meta[key] = newMeta

      out.push({ fieldKey: key, text: cleaned, meta: newMeta })
      // Tiny pacing pause when generating many in a row.
      if (input.fieldKeys.length > 3 && Date.now() - start < 200) {
        await new Promise((r) => setTimeout(r, 150))
      }
    } catch (e: any) {
      console.error(`[fund-assessment-generation] ${key} failed`, e)
      out.push({
        fieldKey: key,
        text: null,
        meta: null,
        error: e?.message ?? "Generation failed",
      })
    }
  }
  return out
}

// ── persistence ─────────────────────────────────────────────────────────

async function persistGeneration(
  fundId: string,
  key: string,
  text: string,
  meta: GenerationMeta,
): Promise<void> {
  // jsonb merge using the || operator — only the touched keys change.
  // The text goes into assessment, the meta into assessment_meta.
  // Both updates in a single statement so they can't get out of sync.
  const textPatch = JSON.stringify({ [key]: text })
  const metaPatch = JSON.stringify({ [key]: meta })
  if (await hasAssessmentMetaColumn()) {
    await sql`
      UPDATE funds
         SET assessment      = COALESCE(assessment, '{}'::jsonb) || ${textPatch}::jsonb,
             assessment_meta = COALESCE(assessment_meta, '{}'::jsonb) || ${metaPatch}::jsonb,
             updated_at      = NOW()
       WHERE id = ${fundId}
    `
  } else {
    // Meta column missing — write the text but skip the meta. The UI's
    // confidence bar will be hidden until the column is added.
    await sql`
      UPDATE funds
         SET assessment = COALESCE(assessment, '{}'::jsonb) || ${textPatch}::jsonb,
             updated_at = NOW()
       WHERE id = ${fundId}
    `
  }
}

// ── confidence heuristic ────────────────────────────────────────────────

const NUMERIC_RX = /\b\d[\d,.]*\s*(%|x|×|yr|years|M|B|K|bn|mn)?\b/gi
const ENTITY_RX = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g
const BAILOUT_PHRASES = [
  "as an ai",
  "i cannot",
  "i'm not able",
  "i am not able",
  "as a language model",
  "no information",
  "insufficient context",
]

function scoreConfidence(text: string, minWords: number): number {
  const lc = text.toLowerCase()
  for (const p of BAILOUT_PHRASES) if (lc.includes(p)) return 0.3

  const words = text.trim().split(/\s+/).filter(Boolean)
  const wc = words.length

  // Length factor — caps at 1.0 once we hit 1.5× the prompt's minimum.
  const lengthFactor = Math.min(1, wc / Math.max(40, minWords * 1.5))

  // Specificity proxies.
  const numericHits = (text.match(NUMERIC_RX) ?? []).length
  const entityHits = (text.match(ENTITY_RX) ?? []).length
  // Cap each contribution so a single overflowing match can't dominate.
  const specificity = Math.min(1, (numericHits * 0.07) + (entityHits * 0.04))

  // Final blend: 60% length, 40% specificity, with a 0.5 floor when the
  // response at least cleared the minimum word count.
  const raw = 0.6 * lengthFactor + 0.4 * specificity
  const score = wc >= minWords ? Math.max(0.5, raw) : raw
  return Math.round(score * 100) / 100   // 2 d.p., 0.00-1.00
}

function stripBoilerplate(text: string): string {
  // Sometimes the model opens with "Here is the [section]:" or wraps the
  // response in quotes. Strip the most common variants.
  let t = text.trim()
  t = t.replace(/^(?:here(?:'s| is) (?:the )?[^:]+:\s*)/i, "")
  t = t.replace(/^"+|"+$/g, "")
  return t
}

function isPresent(v: any): boolean {
  if (v == null) return false
  if (typeof v === "string") return v.trim().length > 0
  return true
}
