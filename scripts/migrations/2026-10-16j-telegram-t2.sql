-- Telegram channel T2 (docs/architecture/57): notification preferences and a record of which proposals were already shown in the chat. Additive.
CREATE TABLE IF NOT EXISTS telegram_prefs (
  link_id text PRIMARY KEY REFERENCES telegram_links(id) ON DELETE CASCADE,
  org_id text NOT NULL,
  -- Opt-in, each off until the person turns it on in Anker.
  approvals boolean NOT NULL DEFAULT false,
  replies boolean NOT NULL DEFAULT false,
  deadlines boolean NOT NULL DEFAULT false,
  quiet_start integer NOT NULL DEFAULT 22 CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end integer NOT NULL DEFAULT 7 CHECK (quiet_end BETWEEN 0 AND 23),
  tz text NOT NULL DEFAULT 'Europe/Berlin',
  -- Watermarks: what has already been told, so nothing old is repeated and nothing is lost over a quiet night.
  last_approvals_at timestamptz NOT NULL DEFAULT now(),
  last_replies_at timestamptz NOT NULL DEFAULT now(),
  last_deadlines_on date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telegram_shown (
  link_id text NOT NULL,
  org_id text NOT NULL,
  proposal_id text NOT NULL,
  shown_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, proposal_id)
);
