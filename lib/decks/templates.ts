/**
 * Deck templates — catalog storage layer.
 *
 * The catalog is populated once from the seed script and then evolves as
 * the user classifies templates in the UI (unclassified -> fund_overview
 * / lp_update / pitch_deck / etc.). Node-mapping cache lives here too —
 * once a template is mapped, the mapping is deterministic for anyone
 * else using it.
 */
import { sql } from "@/lib/db"

export type DeckType =
  | "unclassified"
  | "fund_overview"
  | "lp_update"
  | "pitch_deck"
  | "investment_memo"
  | "portfolio_review"
  | "other"

export const DECK_TYPES: readonly DeckType[] = [
  "unclassified", "fund_overview", "lp_update", "pitch_deck",
  "investment_memo", "portfolio_review", "other",
] as const

export const DECK_TYPE_LABELS: Record<DeckType, string> = {
  unclassified:      "Not classified",
  fund_overview:     "Fund overview",
  lp_update:         "Quarterly LP update",
  pitch_deck:        "Founder pitch",
  investment_memo:   "Investment memo",
  portfolio_review:  "Portfolio review",
  other:             "Other",
}

export interface DeckTemplate {
  id: string
  fileKey: string
  source: "community" | "workspace" | "custom"
  name: string | null
  deckType: DeckType
  shortlisted: boolean
  favorite: boolean
  thumbnailUrl: string | null
  communityUrl: string
  nodeMapping: Record<string, any> | null
  mappingReady: boolean
  createdAt: string
  classifiedAt: string | null
  notes: string | null
}

let _tableCheck: Promise<boolean> | null = null
export function hasTemplatesTable(): Promise<boolean> {
  if (_tableCheck) return _tableCheck
  _tableCheck = (async () => {
    try {
      const r: any[] = await sql`
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'deck_templates' LIMIT 1`
      return r.length > 0
    } catch { return false }
  })()
  return _tableCheck
}

export async function listTemplates(opts: {
  deckType?: DeckType | "all"
  shortlistedOnly?: boolean
  favoritesOnly?: boolean
  q?: string
} = {}): Promise<DeckTemplate[]> {
  if (!(await hasTemplatesTable())) return []
  const rows: any[] = await sql`
    SELECT * FROM deck_templates
     WHERE (${opts.deckType ?? "all"} = 'all' OR deck_type = ${opts.deckType ?? "all"})
       AND (${opts.shortlistedOnly ?? false} = false OR shortlisted = true)
       AND (${opts.favoritesOnly   ?? false} = false OR favorite    = true)
       AND (${opts.q ?? ""} = '' OR
            COALESCE(name, '') ILIKE ${"%" + (opts.q ?? "") + "%"} OR
            file_key ILIKE ${"%" + (opts.q ?? "") + "%"})
     ORDER BY favorite DESC, shortlisted DESC,
              CASE WHEN deck_type = 'unclassified' THEN 1 ELSE 0 END,
              created_at DESC
     LIMIT 500`
  return rows.map(mapRow)
}

export async function countByDeckType(): Promise<Record<DeckType, number>> {
  const out = Object.fromEntries(DECK_TYPES.map((t) => [t, 0])) as Record<DeckType, number>
  if (!(await hasTemplatesTable())) return out
  const rows: any[] = await sql`
    SELECT deck_type, COUNT(*)::int AS n FROM deck_templates GROUP BY deck_type`
  for (const r of rows) out[r.deck_type as DeckType] = Number(r.n)
  return out
}

export async function updateTemplate(id: string, patch: Partial<Pick<
  DeckTemplate, "deckType" | "shortlisted" | "favorite" | "name" | "notes" | "thumbnailUrl"
>>, actor?: string): Promise<void> {
  await sql`
    UPDATE deck_templates
       SET deck_type     = COALESCE(${patch.deckType     ?? null}, deck_type),
           shortlisted   = COALESCE(${patch.shortlisted  ?? null}, shortlisted),
           favorite      = COALESCE(${patch.favorite     ?? null}, favorite),
           name          = COALESCE(${patch.name         ?? null}, name),
           notes         = COALESCE(${patch.notes        ?? null}, notes),
           thumbnail_url = COALESCE(${patch.thumbnailUrl ?? null}, thumbnail_url),
           classified_at = CASE WHEN ${patch.deckType ?? null} IS NOT NULL AND ${patch.deckType ?? null} <> 'unclassified' THEN NOW() ELSE classified_at END,
           classified_by = CASE WHEN ${patch.deckType ?? null} IS NOT NULL AND ${patch.deckType ?? null} <> 'unclassified' THEN ${actor ?? null} ELSE classified_by END
     WHERE id = ${id}::uuid`
}

function mapRow(r: any): DeckTemplate {
  return {
    id: r.id, fileKey: r.file_key, source: r.source,
    name: r.name, deckType: r.deck_type,
    shortlisted: !!r.shortlisted, favorite: !!r.favorite,
    thumbnailUrl: r.thumbnail_url, communityUrl: r.community_url,
    nodeMapping: r.node_mapping, mappingReady: !!r.mapping_ready,
    createdAt: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
    classifiedAt: r.classified_at ? (typeof r.classified_at === "string" ? r.classified_at : new Date(r.classified_at).toISOString()) : null,
    notes: r.notes,
  }
}
