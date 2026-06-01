-- Resend-side event sync.
--
-- Localhost setup can't receive Resend webhooks (no public URL), so
-- instead we poll Resend's GET /emails/:id endpoint per sent message
-- to pull opens / clicks / bounces / delivered / complained events.
-- This column tracks when we last asked Resend about each message so
-- we only re-sync messages older than the polling interval.

ALTER TABLE outreach_messages
  ADD COLUMN IF NOT EXISTS last_resend_sync_at TIMESTAMPTZ;

-- Partial index on the subset we actually poll: sent emails that
-- haven't reached a terminal state.  Keeps the table scan small even
-- as outreach_messages grows.
CREATE INDEX IF NOT EXISTS outreach_messages_resend_sync_idx
  ON outreach_messages (last_resend_sync_at NULLS FIRST)
  WHERE channel = 'email'
    AND resend_id IS NOT NULL
    AND status IN ('sent','delivered','opened','clicked','replied');
