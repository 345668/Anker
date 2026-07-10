/**
 * PATCH  /api/admin/news/themes/[id] — rename / edit keywords / enable-disable
 * DELETE /api/admin/news/themes/[id]
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) || null : null
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 300) : null
  const hasKeywords = Array.isArray(body.keywords)
  const keywords: string[] = hasKeywords
    ? body.keywords.map(String).map((k: string) => k.trim()).filter(Boolean).slice(0, 20)
    : []
  const hasEnabled = typeof body.enabled === "boolean"

  const rows = await sql`
    update news_themes set
      name        = coalesce(${name}, name),
      description = coalesce(${description}, description),
      keywords    = case when ${hasKeywords} then ${keywords} else keywords end,
      enabled     = case when ${hasEnabled} then ${hasEnabled ? body.enabled === true : null} else enabled end,
      updated_at  = now()
    where id = ${id}::uuid
    returning id, name, slug, description, keywords, enabled, position
  ` as Array<Record<string, unknown>>
  if (!rows.length) return NextResponse.json({ error: "Theme not found" }, { status: 404 })
  return NextResponse.json({ ok: true, theme: rows[0] })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const rows = await sql`delete from news_themes where id = ${id}::uuid returning id` as Array<{ id: string }>
  if (!rows.length) return NextResponse.json({ error: "Theme not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
