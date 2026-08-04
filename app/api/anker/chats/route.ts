/**
 * ANKER AI chat history.
 *   GET  /api/anker/chats           → list the user's saved chats (max 10, newest first)
 *   POST /api/anker/chats           → upsert a chat { id?, title, model, messages }
 *                                     then prune to the 10 most-recent (oldest deleted)
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_CHATS = 10

async function uid() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function GET() {
  const user = await uid()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const rows = await sql`
    SELECT id, title, model, updated_at FROM anker_chats
    WHERE user_id = ${user} ORDER BY updated_at DESC LIMIT ${MAX_CHATS}
  `
  return NextResponse.json({
    chats: (rows as any[]).map((c) => ({ id: c.id, title: c.title, model: c.model, updatedAt: c.updated_at })),
  })
}

export async function POST(req: NextRequest) {
  const user = await uid()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { id?: string; title?: string; model?: string; messages?: any[] } | null
  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 })
  }
  // Keep rows bounded: cap the number of turns and each message's text.
  const messages = body.messages.slice(-60).map((m: any) => ({
    role: m.role, content: String(m.content ?? "").slice(0, 40_000),
    images: Array.isArray(m.images) ? m.images.slice(0, 4) : undefined,
    video: typeof m.video === "string" ? m.video : undefined,
    artifacts: Array.isArray(m.artifacts) ? m.artifacts.slice(0, 8) : undefined,
    tools: Array.isArray(m.tools) ? m.tools.slice(0, 20) : undefined,
  }))
  const title = (body.title || messages.find((m) => m.role === "user")?.content || "New chat").slice(0, 120)
  const model = body.model ? String(body.model).slice(0, 80) : null

  let id = body.id
  if (id) {
    const upd = await sql`
      UPDATE anker_chats SET title=${title}, model=${model}, messages=${JSON.stringify(messages)}::jsonb, updated_at=NOW()
      WHERE id=${id} AND user_id=${user} RETURNING id
    `
    if (!upd.length) id = undefined // not found / not owner → fall through to insert
  }
  if (!id) {
    const [row] = await sql`
      INSERT INTO anker_chats (user_id, title, model, messages)
      VALUES (${user}, ${title}, ${model}, ${JSON.stringify(messages)}::jsonb)
      RETURNING id
    `
    id = (row as any).id
  }

  // Prune to the 10 most-recently-updated; the oldest beyond that are deleted.
  await sql`
    DELETE FROM anker_chats
    WHERE user_id = ${user}
      AND id NOT IN (
        SELECT id FROM anker_chats WHERE user_id = ${user} ORDER BY updated_at DESC LIMIT ${MAX_CHATS}
      )
  `
  return NextResponse.json({ id })
}
