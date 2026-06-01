-- pgvector: semantic search over investment_firms + investors.
--
-- Vectors are 768-d (matches Ollama's `nomic-embed-text` model — the
-- default we use; switch dimensions if you change the embed model).
-- HNSW indexes for fast nearest-neighbour at write+read scale.
--
-- Backfill the embeddings via:
--   pnpm tsx scripts/backfill-embeddings.mjs

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── investment_firms ─────────────────────────────────────────────────
ALTER TABLE investment_firms
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_built_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS investment_firms_embedding_hnsw
  ON investment_firms
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── investors ────────────────────────────────────────────────────────
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_built_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS investors_embedding_hnsw
  ON investors
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── crm_entries — semantic dedup of leads ────────────────────────────
ALTER TABLE crm_entries
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_built_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS crm_entries_embedding_hnsw
  ON crm_entries
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
