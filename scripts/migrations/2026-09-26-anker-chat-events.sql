-- Assistant conversations as an append-only event log.
-- Doc: docs/architecture/28-assistant-system-design.md §3, phase 3.
--
-- Until now a conversation was one jsonb blob on anker_chats.messages. That
-- cannot answer "what did the assistant do, in what order, and what was it about
-- to do when it died" — which matters more here than in a chat toy, because these
-- tools read and write investor records and send outreach.
--
-- The log makes intent durable BEFORE the work happens: the event saying "call
-- crm_update_stage with these arguments" is written before the call, so a crash
-- leaves something resumable and an approval gate has something concrete to hold
-- (doc 28 §5).
--
-- anker_chats.messages stays, derived from this log. It is the projection, not
-- the record, so nothing that reads it breaks during the transition.
--
-- DEVIATION from doc 28 §3.1, which specified `org_id` plus a generated
-- `scope_key`: phase 1 established that anker_chats carries `scope_key` directly,
-- written from the principal. Adding org_id here would mean two scoping patterns
-- in one feature, so scope_key is written directly and inherited from the parent
-- chat by trigger — which also makes it impossible for a child to disagree with
-- its parent.

CREATE TABLE IF NOT EXISTS anker_chat_events (
  id         bigserial PRIMARY KEY,
  chat_id    text NOT NULL REFERENCES anker_chats(id) ON DELETE CASCADE,
  scope_key  text,
  -- Position within the conversation. Unique per chat, so a concurrent writer
  -- collides rather than silently interleaving.
  seq        int NOT NULL,
  kind       text NOT NULL CHECK (kind IN (
    'chat.created','message.user','model.requested','model.completed',
    'tool.requested','tool.completed','tool.failed',
    'approval.granted','approval.denied','message.assistant','run.ended'
  )),
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Set on a tool.requested that needs a human (policy.ts BLOCKED). Cleared by a
  -- later approval.granted / approval.denied event, never by an UPDATE.
  awaiting   boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS anker_chat_events_seq_idx   ON anker_chat_events (chat_id, seq);
CREATE INDEX IF NOT EXISTS anker_chat_events_chat_idx         ON anker_chat_events (chat_id, id);
CREATE INDEX IF NOT EXISTS anker_chat_events_scope_idx        ON anker_chat_events (scope_key, created_at DESC);
-- Parked intents nobody ever approves are the failure mode of doc 28 §5, and
-- invisible without somewhere cheap to count them (§7).
CREATE INDEX IF NOT EXISTS anker_chat_events_awaiting_idx     ON anker_chat_events (scope_key) WHERE awaiting;

-- Inherit the parent's scope, so an event cannot claim a workspace its chat does
-- not belong to. Same guarantee check_crm_workspace_parent gives the CRM.
CREATE OR REPLACE FUNCTION anker_chat_event_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent text;
BEGIN
  SELECT scope_key INTO parent FROM anker_chats WHERE id = NEW.chat_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chat does not exist' USING ERRCODE='23503'; END IF;
  IF NEW.scope_key IS NOT NULL AND NEW.scope_key IS DISTINCT FROM parent THEN
    RAISE EXCEPTION 'Event scope does not match its conversation' USING ERRCODE='23514';
  END IF;
  NEW.scope_key := parent;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS anker_chat_event_scope_trg ON anker_chat_events;
CREATE TRIGGER anker_chat_event_scope_trg BEFORE INSERT ON anker_chat_events
  FOR EACH ROW EXECUTE FUNCTION anker_chat_event_scope();

-- Append-only, enforced in the database. A history that can be silently
-- rewritten is not evidence of anything — the same reason crm_activities is
-- append-only (doc 25 §4.3). A correction is a new event.
--
-- With ONE exception, which a blanket rule got wrong: deleting the conversation.
-- Append-only protects against *rewriting* history, not against a user deleting
-- their own chat — and DELETE /api/anker/chats/[id] is an existing, legitimate
-- action. A flat DELETE ban made it impossible: the cascade could not remove the
-- child events, so the parent delete failed and the user could never remove a
-- conversation again.
--
-- The discriminator is whether the parent still exists. During a cascade the
-- chat row is already gone, so the events are being removed *with* their
-- conversation. A DELETE while the chat is still there is someone editing
-- history, and stays refused.
CREATE OR REPLACE FUNCTION anker_chat_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM anker_chats WHERE id = OLD.chat_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'anker_chat_events is append-only; record a correcting event instead' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS anker_chat_events_no_update ON anker_chat_events;
CREATE TRIGGER anker_chat_events_no_update BEFORE UPDATE OR DELETE ON anker_chat_events
  FOR EACH ROW EXECUTE FUNCTION anker_chat_events_append_only();

-- ─── Backfill ───────────────────────────────────────────────────────────────
-- Every existing conversation becomes chat.created + one message event per turn,
-- in the order the blob holds them. Idempotent: a chat that already has events is
-- skipped, so re-running adds nothing.
INSERT INTO anker_chat_events (chat_id, scope_key, seq, kind, payload, created_by, created_at)
SELECT c.id,
       c.scope_key,
       0,
       'chat.created',
       jsonb_build_object('model', c.model, 'title', c.title, 'migrated', true),
       c.user_id,
       c.created_at
  FROM anker_chats c
 WHERE NOT EXISTS (SELECT 1 FROM anker_chat_events e WHERE e.chat_id = c.id);

INSERT INTO anker_chat_events (chat_id, scope_key, seq, kind, payload, created_by, created_at)
SELECT c.id,
       c.scope_key,
       m.ord::int,
       CASE WHEN m.value->>'role' = 'user' THEN 'message.user' ELSE 'message.assistant' END,
       jsonb_build_object('content', m.value->>'content', 'migrated', true),
       c.user_id,
       c.created_at
  FROM anker_chats c
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.messages) = 'array' THEN c.messages ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS m(value, ord)
 WHERE m.value->>'role' IN ('user','assistant')
   AND NOT EXISTS (
     SELECT 1 FROM anker_chat_events e WHERE e.chat_id = c.id AND e.seq = m.ord::int
   );
