-- Alerts, incidents and runbooks (docs/architecture/56, slice A1). Additive. Facts only: nothing here holds a tenant's private records or personal data.
CREATE TABLE IF NOT EXISTS alert_rule_settings (
  rule_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  severity_override integer CHECK (severity_override IN (1, 2, 3)),
  threshold jsonb NOT NULL DEFAULT '{}'::jsonb,
  muted_until timestamptz,
  muted_reason text,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_incidents (
  id bigserial PRIMARY KEY,
  rule_key text NOT NULL,
  subject text NOT NULL,
  severity integer NOT NULL CHECK (severity IN (1, 2, 3)),
  -- pending: seen once (the flap guard); it opens on the second sighting, or at once for severity 1.
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'acknowledged', 'resolved')),
  summary text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  runbook text,
  opened_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  times_seen integer NOT NULL DEFAULT 1,
  clear_count integer NOT NULL DEFAULT 0,
  acknowledged_by text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,
  cause text,
  fix text,
  linked jsonb NOT NULL DEFAULT '{}'::jsonb,
  notified_at timestamptz,
  reminded_at timestamptz
);
-- At most one live incident per problem.
CREATE UNIQUE INDEX IF NOT EXISTS alert_incidents_live_uq ON alert_incidents (rule_key, subject) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS alert_incidents_status_idx ON alert_incidents (status, severity, opened_at DESC);
CREATE INDEX IF NOT EXISTS alert_incidents_resolved_idx ON alert_incidents (rule_key, subject, resolved_at DESC) WHERE status = 'resolved';

CREATE TABLE IF NOT EXISTS alert_events (
  id bigserial PRIMARY KEY,
  incident_id bigint NOT NULL REFERENCES alert_incidents(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('opened', 'seen', 'notified', 'reminded', 'acknowledged', 'note', 'resolved', 'reopened', 'muted')),
  channel text,
  ok boolean,
  actor text,
  detail text
);
CREATE INDEX IF NOT EXISTS alert_events_incident_idx ON alert_events (incident_id, at);

CREATE TABLE IF NOT EXISTS alert_heartbeat (
  id integer PRIMARY KEY CHECK (id = 1),
  last_run_at timestamptz,
  last_ok_at timestamptz,
  rules_evaluated integer NOT NULL DEFAULT 0,
  open_incidents integer NOT NULL DEFAULT 0,
  error text
);
INSERT INTO alert_heartbeat (id) VALUES (1) ON CONFLICT DO NOTHING;
