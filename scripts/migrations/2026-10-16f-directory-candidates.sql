-- Directory identity: candidate duplicates and the decisions on them (docs/architecture/55, slice E1). Additive. Changes no directory data.
CREATE TABLE IF NOT EXISTS directory_candidates (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('firm', 'person')),
  -- Ordered (a_id < b_id) so a pair has exactly one row.
  a_id text NOT NULL,
  b_id text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('certain', 'probable', 'possible')),
  score integer NOT NULL DEFAULT 0,
  -- What the detector suggests the answer is: 'same' or 'related'. The reviewer decides.
  suggest text NOT NULL DEFAULT 'same' CHECK (suggest IN ('same', 'related')),
  -- Facts only (keys, host, counts, sources). No personal data.
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- same: confirmed as one record, merge pending (slice E2). distinct: not the same, never proposed again. related: parent and child.
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'same', 'distinct', 'related', 'merged', 'stale')),
  parent_id text,
  decided_by text,
  decided_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (a_id < b_id),
  UNIQUE (kind, a_id, b_id)
);
CREATE INDEX IF NOT EXISTS directory_candidates_queue_idx ON directory_candidates (kind, status, tier, score DESC);

INSERT INTO platform_flags (key, enabled, rollout_pct, description)
VALUES ('directory_auto_merge', false, 100, 'Doc 55 E2: merge people with the same email or profile and a compatible name without a review. Off until a sample is confirmed. Firms are never merged automatically.')
ON CONFLICT (key) DO NOTHING;
