import { sql } from "@/lib/db"

export type RaiseRound = { id: string; name: string; boardId: string; currency: string; target: number; revision: number }
export const ROUND_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "SGD", "JPY", "AED", "INR"] as const
function normalize(r: any): RaiseRound {
  return { id: r.id, name: r.name, boardId: r.board_id, currency: r.currency, target: Number(r.target), revision: Number(r.revision) }
}
export async function listRaiseRounds(userId: string, orgId: string) {
  const rows = await sql`SELECT r.* FROM fundraising_rounds r
    JOIN memberships m ON m.org_id = r.org_id AND m.user_id = ${userId}
    WHERE r.org_id = ${orgId} AND m.persona = 'founder' AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = ${orgId} AND to_jsonb(o)->>'archived_at' IS NULL)
    ORDER BY r.created_at DESC, r.id`
  return rows.map(normalize)
}
export async function createRaiseRound(userId: string, orgId: string, input: { name: string; boardId: string; currency: string; target: number }) {
  const rows = await sql`INSERT INTO fundraising_rounds(user_id, org_id, board_id, name, currency, target)
    SELECT ${userId}, m.org_id, b.id, ${input.name}, ${input.currency}, ${input.target}
    FROM memberships m JOIN crm_boards b ON b.org_id = m.org_id
    WHERE m.user_id = ${userId} AND m.org_id = ${orgId} AND m.persona = 'founder' AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = ${orgId} AND to_jsonb(o)->>'archived_at' IS NULL)
      AND m.org_role IN ('workspace_owner','admin','member') AND b.id = ${input.boardId} AND b.archived = false
    ON CONFLICT DO NOTHING RETURNING *`
  return rows[0] ? normalize(rows[0]) : null
}
export async function updateRaiseTarget(userId: string, orgId: string, id: string, target: number, revision: number) {
  const rows = await sql`UPDATE fundraising_rounds r SET target = ${target}, revision = r.revision + 1, updated_at = now()
    WHERE r.id = ${id} AND r.org_id = ${orgId} AND r.revision = ${revision}
      AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = ${userId} AND m.org_id = r.org_id AND m.persona = 'founder' AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = ${orgId} AND to_jsonb(o)->>'archived_at' IS NULL) AND m.org_role IN ('workspace_owner','admin','member'))
    RETURNING r.*`
  return rows[0] ? normalize(rows[0]) : null
}
