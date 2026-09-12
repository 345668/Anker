import { sql } from "@/lib/db"
import { requireWorkspace, WorkspaceError } from "@/lib/auth/workspace-context"
import { resolveWorkspaceFund } from "@/lib/auth/fund-access"
import type { StudioDeck, StudioContext } from "./studio-model"

export async function studioScope(write = false) {
  const scope = await requireWorkspace(write)
  if (!["founder", "vc"].includes(scope.persona)) throw new WorkspaceError("Deck Studio is available in company and fund workspaces.")
  return scope
}
export async function deckContext(scope: Awaited<ReturnType<typeof studioScope>>, roundId: string | null): Promise<StudioContext> {
  let fundId: string | null = null, roundName: string | null = null
  if (scope.persona === "vc") {
    const fund = await resolveWorkspaceFund(scope.userId)
    if (!fund) throw new WorkspaceError("This workspace cannot access fund context.")
    fundId = fund.id
    if (roundId) throw new WorkspaceError("Fund decks cannot use a founder round.", 400)
  } else if (roundId) {
    const [round] = await sql`SELECT name FROM fundraising_rounds WHERE id = ${roundId} AND user_id = ${scope.userId} AND org_id = ${scope.orgId}`
    if (!round) throw new WorkspaceError("That round is not available in this workspace.")
    roundName = round.name
  }
  return { orgId: scope.orgId, name: scope.name, persona: scope.persona, roundId, roundName, fundId }
}
export function mapStudioDeck(r: any): StudioDeck {
  return { id: r.id, title: r.title, templateKey: r.template_key, context: r.context, slides: r.slides, revision: r.revision, updatedAt: new Date(r.updated_at).toISOString() }
}
export async function getStudioDeck(scope: Awaited<ReturnType<typeof studioScope>>, id: string) {
  const [row] = await sql`SELECT * FROM workspace_decks WHERE id = ${id} AND user_id = ${scope.userId} AND org_id = ${scope.orgId}`
  if (!row) throw new WorkspaceError("Deck not found in this workspace.", 404)
  // Recheck referenced context after membership/fund/round changes.
  const current = await deckContext(scope, row.context.roundId ?? null)
  if ((row.context.fundId ?? null) !== current.fundId) throw new WorkspaceError("The deck’s fund is no longer available in this workspace.")
  return mapStudioDeck(row)
}
