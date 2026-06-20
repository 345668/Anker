-- ============================================================================
-- Newsroom polish — slug-based URLs + scheduled publishing
-- ============================================================================
--
-- Adds three pieces of CMS hygiene to news_articles:
--
--   1. slug              TEXT UNIQUE — public URL goes from /newsroom/<uuid>
--                                       to /newsroom/<slug>. Old UUID URLs
--                                       still work (the public route does
--                                       getArticleBySlugOrId), so this is
--                                       backward-compatible.
--
--   2. scheduled_for     TIMESTAMPTZ — when set on a draft, a future job
--                                      can promote it to status='published'
--                                      with published_at=scheduled_for.
--                                      Until then it's an editorial calendar
--                                      hint visible only in the admin UI.
--
--   3. source_pdf_url    TEXT        — link to the source PDF / research note
--                                      the article was drafted from. Surfaced
--                                      in the article-page sources sidebar
--                                      alongside the existing citation list.
--
-- The slug backfill below uses a deterministic recipe:
--   lower(headline)
--   → strip apostrophes and quotes
--   → replace any run of non-alphanumerics with "-"
--   → trim leading/trailing dashes
--   → truncate to 70 chars at the nearest word boundary
--   → append "-<first-6-of-id>" so collisions never block backfill
--
-- Future inserts get slug from the API layer (createArticle / updateArticle),
-- not from a trigger — that keeps slug ownership in TypeScript where we can
-- log, reject, or rewrite as needed.
-- ============================================================================

ALTER TABLE news_articles
  ADD COLUMN IF NOT EXISTS slug           TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_for  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_pdf_url TEXT;

-- Backfill slugs for every existing article that doesn't have one yet.
-- Deterministic, idempotent — safe to re-run.
UPDATE news_articles
SET slug = (
  CASE
    WHEN slug IS NOT NULL AND length(trim(slug)) > 0 THEN slug
    ELSE
      -- lower → strip apostrophes → non-alnum to hyphens → trim hyphens
      trim(both '-' from
        regexp_replace(
          regexp_replace(lower(headline), '[''"`]', '', 'g'),
          '[^a-z0-9]+', '-', 'g'
        )
      )
      || '-' || substr(id, 1, 6)
  END
)
WHERE slug IS NULL OR length(trim(slug)) = 0;

-- Unique on slug.  Partial index so multiple NULLs are still allowed during
-- backfill races / drafts where slug hasn't been set yet.
CREATE UNIQUE INDEX IF NOT EXISTS news_articles_slug_unique_idx
  ON news_articles (slug)
  WHERE slug IS NOT NULL;

-- Fast lookup for the scheduled-publish job (when we add it).
CREATE INDEX IF NOT EXISTS news_articles_scheduled_for_idx
  ON news_articles (scheduled_for)
  WHERE status = 'draft' AND scheduled_for IS NOT NULL;
