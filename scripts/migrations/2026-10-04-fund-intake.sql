-- Fund inbound deal intake (docs/architecture/39). Additive.
CREATE TABLE IF NOT EXISTS fund_intake_configs (
  fund_id      text PRIMARY KEY,
  enabled      boolean NOT NULL DEFAULT false,
  headline     text,
  intro        text,
  thesis       text,
  instructions text,
  gates        jsonb NOT NULL DEFAULT '{}'::jsonb,
  rubric       jsonb NOT NULL DEFAULT '[]'::jsonb,
  thresholds   jsonb NOT NULL DEFAULT '{}'::jsonb,
  form         jsonb NOT NULL DEFAULT '{}'::jsonb,
  notify       jsonb NOT NULL DEFAULT '{}'::jsonb,
  version      integer NOT NULL DEFAULT 1,
  updated_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intake_submissions (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fund_id        text NOT NULL,
  public_ref     text NOT NULL,
  company_name   text NOT NULL,
  website        text,
  one_liner      text,
  contact_name   text NOT NULL,
  contact_email  text NOT NULL,
  answers        jsonb NOT NULL DEFAULT '{}'::jsonb,
  deck_url       text,
  status         text NOT NULL DEFAULT 'received' CHECK (status IN ('received','assessing','assessed','failed')),
  category       text CHECK (category IN ('passed','review','not_a_fit')),
  score          numeric,
  result         jsonb,
  config_version integer,
  deal_id        text,
  attempts       integer NOT NULL DEFAULT 0,
  last_error     text,
  ip_hash        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_intake_submissions_ref ON intake_submissions (public_ref);
CREATE INDEX IF NOT EXISTS intake_submissions_fund_idx ON intake_submissions (fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS intake_submissions_status_idx ON intake_submissions (status) WHERE status IN ('received','assessing');
