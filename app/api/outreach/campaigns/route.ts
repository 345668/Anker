/**
 * GET  /api/outreach/campaigns          — list user's campaigns + counts
 * POST /api/outreach/campaigns          — create { name, description?, defaultChannel?, defaultTemplateId? }
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const CHANNELS = ["email", "linkedin", "multi"] as const

function serialize(c: any, counts: { members: number; drafted: number; sent: number } = { members: 0, drafted: 0, sent: 0 }) {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    status: c.status,
    defaultChannel: c.default_channel,
    defaultTemplateId: c.default_template_id ?? null,
    archived: !!c.archived,
    ccEmails:  Array.isArray(c.cc_emails)  ? c.cc_emails  : [],
    bccEmails: Array.isArray(c.bcc_emails) ? c.bcc_emails : [],
    folkLoggingEnabled: !!c.folk_logging_enabled,
    counts,
    createdAt: c.created_at ? new Date(c.created_at).toISOString() : null,
    updatedAt: c.updated_at ? new Date(c.updated_at).toISOString() : null,
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const rows = await sql`
      SELECT * FROM outreach_campaigns
      WHERE user_id = ${user.id} AND archived = false
      ORDER BY updated_at DESC
    `
    const counts = await sql`
      SELECT campaign_id, status, COUNT(*)::int AS n
      FROM outreach_campaign_members
      WHERE user_id = ${user.id}
      GROUP BY campaign_id, status
    `
    const countMap: Record<string, { members: number; drafted: number; sent: number }> = {}
    for (const r of counts as any[]) {
      const id = String(r.campaign_id)
      const entry = countMap[id] ?? { members: 0, drafted: 0, sent: 0 }
      entry.members += Number(r.n) || 0
      if (r.status === "drafted") entry.drafted += Number(r.n) || 0
      if (r.status === "sent") entry.sent += Number(r.n) || 0
      countMap[id] = entry
    }
    return NextResponse.json({
      campaigns: (rows as any[]).map((c) => serialize(c, countMap[c.id] ?? { members: 0, drafted: 0, sent: 0 })),
    })
  } catch (e: any) {
    console.error("[campaigns GET] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to load" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const name = String(body?.name ?? "").trim() || "Untitled campaign"
    const description = body?.description ? String(body.description) : null
    const ch = body?.defaultChannel
    const channel = CHANNELS.includes(ch) ? ch : "multi"
    const tpl = body?.defaultTemplateId ? String(body.defaultTemplateId) : null

    const [row] = await sql`
      INSERT INTO outreach_campaigns (user_id, name, description, default_channel, default_template_id, created_at, updated_at)
      VALUES (${user.id}, ${name}, ${description}, ${channel}, ${tpl}, NOW(), NOW())
      RETURNING *
    `
    return NextResponse.json({ campaign: serialize(row) }, { status: 201 })
  } catch (e: any) {
    console.error("[campaigns POST] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to create" }, { status: 500 })
  }
}
