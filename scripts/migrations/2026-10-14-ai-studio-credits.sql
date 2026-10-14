-- Media Studio credits (docs/architecture/52). Replaces the fixed request counts (30 a day per workspace, 20 per person) with a daily credit allowance
-- per workspace, a ledger, bonus credits and refunds. Additive: the old reservation function stays, unused.
CREATE TABLE IF NOT EXISTS ai_studio_credit_rates (
  model text NOT NULL,
  resolution text NOT NULL DEFAULT '*',
  unit text NOT NULL CHECK (unit IN ('job', 'second')),
  credits integer NOT NULL CHECK (credits > 0),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model, resolution)
);
INSERT INTO ai_studio_credit_rates (model, resolution, unit, credits) VALUES
  ('qwen-image-2.0', '*', 'job', 30), ('qwen-image-plus', '*', 'job', 30), ('wan2.6-t2i', '*', 'job', 30),
  ('qwen-image-2.0-pro', '*', 'job', 60), ('qwen-image-max', '*', 'job', 80), ('wan2.7-image-pro', '*', 'job', 80),
  ('z-image-turbo', '*', 'job', 10),
  ('qwen-image-edit-plus-2025-12-15', '*', 'job', 40), ('qwen-image-edit-max', '*', 'job', 80),
  ('wan2.7', '720p', 'second', 50), ('wan2.7', '1080p', 'second', 100),
  ('happyhorse-1.1', '720p', 'second', 60), ('happyhorse-1.1', '1080p', 'second', 120),
  ('speech', '*', 'job', 10)
ON CONFLICT (model, resolution) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_studio_credit_ledger (
  id bigserial PRIMARY KEY,
  scope_key text NOT NULL,
  org_id text,
  user_id text,
  job_id text,
  kind text NOT NULL CHECK (kind IN ('spend', 'refund', 'grant', 'revoke', 'adjust')),
  -- Signed: a spend is negative, a refund or a grant positive.
  credits integer NOT NULL,
  source text NOT NULL CHECK (source IN ('daily', 'bonus')),
  -- The allowance day (UTC) a daily row counts against. A refund keeps the day of the spend it returns.
  day date,
  reason text,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_studio_credit_ledger_day ON ai_studio_credit_ledger (scope_key, source, day);
CREATE INDEX IF NOT EXISTS ai_studio_credit_ledger_recent ON ai_studio_credit_ledger (scope_key, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ai_studio_credit_spend_once ON ai_studio_credit_ledger (job_id, source) WHERE kind = 'spend';
CREATE UNIQUE INDEX IF NOT EXISTS ai_studio_credit_refund_once ON ai_studio_credit_ledger (job_id, source) WHERE kind = 'refund';
ALTER TABLE ai_studio_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_studio_credit_rates ENABLE ROW LEVEL SECURITY;

-- Daily credits per plan. -1 means unlimited. A workspace with no plan gets the platform default in code (1,000).
UPDATE plan_catalog SET limits = jsonb_set(coalesce(limits, '{}'::jsonb), '{ai_studio_daily_credits}', to_jsonb(v.n)) FROM (VALUES
  ('founder_explore', 1000), ('starter', 1000), ('founder_raise', 2000), ('fund_studio', 3000), ('founder_raise_plus', 4000),
  ('pro', 5000), ('design_partner', 5000), ('fund_pro', 6000), ('scale', 10000), ('fund_institutional', 15000),
  ('lp_access', 300), ('internal', -1)
) AS v(plan, n) WHERE plan_catalog.plan = v.plan AND NOT (coalesce(plan_catalog.limits, '{}'::jsonb) ? 'ai_studio_daily_credits');

-- Reserve a job and charge its credits in one step, under the workspace lock, so two people cannot spend the same credits.
-- p_allowance NULL means unlimited. Outcomes: ok, replay (same request key), credits (not enough), active (3 running), backstop (300 a day).
CREATE OR REPLACE FUNCTION reserve_ai_studio_job_v2(p_id text, p_user text, p_scope text, p_org text, p_key text, p_hash text, p_model text, p_kind text, p_prompt text, p_settings jsonb, p_source text, p_token text, p_cost integer, p_allowance integer)
RETURNS TABLE(job_id text, created boolean, outcome text, have integer) LANGUAGE plpgsql AS $$
DECLARE
  old_job ai_studio_jobs%ROWTYPE;
  today date := (now() AT TIME ZONE 'UTC')::date;
  used integer; daily_left integer; bonus integer; take_daily integer := 0; take_bonus integer := 0;
BEGIN
  INSERT INTO ai_studio_scope_locks(scope_key) VALUES (p_scope) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM ai_studio_scope_locks WHERE scope_key = p_scope FOR UPDATE;
  SELECT * INTO old_job FROM ai_studio_jobs WHERE user_id = p_user AND scope_key = p_scope AND request_key = p_key;
  IF FOUND THEN
    IF old_job.request_hash <> p_hash THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE = '22023'; END IF;
    RETURN QUERY SELECT old_job.id, false, 'replay'::text, 0; RETURN;
  END IF;
  IF (SELECT count(*) FROM ai_studio_jobs WHERE scope_key = p_scope AND created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) >= 300 THEN
    RETURN QUERY SELECT NULL::text, false, 'backstop'::text, 0; RETURN;
  END IF;
  IF (SELECT count(*) FROM ai_studio_jobs WHERE scope_key = p_scope AND user_id = p_user AND status IN ('submitting','queued','running','saving') AND created_at > now() - interval '2 hours') >= 3 THEN
    RETURN QUERY SELECT NULL::text, false, 'active'::text, 0; RETURN;
  END IF;
  IF p_allowance IS NULL THEN
    take_daily := p_cost;
  ELSE
    SELECT COALESCE(-sum(credits), 0) INTO used FROM ai_studio_credit_ledger WHERE scope_key = p_scope AND source = 'daily' AND day = today;
    daily_left := GREATEST(0, p_allowance - used);
    SELECT GREATEST(0, COALESCE(sum(credits), 0)) INTO bonus FROM ai_studio_credit_ledger WHERE scope_key = p_scope AND source = 'bonus';
    take_daily := LEAST(p_cost, daily_left);
    take_bonus := p_cost - take_daily;
    IF take_bonus > bonus THEN
      RETURN QUERY SELECT NULL::text, false, 'credits'::text, daily_left + bonus; RETURN;
    END IF;
  END IF;
  INSERT INTO ai_studio_jobs(id, user_id, scope_key, org_id, request_key, request_hash, model, kind, prompt, settings, status, source_asset_id, source_token_hash)
  VALUES (p_id, p_user, p_scope, p_org, p_key, p_hash, p_model, p_kind, p_prompt, p_settings, 'submitting', p_source, p_token);
  IF take_daily > 0 THEN
    INSERT INTO ai_studio_credit_ledger(scope_key, org_id, user_id, job_id, kind, credits, source, day, reason) VALUES (p_scope, p_org, p_user, p_id, 'spend', -take_daily, 'daily', today, p_model);
  END IF;
  IF take_bonus > 0 THEN
    INSERT INTO ai_studio_credit_ledger(scope_key, org_id, user_id, job_id, kind, credits, source, reason) VALUES (p_scope, p_org, p_user, p_id, 'spend', -take_bonus, 'bonus', p_model);
  END IF;
  RETURN QUERY SELECT p_id, true, 'ok'::text, 0;
END $$;
