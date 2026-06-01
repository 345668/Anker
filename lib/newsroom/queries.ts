/**
 * News-room CRUD.
 *
 * The legacy queries in lib/db/queries.ts handle the public read side
 * (getPublishedArticles + getFeaturedArticles).  This module adds
 * everything the admin CMS at /dashboard/admin/newsroom needs:
 *
 *   listAll(opts)        — published + draft + archived, optional filters
 *   getById(id)
 *   createArticle(input)
 *   updateArticle(id, patch)
 *   setStatus(id, status)
 *   deleteArticle(id)
 *
 * All writes are transactional in the obvious way (single statement)
 * and stamp updated_at on every change.
 */

import { sql } from "@/lib/db"

export const ARTICLE_STATUSES = ["draft", "published", "archived"] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

export const ARTICLE_BLOG_TYPES = [
  "Insights", "Trends", "Analysis", "Guides",
  "News", "Press", "Investment", "Announcements",
] as const
export type ArticleBlogType = (typeof ARTICLE_BLOG_TYPES)[number]

export interface NewsArticleFull {
  id: string
  headline: string
  subheadline: string | null
  content: string | null
  author: string
  blog_type: ArticleBlogType
  tags: string[]
  status: ArticleStatus
  image_url: string | null
  published_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ListArticlesOpts {
  status?: ArticleStatus | "all"
  blogType?: ArticleBlogType | "all"
  /** Free-text headline / subheadline search. */
  query?: string
  limit?: number
  offset?: number
}

/** Admin-side list — includes drafts + archived. */
export async function listAll(opts: ListArticlesOpts = {}): Promise<{ rows: NewsArticleFull[]; total: number }> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 100))
  const offset = Math.max(0, opts.offset ?? 0)
  const status = opts.status ?? "all"
  const blogType = opts.blogType ?? "all"
  const query = (opts.query ?? "").trim()

  const where: string[] = []
  const params: any[] = []
  if (status !== "all") { params.push(status); where.push(`status = $${params.length}`) }
  if (blogType !== "all") { params.push(blogType); where.push(`blog_type = $${params.length}`) }
  if (query) {
    params.push(`%${query}%`)
    where.push(`(headline ILIKE $${params.length} OR subheadline ILIKE $${params.length} OR content ILIKE $${params.length})`)
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : ""

  const rows: any[] = await sql.unsafe(
    `SELECT id, headline, subheadline, content, author, blog_type, tags,
            status, image_url, published_at, created_by, created_at, updated_at
       FROM news_articles
       ${whereSql}
       ORDER BY COALESCE(published_at, updated_at) DESC
       LIMIT ${limit} OFFSET ${offset}`,
    params,
  )
  const totalRows: any[] = await sql.unsafe(
    `SELECT COUNT(*) AS n FROM news_articles ${whereSql}`,
    params,
  )
  return {
    rows: rows.map(normalize),
    total: Number(totalRows[0]?.n ?? 0),
  }
}

export async function getById(id: string): Promise<NewsArticleFull | null> {
  const rows = await sql`
    SELECT id, headline, subheadline, content, author, blog_type, tags,
           status, image_url, published_at, created_by, created_at, updated_at
      FROM news_articles WHERE id = ${id} LIMIT 1
  `
  return rows[0] ? normalize(rows[0]) : null
}

export interface CreateArticleInput {
  headline: string
  subheadline?: string | null
  content?: string | null
  author?: string | null
  blogType?: ArticleBlogType
  tags?: string[]
  status?: ArticleStatus
  imageUrl?: string | null
  /** When provided, written to created_by for the audit log. */
  createdBy?: string | null
}

export async function createArticle(input: CreateArticleInput): Promise<NewsArticleFull> {
  if (!input?.headline?.trim()) throw new Error("headline required")
  const status: ArticleStatus = input.status ?? "draft"
  const publishedAt = status === "published" ? new Date().toISOString() : null
  const tagsJson = JSON.stringify(input.tags ?? [])
  const blogType: ArticleBlogType = input.blogType ?? "Insights"

  const rows = await sql`
    INSERT INTO news_articles (
      headline, subheadline, content, author, blog_type, tags,
      status, image_url, published_at, created_by, created_at, updated_at
    ) VALUES (
      ${input.headline.trim()},
      ${input.subheadline ?? null},
      ${input.content ?? null},
      ${input.author?.trim() || "Anker"},
      ${blogType},
      ${tagsJson}::jsonb,
      ${status},
      ${input.imageUrl ?? null},
      ${publishedAt}::timestamptz,
      ${input.createdBy ?? null},
      NOW(), NOW()
    )
    RETURNING id, headline, subheadline, content, author, blog_type, tags,
              status, image_url, published_at, created_by, created_at, updated_at
  `
  return normalize(rows[0])
}

export interface UpdateArticleInput {
  headline?: string
  subheadline?: string | null
  content?: string | null
  author?: string
  blogType?: ArticleBlogType
  tags?: string[]
  status?: ArticleStatus
  imageUrl?: string | null
}

export async function updateArticle(id: string, patch: UpdateArticleInput): Promise<NewsArticleFull | null> {
  const tagsJson = patch.tags ? JSON.stringify(patch.tags) : null
  // Status transition to 'published' stamps published_at if it wasn't already set.
  const rows = await sql`
    UPDATE news_articles SET
      headline      = COALESCE(${patch.headline ?? null}, headline),
      subheadline   = COALESCE(${patch.subheadline ?? null}, subheadline),
      content       = COALESCE(${patch.content ?? null}, content),
      author        = COALESCE(${patch.author ?? null}, author),
      blog_type     = COALESCE(${patch.blogType ?? null}, blog_type),
      tags          = CASE WHEN ${tagsJson}::text IS NOT NULL THEN ${tagsJson}::jsonb ELSE tags END,
      status        = COALESCE(${patch.status ?? null}, status),
      image_url     = COALESCE(${patch.imageUrl ?? null}, image_url),
      published_at  = CASE
                        WHEN ${patch.status ?? null} = 'published' AND published_at IS NULL THEN NOW()
                        WHEN ${patch.status ?? null} = 'draft' THEN NULL
                        ELSE published_at
                      END,
      updated_at    = NOW()
    WHERE id = ${id}
    RETURNING id, headline, subheadline, content, author, blog_type, tags,
              status, image_url, published_at, created_by, created_at, updated_at
  `
  return rows[0] ? normalize(rows[0]) : null
}

export async function setStatus(id: string, status: ArticleStatus): Promise<NewsArticleFull | null> {
  return updateArticle(id, { status })
}

export async function deleteArticle(id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM news_articles WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

// ─── helpers ───────────────────────────────────────────────────────────
function normalize(r: any): NewsArticleFull {
  return {
    id: r.id,
    headline: r.headline,
    subheadline: r.subheadline ?? null,
    content: r.content ?? null,
    author: r.author ?? "Anker",
    blog_type: (r.blog_type ?? "Insights") as ArticleBlogType,
    tags: parseTags(r.tags),
    status: (r.status ?? "draft") as ArticleStatus,
    image_url: r.image_url ?? null,
    published_at: toIso(r.published_at),
    created_by: r.created_by ?? null,
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
  }
}
function parseTags(v: any): string[] {
  if (Array.isArray(v)) return v.filter((s) => typeof s === "string")
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p.filter((s) => typeof s === "string") : []
    } catch { return [] }
  }
  return []
}
function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}
