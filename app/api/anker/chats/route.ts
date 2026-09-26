import { requireAiPrincipal } from "@/lib/assistant/principal"
import { workspaceError } from "@/lib/auth/workspace-context"
/**
 * ANKER AI chat history.
 *   GET  /api/anker/chats           → list the user's saved chats (max 100, newest first)
 *   POST /api/anker/chats           → upsert a chat { id?, title, model, messages }
 *                                     scoped to the active workspace; history is not automatically deleted
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { appendEvents, readEvents, type AppendEvent } from "@/lib/assistant/events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_CHATS = 100


export async function GET() {
  let principal;try{principal=await requireAiPrincipal()}catch(e){return workspaceError(e)}
  const user=principal.userId
  const rows = await sql`
    SELECT id, title, model, updated_at FROM anker_chats
    WHERE user_id = ${user} AND scope_key = ${principal.scopeKey} ORDER BY updated_at DESC LIMIT ${MAX_CHATS}
  `
  return NextResponse.json({
    scopeKey:principal.scopeKey,
    chats: (rows as any[]).map((c) => ({ id: c.id, title: c.title, model: c.model, updatedAt: c.updated_at })),
  })
}

export async function POST(req: NextRequest) {
  let principal;try{principal=await requireAiPrincipal()}catch(e){return workspaceError(e)}
  const user=principal.userId

  const body = await req.json().catch(() => null) as
    | { id?: string; title?: string; model?: string; messages?: any[]; revision?:number; scopeKey?:string } | null
  if(body?.scopeKey!==principal.scopeKey) return NextResponse.json({error:"Workspace changed. Reload the assistant."},{status:409})
  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 })
  }
  if(body.messages.length>60 || body.messages.some(m=>!["user","assistant"].includes(m.role)||typeof m.content!=="string"||m.content.length>40000))return NextResponse.json({error:"Conversation limit reached or invalid messages. Start a new conversation."},{status:400})
  // Keep rows bounded without silently deleting conversation turns.
  const messages = body.messages.map((m: any) => ({
    role: m.role, content: String(m.content ?? "").slice(0, 40_000),
    images: Array.isArray(m.images) ? m.images.slice(0, 4) : undefined,
    video: typeof m.video === "string" ? m.video : undefined,
    artifacts: Array.isArray(m.artifacts) ? m.artifacts.slice(0, 8) : undefined,
    tools: Array.isArray(m.tools) ? m.tools.slice(0, 20) : undefined,
  }))
  const title = (body.title || messages.find((m) => m.role === "user")?.content || "New chat").slice(0, 120)
  const model = body.model ? String(body.model).slice(0, 80) : null

  let id = body.id
  let revision=0
  if (id) {
    const upd = await sql`
      UPDATE anker_chats SET title=${title}, model=${model}, messages=${JSON.stringify(messages)}::jsonb, updated_at=NOW(),revision=revision+1
      WHERE id=${id} AND user_id=${user} AND scope_key=${principal.scopeKey} AND revision=${body.revision ?? -1} RETURNING id,revision
    `
    if (!upd.length) return NextResponse.json({error:"Conversation changed or is unavailable. Reload it before saving."},{status:409})
    revision=Number(upd[0].revision)
  }
  if (!id) {
    const [row] = await sql`
      INSERT INTO anker_chats (user_id, scope_key, title, model, messages)
      VALUES (${user}, ${principal.scopeKey}, ${title}, ${model}, ${JSON.stringify(messages)}::jsonb)
      RETURNING id
    `
    id = (row as any).id
  }

  // Append the turns this save added to the log (doc 28 phase 3). The blob above
  // stays the projection; this is the record. Best-effort: a conversation that
  // saved must not fail because its log did, so a logging error degrades to a
  // warning and the caller proceeds — the same contract lib/matching's outcome
  // capture uses.
  try {
    const logged = await readEvents(id!, principal.scopeKey)
    const already = logged.filter((e) => e.kind === "message.user" || e.kind === "message.assistant").length
    const fresh: AppendEvent[] = messages.slice(already).map((m) => ({
      kind: m.role === "user" ? "message.user" as const : "message.assistant" as const,
      payload: { content: m.content, ...(m.artifacts?.length ? { artifacts: m.artifacts } : {}) },
    }))
    if (!logged.length) fresh.unshift({ kind: "chat.created", payload: { model, title } })
    if (fresh.length) await appendEvents(id!, user, fresh)
  } catch (e) {
    console.warn("[anker chat log]", (e as Error)?.message)
  }

  return NextResponse.json({ id,revision })
}
