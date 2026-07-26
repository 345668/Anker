-- Persist what the engine actually extracts and matches on, so it's auditable
-- and visible in the admin UI (previously computed in-memory and discarded).
--   extracted_json        — raw fields the AI pulled from the deck/data-room
--   startup_profile_json  — the merged profile (form + extraction) that the
--                           matching engine scored investors against
-- Additive / IF NOT EXISTS.
alter table founder_submissions add column if not exists extracted_json       jsonb;
alter table founder_submissions add column if not exists startup_profile_json jsonb;
