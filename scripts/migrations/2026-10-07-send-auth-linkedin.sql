-- Send authorizations P4 (docs/architecture/46 §18): LinkedIn actions are recorded under the same authorization record; the extension is the executor.
ALTER TABLE send_authorizations DROP CONSTRAINT IF EXISTS send_authorizations_provider_check;
ALTER TABLE send_authorizations ADD CONSTRAINT send_authorizations_provider_check CHECK (provider IN ('resend','gmail','linkedin'));
ALTER TABLE send_authorizations DROP CONSTRAINT IF EXISTS send_authorizations_source_check;
ALTER TABLE send_authorizations ADD CONSTRAINT send_authorizations_source_check
  CHECK (source IN ('manual_single','manual_batch','proposal','reply','platform_wave','direct','investor_update','linkedin'));
