/**
 * PATCH  /api/outreach/templates/[id]
 *   Body: { name?, category?, channel?, subject?, body?, isDefault?, archived? }
 *   Built-in templates (id starts with "builtin:") cannot be edited.
 * DELETE /api/outreach/templates/[id]
 *   Removes a user template.  Built-ins are immutable.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { templateVariables } from "@/lib/outreach/builtin-templates"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    if (id.startsWith("builtin:")) {
      return NextResponse.json({ error: "Built-in templates are read-only. Fork it first." }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const name = body?.name !== undefined ? String(body.name).trim() : undefined
    const category = body?.category !== undefined ? String(body.category) : undefined
    const channel = body?.channel !== undefined ? String(body.channel) : undefined
    const subject = body?.subject !== undefined ? (body.subject === null ? null : String(body.subject)) : undefined
    const bodyTpl = body?.body !== undefined ? String(body.body) : undefined
    const isDefault = body?.isDefault !== undefined ? Boolean(body.isDefault) : undefined
    const archived = body?.archived !== undefined ? Boolean(body.archived) : undefined

    if (channel !== undefined && !["email", "linkedin", "multi"].includes(channel)) {
      return NextResponse.json({ error: `invalid channel: ${channel}` }, { status: 400 })
    }

    // Detect variables off whatever the final subject+body will be.
    let variablesJson: string | null = null
    if (subject !== undefined || bodyTpl !== undefined) {
      const [existing] = await sql`SELECT subject_template, body_template FROM outreach_templates WHERE id = ${id} AND user_id = ${user.id}` as any[]
      if (existing) {
        const finalSubject = subject !== undefined ? subject : existing.subject_template
        const finalBody = bodyTpl !== undefined ? bodyTpl : existing.body_template
        variablesJson = JSON.stringify(templateVariables({ subject: finalSubject ?? undefined, body: finalBody ?? "" }))
      }
    }

    const [updated] = await sql`
      UPDATE outreach_templates SET
        name              = COALESCE(${name ?? null}, name),
        category          = COALESCE(${category ?? null}, category),
        channel           = COALESCE(${channel ?? null}, channel),
        subject_template  = CASE WHEN ${subject !== undefined}::boolean THEN ${subject ?? null} ELSE subject_template END,
        body_template     = COALESCE(${bodyTpl ?? null}, body_template),
        variables         = COALESCE(${variablesJson}::jsonb, variables),
        is_default        = COALESCE(${isDefault ?? null}::boolean, is_default),
        archived          = COALESCE(${archived ?? null}::boolean, archived),
        updated_at        = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING *
    ` as any[]
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({
      template: {
        id: updated.id,
        name: updated.name,
        category: updated.category,
        channel: updated.channel,
        subject: updated.subject_template ?? undefined,
        body: updated.body_template,
        variables: Array.isArray(updated.variables) ? updated.variables : [],
        builtin: false,
        isDefault: !!updated.is_default,
        archived: !!updated.archived,
      },
    })
  } catch (e: any) {
    console.error("[templates PATCH] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    if (id.startsWith("builtin:")) {
      return NextResponse.json({ error: "Built-in templates are read-only." }, { status: 400 })
    }

    const deleted = await sql`
      DELETE FROM outreach_templates WHERE id = ${id} AND user_id = ${user.id} RETURNING id
    `
    if (!deleted.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[templates DELETE] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}
