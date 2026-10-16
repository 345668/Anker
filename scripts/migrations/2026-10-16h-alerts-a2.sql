-- Alerts A2 (docs/architecture/56): quiet hours and the morning digest, more rules. Additive.
ALTER TABLE alert_incidents ADD COLUMN IF NOT EXISTS held_at timestamptz;
ALTER TABLE alert_heartbeat ADD COLUMN IF NOT EXISTS digest_on date;
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'alert_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%opened%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE alert_events DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE alert_events ADD CONSTRAINT alert_events_kind_check CHECK (kind IN ('opened', 'seen', 'notified', 'reminded', 'acknowledged', 'note', 'resolved', 'reopened', 'muted', 'held', 'digest'));
END $$;
