-- Platform notifications — in-app alerts (deadline reminders, system events).
--
-- One row per (recipient, event). Idempotency for recurring scanners (the
-- deadline cron) is enforced by a unique (user_id, dedupe_key): re-running the
-- scan upserts the same reminder instead of spamming. read_at NULL = unread.
--
-- Fed by lib/notifications/store.ts (create/list/mark-read) and the
-- lib/notifications/deadlines.ts scanner via /api/cron/deadline-reminders.

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  /** Recipient — Supabase auth user id. */
  user_id     TEXT        NOT NULL,
  /** Optional org/fund context for scoping + display. */
  org_id      TEXT,
  /** Machine kind: capital_call_due | distribution_due | valuation_expiring |
   *  filing_due | system | … */
  kind        TEXT        NOT NULL,
  severity    TEXT        NOT NULL DEFAULT 'info'
              CHECK (severity IN ('info', 'warning', 'urgent')),
  title       TEXT        NOT NULL,
  body        TEXT,
  /** Deep link into the app (e.g. /dashboard/portfolio/fund/calls/<id>). */
  href        TEXT,
  /** Idempotency key for recurring scanners. NULL for one-off notifications. */
  dedupe_key  TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One notification per (recipient, dedupe_key) — the scanner upserts on this.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_idx
  ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Fast unread lookups + feed ordering.
CREATE INDEX IF NOT EXISTS notifications_user_feed_idx
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id) WHERE read_at IS NULL;
