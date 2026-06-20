/**
 * GET  /api/admin/newsroom?status=&blog_type=&q=&limit=&offset=
 *   List articles (drafts + published + archived).
 *
 * POST /api/admin/newsroom
 *   Create a new article.
 *   Body: { headline, subheadline?, content?, author?, blogType?, tags?,
 *           status?, imageUrl? }
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  listAll,
  createArticle,
  ARTICLE_STATUSES,
  ARTICLE_BLOG_TYPES,
  type ArticleBlogType,
  type ArticleStatus,
} from "@/lib/newsroom/queries"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const url = new URL(req.url)
    const result = await listAll({
      status: parseStatus(url.searchParams.get("status")),
      blogType: parseBlogType(url.searchParams.get("blog_type")),
      query: url.searchParams.get("q") ?? undefined,
      limit: clampInt(url.searchParams.get("limit"), 1, 500, 100),
      offset: clampInt(url.searchParams.get("offset"), 0, 100_000, 0),
    })
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[admin/newsroom GET]", e)
    return NextResponse.json({ error: e?.message ?? "Failed to list" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  try {
    const body = await req.json()
    if (!body?.headline?.trim()) {
      return NextResponse.json({ error: "headline required" }, { status: 400 })
    }
    const article = await createArticle({
      headline: String(body.headline),
      subheadline: body.subheadline ?? null,
      content: body.content ?? null,
      author: body.author ?? null,
      blogType: parseBlogType(body.blogType) === "all" ? "Insights" : (parseBlogType(body.blogType) as ArticleBlogType),
      tags: Array.isArray(body.tags) ? body.tags.filter((s: any) => typeof s === "string") : [],
      status: parseStatus(body.status) === "all" ? "draft" : (parseStatus(body.status) as ArticleStatus),
      imageUrl: body.imageUrl ?? null,
      slug: typeof body.slug === "string" ? body.slug : null,
      scheduledFor: typeof body.scheduledFor === "string" ? body.scheduledFor : null,
      sourcePdfUrl: typeof body.sourcePdfUrl === "string" ? body.sourcePdfUrl : null,
      createdBy: admin.email ?? admin.id,
    })
    return NextResponse.json({ article }, { status: 201 })
  } catch (e: any) {
    console.error("[admin/newsroom POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}

function parseStatus(s: string | null | undefined): ArticleStatus | "all" {
  const v = (s ?? "").toLowerCase()
  if (v && (ARTICLE_STATUSES as readonly string[]).includes(v)) return v as ArticleStatus
  return "all"
}
function parseBlogType(s: string | null | undefined): ArticleBlogType | "all" {
  const v = (s ?? "").trim()
  if (v && (ARTICLE_BLOG_TYPES as readonly string[]).includes(v)) return v as ArticleBlogType
  return "all"
}
function clampInt(s: string | null, min: number, max: number, def: number): number {
  if (!s) return def
  const n = parseInt(s, 10)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}
