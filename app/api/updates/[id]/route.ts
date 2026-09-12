/**
 * GET    /api/updates/[id] — update + recipients (with engagement) + recommended list (while draft).
 * PATCH  /api/updates/[id] — edit title/body/asks.
 * DELETE /api/updates/[id]
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { updateContent } from "@/lib/updates/send-contract"
import { recommendRecipients } from "@/lib/updates/builder"

export const runtime = "nodejs"

async function auth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await auth()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const [update] = (await sql`SELECT * FROM investor_updates WHERE id = ${id} AND user_id = ${user.id} LIMIT 1`) as any[]
  if (!update) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const recipients = await sql`
    SELECT id, crm_entry_id, name, email, sent_at, opened_at, open_count, last_event, delivery_status, last_error
    FROM investor_update_recipients WHERE update_id = ${id} ORDER BY name
  `
  const recommended = !update.delivery_snapshot && update.status === "draft" ? await recommendRecipients(user.id) : []
  return NextResponse.json({ update, recipients, recommended })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await auth()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const parsed = updateContent.safeParse(b)
  if (!parsed.success || !Number.isInteger(b.revision)) return NextResponse.json({ error: "Enter a title, body and valid revision." }, { status: 400 })
  const rows = (await sql`
    UPDATE investor_updates SET
      title = COALESCE(${b?.title ?? null}, title),
      body  = COALESCE(${b?.body ?? null}, body),
      asks  = COALESCE(${b?.asks ?? null}, asks),
      revision = revision + 1, updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.id} AND status = 'draft' AND delivery_snapshot IS NULL AND revision = ${b.revision}
    RETURNING id
  `) as any[]
  if (!rows.length) return NextResponse.json({ error: "This update changed or delivery already started. Reload before editing." }, { status: 409 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await auth()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const rows = (await sql`DELETE FROM investor_updates WHERE id = ${id} AND user_id = ${user.id} AND status <> 'sending' RETURNING id`) as any[]
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await sql`DELETE FROM investor_update_recipients WHERE update_id = ${id}`.catch(() => {})
  return NextResponse.json({ ok: true })
}
