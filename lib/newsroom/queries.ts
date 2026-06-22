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
import { slugify, ensureUniqueSlug } from "@/lib/newsroom/slug"
import { articleSlugExists } from "@/lib/db/queries"

export const ARTICLE_STATUSES = ["draft", "published", "archived"] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

export const ARTICLE_BLOG_TYPES = [
  "Insights", "Trends", "Analysis", "Guides",
  "News", "Press", "Investment", "Announcements",
] as const
export type ArticleBlogType = (typeof ARTICLE_BLOG_TYPES)[number]

export interface NewsArticleFull {
  id: string
  /** URL slug — unique within the table. */
  slug: string | null
  headline: string
  subheadline: string | null
  content: string | null
  author: string
  blog_type: ArticleBlogType
  tags: string[]
  status: ArticleStatus
  image_url: string | null
  /** When set on a draft, a future job promotes the article to status='published'
   *  with published_at = scheduled_for. Until then it's editorial-calendar metadata. */
  scheduled_for: string | null
  /** Optional link to the source PDF / research note this article was drafted from. */
  source_pdf_url: string | null
  /** Editorial sentiment — one of 'bullish' | 'neutral' | 'bearish' (or null
   *  to omit the badge). Added 2026-06-22 as the replacement for the old
   *  confidence_score pill. The DB column is plain text so we can extend the
   *  vocabulary later without a migration. */
  sentiment: ArticleSentiment | null
  published_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const ARTICLE_SENTIMENTS = ["bullish", "neutral", "bearish"] as const
export type ArticleSentiment = (typeof ARTICLE_SENTIMENTS)[number]

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
    // The Neon column is `executive_summary`. lib/db/queries.ts always
    // aliases it as `subheadline` on read; this admin path was the only
    // place still using the unqualified name in SQL — hence the production
    // "column subheadline does not exist" error.
    where.push(`(headline ILIKE $${params.length} OR executive_summary ILIKE $${params.length} OR content ILIKE $${params.length})`)
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : ""

