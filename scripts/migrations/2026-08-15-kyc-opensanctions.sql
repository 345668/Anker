-- KYC screening: record which provider produced a hit and a link to the
-- source profile (OpenSanctions entity page). Additive and idempotent.

ALTER TABLE kyc_screening_hits ADD COLUMN IF NOT EXISTS provider   text;
ALTER TABLE kyc_screening_hits ADD COLUMN IF NOT EXISTS source_url text;
