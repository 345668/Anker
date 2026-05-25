-- CRM boards (named "CRM sessions"), per-investor research cache, and
-- saved sender profiles for the outreach studio.
--
-- Workflow this enables:
--   * The CRM is organized into named boards ("CRM 1", "Climate LPs", …).
--     Each board is a collection of crm_entries the user can switch
--     between and rename inline.
--   * Matchmaking / shortlist runs auto-create a board (one per
--     source_session_id) so existing rows land somewhere sensible; the
--     user can rename or create empty boards and move rows in.
--   * The outreach studio crawls an investor's public profile and caches
--     the AI summary on the row (research_summary).
--   * The studio builds a reusable "sender profile" from the founder
--     context + a pasted professional summary; saved here for reuse.

-- ─── crm_boards ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_boards (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  -- When a board was auto-created from a matchmaking run this holds the
  -- originating session id so re-imports of the same run reuse the board.
  source_session_id TEXT,
  -- Display order in the tab bar (lower = left). NULLs sort last.
  position INT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_boards_user_idx ON crm_boards (user_id, archived);
-- One auto-board per (user, source_session_id) so re-imports are idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS crm_boards_user_session_uq
  ON crm_boards (user_id, source_session_id)
  WHERE source_session_id IS NOT NULL;

-- ─── crm_entries: board membership + research cache ────────────────────
ALTER TABLE crm_entries
  ADD COLUMN IF NOT EXISTS board_id         TEXT,
  ADD COLUMN IF NOT EXISTS research_summary TEXT,
  ADD COLUMN IF NOT EXISTS research_url     TEXT,
  ADD COLUMN IF NOT EXISTS research_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS crm_entries_board_idx ON crm_entries (board_id);

-- ─── Backfill: one board per existing (user, source_session_id) ────────
-- Rows with a session id get grouped under an auto-named board; rows
-- without one fall into a per-user "Inbox" default board.
DO $$
DECLARE
  r RECORD;
  seq INT;
BEGIN
  -- 1. Session-derived boards.
  FOR r IN
    SELECT DISTINCT user_id, source_session_id
    FROM crm_entries
    WHERE user_id IS NOT NULL AND source_session_id IS NOT NULL
  LOOP
    INSERT INTO crm_boards (user_id, name, source_session_id, position)
    VALUES (
      r.user_id,
      'Run ' || left(r.source_session_id, 8),
      r.source_session_id,
      0
    )
    ON CONFLICT (user_id, source_session_id) WHERE source_session_id IS NOT NULL
    DO NOTHING;
  END LOOP;

  UPDATE crm_entries e
  SET board_id = b.id
  FROM crm_boards b
  WHERE e.board_id IS NULL
    AND e.user_id = b.user_id
    AND e.source_session_id IS NOT NULL
    AND e.source_session_id = b.source_session_id;

  -- 2. Default "Inbox" board for rows with no session id.
  FOR r IN
    SELECT DISTINCT user_id
    FROM crm_entries
    WHERE user_id IS NOT NULL AND board_id IS NULL
  LOOP
    INSERT INTO crm_boards (user_id, name, position, is_default)
    VALUES (r.user_id, 'My CRM', 0, true);

    UPDATE crm_entries e
    SET board_id = (
      SELECT id FROM crm_boards
      WHERE user_id = r.user_id AND is_default = true
      ORDER BY created_at ASC LIMIT 1
    )
    WHERE e.user_id = r.user_id AND e.board_id IS NULL;
  END LOOP;
END $$;

-- ─── sender_profiles ───────────────────────────────────────────────────
-- A reusable description of the *sender* (the founder doing outreach).
-- built_profile is the AI-polished bio; profile_set is a snapshot of the
-- founder context used to build it; raw_summary is what the user pasted.
CREATE TABLE IF NOT EXISTS sender_profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  raw_summary TEXT,
  profile_set JSONB,
  built_profile TEXT,
  generated_by TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sender_profiles_user_idx ON sender_profiles (user_id);

-- ─── outreach_messages: allow studio kinds (email_intro / dm_intro) ────
-- The original CHECK only allowed the 4-step LinkedIn sequence kinds.
-- The outreach studio drafts a one-off intro email + LinkedIn DM, which
-- need their own kinds so they don't collide with the sequence on the
-- UNIQUE (crm_entry_id, kind) key.
ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_kind_check;
ALTER TABLE outreach_messages
  ADD CONSTRAINT outreach_messages_kind_check
  CHECK (kind IN (
    'connection_request','follow_up','different_angle','close_loop',
    'email_intro','dm_intro'
  ));