  const rows: any[] = await sql.unsafe(
    `SELECT id, slug, headline, executive_summary AS subheadline, content, author, blog_type, tags,
            status, image_url, scheduled_for, source_pdf_url, sentiment,
            published_at, created_by, created_at, updated_at
       FROM news_articles
       ${whereSql}
       ORDER BY COALESCE(published_at, scheduled_for, updated_at) DESC
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
    SELECT id, slug, headline, executive_summary AS subheadline, content, author, blog_type, tags,
           status, image_url, scheduled_for, source_pdf_url, sentiment,
           published_at, created_by, created_at, updated_at
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
  /** Optional explicit slug — caller can override the headline-derived default
   *  (useful for hand-curated URLs). Whitespace and casing are normalised. */
  slug?: string | null
  /** Optional ISO timestamp; when set with status='draft', the scheduled-publish
   *  job will promote the article at that time. */
  scheduledFor?: string | null
  /** Optional URL of the source PDF the article was drafted from. */
  sourcePdfUrl?: string | null
  /** Editorial sentiment — 'bullish' | 'neutral' | 'bearish'. Anything outside
   *  that set is normalised to null at the boundary. */
  sentiment?: ArticleSentiment | null
  /** When provided, written to created_by for the audit log. */
  createdBy?: string | null
}

export async function createArticle(input: CreateArticleInput): Promise<NewsArticleFull> {
  if (!input?.headline?.trim()) throw new Error("headline required")
  const status: ArticleStatus = input.status ?? "draft"
  const publishedAt = status === "published" ? new Date().toISOString() : null
  // Production news_articles.tags is text[], not jsonb. Pass the JS array
  // straight through and let Neon serialise to a Postgres array literal.
  // (The migration file declares jsonb but an earlier version of the
  // table shipped with text[], so we match what's actually on Neon.)
  const tagsArr = (input.tags ?? []).filter((s): s is string => typeof s === "string")
  const blogType: ArticleBlogType = input.blogType ?? "Insights"

  // Slug derivation: caller-provided > headline-derived. Then dedupe.
  const baseSlug = slugify(input.slug?.trim() || input.headline.trim())
  const slug = await ensureUniqueSlug(baseSlug, articleSlugExists)

  // Normalise sentiment at the boundary — anything outside the canonical
  // vocabulary becomes null so the DB never holds a typo the UI can't read.
  const sentiment = normalizeSentiment(input.sentiment)

  const rows = await sql`
    INSERT INTO news_articles (
      slug, headline, executive_summary, content, author, blog_type, tags,
      status, image_url, scheduled_for, source_pdf_url, sentiment,
      published_at, created_by, created_at, updated_at
    ) VALUES (
      ${slug},
      ${input.headline.trim()},
      ${input.subheadline ?? null},
      ${input.content ?? null},
      ${input.author?.trim() || "Anker"},
      ${blogType},
      ${tagsArr}::text[],
      ${status},
      ${input.imageUrl ?? null},
      ${input.scheduledFor ?? null}::timestamptz,
      ${input.sourcePdfUrl ?? null},
      ${sentiment},
      ${publishedAt}::timestamptz,
      ${input.createdBy ?? null},
      NOW(), NOW()
    )
    RETURNING id, slug, headline, executive_summary AS subheadline, content, author, blog_type, tags,
              status, image_url, scheduled_for, source_pdf_url, sentiment,
              published_at, created_by, created_at, updated_at
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
  /** When set, replaces the current slug after a uniqueness check. Pass null
   *  to leave the existing slug alone (the migration backfilled all rows). */
  slug?: string | null
  scheduledFor?: string | null
  sourcePdfUrl?: string | null
  /** Pass 'bullish' | 'neutral' | 'bearish' to set, or null to clear. Omitting
   *  the key leaves the existing sentiment untouched. */
  sentiment?: ArticleSentiment | null
}

export async function updateArticle(id: string, patch: UpdateArticleInput): Promise<NewsArticleFull | null> {
  // Tags column is text[] on production (see createArticle note). Pass the
  // array straight through; null means "don't touch tags" via the CASE.
  const tagsToSet = Array.isArray(patch.tags)
    ? patch.tags.filter((s): s is string => typeof s === "string")
    : null
  const tagsProvided = tagsToSet !== null

  // Slug update path. We only touch slug when the caller explicitly sends one.
  // Empty string => regenerate from current headline (or patch.headline).
  // Non-empty   => slugify + uniqueness-probe (skipping this row's own slug).
  let newSlug: string | null = null
  if (typeof patch.slug === "string") {
    if (patch.slug.trim() === "") {
      const current = await getById(id)
      const source = patch.headline?.trim() || current?.headline || ""
      if (source) {
        const base = slugify(source)
        newSlug = await ensureUniqueSlug(base, async (s) => {
          const rows = await sql`SELECT 1 FROM news_articles WHERE slug = ${s} AND id <> ${id} LIMIT 1`
          return rows.length > 0
        })
      }
    } else {
      const base = slugify(patch.slug)
      newSlug = await ensureUniqueSlug(base, async (s) => {
        const rows = await sql`SELECT 1 FROM news_articles WHERE slug = ${s} AND id <> ${id} LIMIT 1`
        return rows.length > 0
      })
    }
  }

  // Sentiment update: omitted key means "leave alone"; null means "clear it".
  // We can't use COALESCE here because we want to distinguish "clear" from
  // "untouched" — fall back to a CASE driven by an explicit provided-flag.
  const sentimentProvided = "sentiment" in patch
  const sentimentValue: ArticleSentiment | null = sentimentProvided
    ? normalizeSentiment(patch.sentiment ?? null)
    : null

  // Status transition to 'published' stamps published_at if it wasn't already set.
  const rows = await sql`
    UPDATE news_articles SET
      headline          = COALESCE(${patch.headline ?? null}, headline),
      executive_summary = COALESCE(${patch.subheadline ?? null}, executive_summary),
      content           = COALESCE(${patch.content ?? null}, content),
      author            = COALESCE(${patch.author ?? null}, author),
      blog_type         = COALESCE(${patch.blogType ?? null}, blog_type),
      tags              = CASE WHEN ${tagsProvided} THEN ${tagsToSet ?? []}::text[] ELSE tags END,
      status            = COALESCE(${patch.status ?? null}, status),
      image_url         = COALESCE(${patch.imageUrl ?? null}, image_url),
      slug              = COALESCE(${newSlug}, slug),
      scheduled_for     = COALESCE(${patch.scheduledFor ?? null}::timestamptz, scheduled_for),
      source_pdf_url    = COALESCE(${patch.sourcePdfUrl ?? null}, source_pdf_url),
      sentiment         = CASE WHEN ${sentimentProvided} THEN ${sentimentValue} ELSE sentiment END,
      published_at      = CASE
                            WHEN ${patch.status ?? null} = 'published' AND published_at IS NULL THEN NOW()
                            WHEN ${patch.status ?? null} = 'draft' THEN NULL
                            ELSE published_at
                          END,
      updated_at        = NOW()
    WHERE id = ${id}
    RETURNING id, slug, headline, executive_summary AS subheadline, content, author, blog_type, tags,
              status, image_url, scheduled_for, source_pdf_url, sentiment,
              published_at, created_by, created_at, updated_at
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
    slug: r.slug ?? null,
    headline: r.headline,
    subheadline: r.subheadline ?? null,
    content: r.content ?? null,
    author: r.author ?? "Anker",
    blog_type: (r.blog_type ?? "Insights") as ArticleBlogType,
    tags: parseTags(r.tags),
    status: (r.status ?? "draft") as ArticleStatus,
    image_url: r.image_url ?? null,
    scheduled_for: toIso(r.scheduled_for),
    source_pdf_url: r.source_pdf_url ?? null,
    sentiment: normalizeSentiment(r.sentiment),
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
/** Coerce any inbound or stored value to the canonical sentiment vocabulary
 *  or null. We do this at every read/write boundary so the rest of the code
 *  never has to think about case, whitespace, or legacy spellings. */
function normalizeSentiment(v: any): ArticleSentiment | null {
  if (typeof v !== "string") return null
  const t = v.trim().toLowerCase()
  return (ARTICLE_SENTIMENTS as readonly string[]).includes(t) ? (t as ArticleSentiment) : null
}
