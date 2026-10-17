-- The LP leg, slice L5 (docs/architecture/60 sections 4 and 8): an investor's optional account (created only from inside a code-verified portal session, which proves the address)
-- and the requests an investor makes of the fund. Additive.
CREATE TABLE IF NOT EXISTS lp_accounts (
  lp_id text PRIMARY KEY,
  fund_id text NOT NULL,
  user_id text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lp_accounts_email_idx ON lp_accounts (lower(email));

CREATE TABLE IF NOT EXISTS lp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id text NOT NULL,
  lp_id text NOT NULL,
  org_id text,                                  -- the workspace that owns the fund, when there is one (then the request is also a proposal in its inbox)
  kind text NOT NULL CHECK (kind IN ('redemption', 'transfer', 'details_change', 'other')),
  body text NOT NULL,                           -- the investor's own words, shown to the fund as text only
  source text NOT NULL DEFAULT 'form' CHECK (source IN ('form', 'assistant')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'seen', 'closed')),
  proposal_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS lp_requests_fund_idx ON lp_requests (fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lp_requests_lp_idx ON lp_requests (lp_id, created_at DESC);
