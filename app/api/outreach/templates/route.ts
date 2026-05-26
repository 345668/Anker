/**
 * GET  /api/outreach/templates    — returns built-ins + the user's saved templates.
 * POST /api/outreach/templates    — create a user template
 *   Body: { name, category?, channel?, subject?, body, forkedFrom? }
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { BUILTIN_TEMPLATES, templateVariables, TEMPLATE_CATEGORIES } from "@/lib/outreach/builtin-templates"

export const runtime = "nodejs"

function serializeUser(r: any) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    channel: r.channel,
    subject: r.subject_template ?? undefined,
    body: r.body_template,
    variables: Array.isArray(r.variables) ? r.variables : [],
    builtin: false,
    forkedFrom: r.forked_from ?? null,
    isDefault: !!r.is_default,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    let userRows: any[] = []
    try {
      userRows = await sql`
        SELECT * FROM outreach_templates
        WHERE user_id = ${user.id} AND archived = false
        ORDER BY is_default DESC, updated_at DESC
      `
    } catch {
      // table may not be migrated yet — fall through to built-ins only
    }

    return NextResponse.json({
      builtins: BUILTIN_TEMPLATES,
      user: (userRows as any[]).map(serializeUser),
      categories: TEMPLATE_CATEGORIES,
    })
  } catch (e: any) {
    console.error("[templates GET] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const name = String(body?.name ?? "").trim()
    const bodyTpl = String(body?.body ?? "").trim()
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })
    if (!bodyTpl) return NextResponse.json({ error: "body required" }, { status: 400 })

    const category = String(body?.category ?? "custom").trim() || "custom"
    const channel = ["email", "linkedin", "multi"].includes(body?.channel) ? body.channel : "email"
    const subject = body?.subject !== undefined ? String(body.subject) : null
    const forkedFrom = body?.forkedFrom ? String(body.forkedFrom) : null
    const variables = templateVariables({ subject: subject ?? undefined, body: bodyTpl })
    const variablesJson = JSON.stringify(variables)

    const [row] = await sql`
      INSERT INTO outreach_templates (
        user_id, name, category, channel, subject_template, body_template, variables, forked_from, created_at, updated_at
      ) VALUES (
        ${user.id}, ${name}, ${category}, ${channel}, ${subject}, ${bodyTpl}, ${variablesJson}::jsonb, ${forkedFrom}, NOW(), NOW()
      )
      RETURNING *
    `
    return NextResponse.json({ template: serializeUser(row) }, { status: 201 })
  } catch (e: any) {
    console.error("[templates POST] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to create" }, { status: 500 })
  }
}
