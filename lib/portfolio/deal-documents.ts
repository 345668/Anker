/**
 * Deal data room (deal_documents table).
 *
 * The deal's document store. Files live in the private Vercel Blob store; we
 * keep only the blob_path here and stream bytes back through an authenticated
 * API route (never a public blob URL). `category` groups documents so the
 * stage gates can check for required types, and `stage_at_upload` records the
 * deal's stage when each file landed.
 *
 * deal_documents.deal_id is TEXT (FK → deal_opportunities.id) — never cast to
 * ::uuid.
 */

import { sql } from "@/lib/db"

// Categories/labels/types live in the DB-free constants module so client
// components can import them without pulling `pg` into the browser bundle.
// Re-exported here so existing server importers keep working unchanged.
export {
  DEAL_DOC_CATEGORIES, DEAL_DOC_CATEGORY_LABELS, isDealDocCategory,
  type DealDocCategory, type DealDocument,
} from "./deal-document-constants"
import { isDealDocCategory, type DealDocCategory, type DealDocument } from "./deal-document-constants"

let probe: Promise<boolean> | null = null
export function hasDocumentTable(): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      try {
        const rows = await sql`
          SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'deal_documents'`
        return rows.length > 0
      } catch { return false }
    })()
  }
  return probe
}

function normalize(r: any): DealDocument {
  return {
    id: r.id,
    deal_id: r.deal_id,
    fund_id: r.fund_id ?? null,
    category: (isDealDocCategory(r.category) ? r.category : "other"),
    name: r.name,
    blob_path: r.blob_path,
    content_type: r.content_type ?? null,
    size: r.size == null ? null : Number(r.size),
    stage_at_upload: r.stage_at_upload ?? null,
    uploaded_by: r.uploaded_by ?? null,
    created_at: String(r.created_at),
    url: `/api/portfolio/deal-documents/${r.id}`,
  }
}

export async function listDocuments(dealId: string): Promise<DealDocument[]> {
  if (!(await hasDocumentTable())) return []
  const rows = await sql`
    SELECT * FROM deal_documents
     WHERE deal_id = ${dealId}
     ORDER BY created_at DESC`
  return rows.map(normalize)
}

export async function getDocument(id: string): Promise<DealDocument | null> {
  const rows = await sql`SELECT * FROM deal_documents WHERE id = ${id} LIMIT 1`
  return rows[0] ? normalize(rows[0]) : null
}

export interface CreateDocumentInput {
  dealId: string
  fundId?: string | null
  category: DealDocCategory
  name: string
  blobPath: string
  contentType?: string | null
  size?: number | null
  stageAtUpload?: string | null
  uploadedBy?: string | null
}

export async function createDocumentRecord(input: CreateDocumentInput): Promise<DealDocument> {
  const rows = await sql`
    INSERT INTO deal_documents (
      deal_id, fund_id, category, name, blob_path, content_type, size,
      stage_at_upload, uploaded_by
    ) VALUES (
      ${input.dealId}, ${input.fundId ?? null}, ${input.category}, ${input.name},
      ${input.blobPath}, ${input.contentType ?? null}, ${input.size ?? null},
      ${input.stageAtUpload ?? null}, ${input.uploadedBy ?? null}
    ) RETURNING *`
  return normalize(rows[0])
}

export async function deleteDocument(id: string): Promise<DealDocument | null> {
  const rows = await sql`DELETE FROM deal_documents WHERE id = ${id} RETURNING *`
  return rows[0] ? normalize(rows[0]) : null
}
