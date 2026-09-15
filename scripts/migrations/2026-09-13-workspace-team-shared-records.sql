-- Apply after workspace-team-lifecycle and founder-workflow-integrity.
-- Creator IDs remain attribution. NULL org_id means an unmigrated private record.
ALTER TABLE crm_boards ADD COLUMN IF NOT EXISTS org_id text REFERENCES organizations(id);
ALTER TABLE crm_entries ADD COLUMN IF NOT EXISTS org_id text REFERENCES organizations(id);
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS org_id text REFERENCES organizations(id);
ALTER TABLE crm_saved_views ADD COLUMN IF NOT EXISTS org_id text REFERENCES organizations(id);
ALTER TABLE investor_updates ADD COLUMN IF NOT EXISTS org_id text REFERENCES organizations(id);

CREATE OR REPLACE FUNCTION workspace_record_access(p_actor text,p_org text,p_write boolean DEFAULT false,p_send boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.org_id
   WHERE m.user_id=p_actor AND m.org_id=p_org AND o.archived_at IS NULL
     AND m.persona=(CASE WHEN o.kind='company' THEN 'founder' ELSE 'vc' END)
     AND (NOT p_write OR m.org_role IN ('workspace_owner','admin','member'))
     AND (NOT p_send OR (m.can_send_outreach AND m.org_role IN ('workspace_owner','admin','member'))))
$$;
REVOKE ALL ON FUNCTION workspace_record_access(text,text,boolean,boolean) FROM PUBLIC;

-- A round is evidence of a board's workspace. Multiple conflicting links are
-- deliberately excluded; never infer ownership from the creator's active cookie.
WITH known AS (
 SELECT board_id,min(org_id) AS org_id FROM fundraising_rounds
 GROUP BY board_id HAVING count(DISTINCT org_id)=1
)
UPDATE crm_boards b SET org_id=k.org_id FROM known k
 WHERE b.id=k.board_id AND b.org_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM crm_entries e WHERE e.board_id=b.id
     AND (e.user_id IS DISTINCT FROM b.user_id OR (e.org_id IS NOT NULL AND e.org_id<>k.org_id)))
   AND NOT EXISTS (SELECT 1 FROM crm_tasks t JOIN crm_entries e ON e.id=t.crm_entry_id WHERE e.board_id=b.id
     AND (t.user_id IS DISTINCT FROM b.user_id OR (t.org_id IS NOT NULL AND t.org_id<>k.org_id)));
UPDATE crm_entries e SET org_id=b.org_id FROM crm_boards b
 WHERE e.board_id=b.id AND e.org_id IS NULL AND b.org_id IS NOT NULL AND e.user_id=b.user_id;
UPDATE crm_tasks t SET org_id=e.org_id FROM crm_entries e
 WHERE t.crm_entry_id=e.id AND t.org_id IS NULL AND e.org_id IS NOT NULL AND t.user_id=e.user_id;

