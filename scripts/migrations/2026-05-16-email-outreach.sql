-- Email outreach: tracking, threading, and IMAP state.
--
-- This layer turns outreach_messages from a LinkedIn-DM-only table into
-- a multi-channel queue with full email instrumentation:
--
--   * subject + reply-to + Message-ID headers for threading
--   * tracking_id (uuid) for pixel + link rewriting
--   * opens / clicks counters + last_* timestamps
--   * resend_id for cross-referencing Resend's dashboard
--   * needs_followup flag toggled by the agent
--
-- outreach_events is the append-only event log (open, click, bounce,
-- spam, unsubscribe).  We aggregate counts back into outreach_messages
-- so the UI doesn't have to re-aggregate on every render.
--
-- inbox_poll_state tracks where the IMAP poller last left off so we
-- don't reprocess every reply on each tick.

-- ─── outreach_messages: new email columns ──────────────────────────────
ALTER TABLE outreach_messages
  ADD COLUMN IF NOT EXISTS subject          TEXT,
  ADD COLUMN IF NOT EXISTS email_from       TEXT,
  ADD COLUMN IF NOT EXISTS email_to         TEXT,
  ADD COLUMN IF NOT EXISTS email_message_id TEXT,         -- RFC 2822 Message-ID we put on outgoing
  ADD COLUMN IF NOT EXISTS email_thread_id  TEXT,         -- our internal thread id (sha1 of subject + recipient)
  ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT REFERENCES outreach_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tracking_id      TEXT UNIQUE,  -- uuid we embed in /track/open + /track/click
  ADD COLUMN IF NOT EXISTS opens            INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks           INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_opened_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_clicked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resend_id        TEXT,
  ADD COLUMN IF NOT EXISTS needs_followup   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_due_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS outreach_messages_tracking_idx
  ON outreach_messages (tracking_id) WHERE tracking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS outreach_messages_message_id_idx
  ON outreach_messages (email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS outreach_messages_thread_idx
  ON outreach_messages (email_thread_id) WHERE email_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS outreach_messages_followup_idx
  ON outreach_messages (needs_followup, followup_due_at)
  WHERE needs_followup = true;

-- ─── outreach_events: append-only event log ────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id TEXT NOT NULL REFERENCES outreach_messages(id) ON DELETE CASCADE,
  -- One of: open, click, bounce, spam, unsubscribe, delivered, sent_failed
  kind TEXT NOT NULL CHECK (kind IN ('open','click','bounce','spam','unsubscribe','delivered','sent_failed')),
  -- Click events carry the URL that was clicked.
  url TEXT,
  -- Coarse client signals — useful for filtering bot opens.
  ip TEXT,
  user_agent TEXT,
  -- Provider event id (Resend / Postmark / etc.) so we can de-dupe
  -- webhook deliveries.
  provider_event_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outreach_events_message_idx
  ON outreach_events (message_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS outreach_events_kind_idx
  ON outreach_events (kind, occurred_at DESC);
-- Dedupe-by-provider-event-id (when present).
CREATE UNIQUE INDEX IF NOT EXISTS outreach_events_provider_event_uidx
  ON outreach_events (provider_event_id) WHERE provider_event_id IS NOT NULL;

-- ─── inbox_poll_state: where the IMAP poller is ────────────────────────
CREATE TABLE IF NOT EXISTS inbox_poll_state (
  mailbox        TEXT PRIMARY KEY,                  -- e.g. 'vc@an-ker.de:INBOX'
  last_uid       BIGINT NOT NULL DEFAULT 0,         -- IMAP UID we last consumed
  last_polled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error     TEXT,                              -- last connection / parse error, NULL on success
  poll_count     INT NOT NULL DEFAULT 0,            -- monotonic counter (for diagnostics)
  new_replies    INT NOT NULL DEFAULT 0             -- replies inserted on the last successful poll
);

-- Seed the row for our outreach mailbox so the poller has something to
-- read on first run.  The IMAP_USER env can override mailbox name at
-- runtime; this is just a starting point.
INSERT INTO inbox_poll_state (mailbox, last_uid, last_polled_at)
VALUES ('vc@an-ker.de:INBOX', 0, NOW())
ON CONFLICT (mailbox) DO NOTHING;
