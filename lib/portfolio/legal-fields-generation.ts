/**
 * Legal & Compliance — AI-generation pipeline for the 8 narrative fields.
 *
 * Mirrors lib/portfolio/fund-assessment-generation.ts:
 *   1. Build prompt from lib/portfolio/legal-fields-prompts.ts
 *   2. Call lib/ai/provider.generate() (Qwen via DashScope)
 *   3. Trim + compute confidence heuristic (0-1)
 *   4. Persist text in funds.legal_fields, meta in funds.legal_fields_meta
 *   5. Return the updated payload
 *
 * Confidence heuristic mirrors the assessment scorer:
 *   - 60% length factor (vs prompt's minWords)
 *   - 40% specificity proxy (numeric facts + named entities)
 *   - Bail-out floor of 0.30 when the model returns 'As an AI', etc.
 *   - 0.50 floor once minWords is cleared
 *
 * Schema-drift safe — if the meta column is missing, the text still
 * persists and the UI just doesn't render a confidence bar.
 */

import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"
import { getFundById } from "@/lib/portfolio/funds"
import { getLegalFields, type LegalFieldValues } from "@/lib/portfolio/legal-fields"
import { getAssessment } from "@/lib/portfolio/fund-assessment"
import { buildLegalPrompt, PROMPT_VERSION } from "@/lib/portfolio/legal-fields-prompts"
import { LEGAL_FIELD_BY_KEY } from "@/lib/portfolio/legal-fields-taxonomy"

// ── types ───────────────────────────────────────────────────────────────

export interface LegalGenerationMeta {
  confidence: number
  generated_at: string
  model: string | null
  prompt_version: string
  generated_by: string | null
}

export type LegalFieldsMeta = Record<string, LegalGenerationMeta>

export interface GenerateLegalFieldResult {
  fieldKey: string
  text: string | null
  meta: LegalGenerationMeta | null
  error?: string
}

// ── meta column probe ──────────────────────────────────────────────────-

let _metaColumnCheck: Promise<boolean> | null = null
export function hasLegalFieldsMetaColumn(): Promise<boolean> {
  if (_metaColumnCheck) return _metaColumnCheck
  _metaColumnCheck = (async () => {
    try {
      const r: any[] = await sql`
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'funds'
           AND column_name = 'legal_fields_meta'
         LIMIT 1
      `
      return r.length > 0
    } catch { return false }
  })()
  return _metaColumnCheck
}

export async function getLegalFieldsMeta(fundId: string): Promise<LegalFieldsMeta> {
  if (!(await hasLegalFieldsMetaColumn())) return {}
  try {
    const rows = await sql`SELECT legal_fields_meta FROM funds WHERE id = ${fundId}::uuid LIMIT 1`
    const raw = rows[0]?.legal_fields_meta
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as LegalFieldsMeta
    if (typeof raw === "string") {
      try { return JSON.parse(raw) } catch { return {} }
    }
  } catch (e) {
    console.error("[legal-fields-generation getLegalFieldsMeta]", e)
  }
  return {}
}

// ── public generation API ──────────────────────────────────────────────-

export interface GenerateLegalFieldsInput {
  fundId: string
  fieldKeys: string[]
  /** Default true — caller almost always wants a fresh draft on click. */
  regenerate?: boolean
  /** Audit trail. */
  generatedBy?: string | null
}

