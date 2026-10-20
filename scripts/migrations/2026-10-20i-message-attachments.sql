-- Attachments in messages (docs/architecture/72). Additive; relaxes the message text rule so a message may be attachments only. Files are encrypted by the application.
ALTER TABLE relationship_messages DROP CONSTRAINT IF EXISTS relationship_messages_body_check;
ALTER TABLE relationship_messages ADD CONSTRAINT relationship_messages_body_len_check CHECK (char_length(body) <= 4000);
CREATE TABLE IF NOT EXISTS relationship_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES relationship_messages(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES fund_relationships(id) ON DELETE CASCADE,
  fund_id text NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  content_enc bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS relationship_attachments_msg_idx ON relationship_attachments (message_id);
CREATE INDEX IF NOT EXISTS relationship_attachments_rel_idx ON relationship_attachments (relationship_id);
