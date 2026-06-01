-- news_articles: backing table for the public /newsroom page and the
-- admin CMS at /dashboard/admin/newsroom.
--
-- The schema mirrors the columns the existing read-side code in
-- lib/db/queries.ts assumes (headline / author / blog_type / tags /
-- published_at / status / image_url) and adds the editing fields
-- (subheadline / content / created_by) the CMS needs.

CREATE TABLE IF NOT EXISTS news_articles (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  headline      TEXT NOT NULL,
  subheadline   TEXT,
  content       TEXT,                       -- Markdown body
  author        TEXT NOT NULL DEFAULT 'Anker',
  blog_type     TEXT NOT NULL DEFAULT 'Insights'
                  CHECK (blog_type IN (
                    'Insights','Trends','Analysis','Guides',
                    'News','Press','Investment','Announcements'
                  )),
  tags          JSONB DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','archived')),
  image_url     TEXT,
  /** When status='published'.  Pre-published articles have NULL. */
  published_at  TIMESTAMPTZ,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS news_articles_status_pub_idx
  ON news_articles (status, published_at DESC);
CREATE INDEX IF NOT EXISTS news_articles_blog_type_idx
  ON news_articles (blog_type);
CREATE INDEX IF NOT EXISTS news_articles_created_by_idx
  ON news_articles (created_by)
  WHERE created_by IS NOT NULL;
