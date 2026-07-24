-- Outcome-capture event log for the learned matchmaking ranker.
--
-- The ranker (lib/matching/v2/scoring.ts) orders firms/contacts by a fit
-- score. To learn from real results we need labelled data: for each match we
-- surfaced, what actually happened downstream? This append-only log records
-- the milestone transitions — match_shown -> contacted -> replied ->
-- committed (plus declined) — from BOTH stage systems (crm_entries and the
-- lp_firm_matches / lp_contact_matches pipeline) through a single writer
-- (lib/matching/outcome-events.ts). Zero UI; it just accumulates.
--
-- Design notes:
--   * event_type is the NORMALISED milestone (five values), not the raw
--     stage — both stage vocabularies map onto it in the writer. The raw
--     prev/new stage strings are kept for provenance/debugging.
--   * match_score is the score AT DECISION TIME, denormalised so training
--     doesn't depend on the mutable source row still existing or still
--     holding the same score.
--   * firm_id / investor_id let training join back to the feature vectors;
--     either or both may be set.
--   * append-only: no updates, no deletes. Re-emitting the same milestone is
--     tolerated (dedupe happens at training time, not here).

CREATE TABLE IF NOT EXISTS match_outcome_events (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      TEXT,
  -- Normalised milestone. CHECK keeps the vocabulary closed so training
  -- code can rely on it.
  event_type   TEXT NOT NULL CHECK (event_type IN (
                 'match_shown', 'contacted', 'replied', 'committed', 'declined'
               )),
  -- Which system emitted the event, and the row it came from.
  source       TEXT NOT NULL CHECK (source IN (
                 'crm_entry', 'lp_firm_match', 'lp_contact_match', 'outreach'
               )),
  subject_id   TEXT NOT NULL,
  -- Underlying entities, for joining back to the ranker's feature vectors.
  firm_id      TEXT,
  investor_id  TEXT,
  -- Score the ranker assigned at decision time (denormalised on purpose).
  match_score  INT,
  -- Raw stage strings that produced this event, for provenance.
  prev_stage   TEXT,
  new_stage    TEXT,
  -- Freeform: why_match, source_session_id, channel, etc.
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Training reads by label and by entity; ops reads a subject's timeline.
CREATE INDEX IF NOT EXISTS match_outcome_events_type_idx     ON match_outcome_events (event_type);
CREATE INDEX IF NOT EXISTS match_outcome_events_user_idx     ON match_outcome_events (user_id);
CREATE INDEX IF NOT EXISTS match_outcome_events_firm_idx     ON match_outcome_events (firm_id);
CREATE INDEX IF NOT EXISTS match_outcome_events_investor_idx ON match_outcome_events (investor_id);
CREATE INDEX IF NOT EXISTS match_outcome_events_subject_idx  ON match_outcome_events (source, subject_id);
