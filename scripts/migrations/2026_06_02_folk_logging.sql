-- Adds the per-campaign folk_logging toggle.
-- Default off — opt-in per campaign via PATCH /api/outreach/campaigns/[id].
-- Applied to Neon at the time of this commit; apply to local when Postgres is up:
--   psql "$DATABASE_URL" -f scripts/migrations/2026_06_02_folk_logging.sql
ALTER TABLE outreach_campaigns
  ADD COLUMN IF NOT EXISTS folk_logging_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN outreach_campaigns.folk_logging_enabled IS
  'When true, every successful Resend send for this campaign is logged to Folk via POST /v1/interactions (type=message). Best-effort: a Folk failure does not block the send.';
