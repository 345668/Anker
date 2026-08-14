-- Founder raise room (Phase 3): founder documents live in data_room_documents
-- with room_type='founder' and company_id set, and NO fund_id. Relax the
-- NOT NULL so a document can belong to a founder workspace instead of a fund.
-- The FK to funds(id) stays (a null FK is allowed); fund docs are unaffected.
ALTER TABLE data_room_documents
  ALTER COLUMN fund_id DROP NOT NULL;