-- Replace creator-based uniqueness for shared records. Historical duplicates are
-- retained with notes and links; the earliest row keeps the canonical identity.
DROP INDEX IF EXISTS crm_entries_import_identity_idx;
ALTER TABLE crm_entries DROP CONSTRAINT IF EXISTS crm_entries_user_id_source_firm_id_investor_id_key;
WITH ranked AS (
 SELECT id,row_number() OVER(PARTITION BY org_id,source,import_key ORDER BY added_at,id) n
 FROM crm_entries WHERE org_id IS NOT NULL AND import_key IS NOT NULL
)
UPDATE crm_entries e SET import_key=NULL FROM ranked r WHERE e.id=r.id AND r.n>1;
CREATE UNIQUE INDEX IF NOT EXISTS crm_entries_workspace_identity_idx ON crm_entries(org_id,source,import_key);
CREATE UNIQUE INDEX IF NOT EXISTS crm_entries_legacy_identity_idx ON crm_entries(user_id,source,import_key) WHERE org_id IS NULL;
-- Session identity remains private provenance; scope it by org for repeat imports.
DROP INDEX IF EXISTS crm_boards_user_session_uq;
CREATE UNIQUE INDEX IF NOT EXISTS crm_boards_workspace_session_idx ON crm_boards(org_id,source_session_id) WHERE source_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_boards_legacy_session_idx ON crm_boards(user_id,source_session_id) WHERE source_session_id IS NOT NULL AND org_id IS NULL;
CREATE INDEX IF NOT EXISTS crm_entries_workspace_idx ON crm_entries(org_id,board_id);
CREATE INDEX IF NOT EXISTS crm_tasks_workspace_idx ON crm_tasks(org_id,crm_entry_id);
CREATE INDEX IF NOT EXISTS crm_saved_views_workspace_idx ON crm_saved_views(org_id,user_id);
CREATE INDEX IF NOT EXISTS investor_updates_workspace_idx ON investor_updates(org_id,created_at DESC);
CREATE INDEX IF NOT EXISTS workspace_decks_workspace_idx ON workspace_decks(org_id,updated_at DESC);

-- Abort for manual review if historical rounds share a board in the same org.
CREATE UNIQUE INDEX IF NOT EXISTS fundraising_rounds_workspace_board_idx ON fundraising_rounds(org_id,board_id);

-- Parent links cannot cross tenants, even through a missed legacy integration.
CREATE OR REPLACE FUNCTION check_crm_workspace_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_org text;
BEGIN
 IF TG_TABLE_NAME='crm_entries' THEN
  IF NEW.board_id IS NULL THEN RETURN NEW; END IF;
   SELECT org_id INTO parent_org FROM crm_boards WHERE id=NEW.board_id;
   IF NOT FOUND OR NEW.org_id IS DISTINCT FROM parent_org THEN RAISE EXCEPTION 'Board does not belong to this workspace' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='crm_tasks' THEN
  IF NEW.crm_entry_id IS NULL THEN RETURN NEW; END IF;
   SELECT org_id INTO parent_org FROM crm_entries WHERE id=NEW.crm_entry_id;
   IF NOT FOUND OR NEW.org_id IS DISTINCT FROM parent_org THEN RAISE EXCEPTION 'Contact does not belong to this workspace' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='fundraising_rounds' THEN
   SELECT org_id INTO parent_org FROM crm_boards WHERE id=NEW.board_id;
   IF NOT FOUND OR NEW.org_id IS DISTINCT FROM parent_org THEN RAISE EXCEPTION 'Round board does not belong to this workspace' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_entry_workspace_parent ON crm_entries;
CREATE TRIGGER crm_entry_workspace_parent BEFORE INSERT OR UPDATE OF org_id,board_id ON crm_entries FOR EACH ROW EXECUTE FUNCTION check_crm_workspace_parent();
DROP TRIGGER IF EXISTS crm_task_workspace_parent ON crm_tasks;
CREATE TRIGGER crm_task_workspace_parent BEFORE INSERT OR UPDATE OF org_id,crm_entry_id ON crm_tasks FOR EACH ROW EXECUTE FUNCTION check_crm_workspace_parent();
DROP TRIGGER IF EXISTS round_workspace_parent ON fundraising_rounds;
CREATE TRIGGER round_workspace_parent BEFORE INSERT OR UPDATE OF org_id,board_id ON fundraising_rounds FOR EACH ROW EXECUTE FUNCTION check_crm_workspace_parent();

