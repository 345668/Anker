-- Phase 5: item-level checklists + request-a-document.

-- Tag a document to the specific taxonomy item it fulfills (nullable — a doc
-- can belong to a section without mapping to a checklist item).
ALTER TABLE data_room_documents
  ADD COLUMN IF NOT EXISTS item_key text;
CREATE INDEX IF NOT EXISTS drd_item_idx ON data_room_documents (company_id, item_key);

-- Requests for a missing document (investor→founder or LP→GP).
CREATE TABLE IF NOT EXISTS data_room_requests (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id     text,                 -- founder room scope
  fund_id        text,                 -- fund room scope
  requester_email text,
  section        text,
  item_label     text NOT NULL,
  note           text,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','dismissed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz
);
CREATE INDEX IF NOT EXISTS drr_company_idx ON data_room_requests (company_id, status);
CREATE INDEX IF NOT EXISTS drr_fund_idx    ON data_room_requests (fund_id, status);
