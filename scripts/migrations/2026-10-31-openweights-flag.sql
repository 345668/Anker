-- The open-weights lane's platform flag (docs/architecture/53 P1). Off. Nothing is sent to a self-hosted model until a person turns it on AND configures the endpoint, a key and a licence-cleared model.
INSERT INTO platform_flags (key, enabled, rollout_pct, description)
VALUES ('ai_openweights', false, 100, 'Doc 53: the open-weights lane (self-hosted language models behind our own gateway). Off: the lane is never used.')
ON CONFLICT (key) DO NOTHING;