-- Explicit, atomic migration of a creator's legacy record. Membership and the
-- destination are locked and checked again inside the database. No merge/deletion.
CREATE OR REPLACE FUNCTION workspace_adopt_record(p_actor text,p_org text,p_kind text,p_id text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE o organizations%ROWTYPE; a memberships%ROWTYPE; count_rows integer;
BEGIN
 SELECT * INTO o FROM organizations WHERE id=p_org FOR UPDATE;
 SELECT * INTO a FROM memberships WHERE org_id=p_org AND user_id=p_actor;
 IF NOT FOUND OR o.archived_at IS NOT NULL OR a.org_role NOT IN ('workspace_owner','admin','member') OR
   a.persona IS DISTINCT FROM (CASE WHEN o.kind='company' THEN 'founder' ELSE 'vc' END) THEN
   RAISE EXCEPTION 'Workspace migration access denied' USING ERRCODE='42501'; END IF;
 IF p_kind='board' THEN
   PERFORM id FROM crm_boards WHERE id=p_id AND user_id=p_actor AND org_id IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Legacy board not found' USING ERRCODE='P0002'; END IF;
   IF EXISTS(SELECT 1 FROM fundraising_rounds WHERE board_id=p_id AND org_id<>p_org) OR
      EXISTS(SELECT 1 FROM crm_entries WHERE board_id=p_id AND (user_id IS DISTINCT FROM p_actor OR org_id IS NOT NULL)) OR
      EXISTS(SELECT 1 FROM crm_tasks t JOIN crm_entries e ON e.id=t.crm_entry_id WHERE e.board_id=p_id
        AND (t.user_id IS DISTINCT FROM p_actor OR t.org_id IS NOT NULL)) THEN
     RAISE EXCEPTION 'This board has conflicting ownership and needs review' USING ERRCODE='23505'; END IF;
   UPDATE crm_boards SET org_id=p_org,is_default=false WHERE id=p_id;
   -- Duplicate identity conflicts roll back the entire move for manual review.
   UPDATE crm_entries SET org_id=p_org WHERE board_id=p_id AND user_id=p_actor AND org_id IS NULL;
   UPDATE crm_tasks SET org_id=p_org WHERE user_id=p_actor AND org_id IS NULL AND crm_entry_id IN (SELECT id FROM crm_entries WHERE board_id=p_id);
 ELSIF p_kind='contact' THEN
   IF EXISTS(SELECT 1 FROM crm_tasks WHERE crm_entry_id=p_id AND (user_id IS DISTINCT FROM p_actor OR org_id IS NOT NULL)) THEN
     RAISE EXCEPTION 'This contact has conflicting task ownership and needs review' USING ERRCODE='23505'; END IF;
   UPDATE crm_entries SET org_id=p_org WHERE id=p_id AND user_id=p_actor AND org_id IS NULL AND board_id IS NULL;
   GET DIAGNOSTICS count_rows=ROW_COUNT;
   IF count_rows=0 THEN RAISE EXCEPTION 'Legacy unassigned contact not found' USING ERRCODE='P0002'; END IF;
   UPDATE crm_tasks SET org_id=p_org WHERE user_id=p_actor AND org_id IS NULL AND crm_entry_id=p_id;
 ELSIF p_kind='update' AND o.kind='company' THEN
   UPDATE investor_updates SET org_id=p_org WHERE id=p_id AND user_id=p_actor AND org_id IS NULL AND status<>'sending';
   GET DIAGNOSTICS count_rows=ROW_COUNT;
   IF count_rows=0 THEN RAISE EXCEPTION 'Legacy update not found or delivery is active' USING ERRCODE='P0002'; END IF;
 ELSE RAISE EXCEPTION 'Unsupported record type' USING ERRCODE='22023'; END IF;
 INSERT INTO workspace_access_events(org_id,actor_user_id,action,details)
 VALUES(p_org,p_actor,'adopt_legacy_record',jsonb_build_object('kind',p_kind,'recordId',p_id));
END $$;
REVOKE ALL ON FUNCTION workspace_adopt_record(text,text,text,text) FROM PUBLIC;

-- A shared contact can have separate private drafts from multiple teammates.
ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_crm_entry_id_kind_key;
CREATE UNIQUE INDEX IF NOT EXISTS outreach_messages_sender_contact_kind_idx ON outreach_messages(user_id,crm_entry_id,kind);
