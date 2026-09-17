-- Structured ad attribution for early-access requests.
--
-- The form captured only utm_source, utm_medium and utm_campaign, flattened
-- them into one " / "-joined string and stored that in referral_source. So
-- utm_id, utm_content and utm_term were discarded outright, and the three that
-- did survive could not be grouped or filtered — "google / cpc / launch" is a
-- label, not data. Paid-campaign reporting was impossible.
--
-- attribution keeps each field separately, alongside the referrer and the
-- landing path, so signups can be grouped by source/campaign/content and a
-- conversion rate can be read per campaign.
--
-- Additive: referral_source stays as the human-readable summary, and every
-- existing row keeps working with attribution NULL.
ALTER TABLE early_access_requests ADD COLUMN IF NOT EXISTS attribution jsonb;

-- Reporting is almost always "signups by source" or "by campaign".
CREATE INDEX IF NOT EXISTS early_access_requests_attribution_idx
  ON early_access_requests USING gin (attribution jsonb_path_ops);
