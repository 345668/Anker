/**
 * Legal & Compliance — fields storage + 3-state workflow.
 *
 * State machine per field:
 *   empty    →  no value persisted
 *   filled   →  value present in funds.legal_fields but no approval
 *   approved →  value present AND key present in funds.legal_field_approvals
 *
 * Per-fund completion stats drive the green/orange/grey progress bar at
 * the top of the field grid. Per-document completion drives the canvas
 * (phase 1) progress bars + the document-review viewer (phase 4).
 *
 * Schema-drift safe — if the migration hasn't run, getLegalFields returns
 * an empty payload with `needsMigration: true`.
 */

import { sql } from "@/lib/db"
import { getFundById, type FundFull } from "@/lib/portfolio/funds"
import {
  ALL_LEGAL_FIELDS,
  LEGAL_FIELD_BY_KEY,
  LEGAL_FIELD_SECTIONS,
  TOTAL_LEGAL_FIELDS,
  fieldsForDocument,
  type LegalFieldDef,
} from "@/lib/portfolio/legal-fields-taxonomy"
import { DOCUMENT_CATALOGUE } from "@/lib/portfolio/legal-catalogue"

// ── public types ────────────────────────────────────────────────────────

export type LegalFieldValues = Record<string, any>

export interface LegalFieldApproval {
  approved_at: string
  approved_by: string | null
}
export type LegalFieldApprovals = Record<string, LegalFieldApproval>

export type FieldStatus = "empty" | "filled" | "approved"

export interface LegalFieldsCompletion {
  total: number
  filled: number    // either filled or approved
  approved: number  // approved only
  empty: number
  /** 0-1; share of fields that are approved. */
  approvalPct: number
  /** Per-section approved-count and total. */
  bySection: Record<string, { total: number; filled: number; approved: number }>
  /** Per-document completion ratio (0-1) = approved fields ÷ fields-on-this-doc.
   *  Drives the canvas progress bars and the document-review viewer. */
  byDocument: Record<string, { total: number; approved: number; ratio: number }>
}

export interface LegalFieldsPayload {
  fund: FundFull
  values: LegalFieldValues
  approvals: LegalFieldApprovals
  completion: LegalFieldsCompletion
  /** Total field count from the taxonomy; surfaced so the client doesn't
   *  need to import the taxonomy just to render "N/94". */
  totalFields: number
  needsMigration: boolean
}

// ── schema-drift probe ─────────────────────────────────────────────────-

let _columnsCheck: Promise<boolean> | null = null
export function hasLegalFieldColumns(): Promise<boolean> {
  if (_columnsCheck) return _columnsCheck
  _columnsCheck = (async () => {
    try {
      const r: any[] = await sql`
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'funds'
           AND column_name = 'legal_fields'
         LIMIT 1
      `
      return r.length > 0
    } catch {
      return false
    }
  })()
  return _columnsCheck
}

// ── reads ───────────────────────────────────────────────────────────────

export async function getLegalFields(fundId: string): Promise<LegalFieldsPayload | null> {
  const fund = await getFundById(fundId)
  if (!fund) return null
  if (!(await hasLegalFieldColumns())) {
    return {
      fund,
      values: {},
      approvals: {},
      completion: emptyCompletion(),
      totalFields: TOTAL_LEGAL_FIELDS,
      needsMigration: true,
    }
  }
  let values: LegalFieldValues = {}
  let approvals: LegalFieldApprovals = {}
  try {
    const rows = await sql`SELECT legal_fields, legal_field_approvals FROM funds WHERE id = ${fund.id}::uuid LIMIT 1`
    values = parseJsonObj(rows[0]?.legal_fields)
    approvals = parseJsonObj(rows[0]?.legal_field_approvals)
  } catch (e) {
    console.error("[legal-fields getLegalFields] read failed", e)
  }
  return {
    fund,
    values,
    approvals,
    completion: computeCompletion(values, approvals),
    totalFields: TOTAL_LEGAL_FIELDS,
    needsMigration: false,
  }
}

// ── writes ──────────────────────────────────────────────────────────────

export async function patchLegalFields(
  fundId: string,
  patch: LegalFieldValues,
): Promise<LegalFieldsPayload> {
  if (!(await hasLegalFieldColumns())) {
    throw new Error("legal_fields column missing. Run scripts/oneshot/run-funds-legal-fields-columns.mjs first.")
  }
  const before = await getLegalFields(fundId)
  if (!before) throw new Error("Fund not found")
  const merged: LegalFieldValues = { ...before.values }
  const approvals = { ...before.approvals }
  for (const [k, v] of Object.entries(patch)) {
    const def = LEGAL_FIELD_BY_KEY[k]
    if (!def) continue            // unknown key — ignore
    if (def.inputType === "computed") continue
    if (v === "" || v == null || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0)) {
      delete merged[k]
      // Clearing a value also clears its approval — the next reviewer
      // needs to re-approve once a new value is set.
      delete approvals[k]
    } else {
      // Editing a previously-approved value reverts it to 'filled' so the
      // reviewer is forced to re-approve. Same pattern as DocuSign /
      // Notion DBs / most form-approval products.
      if (JSON.stringify(merged[k]) !== JSON.stringify(v)) {
        delete approvals[k]
      }
      merged[k] = v
    }
  }
  await sql`
    UPDATE funds
       SET legal_fields = ${JSON.stringify(merged)}::jsonb,
           legal_field_approvals = ${JSON.stringify(approvals)}::jsonb,
           updated_at = NOW()
     WHERE id = ${fundId}::uuid
  `
  return {
    fund: before.fund,
    values: merged,
    approvals,
    completion: computeCompletion(merged, approvals),
    totalFields: TOTAL_LEGAL_FIELDS,
    needsMigration: false,
  }
}

