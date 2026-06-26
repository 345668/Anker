/**
 * Legal & Compliance — per-fund document overrides.
 *
 * When an operator hits "Edit" on the rendered template viewer and
 * saves their changes, the edited Markdown body is persisted here.
 * The renderer + export pipeline (Word/PDF/Markdown) check this map
 * FIRST and use the override body if present, falling back to the
 * field-substituted template body otherwise.
 *
 * Shape:
 *   funds.legal_document_overrides → {
 *     "fm_certificate_of_formation": {
 *       body: "<edited Markdown>",
 *       updated_at: "2026-06-26T17:30:00Z",
 *       updated_by: "philippe@anker.de"
 *     },
 *     ...
 *   }
 *
 * Discard reverts the doc_key key, dropping it from the JSONB.
 * Schema-drift safe: every call probes information_schema once per
 * process and short-circuits gracefully when the migration hasn't run.
 */

import { sql } from "@/lib/db"

export interface DocumentOverride {
  body: string
  updatedAt: string
  updatedBy: string | null
}

export type DocumentOverridesMap = Record<string, DocumentOverride>

// ── schema probe ───────────────────────────────────────────────────────-

let _columnCheck: Promise<boolean> | null = null
export function hasOverridesColumn(): Promise<boolean> {
  if (_columnCheck) return _columnCheck
  _columnCheck = (async () => {
    try {
      const r: any[] = await sql`
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'funds'
           AND column_name = 'legal_document_overrides'
         LIMIT 1`
      return r.length > 0
    } catch { return false }
  })()
  return _columnCheck
}

// ── reads ──────────────────────────────────────────────────────────────-

export async function getDocumentOverrides(fundId: string): Promise<DocumentOverridesMap> {
  if (!(await hasOverridesColumn())) return {}
  try {
    const rows = await sql`
      SELECT legal_document_overrides
        FROM funds
       WHERE id = ${fundId}::uuid
       LIMIT 1`
    const raw = rows[0]?.legal_document_overrides
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return normalize(raw as Record<string, any>)
    }
    if (typeof raw === "string") {
      try { return normalize(JSON.parse(raw)) } catch { return {} }
    }
  } catch (e) {
    console.error("[legal-document-overrides getDocumentOverrides]", e)
  }
  return {}
}

export async function getDocumentOverride(
  fundId: string,
  docKey: string,
): Promise<DocumentOverride | null> {
  const all = await getDocumentOverrides(fundId)
  return all[docKey] ?? null
}

// ── writes ─────────────────────────────────────────────────────────────-

export class OverrideMissingColumnError extends Error {
  constructor() {
    super("funds.legal_document_overrides column missing — run scripts/oneshot/run-funds-legal-document-overrides-column.mjs first.")
    this.name = "OverrideMissingColumnError"
  }
}

export async function setDocumentOverride(args: {
  fundId: string
  docKey: string
  body: string
  updatedBy: string | null
}): Promise<DocumentOverride> {
  if (!(await hasOverridesColumn())) throw new OverrideMissingColumnError()
  const entry: DocumentOverride = {
    body: args.body,
    updatedAt: new Date().toISOString(),
    updatedBy: args.updatedBy ?? null,
  }
  const patch = JSON.stringify({ [args.docKey]: entry })
  await sql`
    UPDATE funds
       SET legal_document_overrides = COALESCE(legal_document_overrides, '{}'::jsonb) || ${patch}::jsonb,
           updated_at = NOW()
     WHERE id = ${args.fundId}::uuid`
  console.log(`[legal-document-overrides] saved fund=${args.fundId} doc=${args.docKey} bytes=${args.body.length}`)
  return entry
}

export async function clearDocumentOverride(args: {
  fundId: string
  docKey: string
}): Promise<void> {
  if (!(await hasOverridesColumn())) throw new OverrideMissingColumnError()
  // jsonb - text operator drops the key.
  await sql`
    UPDATE funds
       SET legal_document_overrides = COALESCE(legal_document_overrides, '{}'::jsonb) - ${args.docKey}::text,
           updated_at = NOW()
     WHERE id = ${args.fundId}::uuid`
  console.log(`[legal-document-overrides] cleared fund=${args.fundId} doc=${args.docKey}`)
}

// ── helpers ─────────────────────────────────────────────────────────────

function normalize(raw: Record<string, any>): DocumentOverridesMap {
  const out: DocumentOverridesMap = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v !== "object") continue
    if (typeof (v as any).body !== "string") continue
    out[k] = {
      body: String((v as any).body),
      updatedAt: typeof (v as any).updated_at === "string"
        ? (v as any).updated_at
        : typeof (v as any).updatedAt === "string"
          ? (v as any).updatedAt
          : new Date().toISOString(),
      updatedBy: (v as any).updated_by ?? (v as any).updatedBy ?? null,
    }
  }
  return out
}