export async function generateLegalFields(input: GenerateLegalFieldsInput): Promise<GenerateLegalFieldResult[]> {
  const fund = await getFundById(input.fundId)
  if (!fund) throw new Error(`Fund not found: ${input.fundId}`)

  // Both context sources — legal field values + fund assessment values —
  // so prompts can reference strategy/thesis context already entered
  // upstream. Cheap to load (single jsonb each).
  const [legal, assessment] = await Promise.all([
    getLegalFields(fund.id).then((p): LegalFieldValues => (p?.values ?? {}) as LegalFieldValues),
    getAssessment(fund.id).then((a) => a.values),
  ])
  const meta = await getLegalFieldsMeta(fund.id)

  const out: GenerateLegalFieldResult[] = []
  for (const key of input.fieldKeys) {
    const def = LEGAL_FIELD_BY_KEY[key]
    if (!def) {
      out.push({ fieldKey: key, text: null, meta: null, error: "Unknown field" })
      continue
    }
    if (def.inputType !== "generated") {
      out.push({ fieldKey: key, text: null, meta: null, error: "Field is not AI-generated" })
      continue
    }
    if (!input.regenerate && isPresent(legal[key])) {
      out.push({ fieldKey: key, text: String(legal[key]), meta: meta[key] ?? null })
      continue
    }
    const built = buildLegalPrompt(key, fund, legal, assessment)
    if (!built) {
      out.push({ fieldKey: key, text: null, meta: null, error: "No prompt builder for field" })
      continue
    }
    try {
      const text = await generate(built.prompt, {
        task: "deep_research",
        maxTokens: built.maxTokens,
        temperature: 0.6,
        retries: 1,
      })
      const cleaned = stripBoilerplate(text).trim()
      if (!cleaned) {
        out.push({ fieldKey: key, text: null, meta: null, error: "Empty model response" })
        continue
      }
      const confidence = scoreConfidence(cleaned, built.minWords)
      const newMeta: LegalGenerationMeta = {
        confidence,
        generated_at: new Date().toISOString(),
        model: process.env.QWEN_MODEL ?? process.env.AI_MODEL ?? null,
        prompt_version: PROMPT_VERSION,
        generated_by: input.generatedBy ?? null,
      }
      await persistGeneration(fund.id, key, cleaned, newMeta)
      legal[key] = cleaned
      meta[key] = newMeta
      out.push({ fieldKey: key, text: cleaned, meta: newMeta })

      // Light pacing between bulk-generate calls.
      if (input.fieldKeys.length > 3) {
        await new Promise((r) => setTimeout(r, 150))
      }
    } catch (e: any) {
      console.error(`[legal-fields-generation] ${key} failed`, e)
      out.push({ fieldKey: key, text: null, meta: null, error: e?.message ?? "Generation failed" })
    }
  }
  return out
}

// ── persistence ─────────────────────────────────────────────────────────

async function persistGeneration(
  fundId: string,
  key: string,
  text: string,
  meta: LegalGenerationMeta,
): Promise<void> {
  const textPatch = JSON.stringify({ [key]: text })
  const metaPatch = JSON.stringify({ [key]: meta })
  // Generating a fresh value implicitly REVERTS the field's approval —
  // the next reviewer must re-approve. Same pattern as patchLegalFields
  // (Notion/DocuSign convention).
  if (await hasLegalFieldsMetaColumn()) {
    await sql`
      UPDATE funds
         SET legal_fields           = COALESCE(legal_fields, '{}'::jsonb) || ${textPatch}::jsonb,
             legal_fields_meta      = COALESCE(legal_fields_meta, '{}'::jsonb) || ${metaPatch}::jsonb,
             legal_field_approvals  = COALESCE(legal_field_approvals, '{}'::jsonb) - ${key}::text,
             updated_at             = NOW()
       WHERE id = ${fundId}::uuid
    `
  } else {
    await sql`
      UPDATE funds
         SET legal_fields           = COALESCE(legal_fields, '{}'::jsonb) || ${textPatch}::jsonb,
             legal_field_approvals  = COALESCE(legal_field_approvals, '{}'::jsonb) - ${key}::text,
             updated_at             = NOW()
       WHERE id = ${fundId}::uuid
    `
  }
}

// ── confidence heuristic ───────────────────────────────────────────────-

const NUMERIC_RX = /\b\d[\d,.]*\s*(%|x|×|yr|years|M|B|K|bn|mn)?\b/gi
const ENTITY_RX = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g
const BAILOUT_PHRASES = [
  "as an ai", "i cannot", "i'm not able", "i am not able",
  "as a language model", "no information", "insufficient context",
]

function scoreConfidence(text: string, minWords: number): number {
  const lc = text.toLowerCase()
  for (const p of BAILOUT_PHRASES) if (lc.includes(p)) return 0.3
  const words = text.trim().split(/\s+/).filter(Boolean)
  const wc = words.length
  const lengthFactor = Math.min(1, wc / Math.max(40, minWords * 1.5))
  const numericHits = (text.match(NUMERIC_RX) ?? []).length
  const entityHits = (text.match(ENTITY_RX) ?? []).length
  const specificity = Math.min(1, (numericHits * 0.07) + (entityHits * 0.04))
  const raw = 0.6 * lengthFactor + 0.4 * specificity
  const score = wc >= minWords ? Math.max(0.5, raw) : raw
  return Math.round(score * 100) / 100
}

function stripBoilerplate(text: string): string {
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
