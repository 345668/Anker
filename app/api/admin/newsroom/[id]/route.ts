/**
 * GET    /api/admin/newsroom/[id]
 * PATCH  /api/admin/newsroom/[id]   — partial update
 * DELETE /api/admin/newsroom/[id]   — hard delete
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  getById, updateArticle, deleteArticle,
  ARTICLE_STATUSES, ARTICLE_BLOG_TYPES, ARTICLE_SENTIMENTS,
  type ArticleStatus, type ArticleBlogType, type ArticleSentiment,
} from "@/lib/newsroom/queries"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const article = await getById(id)
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ article })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const patch: any = {}
    if (typeof body.headline === "string") patch.headline = body.headline
    if ("subheadline" in body) patch.subheadline = body.subheadline ?? null
    if ("content" in body) patch.content = body.content ?? null
    if (typeof body.author === "string") patch.author = body.author
    if (typeof body.blogType === "string"
        && (ARTICLE_BLOG_TYPES as readonly string[]).includes(body.blogType)) {
      patch.blogType = body.blogType as ArticleBlogType
    }
    if (Array.isArray(body.tags)) patch.tags = body.tags.filter((s: any) => typeof s === "string")
    if (typeof body.status === "string"
        && (ARTICLE_STATUSES as readonly string[]).includes(body.status)) {
      patch.status = body.status as ArticleStatus
    }
    if ("imageUrl" in body) patch.imageUrl = body.imageUrl ?? null
    // New 2026-06-20 fields. Slug accepts empty-string to mean "regenerate
    // from headline"; null leaves the existing slug untouched.
    if ("slug" in body && typeof body.slug !== "undefined") {
      patch.slug = body.slug === null ? null : String(body.slug)
    }
    if ("scheduledFor" in body) patch.scheduledFor = body.scheduledFor ?? null
    if ("sourcePdfUrl" in body) patch.sourcePdfUrl = body.sourcePdfUrl ?? null
    // Sentiment: include only when the key is present in the body so omitting
    // it on a partial update leaves the existing value alone. null on the wire
    // means "clear it"; any non-canonical string normalises to null.
    if ("sentiment" in body) {
      if (body.sentiment === null) {
        patch.sentiment = null
      } else if (typeof body.sentiment === "string") {
        const v = body.sentiment.trim().toLowerCase()
        patch.sentiment = (ARTICLE_SENTIMENTS as readonly string[]).includes(v)
          ? (v as ArticleSentiment)
          : null
      }
    }
    const article = await updateArticle(id, patch)
    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ article })
  } catch (e: any) {
    console.error("[admin/newsroom PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  try {
    const ok = await deleteArticle(id)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[admin/newsroom DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}
