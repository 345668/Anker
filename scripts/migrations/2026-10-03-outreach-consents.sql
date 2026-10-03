-- Country send-gate: the sender's attestation that a recipient in a gated country (Germany and the other
-- EU/EEA states) gave prior express consent, or is an existing customer. docs/architecture/37 section 8.3.
CREATE TABLE IF NOT EXISTS outreach_consents (
  id          bigserial PRIMARY KEY,
  user_id     text NOT NULL,
  email       text NOT NULL,
  basis       text NOT NULL CHECK (basis IN ('prior_express_consent', 'existing_customer')),
  note        text,
  attested_at timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_consents_user_email ON outreach_consents (user_id, lower(email));
