-- Deck / data-room view tracking: one row per document open, so the GP can see
-- which LPs (or team members) have viewed each shared document.
CREATE TABLE IF NOT EXISTS data_room_document_views (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id  text NOT NULL,
  fund_id      text,
  fund_lp_id   text,
  viewer_email text,
  is_lp        boolean NOT NULL DEFAULT false,
  viewed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drdv_doc_idx  ON data_room_document_views (document_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS drdv_fund_idx ON data_room_document_views (fund_id, viewed_at DESC);
