/**
 * DB-free data-room document constants & types. Kept separate from
 * ./deal-documents (which imports the Postgres driver) so client components can
 * import categories/labels without dragging `pg` into the browser bundle.
 */

export const DEAL_DOC_CATEGORIES = [
  "deck", "financial_model", "cap_table", "legal", "references", "kyc", "other",
] as const
export type DealDocCategory = (typeof DEAL_DOC_CATEGORIES)[number]

export const DEAL_DOC_CATEGORY_LABELS: Record<DealDocCategory, string> = {
  deck: "Pitch deck",
  financial_model: "Financial model",
  cap_table: "Cap table",
  legal: "Legal / term sheet",
  references: "References",
  kyc: "KYC / compliance",
  other: "Other",
}

export function isDealDocCategory(v: string): v is DealDocCategory {
  return (DEAL_DOC_CATEGORIES as readonly string[]).includes(v)
}

export interface DealDocument {
  id: string
  deal_id: string
  fund_id: string | null
  category: DealDocCategory
  name: string
  blob_path: string
  content_type: string | null
  size: number | null
  stage_at_upload: string | null
  uploaded_by: string | null
  created_at: string
  /** Client-facing download URL (streaming route), derived — not a column. */
  url: string
}
