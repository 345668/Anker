-- LP control-plane: fundraise subscription funnel + per-LP information sharing.
-- Additive and idempotent. No semicolons inside comments (the runner splits on them).

-- Fundraise subscription status (the Carta funnel), kept SEPARATE from the LP
-- lifecycle status. Existing rows backfill to 'countersigned' via the default,
-- so nothing regresses.
ALTER TABLE fund_lps
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'countersigned'
  CHECK (subscription_status IN ('prospective', 'invited', 'signed', 'countersigned'));

CREATE INDEX IF NOT EXISTS fund_lps_subscription_idx ON fund_lps (fund_id, subscription_status);

-- Per-LP information sharing (the Carta disclosure matrix). One row per LP.
-- Defaults mirror the reference: an LP sees its own SOI and capital account,
-- but not fund-wide deal IRR or fund performance until explicitly shared.
CREATE TABLE IF NOT EXISTS lp_information_sharing (
  lp_id            text PRIMARY KEY REFERENCES fund_lps(id) ON DELETE CASCADE,
  fund_id          text NOT NULL,
  soi              boolean NOT NULL DEFAULT true,
  deal_irr         boolean NOT NULL DEFAULT false,
  fund_performance boolean NOT NULL DEFAULT false,
  cap_account      boolean NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lp_information_sharing_fund_idx ON lp_information_sharing (fund_id);
