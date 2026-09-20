import { requireAiPrincipal } from "@/lib/assistant/principal"
import { workspaceError } from "@/lib/auth/workspace-context"
/**
 *   GET    /api/anker/chats/[id]  → load a saved chat's messages
 *   DELETE /api/anker/chats/[id]  → delete a saved chat
 * Both scoped to the signed-in owner.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"


export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let principal;try{principal=await requireAiPrincipal()}catch(e){return workspaceError(e)}
  const user=principal.userId
  const { id } = await ctx.params
  const rows = await sql`SELECT id, title, model, messages, revision FROM anker_chats WHERE id=${id} AND user_id=${user} AND scope_key=${principal.scopeKey} LIMIT 1`
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const c = rows[0] as any
  return NextResponse.json({ id: c.id, title: c.title, model: c.model, messages: c.messages ?? [], revision:c.revision,scopeKey:principal.scopeKey })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let principal;try{principal=await requireAiPrincipal()}catch(e){return workspaceError(e)}
  const user=principal.userId
  const { id } = await ctx.params
  await sql`DELETE FROM anker_chats WHERE id=${id} AND user_id=${user} AND scope_key=${principal.scopeKey}`
  return NextResponse.json({ ok: true })
}
