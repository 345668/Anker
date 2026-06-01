-- Layer 3 of the 8fundraising loop: outreach_messages.
--
-- One row per generated message (4 per partner: day 0/3/7/14).  The
-- queue worker / human approval gate flips `status` from draft → queued
-- → sent.  HeyReach (or whatever delivery automation we wire) reports
-- back via `delivery_provider_id` + `delivery_provider`.
--
-- Rate limits enforced in code (lib/outreach/rate-limit.ts):
--   25 connection requests / day  (kind = 'connection_request')
--   50 follow-up DMs / day        (kind in {'follow_up','different_angle','close_loop'})
--   weekday-only sends            (Mon-Fri local time)
--
-- See playbook §5 for rationale.

CREATE TABLE IF NOT EXISTS outreach_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  -- Pointer to the CRM row this message belongs to
  crm_entry_id TEXT NOT NULL REFERENCES crm_entries(id) ON DELETE CASCADE,
  -- Which step in the 4-step sequence
  kind TEXT NOT NULL CHECK (kind IN ('connection_request','follow_up','different_angle','close_loop')),
  step_number SMALLINT NOT NULL CHECK (step_number BETWEEN 0 AND 14),
  -- Channel
  channel TEXT NOT NULL DEFAULT 'linkedin' CHECK (channel IN ('linkedin','email','other')),
  -- Content
  body TEXT NOT NULL,
  hook_post_text TEXT,         -- the recent post we hooked off (day 0 only)
  hook_post_url TEXT,
  char_count INT GENERATED ALWAYS AS (length(body)) STORED,
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','approved','queued','sent','delivered','failed','cancelled','replied','accepted')),
  -- Scheduling
  scheduled_for TIMESTAMPTZ,   -- when the rate-limiter says we can fire
  sent_at TIMESTAMPTZ,         -- actual send timestamp
  delivered_at TIMESTAMPTZ,
  failed_reason TEXT,
  -- Delivery provider (HeyReach push id, Gmail draft id, etc.)
  delivery_provider TEXT,
  delivery_provider_id TEXT,
  -- AI provenance
  generated_by TEXT,            -- 'ollama:gemma2:2b' / 'anthropic:claude-sonnet-4-6' / 'manual'
  model_notes TEXT,
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Each (crm_entry_id, kind) is unique — re-running the personalizer
  -- updates the body in place rather than spawning duplicates.
  UNIQUE (crm_entry_id, kind)
);

CREATE INDEX IF NOT EXISTS outreach_messages_user_status_idx
  ON outreach_messages (user_id, status);
CREATE INDEX IF NOT EXISTS outreach_messages_scheduled_idx
  ON outreach_messages (status, scheduled_for)
  WHERE status IN ('queued','approved');
CREATE INDEX IF NOT EXISTS outreach_messages_crm_entry_idx
  ON outreach_messages (crm_entry_id);

-- One row per inbound reply we've classified.  Linked back to the
-- original message so the UI can show the threaded view.
CREATE TABLE IF NOT EXISTS outreach_replies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  crm_entry_id TEXT NOT NULL REFERENCES crm_entries(id) ON DELETE CASCADE,
  in_reply_to_message_id TEXT REFERENCES outreach_messages(id) ON DELETE SET NULL,
  inbound_text TEXT NOT NULL,
  classification TEXT,           -- INTERESTED / INTERESTED_LATER / WRONG_FIT / WRONG_NOW / QUESTION
  draft_response TEXT,
  recommended_stage TEXT,
  reengage_on DATE,
  approved BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  generated_by TEXT,
  notes TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outreach_replies_user_idx
  ON outreach_replies (user_id);
CREATE INDEX IF NOT EXISTS outreach_replies_crm_entry_idx
  ON outreach_replies (crm_entry_id);
CREATE INDEX IF NOT EXISTS outreach_replies_class_idx
  ON outreach_replies (classification);