export async function setApprovalState(
  fundId: string,
  fieldKey: string,
  approve: boolean,
  approvedBy: string | null,
): Promise<LegalFieldsPayload> {
  if (!(await hasLegalFieldColumns())) {
    throw new Error("legal_fields column missing. Run the migration first.")
  }
  const before = await getLegalFields(fundId)
  if (!before) throw new Error("Fund not found")
  const def = LEGAL_FIELD_BY_KEY[fieldKey]
  if (!def) throw new Error(`Unknown field: ${fieldKey}`)
  const approvals = { ...before.approvals }
  if (approve) {
    // Only approve fields that actually have a value (computed always
    // counts as filled for approval purposes).
    if (def.inputType !== "computed" && !isPresent(before.values[fieldKey])) {
      throw new Error("Field is empty — cannot approve.")
    }
    approvals[fieldKey] = {
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    }
  } else {
    delete approvals[fieldKey]
  }
  await sql`
    UPDATE funds
       SET legal_field_approvals = ${JSON.stringify(approvals)}::jsonb,
           updated_at = NOW()
     WHERE id = ${fundId}::uuid
  `
  return {
    ...before,
    approvals,
    completion: computeCompletion(before.values, approvals),
  }
}

// ── completion math ────────────────────────────────────────────────────-

export function computeCompletion(
  values: LegalFieldValues,
  approvals: LegalFieldApprovals,
): LegalFieldsCompletion {
  let filled = 0
  let approved = 0
  const bySection: Record<string, { total: number; filled: number; approved: number }> = {}
  const byDocument: Record<string, { total: number; approved: number; ratio: number }> = {}

  for (const section of LEGAL_FIELD_SECTIONS) {
    bySection[section.key] = { total: section.fields.length, filled: 0, approved: 0 }
  }
  for (const doc of DOCUMENT_CATALOGUE) {
    const docFields = fieldsForDocument(doc.key)
    byDocument[doc.key] = { total: docFields.length, approved: 0, ratio: 0 }
  }

  for (const f of ALL_LEGAL_FIELDS) {
    const has = isPresent(values[f.key]) || f.inputType === "computed"
    const isApproved = !!approvals[f.key]
    if (has) {
      filled++
      bySection[sectionKeyFor(f)].filled++
    }
    if (isApproved) {
      approved++
      bySection[sectionKeyFor(f)].approved++
      for (const docKey of f.documents) {
        if (byDocument[docKey]) byDocument[docKey].approved++
      }
    }
  }
  for (const k of Object.keys(byDocument)) {
    const r = byDocument[k]
    r.ratio = r.total > 0 ? r.approved / r.total : 0
  }
  return {
    total: TOTAL_LEGAL_FIELDS,
    filled,
    approved,
    empty: Math.max(0, TOTAL_LEGAL_FIELDS - filled),
    approvalPct: TOTAL_LEGAL_FIELDS > 0 ? approved / TOTAL_LEGAL_FIELDS : 0,
    bySection,
    byDocument,
  }
}

export function statusFor(
  field: LegalFieldDef,
  values: LegalFieldValues,
  approvals: LegalFieldApprovals,
): FieldStatus {
  if (approvals[field.key]) return "approved"
  const has = isPresent(values[field.key]) || field.inputType === "computed"
  return has ? "filled" : "empty"
}

// ── helpers ─────────────────────────────────────────────────────────────

function emptyCompletion(): LegalFieldsCompletion {
  const bySection: Record<string, { total: number; filled: number; approved: number }> = {}
  for (const s of LEGAL_FIELD_SECTIONS) bySection[s.key] = { total: s.fields.length, filled: 0, approved: 0 }
  const byDocument: Record<string, { total: number; approved: number; ratio: number }> = {}
  for (const d of DOCUMENT_CATALOGUE) {
    byDocument[d.key] = { total: fieldsForDocument(d.key).length, approved: 0, ratio: 0 }
  }
  return {
    total: TOTAL_LEGAL_FIELDS, filled: 0, approved: 0, empty: TOTAL_LEGAL_FIELDS,
    approvalPct: 0, bySection, byDocument,
  }
}

function sectionKeyFor(f: LegalFieldDef): string {
  for (const s of LEGAL_FIELD_SECTIONS) if (s.fields.some((x) => x.key === f.key)) return s.key
  return "uncategorised"
}

function isPresent(v: any): boolean {
  if (v == null) return false
  if (typeof v === "string") return v.trim().length > 0
  if (typeof v === "number") return Number.isFinite(v)
  if (typeof v === "boolean") return true
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "object") return Object.keys(v).some((k) => isPresent(v[k]))
  return Boolean(v)
}

function parseJsonObj<T = any>(v: any): T extends Record<string, any> ? T : Record<string, any> {
  if (!v) return {} as any
  if (typeof v === "object" && !Array.isArray(v)) return v as any
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return p && typeof p === "object" && !Array.isArray(p) ? p : {} as any } catch { return {} as any }
  }
  return {} as any
}
