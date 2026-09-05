/**
 * POST /api/calls/[id]/followup — turn a call's draft follow-up into an
 * approval-gated outreach draft (kind='follow_up') on the linked CRM entry, so
 * it lands in the founder's outbox to review + send via the existing engine.
 *   body: { editedDraft? }  — override the AI draft before drafting.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { randomUUID } from "node:crypto"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const [call] = (await sql`SELECT crm_entry_id, draft_followup FROM investor_calls WHERE id = ${id} AND user_id = ${user.id} LIMIT 1`) as any[]
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!call.crm_entry_id) return NextResponse.json({ error: "Link this call to a CRM investor first" }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const draft = (typeof body?.editedDraft === "string" && body.editedDraft.trim() ? body.editedDraft : call.draft_followup || "").trim()
  if (!draft) return NextResponse.json({ error: "No draft follow-up to use" }, { status: 400 })

  const [entry] = (await sql`SELECT display_email FROM crm_entries WHERE id = ${call.crm_entry_id} AND user_id = ${user.id} LIMIT 1`) as any[]
  const toEmail = String(entry?.display_email ?? "").trim() || null

  // One follow_up per entry (unique crm_entry_id, kind) — upsert, keep as draft.
  const [msg] = (await sql`
    INSERT INTO outreach_messages (
      user_id, crm_entry_id, kind, step_number, channel, body, status, subject,
      email_to, tracking_id, created_at, updated_at
    ) VALUES (
      ${user.id}, ${call.crm_entry_id}, 'follow_up', 2, 'email', ${draft}, 'draft',
      'Following up on our call', ${toEmail}, ${randomUUID()}, NOW(), NOW()
    )
    ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
      body = EXCLUDED.body, status = 'draft', subject = EXCLUDED.subject, updated_at = NOW()
    RETURNING id
  `) as any[]

  return NextResponse.json({ ok: true, outreachMessageId: msg?.id, status: "draft" })
}
