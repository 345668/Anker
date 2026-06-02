/**
 * GET    /api/outreach/campaigns/[id]   — campaign details + counts
 * PATCH  /api/outreach/campaigns/[id]   — { name?, description?, status?, defaultChannel?, defaultTemplateId?, archived? }
 * DELETE /api/outreach/campaigns/[id]   — delete (cascades members)
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const STATUSES = ["draft", "active", "paused", "done"] as const
const CHANNELS = ["email", "linkedin", "multi"] as const

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const [c] = await sql`
      SELECT * FROM outreach_campaigns WHERE id = ${id} AND user_id = ${user.id}
    ` as any[]
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const counts = await sql`
      SELECT status, COUNT(*)::int AS n
      FROM outreach_campaign_members
      WHERE campaign_id = ${id} AND user_id = ${user.id}
      GROUP BY status
    `
    const byStatus: Record<string, number> = {}
    for (const r of counts as any[]) byStatus[String(r.status)] = Number(r.n) || 0

    return NextResponse.json({
      campaign: {
        id: c.id,
        name: c.name,
        description: c.description ?? null,
        status: c.status,
        defaultChannel: c.default_channel,
        defaultTemplateId: c.default_template_id ?? null,
        archived: !!c.archived,
        ccEmails:  Array.isArray(c.cc_emails)  ? c.cc_emails  : [],
        bccEmails: Array.isArray(c.bcc_emails) ? c.bcc_emails : [],
        byStatus,
        createdAt: c.created_at ? new Date(c.created_at).toISOString() : null,
        updatedAt: c.updated_at ? new Date(c.updated_at).toISOString() : null,
      },
    })
  } catch (e: any) {
    console.error("[campaigns GET id] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const name = body?.name !== undefined ? String(body.name).trim() : undefined
    const description = body?.description !== undefined ? String(body.description) : undefined
    const status = body?.status !== undefined ? String(body.status) : undefined
    const channel = body?.defaultChannel !== undefined ? String(body.defaultChannel) : undefined
    const tpl = body?.defaultTemplateId !== undefined ? (body.defaultTemplateId === null ? null : String(body.defaultTemplateId)) : undefined
    const archived = body?.archived !== undefined ? Boolean(body.archived) : undefined

    // Normalise cc/bcc lists if provided.  Accepts string[] or comma/newline-separated string.
    const normaliseEmailList = (raw: any): string[] | undefined => {
      if (raw === undefined) return undefined
      if (raw === null) return []
      let arr: string[]
      if (Array.isArray(raw)) {
        arr = raw.map((s) => String(s))
      } else {
        arr = String(raw).split(/[\n,;]+/)
      }
      const seen = new Set<string>()
      const out: string[] = []
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      for (const e of arr) {
        const a = e.trim()
        if (!a) continue
        if (!EMAIL_RE.test(a)) continue
        const lc = a.toLowerCase()
        if (seen.has(lc)) continue
        seen.add(lc)
        out.push(a)
      }
      return out
    }
    const ccEmails  = normaliseEmailList(body?.ccEmails)
    const bccEmails = normaliseEmailList(body?.bccEmails)

    if (name !== undefined && !name) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 })
    }
    if (status !== undefined && !STATUSES.includes(status as any)) {
      return NextResponse.json({ error: `invalid status: ${status}` }, { status: 400 })
    }
    if (channel !== undefined && !CHANNELS.includes(channel as any)) {
      return NextResponse.json({ error: `invalid channel: ${channel}` }, { status: 400 })
    }

    const [updated] = await sql`
      UPDATE outreach_campaigns SET
        name                 = COALESCE(${name ?? null}, name),
        description          = COALESCE(${description ?? null}, description),
        status               = COALESCE(${status ?? null}, status),
        default_channel      = COALESCE(${channel ?? null}, default_channel),
        default_template_id  = CASE WHEN ${tpl !== undefined}::boolean THEN ${tpl ?? null} ELSE default_template_id END,
        archived             = COALESCE(${archived ?? null}::boolean, archived),
        cc_emails            = CASE WHEN ${ccEmails  !== undefined}::boolean THEN ${JSON.stringify(ccEmails  ?? [])}::jsonb ELSE cc_emails  END,
        bcc_emails           = CASE WHEN ${bccEmails !== undefined}::boolean THEN ${JSON.stringify(bccEmails ?? [])}::jsonb ELSE bcc_emails END,
        updated_at           = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING *
    ` as any[]
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({
      campaign: {
        id: updated.id,
        name: updated.name,
        description: updated.description ?? null,
        status: updated.status,
        defaultChannel: updated.default_channel,
        defaultTemplateId: updated.default_template_id ?? null,
        archived: !!updated.archived,
        ccEmails:  Array.isArray(updated.cc_emails)  ? updated.cc_emails  : [],
        bccEmails: Array.isArray(updated.bcc_emails) ? updated.bcc_emails : [],
      },
    })
  } catch (e: any) {
    console.error("[campaigns PATCH] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const deleted = await sql`
      DELETE FROM outreach_campaigns
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id
    `
    if (!deleted.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[campaigns DELETE] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to delete" }, { status: 500 })
  }
}
