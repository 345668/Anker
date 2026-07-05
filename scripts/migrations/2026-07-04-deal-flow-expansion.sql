-- ============================================================================
-- Deal flow expansion — deal-scoped founders + deal data room
-- ============================================================================
--
-- Two new tables that hang off deal_opportunities (whose id is TEXT — never
-- cast these FKs to ::uuid). Both cascade-delete with their parent deal.
--
--   deal_founders   — founder profiles per deal (name, role, contact, bio,
--                     photo). One is flagged is_primary; auto-seeded from the
--                     pitch contact on deal creation when present.
--
--   deal_documents  — the deal's data room. Files live in Vercel Blob (private
--                     store); we keep the blob_path here and stream bytes back
--                     through an authenticated API route. category groups docs
--                     so stage gates can check for required types, and
--                     stage_at_upload records which stage the deal was in when
--                     the doc landed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_founders (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  deal_id        TEXT        NOT NULL REFERENCES deal_opportunities(id) ON DELETE CASCADE,

  name           TEXT        NOT NULL,
  role           TEXT,                       -- e.g. "CEO & Co-founder"
  email          TEXT,
  linkedin_url   TEXT,
  bio            TEXT,
  photo_url      TEXT,                        -- served via streaming route
  ownership_pct  NUMERIC,
  is_primary     BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deal_founders_deal_idx
  ON deal_founders (deal_id, is_primary DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS deal_documents (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  deal_id          TEXT        NOT NULL REFERENCES deal_opportunities(id) ON DELETE CASCADE,
  fund_id          TEXT,

  category         TEXT        NOT NULL DEFAULT 'other'
                   CHECK (category IN (
                     'deck', 'financial_model', 'cap_table', 'legal',
                     'references', 'kyc', 'other'
                   )),

  name             TEXT        NOT NULL,      -- display / original filename
  blob_path        TEXT        NOT NULL,      -- private blob pathname
  content_type     TEXT,
  size             INTEGER,
  stage_at_upload  TEXT,                       -- deal stage when uploaded

  uploaded_by      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deal_documents_deal_idx
  ON deal_documents (deal_id, category, created_at DESC);
