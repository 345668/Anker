/**
 * Built-deck storage — one row per `decks` table entry.
 *
 * A deck is created from a template + a fund (or target). The user
 * duplicates the community file into their own Figma workspace, pastes
 * that URL back into Anker, then hits Generate → Send to Figma. The
 * plugin pulls the payload here and writes into the duplicated file.
 */
import { sql } from "@/lib/db"

export type DeckStatus = "draft" | "mapping" | "filled" | "exported" | "archived"

export interface Deck {
  id: string
  ownerId: string
  templateId: string
  fundId: string | null
  targetId: string | null
  workspaceFileKey: string | null
  workspaceFileUrl: string | null
  status: DeckStatus
  values: Record<string, any>
  aiGeneratedFields: Record<string, string>
  lastFilledAt: string | null
  createdAt: string
  updatedAt: string
}

export async function hasDecksTable(): Promise<boolean> {
  try {
    const r: any[] = await sql`
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'decks' LIMIT 1`
    return r.length > 0
  } catch { return false }
}

export async function createDeck(input: {
  ownerId: string
  templateId: string
  fundId?: string | null
  targetId?: string | null
}): Promise<Deck | null> {
  if (!(await hasDecksTable())) return null
  const rows: any[] = await sql`
    INSERT INTO decks (owner_id, template_id, fund_id, target_id, status)
    VALUES (${input.ownerId}::uuid, ${input.templateId}::uuid,
            ${input.fundId ?? null}, ${input.targetId ?? null}, 'draft')
    RETURNING *`
  return rows.length ? mapRow(rows[0]) : null
}

export async function getDeck(id: string, ownerId: string): Promise<Deck | null> {
  if (!(await hasDecksTable())) return null
  const rows: any[] = await sql`
    SELECT * FROM decks
     WHERE id = ${id}::uuid AND owner_id = ${ownerId}::uuid
     LIMIT 1`
  return rows.length ? mapRow(rows[0]) : null
}

export async function listDecks(ownerId: string): Promise<Deck[]> {
  if (!(await hasDecksTable())) return []
  const rows: any[] = await sql`
    SELECT * FROM decks WHERE owner_id = ${ownerId}::uuid ORDER BY created_at DESC LIMIT 500`
  return rows.map(mapRow)
}

export async function updateDeck(
  id: string, ownerId: string,
  patch: Partial<Pick<Deck, "status" | "workspaceFileKey" | "workspaceFileUrl" | "values" | "aiGeneratedFields" | "lastFilledAt">>,
): Promise<void> {
  await sql`
    UPDATE decks SET
      status               = COALESCE(${patch.status ?? null}, status),
      workspace_file_key   = COALESCE(${patch.workspaceFileKey ?? null}, workspace_file_key),
      workspace_file_url   = COALESCE(${patch.workspaceFileUrl ?? null}, workspace_file_url),
      values               = COALESCE(${patch.values ? JSON.stringify(patch.values) : null}::jsonb, values),
      ai_generated_fields  = COALESCE(${patch.aiGeneratedFields ? JSON.stringify(patch.aiGeneratedFields) : null}::jsonb, ai_generated_fields),
      last_filled_at       = COALESCE(${patch.lastFilledAt ?? null}, last_filled_at),
      updated_at           = NOW()
     WHERE id = ${id}::uuid AND owner_id = ${ownerId}::uuid`
}

function mapRow(r: any): Deck {
  return {
    id: r.id, ownerId: r.owner_id, templateId: r.template_id,
    fundId: r.fund_id, targetId: r.target_id,
    workspaceFileKey: r.workspace_file_key, workspaceFileUrl: r.workspace_file_url,
    status: r.status,
    values: r.values ?? {},
    aiGeneratedFields: r.ai_generated_fields ?? {},
    lastFilledAt: r.last_filled_at ? new Date(r.last_filled_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }
}
