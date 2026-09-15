-- Keep investor-update delivery failures retryable and prevent duplicate
-- recipient rows when a browser retries a send.
ALTER TABLE investor_updates DROP CONSTRAINT IF EXISTS investor_updates_status_check;
ALTER TABLE investor_updates ADD CONSTRAINT investor_updates_status_check
  CHECK (status IN ('draft', 'sending', 'partial', 'sent'));

ALTER TABLE investor_update_recipients ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent';
ALTER TABLE investor_update_recipients ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE investor_update_recipients DROP CONSTRAINT IF EXISTS investor_update_recipients_delivery_status_check;
ALTER TABLE investor_update_recipients ADD CONSTRAINT investor_update_recipients_delivery_status_check
  CHECK (delivery_status IN ('sent', 'failed', 'skipped'));

CREATE UNIQUE INDEX IF NOT EXISTS investor_update_recipients_email_idx
  ON investor_update_recipients (update_id, lower(email))
  WHERE email IS NOT NULL;
