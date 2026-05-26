-- Outreach campaigns + members + user-saved templates.
--
-- CRM → Outreach flow:
--   * In the CRM the user organizes investors / LPs into boards.
--   * From any board they bulk-select rows and "Send to outreach" — that
--     creates outreach_campaign_members rows linking the chosen
--     crm_entries to a campaign (existing or freshly created).
--   * The Outreach page lists campaigns; opening one shows the planned
--     investors with their full profile + a template library to bulk
--     draft against (built-in templates ship as code; user-saved
--     templates live in outreach_templates).

-- ─── outreach_campaigns ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  -- "draft" -> being built; "active" -> currently outreaching;
  -- "paused" -> on hold; "done" -> wrapped up.
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','done')),
  -- "email" / "linkedin" / "multi" (both).  Used as the default channel
  -- when bulk-drafting; per-member drafts can still mix channels.
  default_channel TEXT NOT NULL DEFAULT 'multi' CHECK (default_channel IN ('email','linkedin','multi')),
  -- Default template id (either a built-in id like "builtin:cold_intro_v1"
  -- or a uuid pointing at outreach_templates).  Stored as TEXT so we can
  -- mix the two namespaces without an FK.
  default_template_id TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outreach_campaigns_user_idx
  ON outreach_campaigns (user_id, archived);

-- ─── outreach_campaign_members ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_campaign_members (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id TEXT NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  crm_entry_id TEXT NOT NULL,
  -- planned -> just queued; drafted -> draft exists in outreach_messages;
  -- sent -> mark by user; skipped -> excluded from this campaign;
  -- replied -> reply landed (mirrors outreach_replies).
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','drafted','sent','skipped','replied')),
  -- Snapshot of the row when added — useful for audit but display still
  -- pulls live from crm_entries for freshness.
  snapshot JSONB,
  notes TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  drafted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One investor per campaign — re-adds are no-ops.
  UNIQUE (campaign_id, crm_entry_id)
);

CREATE INDEX IF NOT EXISTS outreach_campaign_members_user_idx
  ON outreach_campaign_members (user_id, status);
CREATE INDEX IF NOT EXISTS outreach_campaign_members_campaign_idx
  ON outreach_campaign_members (campaign_id);
CREATE INDEX IF NOT EXISTS outreach_campaign_members_crm_entry_idx
  ON outreach_campaign_members (crm_entry_id);

-- ─── outreach_templates (USER-SAVED templates) ─────────────────────────
-- Built-in templates ship as code under lib/outreach/builtin-templates.ts
-- and are referenced with a "builtin:<key>" id.  This table only stores
-- USER customs (and the user's edits / forks of built-ins).
CREATE TABLE IF NOT EXISTS outreach_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  -- "email" | "linkedin" | "multi" — restrictively typed via app code
  -- so we don't need a CHECK constraint here (future channels OK).
  channel TEXT NOT NULL DEFAULT 'email',
  subject_template TEXT,
  body_template TEXT NOT NULL,
  -- Detected variables (e.g. ["firstName","firmName","oneLiner"]).
  variables JSONB,
  -- For provenance when the user forked a built-in.
  forked_from TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outreach_templates_user_idx
  ON outreach_templates (user_id, archived);
