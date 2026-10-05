-- Send authorizations P3 (docs/architecture/46 §17): the click-to-send paths that have no stored draft get an authorization too, and enforcement has its flag (off).
ALTER TABLE send_authorizations DROP CONSTRAINT IF EXISTS send_authorizations_source_check;
ALTER TABLE send_authorizations ADD CONSTRAINT send_authorizations_source_check
  CHECK (source IN ('manual_single','manual_batch','proposal','reply','platform_wave','direct','investor_update'));
INSERT INTO platform_flags (key, enabled, rollout_pct, description) VALUES
  ('outreach_require_authorization', false, 100, 'Enforcement: an outreach email with no send authorization is refused. Turn on only after the unauthorized-path log has been quiet for two weeks')
ON CONFLICT (key) DO NOTHING;
