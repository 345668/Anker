/**
 * Legal & Compliance — storage layer.
 *
 * Reads + writes for the legal_entities + legal_documents tables created
 * by scripts/oneshot/run-legal-entities-tables.mjs. Auto-seeds a fund's
 * 3 entities + 13 documents on first read so the canvas always has
 * something to render.
 *
 * Schema-drift safe: the probe returns false if the migration hasn't
 * landed, in which case getLegalTree returns an empty tree (the canvas
 * shows a "run the migration" empty state).
 */

import { sql } from "@/lib/db"
import { getFundById, type FundFull } from "@/lib/portfolio/funds"
import {
  DOCUMENT_CATALOGUE,
  ENTITY_KINDS,
  ENTITY_NAME_SUFFIX,
  type EntityKind,
} from "@/lib/portfolio/legal-catalogue"

// ── types ───────────────────────────────────────────────────────────────

export const DOCUMENT_STATUSES = [
  "draft", "pending_review", "reviewed", "approved", "filed",
] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

export const ENTITY_STATUSES = ["draft", "filed", "dissolved"] as const
export type EntityStatus = (typeof ENTITY_STATUSES)[number]

export interface LegalEntityRow {
  id: string
  fund_id: string
  kind: EntityKind
  name: string
  slug: string
  status: EntityStatus
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface LegalDocumentRow {
  id: string
  fund_id: string
  entity_id: string
  doc_key: string
  title: string
  short_title: string
  status: DocumentStatus
  completion_pct: number
  body_md: string | null
  review_notes: string | null
  created_at: string
  updated_at: string
}

export interface LegalEntityWithDocs extends LegalEntityRow {
  documents: LegalDocumentRow[]
}

export interface LegalTree {
  fund: FundFull
  entities: LegalEntityWithDocs[]
  /** True when the schema isn't ready and we returned an empty tree. */
  needsMigration: boolean
  /** Aggregate stats for the header chrome. */
  stats: {
    totalDocs: number
    completedDocs: number      // status >= 'approved'
    pendingReviewDocs: number  // status === 'pending_review'
    overallCompletionPct: number  // mean of completion_pct across all docs
  }
}

// ── schema-drift probe ─────────────────────────────────────────────────-

let _tablesCheck: Promise<boolean> | null = null
export function hasLegalTables(): Promise<boolean> {
  if (_tablesCheck) return _tablesCheck
  _tablesCheck = (async () => {
    try {
      const r: any[] = await sql`
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = 'legal_entities'
         LIMIT 1
      `
      return r.length > 0
    } catch {
      return false
    }
  })()
  return _tablesCheck
}

// ── public API ──────────────────────────────────────────────────────────

export async function getLegalTree(fundId: string): Promise<LegalTree | null> {
  const fund = await getFundById(fundId)
  if (!fund) return null
  if (!(await hasLegalTables())) {
    return {
      fund,
      entities: [],
      needsMigration: true,
      stats: { totalDocs: 0, completedDocs: 0, pendingReviewDocs: 0, overallCompletionPct: 0 },
    }
  }

  // Auto-seed on first visit. Cheap — only runs once per fund.
  await ensureSeeded(fund)

  const entityRows: any[] = await sql`
    SELECT * FROM legal_entities WHERE fund_id = ${fund.id}::uuid
     ORDER BY CASE kind
       WHEN 'management_company' THEN 1
       WHEN 'general_partner'    THEN 2
       WHEN 'fund'               THEN 3
     END
  `
  const docRows: any[] = await sql`
    SELECT * FROM legal_documents WHERE fund_id = ${fund.id}::uuid
     ORDER BY entity_id, short_title
  `

  const entities: LegalEntityWithDocs[] = entityRows.map((e) => normalizeEntity(e)).map((e) => ({
    ...e,
    documents: docRows
      .filter((d) => d.entity_id === e.id)
      .map(normalizeDoc),
  }))

  // Aggregate stats for the header.
  let totalDocs = 0
  let completedDocs = 0
  let pendingReviewDocs = 0
  let sumCompletion = 0
  for (const e of entities) {
    for (const d of e.documents) {
      totalDocs++
      if (d.status === "approved" || d.status === "filed") completedDocs++
      if (d.status === "pending_review") pendingReviewDocs++
      sumCompletion += Number(d.completion_pct ?? 0)
    }
  }
  const overallCompletionPct = totalDocs > 0 ? sumCompletion / totalDocs : 0

  return {
    fund,
    entities,
    needsMigration: false,
    stats: { totalDocs, completedDocs, pendingReviewDocs, overallCompletionPct },
  }
}

// ── auto-seed ──────────────────────────────────────────────────────────-

/**
 * If this fund has zero legal_entities, seed the standard 3 entities + 13
 * documents from the catalogue. Idempotent — checks before inserting.
 */
async function ensureSeeded(fund: FundFull): Promise<void> {
  const existing: any[] = await sql`
    SELECT COUNT(*)::int AS n FROM legal_entities WHERE fund_id = ${fund.id}::uuid
  `
  if (Number(existing[0]?.n ?? 0) > 0) return

  // Insert 3 entities.
  const inserted: { kind: EntityKind; id: string }[] = []
  for (const kind of ENTITY_KINDS) {
    const suffix = ENTITY_NAME_SUFFIX[kind]
    const name = suffix ? `${fund.name} ${suffix}` : fund.name
    const slug = `${kind.replace(/_/g, "-")}-${fund.slug || "fund"}`
    const rows = await sql`
      INSERT INTO legal_entities (fund_id, kind, name, slug, status)
      VALUES (${fund.id}::uuid, ${kind}, ${name}, ${slug}, 'draft')
      RETURNING id, kind
    `
    inserted.push({ kind: rows[0].kind as EntityKind, id: rows[0].id })
  }
  // Map for the second insert.
  const idByKind: Record<EntityKind, string> = {} as any
  for (const r of inserted) idByKind[r.kind] = r.id

  // Insert 13 documents.
  for (const d of DOCUMENT_CATALOGUE) {
    const entityId = idByKind[d.entityKind]
    if (!entityId) continue
    try {
      await sql`
        INSERT INTO legal_documents (
          fund_id, entity_id, doc_key, title, short_title, status, completion_pct
        ) VALUES (
          ${fund.id}::uuid, ${entityId}::uuid, ${d.key}, ${d.title}, ${d.shortTitle},
          'draft', 0
        )
      `
    } catch (e) {
      // Duplicate doc_key on this fund — fine, skip.
      console.error(`[legal seed] skipped ${d.key}:`, e instanceof Error ? e.message : e)
    }
  }
}

// ── normalizers ─────────────────────────────────────────────────────────

function normalizeEntity(r: any): LegalEntityRow {
  return {
    id: r.id,
    fund_id: r.fund_id,
    kind: r.kind as EntityKind,
    name: r.name,
    slug: r.slug,
    status: (r.status ?? "draft") as EntityStatus,
    metadata: parseJsonObj(r.metadata),
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
  }
}
function normalizeDoc(r: any): LegalDocumentRow {
  return {
    id: r.id,
    fund_id: r.fund_id,
    entity_id: r.entity_id,
    doc_key: r.doc_key,
    title: r.title,
    short_title: r.short_title,
    status: (r.status ?? "draft") as DocumentStatus,
    completion_pct: Number(r.completion_pct ?? 0),
    body_md: r.body_md ?? null,
    review_notes: r.review_notes ?? null,
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
  }
}
function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}
function parseJsonObj(v: any): Record<string, any> {
  if (!v) return {}
  if (typeof v === "object" && !Array.isArray(v)) return v
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return p && typeof p === "object" && !Array.isArray(p) ? p : {} } catch { return {} }
  }
  return {}
}
