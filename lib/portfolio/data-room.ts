/**
 * Data room queries + LP-membership resolver.
 *
 * Two distinct callers:
 *
 *   - Admin / GP via /dashboard/portfolio/fund/documents — full CRUD,
 *     can see every doc on a fund, can scope per-LP.
 *
 *   - LP via /lp — only sees docs they're entitled to.  Entitlement
 *     resolves through their email: any Supabase user whose email matches
 *     a row in contacts that's linked to fund_lps gets read access to
 *     that fund's docs (fund-wide rows + per-LP rows where lp_id matches).
 *
 * No LP-side write path — the LP portal is read-only.  When LPs need to
 * submit something (a subscription doc back, capital-call confirmation,
 * etc) that's a follow-up commit with a dedicated submission table.
 */

import { sql } from "@/lib/db"
import { fundCategoryToSection } from "@/lib/dataroom/taxonomy"

export const DOCUMENT_CATEGORIES = [
  "subscription", "quarterly_letter", "capital_call",
  "distribution", "k1", "financials", "policy", "other",
] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export interface DataRoomDocument {
  id: string
  fund_id: string
  fund_lp_id: string | null
  category: DocumentCategory
  /** Taxonomy section key (see lib/dataroom/taxonomy.ts). Derived from
   *  category for legacy rows; set explicitly on new uploads. */
  section: string | null
  title: string
  description: string | null
  file_url: string
  file_name: string | null
  content_type: string | null
  byte_size: number | null
  source_quarterly_report_id: string | null
  source_capital_call_id: string | null
  source_distribution_id: string | null
  archived_at: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

/** Joined shape for the admin listing — adds LP name when scoped to one. */
export interface DataRoomDocumentWithScope extends DataRoomDocument {
  lp_name: string | null
}

// ── admin reads ─────────────────────────────────────────────────────────

export interface ListDocumentsOpts {
  fundId: string
  /** Filter by category or 'all'. */
  category?: DocumentCategory | "all"
  /** When set, returns only docs scoped to that LP. */
  lpId?: string | null
  /** When set true, includes archived rows. */
  includeArchived?: boolean
  limit?: number
  offset?: number
}

export async function listDocuments(opts: ListDocumentsOpts): Promise<{
  rows: DataRoomDocumentWithScope[]
  total: number
}> {
  const { fundId } = opts
  const limit = Math.max(1, Math.min(500, opts.limit ?? 200))
  const offset = Math.max(0, opts.offset ?? 0)

  const where: string[] = ["d.fund_id = $1"]
  const params: any[] = [fundId]
  if (opts.category && opts.category !== "all") {
    params.push(opts.category); where.push(`d.category = $${params.length}`)
  }
  if (opts.lpId !== undefined) {
    if (opts.lpId === null) {
      where.push(`d.fund_lp_id IS NULL`)
    } else {
      params.push(opts.lpId); where.push(`d.fund_lp_id = $${params.length}`)
    }
  }
  if (!opts.includeArchived) where.push(`d.archived_at IS NULL`)
  const whereSql = `WHERE ${where.join(" AND ")}`

  const rows: any[] = await sql.unsafe(
    `SELECT d.*, fl.lp_name AS lp_name
       FROM data_room_documents d
       LEFT JOIN fund_lps fl ON fl.id = d.fund_lp_id
       ${whereSql}
       ORDER BY d.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
    params,
  )
  const totalRows: any[] = await sql.unsafe(
    `SELECT COUNT(*) AS n FROM data_room_documents d ${whereSql}`,
    params,
  )
  return {
    rows: rows.map(normalize),
    total: Number(totalRows[0]?.n ?? 0),
  }
}

export async function getDocumentById(id: string): Promise<DataRoomDocumentWithScope | null> {
  const rows = await sql`
    SELECT d.*, fl.lp_name AS lp_name
      FROM data_room_documents d
      LEFT JOIN fund_lps fl ON fl.id = d.fund_lp_id
      WHERE d.id = ${id}
      LIMIT 1
  `
  return rows[0] ? normalize(rows[0]) : null
}

// ── admin writes ────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  fundId: string
  fundLpId?: string | null
  category?: DocumentCategory
  /** Taxonomy section — derived from category when omitted. */
  section?: string | null
  title: string
  description?: string | null
  fileUrl: string
  fileName?: string | null
  contentType?: string | null
  byteSize?: number | null
  sourceQuarterlyReportId?: string | null
  sourceCapitalCallId?: string | null
  sourceDistributionId?: string | null
  uploadedBy?: string | null
}

export async function createDocument(input: CreateDocumentInput): Promise<DataRoomDocument> {
  if (!input.fundId) throw new Error("fundId required")
  if (!input.title?.trim()) throw new Error("title required")
  if (!input.fileUrl) throw new Error("fileUrl required")

  const rows = await sql`
    INSERT INTO data_room_documents (
      fund_id, fund_lp_id, category, section, title, description,
      file_url, file_name, content_type, byte_size,
      source_quarterly_report_id, source_capital_call_id, source_distribution_id,
      uploaded_by, created_at, updated_at
    ) VALUES (
      ${input.fundId}, ${input.fundLpId ?? null}, ${input.category ?? "other"},
      ${input.section ?? fundCategoryToSection(input.category ?? "other")},
      ${input.title.trim()}, ${input.description ?? null},
      ${input.fileUrl}, ${input.fileName ?? null}, ${input.contentType ?? null},
      ${input.byteSize ?? null},
      ${input.sourceQuarterlyReportId ?? null},
      ${input.sourceCapitalCallId ?? null},
      ${input.sourceDistributionId ?? null},
      ${input.uploadedBy ?? null}, NOW(), NOW()
    )
    RETURNING *
  `
  return normalize(rows[0])
}

export interface UpdateDocumentInput {
  fundLpId?: string | null
  category?: DocumentCategory
  title?: string
  description?: string | null
  /** Set to true to archive; false to un-archive. */
  archived?: boolean
}

export async function updateDocument(id: string, patch: UpdateDocumentInput): Promise<DataRoomDocument | null> {
  // archived flips the timestamp explicitly rather than threading a value.
  const archivedExpr = patch.archived === undefined
    ? null
    : patch.archived
      ? "NOW()"
      : "NULL"

  const rows = await sql`
    UPDATE data_room_documents SET
      fund_lp_id  = COALESCE(${patch.fundLpId ?? null}, fund_lp_id),
      category    = COALESCE(${patch.category ?? null}, category),
      title       = COALESCE(${patch.title ?? null}, title),
      description = COALESCE(${patch.description ?? null}, description),
      archived_at = CASE
                      WHEN ${patch.archived === true}  THEN NOW()
                      WHEN ${patch.archived === false} THEN NULL
                      ELSE archived_at
                    END,
      updated_at  = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] ? normalize(rows[0]) : null
}

export async function deleteDocument(id: string): Promise<boolean> {
  // Hard delete — caller's job to also delete the underlying Vercel Blob
  // if storage clean-up matters. We don't, because Blob TTL handles it.
  const rows = await sql`DELETE FROM data_room_documents WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

// ── LP-side resolver + reads ────────────────────────────────────────────

/**
 * Resolve which fund_lps rows a given user has access to, via email match
 * against contacts.email → fund_lps.lp_contact_id.
 *
 * The query is intentionally case-insensitive (LOWER on both sides) since
 * Supabase normalises auth emails to lowercase but contacts.email is free-text.
 *
 * Returns the joined { fund_lp_id, fund_id, lp_name } so the LP portal
 * can show "you're an LP on Fund II" and scope subsequent queries.
 */
export interface LpMembership {
  fund_lp_id: string
  fund_id: string
  fund_slug: string
  fund_name: string
  lp_name: string
  commitment_amount: number | null
  called_amount: number
  distributed_amount: number
}

export async function getLpMembershipsForEmail(email: string): Promise<LpMembership[]> {
  const e = (email ?? "").trim()
  if (!e) return []
  const rows = await sql`
    SELECT
      fl.id        AS fund_lp_id,
      fl.fund_id   AS fund_id,
      f.slug       AS fund_slug,
      f.name       AS fund_name,
      fl.lp_name   AS lp_name,
      fl.commitment_amount,
      fl.called_amount,
      fl.distributed_amount
    FROM fund_lps fl
    JOIN contacts c ON c.id = fl.lp_contact_id
    JOIN funds f    ON f.id = fl.fund_id
    WHERE LOWER(c.email) = LOWER(${e})
      AND fl.status != 'transferred'
    ORDER BY f.vintage_year DESC NULLS LAST, f.name ASC
  `
  return rows.map((r: any) => ({
    fund_lp_id: r.fund_lp_id,
    fund_id: r.fund_id,
    fund_slug: r.fund_slug,
    fund_name: r.fund_name,
    lp_name: r.lp_name,
    commitment_amount: r.commitment_amount != null ? Number(r.commitment_amount) : null,
    called_amount: Number(r.called_amount ?? 0),
    distributed_amount: Number(r.distributed_amount ?? 0),
  }))
}

// ── Document view tracking ──────────────────────────────────────────────

/** Best-effort log of a document open. Never throws — tracking must not break
 *  the download. */
export async function logDocumentView(input: {
  documentId: string
  fundId?: string | null
  fundLpId?: string | null
  viewerEmail?: string | null
  isLp?: boolean
}): Promise<void> {
  try {
    await sql`
      INSERT INTO data_room_document_views (document_id, fund_id, fund_lp_id, viewer_email, is_lp)
      VALUES (${input.documentId}, ${input.fundId ?? null}, ${input.fundLpId ?? null}, ${input.viewerEmail ?? null}, ${!!input.isLp})
    `
  } catch { /* swallow — best-effort telemetry */ }
}

export interface DocumentViewStat {
  document_id: string
  title: string
  category: string
  views: number
  unique_viewers: number
  last_viewed_at: string | null
}

/** Per-document view roll-up for a fund's data room (GP-facing). */
export async function getDocumentViewStats(fundId: string): Promise<DocumentViewStat[]> {
  const rows = await sql`
    SELECT d.id AS document_id, d.title, d.category,
           COUNT(v.id)::int                        AS views,
           COUNT(DISTINCT v.viewer_email)::int     AS unique_viewers,
           MAX(v.viewed_at)                        AS last_viewed_at
    FROM data_room_documents d
    LEFT JOIN data_room_document_views v ON v.document_id = d.id
    WHERE d.fund_id = ${fundId}
    GROUP BY d.id, d.title, d.category
    HAVING COUNT(v.id) > 0
    ORDER BY MAX(v.viewed_at) DESC NULLS LAST
    LIMIT 100
  `
  return rows.map((r: any) => ({
    document_id: r.document_id,
    title: r.title,
    category: r.category,
    views: Number(r.views ?? 0),
    unique_viewers: Number(r.unique_viewers ?? 0),
    last_viewed_at: r.last_viewed_at ? String(r.last_viewed_at) : null,
  }))
}

export interface DocumentViewerRow {
  viewer_email: string | null
  is_lp: boolean
  views: number
  last_viewed_at: string | null
}

export async function getDocumentViewers(documentId: string): Promise<DocumentViewerRow[]> {
  const rows = await sql`
    SELECT viewer_email, bool_or(is_lp) AS is_lp, COUNT(*)::int AS views, MAX(viewed_at) AS last_viewed_at
    FROM data_room_document_views
    WHERE document_id = ${documentId}
    GROUP BY viewer_email
    ORDER BY MAX(viewed_at) DESC
    LIMIT 200
  `
  return rows.map((r: any) => ({
    viewer_email: r.viewer_email ?? null,
    is_lp: !!r.is_lp,
    views: Number(r.views ?? 0),
    last_viewed_at: r.last_viewed_at ? String(r.last_viewed_at) : null,
  }))
}

export interface RecentDocumentView {
  viewer_email: string | null
  is_lp: boolean
  title: string
  viewed_at: string
}

/** Recent "who viewed what" feed for a fund's data room (GP-facing). */
export async function getRecentDocumentViews(fundId: string, limit = 30): Promise<RecentDocumentView[]> {
  const rows = await sql`
    SELECT v.viewer_email, v.is_lp, d.title, v.viewed_at
    FROM data_room_document_views v
    JOIN data_room_documents d ON d.id = v.document_id
    WHERE v.fund_id = ${fundId}
    ORDER BY v.viewed_at DESC
    LIMIT ${limit}
  `
  return rows.map((r: any) => ({
    viewer_email: r.viewer_email ?? null,
    is_lp: !!r.is_lp,
    title: r.title,
    viewed_at: String(r.viewed_at),
  }))
}

/**
 * LP-scoped capital activity: the distribution and capital-call notices
 * addressed to this LP's fund_lp rows. Read-only; drives /lp/distributions.
 */
export interface LpDistributionRow {
  line_id: string
  fund_name: string
  distribution_number: number
  title: string | null
  date: string | null
  amount: number
  status: string
  paid_at: string | null
  confirmed_at: string | null
}

export async function getLpDistributions(fundLpIds: string[]): Promise<LpDistributionRow[]> {
  if (!fundLpIds.length) return []
  const rows = await sql`
    SELECT
      dli.id                    AS line_id,
      f.name                    AS fund_name,
      d.distribution_number     AS distribution_number,
      d.title                   AS title,
      d.payment_date            AS date,
      dli.amount                AS amount,
      dli.status                AS status,
      dli.paid_at               AS paid_at,
      dli.lp_confirmed_at       AS confirmed_at
    FROM distribution_line_items dli
    JOIN distributions d ON d.id = dli.distribution_id
    JOIN funds f         ON f.id = d.fund_id
    WHERE dli.fund_lp_id = ANY(${fundLpIds})
      AND d.status != 'draft'
    ORDER BY d.payment_date DESC NULLS LAST, d.distribution_number DESC
  `
  return rows.map((r: any) => ({
    line_id: r.line_id,
    fund_name: r.fund_name,
    distribution_number: Number(r.distribution_number ?? 0),
    title: r.title ?? null,
    date: r.date ? String(r.date) : null,
    amount: Number(r.amount ?? 0),
    status: r.status ?? "pending",
    paid_at: r.paid_at ? String(r.paid_at) : null,
    confirmed_at: r.confirmed_at ? String(r.confirmed_at) : null,
  }))
}

export interface LpCallRow {
  line_id: string
  fund_name: string
  call_number: number
  title: string | null
  due_date: string | null
  amount: number
  status: string
  acknowledged_at: string | null
}

export async function getLpCapitalCalls(fundLpIds: string[]): Promise<LpCallRow[]> {
  if (!fundLpIds.length) return []
  const rows = await sql`
    SELECT
      cli.id                AS line_id,
      f.name                AS fund_name,
      cc.call_number        AS call_number,
      cc.title              AS title,
      cc.due_date           AS due_date,
      cli.amount            AS amount,
      cli.status            AS status,
      cli.lp_acknowledged_at AS acknowledged_at
    FROM capital_call_line_items cli
    JOIN capital_calls cc ON cc.id = cli.call_id
    JOIN funds f          ON f.id = cc.fund_id
    WHERE cli.fund_lp_id = ANY(${fundLpIds})
      AND cc.status != 'draft'
    ORDER BY cc.due_date DESC NULLS LAST, cc.call_number DESC
  `
  return rows.map((r: any) => ({
    line_id: r.line_id,
    fund_name: r.fund_name,
    call_number: Number(r.call_number ?? 0),
    title: r.title ?? null,
    due_date: r.due_date ? String(r.due_date) : null,
    amount: Number(r.amount ?? 0),
    status: r.status ?? "pending",
    acknowledged_at: r.acknowledged_at ? String(r.acknowledged_at) : null,
  }))
}

/**
 * List documents the LP is entitled to see across all the funds they
 * belong to.  Includes fund-wide docs (fund_lp_id IS NULL) AND any per-LP
 * docs whose fund_lp_id is one of theirs.
 */
export async function listDocumentsForLp(
  memberships: LpMembership[],
  opts: { category?: DocumentCategory | "all"; limit?: number } = {},
): Promise<DataRoomDocumentWithScope[]> {
  if (memberships.length === 0) return []
  const fundIds = memberships.map((m) => m.fund_id)
  const fundLpIds = memberships.map((m) => m.fund_lp_id)
  const limit = Math.max(1, Math.min(500, opts.limit ?? 200))

  const where: string[] = [
    `d.fund_id = ANY($1::text[])`,
    `(d.fund_lp_id IS NULL OR d.fund_lp_id = ANY($2::text[]))`,
    `d.archived_at IS NULL`,
  ]
  const params: any[] = [fundIds, fundLpIds]
  if (opts.category && opts.category !== "all") {
    params.push(opts.category); where.push(`d.category = $${params.length}`)
  }
  const whereSql = `WHERE ${where.join(" AND ")}`

  const rows: any[] = await sql.unsafe(
    `SELECT d.*, fl.lp_name AS lp_name
       FROM data_room_documents d
       LEFT JOIN fund_lps fl ON fl.id = d.fund_lp_id
       ${whereSql}
       ORDER BY d.created_at DESC
       LIMIT ${limit}`,
    params,
  )
  return rows.map(normalize)
}

/**
 * Entitlement-checked fetch of a single document for an LP.
 * Returns null if the doc doesn't exist OR the LP isn't entitled.
 */
export async function getDocumentForLp(
  documentId: string,
  memberships: LpMembership[],
): Promise<DataRoomDocumentWithScope | null> {
  if (memberships.length === 0) return null
  const doc = await getDocumentById(documentId)
  if (!doc) return null
  if (doc.archived_at) return null
  const fundOk = memberships.some((m) => m.fund_id === doc.fund_id)
  if (!fundOk) return null
  // Per-LP docs require lp match; fund-wide docs (null fund_lp_id) pass.
  if (doc.fund_lp_id) {
    const lpOk = memberships.some((m) => m.fund_lp_id === doc.fund_lp_id)
    if (!lpOk) return null
  }
  return doc
}

// ── helpers ─────────────────────────────────────────────────────────────

function normalize(r: any): DataRoomDocumentWithScope {
  return {
    id: r.id,
    fund_id: r.fund_id,
    fund_lp_id: r.fund_lp_id ?? null,
    category: (r.category ?? "other") as DocumentCategory,
    section: r.section ?? null,
    title: r.title,
    description: r.description ?? null,
    file_url: r.file_url,
    file_name: r.file_name ?? null,
    content_type: r.content_type ?? null,
    byte_size: r.byte_size != null ? Number(r.byte_size) : null,
    source_quarterly_report_id: r.source_quarterly_report_id ?? null,
    source_capital_call_id: r.source_capital_call_id ?? null,
    source_distribution_id: r.source_distribution_id ?? null,
    archived_at: toIso(r.archived_at),
    uploaded_by: r.uploaded_by ?? null,
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
    lp_name: r.lp_name ?? null,
  }
}
function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}
