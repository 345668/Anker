/**
 * /api/admin/news/themes — dynamic thematic focus for the newsroom.
 *
 *   GET               list themes (enabled first)
 *   POST { name, description?, keywords?: string[] }   create
 *
 * Themes steer article drafting (their keywords retrieve matching
 * news_source_items as grounding) and act as editorial lenses the admin
 * can add/retire without code changes. Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const rows = await sql`
    select id, name, slug, description, keywords, enabled, position, created_at
    from news_themes
    order by enabled desc, position asc nulls last, name asc
  `
  return NextResponse.json({ themes: rows })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : ""
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })
  const keywords: string[] = Array.isArray(body.keywords)
    ? body.keywords.map(String).map((k: string) => k.trim()).filter(Boolean).slice(0, 20)
    : []
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 300) || null : null

  const rows = await sql`
    insert into news_themes (name, slug, description, keywords)
    values (${name}, ${slugify(name)}, ${description}, ${keywords})
    on conflict (slug) do update set
      description = coalesce(excluded.description, news_themes.description),
      keywords = excluded.keywords,
      enabled = true,
      updated_at = now()
    returning id, name, slug, description, keywords, enabled, position, created_at
  ` as Array<Record<string, unknown>>
  return NextResponse.json({ ok: true, theme: rows[0] }, { status: 201 })
}
