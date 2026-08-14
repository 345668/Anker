-- Phase 0 — persona persistence foundation + Platform Owner tier.
-- Additive & idempotent: safe to run against production without touching
-- existing rows/behavior. Onboarding writes persona + profile fields into the
-- existing `users` table (user_type / active_role / onboarding_completed / …).

-- ── Platform Owner tier ──────────────────────────────────────────────────
-- owner ⊃ admin. This flag only opens /dashboard/admin/* + submissions inbox +
-- aggregate views; owners remain firewalled from tenant private records at the
-- data-access layer (see docs §2.1). Also enforced in code via OWNER_EMAILS.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;
UPDATE users
  SET is_owner = true
  WHERE lower(email) IN ('masindetphilippe@gmail.com', 'vc@philippemasindet.com');

-- ── Workspace foundation (per-workspace personas, decision §12.1) ─────────
-- Seeded best-effort on onboarding completion; consumed by routing/nav in the
-- next phases. Unused by existing pages, so additive-safe today.
CREATE TABLE IF NOT EXISTS organizations (
  id            text PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('company','fund')),
  name          text NOT NULL,
  slug          text UNIQUE,
  fund_id       text,          -- set when kind='fund' (→ existing funds row)
  owner_user_id text,          -- set when kind='company' (the founder)
  verified      boolean DEFAULT false,
  settings      jsonb DEFAULT '{}'::jsonb,
  created_by    text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id                text PRIMARY KEY,
  user_id           text NOT NULL,
  org_id            text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  org_role          text NOT NULL CHECK (org_role IN ('workspace_owner','admin','member','viewer')),
  persona           text CHECK (persona IN ('founder','vc')),
  can_send_outreach boolean NOT NULL DEFAULT false,  -- per-member send switch (§12.3)
  created_at        timestamptz DEFAULT now(),
  UNIQUE (user_id, org_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id);
