-- Anker schema baseline, 2026-10-23. SCHEMA ONLY: no rows, no secrets. Generated from production by scripts/db/make-baseline.mjs (docs/architecture/59 section 4, 75).
-- Dropped as platform-owned: SCHEMA _system; EXTENSION pg_session_jwt; COMMENT EXTENSION pg_session_jwt; SCHEMA pgrst; FUNCTION pre_config(); TABLE replit_database_migrations_v1; SEQUENCE replit_database_migrations_v1_id_seq; SEQUENCE OWNED BY replit_database_migrations_v1_id_seq; DEFAULT replit_database_migrations_v1 id; CONSTRAINT replit_database_migrations_v1 replit_database_migrations_v1_pkey; INDEX idx_replit_database_migrations_v1_build_id.
-- Migrations applied in production when this was taken: 180 (db/baseline/2026-10-23.ledger.json). Migrations not in that list are applied on top by scripts/db/build-local.mjs.

--
-- PostgreSQL database dump
--



-- Dumped from database version 17.11 (fcae950)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: anker_chat_event_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anker_chat_event_scope() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: anker_chat_events_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anker_chat_events_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM anker_chats WHERE id = OLD.chat_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'anker_chat_events is append-only; record a correcting event instead' USING ERRCODE='23514';
END $$;


--
-- Name: check_crm_entity_parent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_crm_entity_parent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE parent_org text;
BEGIN
  IF TG_TABLE_NAME='crm_people' THEN
    IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
    SELECT org_id INTO parent_org FROM crm_companies WHERE id=NEW.company_id;
    IF NOT FOUND OR NEW.org_id IS DISTINCT FROM parent_org THEN
      RAISE EXCEPTION 'Company does not belong to this workspace' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='crm_deals' THEN
    IF NEW.company_id IS NOT NULL THEN
      SELECT org_id INTO parent_org FROM crm_companies WHERE id=NEW.company_id;
      IF NOT FOUND OR NEW.org_id IS DISTINCT FROM parent_org THEN
        RAISE EXCEPTION 'Company does not belong to this workspace' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.person_id IS NOT NULL THEN
      SELECT org_id INTO parent_org FROM crm_people WHERE id=NEW.person_id;
      IF NOT FOUND OR NEW.org_id IS DISTINCT FROM parent_org THEN
        RAISE EXCEPTION 'Contact does not belong to this workspace' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.board_id IS NOT NULL THEN
      SELECT org_id INTO parent_org FROM crm_boards WHERE id=NEW.board_id;
      IF NOT FOUND OR NEW.org_id IS DISTINCT FROM parent_org THEN
        RAISE EXCEPTION 'Board does not belong to this workspace' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: check_crm_workspace_parent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_crm_workspace_parent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: crm_activities_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_activities_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'crm_activities is append-only; record a correcting entry instead' USING ERRCODE='23514';
END $$;


--
-- Name: crm_split(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_split(p_persona text) RETURNS TABLE(companies_added integer, people_added integer, deals_added integer, activities_added integer, findings_added integer)
    LANGUAGE plpgsql
    AS $$
DECLARE c integer; p integer; d integer; a integer; f integer; t integer;
BEGIN
  IF p_persona NOT IN ('founder','vc') THEN
    RAISE EXCEPTION 'Unsupported persona %; LP has no workspace until doc 01', p_persona USING ERRCODE='22023';
  END IF;

  INSERT INTO crm_companies (org_id, firm_id, name, location, kind, created_by)
  SELECT DISTINCT ON (pl.org_id, pl.company_identity)
         pl.org_id, pl.firm_id,
         COALESCE(NULLIF(btrim(fm.name),''),
                  CASE WHEN pl.kind = 'company' THEN NULLIF(btrim(pl.display_name),'') END,
                  'Unnamed firm'),
         CASE WHEN pl.kind = 'company' THEN pl.display_location END,
         CASE WHEN pl.kind = 'company' THEN pl.display_type END,
         pl.user_id
    FROM crm_migration_plan pl
    LEFT JOIN investment_firms fm ON fm.id = pl.firm_id
   WHERE pl.persona = p_persona AND pl.company_identity IS NOT NULL
   ORDER BY pl.org_id, pl.company_identity, pl.added_at
      ON CONFLICT (org_id, identity) DO NOTHING;
  GET DIAGNOSTICS c = ROW_COUNT;

  INSERT INTO crm_people (org_id, company_id, investor_id, name, title, email, linkedin, location, created_by)
  SELECT DISTINCT ON (pl.org_id, pl.person_identity)
         pl.org_id, cc.id, pl.investor_id,
         COALESCE(NULLIF(btrim(pl.display_name),''), 'Unnamed contact'),
         pl.display_title, pl.display_email, pl.display_linkedin, pl.display_location,
         pl.user_id
    FROM crm_migration_plan pl
    LEFT JOIN crm_companies cc ON cc.org_id = pl.org_id AND cc.identity = pl.company_identity
   WHERE pl.persona = p_persona AND pl.person_identity IS NOT NULL
   ORDER BY pl.org_id, pl.person_identity, pl.added_at
      ON CONFLICT (org_id, identity) DO NOTHING;
  GET DIAGNOSTICS p = ROW_COUNT;

  INSERT INTO crm_deals (
    org_id, company_id, person_id, board_id, stage, score, tier, why_match,
    notes, owner, tags, source, source_session_id, migrated_from_entry_id,
    added_at, last_contacted_at, created_by
  )
  SELECT pl.org_id, cc.id, cp.id, pl.board_id,
         COALESCE(pl.target_stage, 'queued'),
         pl.display_score, pl.display_tier, pl.why_match,
         pl.notes, pl.owner, COALESCE(pl.tags, '{}'),
         pl.source, pl.source_session_id, pl.entry_id,
         COALESCE(pl.added_at, now()), pl.last_contacted_at, pl.user_id
    FROM crm_migration_plan pl
    LEFT JOIN crm_companies cc ON cc.org_id = pl.org_id AND cc.identity = pl.company_identity
    LEFT JOIN crm_people    cp ON cp.org_id = pl.org_id AND cp.identity = pl.person_identity
   WHERE pl.persona = p_persona
      ON CONFLICT (migrated_from_entry_id) WHERE migrated_from_entry_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS d = ROW_COUNT;

  INSERT INTO crm_activities (org_id, kind, subject_type, subject_id, subject, body, metadata, occurred_at, created_by)
  SELECT dl.org_id, 'note', 'deal', dl.id, 'Research summary', pl.research_summary,
         jsonb_build_object('migrated', true, 'url', pl.research_url),
         COALESCE(pl.research_at, pl.added_at, now()), pl.user_id
    FROM crm_migration_plan pl
    JOIN crm_deals dl ON dl.migrated_from_entry_id = pl.entry_id
   WHERE pl.persona = p_persona
     AND NULLIF(btrim(COALESCE(pl.research_summary,'')),'') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM crm_activities av
                      WHERE av.subject_type='deal' AND av.subject_id=dl.id
                        AND av.metadata->>'migrated'='true');
  GET DIAGNOSTICS a = ROW_COUNT;

  f := 0;

  INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
  SELECT 'crm_split:'||p_persona, pl.org_id, pl.entry_id, 'unmappable_stage',
         format('stage %L is not canonical and has no alias; deal created at queued', pl.raw_stage)
    FROM crm_migration_plan pl
   WHERE pl.persona = p_persona AND pl.canonical IS NULL
     AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                      WHERE r.entry_id = pl.entry_id AND r.finding = 'unmappable_stage');
  GET DIAGNOSTICS t = ROW_COUNT; f := f + t;

  INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
  SELECT 'crm_split:'||p_persona, pl.org_id, pl.entry_id, 'folded_stage',
         format('%L → %L: %s', pl.raw_stage, pl.target_stage, pl.note)
    FROM crm_migration_plan pl
   WHERE pl.persona = p_persona AND pl.note IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                      WHERE r.entry_id = pl.entry_id AND r.finding = 'folded_stage');
  GET DIAGNOSTICS t = ROW_COUNT; f := f + t;

  INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
  SELECT 'crm_split:'||p_persona, pl.org_id, pl.entry_id, 'ambiguous_entry_kind',
         format('no firm_id or investor_id; classified as %s from display fields', pl.kind)
    FROM crm_migration_plan pl
   WHERE pl.persona = p_persona AND pl.ambiguous
     AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                      WHERE r.entry_id = pl.entry_id AND r.finding = 'ambiguous_entry_kind');
  GET DIAGNOSTICS t = ROW_COUNT; f := f + t;

  INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
  SELECT 'crm_split:'||p_persona, pl.org_id, pl.entry_id, 'company_name_unresolved',
         format('firm_id %L is not in investment_firms; company left as Unnamed firm', pl.firm_id)
    FROM crm_migration_plan pl
    JOIN crm_companies cc ON cc.org_id = pl.org_id AND cc.identity = pl.company_identity
   WHERE pl.persona = p_persona AND pl.firm_id IS NOT NULL AND cc.name = 'Unnamed firm'
     AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                      WHERE r.entry_id = pl.entry_id AND r.finding = 'company_name_unresolved');
  GET DIAGNOSTICS t = ROW_COUNT; f := f + t;

  INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
  SELECT 'crm_split:'||p_persona, dl.org_id, dl.migrated_from_entry_id, 'person_without_company',
         format('contact %L migrated with no company', pe.name)
    FROM crm_deals dl
    JOIN crm_people pe ON pe.id = dl.person_id
    JOIN crm_migration_plan pl ON pl.entry_id = dl.migrated_from_entry_id
   WHERE pl.persona = p_persona AND dl.company_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                      WHERE r.entry_id = dl.migrated_from_entry_id AND r.finding = 'person_without_company');
  GET DIAGNOSTICS t = ROW_COUNT; f := f + t;

  RETURN QUERY SELECT c, p, d, a, f;
END $$;


--
-- Name: reserve_ai_studio_job(text, text, text, text, text, text, text, text, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_ai_studio_job(p_id text, p_user text, p_scope text, p_org text, p_key text, p_hash text, p_model text, p_kind text, p_prompt text, p_settings jsonb, p_source text, p_token text) RETURNS TABLE(job_id text, created boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE old_job ai_studio_jobs%ROWTYPE;
BEGIN
 INSERT INTO ai_studio_scope_locks(scope_key) VALUES(p_scope) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM ai_studio_scope_locks WHERE scope_key=p_scope FOR UPDATE;
 SELECT * INTO old_job FROM ai_studio_jobs WHERE user_id=p_user AND scope_key=p_scope AND request_key=p_key;
 IF FOUND THEN
  IF old_job.request_hash<>p_hash THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE='22023';END IF;
  RETURN QUERY SELECT old_job.id,false;RETURN;
 END IF;
 IF (SELECT count(*) FROM ai_studio_jobs WHERE scope_key=p_scope AND created_at>=date_trunc('day',now()))>=30
 OR (SELECT count(*) FROM ai_studio_jobs WHERE scope_key=p_scope AND user_id=p_user AND created_at>=date_trunc('day',now()))>=20
 OR (SELECT count(*) FROM ai_studio_jobs WHERE scope_key=p_scope AND user_id=p_user AND status IN ('submitting','queued','running','saving') AND created_at>now()-interval '2 hours')>=3
 THEN RAISE EXCEPTION 'Media generation limit reached' USING ERRCODE='54000';END IF;
 INSERT INTO ai_studio_jobs(id,user_id,scope_key,org_id,request_key,request_hash,model,kind,prompt,settings,status,source_asset_id,source_token_hash)
 VALUES(p_id,p_user,p_scope,p_org,p_key,p_hash,p_model,p_kind,p_prompt,p_settings,'submitting',p_source,p_token);
 RETURN QUERY SELECT p_id,true;
END $$;


--
-- Name: reserve_ai_studio_job_v2(text, text, text, text, text, text, text, text, text, jsonb, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_ai_studio_job_v2(p_id text, p_user text, p_scope text, p_org text, p_key text, p_hash text, p_model text, p_kind text, p_prompt text, p_settings jsonb, p_source text, p_token text, p_cost integer, p_allowance integer) RETURNS TABLE(job_id text, created boolean, outcome text, have integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  old_job ai_studio_jobs%ROWTYPE;
  today date := (now() AT TIME ZONE 'UTC')::date;
  used integer; daily_left integer; bonus integer; take_daily integer := 0; take_bonus integer := 0;
BEGIN
  INSERT INTO ai_studio_scope_locks(scope_key) VALUES (p_scope) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM ai_studio_scope_locks WHERE scope_key = p_scope FOR UPDATE;
  SELECT * INTO old_job FROM ai_studio_jobs WHERE user_id = p_user AND scope_key = p_scope AND request_key = p_key;
  IF FOUND THEN
    IF old_job.request_hash <> p_hash THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE = '22023'; END IF;
    RETURN QUERY SELECT old_job.id, false, 'replay'::text, 0; RETURN;
  END IF;
  IF (SELECT count(*) FROM ai_studio_jobs WHERE scope_key = p_scope AND created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) >= 300 THEN
    RETURN QUERY SELECT NULL::text, false, 'backstop'::text, 0; RETURN;
  END IF;
  IF (SELECT count(*) FROM ai_studio_jobs WHERE scope_key = p_scope AND user_id = p_user AND status IN ('submitting','queued','running','saving') AND created_at > now() - interval '2 hours') >= 3 THEN
    RETURN QUERY SELECT NULL::text, false, 'active'::text, 0; RETURN;
  END IF;
  IF p_allowance IS NULL THEN
    take_daily := p_cost;
  ELSE
    SELECT COALESCE(-sum(credits), 0) INTO used FROM ai_studio_credit_ledger WHERE scope_key = p_scope AND source = 'daily' AND day = today;
    daily_left := GREATEST(0, p_allowance - used);
    SELECT GREATEST(0, COALESCE(sum(credits), 0)) INTO bonus FROM ai_studio_credit_ledger WHERE scope_key = p_scope AND source = 'bonus';
    take_daily := LEAST(p_cost, daily_left);
    take_bonus := p_cost - take_daily;
    IF take_bonus > bonus THEN
      RETURN QUERY SELECT NULL::text, false, 'credits'::text, daily_left + bonus; RETURN;
    END IF;
  END IF;
  INSERT INTO ai_studio_jobs(id, user_id, scope_key, org_id, request_key, request_hash, model, kind, prompt, settings, status, source_asset_id, source_token_hash)
  VALUES (p_id, p_user, p_scope, p_org, p_key, p_hash, p_model, p_kind, p_prompt, p_settings, 'submitting', p_source, p_token);
  IF take_daily > 0 THEN
    INSERT INTO ai_studio_credit_ledger(scope_key, org_id, user_id, job_id, kind, credits, source, day, reason) VALUES (p_scope, p_org, p_user, p_id, 'spend', -take_daily, 'daily', today, p_model);
  END IF;
  IF take_bonus > 0 THEN
    INSERT INTO ai_studio_credit_ledger(scope_key, org_id, user_id, job_id, kind, credits, source, reason) VALUES (p_scope, p_org, p_user, p_id, 'spend', -take_bonus, 'bonus', p_model);
  END IF;
  RETURN QUERY SELECT p_id, true, 'ok'::text, 0;
END $$;


--
-- Name: set_crm_import_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_crm_import_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.source IN ('founder_matching', 'lp_matching') THEN
    NEW.import_key := CASE WHEN NEW.investor_id IS NOT NULL THEN 'contact:' || NEW.investor_id
      WHEN NEW.firm_id IS NOT NULL THEN 'firm:' || NEW.firm_id ELSE NULL END;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: sync_matching_fund_legacy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_matching_fund_legacy() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 NEW := jsonb_populate_record(NEW, jsonb_build_object('fund_name', NEW.name,
 'target_fund_size', NEW.target_raise, 'target_sectors', NEW.sectors, 'target_geographies', NEW.geographic_focus));
 RETURN NEW;
END $$;


--
-- Name: workspace_accept_invitation(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workspace_accept_invitation(p_actor text, p_verified_email text, p_hash text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE inv workspace_invitations%ROWTYPE; o organizations%ROWTYPE; inviter memberships%ROWTYPE; member memberships%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM workspace_invitations WHERE token_hash=p_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation is invalid or unavailable' USING ERRCODE='P0002'; END IF;
  SELECT * INTO o FROM organizations WHERE id=inv.org_id FOR UPDATE;
  SELECT * INTO inv FROM workspace_invitations WHERE token_hash=p_hash;
  IF lower(p_verified_email) IS DISTINCT FROM lower(inv.email) OR p_verified_email IS NULL THEN RAISE EXCEPTION 'Sign in with the verified email this invitation was sent to' USING ERRCODE='42501'; END IF;
  IF o.archived_at IS NOT NULL THEN RAISE EXCEPTION 'This workspace is archived' USING ERRCODE='42501'; END IF;
  IF inv.status='accepted' AND inv.accepted_by=p_actor THEN
    IF EXISTS(SELECT 1 FROM memberships WHERE org_id=o.id AND user_id=p_actor) THEN RETURN o.id; END IF;
    RAISE EXCEPTION 'Your membership was removed. Request a new invitation.' USING ERRCODE='42501';
  END IF;
  IF inv.status<>'pending' OR inv.expires_at<=now() THEN RAISE EXCEPTION 'Invitation expired or was revoked. Request a new link.' USING ERRCODE='42501'; END IF;
  SELECT * INTO inviter FROM memberships WHERE org_id=o.id AND user_id=inv.invited_by;
  IF NOT FOUND OR inviter.org_role NOT IN ('workspace_owner','admin') OR
    (inv.role='admin' AND (inviter.org_role<>'workspace_owner' OR inv.invited_by<>o.owner_user_id)) THEN
    RAISE EXCEPTION 'The inviter no longer has permission. Request a new invitation.' USING ERRCODE='42501'; END IF;
  SELECT * INTO member FROM memberships WHERE org_id=o.id AND user_id=p_actor;
  IF FOUND THEN RAISE EXCEPTION 'You already belong to this workspace. Ask the owner to change your existing role.' USING ERRCODE='23505'; END IF;
  INSERT INTO memberships(id,user_id,org_id,org_role,persona,can_send_outreach,contact_email)
  VALUES(gen_random_uuid()::text,p_actor,o.id,inv.role,CASE WHEN o.kind='company' THEN 'founder' ELSE 'vc' END,inv.can_send_outreach,p_verified_email);
  UPDATE workspace_invitations SET status='accepted',accepted_by=p_actor,accepted_at=now() WHERE id=inv.id;
  UPDATE organizations SET team_revision=team_revision+1 WHERE id=o.id;
  INSERT INTO workspace_access_events(org_id,actor_user_id,action,target_user_id,details)
  VALUES(o.id,p_actor,'accept_invitation',p_actor,jsonb_build_object('invitationId',inv.id,'role',inv.role));
  RETURN o.id;
END $$;


--
-- Name: workspace_adopt_record(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workspace_adopt_record(p_actor text, p_org text, p_kind text, p_id text) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: workspace_record_access(text, text, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workspace_record_access(p_actor text, p_org text, p_write boolean DEFAULT false, p_send boolean DEFAULT false) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
 SELECT EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.org_id
   WHERE m.user_id=p_actor AND m.org_id=p_org AND o.archived_at IS NULL
     AND m.persona=(CASE WHEN o.kind='company' THEN 'founder' ELSE 'vc' END)
     AND (NOT p_write OR m.org_role IN ('workspace_owner','admin','member'))
     AND (NOT p_send OR (m.can_send_outreach AND m.org_role IN ('workspace_owner','admin','member'))))
$$;


--
-- Name: workspace_team_action(text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workspace_team_action(p_actor text, p_org text, p_action text, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE o organizations%ROWTYPE; a memberships%ROWTYPE; t memberships%ROWTYPE;
  inv workspace_invitations%ROWTYPE; tr workspace_ownership_transfers%ROWTYPE;
  is_owner boolean; new_role text; target text; event_details jsonb := '{}'; result jsonb := '{}';
BEGIN
  SELECT * INTO o FROM organizations WHERE id=p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO a FROM memberships WHERE org_id=p_org AND user_id=p_actor;
  IF NOT FOUND OR a.persona IS DISTINCT FROM (CASE WHEN o.kind='company' THEN 'founder' ELSE 'vc' END) THEN
    RAISE EXCEPTION 'Workspace team access denied' USING ERRCODE='42501'; END IF;
  is_owner := coalesce(o.owner_user_id=p_actor AND a.org_role='workspace_owner',false);
  IF o.archived_at IS NOT NULL AND p_action<>'restore' THEN RAISE EXCEPTION 'Restore this workspace before changing its team' USING ERRCODE='42501'; END IF;
  IF (p_data->>'revision')::integer IS DISTINCT FROM o.team_revision THEN RAISE EXCEPTION 'The team changed. Reload before continuing.' USING ERRCODE='40001'; END IF;

  IF p_action='invite' THEN
    IF NOT is_owner AND a.org_role<>'admin' THEN RAISE EXCEPTION 'Only owners and admins can invite teammates' USING ERRCODE='42501'; END IF;
    new_role := p_data->>'role';
    IF new_role NOT IN ('admin','member','viewer') OR new_role IS NULL OR (new_role='admin' AND NOT is_owner) THEN
      RAISE EXCEPTION 'You cannot grant this role' USING ERRCODE='42501'; END IF;
    IF coalesce((p_data->>'canSendOutreach')::boolean,false) AND (NOT is_owner OR new_role='viewer') THEN
      RAISE EXCEPTION 'Only the owner can grant sending permission to editors' USING ERRCODE='42501'; END IF;
    IF EXISTS(SELECT 1 FROM memberships WHERE org_id=p_org AND lower(contact_email)=lower(p_data->>'email')) THEN
      RAISE EXCEPTION 'This email already belongs to a teammate' USING ERRCODE='23505'; END IF;
    UPDATE workspace_invitations SET status='revoked' WHERE org_id=p_org AND lower(email)=lower(p_data->>'email') AND status='pending';
    INSERT INTO workspace_invitations(org_id,email,role,can_send_outreach,token_hash,invited_by,delivery_status)
    VALUES(p_org,lower(p_data->>'email'),new_role,coalesce((p_data->>'canSendOutreach')::boolean,false),p_data->>'tokenHash',p_actor,coalesce(p_data->>'delivery','link')) RETURNING * INTO inv;
    result := jsonb_build_object('invitationId',inv.id,'expiresAt',inv.expires_at);
    event_details := jsonb_build_object('invitationId',inv.id,'email',inv.email,'role',new_role);
  ELSIF p_action='revoke_invitation' THEN
    SELECT * INTO inv FROM workspace_invitations WHERE id=(p_data->>'invitationId')::uuid AND org_id=p_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='P0002'; END IF;
    IF NOT is_owner AND (a.org_role<>'admin' OR inv.role='admin') THEN RAISE EXCEPTION 'You cannot revoke this invitation' USING ERRCODE='42501'; END IF;
    UPDATE workspace_invitations SET status='revoked' WHERE id=inv.id AND status='pending';
    event_details := jsonb_build_object('invitationId',inv.id);
  ELSIF p_action='set_sending' THEN
    IF NOT is_owner THEN RAISE EXCEPTION 'Only the owner can change their sending permission' USING ERRCODE='42501'; END IF;
    UPDATE memberships SET can_send_outreach=(p_data->>'canSendOutreach')::boolean WHERE id=a.id;
    target := p_actor;
    event_details := jsonb_build_object('canSendOutreach',(p_data->>'canSendOutreach')::boolean);
  ELSIF p_action IN ('change_role','remove_member','leave') THEN
    target := CASE WHEN p_action='leave' THEN p_actor ELSE p_data->>'userId' END;
    SELECT * INTO t FROM memberships WHERE org_id=p_org AND user_id=target;
    IF NOT FOUND THEN RAISE EXCEPTION 'Teammate not found' USING ERRCODE='P0002'; END IF;
    IF t.persona IS DISTINCT FROM a.persona THEN RAISE EXCEPTION 'Manage this membership through its persona-specific access workflow' USING ERRCODE='42501'; END IF;
    IF target=o.owner_user_id OR t.org_role='workspace_owner' THEN RAISE EXCEPTION 'Transfer ownership before removing or demoting an owner' USING ERRCODE='42501'; END IF;
    IF p_action<>'leave' AND NOT is_owner AND (a.org_role<>'admin' OR t.org_role NOT IN ('member','viewer')) THEN
      RAISE EXCEPTION 'You cannot manage this teammate' USING ERRCODE='42501'; END IF;
    IF p_action='change_role' THEN
      new_role := p_data->>'role';
      IF new_role NOT IN ('admin','member','viewer') OR new_role IS NULL OR (new_role='admin' AND NOT is_owner) THEN RAISE EXCEPTION 'You cannot grant this role' USING ERRCODE='42501'; END IF;
      IF p_data ? 'canSendOutreach' AND NOT is_owner THEN RAISE EXCEPTION 'Only the owner can change sending permission' USING ERRCODE='42501'; END IF;
      UPDATE memberships SET org_role=new_role, can_send_outreach=CASE WHEN new_role='viewer' THEN false ELSE coalesce((p_data->>'canSendOutreach')::boolean,can_send_outreach) END WHERE id=t.id;
      IF new_role IN ('member','viewer') THEN UPDATE workspace_invitations SET status='revoked' WHERE org_id=p_org AND invited_by=target AND status='pending'; END IF;
      event_details := jsonb_build_object('fromRole',t.org_role,'toRole',new_role,'canSendOutreach',CASE WHEN new_role='viewer' THEN false ELSE coalesce((p_data->>'canSendOutreach')::boolean,t.can_send_outreach) END);
    ELSE
      DELETE FROM memberships WHERE id=t.id;
      UPDATE workspace_invitations SET status='revoked' WHERE org_id=p_org AND invited_by=target AND status='pending';
      event_details := jsonb_build_object('formerRole',t.org_role);
    END IF;
    UPDATE workspace_ownership_transfers SET status='cancelled',resolved_at=now() WHERE org_id=p_org AND to_user_id=target AND status='pending';
  ELSIF p_action='start_transfer' THEN
    IF NOT is_owner THEN RAISE EXCEPTION 'Only the current owner can transfer ownership' USING ERRCODE='42501'; END IF;
    target := p_data->>'userId';
    SELECT * INTO t FROM memberships WHERE org_id=p_org AND user_id=target;
    IF NOT FOUND OR target=p_actor OR t.org_role NOT IN ('admin','member') OR t.persona IS DISTINCT FROM a.persona THEN
      RAISE EXCEPTION 'Choose an existing admin or member in this workspace' USING ERRCODE='42501'; END IF;
    UPDATE workspace_ownership_transfers SET status='cancelled',resolved_at=now() WHERE org_id=p_org AND status='pending';
    INSERT INTO workspace_ownership_transfers(org_id,from_user_id,to_user_id) VALUES(p_org,p_actor,target) RETURNING * INTO tr;
    result := jsonb_build_object('transferId',tr.id,'expiresAt',tr.expires_at);
  ELSIF p_action IN ('accept_transfer','cancel_transfer') THEN
    SELECT * INTO tr FROM workspace_ownership_transfers WHERE org_id=p_org AND id=(p_data->>'transferId')::uuid;
    IF NOT FOUND OR tr.status<>'pending' THEN RAISE EXCEPTION 'Transfer is no longer pending' USING ERRCODE='40001'; END IF;
    target := tr.to_user_id;
    IF p_action='cancel_transfer' THEN
      IF NOT is_owner AND p_actor<>target THEN RAISE EXCEPTION 'You cannot cancel this transfer' USING ERRCODE='42501'; END IF;
      UPDATE workspace_ownership_transfers SET status='cancelled',resolved_at=now() WHERE id=tr.id;
    ELSE
      IF p_actor<>target OR tr.expires_at<=now() OR o.owner_user_id<>tr.from_user_id OR a.org_role NOT IN ('admin','member') THEN
        RAISE EXCEPTION 'This transfer cannot be accepted. Ask the current owner to start again.' USING ERRCODE='42501'; END IF;
      UPDATE memberships SET org_role=CASE WHEN user_id=p_actor THEN 'workspace_owner' ELSE 'admin' END,
        can_send_outreach=CASE WHEN user_id=p_actor THEN true ELSE can_send_outreach END
        WHERE org_id=p_org AND user_id IN (p_actor,tr.from_user_id);
      UPDATE organizations SET owner_user_id=p_actor WHERE id=p_org;
      UPDATE workspace_ownership_transfers SET status='accepted',resolved_at=now() WHERE id=tr.id;
      UPDATE workspace_invitations SET status='revoked' WHERE org_id=p_org AND status='pending';
      event_details := jsonb_build_object('previousOwner',tr.from_user_id,'newOwner',target,'previousOwnerRole','admin');
    END IF;
  ELSIF p_action IN ('archive','restore') THEN
    IF NOT is_owner THEN RAISE EXCEPTION 'Only the owner can archive or restore a workspace' USING ERRCODE='42501'; END IF;
    UPDATE organizations SET archived_at=CASE WHEN p_action='archive' THEN now() ELSE NULL END WHERE id=p_org;
    IF p_action='archive' THEN
      UPDATE workspace_invitations SET status='revoked' WHERE org_id=p_org AND status='pending';
      UPDATE workspace_ownership_transfers SET status='cancelled',resolved_at=now() WHERE org_id=p_org AND status='pending';
    END IF;
  ELSE RAISE EXCEPTION 'Unknown team action' USING ERRCODE='22023';
  END IF;
  UPDATE organizations SET team_revision=team_revision+1 WHERE id=p_org;
  INSERT INTO workspace_access_events(org_id,actor_user_id,action,target_user_id,details) VALUES(p_org,p_actor,p_action,target,event_details);
  RETURN result || jsonb_build_object('ok',true,'revision',o.team_revision+1);
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accelerated_match_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accelerated_match_jobs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    founder_id character varying NOT NULL,
    startup_id character varying,
    pitch_deck_url character varying,
    status character varying DEFAULT 'pending'::character varying,
    progress integer DEFAULT 0,
    current_step character varying,
    extracted_data jsonb,
    enriched_team jsonb,
    match_results jsonb,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone
);


--
-- Name: action_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_proposals (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    persona text,
    requested_by text NOT NULL,
    capability text NOT NULL,
    input jsonb DEFAULT '{}'::jsonb NOT NULL,
    summary text NOT NULL,
    diff jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    risk_class text NOT NULL,
    run_id text,
    chat_id text,
    source_trust text DEFAULT 'trusted'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_by text,
    decided_at timestamp with time zone,
    applied_at timestamp with time zone,
    undone_at timestamp with time zone,
    undo jsonb,
    failure text,
    auto_committed boolean DEFAULT false NOT NULL,
    idempotency_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
    agent_id text,
    execution_id text,
    CONSTRAINT action_proposals_risk_class_check CHECK ((risk_class = ANY (ARRAY['R0'::text, 'R1'::text, 'R2'::text, 'R3'::text]))),
    CONSTRAINT action_proposals_source_trust_check CHECK ((source_trust = ANY (ARRAY['trusted'::text, 'untrusted'::text]))),
    CONSTRAINT action_proposals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'applied'::text, 'rejected'::text, 'undone'::text, 'expired'::text, 'failed'::text])))
);


--
-- Name: agent_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_executions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    agent_id text NOT NULL,
    agent_version integer DEFAULT 1 NOT NULL,
    trigger text NOT NULL,
    mode text DEFAULT 'live'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    period_key text,
    requested_by text,
    plan jsonb DEFAULT '[]'::jsonb NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    output jsonb,
    error text,
    spend_usd numeric DEFAULT 0 NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    heartbeat_at timestamp with time zone,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_executions_mode_check CHECK ((mode = ANY (ARRAY['live'::text, 'dry_run'::text]))),
    CONSTRAINT agent_executions_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'killed'::text, 'budget_stopped'::text]))),
    CONSTRAINT agent_executions_trigger_check CHECK ((trigger = ANY (ARRAY['schedule'::text, 'manual'::text, 'event'::text])))
);


--
-- Name: crm_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_entries (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text,
    source text NOT NULL,
    source_session_id text,
    firm_id text,
    investor_id text,
    display_name text NOT NULL,
    display_title text,
    display_email text,
    display_linkedin text,
    display_location text,
    display_type text,
    display_score integer,
    display_tier text,
    why_match text,
    stage text DEFAULT 'queued'::text NOT NULL,
    notes text,
    owner text,
    added_at timestamp with time zone DEFAULT now(),
    last_contacted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    embedding public.vector(768),
    embedding_model text,
    embedding_built_at timestamp with time zone,
    twenty_company_id text,
    twenty_person_id text,
    twenty_opportunity_id text,
    twenty_opportunity_url text,
    twenty_last_synced_at timestamp with time zone,
    twenty_sync_error text,
    board_id text,
    research_summary text,
    research_url text,
    research_at timestamp with time zone,
    linkedin_data jsonb,
    linkedin_data_at timestamp with time zone,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    check_size numeric(14,2),
    import_key text,
    org_id text,
    scope_key text GENERATED ALWAYS AS (('org:'::text || org_id)) STORED,
    CONSTRAINT crm_entries_source_check CHECK ((source = ANY (ARRAY['lp_matching'::text, 'founder_matching'::text, 'manual'::text, 'discover'::text])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id text NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    slug text,
    fund_id text,
    owner_user_id text,
    verified boolean DEFAULT false,
    settings jsonb DEFAULT '{}'::jsonb,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    archived_at timestamp with time zone,
    team_revision integer DEFAULT 0 NOT NULL,
    CONSTRAINT organizations_kind_check CHECK ((kind = ANY (ARRAY['company'::text, 'fund'::text])))
);


--
-- Name: outreach_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_messages (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text,
    crm_entry_id text NOT NULL,
    kind text NOT NULL,
    step_number smallint NOT NULL,
    channel text DEFAULT 'linkedin'::text NOT NULL,
    body text NOT NULL,
    hook_post_text text,
    hook_post_url text,
    char_count integer GENERATED ALWAYS AS (length(body)) STORED,
    status text DEFAULT 'draft'::text NOT NULL,
    scheduled_for timestamp with time zone,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    failed_reason text,
    delivery_provider text,
    delivery_provider_id text,
    generated_by text,
    model_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    subject text,
    email_from text,
    email_to text,
    email_message_id text,
    email_thread_id text,
    reply_to_message_id text,
    tracking_id text,
    opens integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    last_opened_at timestamp with time zone,
    last_clicked_at timestamp with time zone,
    resend_id text,
    needs_followup boolean DEFAULT false NOT NULL,
    followup_due_at timestamp with time zone,
    last_resend_sync_at timestamp with time zone,
    resend_last_event text,
    bounced_at timestamp with time zone,
    complained_at timestamp with time zone,
    call_id text,
    CONSTRAINT outreach_messages_channel_check CHECK ((channel = ANY (ARRAY['linkedin'::text, 'email'::text, 'other'::text]))),
    CONSTRAINT outreach_messages_kind_check CHECK ((kind = ANY (ARRAY['connection_request'::text, 'follow_up'::text, 'different_angle'::text, 'close_loop'::text, 'email_intro'::text, 'dm_intro'::text, 'reply'::text, 'reengage'::text, 'schedule'::text]))),
    CONSTRAINT outreach_messages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'queued'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text, 'replied'::text, 'accepted'::text]))),
    CONSTRAINT outreach_messages_step_number_check CHECK (((step_number >= 0) AND (step_number <= 14)))
);


--
-- Name: outreach_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_replies (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text,
    crm_entry_id text NOT NULL,
    in_reply_to_message_id text,
    inbound_text text NOT NULL,
    classification text,
    draft_response text,
    recommended_stage text,
    reengage_on date,
    approved boolean DEFAULT false,
    sent_at timestamp with time zone,
    generated_by text,
    notes text,
    received_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    provider text,
    provider_message_id text,
    classified_at timestamp with time zone
);


--
-- Name: send_authorizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.send_authorizations (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    sender_user_id text NOT NULL,
    provider text NOT NULL,
    account_id text,
    source text NOT NULL,
    proposal_id text,
    approved_by text NOT NULL,
    approved_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    digest text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    revoked_by text,
    revoked_at timestamp with time zone,
    revoke_reason text,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT send_authorizations_provider_check CHECK ((provider = ANY (ARRAY['resend'::text, 'gmail'::text, 'linkedin'::text]))),
    CONSTRAINT send_authorizations_source_check CHECK ((source = ANY (ARRAY['manual_single'::text, 'manual_batch'::text, 'proposal'::text, 'reply'::text, 'platform_wave'::text, 'direct'::text, 'investor_update'::text, 'linkedin'::text]))),
    CONSTRAINT send_authorizations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text, 'completed'::text])))
);


--
-- Name: send_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.send_items (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    authorization_id text NOT NULL,
    org_id text NOT NULL,
    message_id text NOT NULL,
    crm_entry_id text,
    recipients jsonb NOT NULL,
    recipient_country text,
    content_hash text NOT NULL,
    send_after timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'approved'::text NOT NULL,
    reason text,
    idempotency_key text NOT NULL,
    provider_id text,
    provider_message_id text,
    attempts integer DEFAULT 0 NOT NULL,
    claimed_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT send_items_status_check CHECK ((status = ANY (ARRAY['approved'::text, 'sending'::text, 'sent'::text, 'blocked'::text, 'skipped'::text, 'failed'::text, 'revoked'::text, 'expired'::text, 'unknown'::text])))
);


--
-- Name: activation_by_workspace; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.activation_by_workspace AS
 SELECT o.id AS org_id,
    o.name,
    o.kind,
    o.created_at AS workspace_created_at,
    c.first_at AS first_contact_at,
    COALESCE(c.n, (0)::bigint) AS contacts,
    m.drafted_at AS first_draft_at,
    m.sent_at AS first_message_sent_at,
    a.first_at AS first_authorization_at,
    s.first_at AS first_send_at,
    COALESCE(s.n, (0)::bigint) AS items_sent,
    r.first_at AS first_reply_at,
    p.first_at AS first_proposal_decided_at,
    COALESCE(p.n, (0)::bigint) AS proposals_decided,
    g.first_at AS first_agent_run_at,
    COALESCE(g.n, (0)::bigint) AS agent_runs,
    GREATEST(o.created_at, c.last_at, m.last_at, a.last_at, s.last_at, r.last_at, p.last_at, g.last_at) AS last_activity_at,
        CASE
            WHEN (r.first_at IS NOT NULL) THEN 'reply_received'::text
            WHEN ((s.first_at IS NOT NULL) OR (m.sent_at IS NOT NULL)) THEN 'email_sent'::text
            WHEN (a.first_at IS NOT NULL) THEN 'send_authorized'::text
            WHEN (m.drafted_at IS NOT NULL) THEN 'outreach_drafted'::text
            WHEN (c.first_at IS NOT NULL) THEN 'contacts_added'::text
            ELSE 'workspace_created'::text
        END AS furthest
   FROM (((((((public.organizations o
     LEFT JOIN LATERAL ( SELECT min(crm_entries.added_at) AS first_at,
            max(crm_entries.added_at) AS last_at,
            count(*) AS n
           FROM public.crm_entries
          WHERE (crm_entries.org_id = o.id)) c ON (true))
     LEFT JOIN LATERAL ( SELECT min(x.created_at) AS drafted_at,
            max(x.created_at) AS last_at,
            min(x.sent_at) FILTER (WHERE (x.status = ANY (ARRAY['sent'::text, 'delivered'::text, 'replied'::text, 'accepted'::text]))) AS sent_at
           FROM (public.outreach_messages x
             JOIN public.crm_entries e ON ((e.id = x.crm_entry_id)))
          WHERE (e.org_id = o.id)) m ON (true))
     LEFT JOIN LATERAL ( SELECT min(send_authorizations.approved_at) AS first_at,
            max(send_authorizations.approved_at) AS last_at
           FROM public.send_authorizations
          WHERE (send_authorizations.org_id = o.id)) a ON (true))
     LEFT JOIN LATERAL ( SELECT min(send_items.sent_at) AS first_at,
            max(send_items.sent_at) AS last_at,
            count(*) AS n
           FROM public.send_items
          WHERE ((send_items.org_id = o.id) AND (send_items.status = 'sent'::text))) s ON (true))
     LEFT JOIN LATERAL ( SELECT min(COALESCE(x.received_at, x.created_at)) AS first_at,
            max(COALESCE(x.received_at, x.created_at)) AS last_at
           FROM (public.outreach_replies x
             JOIN public.crm_entries e ON ((e.id = x.crm_entry_id)))
          WHERE (e.org_id = o.id)) r ON (true))
     LEFT JOIN LATERAL ( SELECT min(action_proposals.decided_at) AS first_at,
            max(action_proposals.decided_at) AS last_at,
            count(*) AS n
           FROM public.action_proposals
          WHERE ((action_proposals.org_id = o.id) AND (action_proposals.decided_at IS NOT NULL) AND (action_proposals.status = ANY (ARRAY['approved'::text, 'applied'::text, 'undone'::text, 'rejected'::text])))) p ON (true))
     LEFT JOIN LATERAL ( SELECT min(agent_executions.finished_at) AS first_at,
            max(agent_executions.finished_at) AS last_at,
            count(*) AS n
           FROM public.agent_executions
          WHERE ((agent_executions.org_id = o.id) AND (agent_executions.status = 'completed'::text))) g ON (true))
  WHERE (o.archived_at IS NULL);


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text,
    type text,
    title text,
    description text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    action character varying NOT NULL,
    entity_type character varying NOT NULL,
    entity_id character varying,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address character varying,
    user_agent character varying,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: agent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_events (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    kind text NOT NULL,
    subject_id text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    crm_entry_id text NOT NULL,
    user_id text,
    mode text NOT NULL,
    trigger text DEFAULT 'manual'::text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL,
    final_stage text,
    error text,
    started_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_runs_mode_check CHECK ((mode = ANY (ARRAY['auto'::text, 'research-only'::text, 'draft-only'::text, 'tick'::text]))),
    CONSTRAINT agent_runs_trigger_check CHECK ((trigger = ANY (ARRAY['manual'::text, 'tick'::text, 'schedule'::text, 'api'::text])))
);


--
-- Name: agent_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_settings (
    org_id text NOT NULL,
    agent_id text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_calls (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    task text,
    provider text NOT NULL,
    model text,
    attempt smallint DEFAULT 0 NOT NULL,
    ok boolean NOT NULL,
    error text,
    http_status integer,
    duration_ms integer,
    prompt_tokens integer,
    output_tokens integer,
    workspace_id text,
    actor_email text,
    actor_id text,
    persona text,
    resolution text,
    requested_model text,
    streamed boolean DEFAULT false NOT NULL,
    run_id text,
    cost_usd numeric(12,6),
    cost_state text,
    cost_center text,
    CONSTRAINT ai_calls_cost_state_check CHECK ((cost_state = ANY (ARRAY['exact'::text, 'estimated'::text, 'unpriced'::text, 'none'::text])))
);


--
-- Name: ai_calls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_calls_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_calls_id_seq OWNED BY public.ai_calls.id;


--
-- Name: ai_media_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_media_tasks (
    task_id text NOT NULL,
    user_id text NOT NULL,
    scope_key text NOT NULL,
    model text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_processing_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_processing_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    operation_type character varying NOT NULL,
    status character varying DEFAULT 'running'::character varying,
    user_id character varying,
    related_entity_type character varying,
    related_entity_id character varying,
    provider character varying DEFAULT 'mistral'::character varying,
    model character varying,
    tokens_used integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    error_message text,
    cancellation_requested_at timestamp without time zone,
    cancelled_by character varying,
    started_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: ai_studio_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_studio_artifacts (
    id text NOT NULL,
    pipeline_id text NOT NULL,
    stage_ord integer NOT NULL,
    kind text NOT NULL,
    pathname text NOT NULL,
    content_type text NOT NULL,
    bytes integer NOT NULL,
    sha256 text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_studio_artifacts_bytes_check CHECK ((bytes > 0))
);


--
-- Name: ai_studio_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_studio_assets (
    id text NOT NULL,
    user_id text NOT NULL,
    scope_key text NOT NULL,
    job_id text,
    kind text NOT NULL,
    pathname text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    bytes integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_ms integer,
    CONSTRAINT ai_studio_assets_bytes_check CHECK ((bytes > 0)),
    CONSTRAINT ai_studio_assets_kind_check CHECK ((kind = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text])))
);


--
-- Name: ai_studio_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_studio_consents (
    id text NOT NULL,
    user_id text NOT NULL,
    scope_key text NOT NULL,
    org_id text,
    statement_version text NOT NULL,
    source_sha256 text NOT NULL,
    reference_sha256 text[] DEFAULT '{}'::text[] NOT NULL,
    subjects text NOT NULL,
    voice_altered boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_studio_consents_subjects_check CHECK ((length(btrim(subjects)) >= 3))
);


--
-- Name: ai_studio_credit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_studio_credit_ledger (
    id bigint NOT NULL,
    scope_key text NOT NULL,
    org_id text,
    user_id text,
    job_id text,
    kind text NOT NULL,
    credits integer NOT NULL,
    source text NOT NULL,
    day date,
    reason text,
    actor text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_studio_credit_ledger_kind_check CHECK ((kind = ANY (ARRAY['spend'::text, 'refund'::text, 'grant'::text, 'revoke'::text, 'adjust'::text]))),
    CONSTRAINT ai_studio_credit_ledger_source_check CHECK ((source = ANY (ARRAY['daily'::text, 'bonus'::text])))
);


--
-- Name: ai_studio_credit_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_studio_credit_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_studio_credit_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_studio_credit_ledger_id_seq OWNED BY public.ai_studio_credit_ledger.id;


--
-- Name: ai_studio_credit_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_studio_credit_rates (
    model text NOT NULL,
    resolution text DEFAULT '*'::text NOT NULL,
    unit text NOT NULL,
    credits integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_studio_credit_rates_credits_check CHECK ((credits > 0)),
    CONSTRAINT ai_studio_credit_rates_unit_check CHECK ((unit = ANY (ARRAY['job'::text, 'second'::text])))
);


--
-- Name: ai_studio_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_studio_jobs (
    id text NOT NULL,
    user_id text NOT NULL,
    scope_key text NOT NULL,
    org_id text,
    request_key text NOT NULL,
    request_hash text NOT NULL,
    model text NOT NULL,
    kind text NOT NULL,
    prompt text NOT NULL,
    settings jsonb NOT NULL,
    status text NOT NULL,
    provider_id text,
    source_asset_id text,
    source_token_hash text,
    error text,
    favorite boolean DEFAULT false NOT NULL,
    lease_until timestamp with time zone,
    lease_token text,
    next_poll_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    audio_asset_id text,
    audio_token_hash text,
    provider text DEFAULT 'dashscope'::text NOT NULL,
    recipe_id text,
    recipe_version integer,
    CONSTRAINT ai_studio_jobs_kind_check CHECK ((kind = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT ai_studio_jobs_status_check CHECK ((status = ANY (ARRAY['submitting'::text, 'queued'::text, 'running'::text, 'saving'::text, 'completed'::text, 'failed'::text, 'blocked'::text, 'canceled'::text, 'uncertain'::text])))
);


--
-- Name: ai_studio_pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_studio_pipelines (
    id text NOT NULL,
    user_id text NOT NULL,
    scope_key text NOT NULL,
    org_id text,
    recipe_id text NOT NULL,
    recipe_version integer NOT NULL,
    request_key text NOT NULL,
    consent_id text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_studio_pipelines_status_check CHECK ((status = ANY (ARRAY['running'::text, 'awaiting_review'::text, 'failed'::text, 'canceled'::text, 'completed'::text])))
);


--
-- Name: ai_studio_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_studio_reviews (
    id text NOT NULL,
    pipeline_id text NOT NULL,
    gate text NOT NULL,
    artifact_set_hash text NOT NULL,
    approved boolean NOT NULL,
    note text,
    reviewer text NOT NULL,
    reviewed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_studio_reviews_gate_check CHECK ((gate = ANY (ARRAY['input'::text, 'final'::text])))
);


--
-- Name: ai_studio_scope_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_studio_scope_locks (
    scope_key text NOT NULL
);


--
-- Name: ai_studio_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_studio_stages (
    pipeline_id text NOT NULL,
    ord integer NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    job_id text,
    error text,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    CONSTRAINT ai_studio_stages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: ai_subprocessors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_subprocessors (
    slug text NOT NULL,
    provider text NOT NULL,
    role text NOT NULL,
    purpose text NOT NULL,
    region text DEFAULT 'unknown'::text NOT NULL,
    region_basis text DEFAULT 'inferred'::text NOT NULL,
    data_classes text[] DEFAULT '{}'::text[] NOT NULL,
    dpa_status text DEFAULT 'unverified'::text NOT NULL,
    training_opt_out text DEFAULT 'unverified'::text NOT NULL,
    retention text,
    terms_url text,
    last_verified date,
    active boolean DEFAULT true NOT NULL,
    public boolean DEFAULT true NOT NULL,
    notes text,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_subprocessors_dpa_status_check CHECK ((dpa_status = ANY (ARRAY['unverified'::text, 'requested'::text, 'signed'::text]))),
    CONSTRAINT ai_subprocessors_region_basis_check CHECK ((region_basis = ANY (ARRAY['inferred'::text, 'confirmed'::text]))),
    CONSTRAINT ai_subprocessors_region_check CHECK ((region = ANY (ARRAY['eu'::text, 'us'::text, 'sg'::text, 'self'::text, 'other'::text, 'unknown'::text]))),
    CONSTRAINT ai_subprocessors_role_check CHECK ((role = ANY (ARRAY['ai_model'::text, 'hosting'::text, 'database'::text, 'storage'::text, 'email'::text, 'payments'::text, 'auth'::text, 'self_hosted'::text, 'messaging'::text]))),
    CONSTRAINT ai_subprocessors_training_opt_out_check CHECK ((training_opt_out = ANY (ARRAY['unverified'::text, 'yes'::text, 'no'::text])))
);


--
-- Name: alert_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_events (
    id bigint NOT NULL,
    incident_id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    channel text,
    ok boolean,
    actor text,
    detail text,
    CONSTRAINT alert_events_kind_check CHECK ((kind = ANY (ARRAY['opened'::text, 'seen'::text, 'notified'::text, 'reminded'::text, 'acknowledged'::text, 'note'::text, 'resolved'::text, 'reopened'::text, 'muted'::text, 'held'::text, 'digest'::text])))
);


--
-- Name: alert_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_events_id_seq OWNED BY public.alert_events.id;


--
-- Name: alert_heartbeat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_heartbeat (
    id integer NOT NULL,
    last_run_at timestamp with time zone,
    last_ok_at timestamp with time zone,
    rules_evaluated integer DEFAULT 0 NOT NULL,
    open_incidents integer DEFAULT 0 NOT NULL,
    error text,
    digest_on date,
    CONSTRAINT alert_heartbeat_id_check CHECK ((id = 1))
);


--
-- Name: alert_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_incidents (
    id bigint NOT NULL,
    rule_key text NOT NULL,
    subject text NOT NULL,
    severity integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    summary text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    runbook text,
    opened_at timestamp with time zone,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    times_seen integer DEFAULT 1 NOT NULL,
    clear_count integer DEFAULT 0 NOT NULL,
    acknowledged_by text,
    acknowledged_at timestamp with time zone,
    resolved_at timestamp with time zone,
    resolved_by text,
    cause text,
    fix text,
    linked jsonb DEFAULT '{}'::jsonb NOT NULL,
    notified_at timestamp with time zone,
    reminded_at timestamp with time zone,
    held_at timestamp with time zone,
    CONSTRAINT alert_incidents_severity_check CHECK ((severity = ANY (ARRAY[1, 2, 3]))),
    CONSTRAINT alert_incidents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'open'::text, 'acknowledged'::text, 'resolved'::text])))
);


--
-- Name: alert_incidents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_incidents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_incidents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_incidents_id_seq OWNED BY public.alert_incidents.id;


--
-- Name: alert_rule_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_rule_settings (
    rule_key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    severity_override integer,
    threshold jsonb DEFAULT '{}'::jsonb NOT NULL,
    muted_until timestamp with time zone,
    muted_reason text,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alert_rule_settings_severity_override_check CHECK ((severity_override = ANY (ARRAY[1, 2, 3])))
);


--
-- Name: anker_chat_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anker_chat_events (
    id bigint NOT NULL,
    chat_id text NOT NULL,
    scope_key text,
    seq integer NOT NULL,
    kind text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    awaiting boolean DEFAULT false NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT anker_chat_events_kind_check CHECK ((kind = ANY (ARRAY['chat.created'::text, 'message.user'::text, 'model.requested'::text, 'model.completed'::text, 'tool.requested'::text, 'tool.completed'::text, 'tool.failed'::text, 'approval.granted'::text, 'approval.denied'::text, 'message.assistant'::text, 'run.ended'::text])))
);


--
-- Name: anker_chat_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.anker_chat_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: anker_chat_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.anker_chat_events_id_seq OWNED BY public.anker_chat_events.id;


--
-- Name: anker_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anker_chats (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    title text DEFAULT 'New chat'::text NOT NULL,
    model text,
    messages jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scope_key text,
    revision integer DEFAULT 0 NOT NULL
);


--
-- Name: archived_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archived_contacts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    original_id character varying,
    merged_into_id character varying,
    owner_id character varying,
    type character varying,
    first_name character varying NOT NULL,
    last_name character varying,
    email character varying,
    phone character varying,
    company character varying,
    title character varying,
    linkedin_url character varying,
    twitter_url character varying,
    website character varying,
    location character varying,
    notes text,
    tags jsonb DEFAULT '[]'::jsonb,
    source character varying,
    archive_reason character varying,
    field_count integer,
    archived_at timestamp without time zone DEFAULT now(),
    archived_by character varying
);


--
-- Name: archived_investment_firms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archived_investment_firms (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    original_id character varying,
    merged_into_id character varying,
    name character varying NOT NULL,
    description text,
    website character varying,
    logo character varying,
    type character varying,
    aum character varying,
    location character varying,
    hq_location character varying,
    stages jsonb DEFAULT '[]'::jsonb,
    sectors jsonb DEFAULT '[]'::jsonb,
    industry character varying,
    check_size_min integer,
    check_size_max integer,
    portfolio_count integer,
    linkedin_url character varying,
    twitter_url character varying,
    emails jsonb,
    phones jsonb,
    addresses jsonb,
    urls jsonb,
    funding_raised character varying,
    last_funding_date character varying,
    foundation_year character varying,
    employee_range character varying,
    status character varying,
    folk_id character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb DEFAULT '[]'::jsonb,
    folk_updated_at timestamp without time zone,
    folk_custom_fields jsonb,
    source character varying,
    archive_reason character varying,
    field_count integer,
    archived_at timestamp without time zone DEFAULT now(),
    archived_by character varying
);


--
-- Name: archived_investors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archived_investors (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    original_id character varying,
    merged_into_id character varying,
    firm_id character varying,
    first_name character varying NOT NULL,
    last_name character varying,
    email character varying,
    phone character varying,
    title character varying,
    linkedin_url character varying,
    twitter_url character varying,
    bio text,
    location character varying,
    stages jsonb DEFAULT '[]'::jsonb,
    sectors jsonb DEFAULT '[]'::jsonb,
    check_size_min integer,
    check_size_max integer,
    investor_type character varying,
    deal_count integer,
    average_deal_size integer,
    folk_id character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb DEFAULT '[]'::jsonb,
    folk_updated_at timestamp without time zone,
    folk_custom_fields jsonb,
    source character varying,
    archive_reason character varying,
    field_count integer,
    archived_at timestamp without time zone DEFAULT now(),
    archived_by character varying
);


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_events (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    actor_id text,
    actor_email text,
    action text NOT NULL,
    target_type text,
    target_id text,
    target_label text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scope_key text,
    changes jsonb
);


--
-- Name: background_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.background_jobs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    type character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    user_id character varying,
    entity_id character varying,
    entity_type character varying,
    payload jsonb,
    result jsonb,
    progress integer DEFAULT 0,
    progress_message text,
    error_message text,
    priority integer DEFAULT 0,
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 3,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: batch_enrichment_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batch_enrichment_jobs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying,
    total_records integer DEFAULT 0,
    processed_records integer DEFAULT 0,
    successful_records integer DEFAULT 0,
    failed_records integer DEFAULT 0,
    batch_size integer DEFAULT 10,
    current_batch integer DEFAULT 0,
    total_batches integer DEFAULT 0,
    enrichment_type character varying NOT NULL,
    filter_criteria jsonb DEFAULT '{}'::jsonb,
    error_log jsonb DEFAULT '[]'::jsonb,
    total_tokens_used integer DEFAULT 0,
    model_used character varying,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_by character varying,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: billing_credit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_credit_ledger (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    delta integer NOT NULL,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_customers (
    org_id text NOT NULL,
    stripe_customer_id text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_subscriptions (
    org_id text NOT NULL,
    stripe_subscription_id text,
    stripe_customer_id text,
    status text,
    plan text,
    price_id text,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: businessmen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.businessmen (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    first_name character varying NOT NULL,
    last_name character varying,
    email character varying,
    phone character varying,
    title character varying,
    company character varying,
    industry character varying,
    linkedin_url character varying,
    person_linkedin_url character varying,
    twitter_url character varying,
    avatar character varying,
    bio text,
    city character varying,
    country character varying,
    location character varying,
    address character varying,
    net_worth character varying,
    source character varying,
    website character varying,
    is_active boolean DEFAULT true,
    folk_id character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb DEFAULT '[]'::jsonb,
    folk_updated_at timestamp without time zone,
    folk_custom_fields jsonb,
    enrichment_status text,
    last_enrichment_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    notes text,
    family_name character varying,
    flagship_company character varying,
    business_sectors text,
    core_assets text,
    influence text
);


--
-- Name: calendar_meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_meetings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    title character varying NOT NULL,
    description text,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone NOT NULL,
    location character varying,
    meeting_link character varying,
    attendees jsonb DEFAULT '[]'::jsonb,
    related_investor_id character varying,
    related_firm_id character varying,
    related_deal_id character varying,
    google_calendar_id character varying,
    google_event_id character varying,
    status character varying DEFAULT 'scheduled'::character varying,
    meeting_type character varying DEFAULT 'networking'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: call_sync_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_sync_devices (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    org_id text NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval) NOT NULL,
    revoked_at timestamp with time zone,
    last_seen_at timestamp with time zone
);


--
-- Name: campaign_crm_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_crm_entries (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    outreach_campaign_id text NOT NULL,
    submission_id text NOT NULL,
    investor_id text,
    firm_id text,
    investor_email text,
    investor_name text,
    match_score integer,
    match_rationale text,
    stage text DEFAULT 'queued'::text NOT NULL,
    contacted_at timestamp with time zone,
    opened_at timestamp with time zone,
    responded_at timestamp with time zone,
    interest_choice text,
    interest_at timestamp with time zone,
    founder_notified_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    draft_subject text,
    draft_body text,
    wave integer,
    sent_at timestamp with time zone,
    resend_id text,
    message_id text,
    send_error text,
    CONSTRAINT campaign_crm_entries_interest_choice_check CHECK ((interest_choice = ANY (ARRAY['yes'::text, 'no'::text]))),
    CONSTRAINT campaign_crm_entries_stage_check CHECK ((stage = ANY (ARRAY['queued'::text, 'contacted'::text, 'opened'::text, 'interested'::text, 'not_interested'::text, 'meeting'::text, 'passed'::text])))
);


--
-- Name: campaign_interest_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_interest_tokens (
    token_hash text NOT NULL,
    campaign_crm_entry_id text NOT NULL,
    choice_locked boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaign_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_settings (
    id integer DEFAULT 1 NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaign_settings_singleton CHECK ((id = 1))
);


--
-- Name: capital_call_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capital_call_line_items (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    call_id text NOT NULL,
    fund_lp_id text NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    paid_at timestamp with time zone,
    payment_ref text,
    resend_message_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    lp_acknowledged_at timestamp with time zone,
    CONSTRAINT capital_call_line_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'paid'::text, 'waived'::text, 'defaulted'::text])))
);


--
-- Name: capital_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capital_calls (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    call_number integer NOT NULL,
    title text NOT NULL,
    purpose text,
    default_call_pct numeric(6,4),
    total_amount numeric(14,2) DEFAULT 0,
    sent_at timestamp with time zone,
    due_date date,
    notice_md text,
    notice_subject text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT capital_calls_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'settled'::text, 'cancelled'::text])))
);


--
-- Name: checklist_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_sessions (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    type character varying NOT NULL,
    startup_id character varying,
    data jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: checklist_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.checklist_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: checklist_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.checklist_sessions_id_seq OWNED BY public.checklist_sessions.id;


--
-- Name: comp_bands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comp_bands (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id text NOT NULL,
    created_by text,
    role text NOT NULL,
    level text,
    geography text,
    base_min numeric(12,2),
    base_max numeric(12,2),
    equity_min numeric(8,4),
    equity_max numeric(8,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: company_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_audit_log (
    id bigint NOT NULL,
    staff_id text,
    staff_email text,
    action text NOT NULL,
    target text,
    detail jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: company_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.company_audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.company_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: company_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_staff (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    email text NOT NULL,
    name text,
    password_hash text NOT NULL,
    role text DEFAULT 'staff'::text NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    CONSTRAINT company_staff_role_check CHECK ((role = ANY (ARRAY['staff'::text, 'admin'::text, 'superadmin'::text])))
);


--
-- Name: compliance_deadlines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_deadlines (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    compliance_item_id text NOT NULL,
    year integer NOT NULL,
    due_date date,
    status text DEFAULT 'upcoming'::text NOT NULL,
    filed_date date,
    filing_reference text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: compliance_fund_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_fund_settings (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    compliance_item_id text NOT NULL,
    applies text,
    dismissed boolean DEFAULT false NOT NULL,
    dismissed_reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: compliance_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_items (
    id text NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    short_name text NOT NULL,
    description text NOT NULL,
    frequency text NOT NULL,
    deadline_description text NOT NULL,
    deadline_month integer,
    deadline_day integer,
    rolling_days integer,
    applicability_text text NOT NULL,
    applicability_question text NOT NULL,
    filing_system text NOT NULL,
    filing_portal_url text,
    regulation_url text,
    form_instructions_url text,
    complexity text DEFAULT 'medium'::text NOT NULL,
    notes text,
    alert text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    company character varying(255),
    inquiry_type character varying(100) NOT NULL,
    message text NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    responded_at timestamp with time zone
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    owner_id character varying NOT NULL,
    type character varying NOT NULL,
    first_name character varying NOT NULL,
    last_name character varying,
    email character varying,
    phone character varying,
    company character varying,
    title character varying,
    linkedin_url character varying,
    twitter_url character varying,
    avatar character varying,
    notes text,
    tags jsonb DEFAULT '[]'::jsonb,
    status character varying DEFAULT 'active'::character varying,
    last_contacted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    source_type character varying,
    source_investor_id character varying,
    source_firm_id character varying,
    source_match_id character varying,
    pipeline_stage character varying DEFAULT 'sourced'::character varying
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    created_by text,
    title text NOT NULL,
    counterparty text,
    contract_type text,
    status text DEFAULT 'draft'::text NOT NULL,
    value numeric(14,2),
    effective_date date,
    expiry_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contracts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_review'::text, 'sent'::text, 'signed'::text, 'expired'::text])))
);


--
-- Name: crm_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_activities (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    scope_key text GENERATED ALWAYS AS (('org:'::text || org_id)) STORED,
    kind text NOT NULL,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    subject text,
    body text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_activities_kind_check CHECK ((kind = ANY (ARRAY['meeting'::text, 'call'::text, 'email'::text, 'note'::text, 'stage_change'::text, 'task_done'::text]))),
    CONSTRAINT crm_activities_subject_type_check CHECK ((subject_type = ANY (ARRAY['company'::text, 'person'::text, 'deal'::text])))
);


--
-- Name: crm_boards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_boards (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    source_session_id text,
    "position" integer,
    is_default boolean DEFAULT false NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id text,
    scope_key text GENERATED ALWAYS AS (('org:'::text || org_id)) STORED
);


--
-- Name: crm_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_companies (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    scope_key text GENERATED ALWAYS AS (('org:'::text || org_id)) STORED,
    firm_id text,
    name text NOT NULL,
    domain text,
    location text,
    kind text,
    notes text,
    identity text GENERATED ALWAYS AS (COALESCE(firm_id, ('name:'::text || lower(btrim(regexp_replace(name, '\s+'::text, ' '::text, 'g'::text)))))) STORED,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_deals (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    scope_key text GENERATED ALWAYS AS (('org:'::text || org_id)) STORED,
    company_id text,
    person_id text,
    board_id text,
    stage text NOT NULL,
    amount numeric,
    close_date date,
    score integer,
    tier text,
    why_match text,
    notes text,
    owner text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    source text,
    source_session_id text,
    migrated_from_entry_id text,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    last_contacted_at timestamp with time zone,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_migration_plan; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.crm_migration_plan AS
 WITH alias(raw, canonical) AS (
         VALUES ('in_diligence'::text,'diligence'::text), ('due_diligence'::text,'diligence'::text), ('replied'::text,'responded'::text), ('engaged'::text,'responded'::text), ('rejected'::text,'declined'::text), ('closed'::text,'committed'::text), ('closed_won'::text,'committed'::text), ('closed_lost'::text,'declined'::text), ('prospect'::text,'queued'::text)
        ), canon(stage) AS (
         VALUES ('queued'::text), ('identified'::text), ('researched'::text), ('contacted'::text), ('responded'::text), ('meeting'::text), ('diligence'::text), ('soft_circle'::text), ('term_sheet'::text), ('committed'::text), ('wired'::text), ('passed'::text), ('declined'::text), ('lost'::text)
        ), narrow(persona, canonical, target, note) AS (
         VALUES ('founder'::text,'queued'::text,'queued'::text,NULL::text), ('founder'::text,'contacted'::text,'contacted'::text,NULL::text), ('founder'::text,'responded'::text,'responded'::text,NULL::text), ('founder'::text,'meeting'::text,'meeting'::text,NULL::text), ('founder'::text,'diligence'::text,'diligence'::text,NULL::text), ('founder'::text,'term_sheet'::text,'term_sheet'::text,NULL::text), ('founder'::text,'committed'::text,'committed'::text,NULL::text), ('founder'::text,'passed'::text,'passed'::text,NULL::text), ('founder'::text,'identified'::text,'queued'::text,'no founder column for identified'::text), ('founder'::text,'researched'::text,'queued'::text,'no founder column for researched'::text), ('founder'::text,'soft_circle'::text,'term_sheet'::text,'no founder column for soft_circle'::text), ('founder'::text,'wired'::text,'committed'::text,'wired folded into committed'::text), ('founder'::text,'declined'::text,'passed'::text,'declined folded into passed'::text), ('founder'::text,'lost'::text,'passed'::text,'lost folded into passed'::text), ('vc'::text,'queued'::text,'queued'::text,NULL::text), ('vc'::text,'contacted'::text,'contacted'::text,NULL::text), ('vc'::text,'responded'::text,'responded'::text,NULL::text), ('vc'::text,'meeting'::text,'meeting'::text,NULL::text), ('vc'::text,'diligence'::text,'diligence'::text,NULL::text), ('vc'::text,'soft_circle'::text,'soft_circle'::text,NULL::text), ('vc'::text,'committed'::text,'committed'::text,NULL::text), ('vc'::text,'declined'::text,'declined'::text,NULL::text), ('vc'::text,'identified'::text,'queued'::text,'no vc column for identified'::text), ('vc'::text,'researched'::text,'queued'::text,'no vc column for researched'::text), ('vc'::text,'term_sheet'::text,'soft_circle'::text,'no vc column for term_sheet'::text), ('vc'::text,'wired'::text,'committed'::text,'wired folded into committed'::text), ('vc'::text,'passed'::text,'declined'::text,'passed folded into declined'::text), ('vc'::text,'lost'::text,'declined'::text,'lost folded into declined'::text)
        ), classified AS (
         SELECT e.id,
            e.user_id,
            e.source,
            e.source_session_id,
            e.firm_id,
            e.investor_id,
            e.display_name,
            e.display_title,
            e.display_email,
            e.display_linkedin,
            e.display_location,
            e.display_type,
            e.display_score,
            e.display_tier,
            e.why_match,
            e.stage,
            e.notes,
            e.owner,
            e.added_at,
            e.last_contacted_at,
            e.updated_at,
            e.embedding,
            e.embedding_model,
            e.embedding_built_at,
            e.twenty_company_id,
            e.twenty_person_id,
            e.twenty_opportunity_id,
            e.twenty_opportunity_url,
            e.twenty_last_synced_at,
            e.twenty_sync_error,
            e.board_id,
            e.research_summary,
            e.research_url,
            e.research_at,
            e.linkedin_data,
            e.linkedin_data_at,
            e.tags,
            e.check_size,
            e.import_key,
            e.org_id,
            e.scope_key,
                CASE
                    WHEN (o.kind = 'company'::text) THEN 'founder'::text
                    ELSE 'vc'::text
                END AS persona,
            c.canonical,
                CASE
                    WHEN (e.investor_id IS NOT NULL) THEN 'person'::text
                    WHEN (e.firm_id IS NOT NULL) THEN 'company'::text
                    WHEN ((NULLIF(btrim(COALESCE(e.display_title, ''::text)), ''::text) IS NOT NULL) OR (NULLIF(btrim(COALESCE(e.display_email, ''::text)), ''::text) IS NOT NULL) OR (NULLIF(btrim(COALESCE(e.display_linkedin, ''::text)), ''::text) IS NOT NULL)) THEN 'person'::text
                    ELSE 'company'::text
                END AS kind
           FROM ((public.crm_entries e
             JOIN public.organizations o ON ((o.id = e.org_id)))
             LEFT JOIN LATERAL ( SELECT COALESCE(a.canonical, k.stage) AS canonical
                   FROM ((( SELECT lower(btrim(COALESCE(e.stage, ''::text))) AS v) s
                     LEFT JOIN alias a ON ((a.raw = s.v)))
                     LEFT JOIN canon k ON ((k.stage = s.v)))
                 LIMIT 1) c ON (true))
        )
 SELECT cl.id AS entry_id,
    cl.org_id,
    cl.user_id,
    cl.persona,
    cl.stage AS raw_stage,
    cl.canonical,
    n.target AS target_stage,
    n.note,
    cl.kind,
    ((cl.investor_id IS NULL) AND (cl.firm_id IS NULL)) AS ambiguous,
    cl.firm_id,
    cl.investor_id,
    cl.display_name,
    cl.display_title,
    cl.display_email,
    cl.display_linkedin,
    cl.display_location,
    cl.display_type,
    cl.display_score,
    cl.display_tier,
    cl.why_match,
    cl.notes,
    cl.owner,
    cl.board_id,
    cl.tags,
    cl.source,
    cl.source_session_id,
    cl.added_at,
    cl.last_contacted_at,
    cl.research_summary,
    cl.research_url,
    cl.research_at,
        CASE
            WHEN (cl.firm_id IS NOT NULL) THEN cl.firm_id
            WHEN (cl.kind = 'company'::text) THEN ('name:'::text || lower(btrim(regexp_replace(cl.display_name, '\s+'::text, ' '::text, 'g'::text))))
            ELSE NULL::text
        END AS company_identity,
        CASE
            WHEN (cl.kind = 'person'::text) THEN COALESCE(cl.investor_id, ('name:'::text || lower(btrim(regexp_replace(cl.display_name, '\s+'::text, ' '::text, 'g'::text)))))
            ELSE NULL::text
        END AS person_identity
   FROM (classified cl
     LEFT JOIN narrow n ON (((n.persona = cl.persona) AND (n.canonical = cl.canonical))));


--
-- Name: crm_migration_report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_migration_report (
    id bigint NOT NULL,
    migration text NOT NULL,
    org_id text,
    entry_id text,
    finding text NOT NULL,
    detail text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_migration_report_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_migration_report_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_migration_report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_migration_report_id_seq OWNED BY public.crm_migration_report.id;


--
-- Name: crm_people; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_people (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    scope_key text GENERATED ALWAYS AS (('org:'::text || org_id)) STORED,
    company_id text,
    investor_id text,
    name text NOT NULL,
    title text,
    email text,
    linkedin text,
    location text,
    notes text,
    identity text GENERATED ALWAYS AS (COALESCE(investor_id, ('name:'::text || lower(btrim(regexp_replace(name, '\s+'::text, ' '::text, 'g'::text)))))) STORED,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_saved_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_saved_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id text,
    scope_key text GENERATED ALWAYS AS (('org:'::text || org_id)) STORED
);


--
-- Name: crm_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    crm_entry_id text,
    title text NOT NULL,
    due_at timestamp with time zone,
    done_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id text,
    scope_key text GENERATED ALWAYS AS (('org:'::text || org_id)) STORED
);


--
-- Name: cron_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_runs (
    id bigint NOT NULL,
    job text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    http_status integer,
    duration_ms integer,
    error text,
    result jsonb
);


--
-- Name: cron_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cron_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cron_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cron_runs_id_seq OWNED BY public.cron_runs.id;


--
-- Name: data_room_access_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_access_grants (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id text NOT NULL,
    token text NOT NULL,
    grantee_email text NOT NULL,
    scope text DEFAULT 'all'::text NOT NULL,
    watermark boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: data_room_document_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_document_views (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    document_id text NOT NULL,
    fund_id text,
    fund_lp_id text,
    viewer_email text,
    is_lp boolean DEFAULT false NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_room_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_documents (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text,
    fund_lp_id text,
    category text DEFAULT 'other'::text NOT NULL,
    title text NOT NULL,
    description text,
    file_url text NOT NULL,
    file_name text,
    content_type text,
    byte_size bigint,
    source_quarterly_report_id text,
    source_capital_call_id text,
    source_distribution_id text,
    archived_at timestamp with time zone,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    room_type text DEFAULT 'fund'::text NOT NULL,
    section text,
    company_id text,
    is_required boolean DEFAULT false NOT NULL,
    item_key text,
    CONSTRAINT data_room_documents_category_check CHECK ((category = ANY (ARRAY['subscription'::text, 'quarterly_letter'::text, 'capital_call'::text, 'distribution'::text, 'k1'::text, 'financials'::text, 'policy'::text, 'other'::text]))),
    CONSTRAINT data_room_documents_room_type_check CHECK ((room_type = ANY (ARRAY['fund'::text, 'founder'::text])))
);


--
-- Name: data_room_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_files (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text,
    startup_id text,
    name text,
    file_url text,
    file_type text,
    file_size bigint,
    folder text,
    is_confidential boolean DEFAULT false,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: data_room_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_room_requests (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id text,
    fund_id text,
    requester_email text,
    section text,
    item_label text NOT NULL,
    note text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT data_room_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'fulfilled'::text, 'dismissed'::text])))
);


--
-- Name: database_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_backups (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text,
    environment character varying DEFAULT 'development'::character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    backup_type character varying DEFAULT 'manual'::character varying NOT NULL,
    tables jsonb DEFAULT '[]'::jsonb,
    record_counts jsonb DEFAULT '{}'::jsonb,
    file_path character varying,
    file_size integer,
    checksum character varying,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    restored_at timestamp without time zone,
    created_by character varying,
    restored_by character varying,
    error_message text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    backup_data jsonb
);


--
-- Name: deal_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_documents (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    deal_id text NOT NULL,
    fund_id text,
    category text DEFAULT 'other'::text NOT NULL,
    name text NOT NULL,
    blob_path text NOT NULL,
    content_type text,
    size integer,
    stage_at_upload text,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_documents_category_check CHECK ((category = ANY (ARRAY['deck'::text, 'financial_model'::text, 'cap_table'::text, 'legal'::text, 'references'::text, 'kyc'::text, 'other'::text])))
);


--
-- Name: deal_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_evaluations (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    deal_id text NOT NULL,
    scores jsonb DEFAULT '{}'::jsonb NOT NULL,
    weighted_score numeric(6,3),
    summary text,
    evaluated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deal_feedback_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_feedback_events (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    investor_id character varying NOT NULL,
    startup_id character varying NOT NULL,
    session_id character varying,
    outcome character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: deal_founders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_founders (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    deal_id text NOT NULL,
    name text NOT NULL,
    role text,
    email text,
    linkedin_url text,
    bio text,
    photo_url text,
    ownership_pct numeric,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deal_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_opportunities (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    company_name text NOT NULL,
    website text,
    one_liner text,
    sector text,
    geography text,
    round_name text,
    raise_amount numeric(18,2),
    pre_money numeric(18,2),
    proposed_check numeric(18,2),
    source text,
    owner_email text,
    stage text DEFAULT 'sourced'::text NOT NULL,
    passed_reason text,
    stage_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    memo_md text,
    memo_context jsonb,
    memo_generated_at timestamp with time zone,
    memo_model text,
    investment_id text,
    closed_at timestamp with time zone,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deck_url text,
    contact_name text,
    contact_email text,
    submitted_via text DEFAULT 'internal'::text NOT NULL,
    CONSTRAINT deal_opportunities_stage_check CHECK ((stage = ANY (ARRAY['sourced'::text, 'screened'::text, 'deep_dive'::text, 'ic_scheduled'::text, 'ic_approved'::text, 'term_sheet'::text, 'committed'::text, 'closed'::text, 'passed'::text])))
);


--
-- Name: deal_room_access_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_room_access_grants (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    room_id character varying NOT NULL,
    user_id character varying NOT NULL,
    investor_id character varying,
    firm_id character varying,
    disclosure_level character varying DEFAULT 'teaser'::character varying,
    permissions jsonb DEFAULT '{"view": true, "comment": true, "download": false}'::jsonb,
    status character varying DEFAULT 'pending'::character varying,
    granted_at timestamp without time zone,
    revoked_at timestamp without time zone,
    revoked_reason text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: deal_room_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_room_audit_events (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    room_id character varying NOT NULL,
    user_id character varying NOT NULL,
    action character varying NOT NULL,
    target_type character varying,
    target_id character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: deal_room_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_room_documents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    room_id character varying NOT NULL,
    uploaded_by character varying NOT NULL,
    name character varying NOT NULL,
    type character varying,
    url character varying,
    size integer,
    mime_type character varying,
    description text,
    version integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    category character varying DEFAULT 'overview'::character varying,
    disclosure_level character varying DEFAULT 'teaser'::character varying,
    is_watermarked boolean DEFAULT true,
    object_path character varying,
    extracted_text text,
    processing_status character varying DEFAULT 'pending'::character varying,
    processing_error text,
    extracted_keywords jsonb DEFAULT '[]'::jsonb,
    startup_id character varying
);


--
-- Name: deal_room_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_room_milestones (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    room_id character varying NOT NULL,
    created_by character varying NOT NULL,
    title character varying NOT NULL,
    description text,
    due_date timestamp without time zone,
    completed_at timestamp without time zone,
    status character varying DEFAULT 'pending'::character varying,
    priority character varying DEFAULT 'medium'::character varying,
    "order" integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: deal_room_nda_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_room_nda_agreements (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    room_id character varying NOT NULL,
    user_id character varying NOT NULL,
    nda_version character varying DEFAULT '1.0'::character varying,
    accepted_at timestamp without time zone NOT NULL,
    ip_address character varying,
    user_agent text,
    signature_data text,
    status character varying DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: deal_room_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_room_notes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    room_id character varying NOT NULL,
    author_id character varying NOT NULL,
    title character varying,
    content text NOT NULL,
    is_private boolean DEFAULT false,
    is_pinned boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: deal_room_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_room_questions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    room_id character varying NOT NULL,
    asked_by character varying NOT NULL,
    document_id character varying,
    question text NOT NULL,
    answer text,
    answered_by character varying,
    answered_at timestamp without time zone,
    is_private boolean DEFAULT false,
    is_published boolean DEFAULT false,
    category character varying,
    status character varying DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: deal_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_rooms (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    deal_id character varying,
    owner_id character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    status character varying DEFAULT 'active'::character varying,
    access_level character varying DEFAULT 'private'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    startup_id character varying,
    password_hash character varying,
    is_password_protected boolean DEFAULT false,
    password_reset_token character varying,
    password_reset_expires timestamp without time zone
);


--
-- Name: dealflow_prospects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dealflow_prospects (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    mode character varying(20) DEFAULT 'startup'::character varying NOT NULL,
    name character varying(255) NOT NULL,
    logo text,
    website character varying(500),
    email character varying(255),
    stage character varying(50) NOT NULL,
    probability integer DEFAULT 10,
    assigned_to character varying(255),
    lp_type character varying(100),
    commitment_size character varying(100),
    geography character varying(255),
    deal_source character varying(100),
    investment_domicile character varying(255),
    archetypes text[],
    tags text[],
    linked_people text[],
    notes text,
    star_rating integer DEFAULT 0,
    firm_type character varying(100),
    check_size character varying(100),
    lead_partner character varying(255),
    has_deal_memo boolean DEFAULT false,
    deal_memo_status character varying(20),
    created_at timestamp without time zone DEFAULT now(),
    last_activity timestamp without time zone
);


--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    owner_id character varying NOT NULL,
    startup_id character varying,
    investor_id character varying,
    firm_id character varying,
    title character varying NOT NULL,
    description text,
    stage character varying DEFAULT 'lead'::character varying NOT NULL,
    status character varying DEFAULT 'active'::character varying,
    priority character varying DEFAULT 'medium'::character varying,
    deal_size integer,
    probability integer,
    expected_close_date timestamp without time zone,
    actual_close_date timestamp without time zone,
    source character varying,
    notes text,
    tags jsonb DEFAULT '[]'::jsonb,
    assigned_to character varying,
    last_activity_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: deck_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_key text NOT NULL,
    source text DEFAULT 'community'::text NOT NULL,
    name text,
    deck_type text DEFAULT 'unclassified'::text NOT NULL,
    shortlisted boolean DEFAULT false NOT NULL,
    favorite boolean DEFAULT false NOT NULL,
    thumbnail_url text,
    community_url text NOT NULL,
    node_mapping jsonb,
    mapping_ready boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    classified_at timestamp with time zone,
    classified_by text,
    notes text,
    CONSTRAINT deck_templates_deck_type_check CHECK ((deck_type = ANY (ARRAY['unclassified'::text, 'fund_overview'::text, 'lp_update'::text, 'pitch_deck'::text, 'investment_memo'::text, 'portfolio_review'::text, 'other'::text]))),
    CONSTRAINT deck_templates_source_check CHECK ((source = ANY (ARRAY['community'::text, 'workspace'::text, 'custom'::text])))
);


--
-- Name: decks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    template_id uuid NOT NULL,
    fund_id uuid,
    target_id uuid,
    workspace_file_key text,
    workspace_file_url text,
    status text DEFAULT 'draft'::text NOT NULL,
    "values" jsonb DEFAULT '{}'::jsonb NOT NULL,
    ai_generated_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_filled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT decks_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'mapping'::text, 'filled'::text, 'exported'::text, 'archived'::text])))
);


--
-- Name: dependency_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dependency_checks (
    id bigint NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    trigger text DEFAULT 'cron'::text NOT NULL,
    ok boolean NOT NULL,
    results jsonb NOT NULL
);


--
-- Name: dependency_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dependency_checks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dependency_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dependency_checks_id_seq OWNED BY public.dependency_checks.id;


--
-- Name: directory_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directory_candidates (
    id bigint NOT NULL,
    kind text NOT NULL,
    a_id text NOT NULL,
    b_id text NOT NULL,
    tier text NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    suggest text DEFAULT 'same'::text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    parent_id text,
    decided_by text,
    decided_at timestamp with time zone,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT directory_candidates_check CHECK ((a_id < b_id)),
    CONSTRAINT directory_candidates_kind_check CHECK ((kind = ANY (ARRAY['firm'::text, 'person'::text]))),
    CONSTRAINT directory_candidates_status_check CHECK ((status = ANY (ARRAY['open'::text, 'same'::text, 'distinct'::text, 'related'::text, 'merged'::text, 'stale'::text]))),
    CONSTRAINT directory_candidates_suggest_check CHECK ((suggest = ANY (ARRAY['same'::text, 'related'::text]))),
    CONSTRAINT directory_candidates_tier_check CHECK ((tier = ANY (ARRAY['certain'::text, 'probable'::text, 'possible'::text])))
);


--
-- Name: directory_candidates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directory_candidates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directory_candidates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directory_candidates_id_seq OWNED BY public.directory_candidates.id;


--
-- Name: directory_erasure_notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directory_erasure_notices (
    request_id text NOT NULL,
    org_id text NOT NULL,
    records integer NOT NULL,
    mailed integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: directory_hash_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directory_hash_meta (
    k text NOT NULL,
    v text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: directory_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directory_sources (
    source text NOT NULL,
    label text,
    kind text DEFAULT 'unknown'::text NOT NULL,
    acquired_at date,
    supplier text,
    licence_summary text,
    permitted_use text[] DEFAULT '{}'::text[] NOT NULL,
    forbidden_use text,
    lawful_basis_note text,
    notice_status text DEFAULT 'pending'::text NOT NULL,
    status text DEFAULT 'unreviewed'::text NOT NULL,
    evidence_ref text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    withdrawn_at timestamp with time zone,
    withdraw_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    purged_at timestamp with time zone,
    CONSTRAINT directory_sources_kind_check CHECK ((kind = ANY (ARRAY['vendor_purchase'::text, 'partner_list'::text, 'customer_upload'::text, 'public_web'::text, 'webinar_signup'::text, 'seed'::text, 'crm_sync'::text, 'unknown'::text]))),
    CONSTRAINT directory_sources_notice_status_check CHECK ((notice_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'sent'::text]))),
    CONSTRAINT directory_sources_permitted_use_check CHECK ((permitted_use <@ ARRAY['internal_matching'::text, 'outreach_email'::text, 'outreach_linkedin'::text, 'display_to_customers'::text, 'resale'::text])),
    CONSTRAINT directory_sources_status_check CHECK ((status = ANY (ARRAY['recorded'::text, 'unreviewed'::text, 'restricted'::text, 'withdrawn'::text])))
);


--
-- Name: directory_tombstones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directory_tombstones (
    id bigint NOT NULL,
    email_hash text,
    linkedin_hash text,
    source text,
    reason text NOT NULL,
    request_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT directory_tombstones_check CHECK (((email_hash IS NOT NULL) OR (linkedin_hash IS NOT NULL))),
    CONSTRAINT directory_tombstones_reason_check CHECK ((reason = ANY (ARRAY['erasure'::text, 'objection'::text, 'batch_withdrawn'::text, 'bounce_hard'::text])))
);


--
-- Name: directory_tombstones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directory_tombstones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directory_tombstones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directory_tombstones_id_seq OWNED BY public.directory_tombstones.id;


--
-- Name: discovery_exports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovery_exports (
    id text NOT NULL,
    org_id text NOT NULL,
    user_id text NOT NULL,
    lens text NOT NULL,
    rows integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: discovery_facets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovery_facets (
    lens text NOT NULL,
    kind text NOT NULL,
    facet text NOT NULL,
    value text NOT NULL,
    label text NOT NULL,
    n integer NOT NULL,
    refreshed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: discovery_saved_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovery_saved_searches (
    id text NOT NULL,
    org_id text NOT NULL,
    user_id text NOT NULL,
    lens text NOT NULL,
    name text NOT NULL,
    filters jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: distribution_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distribution_line_items (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    distribution_id text NOT NULL,
    fund_lp_id text NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notified_at timestamp with time zone,
    paid_at timestamp with time zone,
    payment_ref text,
    resend_message_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    lp_confirmed_at timestamp with time zone,
    CONSTRAINT distribution_line_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'notified'::text, 'paid'::text, 'waived'::text])))
);


--
-- Name: distributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distributions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    distribution_number integer NOT NULL,
    title text NOT NULL,
    source text,
    source_company_id text,
    gross_amount numeric(14,2),
    mgmt_fee_deduction numeric(14,2) DEFAULT 0,
    carry_deduction numeric(14,2) DEFAULT 0,
    net_amount numeric(14,2) DEFAULT 0,
    payment_date date,
    notified_at timestamp with time zone,
    notice_md text,
    notice_subject text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT distributions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'notified'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: document_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_chunks (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    document_id character varying NOT NULL,
    chunk_index integer NOT NULL,
    text text NOT NULL,
    start_offset integer,
    end_offset integer,
    embedding_model character varying,
    embedding_dim integer,
    section_title character varying,
    has_metrics boolean DEFAULT false,
    has_citations boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: document_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_extractions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    doc_hash text NOT NULL,
    kind text NOT NULL,
    version text NOT NULL,
    fields jsonb NOT NULL,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '180 days'::interval) NOT NULL,
    CONSTRAINT document_extractions_kind_check CHECK ((kind = ANY (ARRAY['startup'::text, 'fund'::text])))
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    startup_id uuid,
    user_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    file_path text NOT NULL,
    file_size bigint,
    mime_type character varying(100),
    is_primary boolean DEFAULT false,
    version integer DEFAULT 1,
    analysis_status character varying(50) DEFAULT 'pending'::character varying,
    analysis_result jsonb,
    extracted_text text,
    share_settings jsonb DEFAULT '{"public": false, "allowed_emails": []}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: dsar_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dsar_requests (
    id text NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'verifying'::text NOT NULL,
    requester_email_hash text NOT NULL,
    details_enc text,
    verify_token_hash text,
    verify_expires_at timestamp with time zone,
    verified_at timestamp with time zone,
    due_at timestamp with time zone NOT NULL,
    extended_to timestamp with time zone,
    extension_reason text,
    handled_by text,
    outcome jsonb DEFAULT '{}'::jsonb NOT NULL,
    refusal_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    details_wiped_at timestamp with time zone,
    CONSTRAINT dsar_requests_kind_check CHECK ((kind = ANY (ARRAY['access'::text, 'rectification'::text, 'erasure'::text, 'restriction'::text, 'objection'::text]))),
    CONSTRAINT dsar_requests_status_check CHECK ((status = ANY (ARRAY['received'::text, 'verifying'::text, 'verified'::text, 'in_progress'::text, 'done'::text, 'refused'::text, 'expired'::text])))
);


--
-- Name: early_access_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.early_access_requests (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    persona text,
    company text,
    role text,
    website text,
    stage text,
    use_case text,
    heard_from text,
    referral_source text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    email_key text,
    consent_at timestamp with time zone,
    consent_version text,
    attribution jsonb,
    invite_token_hash text,
    invite_email_key text,
    invited_at timestamp with time zone,
    invite_expires_at timestamp with time zone,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    approved_at timestamp with time zone,
    invite_resend_id text,
    invite_error text,
    CONSTRAINT early_access_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'invited'::text, 'accepted'::text, 'declined'::text, 'revoked'::text])))
);


--
-- Name: email_oauth_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_oauth_accounts (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    provider text NOT NULL,
    email text NOT NULL,
    display_name text,
    refresh_token text NOT NULL,
    access_token text,
    expires_at timestamp with time zone,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_error text,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_oauth_accounts_provider_check CHECK ((provider = ANY (ARRAY['gmail'::text, 'outlook'::text]))),
    CONSTRAINT email_oauth_accounts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'error'::text])))
);


--
-- Name: email_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_suppressions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text,
    email text NOT NULL,
    reason text,
    source text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    owner_id character varying,
    name character varying NOT NULL,
    subject character varying NOT NULL,
    body text NOT NULL,
    category character varying DEFAULT 'custom'::character varying,
    variables jsonb DEFAULT '[]'::jsonb,
    is_public boolean DEFAULT false,
    usage_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: email_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verifications (
    email text NOT NULL,
    domain text NOT NULL,
    status text NOT NULL,
    reason text,
    provider text NOT NULL,
    mx_found boolean,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    raw jsonb,
    CONSTRAINT email_verifications_status_check CHECK ((status = ANY (ARRAY['valid'::text, 'risky'::text, 'unknown'::text, 'invalid'::text])))
);


--
-- Name: enrichment_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrichment_jobs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying NOT NULL,
    entity_id character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying,
    enrichment_type character varying NOT NULL,
    input_data jsonb DEFAULT '{}'::jsonb,
    output_data jsonb DEFAULT '{}'::jsonb,
    suggested_updates jsonb DEFAULT '{}'::jsonb,
    applied_at timestamp without time zone,
    applied_by character varying,
    error_message text,
    tokens_used integer,
    model_used character varying,
    created_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone
);


--
-- Name: entity_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_memory (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    source text DEFAULT 'person'::text NOT NULL,
    confidence numeric,
    valid_until timestamp with time zone,
    pinned boolean DEFAULT false NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_memory_source_check CHECK ((source = ANY (ARRAY['person'::text, 'agent'::text, 'assistant'::text])))
);


--
-- Name: equity_filings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equity_filings (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id text NOT NULL,
    title text NOT NULL,
    filing_type text,
    due_date date,
    status text DEFAULT 'open'::text NOT NULL,
    filed_at date,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT equity_filings_status_check CHECK ((status = ANY (ARRAY['open'::text, 'filed'::text, 'overdue'::text, 'na'::text])))
);


--
-- Name: eval_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eval_runs (
    id bigint NOT NULL,
    suite text NOT NULL,
    case_name text NOT NULL,
    passed boolean NOT NULL,
    detail text,
    ran_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: eval_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.eval_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: eval_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.eval_runs_id_seq OWNED BY public.eval_runs.id;


--
-- Name: extension_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    prefix text NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    token_prefix text,
    last_version text
);


--
-- Name: fee_accruals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_accruals (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    period_end date NOT NULL,
    base_kind text NOT NULL,
    base_amount numeric(18,2) NOT NULL,
    fee_pct numeric(7,5) NOT NULL,
    fee_amount numeric(18,2) NOT NULL,
    status text DEFAULT 'accrued'::text NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_accruals_status_check CHECK ((status = ANY (ARRAY['accrued'::text, 'paid'::text, 'waived'::text])))
);


--
-- Name: fee_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_schedules (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    annual_fee_pct numeric(7,5) DEFAULT 0.02 NOT NULL,
    fee_base text DEFAULT 'committed'::text NOT NULL,
    start_date date NOT NULL,
    term_years integer DEFAULT 10 NOT NULL,
    stepdown_after_years integer DEFAULT 0 NOT NULL,
    stepdown_fee_pct numeric(7,5),
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_schedules_fee_base_check CHECK ((fee_base = ANY (ARRAY['committed'::text, 'called'::text, 'invested'::text])))
);


--
-- Name: financial_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_reports (
    id text NOT NULL,
    fund_id text NOT NULL,
    entity_name text,
    period text NOT NULL,
    status text DEFAULT 'needs_review'::text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_reports_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'needs_review'::text, 'done'::text])))
);


--
-- Name: folk_failed_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folk_failed_records (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    run_id character varying NOT NULL,
    record_type character varying NOT NULL,
    folk_id character varying NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    error_code character varying,
    error_message text,
    retry_count integer DEFAULT 0,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: folk_field_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folk_field_definitions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    group_id character varying NOT NULL,
    field_name character varying NOT NULL,
    field_key character varying NOT NULL,
    field_type character varying NOT NULL,
    sample_values jsonb DEFAULT '[]'::jsonb,
    occurrence_count integer DEFAULT 0,
    is_custom_field boolean DEFAULT true,
    last_seen_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: folk_field_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folk_field_mappings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    group_id character varying NOT NULL,
    folk_field_key character varying NOT NULL,
    target_table character varying NOT NULL,
    target_column character varying,
    store_in_json boolean DEFAULT true,
    transform_type character varying,
    ai_confidence integer,
    ai_reason text,
    is_approved boolean DEFAULT false,
    approved_by character varying,
    approved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: folk_import_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folk_import_runs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    workspace_id character varying,
    source_type character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    initiated_by character varying,
    started_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    total_records integer DEFAULT 0,
    processed_records integer DEFAULT 0,
    created_records integer DEFAULT 0,
    updated_records integer DEFAULT 0,
    skipped_records integer DEFAULT 0,
    failed_records integer DEFAULT 0,
    error_summary text,
    folk_cursor character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    progress_percent integer DEFAULT 0,
    eta_seconds integer,
    import_stage character varying
);


--
-- Name: folk_workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folk_workspaces (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    workspace_id character varying NOT NULL,
    name character varying NOT NULL,
    slug character varying,
    is_active boolean DEFAULT true,
    last_synced_at timestamp without time zone,
    sync_cursor character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: forecast_scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forecast_scenarios (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    fund_id text,
    name text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: founder_match_exclusions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.founder_match_exclusions (
    org_id text NOT NULL,
    entity_key text NOT NULL,
    reason text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: founder_match_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.founder_match_results (
    run_id text NOT NULL,
    kind text NOT NULL,
    rank integer NOT NULL,
    entity_id text NOT NULL,
    firm_id text,
    score real NOT NULL,
    tier text NOT NULL,
    name text NOT NULL,
    email_status text,
    payload jsonb NOT NULL,
    CONSTRAINT founder_match_results_kind_check CHECK ((kind = ANY (ARRAY['group'::text, 'independent'::text])))
);


--
-- Name: founder_match_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.founder_match_runs (
    id text NOT NULL,
    org_id text NOT NULL,
    user_id text NOT NULL,
    profile_version_id text,
    engine_version text NOT NULL,
    options jsonb DEFAULT '{}'::jsonb NOT NULL,
    startup jsonb NOT NULL,
    totals jsonb NOT NULL,
    tier_counts jsonb,
    segment_counts jsonb,
    funnel jsonb,
    semantic jsonb,
    exclusions jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '180 days'::interval) NOT NULL
);


--
-- Name: founder_match_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.founder_match_sessions (
    id text NOT NULL,
    user_id text NOT NULL,
    org_id text NOT NULL,
    startup jsonb NOT NULL,
    result jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL
);


--
-- Name: founder_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.founder_notifications (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    submission_id text NOT NULL,
    type text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    emailed_at timestamp with time zone,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT founder_notifications_type_check CHECK ((type = ANY (ARRAY['interest'::text, 'reply'::text, 'milestone'::text, 'complete'::text])))
);


--
-- Name: founder_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.founder_submissions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    public_ref text NOT NULL,
    campaign_batch_id text,
    startup_name text NOT NULL,
    website text,
    one_liner text,
    sectors text[] DEFAULT '{}'::text[] NOT NULL,
    stage text,
    raise_amount numeric,
    check_size_min numeric,
    check_size_max numeric,
    location text,
    founder_name text NOT NULL,
    founder_email text NOT NULL,
    founder_linkedin text,
    founder_title text,
    team_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    traction_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    extra_fields_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    deck_blob_key text,
    data_room_keys text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    assessment_score integer,
    assessment_json jsonb,
    decline_reason text,
    startup_profile_id text,
    outreach_campaign_id text,
    ip_hash text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    send_approved boolean DEFAULT true NOT NULL,
    extracted_json jsonb,
    startup_profile_json jsonb,
    CONSTRAINT founder_submissions_status_check CHECK ((status = ANY (ARRAY['received'::text, 'assessing'::text, 'assessed'::text, 'declined'::text, 'campaign_ready'::text, 'outreaching'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: fund_analytics_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_analytics_snapshots (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    fund_id character varying NOT NULL,
    snapshot_date timestamp without time zone NOT NULL,
    metrics jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: fund_assessment_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_assessment_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id uuid NOT NULL,
    strength integer DEFAULT 0 NOT NULL,
    domain_scores jsonb DEFAULT '{}'::jsonb NOT NULL,
    subcat_scores jsonb DEFAULT '{}'::jsonb NOT NULL,
    filled_critical integer DEFAULT 0 NOT NULL,
    filled_supporting integer DEFAULT 0 NOT NULL,
    filled_supplemental integer DEFAULT 0 NOT NULL,
    total_critical integer DEFAULT 0 NOT NULL,
    total_supporting integer DEFAULT 0 NOT NULL,
    total_supplemental integer DEFAULT 0 NOT NULL,
    captured_by text,
    captured_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fund_compliance_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_compliance_profile (
    fund_id text NOT NULL,
    registration_status text,
    aum_range text,
    fund_structure text,
    fundraising_status text,
    reg_d_exemption text,
    investor_state_count text,
    california_nexus text[],
    public_equity text,
    cftc_activity text,
    access_person_count text,
    has_foreign_entities text,
    has_foreign_investors text,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fund_connect_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_connect_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id text NOT NULL,
    entity_id uuid NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    invited_by text NOT NULL,
    card jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    relationship_id uuid,
    CONSTRAINT fund_connect_invites_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'accepted'::text, 'declined'::text, 'withdrawn'::text])))
);


--
-- Name: fund_intake_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_intake_configs (
    fund_id text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    headline text,
    intro text,
    thesis text,
    instructions text,
    gates jsonb DEFAULT '{}'::jsonb NOT NULL,
    rubric jsonb DEFAULT '[]'::jsonb NOT NULL,
    thresholds jsonb DEFAULT '{}'::jsonb NOT NULL,
    form jsonb DEFAULT '{}'::jsonb NOT NULL,
    notify jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fund_investments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_investments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    fund_id character varying NOT NULL,
    startup_id character varying,
    deal_id character varying,
    company_name character varying NOT NULL,
    investment_date timestamp without time zone NOT NULL,
    round_type character varying,
    invested_amount integer NOT NULL,
    ownership_percentage real,
    pre_money_valuation integer,
    post_money_valuation integer,
    current_valuation integer,
    unrealized_value integer,
    realized_value integer,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    exit_date timestamp without time zone,
    exit_type character varying,
    exit_valuation integer,
    multiple_on_investment real,
    irr real,
    board_seat boolean DEFAULT false,
    lead_investor boolean DEFAULT false,
    notes text,
    sector character varying,
    geography character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: fund_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_listings (
    fund_id text NOT NULL,
    snapshot jsonb NOT NULL,
    eligibility jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    refreshed_at timestamp with time zone DEFAULT now() NOT NULL,
    refreshed_by text
);


--
-- Name: fund_lps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_lps (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    lp_contact_id text,
    lp_name text NOT NULL,
    lp_type text,
    commitment_amount numeric(14,2),
    called_amount numeric(14,2) DEFAULT 0,
    distributed_amount numeric(14,2) DEFAULT 0,
    ownership_pct numeric(7,5),
    signed_at date,
    status text DEFAULT 'committed'::text NOT NULL,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    subscription_status text DEFAULT 'prospective'::text NOT NULL,
    contact_email text,
    contact_name text,
    onboarding_state text DEFAULT 'not_invited'::text NOT NULL,
    invited_at timestamp with time zone,
    opened_at timestamp with time zone,
    details_confirmed_at timestamp with time zone,
    terms_accepted_at timestamp with time zone,
    CONSTRAINT fund_lps_lp_type_check CHECK (((lp_type IS NULL) OR (lp_type = ANY (ARRAY['family_office'::text, 'institutional'::text, 'hnwi'::text, 'corporate'::text, 'fund_of_funds'::text])))),
    CONSTRAINT fund_lps_onboarding_state_check CHECK ((onboarding_state = ANY (ARRAY['not_invited'::text, 'invited'::text, 'opened'::text, 'details_confirmed'::text, 'terms_accepted'::text, 'verification_submitted'::text, 'subscription_returned'::text, 'countersigned'::text]))),
    CONSTRAINT fund_lps_status_check CHECK ((status = ANY (ARRAY['committed'::text, 'fully_called'::text, 'defaulted'::text, 'transferred'::text]))),
    CONSTRAINT fund_lps_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['prospective'::text, 'invited'::text, 'signed'::text, 'countersigned'::text])))
);


--
-- Name: fund_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    fund_name text NOT NULL,
    fund_type text,
    target_fund_size bigint,
    target_sectors text[],
    target_stages text[],
    target_geographies text[],
    min_track_record_years integer,
    preferred_gp_experience text[],
    esg_focus boolean DEFAULT false,
    first_time_fund_ok boolean DEFAULT true,
    co_investment_rights boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name text,
    fund_number integer,
    target_raise numeric,
    hard_cap numeric,
    minimum_commitment numeric,
    average_ticket bigint,
    management_fee numeric(5,2),
    carry numeric(5,2),
    gp_commitment numeric(5,2),
    fund_life integer,
    investment_stage text,
    avg_check_size numeric,
    target_companies integer,
    investment_period integer,
    sectors jsonb DEFAULT '[]'::jsonb,
    primary_sectors jsonb DEFAULT '[]'::jsonb,
    geographic_focus jsonb DEFAULT '[]'::jsonb,
    headquarters_location text,
    target_lp_types jsonb DEFAULT '[]'::jsonb,
    thesis_keywords jsonb DEFAULT '[]'::jsonb,
    thesis_description text,
    value_proposition text,
    gp_name text,
    portfolio_companies jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    fund_i_prior_lp_firm_ids jsonb DEFAULT '[]'::jsonb,
    fund_i_prior_contact_emails jsonb DEFAULT '[]'::jsonb,
    org_id text,
    allowed_lp_classes jsonb DEFAULT '[]'::jsonb,
    excluded_jurisdictions jsonb DEFAULT '[]'::jsonb
);


--
-- Name: fund_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id text NOT NULL,
    entity_id uuid NOT NULL,
    user_id text NOT NULL,
    stage text DEFAULT 'interested'::text NOT NULL,
    initiated_by text DEFAULT 'investor'::text NOT NULL,
    indicative_min numeric,
    indicative_max numeric,
    timing text,
    note text,
    shared jsonb DEFAULT '{}'::jsonb NOT NULL,
    eligibility_check jsonb,
    fit jsonb,
    decided_by text,
    decided_at timestamp with time zone,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    investor_muted boolean DEFAULT false NOT NULL,
    fund_muted boolean DEFAULT false NOT NULL,
    blocked_by text,
    investor_notified_at timestamp with time zone,
    fund_notified_at timestamp with time zone,
    nudged_at timestamp with time zone,
    quiet_asked_at timestamp with time zone,
    last_message_at timestamp with time zone,
    fund_lp_id text,
    nda_accepted_at timestamp with time zone,
    nda_text_hash text,
    nda_text text,
    nda_ip text,
    nda_agent_hash text,
    statement_version text,
    CONSTRAINT fund_relationships_blocked_by_check CHECK ((blocked_by = ANY (ARRAY['investor'::text, 'fund'::text]))),
    CONSTRAINT fund_relationships_initiated_by_check CHECK ((initiated_by = ANY (ARRAY['investor'::text, 'fund'::text]))),
    CONSTRAINT fund_relationships_stage_check CHECK ((stage = ANY (ARRAY['interested'::text, 'in_talks'::text, 'invited_to_onboard'::text, 'onboarding'::text, 'active'::text, 'on_hold'::text, 'declined'::text, 'withdrawn'::text])))
);


--
-- Name: fund_subscription_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_subscription_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id text NOT NULL,
    version integer NOT NULL,
    title text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    CONSTRAINT fund_subscription_packages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'current'::text, 'retired'::text])))
);


--
-- Name: fundraising_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fundraising_rounds (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    org_id text NOT NULL,
    board_id text NOT NULL,
    name text NOT NULL,
    currency text NOT NULL,
    target numeric NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fundraising_rounds_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT fundraising_rounds_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120))),
    CONSTRAINT fundraising_rounds_target_check CHECK ((target >= (0)::numeric))
);


--
-- Name: funds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funds (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    vintage_year integer,
    target_size numeric(14,2),
    currency text DEFAULT 'USD'::text NOT NULL,
    management_fee_pct numeric(5,4),
    carry_pct numeric(5,4),
    term_years integer,
    investment_period_years integer,
    status text DEFAULT 'active'::text NOT NULL,
    manager_org text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    assessment jsonb DEFAULT '{}'::jsonb,
    assessment_meta jsonb DEFAULT '{}'::jsonb,
    legal_fields jsonb DEFAULT '{}'::jsonb,
    legal_field_approvals jsonb DEFAULT '{}'::jsonb,
    legal_fields_meta jsonb DEFAULT '{}'::jsonb,
    legal_credits_balance integer DEFAULT 0,
    legal_document_overrides jsonb DEFAULT '{}'::jsonb,
    vehicle_kind text DEFAULT 'fund'::text NOT NULL,
    listed_for_lps boolean DEFAULT false NOT NULL,
    listed_for_lps_at timestamp with time zone,
    listed_for_lps_by text,
    CONSTRAINT funds_status_check CHECK ((status = ANY (ARRAY['fundraising'::text, 'active'::text, 'harvesting'::text, 'closed'::text])))
);


--
-- Name: grant_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grant_exercises (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    grant_id text NOT NULL,
    exercised_on date DEFAULT CURRENT_DATE NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ic_memos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ic_memos (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    investment_case_id character varying NOT NULL,
    version integer DEFAULT 1,
    executive_summary text,
    market_analysis text,
    competitive_landscape text,
    risk_assessment text,
    investment_thesis text,
    recommendation text,
    appendix text,
    key_metrics jsonb DEFAULT '{}'::jsonb,
    sources jsonb DEFAULT '[]'::jsonb,
    confidence_score real DEFAULT 0,
    corroboration_factor real DEFAULT 0,
    recency_factor real DEFAULT 0,
    ai_model character varying DEFAULT 'mistral'::character varying,
    generation_time_ms integer,
    tokens_used integer,
    word_count integer,
    status character varying DEFAULT 'draft'::character varying,
    reviewed_by character varying,
    approved_by character varying,
    approved_at timestamp without time zone,
    review_notes text,
    human_revision_version integer DEFAULT 0,
    last_edited_by character varying,
    last_edited_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: ic_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ic_votes (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    deal_id text NOT NULL,
    member text NOT NULL,
    vote text NOT NULL,
    conditions text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ic_votes_vote_check CHECK ((vote = ANY (ARRAY['approve'::text, 'approve_with_conditions'::text, 'decline'::text, 'abstain'::text])))
);


--
-- Name: impersonation_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impersonation_grants (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    staff_id text NOT NULL,
    staff_email text,
    org_id text NOT NULL,
    mode text DEFAULT 'readonly'::text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT impersonation_grants_mode_check CHECK ((mode = ANY (ARRAY['readonly'::text, 'full'::text])))
);


--
-- Name: inbox_poll_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_poll_state (
    mailbox text NOT NULL,
    last_uid bigint DEFAULT 0 NOT NULL,
    last_polled_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    poll_count integer DEFAULT 0 NOT NULL,
    new_replies integer DEFAULT 0 NOT NULL
);


--
-- Name: intake_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intake_submissions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    public_ref text NOT NULL,
    company_name text NOT NULL,
    website text,
    one_liner text,
    contact_name text NOT NULL,
    contact_email text NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    deck_url text,
    status text DEFAULT 'received'::text NOT NULL,
    category text,
    score numeric,
    result jsonb,
    config_version integer,
    deal_id text,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    ip_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notified_at timestamp with time zone,
    CONSTRAINT intake_submissions_category_check CHECK ((category = ANY (ARRAY['passed'::text, 'review'::text, 'not_a_fit'::text]))),
    CONSTRAINT intake_submissions_status_check CHECK ((status = ANY (ARRAY['received'::text, 'assessing'::text, 'assessed'::text, 'failed'::text])))
);


--
-- Name: interaction_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interaction_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    outreach_id character varying,
    startup_id character varying,
    contact_id character varying,
    firm_id character varying,
    investor_id character varying,
    type character varying NOT NULL,
    subject character varying,
    content text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    performed_by_id character varying,
    performed_by_email character varying
);


--
-- Name: interview_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interview_feedback (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    interview_id character varying NOT NULL,
    executive_summary text,
    strengths jsonb DEFAULT '[]'::jsonb,
    critical_gaps jsonb DEFAULT '[]'::jsonb,
    red_flags jsonb DEFAULT '[]'::jsonb,
    deck_improvements jsonb DEFAULT '[]'::jsonb,
    next_steps jsonb DEFAULT '[]'::jsonb,
    recommended_investor_types jsonb DEFAULT '[]'::jsonb,
    full_feedback text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: interview_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interview_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    interview_id character varying NOT NULL,
    role character varying NOT NULL,
    content text NOT NULL,
    phase character varying,
    question_type character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: interview_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interview_scores (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    interview_id character varying NOT NULL,
    market_understanding integer,
    business_model integer,
    traction_metrics integer,
    founder_clarity integer,
    strategic_fit integer,
    risk_awareness integer,
    overall_score integer,
    investor_readiness character varying,
    risk_level character varying,
    key_concerns jsonb DEFAULT '[]'::jsonb,
    follow_up_required boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: interviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interviews (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    founder_id character varying NOT NULL,
    startup_id character varying,
    founder_name character varying NOT NULL,
    company_name character varying NOT NULL,
    role character varying,
    industry character varying,
    hq_location character varying,
    incorporation_country character varying,
    stage character varying,
    capital_raised_to_date character varying,
    target_raise character varying,
    use_of_funds text,
    revenue character varying,
    growth_rate character varying,
    team_size integer,
    previous_exits jsonb DEFAULT '[]'::jsonb,
    target_investor_types jsonb DEFAULT '[]'::jsonb,
    target_geography character varying,
    target_ticket_size character varying,
    investor_strategy character varying,
    pitch_deck_url character varying,
    deck_analysis jsonb,
    phase character varying DEFAULT 'setup'::character varying,
    current_question_index integer DEFAULT 0,
    status character varying DEFAULT 'pending'::character varying,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: introductions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.introductions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    requester_id character varying NOT NULL,
    startup_id character varying,
    target_investor_id character varying,
    target_firm_id character varying,
    connector_id character varying,
    match_id character varying,
    message text,
    ai_generated_message text,
    status character varying DEFAULT 'draft'::character varying,
    priority character varying DEFAULT 'normal'::character varying,
    connector_response text,
    target_response text,
    sent_to_connector_at timestamp without time zone,
    sent_to_target_at timestamp without time zone,
    responded_at timestamp without time zone,
    completed_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: investment_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investment_cases (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    created_by character varying,
    company_name character varying NOT NULL,
    company_description text,
    sector character varying NOT NULL,
    subsector character varying,
    stage character varying NOT NULL,
    deal_type character varying,
    geography character varying,
    target_valuation character varying,
    deal_size character varying,
    website character varying,
    founded_year integer,
    team_size integer,
    revenue character varying,
    growth_rate character varying,
    key_metrics jsonb DEFAULT '{}'::jsonb,
    claimed_tam character varying,
    claimed_sam character varying,
    claimed_growth character varying,
    status character varying DEFAULT 'draft'::character varying,
    assigned_to character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: investment_firms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investment_firms (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text,
    website character varying,
    logo character varying,
    type character varying,
    aum character varying,
    location character varying,
    stages jsonb DEFAULT '[]'::jsonb,
    sectors jsonb DEFAULT '[]'::jsonb,
    check_size_min integer,
    check_size_max integer,
    portfolio_count integer,
    linkedin_url character varying,
    twitter_url character varying,
    created_at timestamp without time zone DEFAULT now(),
    folk_id character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb DEFAULT '[]'::jsonb,
    folk_updated_at timestamp without time zone,
    source character varying,
    updated_at timestamp without time zone DEFAULT now(),
    hq_location character varying,
    industry character varying,
    emails jsonb,
    phones jsonb,
    addresses jsonb,
    urls jsonb,
    funding_raised character varying,
    last_funding_date character varying,
    foundation_year character varying,
    employee_range character varying,
    status character varying,
    folk_custom_fields jsonb,
    url_1 character varying,
    url_2 character varying,
    firm_classification character varying,
    typical_check_size character varying,
    enrichment_status character varying DEFAULT 'not_enriched'::character varying,
    last_enrichment_date timestamp without time zone,
    enrichment_error text,
    logo_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    embedding_model text,
    embedding_built_at timestamp with time zone,
    embedding public.vector(1024),
    norm_country text,
    norm_region text,
    norm_sectors text[],
    norm_stages text[],
    norm_class text,
    check_min numeric,
    check_max numeric,
    normalized_at timestamp with time zone,
    last_investment_at date,
    last_investment_note text,
    activity_source_url text,
    activity_checked_at timestamp with time zone
);


--
-- Name: investment_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investment_signals (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    document_id character varying,
    signal_type character varying NOT NULL,
    signal_category character varying,
    sector character varying,
    geography character varying,
    raw_text text NOT NULL,
    normalized_value character varying,
    unit character varying,
    timeframe character varying,
    confidence_score real DEFAULT 0,
    source_weight real DEFAULT 0,
    extracted_by character varying DEFAULT 'ai'::character varying,
    verified_by character varying,
    verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: investments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investments (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    company_id text,
    company_name text NOT NULL,
    investment_kind text DEFAULT 'initial'::text NOT NULL,
    security_type text DEFAULT 'preferred'::text NOT NULL,
    round_name text,
    invested_at date,
    cost_basis numeric(18,2) DEFAULT 0 NOT NULL,
    share_count numeric(18,4),
    fully_diluted_pct numeric(9,6),
    round_valuation numeric(18,2),
    status text DEFAULT 'active'::text NOT NULL,
    exited_at date,
    realized_proceeds numeric(18,2) DEFAULT 0 NOT NULL,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT investments_investment_kind_check CHECK ((investment_kind = ANY (ARRAY['initial'::text, 'follow_on'::text, 'studio_common'::text, 'secondary'::text, 'bridge'::text, 'other'::text]))),
    CONSTRAINT investments_security_type_check CHECK ((security_type = ANY (ARRAY['safe'::text, 'convertible_note'::text, 'preferred'::text, 'common'::text, 'warrant'::text, 'other'::text]))),
    CONSTRAINT investments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'exited'::text, 'written_off'::text])))
);


--
-- Name: investor_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_calls (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    crm_entry_id text,
    title text,
    investor_name text,
    occurred_at timestamp with time zone,
    transcript text,
    summary text,
    sentiment text,
    interest_level text,
    objections jsonb,
    next_steps jsonb,
    key_questions jsonb,
    draft_followup text,
    recommended_stage text,
    generated_by text,
    analyzed_at timestamp with time zone,
    status text DEFAULT 'new'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    org_id text,
    persona text,
    source text DEFAULT 'paste'::text NOT NULL,
    external_id text,
    content_hash text,
    analysis_error text,
    analysis_started_at timestamp with time zone,
    analysis_run_id text,
    outreach_message_id text,
    reviewed_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: investor_claim_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_claim_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    lp_id text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: investor_company_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_company_links (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    investor_id character varying NOT NULL,
    company_id character varying NOT NULL,
    relationship_type character varying NOT NULL,
    title character varying,
    is_primary boolean DEFAULT false,
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    confidence_score integer,
    source character varying,
    folk_id character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: investor_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    legal_name text NOT NULL,
    kind text NOT NULL,
    country text,
    tax_residence text,
    category text,
    interests jsonb DEFAULT '{}'::jsonb NOT NULL,
    discoverable boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    discoverable_at timestamp with time zone,
    discoverable_version text,
    CONSTRAINT investor_entities_category_check CHECK ((category = ANY (ARRAY['professional'::text, 'semi_professional'::text, 'other'::text, 'unsure'::text]))),
    CONSTRAINT investor_entities_kind_check CHECK ((kind = ANY (ARRAY['individual'::text, 'company'::text, 'trust'::text, 'fund'::text, 'family_office'::text])))
);


--
-- Name: investor_entity_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_entity_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    user_id text NOT NULL,
    action text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: investor_entity_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_entity_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    invited_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT investor_entity_invites_role_check CHECK ((role = ANY (ARRAY['can_act'::text, 'can_view'::text])))
);


--
-- Name: investor_entity_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_entity_members (
    entity_id uuid NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    added_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT investor_entity_members_role_check CHECK ((role = ANY (ARRAY['can_act'::text, 'can_view'::text])))
);


--
-- Name: investor_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_matches (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying NOT NULL,
    startup_id character varying NOT NULL,
    startup_name character varying,
    investor_id character varying NOT NULL,
    investor_name character varying,
    investor_email character varying,
    investor_linkedin character varying,
    firm_id character varying,
    firm_name character varying,
    firm_website character varying,
    score integer NOT NULL,
    tier character varying NOT NULL,
    tier_label character varying,
    factor_industry real,
    factor_stage real,
    factor_geo real,
    factor_check_size real,
    factor_investor_type real,
    factor_team_signal real,
    semantic_score integer DEFAULT 0,
    niche_score integer DEFAULT 0,
    document_score integer DEFAULT 0,
    economic_score integer DEFAULT 0,
    behaviour_score integer DEFAULT 0,
    feedback_multiplier real DEFAULT 1,
    win_probability integer DEFAULT 0,
    decision_speed character varying,
    value_add jsonb DEFAULT '[]'::jsonb,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    folk_contact_id character varying,
    status_notes text,
    status_updated_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    pipeline_status character varying(50) DEFAULT 'pending'::character varying
);


--
-- Name: investor_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_profiles (
    user_id text NOT NULL,
    display_name text NOT NULL,
    country text,
    languages jsonb DEFAULT '[]'::jsonb NOT NULL,
    contact_pref text,
    about text,
    terms_version text NOT NULL,
    terms_accepted_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    erased_at timestamp with time zone
);


--
-- Name: investor_signup_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_signup_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    ip text,
    terms_version text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: investor_update_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_update_recipients (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    update_id text NOT NULL,
    user_id text NOT NULL,
    crm_entry_id text,
    email text,
    name text,
    resend_id text,
    tracking_id text,
    sent_at timestamp with time zone,
    opened_at timestamp with time zone,
    open_count integer DEFAULT 0,
    last_event text,
    created_at timestamp with time zone DEFAULT now(),
    delivery_status text DEFAULT 'sent'::text NOT NULL,
    last_error text,
    CONSTRAINT investor_update_recipients_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: investor_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_updates (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    title text,
    period text,
    body text,
    metrics jsonb,
    asks text,
    status text DEFAULT 'draft'::text,
    generated_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sent_at timestamp with time zone,
    revision integer DEFAULT 0 NOT NULL,
    delivery_snapshot jsonb,
    send_lease_until timestamp with time zone,
    send_token text,
    last_error text,
    org_id text,
    CONSTRAINT investor_updates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sending'::text, 'partial'::text, 'sent'::text])))
);


--
-- Name: investors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investors (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    firm_id character varying,
    first_name character varying NOT NULL,
    last_name character varying,
    email character varying,
    phone character varying,
    title character varying,
    linkedin_url character varying,
    twitter_url character varying,
    avatar character varying,
    bio text,
    stages jsonb DEFAULT '[]'::jsonb,
    sectors jsonb DEFAULT '[]'::jsonb,
    location character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    folk_id character varying,
    source character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb DEFAULT '[]'::jsonb,
    folk_updated_at timestamp without time zone,
    person_linkedin_url character varying,
    investor_type character varying,
    investor_state character varying,
    investor_country character varying,
    fund_hq character varying,
    hq_location character varying,
    funding_stage character varying,
    typical_investment character varying,
    num_lead_investments integer,
    total_investments integer,
    recent_investments text,
    status character varying,
    website character varying,
    folk_custom_fields jsonb,
    address character varying,
    enrichment_status text,
    last_enrichment_date timestamp without time zone,
    investment_thesis text,
    preferred_stages jsonb DEFAULT '[]'::jsonb,
    preferred_sectors jsonb DEFAULT '[]'::jsonb,
    typical_check_size character varying,
    focus_niches jsonb DEFAULT '[]'::jsonb,
    geography_focus jsonb DEFAULT '[]'::jsonb,
    portfolio_count integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    embedding_model text,
    embedding_built_at timestamp with time zone,
    embedding public.vector(1024),
    norm_country text,
    norm_region text,
    norm_sectors text[],
    norm_stages text[],
    norm_class text,
    check_min numeric,
    check_max numeric,
    normalized_at timestamp with time zone,
    email_hash text,
    linkedin_hashes text[],
    hashed_at timestamp with time zone,
    hidden_by_source boolean DEFAULT false NOT NULL,
    restricted_at timestamp with time zone
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    entry_date date NOT NULL,
    memo text NOT NULL,
    source_kind text DEFAULT 'manual'::text NOT NULL,
    source_id text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT journal_entries_source_kind_check CHECK ((source_kind = ANY (ARRAY['manual'::text, 'call_paid'::text, 'investment_close'::text, 'valuation'::text, 'realized'::text, 'distribution_paid'::text, 'fee_accrual'::text])))
);


--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_lines (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    entry_id text NOT NULL,
    account_code text NOT NULL,
    account_name text NOT NULL,
    debit numeric(18,2) DEFAULT 0 NOT NULL,
    credit numeric(18,2) DEFAULT 0 NOT NULL,
    CONSTRAINT journal_lines_check CHECK (((debit >= (0)::numeric) AND (credit >= (0)::numeric))),
    CONSTRAINT journal_lines_check1 CHECK ((NOT ((debit > (0)::numeric) AND (credit > (0)::numeric))))
);


--
-- Name: kyc_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kyc_cases (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    created_by text,
    fund_id text,
    fund_lp_id text,
    subject_name text NOT NULL,
    subject_type text DEFAULT 'individual'::text NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    risk_level text DEFAULT 'unknown'::text NOT NULL,
    screened_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kyc_cases_risk_level_check CHECK ((risk_level = ANY (ARRAY['unknown'::text, 'low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT kyc_cases_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'cleared'::text, 'escalated'::text, 'rejected'::text]))),
    CONSTRAINT kyc_cases_subject_type_check CHECK ((subject_type = ANY (ARRAY['individual'::text, 'entity'::text])))
);


--
-- Name: kyc_document_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kyc_document_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id text NOT NULL,
    case_id text NOT NULL,
    doc_id text NOT NULL,
    lp_id text,
    filename text NOT NULL,
    content_type text NOT NULL,
    size_bytes integer NOT NULL,
    sha256 text NOT NULL,
    content_enc bytea NOT NULL,
    uploaded_by text DEFAULT 'lp'::text NOT NULL,
    superseded boolean DEFAULT false NOT NULL,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kyc_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kyc_documents (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    case_id text NOT NULL,
    doc_type text NOT NULL,
    label text,
    status text DEFAULT 'requested'::text NOT NULL,
    file_url text,
    requested_at timestamp with time zone DEFAULT now(),
    received_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kyc_documents_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'received'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: kyc_screening_hits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kyc_screening_hits (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    case_id text NOT NULL,
    list text NOT NULL,
    match_name text NOT NULL,
    program text,
    country text,
    score numeric(4,3) DEFAULT 0 NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text,
    source_url text,
    CONSTRAINT kyc_screening_hits_list_check CHECK ((list = ANY (ARRAY['sanctions'::text, 'pep'::text, 'adverse_media'::text]))),
    CONSTRAINT kyc_screening_hits_status_check CHECK ((status = ANY (ARRAY['open'::text, 'cleared'::text, 'confirmed'::text])))
);


--
-- Name: kyc_watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kyc_watchlist (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    name text NOT NULL,
    list text NOT NULL,
    program text,
    country text,
    CONSTRAINT kyc_watchlist_list_check CHECK ((list = ANY (ARRAY['sanctions'::text, 'pep'::text, 'adverse_media'::text])))
);


--
-- Name: legacy_drafts_cancel_backup_20261006; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legacy_drafts_cancel_backup_20261006 (
    id text NOT NULL,
    old_status text NOT NULL,
    cancelled_at timestamp with time zone DEFAULT now()
);


--
-- Name: legacy_owner_migration_backup_20261006; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legacy_owner_migration_backup_20261006 (
    tbl text NOT NULL,
    id text NOT NULL,
    old_user_id text,
    old_org_id text,
    old_board_id text,
    moved_at timestamp with time zone DEFAULT now()
);


--
-- Name: legal_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    doc_key text NOT NULL,
    title text NOT NULL,
    short_title text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    completion_pct numeric DEFAULT 0 NOT NULL,
    body_md text,
    review_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT legal_documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'reviewed'::text, 'approved'::text, 'filed'::text])))
);


--
-- Name: legal_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id uuid NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT legal_entities_kind_check CHECK ((kind = ANY (ARRAY['management_company'::text, 'general_partner'::text, 'fund'::text]))),
    CONSTRAINT legal_entities_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'filed'::text, 'dissolved'::text])))
);


--
-- Name: li_action_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_action_queue (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    sender_id text,
    campaign_id text,
    member_id text,
    crm_entry_id text,
    target_name text,
    target_url text NOT NULL,
    action_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending_approval'::text NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    scheduled_for timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    claimed_at timestamp with time zone,
    claimed_by text,
    completed_at timestamp with time zone,
    failed_reason text,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT li_action_queue_action_type_check CHECK ((action_type = ANY (ARRAY['connect_request'::text, 'message'::text, 'follow_up'::text, 'view_profile'::text, 'withdraw'::text]))),
    CONSTRAINT li_action_queue_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'queued'::text, 'claimed'::text, 'done'::text, 'failed'::text, 'skipped'::text, 'rejected'::text])))
);


--
-- Name: li_campaign_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_campaign_members (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    campaign_id text NOT NULL,
    user_id text NOT NULL,
    crm_entry_id text,
    target_url text NOT NULL,
    target_name text,
    current_step integer DEFAULT 0 NOT NULL,
    last_action_id text,
    last_action_at timestamp with time zone,
    state text DEFAULT 'active'::text NOT NULL,
    stopped_reason text,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    sender_id text,
    CONSTRAINT li_campaign_members_state_check CHECK ((state = ANY (ARRAY['active'::text, 'completed'::text, 'stopped'::text, 'replied'::text])))
);


--
-- Name: li_campaign_senders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_campaign_senders (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    campaign_id text NOT NULL,
    sender_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: li_campaign_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_campaign_steps (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    campaign_id text NOT NULL,
    step_order integer NOT NULL,
    action_type text NOT NULL,
    template text DEFAULT ''::text NOT NULL,
    delay_hours integer DEFAULT 0 NOT NULL,
    condition text DEFAULT 'any'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variants jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT li_campaign_steps_action_type_check CHECK ((action_type = ANY (ARRAY['connect_request'::text, 'message'::text, 'follow_up'::text]))),
    CONSTRAINT li_campaign_steps_condition_check CHECK ((condition = ANY (ARRAY['any'::text, 'if_accepted'::text, 'if_no_reply'::text]))),
    CONSTRAINT li_campaign_steps_delay_hours_check CHECK ((delay_hours >= 0))
);


--
-- Name: li_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_campaigns (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    sender_id text,
    full_auto boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_approve_connects boolean DEFAULT false NOT NULL,
    auto_approve_messages boolean DEFAULT false NOT NULL,
    CONSTRAINT li_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text])))
);


--
-- Name: li_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_conversations (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    sender_id text,
    thread_urn text,
    participant_url text,
    participant_name text,
    campaign_id text,
    member_id text,
    last_message_at timestamp with time zone,
    last_message_text text,
    last_direction text,
    unread boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT li_conversations_last_direction_check CHECK ((last_direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: li_lead_list_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_lead_list_members (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    list_id text NOT NULL,
    user_id text NOT NULL,
    target_url text NOT NULL,
    target_name text,
    headline text,
    company text,
    crm_entry_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: li_lead_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_lead_lists (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    shared_org_id text,
    CONSTRAINT li_lead_lists_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'csv'::text, 'connections'::text, 'search'::text, 'extension'::text])))
);


--
-- Name: li_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_messages (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    conversation_id text NOT NULL,
    user_id text NOT NULL,
    direction text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    sent_at timestamp with time zone,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT li_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: li_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_suppressions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    slug text NOT NULL,
    target_url text,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: linkedin_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linkedin_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    linkedin_url text NOT NULL,
    full_name text NOT NULL,
    headline text,
    company text,
    title text,
    location text,
    image_url text,
    degree smallint DEFAULT 1 NOT NULL,
    connected_at timestamp with time zone,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_user_id uuid,
    profile_slug text,
    profile_url text,
    first_name text,
    last_name text,
    firm text,
    firm_slug text,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    raw_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    summary text,
    notes text,
    previous_company text,
    previous_title text,
    job_changed_at timestamp with time zone
);


--
-- Name: linkedin_mutuals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linkedin_mutuals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    person_url text NOT NULL,
    mutual_url text,
    mutual_name text NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: linkedin_senders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linkedin_senders (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    display_name text NOT NULL,
    linkedin_url text,
    member_urn text,
    avatar_url text,
    status text DEFAULT 'active'::text NOT NULL,
    daily_connect_cap integer DEFAULT 20 NOT NULL,
    daily_message_cap integer DEFAULT 40 NOT NULL,
    working_hours_start smallint DEFAULT 8 NOT NULL,
    working_hours_end smallint DEFAULT 18 NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    warmup_started_at timestamp with time zone,
    last_action_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT linkedin_senders_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'restricted'::text, 'warming'::text]))),
    CONSTRAINT linkedin_senders_working_hours_end_check CHECK (((working_hours_end >= 1) AND (working_hours_end <= 24))),
    CONSTRAINT linkedin_senders_working_hours_start_check CHECK (((working_hours_start >= 0) AND (working_hours_start <= 23)))
);


--
-- Name: loan_covenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_covenants (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    loan_id text NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'financial'::text NOT NULL,
    requirement text,
    status text DEFAULT 'ok'::text NOT NULL,
    tested_at date,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT loan_covenants_kind_check CHECK ((kind = ANY (ARRAY['financial'::text, 'reporting'::text, 'affirmative'::text, 'negative'::text]))),
    CONSTRAINT loan_covenants_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'at_risk'::text, 'breached'::text, 'waived'::text])))
);


--
-- Name: loan_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_payments (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    loan_id text NOT NULL,
    paid_on date NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    principal_portion numeric(14,2) DEFAULT 0 NOT NULL,
    interest_portion numeric(14,2) DEFAULT 0 NOT NULL,
    kind text DEFAULT 'scheduled'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT loan_payments_kind_check CHECK ((kind = ANY (ARRAY['scheduled'::text, 'interest'::text, 'prepayment'::text, 'payoff'::text])))
);


--
-- Name: loans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loans (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    created_by text,
    borrower text NOT NULL,
    principal numeric(14,2) DEFAULT 0 NOT NULL,
    outstanding numeric(14,2),
    interest_rate numeric(6,3),
    origination_date date,
    maturity_date date,
    amortization text DEFAULT 'bullet'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_frequency text DEFAULT 'monthly'::text NOT NULL,
    CONSTRAINT loans_amortization_check CHECK ((amortization = ANY (ARRAY['bullet'::text, 'amortizing'::text, 'interest_only'::text, 'revolving'::text]))),
    CONSTRAINT loans_payment_frequency_check CHECK ((payment_frequency = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'semiannual'::text, 'annual'::text, 'bullet'::text]))),
    CONSTRAINT loans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'repaid'::text, 'default'::text, 'written_off'::text])))
);


--
-- Name: local_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.local_users (
    id text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text,
    role text DEFAULT 'founder'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_login_at timestamp with time zone,
    CONSTRAINT local_users_role_check CHECK ((role = ANY (ARRAY['founder'::text, 'vc'::text, 'admin'::text])))
);


--
-- Name: lp_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_accounts (
    lp_id text NOT NULL,
    fund_id text NOT NULL,
    user_id text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lp_capital_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_capital_calls (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    fund_id character varying NOT NULL,
    call_number integer NOT NULL,
    call_date timestamp without time zone NOT NULL,
    due_date timestamp without time zone NOT NULL,
    total_amount integer NOT NULL,
    purpose character varying,
    investment_name character varying,
    status character varying DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: lp_commitment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_commitment_events (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    partner_id text,
    fund_lp_id text,
    stage text NOT NULL,
    amount numeric(18,2),
    note text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lp_commitment_events_stage_check CHECK ((stage = ANY (ARRAY['invited'::text, 'viewed'::text, 'soft_committed'::text, 'docs_out'::text, 'signed'::text, 'funded'::text, 'declined'::text])))
);


--
-- Name: lp_commitments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_commitments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    lp_id character varying NOT NULL,
    fund_id character varying NOT NULL,
    commitment_amount integer NOT NULL,
    called_amount integer DEFAULT 0,
    uncalled_amount integer,
    distributed_amount integer DEFAULT 0,
    commitment_date timestamp without time zone NOT NULL,
    status character varying DEFAULT 'active'::character varying,
    ownership_percentage real,
    management_fee_rate real,
    carry_rate real,
    side_letter boolean DEFAULT false,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: lp_contact_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_contact_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    firm_match_id uuid,
    contact_id text,
    contact_name text,
    contact_email text,
    contact_title text,
    contact_linkedin text,
    score numeric(5,2),
    is_decision_maker boolean DEFAULT false,
    status text DEFAULT 'pending'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    fund_profile_id text,
    investor_id text,
    contact_type text,
    contact_location text,
    contact_sectors text,
    tier text,
    tags jsonb DEFAULT '[]'::jsonb,
    reasons jsonb DEFAULT '[]'::jsonb,
    why_this_lp text,
    factor_lp_type integer,
    factor_sector integer,
    factor_geo integer,
    factor_thesis_signals integer,
    factor_contact_quality integer,
    segments jsonb DEFAULT '[]'::jsonb,
    hnw_signals jsonb DEFAULT '[]'::jsonb,
    stage text DEFAULT 'identified'::text,
    owner text,
    factor_capacity integer,
    expected_ticket_usd double precision,
    gaps jsonb,
    confidence text,
    base_score numeric,
    shadow_factors jsonb
);


--
-- Name: lp_distributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_distributions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    fund_id character varying NOT NULL,
    distribution_date timestamp without time zone NOT NULL,
    total_amount integer NOT NULL,
    distribution_type character varying NOT NULL,
    source character varying,
    portfolio_company_name character varying,
    investment_id character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: lp_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id text NOT NULL,
    lp_id text,
    category text NOT NULL,
    title text NOT NULL,
    filename text NOT NULL,
    content_type text DEFAULT 'application/pdf'::text NOT NULL,
    size_bytes integer NOT NULL,
    sha256 text NOT NULL,
    content bytea NOT NULL,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lp_documents_category_check CHECK ((category = ANY (ARRAY['tax'::text, 'annual_statement'::text, 'notice'::text, 'other'::text])))
);


--
-- Name: lp_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_entities (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    firm_id character varying NOT NULL,
    name character varying NOT NULL,
    type character varying NOT NULL,
    contact_name character varying,
    contact_email character varying,
    contact_phone character varying,
    address text,
    country character varying,
    tax_id character varying,
    status character varying DEFAULT 'active'::character varying,
    kyc_status character varying DEFAULT 'pending'::character varying,
    accredited_investor boolean DEFAULT false,
    qualified_purchaser boolean DEFAULT false,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: lp_eval_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_eval_labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id text NOT NULL,
    fund_profile_id text,
    entity_key text NOT NULL,
    label text NOT NULL,
    source text DEFAULT 'founder_set'::text NOT NULL,
    note text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lp_eval_labels_label_check CHECK ((label = ANY (ARRAY['fit'::text, 'not_fit'::text])))
);


--
-- Name: lp_firm_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_firm_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    firm_id text NOT NULL,
    firm_name text,
    score numeric(5,2) NOT NULL,
    tier text,
    tier_label text,
    factor_sector integer,
    factor_stage numeric(5,4),
    factor_geography numeric(5,4),
    factor_fund_size numeric(5,4),
    factor_track_record numeric(5,4),
    reasoning text,
    status text DEFAULT 'pending'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    fund_profile_id text,
    firm_type text,
    firm_location text,
    firm_aum text,
    firm_aum_usd double precision,
    firm_sectors text,
    firm_website text,
    firm_linkedin text,
    tags jsonb DEFAULT '[]'::jsonb,
    reasons jsonb DEFAULT '[]'::jsonb,
    why_this_lp text,
    factor_lp_type integer,
    factor_aum integer,
    factor_geo integer,
    factor_thesis_signals integer,
    segments jsonb DEFAULT '[]'::jsonb,
    stage text DEFAULT 'identified'::text,
    owner text,
    expected_ticket_usd double precision,
    gaps jsonb,
    confidence text,
    base_score numeric,
    shadow_factors jsonb
);


--
-- Name: lp_information_sharing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_information_sharing (
    lp_id text NOT NULL,
    fund_id text NOT NULL,
    soi boolean DEFAULT true NOT NULL,
    deal_irr boolean DEFAULT false NOT NULL,
    fund_performance boolean DEFAULT false NOT NULL,
    cap_account boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lp_match_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_match_audit (
    id text NOT NULL,
    match_id text NOT NULL,
    match_type text NOT NULL,
    prev_stage text,
    new_stage text NOT NULL,
    notes text,
    user_id text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT lp_match_audit_match_type_check CHECK ((match_type = ANY (ARRAY['firm'::text, 'contact'::text])))
);


--
-- Name: lp_match_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_match_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id text NOT NULL,
    session_id uuid,
    match_kind text NOT NULL,
    match_id text,
    entity_key text NOT NULL,
    verdict text NOT NULL,
    reason text,
    note text,
    never_again boolean DEFAULT false NOT NULL,
    match_score numeric,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lp_match_feedback_match_kind_check CHECK ((match_kind = ANY (ARRAY['firm'::text, 'contact'::text]))),
    CONSTRAINT lp_match_feedback_verdict_check CHECK ((verdict = ANY (ARRAY['fit'::text, 'not_a_fit'::text, 'already_known'::text, 'wrong_data'::text])))
);


--
-- Name: lp_match_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_match_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_profile_id uuid NOT NULL,
    algorithm text DEFAULT 'balanced'::text,
    total_firms_matched integer DEFAULT 0,
    total_contacts_matched integer DEFAULT 0,
    filters_applied jsonb,
    status text DEFAULT 'completed'::text,
    created_at timestamp with time zone DEFAULT now(),
    fund_name text,
    total_firms_scored integer,
    total_contacts_scored integer,
    qualified_firms integer,
    qualified_contacts integer,
    contacts_with_email integer,
    anchor_candidates integer,
    tier_counts jsonb,
    duration_ms integer,
    user_id text,
    funnel_data jsonb,
    segment_counts jsonb,
    ai_enrichments_applied integer DEFAULT 0,
    duplicates_merged integer DEFAULT 0,
    engine_version text DEFAULT 'v1'::text,
    org_id text,
    source text DEFAULT 'page'::text NOT NULL,
    exclusion_counts jsonb,
    confidence_counts jsonb,
    parent_session_id uuid,
    run_options jsonb,
    progress jsonb,
    heartbeat_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    inputs_hash text,
    notify jsonb,
    handed_off boolean DEFAULT false NOT NULL,
    delivered_at timestamp with time zone,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    CONSTRAINT lp_match_sessions_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: lp_onboarding_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_onboarding_details (
    lp_id text NOT NULL,
    legal_name text NOT NULL,
    entity_type text NOT NULL,
    address text,
    country text,
    tax_residence text,
    tax_id_enc text,
    signatory_name text,
    confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by text,
    CONSTRAINT lp_onboarding_details_entity_type_check CHECK ((entity_type = ANY (ARRAY['individual'::text, 'company'::text, 'trust'::text, 'fund'::text, 'family_office'::text, 'other'::text])))
);


--
-- Name: lp_pipeline_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_pipeline_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    firm_match_id uuid,
    contact_match_id uuid,
    event_type text NOT NULL,
    event_data jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: lp_portal_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_portal_access_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_id uuid,
    lp_id text,
    path text,
    ip text,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lp_portal_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_portal_codes (
    id bigint NOT NULL,
    token_id uuid NOT NULL,
    lp_id text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lp_portal_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lp_portal_codes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lp_portal_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lp_portal_codes_id_seq OWNED BY public.lp_portal_codes.id;


--
-- Name: lp_portal_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_portal_sessions (
    id bigint NOT NULL,
    token_id uuid NOT NULL,
    lp_id text NOT NULL,
    session_hash text NOT NULL,
    ip text,
    expires_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lp_portal_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lp_portal_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lp_portal_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lp_portal_sessions_id_seq OWNED BY public.lp_portal_sessions.id;


--
-- Name: lp_portal_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_portal_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lp_id text NOT NULL,
    fund_id text NOT NULL,
    token_hash text NOT NULL,
    prefix text NOT NULL,
    label text,
    expires_at timestamp with time zone,
    revoked boolean DEFAULT false NOT NULL,
    last_seen_at timestamp with time zone,
    view_count integer DEFAULT 0 NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lp_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id text NOT NULL,
    lp_id text,
    lp_name text NOT NULL,
    as_of date NOT NULL,
    commitment numeric,
    called numeric,
    distributed numeric,
    nav numeric,
    source text DEFAULT 'statement_import'::text NOT NULL,
    import_id uuid,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lp_quarterly_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_quarterly_reports (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    quarter_end date NOT NULL,
    quarter_label text NOT NULL,
    content_md text,
    summary text,
    kpis_snapshot jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    sent_at timestamp with time zone,
    reviewed_by text,
    generated_by text,
    generator_model text,
    generation_ms integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT lp_quarterly_reports_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'sent'::text, 'archived'::text])))
);


--
-- Name: lp_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_reports (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    fund_id character varying NOT NULL,
    report_type character varying NOT NULL,
    period_start timestamp without time zone,
    period_end timestamp without time zone,
    title character varying NOT NULL,
    status character varying DEFAULT 'draft'::character varying,
    generated_by character varying,
    approved_by character varying,
    approved_at timestamp without time zone,
    pdf_url character varying,
    file_size integer,
    sent_to_lps boolean DEFAULT false,
    sent_at timestamp without time zone,
    notes text,
    report_data jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: lp_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id text NOT NULL,
    lp_id text NOT NULL,
    org_id text,
    kind text NOT NULL,
    body text NOT NULL,
    source text DEFAULT 'form'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    proposal_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    CONSTRAINT lp_requests_kind_check CHECK ((kind = ANY (ARRAY['redemption'::text, 'transfer'::text, 'details_change'::text, 'other'::text]))),
    CONSTRAINT lp_requests_source_check CHECK ((source = ANY (ARRAY['form'::text, 'assistant'::text]))),
    CONSTRAINT lp_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'seen'::text, 'closed'::text])))
);


--
-- Name: lp_scoring_factors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_scoring_factors (
    key text NOT NULL,
    label text NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'shadow'::text NOT NULL,
    weight numeric NOT NULL,
    decided_by text,
    decided_at timestamp with time zone,
    note text,
    evidence jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lp_scoring_factors_status_check CHECK ((status = ANY (ARRAY['shadow'::text, 'promoted'::text, 'retired'::text]))),
    CONSTRAINT lp_scoring_factors_weight_check CHECK (((weight >= (0)::numeric) AND (weight <= (15)::numeric)))
);


--
-- Name: lp_statement_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_statement_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id text NOT NULL,
    as_of date,
    raw_text text NOT NULL,
    positions jsonb DEFAULT '[]'::jsonb NOT NULL,
    confidence numeric,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_by text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lp_statement_imports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'dismissed'::text])))
);


--
-- Name: lp_subscription_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_subscription_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id text NOT NULL,
    package_id uuid,
    lp_id text,
    role text NOT NULL,
    title text,
    filename text NOT NULL,
    content_type text DEFAULT 'application/pdf'::text NOT NULL,
    size_bytes integer NOT NULL,
    sha256 text NOT NULL,
    content bytea NOT NULL,
    scanned boolean DEFAULT false NOT NULL,
    uploaded_by text,
    superseded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lp_subscription_files_role_check CHECK ((role = ANY (ARRAY['package_doc'::text, 'signed_copy'::text, 'countersigned_copy'::text])))
);


--
-- Name: lp_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_subscriptions (
    lp_id text NOT NULL,
    fund_id text NOT NULL,
    package_id uuid NOT NULL,
    commitment_amount numeric NOT NULL,
    share_class text,
    subscription_date date,
    status text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_by text,
    returned_at timestamp with time zone,
    ack_name text,
    ack_at timestamp with time zone,
    ack_ip text,
    ack_hashes jsonb,
    decided_at timestamp with time zone,
    decided_by text,
    rejection_reason text,
    CONSTRAINT lp_subscriptions_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'returned'::text, 'countersigned'::text, 'rejected'::text])))
);


--
-- Name: lp_terms_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_terms_acceptances (
    id bigint NOT NULL,
    lp_id text NOT NULL,
    version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    ip text,
    user_agent_hash text
);


--
-- Name: lp_terms_acceptances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lp_terms_acceptances_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lp_terms_acceptances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lp_terms_acceptances_id_seq OWNED BY public.lp_terms_acceptances.id;


--
-- Name: lp_verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lp_verification (
    lp_id text NOT NULL,
    fund_id text NOT NULL,
    case_id text,
    investor_category text,
    owners_enc text,
    declared_at timestamp with time zone,
    submitted_at timestamp with time zone,
    CONSTRAINT lp_verification_investor_category_check CHECK ((investor_category = ANY (ARRAY['professional'::text, 'semi_professional'::text, 'other'::text, 'unsure'::text])))
);


--
-- Name: market_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_signals (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    investor_id text,
    investor_name text,
    firm_name text,
    signal_type text,
    title text NOT NULL,
    detail text,
    sector text,
    stage text,
    location text,
    source text DEFAULT 'derived'::text,
    url text,
    score integer DEFAULT 0,
    signal_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: match_outcome_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_outcome_events (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text,
    event_type text NOT NULL,
    source text NOT NULL,
    subject_id text NOT NULL,
    firm_id text,
    investor_id text,
    match_score integer,
    prev_stage text,
    new_stage text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT match_outcome_events_event_type_check CHECK ((event_type = ANY (ARRAY['match_shown'::text, 'contacted'::text, 'replied'::text, 'committed'::text, 'declined'::text]))),
    CONSTRAINT match_outcome_events_source_check CHECK ((source = ANY (ARRAY['crm_entry'::text, 'lp_firm_match'::text, 'lp_contact_match'::text, 'outreach'::text, 'founder_match'::text])))
);


--
-- Name: match_pipeline_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_pipeline_actions (
    id character varying(255) DEFAULT gen_random_uuid() NOT NULL,
    match_id character varying(255) NOT NULL,
    session_id character varying(255) NOT NULL,
    user_id character varying(255),
    action character varying(50) NOT NULL,
    previous_status character varying(50),
    new_status character varying(50) NOT NULL,
    reason text,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: match_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_sessions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    startup_id character varying NOT NULL,
    user_id character varying,
    label character varying,
    total_matches integer DEFAULT 0,
    source character varying DEFAULT 'standard'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    startup_name character varying,
    mode character varying DEFAULT 'standard'::character varying,
    total_candidates integer DEFAULT 0,
    matches_returned integer DEFAULT 0,
    tier_counts jsonb,
    weights jsonb,
    duration_ms integer,
    algorithm_id character varying(255),
    algorithm_name character varying(255),
    used_data_room_content boolean DEFAULT false,
    data_room_documents_used integer DEFAULT 0
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matches (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    startup_id character varying NOT NULL,
    firm_id character varying,
    investor_id character varying,
    contact_id character varying,
    match_score integer,
    match_reasons jsonb DEFAULT '[]'::jsonb,
    status character varying DEFAULT 'suggested'::character varying,
    founder_notes text,
    predicted_interest integer,
    user_feedback jsonb,
    sentiment_analysis jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    session_id character varying
);


--
-- Name: matching_algorithms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matching_algorithms (
    id character varying(255) DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    category character varying(50) DEFAULT 'general'::character varying,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    weights jsonb DEFAULT '{}'::jsonb,
    thresholds jsonb DEFAULT '{}'::jsonb,
    features jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: matching_weight_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matching_weight_history (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    weights jsonb NOT NULL,
    previous_weights jsonb,
    trigger_type character varying NOT NULL,
    trigger_details jsonb,
    signal_counts jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    scope text,
    metrics jsonb,
    engine text
);


--
-- Name: mc_actuals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mc_actuals (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    occurred_on date NOT NULL,
    category text NOT NULL,
    amount numeric(18,2) NOT NULL,
    memo text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mc_budget_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mc_budget_lines (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    year integer NOT NULL,
    category text NOT NULL,
    planned_amount numeric(18,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mcp_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_tokens (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    token_hash text NOT NULL,
    user_id text NOT NULL,
    workspace_id text,
    readonly boolean DEFAULT false NOT NULL,
    tools text[],
    label text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone
);


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    id text NOT NULL,
    user_id text NOT NULL,
    org_id text NOT NULL,
    org_role text NOT NULL,
    persona text,
    can_send_outreach boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    contact_email text,
    CONSTRAINT memberships_org_role_check CHECK ((org_role = ANY (ARRAY['workspace_owner'::text, 'admin'::text, 'member'::text, 'viewer'::text]))),
    CONSTRAINT memberships_persona_check CHECK ((persona = ANY (ARRAY['founder'::text, 'vc'::text, 'lp'::text])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: model_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_prices (
    model text NOT NULL,
    provider text,
    price_in numeric NOT NULL,
    price_out numeric NOT NULL,
    note text,
    verified boolean DEFAULT false NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT model_prices_price_in_check CHECK ((price_in >= (0)::numeric)),
    CONSTRAINT model_prices_price_out_check CHECK ((price_out >= (0)::numeric))
);


--
-- Name: neon_bak_investment_firms_2026_06_01_2226; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.neon_bak_investment_firms_2026_06_01_2226 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text,
    website character varying,
    logo character varying,
    type character varying,
    aum character varying,
    location character varying,
    stages jsonb DEFAULT '[]'::jsonb,
    sectors jsonb DEFAULT '[]'::jsonb,
    check_size_min integer,
    check_size_max integer,
    portfolio_count integer,
    linkedin_url character varying,
    twitter_url character varying,
    created_at timestamp without time zone DEFAULT now(),
    folk_id character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb DEFAULT '[]'::jsonb,
    folk_updated_at timestamp without time zone,
    source character varying,
    updated_at timestamp without time zone DEFAULT now(),
    hq_location character varying,
    industry character varying,
    emails jsonb,
    phones jsonb,
    addresses jsonb,
    urls jsonb,
    funding_raised character varying,
    last_funding_date character varying,
    foundation_year character varying,
    employee_range character varying,
    status character varying,
    folk_custom_fields jsonb,
    url_1 character varying,
    url_2 character varying,
    firm_classification character varying,
    typical_check_size character varying,
    enrichment_status character varying DEFAULT 'not_enriched'::character varying,
    last_enrichment_date timestamp without time zone,
    enrichment_error text,
    logo_url text
);


--
-- Name: neon_bak_investment_firms_2026_07_25_1512; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.neon_bak_investment_firms_2026_07_25_1512 (
    id character varying,
    name character varying,
    description text,
    website character varying,
    logo character varying,
    type character varying,
    aum character varying,
    location character varying,
    stages jsonb,
    sectors jsonb,
    check_size_min integer,
    check_size_max integer,
    portfolio_count integer,
    linkedin_url character varying,
    twitter_url character varying,
    created_at timestamp without time zone,
    folk_id character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb,
    folk_updated_at timestamp without time zone,
    source character varying,
    updated_at timestamp without time zone,
    hq_location character varying,
    industry character varying,
    emails jsonb,
    phones jsonb,
    addresses jsonb,
    urls jsonb,
    funding_raised character varying,
    last_funding_date character varying,
    foundation_year character varying,
    employee_range character varying,
    status character varying,
    folk_custom_fields jsonb,
    url_1 character varying,
    url_2 character varying,
    firm_classification character varying,
    typical_check_size character varying,
    enrichment_status character varying,
    last_enrichment_date timestamp without time zone,
    enrichment_error text,
    logo_url text,
    metadata jsonb
);


--
-- Name: neon_bak_investors_2026_06_01_2226; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.neon_bak_investors_2026_06_01_2226 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    firm_id character varying,
    first_name character varying NOT NULL,
    last_name character varying,
    email character varying,
    phone character varying,
    title character varying,
    linkedin_url character varying,
    twitter_url character varying,
    avatar character varying,
    bio text,
    stages jsonb DEFAULT '[]'::jsonb,
    sectors jsonb DEFAULT '[]'::jsonb,
    location character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    folk_id character varying,
    source character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb DEFAULT '[]'::jsonb,
    folk_updated_at timestamp without time zone,
    person_linkedin_url character varying,
    investor_type character varying,
    investor_state character varying,
    investor_country character varying,
    fund_hq character varying,
    hq_location character varying,
    funding_stage character varying,
    typical_investment character varying,
    num_lead_investments integer,
    total_investments integer,
    recent_investments text,
    status character varying,
    website character varying,
    folk_custom_fields jsonb,
    address character varying,
    enrichment_status text,
    last_enrichment_date timestamp without time zone,
    investment_thesis text,
    preferred_stages jsonb DEFAULT '[]'::jsonb,
    preferred_sectors jsonb DEFAULT '[]'::jsonb,
    typical_check_size character varying,
    focus_niches jsonb DEFAULT '[]'::jsonb,
    geography_focus jsonb DEFAULT '[]'::jsonb,
    portfolio_count integer
);


--
-- Name: neon_del_firms_2026_06_01_2228; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.neon_del_firms_2026_06_01_2228 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text,
    website character varying,
    logo character varying,
    type character varying,
    aum character varying,
    location character varying,
    stages jsonb DEFAULT '[]'::jsonb,
    sectors jsonb DEFAULT '[]'::jsonb,
    check_size_min integer,
    check_size_max integer,
    portfolio_count integer,
    linkedin_url character varying,
    twitter_url character varying,
    created_at timestamp without time zone DEFAULT now(),
    folk_id character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb DEFAULT '[]'::jsonb,
    folk_updated_at timestamp without time zone,
    source character varying,
    updated_at timestamp without time zone DEFAULT now(),
    hq_location character varying,
    industry character varying,
    emails jsonb,
    phones jsonb,
    addresses jsonb,
    urls jsonb,
    funding_raised character varying,
    last_funding_date character varying,
    foundation_year character varying,
    employee_range character varying,
    status character varying,
    folk_custom_fields jsonb,
    url_1 character varying,
    url_2 character varying,
    firm_classification character varying,
    typical_check_size character varying,
    enrichment_status character varying DEFAULT 'not_enriched'::character varying,
    last_enrichment_date timestamp without time zone,
    enrichment_error text,
    logo_url text
);


--
-- Name: neon_del_investors_2026_06_01_2228; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.neon_del_investors_2026_06_01_2228 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    firm_id character varying,
    first_name character varying NOT NULL,
    last_name character varying,
    email character varying,
    phone character varying,
    title character varying,
    linkedin_url character varying,
    twitter_url character varying,
    avatar character varying,
    bio text,
    stages jsonb DEFAULT '[]'::jsonb,
    sectors jsonb DEFAULT '[]'::jsonb,
    location character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    folk_id character varying,
    source character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb DEFAULT '[]'::jsonb,
    folk_updated_at timestamp without time zone,
    person_linkedin_url character varying,
    investor_type character varying,
    investor_state character varying,
    investor_country character varying,
    fund_hq character varying,
    hq_location character varying,
    funding_stage character varying,
    typical_investment character varying,
    num_lead_investments integer,
    total_investments integer,
    recent_investments text,
    status character varying,
    website character varying,
    folk_custom_fields jsonb,
    address character varying,
    enrichment_status text,
    last_enrichment_date timestamp without time zone,
    investment_thesis text,
    preferred_stages jsonb DEFAULT '[]'::jsonb,
    preferred_sectors jsonb DEFAULT '[]'::jsonb,
    typical_check_size character varying,
    focus_niches jsonb DEFAULT '[]'::jsonb,
    geography_focus jsonb DEFAULT '[]'::jsonb,
    portfolio_count integer
);


--
-- Name: neon_fix_firms_2026_06_01_2228; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.neon_fix_firms_2026_06_01_2228 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text,
    website character varying,
    logo character varying,
    type character varying,
    aum character varying,
    location character varying,
    stages jsonb DEFAULT '[]'::jsonb,
    sectors jsonb DEFAULT '[]'::jsonb,
    check_size_min integer,
    check_size_max integer,
    portfolio_count integer,
    linkedin_url character varying,
    twitter_url character varying,
    created_at timestamp without time zone DEFAULT now(),
    folk_id character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb DEFAULT '[]'::jsonb,
    folk_updated_at timestamp without time zone,
    source character varying,
    updated_at timestamp without time zone DEFAULT now(),
    hq_location character varying,
    industry character varying,
    emails jsonb,
    phones jsonb,
    addresses jsonb,
    urls jsonb,
    funding_raised character varying,
    last_funding_date character varying,
    foundation_year character varying,
    employee_range character varying,
    status character varying,
    folk_custom_fields jsonb,
    url_1 character varying,
    url_2 character varying,
    firm_classification character varying,
    typical_check_size character varying,
    enrichment_status character varying DEFAULT 'not_enriched'::character varying,
    last_enrichment_date timestamp without time zone,
    enrichment_error text,
    logo_url text
);


--
-- Name: neon_fix_investors_2026_06_01_2228; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.neon_fix_investors_2026_06_01_2228 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    firm_id character varying,
    first_name character varying NOT NULL,
    last_name character varying,
    email character varying,
    phone character varying,
    title character varying,
    linkedin_url character varying,
    twitter_url character varying,
    avatar character varying,
    bio text,
    stages jsonb DEFAULT '[]'::jsonb,
    sectors jsonb DEFAULT '[]'::jsonb,
    location character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    folk_id character varying,
    source character varying,
    folk_workspace_id character varying,
    folk_list_ids jsonb DEFAULT '[]'::jsonb,
    folk_updated_at timestamp without time zone,
    person_linkedin_url character varying,
    investor_type character varying,
    investor_state character varying,
    investor_country character varying,
    fund_hq character varying,
    hq_location character varying,
    funding_stage character varying,
    typical_investment character varying,
    num_lead_investments integer,
    total_investments integer,
    recent_investments text,
    status character varying,
    website character varying,
    folk_custom_fields jsonb,
    address character varying,
    enrichment_status text,
    last_enrichment_date timestamp without time zone,
    investment_thesis text,
    preferred_stages jsonb DEFAULT '[]'::jsonb,
    preferred_sectors jsonb DEFAULT '[]'::jsonb,
    typical_check_size character varying,
    focus_niches jsonb DEFAULT '[]'::jsonb,
    geography_focus jsonb DEFAULT '[]'::jsonb,
    portfolio_count integer
);


--
-- Name: news_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_articles (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    slug character varying NOT NULL,
    headline character varying NOT NULL,
    executive_summary text,
    content text NOT NULL,
    author character varying DEFAULT 'Anker Intelligence'::character varying,
    blog_type character varying DEFAULT 'Insights'::character varying,
    image_url character varying,
    capital_type character varying,
    capital_stage character varying,
    geography character varying,
    event_type character varying,
    tags text[] DEFAULT '{}'::text[],
    sources jsonb DEFAULT '[]'::jsonb,
    confidence_score real DEFAULT 0,
    ai_model character varying DEFAULT 'mistral'::character varying,
    generation_time_ms integer,
    word_count integer,
    status character varying DEFAULT 'draft'::character varying,
    published_at timestamp without time zone,
    scheduled_for timestamp without time zone,
    scheduled_slot character varying,
    view_count integer DEFAULT 0,
    source_item_ids text[] DEFAULT '{}'::text[],
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    source_type character varying DEFAULT 'ai'::character varying,
    pdf_object_path character varying,
    pdf_filename character varying,
    extracted_text text,
    source_pdf_url text,
    created_by text,
    sentiment text,
    CONSTRAINT news_articles_sentiment_check CHECK (((sentiment IS NULL) OR (sentiment = ANY (ARRAY['bullish'::text, 'neutral'::text, 'bearish'::text])))),
    CONSTRAINT news_articles_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: news_generation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_generation_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    article_id character varying,
    scheduled_post_id character varying,
    agent_type character varying NOT NULL,
    action character varying NOT NULL,
    status character varying NOT NULL,
    input_data jsonb DEFAULT '{}'::jsonb,
    output_data jsonb DEFAULT '{}'::jsonb,
    prompt_used text,
    tokens_used integer,
    duration_ms integer,
    error_message text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: news_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_regions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    is_enabled boolean DEFAULT true,
    coordinates jsonb DEFAULT '{"lat": 0, "lng": 0}'::jsonb,
    countries text[] DEFAULT '{}'::text[],
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: news_scheduled_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_scheduled_posts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    scheduled_date character varying NOT NULL,
    slot character varying NOT NULL,
    content_type character varying NOT NULL,
    article_id character varying,
    status character varying DEFAULT 'pending'::character varying,
    skip_reason text,
    generation_attempts integer DEFAULT 0,
    published_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: news_source_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_source_items (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    source_id character varying NOT NULL,
    external_id character varying,
    headline character varying NOT NULL,
    summary text,
    content text,
    source_url character varying NOT NULL,
    published_at timestamp without time zone,
    entities jsonb DEFAULT '{}'::jsonb,
    capital_type character varying,
    capital_stage character varying,
    geography character varying,
    event_type character varying,
    relevance_score real DEFAULT 0,
    validation_status character varying DEFAULT 'pending'::character varying,
    validation_notes text,
    duplicate_of character varying,
    processed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: news_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_sources (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    type character varying NOT NULL,
    url character varying NOT NULL,
    category character varying NOT NULL,
    tier character varying DEFAULT 'tier2'::character varying,
    is_active boolean DEFAULT true,
    fetch_interval integer DEFAULT 3600,
    last_fetched_at timestamp without time zone,
    items_fetched integer DEFAULT 0,
    error_count integer DEFAULT 0,
    last_error text,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    is_enabled boolean DEFAULT true,
    content_tags text[] DEFAULT '{}'::text[],
    regions text[] DEFAULT '{}'::text[]
);


--
-- Name: news_themes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_themes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "position" integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    org_id text,
    kind text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    title text NOT NULL,
    body text,
    href text,
    dedupe_key text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'urgent'::text])))
);


--
-- Name: notifications_legacy_20260916; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications_legacy_20260916 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    type character varying NOT NULL,
    title character varying NOT NULL,
    message text,
    resource_type character varying,
    resource_id character varying,
    is_read boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: onboarding_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_drafts (
    user_id text NOT NULL,
    persona text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    step integer DEFAULT 0 NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id text,
    CONSTRAINT onboarding_drafts_persona_check CHECK ((persona = ANY (ARRAY['founder'::text, 'vc'::text])))
);


--
-- Name: option_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.option_grants (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id text NOT NULL,
    grantee_name text NOT NULL,
    grantee_email text,
    options integer DEFAULT 0 NOT NULL,
    strike_price numeric(12,4),
    grant_date date,
    vest_months integer DEFAULT 48 NOT NULL,
    cliff_months integer DEFAULT 12 NOT NULL,
    status text DEFAULT 'granted'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    vesting_start date,
    terminated_on date,
    exercised_options integer DEFAULT 0 NOT NULL,
    CONSTRAINT option_grants_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'granted'::text, 'exercised'::text, 'cancelled'::text])))
);


--
-- Name: option_pools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.option_pools (
    company_id text NOT NULL,
    authorized integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: outreach_campaign_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_campaign_members (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    campaign_id text NOT NULL,
    user_id text NOT NULL,
    crm_entry_id text NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    snapshot jsonb,
    notes text,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    drafted_at timestamp with time zone,
    sent_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    score numeric,
    tier text,
    lp_type text,
    sources text[],
    selected boolean DEFAULT false NOT NULL,
    email text,
    email_status text,
    email_quality_reason text,
    contact_type text,
    score_details jsonb,
    sectors text,
    why_this_contact text,
    firm_intelligence text,
    investment_mandate text,
    personalisation_hook text,
    enriched_subject text,
    website_url text,
    website_title text,
    crawl_status text,
    multi_touch_note text,
    tags text,
    enrichment_status text,
    enriched_at timestamp with time zone,
    enrichment_batch integer,
    CONSTRAINT outreach_campaign_members_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'drafted'::text, 'sent'::text, 'skipped'::text, 'replied'::text])))
);


--
-- Name: outreach_campaign_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_campaign_schedules (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    campaign_id text NOT NULL,
    action_type text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    filter_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    executed_at timestamp with time zone,
    result_summary jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outreach_campaign_schedules_action_type_check CHECK ((action_type = ANY (ARRAY['send_batch'::text, 'send_openers_nudge'::text, 'send_bounces_retry'::text]))),
    CONSTRAINT outreach_campaign_schedules_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: outreach_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_campaigns (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    default_channel text DEFAULT 'multi'::text NOT NULL,
    default_template_id text,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cc_emails jsonb DEFAULT '[]'::jsonb,
    bcc_emails jsonb DEFAULT '[]'::jsonb,
    signature text,
    default_send_provider text,
    default_send_account_id text,
    event_slug text,
    event_date date,
    event_url text,
    event_topic text,
    cc_addresses text[],
    bcc_addresses text[],
    shortlist_config jsonb,
    CONSTRAINT outreach_campaigns_default_channel_check CHECK ((default_channel = ANY (ARRAY['email'::text, 'linkedin'::text, 'multi'::text]))),
    CONSTRAINT outreach_campaigns_default_send_provider_check CHECK (((default_send_provider = ANY (ARRAY['resend'::text, 'gmail'::text])) OR (default_send_provider IS NULL))),
    CONSTRAINT outreach_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'done'::text])))
);


--
-- Name: COLUMN outreach_campaigns.cc_emails; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outreach_campaigns.cc_emails IS 'Email addresses CCed on every send for this campaign. JSON array of strings.';


--
-- Name: COLUMN outreach_campaigns.bcc_emails; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outreach_campaigns.bcc_emails IS 'Email addresses BCCed on every send for this campaign. JSON array of strings.';


--
-- Name: COLUMN outreach_campaigns.signature; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outreach_campaigns.signature IS 'Appended to every email draft generated for this campaign. Plain text; URLs auto-linkified at send.';


--
-- Name: COLUMN outreach_campaigns.default_send_provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outreach_campaigns.default_send_provider IS 'When set, every send for this campaign uses this provider (resend or gmail). null = legacy Resend behaviour.';


--
-- Name: COLUMN outreach_campaigns.default_send_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outreach_campaigns.default_send_account_id IS 'When provider=gmail, the email_oauth_accounts.id to send through. Required for gmail sends; ignored otherwise.';


--
-- Name: outreach_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_consents (
    id bigint NOT NULL,
    user_id text NOT NULL,
    email text NOT NULL,
    basis text NOT NULL,
    note text,
    attested_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT outreach_consents_basis_check CHECK ((basis = ANY (ARRAY['prior_express_consent'::text, 'existing_customer'::text])))
);


--
-- Name: outreach_consents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outreach_consents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outreach_consents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outreach_consents_id_seq OWNED BY public.outreach_consents.id;


--
-- Name: outreach_crawl_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_crawl_queue (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    campaign_id text NOT NULL,
    member_id text,
    linkedin_url text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_reason text,
    requested_by text,
    claimed_by text,
    crm_entry_id text,
    CONSTRAINT outreach_crawl_queue_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'claimed'::text, 'done'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: outreach_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_events (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    message_id text NOT NULL,
    kind text NOT NULL,
    url text,
    ip text,
    user_agent text,
    provider_event_id text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outreach_events_kind_check CHECK ((kind = ANY (ARRAY['open'::text, 'click'::text, 'bounce'::text, 'spam'::text, 'unsubscribe'::text, 'delivered'::text, 'sent_failed'::text])))
);


--
-- Name: outreach_reply_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_reply_deliveries (
    reply_id uuid NOT NULL,
    user_id text NOT NULL,
    status text NOT NULL,
    approved_draft text NOT NULL,
    first_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    outreach_message_id text,
    CONSTRAINT outreach_reply_deliveries_status_check CHECK ((status = ANY (ARRAY['sending'::text, 'sent'::text, 'queued'::text, 'failed'::text])))
);


--
-- Name: outreach_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_templates (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'custom'::text NOT NULL,
    channel text DEFAULT 'email'::text NOT NULL,
    subject_template text,
    body_template text NOT NULL,
    variables jsonb,
    forked_from text,
    is_default boolean DEFAULT false NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: outreaches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreaches (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    owner_id character varying,
    startup_id character varying,
    contact_id character varying,
    firm_id character varying,
    investor_id character varying,
    template_id character varying,
    email_subject character varying,
    email_body text,
    stage character varying DEFAULT 'draft'::character varying,
    sent_at timestamp without time zone,
    opened_at timestamp without time zone,
    replied_at timestamp without time zone,
    scheduled_call_at timestamp without time zone,
    notes text,
    sentiment_analysis jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    email_sent_at timestamp with time zone,
    email_opened_at timestamp with time zone,
    email_clicked_at timestamp with time zone,
    email_replied_at timestamp with time zone,
    email_bounced boolean DEFAULT false,
    tracking_id uuid DEFAULT gen_random_uuid()
);


--
-- Name: passport_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passport_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    doc_type text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    size_bytes integer NOT NULL,
    sha256 text NOT NULL,
    content_enc bytea NOT NULL,
    uploaded_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    superseded boolean DEFAULT false NOT NULL
);


--
-- Name: passport_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passport_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    relationship_id uuid NOT NULL,
    with_fund text NOT NULL,
    lp_id text NOT NULL,
    doc_type text NOT NULL,
    sha256 text NOT NULL,
    shared_by text NOT NULL,
    shared_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    retained boolean DEFAULT false NOT NULL,
    consent_version text
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    token character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: pitch_deck_analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pitch_deck_analyses (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    room_id character varying NOT NULL,
    document_id character varying,
    created_by character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying,
    checklist_items jsonb DEFAULT '[]'::jsonb,
    current_step integer DEFAULT 0,
    total_steps integer DEFAULT 10,
    overall_score integer,
    strengths jsonb DEFAULT '[]'::jsonb,
    weaknesses jsonb DEFAULT '[]'::jsonb,
    recommendations jsonb DEFAULT '[]'::jsonb,
    problem_score integer,
    solution_score integer,
    market_score integer,
    business_model_score integer,
    traction_score integer,
    team_score integer,
    financials_score integer,
    competition_score integer,
    ask_score integer,
    presentation_score integer,
    detailed_analysis jsonb DEFAULT '{}'::jsonb,
    summary text,
    tokens_used integer,
    model_used character varying,
    error_message text,
    created_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone
);


--
-- Name: pitch_decks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pitch_decks (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text,
    startup_id text,
    title text,
    file_url text,
    file_size bigint,
    slides_count integer,
    ai_analysis jsonb,
    ai_score numeric,
    version integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: plan_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_catalog (
    plan text NOT NULL,
    label text NOT NULL,
    features jsonb DEFAULT '{}'::jsonb NOT NULL,
    limits jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    persona text,
    status text DEFAULT 'active'::text NOT NULL,
    price_eur_month integer,
    price_eur_year integer,
    summary text
);


--
-- Name: planning_scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planning_scenarios (
    user_id text NOT NULL,
    org_id text NOT NULL,
    tool text NOT NULL,
    state jsonb NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT planning_scenarios_tool_check CHECK ((tool = ANY (ARRAY['runway'::text, 'cap-table'::text])))
);


--
-- Name: platform_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_api_keys (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    provider text NOT NULL,
    label text,
    secret_cipher text NOT NULL,
    last4 text,
    scope text DEFAULT 'platform'::text NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    rotated_at timestamp with time zone
);


--
-- Name: platform_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_flags (
    key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    rollout_pct integer DEFAULT 100 NOT NULL,
    description text,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_flags_rollout_pct_check CHECK (((rollout_pct >= 0) AND (rollout_pct <= 100)))
);


--
-- Name: portfolio_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_companies (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    website text,
    linkedin_url text,
    one_liner text,
    description text,
    sector text,
    sub_sector text,
    geography text,
    stage text,
    founded_year integer,
    first_check_at date,
    first_check_amount numeric(14,2),
    total_invested_amount numeric(14,2),
    ownership_pct numeric(6,4),
    last_round_at date,
    last_round_name text,
    last_round_valuation numeric(14,2),
    status text DEFAULT 'active'::text NOT NULL,
    owner_user_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT portfolio_companies_status_check CHECK ((status = ANY (ARRAY['active'::text, 'exited'::text, 'written_off'::text, 'on_watch'::text])))
);


--
-- Name: portfolio_kpi_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_kpi_extractions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_id text NOT NULL,
    company_id text,
    matched_name text,
    month_end date,
    cash_balance numeric,
    monthly_burn numeric,
    runway_months numeric,
    monthly_revenue numeric,
    revenue_growth_mom numeric,
    gross_margin_pct numeric,
    headcount integer,
    customers integer,
    arr numeric,
    highlights text,
    raw_text text NOT NULL,
    source text DEFAULT 'email_update'::text NOT NULL,
    confidence numeric,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_by text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT portfolio_kpi_extractions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'dismissed'::text])))
);


--
-- Name: portfolio_kpis_monthly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_kpis_monthly (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id text NOT NULL,
    month_end date NOT NULL,
    cash_balance numeric(14,2),
    monthly_burn numeric(14,2),
    runway_months numeric(6,1),
    monthly_revenue numeric(14,2),
    revenue_growth_mom numeric(6,3),
    gross_margin_pct numeric(6,3),
    headcount integer,
    customers integer,
    arr numeric(14,2),
    notes text,
    source text DEFAULT 'manual'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT portfolio_kpis_monthly_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'founder_form'::text, 'import_xlsx'::text, 'api'::text, 'email_update'::text])))
);


--
-- Name: portfolio_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_metrics (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    fund_id character varying NOT NULL,
    period_end timestamp without time zone NOT NULL,
    period_type character varying DEFAULT 'quarterly'::character varying NOT NULL,
    nav integer,
    total_value integer,
    total_cost integer,
    dpi real,
    rvpi real,
    tvpi real,
    irr real,
    gross_irr real,
    pme real,
    portfolio_company_count integer,
    active_company_count integer,
    exited_company_count integer,
    written_off_count integer,
    called_to_date integer,
    distributed_to_date integer,
    remaining_unfunded integer,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: potential_duplicates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.potential_duplicates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying NOT NULL,
    entity1_id character varying NOT NULL,
    entity2_id character varying NOT NULL,
    match_type character varying NOT NULL,
    similarity_score integer NOT NULL,
    match_details jsonb DEFAULT '{}'::jsonb,
    status character varying DEFAULT 'pending'::character varying,
    reviewed_by character varying,
    reviewed_at timestamp without time zone,
    merged_into_id character varying,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: private_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.private_artifacts (
    id text NOT NULL,
    user_id text NOT NULL,
    org_id text,
    filename text NOT NULL,
    content_type text NOT NULL,
    content bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    scope_key text,
    CONSTRAINT private_artifacts_content_check CHECK ((octet_length(content) <= 20971520))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id text NOT NULL,
    email text,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: provider_bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_bills (
    month date NOT NULL,
    provider text NOT NULL,
    amount_usd numeric NOT NULL,
    note text,
    entered_by text,
    entered_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_bills_amount_usd_check CHECK ((amount_usd >= (0)::numeric))
);


--
-- Name: relationship_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationship_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    relationship_id uuid NOT NULL,
    fund_id text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    size_bytes integer NOT NULL,
    sha256 text NOT NULL,
    content_enc bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: relationship_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationship_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    relationship_id uuid NOT NULL,
    fund_id text NOT NULL,
    document_id text NOT NULL,
    granted_by text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: relationship_meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationship_meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    relationship_id uuid NOT NULL,
    fund_id text NOT NULL,
    proposed_by text NOT NULL,
    starts_at timestamp with time zone,
    link text,
    note text,
    status text DEFAULT 'proposed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    CONSTRAINT relationship_meetings_check CHECK (((starts_at IS NOT NULL) OR (link IS NOT NULL))),
    CONSTRAINT relationship_meetings_proposed_by_check CHECK ((proposed_by = ANY (ARRAY['investor'::text, 'fund'::text]))),
    CONSTRAINT relationship_meetings_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text])))
);


--
-- Name: relationship_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationship_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    relationship_id uuid NOT NULL,
    fund_id text NOT NULL,
    sender text NOT NULL,
    sender_user_id text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT relationship_messages_body_len_check CHECK ((char_length(body) <= 4000)),
    CONSTRAINT relationship_messages_sender_check CHECK ((sender = ANY (ARRAY['investor'::text, 'fund'::text])))
);


--
-- Name: research_crawl_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.research_crawl_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    organization_id character varying,
    url character varying NOT NULL,
    action character varying NOT NULL,
    status character varying NOT NULL,
    http_status integer,
    robots_txt_checked boolean DEFAULT false,
    robots_txt_allowed boolean,
    policy_violation character varying,
    content_type character varying,
    content_length integer,
    document_id character varying,
    error_message text,
    duration_ms integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: research_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.research_documents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    organization_id character varying,
    source_type character varying NOT NULL,
    title character varying NOT NULL,
    document_type character varying NOT NULL,
    publication_date timestamp without time zone,
    url character varying NOT NULL,
    pdf_url character varying,
    hash_sha256 character varying,
    language character varying DEFAULT 'en'::character varying,
    sectors text[] DEFAULT '{}'::text[],
    subsectors text[] DEFAULT '{}'::text[],
    geography text[] DEFAULT '{}'::text[],
    time_horizon character varying,
    extracted_metrics jsonb DEFAULT '{}'::jsonb,
    confidence_score real DEFAULT 0,
    corroboration_count integer DEFAULT 0,
    recency_factor real DEFAULT 1,
    crawled_at timestamp without time zone,
    processed_at timestamp without time zone,
    processing_status character varying DEFAULT 'pending'::character varying,
    chunk_count integer DEFAULT 0,
    word_count integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: research_organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.research_organizations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    slug character varying NOT NULL,
    org_type character varying NOT NULL,
    tier character varying NOT NULL,
    trust_weight real DEFAULT 0.5,
    official_website character varying,
    verified_website character varying,
    website_confidence real DEFAULT 0,
    country character varying,
    is_active boolean DEFAULT true,
    crawl_policy jsonb DEFAULT '{"maxDepth": 3, "denyPaths": ["/login", "/subscribe", "/premium", "/api"], "rateLimit": 30, "allowPaths": ["/insights", "/publications", "/reports"], "noLoginBypass": true, "obeyRobotsTxt": true, "noPaywallBypass": true}'::jsonb,
    last_verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text,
    permissions jsonb DEFAULT '[]'::jsonb,
    is_system_role boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: saved_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_templates (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    template_slug text NOT NULL,
    filename text NOT NULL,
    notes text,
    blob_url text,
    ai_filled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    checksum text
);


--
-- Name: sender_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sender_profiles (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    raw_summary text,
    profile_set jsonb,
    built_profile text,
    generated_by text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);


--
-- Name: smoke_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smoke_runs (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sha text,
    base_url text,
    ok boolean NOT NULL,
    skipped integer DEFAULT 0 NOT NULL,
    failures jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: smoke_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.smoke_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: smoke_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.smoke_runs_id_seq OWNED BY public.smoke_runs.id;


--
-- Name: spv_portal_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spv_portal_tokens (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    subscription_id text NOT NULL,
    spv_id text NOT NULL,
    token_hash text NOT NULL,
    prefix text NOT NULL,
    label text,
    expires_at timestamp with time zone,
    revoked boolean DEFAULT false NOT NULL,
    last_seen_at timestamp with time zone,
    view_count integer DEFAULT 0 NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: spv_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spv_subscriptions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    spv_id text NOT NULL,
    investor_name text NOT NULL,
    investor_email text,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    subscribed_at date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT spv_subscriptions_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'committed'::text, 'signed'::text, 'funded'::text, 'declined'::text])))
);


--
-- Name: spvs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spvs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    created_by text,
    name text NOT NULL,
    deal_name text,
    target_amount numeric(14,2) DEFAULT 0 NOT NULL,
    committed_amount numeric(14,2) DEFAULT 0 NOT NULL,
    stage text DEFAULT 'forming'::text NOT NULL,
    lead text,
    close_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    carry_pct numeric(5,2) DEFAULT 20 NOT NULL,
    hurdle_pct numeric(5,2) DEFAULT 0 NOT NULL,
    CONSTRAINT spvs_stage_check CHECK ((stage = ANY (ARRAY['forming'::text, 'open'::text, 'closed'::text, 'wound_down'::text])))
);


--
-- Name: staff_login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_login_attempts (
    id bigint NOT NULL,
    email text NOT NULL,
    ip text,
    ok boolean NOT NULL,
    kind text DEFAULT 'password'::text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_login_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_login_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_login_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_login_attempts_id_seq OWNED BY public.staff_login_attempts.id;


--
-- Name: staff_mfa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_mfa (
    staff_id text NOT NULL,
    secret_enc text NOT NULL,
    enabled_at timestamp with time zone,
    backup_hashes text[] DEFAULT '{}'::text[] NOT NULL,
    last_used_step bigint
);


--
-- Name: staff_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_sessions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    staff_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    mfa_verified boolean DEFAULT false NOT NULL,
    ip text,
    user_agent text
);


--
-- Name: startup_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.startup_documents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    startup_id character varying NOT NULL,
    type character varying NOT NULL,
    name character varying NOT NULL,
    file_name character varying,
    file_size integer,
    mime_type character varying,
    storage_url character varying,
    content text,
    processing_status character varying DEFAULT 'pending'::character varying,
    extracted_data jsonb,
    insights jsonb,
    uploaded_at timestamp without time zone DEFAULT now(),
    processed_at timestamp without time zone,
    source_kind character varying DEFAULT 'file'::character varying NOT NULL,
    external_url character varying,
    external_url_title character varying,
    object_path character varying
);


--
-- Name: startup_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.startup_profiles (
    id text NOT NULL,
    org_id text NOT NULL,
    version integer NOT NULL,
    fields jsonb NOT NULL,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: startups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.startups (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    founder_id character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    tagline character varying,
    website character varying,
    logo character varying,
    stage character varying,
    industries jsonb DEFAULT '[]'::jsonb,
    location character varying,
    founded character varying,
    team_size integer,
    funding_status character varying,
    target_amount integer,
    amount_raised integer,
    valuation integer,
    pitch_deck_url character varying,
    demo_url character varying,
    revenue character varying,
    mrr integer,
    growth character varying,
    customers integer,
    twitter_url character varying,
    linkedin_url character varying,
    is_public boolean DEFAULT false,
    featured boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    profile_summary text,
    notes text,
    onboarding_data jsonb,
    matching_profile jsonb,
    founders jsonb DEFAULT '[]'::jsonb,
    niche_industry character varying,
    funding_target character varying,
    founder_linkedin character varying,
    target_geographies jsonb DEFAULT '[]'::jsonb,
    preferred_investor_types jsonb DEFAULT '[]'::jsonb,
    key_milestone character varying,
    org_id text,
    listed_at timestamp with time zone,
    listed_by text,
    listing_source text
);


--
-- Name: studio_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_projects (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    name text NOT NULL,
    one_liner text,
    sector text,
    lead_eir text,
    stage text DEFAULT 'idea'::text NOT NULL,
    budget_amount numeric(18,2),
    spent_amount numeric(18,2) DEFAULT 0 NOT NULL,
    started_at date,
    stage_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    company_id text,
    investment_id text,
    spun_out_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_projects_stage_check CHECK ((stage = ANY (ARRAY['idea'::text, 'validation'::text, 'build'::text, 'spun_out'::text, 'archived'::text])))
);


--
-- Name: submission_assessment_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submission_assessment_jobs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    submission_id text NOT NULL,
    phase text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    batch_provider_id text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT submission_assessment_jobs_phase_check CHECK ((phase = ANY (ARRAY['extract'::text, 'readiness'::text, 'match'::text, 'draft'::text, 'done'::text]))),
    CONSTRAINT submission_assessment_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscribers (
    id integer NOT NULL,
    email text NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: subscribers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscribers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscribers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscribers_id_seq OWNED BY public.subscribers.id;


--
-- Name: svs_sigreplace_bak_2026_06_02_1129; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.svs_sigreplace_bak_2026_06_02_1129 (
    id text NOT NULL,
    body_before text,
    ts timestamp with time zone DEFAULT now()
);


--
-- Name: sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    source character varying NOT NULL,
    sync_type character varying NOT NULL,
    status character varying NOT NULL,
    started_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    records_processed integer DEFAULT 0,
    records_created integer DEFAULT 0,
    records_updated integer DEFAULT 0,
    records_failed integer DEFAULT 0,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    initiated_by character varying
);


--
-- Name: syndicate_partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.syndicate_partners (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    lead_fund_id text NOT NULL,
    name text NOT NULL,
    firm text,
    email text,
    contact_id text,
    partner_type text DEFAULT 'angel'::text NOT NULL,
    sectors text,
    typical_ticket numeric(18,2),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT syndicate_partners_partner_type_check CHECK ((partner_type = ANY (ARRAY['angel'::text, 'family_office'::text, 'vc_fund'::text, 'corporate'::text, 'hnwi'::text, 'other'::text])))
);


--
-- Name: syndicates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.syndicates (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    spv_fund_id text NOT NULL,
    lead_fund_id text NOT NULL,
    deal_id text,
    company_name text NOT NULL,
    allocation_amount numeric(18,2),
    min_ticket numeric(18,2),
    carry_to_lead_pct numeric(7,5) DEFAULT 0.20 NOT NULL,
    platform_fee_pct numeric(7,5) DEFAULT 0 NOT NULL,
    target_close_date date,
    status text DEFAULT 'raising'::text NOT NULL,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT syndicates_status_check CHECK ((status = ANY (ARRAY['raising'::text, 'closing'::text, 'closed'::text, 'cancelled'::text])))
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key character varying NOT NULL,
    value text,
    description text,
    updated_by character varying,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id text NOT NULL,
    org_id text,
    assignee_id text NOT NULL,
    title text NOT NULL,
    entity_label text,
    stage text DEFAULT 'to_do'::text NOT NULL,
    priority text,
    due_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]))),
    CONSTRAINT tasks_stage_check CHECK ((stage = ANY (ARRAY['to_do'::text, 'in_progress'::text, 'review'::text, 'done'::text])))
);


--
-- Name: team_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_invitations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    team_id character varying NOT NULL,
    email character varying NOT NULL,
    role character varying DEFAULT 'viewer'::character varying NOT NULL,
    token character varying NOT NULL,
    invited_by character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    accepted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    team_id character varying NOT NULL,
    user_id character varying NOT NULL,
    role character varying DEFAULT 'viewer'::character varying NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb,
    invited_by character varying,
    invited_at timestamp without time zone DEFAULT now(),
    accepted_at timestamp without time zone,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    slug character varying,
    description text,
    type character varying NOT NULL,
    logo character varying,
    website character varying,
    owner_id character varying NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: telegram_bots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_bots (
    id text NOT NULL,
    org_id text NOT NULL,
    bot_user_id bigint NOT NULL,
    username text NOT NULL,
    token_enc text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text
);


--
-- Name: telegram_link_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_link_codes (
    code_hash text NOT NULL,
    user_id text NOT NULL,
    org_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bot_id text DEFAULT 'platform'::text NOT NULL
);


--
-- Name: telegram_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_links (
    id text NOT NULL,
    user_id text NOT NULL,
    org_id text NOT NULL,
    telegram_user_id bigint NOT NULL,
    chat_id bigint NOT NULL,
    telegram_username text,
    mode text DEFAULT 'read'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    anker_chat_id text,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_in_app_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bot_id text DEFAULT 'platform'::text NOT NULL,
    CONSTRAINT telegram_links_mode_check CHECK ((mode = ANY (ARRAY['write'::text, 'read'::text]))),
    CONSTRAINT telegram_links_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text, 'revoked'::text])))
);


--
-- Name: telegram_pending; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_pending (
    id text NOT NULL,
    link_id text NOT NULL,
    org_id text NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    text_enc text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
    CONSTRAINT telegram_pending_kind_check CHECK ((kind = ANY (ARRAY['voice'::text, 'file'::text])))
);


--
-- Name: telegram_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_prefs (
    link_id text NOT NULL,
    org_id text NOT NULL,
    approvals boolean DEFAULT false NOT NULL,
    replies boolean DEFAULT false NOT NULL,
    deadlines boolean DEFAULT false NOT NULL,
    quiet_start integer DEFAULT 22 NOT NULL,
    quiet_end integer DEFAULT 7 NOT NULL,
    tz text DEFAULT 'Europe/Berlin'::text NOT NULL,
    last_approvals_at timestamp with time zone DEFAULT now() NOT NULL,
    last_replies_at timestamp with time zone DEFAULT now() NOT NULL,
    last_deadlines_on date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    voice_replies boolean DEFAULT false NOT NULL,
    daily_brief boolean DEFAULT false NOT NULL,
    last_brief_on date,
    CONSTRAINT telegram_prefs_quiet_end_check CHECK (((quiet_end >= 0) AND (quiet_end <= 23))),
    CONSTRAINT telegram_prefs_quiet_start_check CHECK (((quiet_start >= 0) AND (quiet_start <= 23)))
);


--
-- Name: telegram_sent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_sent (
    chat_id bigint NOT NULL,
    message_id bigint NOT NULL,
    org_id text,
    kind text DEFAULT 'text'::text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    bot_id text DEFAULT 'platform'::text NOT NULL,
    CONSTRAINT telegram_sent_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'incoming'::text, 'voice_reply'::text, 'file'::text])))
);


--
-- Name: telegram_shown; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_shown (
    link_id text NOT NULL,
    org_id text NOT NULL,
    proposal_id text NOT NULL,
    shown_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_updates (
    update_id bigint NOT NULL,
    link_id text,
    org_id text,
    chat_id bigint,
    kind text DEFAULT 'text'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    payload_enc text,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    units integer,
    bot_id text DEFAULT 'platform'::text NOT NULL,
    CONSTRAINT telegram_updates_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'done'::text, 'failed'::text, 'dropped'::text])))
);


--
-- Name: tenant_entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_entitlements (
    org_id text NOT NULL,
    plan text,
    features jsonb DEFAULT '{}'::jsonb NOT NULL,
    limits jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    version integer DEFAULT 1 NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_lifecycle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_lifecycle (
    org_id text NOT NULL,
    state text NOT NULL,
    reason text,
    trial_ends_at timestamp with time zone,
    changed_by text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_lifecycle_state_check CHECK ((state = ANY (ARRAY['trial'::text, 'active'::text, 'paused'::text, 'offboarding'::text])))
);


--
-- Name: tenant_lifecycle_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_lifecycle_events (
    id bigint NOT NULL,
    org_id text NOT NULL,
    from_state text,
    to_state text NOT NULL,
    reason text,
    actor text,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_lifecycle_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_lifecycle_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_lifecycle_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_lifecycle_events_id_seq OWNED BY public.tenant_lifecycle_events.id;


--
-- Name: tenant_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_requests (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    org_id text NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    requested_by text,
    approved_by text,
    deadline_at timestamp with time zone,
    execute_after timestamp with time zone,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_requests_kind_check CHECK ((kind = ANY (ARRAY['export'::text, 'erasure'::text]))),
    CONSTRAINT tenant_requests_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'dry_run'::text, 'approved'::text, 'running'::text, 'done'::text, 'failed'::text, 'cancelled'::text, 'rejected'::text])))
);


--
-- Name: tenant_tombstones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_tombstones (
    id bigint NOT NULL,
    org_id text NOT NULL,
    org_name_hash text,
    request_id text NOT NULL,
    requested_by text,
    status text DEFAULT 'started'::text NOT NULL,
    counts jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    executed_at timestamp with time zone,
    CONSTRAINT tenant_tombstones_status_check CHECK ((status = ANY (ARRAY['started'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: tenant_tombstones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_tombstones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_tombstones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_tombstones_id_seq OWNED BY public.tenant_tombstones.id;


--
-- Name: term_grids; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.term_grids (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    deal_id text NOT NULL,
    version integer NOT NULL,
    security_type text,
    pre_money numeric(18,2),
    round_size numeric(18,2),
    check_amount numeric(18,2),
    pro_rata boolean,
    board_seat text,
    liquidation_pref text,
    other_terms text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: unit_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unit_prices (
    unit text NOT NULL,
    price_usd numeric NOT NULL,
    note text,
    verified boolean DEFAULT false NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT unit_prices_price_usd_check CHECK ((price_usd >= (0)::numeric))
);


--
-- Name: url_health_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.url_health_checks (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying NOT NULL,
    entity_id character varying NOT NULL,
    field_name character varying NOT NULL,
    original_url text,
    canonical_url text,
    http_status integer,
    redirect_chain jsonb DEFAULT '[]'::jsonb,
    health_status character varying DEFAULT 'pending'::character varying,
    confidence real DEFAULT 0,
    is_parked_domain boolean DEFAULT false,
    is_expired boolean DEFAULT false,
    has_login_only boolean DEFAULT false,
    domain_age integer,
    content_length integer,
    page_title text,
    last_checked_at timestamp without time zone,
    check_count integer DEFAULT 0,
    error_message text,
    processing_state character varying DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: url_health_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.url_health_jobs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entity_scope character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying,
    total_records integer DEFAULT 0,
    processed_records integer DEFAULT 0,
    valid_urls integer DEFAULT 0,
    broken_urls integer DEFAULT 0,
    repaired_urls integer DEFAULT 0,
    pending_review integer DEFAULT 0,
    include_auto_fix boolean DEFAULT true,
    confidence_threshold real DEFAULT 0.85,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    started_by character varying,
    error_message text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: url_repair_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.url_repair_candidates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    health_check_id character varying NOT NULL,
    candidate_url text NOT NULL,
    source character varying,
    ranking_score real DEFAULT 0,
    domain_similarity real DEFAULT 0,
    name_match_score real DEFAULT 0,
    is_https boolean DEFAULT false,
    appears_on_linkedin boolean DEFAULT false,
    disposition character varying DEFAULT 'pending'::character varying,
    reviewed_by character varying,
    reviewed_at timestamp without time zone,
    review_notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_events (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id text,
    cost_center text NOT NULL,
    unit text NOT NULL,
    qty numeric NOT NULL,
    unit_cost numeric,
    cost_usd numeric,
    cost_state text NOT NULL,
    source text NOT NULL,
    ref text,
    CONSTRAINT usage_events_cost_state_check CHECK ((cost_state = ANY (ARRAY['exact'::text, 'estimated'::text, 'unpriced'::text]))),
    CONSTRAINT usage_events_qty_check CHECK ((qty >= (0)::numeric))
);


--
-- Name: usage_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usage_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usage_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usage_events_id_seq OWNED BY public.usage_events.id;


--
-- Name: usage_warnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_warnings (
    org_id text NOT NULL,
    month date NOT NULL,
    threshold integer NOT NULL,
    used_usd numeric,
    limit_usd numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usage_warnings_threshold_check CHECK ((threshold = ANY (ARRAY[80, 100])))
);


--
-- Name: user_email_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_email_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    sender_email character varying,
    sender_name character varying,
    gmail_connected boolean DEFAULT false,
    google_access_token text,
    google_refresh_token text,
    google_token_expiry timestamp without time zone,
    calendar_sync_enabled boolean DEFAULT false,
    email_signature text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    role_id character varying NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    user_type character varying(50) DEFAULT 'founder'::character varying,
    openai_api_key text,
    anthropic_api_key text,
    mistral_api_key text,
    sendgrid_api_key text,
    sender_email character varying(255),
    sender_name character varying(255),
    company_name character varying(255),
    company_website character varying(255),
    company_industry character varying(255),
    company_stage character varying(100),
    company_description text,
    company_one_liner text,
    target_raise bigint,
    current_arr bigint,
    firm_name character varying(255),
    firm_type character varying(100),
    firm_aum bigint,
    investment_thesis text,
    preferred_stages text[],
    preferred_sectors text[],
    check_size_min bigint,
    check_size_max bigint,
    notification_email boolean DEFAULT true,
    notification_matches boolean DEFAULT true,
    notification_deals boolean DEFAULT true,
    notification_documents boolean DEFAULT false,
    notification_weekly boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email character varying,
    first_name character varying,
    last_name character varying,
    profile_image_url character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    user_type character varying,
    onboarding_completed timestamp without time zone,
    company_name character varying,
    job_title character varying,
    linkedin_url character varying,
    phone character varying,
    bio text,
    stage character varying,
    location character varying,
    firm_role character varying,
    check_size_min character varying,
    check_size_max character varying,
    industries jsonb DEFAULT '[]'::jsonb,
    preferred_stages jsonb DEFAULT '[]'::jsonb,
    investment_focus jsonb DEFAULT '[]'::jsonb,
    is_admin boolean DEFAULT false,
    password character varying,
    active_role character varying,
    subscription_tier character varying(50) DEFAULT 'free'::character varying,
    is_owner boolean DEFAULT false NOT NULL
);


--
-- Name: valuation_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valuation_snapshots (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    investment_id text NOT NULL,
    fund_id text NOT NULL,
    as_of_date date NOT NULL,
    fair_value numeric(18,2) NOT NULL,
    method text DEFAULT 'cost'::text NOT NULL,
    source text,
    note text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT valuation_snapshots_method_check CHECK ((method = ANY (ARRAY['cost'::text, 'last_round'::text, 'mark'::text, 'write_down'::text, 'write_off'::text, 'exit'::text])))
);


--
-- Name: valuations_409a; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valuations_409a (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id text NOT NULL,
    fair_market_value numeric(14,2),
    common_price numeric(12,4),
    method text DEFAULT 'OPM'::text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    valued_at date,
    expires_at date,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    common_shares numeric(18,4),
    preferred_shares numeric(18,4),
    liquidation_pref numeric(18,2),
    recent_price numeric(16,6),
    volatility numeric(7,4),
    risk_free_rate numeric(7,4),
    years_to_liquidity numeric(7,2),
    dlom numeric(7,4),
    equity_value numeric(18,2),
    CONSTRAINT valuations_409a_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'in_progress'::text, 'completed'::text, 'board_approved'::text, 'expired'::text])))
);


--
-- Name: vector_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vector_embeddings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying NOT NULL,
    entity_id character varying NOT NULL,
    embedding_type character varying NOT NULL,
    embedding jsonb NOT NULL,
    text_hash character varying NOT NULL,
    model character varying DEFAULT 'mistral-embed'::character varying,
    dimensions integer DEFAULT 1024,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: waterfall_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waterfall_runs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    fund_id text NOT NULL,
    run_number integer NOT NULL,
    inputs jsonb NOT NULL,
    outputs jsonb NOT NULL,
    distribution_id text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_access_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_access_events (
    id bigint NOT NULL,
    org_id text NOT NULL,
    actor_user_id text NOT NULL,
    action text NOT NULL,
    target_user_id text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_access_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.workspace_access_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.workspace_access_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: workspace_autonomy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_autonomy (
    org_id text NOT NULL,
    risk_class text NOT NULL,
    auto_commit boolean DEFAULT false NOT NULL,
    set_by text,
    set_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_autonomy_risk_class_check CHECK ((risk_class = ANY (ARRAY['R0'::text, 'R1'::text, 'R2'::text, 'R3'::text])))
);


--
-- Name: workspace_data_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_data_policy (
    org_id text NOT NULL,
    preset text DEFAULT 'standard'::text NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_data_policy_preset_check CHECK ((preset = ANY (ARRAY['standard'::text, 'eu_only'::text, 'no_external'::text])))
);


--
-- Name: workspace_decks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_decks (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    org_id text NOT NULL,
    template_key text NOT NULL,
    title text NOT NULL,
    context jsonb NOT NULL,
    slides jsonb NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id text NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    can_send_outreach boolean DEFAULT false NOT NULL,
    token_hash text NOT NULL,
    invited_by text NOT NULL,
    accepted_by text,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    delivery_status text DEFAULT 'link'::text NOT NULL,
    provider_id text,
    delivery_error text,
    CONSTRAINT workspace_invitations_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['link'::text, 'pending'::text, 'sent'::text, 'failed'::text]))),
    CONSTRAINT workspace_invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text, 'viewer'::text]))),
    CONSTRAINT workspace_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text])))
);


--
-- Name: workspace_ownership_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_ownership_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id text NOT NULL,
    from_user_id text NOT NULL,
    to_user_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '48:00:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT workspace_ownership_transfers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'cancelled'::text])))
);


--
-- Name: ai_calls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_calls ALTER COLUMN id SET DEFAULT nextval('public.ai_calls_id_seq'::regclass);


--
-- Name: ai_studio_credit_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_credit_ledger ALTER COLUMN id SET DEFAULT nextval('public.ai_studio_credit_ledger_id_seq'::regclass);


--
-- Name: alert_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_events ALTER COLUMN id SET DEFAULT nextval('public.alert_events_id_seq'::regclass);


--
-- Name: alert_incidents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_incidents ALTER COLUMN id SET DEFAULT nextval('public.alert_incidents_id_seq'::regclass);


--
-- Name: anker_chat_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anker_chat_events ALTER COLUMN id SET DEFAULT nextval('public.anker_chat_events_id_seq'::regclass);


--
-- Name: checklist_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_sessions ALTER COLUMN id SET DEFAULT nextval('public.checklist_sessions_id_seq'::regclass);


--
-- Name: crm_migration_report id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_migration_report ALTER COLUMN id SET DEFAULT nextval('public.crm_migration_report_id_seq'::regclass);


--
-- Name: cron_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_runs ALTER COLUMN id SET DEFAULT nextval('public.cron_runs_id_seq'::regclass);


--
-- Name: dependency_checks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dependency_checks ALTER COLUMN id SET DEFAULT nextval('public.dependency_checks_id_seq'::regclass);


--
-- Name: directory_candidates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_candidates ALTER COLUMN id SET DEFAULT nextval('public.directory_candidates_id_seq'::regclass);


--
-- Name: directory_tombstones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_tombstones ALTER COLUMN id SET DEFAULT nextval('public.directory_tombstones_id_seq'::regclass);


--
-- Name: eval_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_runs ALTER COLUMN id SET DEFAULT nextval('public.eval_runs_id_seq'::regclass);


--
-- Name: lp_portal_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_portal_codes ALTER COLUMN id SET DEFAULT nextval('public.lp_portal_codes_id_seq'::regclass);


--
-- Name: lp_portal_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_portal_sessions ALTER COLUMN id SET DEFAULT nextval('public.lp_portal_sessions_id_seq'::regclass);


--
-- Name: lp_terms_acceptances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_terms_acceptances ALTER COLUMN id SET DEFAULT nextval('public.lp_terms_acceptances_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: outreach_consents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_consents ALTER COLUMN id SET DEFAULT nextval('public.outreach_consents_id_seq'::regclass);


--
-- Name: smoke_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smoke_runs ALTER COLUMN id SET DEFAULT nextval('public.smoke_runs_id_seq'::regclass);


--
-- Name: staff_login_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_login_attempts ALTER COLUMN id SET DEFAULT nextval('public.staff_login_attempts_id_seq'::regclass);


--
-- Name: subscribers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers ALTER COLUMN id SET DEFAULT nextval('public.subscribers_id_seq'::regclass);


--
-- Name: tenant_lifecycle_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_lifecycle_events ALTER COLUMN id SET DEFAULT nextval('public.tenant_lifecycle_events_id_seq'::regclass);


--
-- Name: tenant_tombstones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_tombstones ALTER COLUMN id SET DEFAULT nextval('public.tenant_tombstones_id_seq'::regclass);


--
-- Name: usage_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events ALTER COLUMN id SET DEFAULT nextval('public.usage_events_id_seq'::regclass);


--
-- Name: accelerated_match_jobs accelerated_match_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accelerated_match_jobs
    ADD CONSTRAINT accelerated_match_jobs_pkey PRIMARY KEY (id);


--
-- Name: action_proposals action_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_proposals
    ADD CONSTRAINT action_proposals_pkey PRIMARY KEY (id);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: agent_events agent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_events
    ADD CONSTRAINT agent_events_pkey PRIMARY KEY (id);


--
-- Name: agent_executions agent_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_executions
    ADD CONSTRAINT agent_executions_pkey PRIMARY KEY (id);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: agent_settings agent_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_settings
    ADD CONSTRAINT agent_settings_pkey PRIMARY KEY (org_id, agent_id);


--
-- Name: ai_calls ai_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_calls
    ADD CONSTRAINT ai_calls_pkey PRIMARY KEY (id);


--
-- Name: ai_media_tasks ai_media_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_media_tasks
    ADD CONSTRAINT ai_media_tasks_pkey PRIMARY KEY (task_id);


--
-- Name: ai_processing_logs ai_processing_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_processing_logs
    ADD CONSTRAINT ai_processing_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_studio_artifacts ai_studio_artifacts_pipeline_id_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_artifacts
    ADD CONSTRAINT ai_studio_artifacts_pipeline_id_kind_key UNIQUE (pipeline_id, kind);


--
-- Name: ai_studio_artifacts ai_studio_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_artifacts
    ADD CONSTRAINT ai_studio_artifacts_pkey PRIMARY KEY (id);


--
-- Name: ai_studio_assets ai_studio_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_assets
    ADD CONSTRAINT ai_studio_assets_pkey PRIMARY KEY (id);


--
-- Name: ai_studio_consents ai_studio_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_consents
    ADD CONSTRAINT ai_studio_consents_pkey PRIMARY KEY (id);


--
-- Name: ai_studio_credit_ledger ai_studio_credit_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_credit_ledger
    ADD CONSTRAINT ai_studio_credit_ledger_pkey PRIMARY KEY (id);


--
-- Name: ai_studio_credit_rates ai_studio_credit_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_credit_rates
    ADD CONSTRAINT ai_studio_credit_rates_pkey PRIMARY KEY (model, resolution);


--
-- Name: ai_studio_jobs ai_studio_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_jobs
    ADD CONSTRAINT ai_studio_jobs_pkey PRIMARY KEY (id);


--
-- Name: ai_studio_jobs ai_studio_jobs_user_id_scope_key_request_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_jobs
    ADD CONSTRAINT ai_studio_jobs_user_id_scope_key_request_key_key UNIQUE (user_id, scope_key, request_key);


--
-- Name: ai_studio_pipelines ai_studio_pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_pipelines
    ADD CONSTRAINT ai_studio_pipelines_pkey PRIMARY KEY (id);


--
-- Name: ai_studio_pipelines ai_studio_pipelines_user_id_scope_key_request_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_pipelines
    ADD CONSTRAINT ai_studio_pipelines_user_id_scope_key_request_key_key UNIQUE (user_id, scope_key, request_key);


--
-- Name: ai_studio_reviews ai_studio_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_reviews
    ADD CONSTRAINT ai_studio_reviews_pkey PRIMARY KEY (id);


--
-- Name: ai_studio_scope_locks ai_studio_scope_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_scope_locks
    ADD CONSTRAINT ai_studio_scope_locks_pkey PRIMARY KEY (scope_key);


--
-- Name: ai_studio_stages ai_studio_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_stages
    ADD CONSTRAINT ai_studio_stages_pkey PRIMARY KEY (pipeline_id, ord);


--
-- Name: ai_subprocessors ai_subprocessors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_subprocessors
    ADD CONSTRAINT ai_subprocessors_pkey PRIMARY KEY (slug);


--
-- Name: alert_events alert_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_events
    ADD CONSTRAINT alert_events_pkey PRIMARY KEY (id);


--
-- Name: alert_heartbeat alert_heartbeat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_heartbeat
    ADD CONSTRAINT alert_heartbeat_pkey PRIMARY KEY (id);


--
-- Name: alert_incidents alert_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_incidents
    ADD CONSTRAINT alert_incidents_pkey PRIMARY KEY (id);


--
-- Name: alert_rule_settings alert_rule_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_rule_settings
    ADD CONSTRAINT alert_rule_settings_pkey PRIMARY KEY (rule_key);


--
-- Name: anker_chat_events anker_chat_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anker_chat_events
    ADD CONSTRAINT anker_chat_events_pkey PRIMARY KEY (id);


--
-- Name: anker_chats anker_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anker_chats
    ADD CONSTRAINT anker_chats_pkey PRIMARY KEY (id);


--
-- Name: archived_contacts archived_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_contacts
    ADD CONSTRAINT archived_contacts_pkey PRIMARY KEY (id);


--
-- Name: archived_investment_firms archived_investment_firms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_investment_firms
    ADD CONSTRAINT archived_investment_firms_pkey PRIMARY KEY (id);


--
-- Name: archived_investors archived_investors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_investors
    ADD CONSTRAINT archived_investors_pkey PRIMARY KEY (id);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: background_jobs background_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_jobs
    ADD CONSTRAINT background_jobs_pkey PRIMARY KEY (id);


--
-- Name: batch_enrichment_jobs batch_enrichment_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_enrichment_jobs
    ADD CONSTRAINT batch_enrichment_jobs_pkey PRIMARY KEY (id);


--
-- Name: billing_credit_ledger billing_credit_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_credit_ledger
    ADD CONSTRAINT billing_credit_ledger_pkey PRIMARY KEY (id);


--
-- Name: billing_customers billing_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_pkey PRIMARY KEY (org_id);


--
-- Name: billing_customers billing_customers_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_stripe_customer_id_key UNIQUE (stripe_customer_id);


--
-- Name: billing_subscriptions billing_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_pkey PRIMARY KEY (org_id);


--
-- Name: billing_subscriptions billing_subscriptions_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);


--
-- Name: businessmen businessmen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businessmen
    ADD CONSTRAINT businessmen_pkey PRIMARY KEY (id);


--
-- Name: calendar_meetings calendar_meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_meetings
    ADD CONSTRAINT calendar_meetings_pkey PRIMARY KEY (id);


--
-- Name: call_sync_devices call_sync_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sync_devices
    ADD CONSTRAINT call_sync_devices_pkey PRIMARY KEY (id);


--
-- Name: call_sync_devices call_sync_devices_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sync_devices
    ADD CONSTRAINT call_sync_devices_token_hash_key UNIQUE (token_hash);


--
-- Name: campaign_crm_entries campaign_crm_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_crm_entries
    ADD CONSTRAINT campaign_crm_entries_pkey PRIMARY KEY (id);


--
-- Name: campaign_interest_tokens campaign_interest_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_interest_tokens
    ADD CONSTRAINT campaign_interest_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: campaign_settings campaign_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_settings
    ADD CONSTRAINT campaign_settings_pkey PRIMARY KEY (id);


--
-- Name: capital_call_line_items capital_call_line_items_call_lp_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capital_call_line_items
    ADD CONSTRAINT capital_call_line_items_call_lp_unique UNIQUE (call_id, fund_lp_id);


--
-- Name: capital_call_line_items capital_call_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capital_call_line_items
    ADD CONSTRAINT capital_call_line_items_pkey PRIMARY KEY (id);


--
-- Name: capital_calls capital_calls_fund_call_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capital_calls
    ADD CONSTRAINT capital_calls_fund_call_number_unique UNIQUE (fund_id, call_number);


--
-- Name: capital_calls capital_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capital_calls
    ADD CONSTRAINT capital_calls_pkey PRIMARY KEY (id);


--
-- Name: checklist_sessions checklist_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_sessions
    ADD CONSTRAINT checklist_sessions_pkey PRIMARY KEY (id);


--
-- Name: comp_bands comp_bands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comp_bands
    ADD CONSTRAINT comp_bands_pkey PRIMARY KEY (id);


--
-- Name: company_audit_log company_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_audit_log
    ADD CONSTRAINT company_audit_log_pkey PRIMARY KEY (id);


--
-- Name: company_staff company_staff_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_staff
    ADD CONSTRAINT company_staff_email_key UNIQUE (email);


--
-- Name: company_staff company_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_staff
    ADD CONSTRAINT company_staff_pkey PRIMARY KEY (id);


--
-- Name: compliance_deadlines compliance_deadlines_fund_id_compliance_item_id_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_deadlines
    ADD CONSTRAINT compliance_deadlines_fund_id_compliance_item_id_year_key UNIQUE (fund_id, compliance_item_id, year);


--
-- Name: compliance_deadlines compliance_deadlines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_deadlines
    ADD CONSTRAINT compliance_deadlines_pkey PRIMARY KEY (id);


--
-- Name: compliance_fund_settings compliance_fund_settings_fund_id_compliance_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_fund_settings
    ADD CONSTRAINT compliance_fund_settings_fund_id_compliance_item_id_key UNIQUE (fund_id, compliance_item_id);


--
-- Name: compliance_fund_settings compliance_fund_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_fund_settings
    ADD CONSTRAINT compliance_fund_settings_pkey PRIMARY KEY (id);


--
-- Name: compliance_items compliance_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_items
    ADD CONSTRAINT compliance_items_pkey PRIMARY KEY (id);


--
-- Name: contact_submissions contact_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_submissions
    ADD CONSTRAINT contact_submissions_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: crm_activities crm_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_pkey PRIMARY KEY (id);


--
-- Name: crm_boards crm_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_boards
    ADD CONSTRAINT crm_boards_pkey PRIMARY KEY (id);


--
-- Name: crm_companies crm_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_pkey PRIMARY KEY (id);


--
-- Name: crm_deals crm_deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_pkey PRIMARY KEY (id);


--
-- Name: crm_entries crm_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_entries
    ADD CONSTRAINT crm_entries_pkey PRIMARY KEY (id);


--
-- Name: crm_migration_report crm_migration_report_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_migration_report
    ADD CONSTRAINT crm_migration_report_pkey PRIMARY KEY (id);


--
-- Name: crm_people crm_people_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_people
    ADD CONSTRAINT crm_people_pkey PRIMARY KEY (id);


--
-- Name: crm_saved_views crm_saved_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_saved_views
    ADD CONSTRAINT crm_saved_views_pkey PRIMARY KEY (id);


--
-- Name: crm_tasks crm_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_pkey PRIMARY KEY (id);


--
-- Name: cron_runs cron_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_runs
    ADD CONSTRAINT cron_runs_pkey PRIMARY KEY (id);


--
-- Name: data_room_access_grants data_room_access_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_access_grants
    ADD CONSTRAINT data_room_access_grants_pkey PRIMARY KEY (id);


--
-- Name: data_room_access_grants data_room_access_grants_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_access_grants
    ADD CONSTRAINT data_room_access_grants_token_key UNIQUE (token);


--
-- Name: data_room_document_views data_room_document_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_document_views
    ADD CONSTRAINT data_room_document_views_pkey PRIMARY KEY (id);


--
-- Name: data_room_documents data_room_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_documents
    ADD CONSTRAINT data_room_documents_pkey PRIMARY KEY (id);


--
-- Name: data_room_files data_room_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_files
    ADD CONSTRAINT data_room_files_pkey PRIMARY KEY (id);


--
-- Name: data_room_requests data_room_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_requests
    ADD CONSTRAINT data_room_requests_pkey PRIMARY KEY (id);


--
-- Name: database_backups database_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_backups
    ADD CONSTRAINT database_backups_pkey PRIMARY KEY (id);


--
-- Name: deal_documents deal_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_documents
    ADD CONSTRAINT deal_documents_pkey PRIMARY KEY (id);


--
-- Name: deal_evaluations deal_evaluations_deal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_evaluations
    ADD CONSTRAINT deal_evaluations_deal_id_key UNIQUE (deal_id);


--
-- Name: deal_evaluations deal_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_evaluations
    ADD CONSTRAINT deal_evaluations_pkey PRIMARY KEY (id);


--
-- Name: deal_feedback_events deal_feedback_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_feedback_events
    ADD CONSTRAINT deal_feedback_events_pkey PRIMARY KEY (id);


--
-- Name: deal_founders deal_founders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_founders
    ADD CONSTRAINT deal_founders_pkey PRIMARY KEY (id);


--
-- Name: deal_opportunities deal_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_opportunities
    ADD CONSTRAINT deal_opportunities_pkey PRIMARY KEY (id);


--
-- Name: deal_room_access_grants deal_room_access_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_access_grants
    ADD CONSTRAINT deal_room_access_grants_pkey PRIMARY KEY (id);


--
-- Name: deal_room_audit_events deal_room_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_audit_events
    ADD CONSTRAINT deal_room_audit_events_pkey PRIMARY KEY (id);


--
-- Name: deal_room_documents deal_room_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_documents
    ADD CONSTRAINT deal_room_documents_pkey PRIMARY KEY (id);


--
-- Name: deal_room_milestones deal_room_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_milestones
    ADD CONSTRAINT deal_room_milestones_pkey PRIMARY KEY (id);


--
-- Name: deal_room_nda_agreements deal_room_nda_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_nda_agreements
    ADD CONSTRAINT deal_room_nda_agreements_pkey PRIMARY KEY (id);


--
-- Name: deal_room_notes deal_room_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_notes
    ADD CONSTRAINT deal_room_notes_pkey PRIMARY KEY (id);


--
-- Name: deal_room_questions deal_room_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_questions
    ADD CONSTRAINT deal_room_questions_pkey PRIMARY KEY (id);


--
-- Name: deal_rooms deal_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_rooms
    ADD CONSTRAINT deal_rooms_pkey PRIMARY KEY (id);


--
-- Name: deal_rooms deal_rooms_startup_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_rooms
    ADD CONSTRAINT deal_rooms_startup_id_unique UNIQUE (startup_id);


--
-- Name: dealflow_prospects dealflow_prospects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealflow_prospects
    ADD CONSTRAINT dealflow_prospects_pkey PRIMARY KEY (id);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: deck_templates deck_templates_file_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_templates
    ADD CONSTRAINT deck_templates_file_key_key UNIQUE (file_key);


--
-- Name: deck_templates deck_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_templates
    ADD CONSTRAINT deck_templates_pkey PRIMARY KEY (id);


--
-- Name: decks decks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT decks_pkey PRIMARY KEY (id);


--
-- Name: dependency_checks dependency_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dependency_checks
    ADD CONSTRAINT dependency_checks_pkey PRIMARY KEY (id);


--
-- Name: directory_candidates directory_candidates_kind_a_id_b_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_candidates
    ADD CONSTRAINT directory_candidates_kind_a_id_b_id_key UNIQUE (kind, a_id, b_id);


--
-- Name: directory_candidates directory_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_candidates
    ADD CONSTRAINT directory_candidates_pkey PRIMARY KEY (id);


--
-- Name: directory_erasure_notices directory_erasure_notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_erasure_notices
    ADD CONSTRAINT directory_erasure_notices_pkey PRIMARY KEY (request_id, org_id);


--
-- Name: directory_hash_meta directory_hash_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_hash_meta
    ADD CONSTRAINT directory_hash_meta_pkey PRIMARY KEY (k);


--
-- Name: directory_sources directory_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_sources
    ADD CONSTRAINT directory_sources_pkey PRIMARY KEY (source);


--
-- Name: directory_tombstones directory_tombstones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_tombstones
    ADD CONSTRAINT directory_tombstones_pkey PRIMARY KEY (id);


--
-- Name: discovery_exports discovery_exports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_exports
    ADD CONSTRAINT discovery_exports_pkey PRIMARY KEY (id);


--
-- Name: discovery_facets discovery_facets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_facets
    ADD CONSTRAINT discovery_facets_pkey PRIMARY KEY (lens, kind, facet, value);


--
-- Name: discovery_saved_searches discovery_saved_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_saved_searches
    ADD CONSTRAINT discovery_saved_searches_pkey PRIMARY KEY (id);


--
-- Name: distribution_line_items distribution_line_items_dist_lp_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_line_items
    ADD CONSTRAINT distribution_line_items_dist_lp_unique UNIQUE (distribution_id, fund_lp_id);


--
-- Name: distribution_line_items distribution_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_line_items
    ADD CONSTRAINT distribution_line_items_pkey PRIMARY KEY (id);


--
-- Name: distributions distributions_fund_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributions
    ADD CONSTRAINT distributions_fund_number_unique UNIQUE (fund_id, distribution_number);


--
-- Name: distributions distributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributions
    ADD CONSTRAINT distributions_pkey PRIMARY KEY (id);


--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);


--
-- Name: document_extractions document_extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_extractions
    ADD CONSTRAINT document_extractions_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: dsar_requests dsar_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsar_requests
    ADD CONSTRAINT dsar_requests_pkey PRIMARY KEY (id);


--
-- Name: early_access_requests early_access_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.early_access_requests
    ADD CONSTRAINT early_access_requests_pkey PRIMARY KEY (id);


--
-- Name: email_oauth_accounts email_oauth_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_oauth_accounts
    ADD CONSTRAINT email_oauth_accounts_pkey PRIMARY KEY (id);


--
-- Name: email_oauth_accounts email_oauth_accounts_user_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_oauth_accounts
    ADD CONSTRAINT email_oauth_accounts_user_id_email_key UNIQUE (user_id, email);


--
-- Name: email_suppressions email_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_verifications email_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verifications
    ADD CONSTRAINT email_verifications_pkey PRIMARY KEY (email);


--
-- Name: enrichment_jobs enrichment_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_jobs
    ADD CONSTRAINT enrichment_jobs_pkey PRIMARY KEY (id);


--
-- Name: entity_memory entity_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_memory
    ADD CONSTRAINT entity_memory_pkey PRIMARY KEY (id);


--
-- Name: equity_filings equity_filings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_filings
    ADD CONSTRAINT equity_filings_pkey PRIMARY KEY (id);


--
-- Name: eval_runs eval_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_runs
    ADD CONSTRAINT eval_runs_pkey PRIMARY KEY (id);


--
-- Name: extension_tokens extension_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_tokens
    ADD CONSTRAINT extension_tokens_pkey PRIMARY KEY (id);


--
-- Name: extension_tokens extension_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_tokens
    ADD CONSTRAINT extension_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: fee_accruals fee_accruals_fund_id_period_end_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_accruals
    ADD CONSTRAINT fee_accruals_fund_id_period_end_key UNIQUE (fund_id, period_end);


--
-- Name: fee_accruals fee_accruals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_accruals
    ADD CONSTRAINT fee_accruals_pkey PRIMARY KEY (id);


--
-- Name: fee_schedules fee_schedules_fund_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedules
    ADD CONSTRAINT fee_schedules_fund_id_key UNIQUE (fund_id);


--
-- Name: fee_schedules fee_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedules
    ADD CONSTRAINT fee_schedules_pkey PRIMARY KEY (id);


--
-- Name: financial_reports financial_reports_fund_id_period_entity_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_reports
    ADD CONSTRAINT financial_reports_fund_id_period_entity_name_key UNIQUE (fund_id, period, entity_name);


--
-- Name: financial_reports financial_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_reports
    ADD CONSTRAINT financial_reports_pkey PRIMARY KEY (id);


--
-- Name: folk_failed_records folk_failed_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folk_failed_records
    ADD CONSTRAINT folk_failed_records_pkey PRIMARY KEY (id);


--
-- Name: folk_field_definitions folk_field_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folk_field_definitions
    ADD CONSTRAINT folk_field_definitions_pkey PRIMARY KEY (id);


--
-- Name: folk_field_mappings folk_field_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folk_field_mappings
    ADD CONSTRAINT folk_field_mappings_pkey PRIMARY KEY (id);


--
-- Name: folk_import_runs folk_import_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folk_import_runs
    ADD CONSTRAINT folk_import_runs_pkey PRIMARY KEY (id);


--
-- Name: folk_workspaces folk_workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folk_workspaces
    ADD CONSTRAINT folk_workspaces_pkey PRIMARY KEY (id);


--
-- Name: folk_workspaces folk_workspaces_workspace_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folk_workspaces
    ADD CONSTRAINT folk_workspaces_workspace_id_unique UNIQUE (workspace_id);


--
-- Name: forecast_scenarios forecast_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forecast_scenarios
    ADD CONSTRAINT forecast_scenarios_pkey PRIMARY KEY (id);


--
-- Name: forecast_scenarios forecast_scenarios_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forecast_scenarios
    ADD CONSTRAINT forecast_scenarios_user_id_name_key UNIQUE (user_id, name);


--
-- Name: founder_match_exclusions founder_match_exclusions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_match_exclusions
    ADD CONSTRAINT founder_match_exclusions_pkey PRIMARY KEY (org_id, entity_key);


--
-- Name: founder_match_results founder_match_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_match_results
    ADD CONSTRAINT founder_match_results_pkey PRIMARY KEY (run_id, kind, rank);


--
-- Name: founder_match_runs founder_match_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_match_runs
    ADD CONSTRAINT founder_match_runs_pkey PRIMARY KEY (id);


--
-- Name: founder_match_sessions founder_match_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_match_sessions
    ADD CONSTRAINT founder_match_sessions_pkey PRIMARY KEY (id);


--
-- Name: founder_notifications founder_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_notifications
    ADD CONSTRAINT founder_notifications_pkey PRIMARY KEY (id);


--
-- Name: founder_submissions founder_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_submissions
    ADD CONSTRAINT founder_submissions_pkey PRIMARY KEY (id);


--
-- Name: founder_submissions founder_submissions_public_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_submissions
    ADD CONSTRAINT founder_submissions_public_ref_key UNIQUE (public_ref);


--
-- Name: fund_analytics_snapshots fund_analytics_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_analytics_snapshots
    ADD CONSTRAINT fund_analytics_snapshots_pkey PRIMARY KEY (id);


--
-- Name: fund_assessment_history fund_assessment_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_assessment_history
    ADD CONSTRAINT fund_assessment_history_pkey PRIMARY KEY (id);


--
-- Name: fund_compliance_profile fund_compliance_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_compliance_profile
    ADD CONSTRAINT fund_compliance_profile_pkey PRIMARY KEY (fund_id);


--
-- Name: fund_connect_invites fund_connect_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_connect_invites
    ADD CONSTRAINT fund_connect_invites_pkey PRIMARY KEY (id);


--
-- Name: fund_intake_configs fund_intake_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_intake_configs
    ADD CONSTRAINT fund_intake_configs_pkey PRIMARY KEY (fund_id);


--
-- Name: fund_investments fund_investments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_investments
    ADD CONSTRAINT fund_investments_pkey PRIMARY KEY (id);


--
-- Name: fund_listings fund_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_listings
    ADD CONSTRAINT fund_listings_pkey PRIMARY KEY (fund_id);


--
-- Name: fund_lps fund_lps_name_per_fund_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_lps
    ADD CONSTRAINT fund_lps_name_per_fund_unique UNIQUE (fund_id, lp_name);


--
-- Name: fund_lps fund_lps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_lps
    ADD CONSTRAINT fund_lps_pkey PRIMARY KEY (id);


--
-- Name: fund_profiles fund_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_profiles
    ADD CONSTRAINT fund_profiles_pkey PRIMARY KEY (id);


--
-- Name: fund_relationships fund_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_relationships
    ADD CONSTRAINT fund_relationships_pkey PRIMARY KEY (id);


--
-- Name: fund_subscription_packages fund_subscription_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_subscription_packages
    ADD CONSTRAINT fund_subscription_packages_pkey PRIMARY KEY (id);


--
-- Name: fundraising_rounds fundraising_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraising_rounds
    ADD CONSTRAINT fundraising_rounds_pkey PRIMARY KEY (id);


--
-- Name: fundraising_rounds fundraising_rounds_user_id_board_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraising_rounds
    ADD CONSTRAINT fundraising_rounds_user_id_board_id_key UNIQUE (user_id, board_id);


--
-- Name: funds funds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funds
    ADD CONSTRAINT funds_pkey PRIMARY KEY (id);


--
-- Name: funds funds_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funds
    ADD CONSTRAINT funds_slug_unique UNIQUE (slug);


--
-- Name: grant_exercises grant_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grant_exercises
    ADD CONSTRAINT grant_exercises_pkey PRIMARY KEY (id);


--
-- Name: ic_memos ic_memos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ic_memos
    ADD CONSTRAINT ic_memos_pkey PRIMARY KEY (id);


--
-- Name: ic_votes ic_votes_deal_id_member_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ic_votes
    ADD CONSTRAINT ic_votes_deal_id_member_key UNIQUE (deal_id, member);


--
-- Name: ic_votes ic_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ic_votes
    ADD CONSTRAINT ic_votes_pkey PRIMARY KEY (id);


--
-- Name: impersonation_grants impersonation_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation_grants
    ADD CONSTRAINT impersonation_grants_pkey PRIMARY KEY (id);


--
-- Name: inbox_poll_state inbox_poll_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_poll_state
    ADD CONSTRAINT inbox_poll_state_pkey PRIMARY KEY (mailbox);


--
-- Name: intake_submissions intake_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intake_submissions
    ADD CONSTRAINT intake_submissions_pkey PRIMARY KEY (id);


--
-- Name: interaction_logs interaction_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interaction_logs
    ADD CONSTRAINT interaction_logs_pkey PRIMARY KEY (id);


--
-- Name: interview_feedback interview_feedback_interview_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_feedback
    ADD CONSTRAINT interview_feedback_interview_id_unique UNIQUE (interview_id);


--
-- Name: interview_feedback interview_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_feedback
    ADD CONSTRAINT interview_feedback_pkey PRIMARY KEY (id);


--
-- Name: interview_messages interview_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_messages
    ADD CONSTRAINT interview_messages_pkey PRIMARY KEY (id);


--
-- Name: interview_scores interview_scores_interview_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_scores
    ADD CONSTRAINT interview_scores_interview_id_unique UNIQUE (interview_id);


--
-- Name: interview_scores interview_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_scores
    ADD CONSTRAINT interview_scores_pkey PRIMARY KEY (id);


--
-- Name: interviews interviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interviews
    ADD CONSTRAINT interviews_pkey PRIMARY KEY (id);


--
-- Name: introductions introductions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.introductions
    ADD CONSTRAINT introductions_pkey PRIMARY KEY (id);


--
-- Name: investment_cases investment_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_cases
    ADD CONSTRAINT investment_cases_pkey PRIMARY KEY (id);


--
-- Name: investment_firms investment_firms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_firms
    ADD CONSTRAINT investment_firms_pkey PRIMARY KEY (id);


--
-- Name: investment_signals investment_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_signals
    ADD CONSTRAINT investment_signals_pkey PRIMARY KEY (id);


--
-- Name: investments investments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investments
    ADD CONSTRAINT investments_pkey PRIMARY KEY (id);


--
-- Name: investor_calls investor_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_calls
    ADD CONSTRAINT investor_calls_pkey PRIMARY KEY (id);


--
-- Name: investor_claim_codes investor_claim_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_claim_codes
    ADD CONSTRAINT investor_claim_codes_pkey PRIMARY KEY (id);


--
-- Name: investor_company_links investor_company_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_company_links
    ADD CONSTRAINT investor_company_links_pkey PRIMARY KEY (id);


--
-- Name: investor_entities investor_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_entities
    ADD CONSTRAINT investor_entities_pkey PRIMARY KEY (id);


--
-- Name: investor_entity_events investor_entity_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_entity_events
    ADD CONSTRAINT investor_entity_events_pkey PRIMARY KEY (id);


--
-- Name: investor_entity_invites investor_entity_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_entity_invites
    ADD CONSTRAINT investor_entity_invites_pkey PRIMARY KEY (id);


--
-- Name: investor_entity_members investor_entity_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_entity_members
    ADD CONSTRAINT investor_entity_members_pkey PRIMARY KEY (entity_id, user_id);


--
-- Name: investor_matches investor_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_matches
    ADD CONSTRAINT investor_matches_pkey PRIMARY KEY (id);


--
-- Name: investor_profiles investor_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_profiles
    ADD CONSTRAINT investor_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: investor_signup_codes investor_signup_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_signup_codes
    ADD CONSTRAINT investor_signup_codes_pkey PRIMARY KEY (id);


--
-- Name: investor_update_recipients investor_update_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_update_recipients
    ADD CONSTRAINT investor_update_recipients_pkey PRIMARY KEY (id);


--
-- Name: investor_updates investor_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_updates
    ADD CONSTRAINT investor_updates_pkey PRIMARY KEY (id);


--
-- Name: investors investors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investors
    ADD CONSTRAINT investors_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: kyc_cases kyc_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_cases
    ADD CONSTRAINT kyc_cases_pkey PRIMARY KEY (id);


--
-- Name: kyc_document_files kyc_document_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_document_files
    ADD CONSTRAINT kyc_document_files_pkey PRIMARY KEY (id);


--
-- Name: kyc_documents kyc_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_documents
    ADD CONSTRAINT kyc_documents_pkey PRIMARY KEY (id);


--
-- Name: kyc_screening_hits kyc_screening_hits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_screening_hits
    ADD CONSTRAINT kyc_screening_hits_pkey PRIMARY KEY (id);


--
-- Name: kyc_watchlist kyc_watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_watchlist
    ADD CONSTRAINT kyc_watchlist_pkey PRIMARY KEY (id);


--
-- Name: legacy_drafts_cancel_backup_20261006 legacy_drafts_cancel_backup_20261006_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legacy_drafts_cancel_backup_20261006
    ADD CONSTRAINT legacy_drafts_cancel_backup_20261006_pkey PRIMARY KEY (id);


--
-- Name: legacy_owner_migration_backup_20261006 legacy_owner_migration_backup_20261006_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legacy_owner_migration_backup_20261006
    ADD CONSTRAINT legacy_owner_migration_backup_20261006_pkey PRIMARY KEY (tbl, id);


--
-- Name: legal_documents legal_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_documents
    ADD CONSTRAINT legal_documents_pkey PRIMARY KEY (id);


--
-- Name: legal_entities legal_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_entities
    ADD CONSTRAINT legal_entities_pkey PRIMARY KEY (id);


--
-- Name: li_action_queue li_action_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_action_queue
    ADD CONSTRAINT li_action_queue_pkey PRIMARY KEY (id);


--
-- Name: li_campaign_members li_campaign_members_campaign_id_target_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_members
    ADD CONSTRAINT li_campaign_members_campaign_id_target_url_key UNIQUE (campaign_id, target_url);


--
-- Name: li_campaign_members li_campaign_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_members
    ADD CONSTRAINT li_campaign_members_pkey PRIMARY KEY (id);


--
-- Name: li_campaign_senders li_campaign_senders_campaign_id_sender_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_senders
    ADD CONSTRAINT li_campaign_senders_campaign_id_sender_id_key UNIQUE (campaign_id, sender_id);


--
-- Name: li_campaign_senders li_campaign_senders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_senders
    ADD CONSTRAINT li_campaign_senders_pkey PRIMARY KEY (id);


--
-- Name: li_campaign_steps li_campaign_steps_campaign_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_steps
    ADD CONSTRAINT li_campaign_steps_campaign_id_step_order_key UNIQUE (campaign_id, step_order);


--
-- Name: li_campaign_steps li_campaign_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_steps
    ADD CONSTRAINT li_campaign_steps_pkey PRIMARY KEY (id);


--
-- Name: li_campaigns li_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaigns
    ADD CONSTRAINT li_campaigns_pkey PRIMARY KEY (id);


--
-- Name: li_conversations li_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_conversations
    ADD CONSTRAINT li_conversations_pkey PRIMARY KEY (id);


--
-- Name: li_conversations li_conversations_user_id_thread_urn_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_conversations
    ADD CONSTRAINT li_conversations_user_id_thread_urn_key UNIQUE (user_id, thread_urn);


--
-- Name: li_lead_list_members li_lead_list_members_list_id_target_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_lead_list_members
    ADD CONSTRAINT li_lead_list_members_list_id_target_url_key UNIQUE (list_id, target_url);


--
-- Name: li_lead_list_members li_lead_list_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_lead_list_members
    ADD CONSTRAINT li_lead_list_members_pkey PRIMARY KEY (id);


--
-- Name: li_lead_lists li_lead_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_lead_lists
    ADD CONSTRAINT li_lead_lists_pkey PRIMARY KEY (id);


--
-- Name: li_messages li_messages_conversation_id_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_messages
    ADD CONSTRAINT li_messages_conversation_id_external_id_key UNIQUE (conversation_id, external_id);


--
-- Name: li_messages li_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_messages
    ADD CONSTRAINT li_messages_pkey PRIMARY KEY (id);


--
-- Name: li_suppressions li_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_suppressions
    ADD CONSTRAINT li_suppressions_pkey PRIMARY KEY (id);


--
-- Name: li_suppressions li_suppressions_user_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_suppressions
    ADD CONSTRAINT li_suppressions_user_id_slug_key UNIQUE (user_id, slug);


--
-- Name: linkedin_connections linkedin_connections_owner_id_linkedin_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_connections
    ADD CONSTRAINT linkedin_connections_owner_id_linkedin_url_key UNIQUE (owner_id, linkedin_url);


--
-- Name: linkedin_connections linkedin_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_connections
    ADD CONSTRAINT linkedin_connections_pkey PRIMARY KEY (id);


--
-- Name: linkedin_mutuals linkedin_mutuals_owner_id_person_url_mutual_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_mutuals
    ADD CONSTRAINT linkedin_mutuals_owner_id_person_url_mutual_name_key UNIQUE (owner_id, person_url, mutual_name);


--
-- Name: linkedin_mutuals linkedin_mutuals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_mutuals
    ADD CONSTRAINT linkedin_mutuals_pkey PRIMARY KEY (id);


--
-- Name: linkedin_senders linkedin_senders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_senders
    ADD CONSTRAINT linkedin_senders_pkey PRIMARY KEY (id);


--
-- Name: loan_covenants loan_covenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_covenants
    ADD CONSTRAINT loan_covenants_pkey PRIMARY KEY (id);


--
-- Name: loan_payments loan_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_payments
    ADD CONSTRAINT loan_payments_pkey PRIMARY KEY (id);


--
-- Name: loans loans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);


--
-- Name: local_users local_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT local_users_email_key UNIQUE (email);


--
-- Name: local_users local_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT local_users_pkey PRIMARY KEY (id);


--
-- Name: lp_accounts lp_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_accounts
    ADD CONSTRAINT lp_accounts_pkey PRIMARY KEY (lp_id);


--
-- Name: lp_capital_calls lp_capital_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_capital_calls
    ADD CONSTRAINT lp_capital_calls_pkey PRIMARY KEY (id);


--
-- Name: lp_commitment_events lp_commitment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_commitment_events
    ADD CONSTRAINT lp_commitment_events_pkey PRIMARY KEY (id);


--
-- Name: lp_commitments lp_commitments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_commitments
    ADD CONSTRAINT lp_commitments_pkey PRIMARY KEY (id);


--
-- Name: lp_contact_matches lp_contact_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_contact_matches
    ADD CONSTRAINT lp_contact_matches_pkey PRIMARY KEY (id);


--
-- Name: lp_distributions lp_distributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_distributions
    ADD CONSTRAINT lp_distributions_pkey PRIMARY KEY (id);


--
-- Name: lp_documents lp_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_documents
    ADD CONSTRAINT lp_documents_pkey PRIMARY KEY (id);


--
-- Name: lp_entities lp_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_entities
    ADD CONSTRAINT lp_entities_pkey PRIMARY KEY (id);


--
-- Name: lp_eval_labels lp_eval_labels_org_id_entity_key_source_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_eval_labels
    ADD CONSTRAINT lp_eval_labels_org_id_entity_key_source_key UNIQUE (org_id, entity_key, source);


--
-- Name: lp_eval_labels lp_eval_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_eval_labels
    ADD CONSTRAINT lp_eval_labels_pkey PRIMARY KEY (id);


--
-- Name: lp_firm_matches lp_firm_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_firm_matches
    ADD CONSTRAINT lp_firm_matches_pkey PRIMARY KEY (id);


--
-- Name: lp_information_sharing lp_information_sharing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_information_sharing
    ADD CONSTRAINT lp_information_sharing_pkey PRIMARY KEY (lp_id);


--
-- Name: lp_match_audit lp_match_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_match_audit
    ADD CONSTRAINT lp_match_audit_pkey PRIMARY KEY (id);


--
-- Name: lp_match_feedback lp_match_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_match_feedback
    ADD CONSTRAINT lp_match_feedback_pkey PRIMARY KEY (id);


--
-- Name: lp_match_sessions lp_match_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_match_sessions
    ADD CONSTRAINT lp_match_sessions_pkey PRIMARY KEY (id);


--
-- Name: lp_onboarding_details lp_onboarding_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_onboarding_details
    ADD CONSTRAINT lp_onboarding_details_pkey PRIMARY KEY (lp_id);


--
-- Name: lp_pipeline_events lp_pipeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_pipeline_events
    ADD CONSTRAINT lp_pipeline_events_pkey PRIMARY KEY (id);


--
-- Name: lp_portal_access_log lp_portal_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_portal_access_log
    ADD CONSTRAINT lp_portal_access_log_pkey PRIMARY KEY (id);


--
-- Name: lp_portal_codes lp_portal_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_portal_codes
    ADD CONSTRAINT lp_portal_codes_pkey PRIMARY KEY (id);


--
-- Name: lp_portal_sessions lp_portal_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_portal_sessions
    ADD CONSTRAINT lp_portal_sessions_pkey PRIMARY KEY (id);


--
-- Name: lp_portal_sessions lp_portal_sessions_session_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_portal_sessions
    ADD CONSTRAINT lp_portal_sessions_session_hash_key UNIQUE (session_hash);


--
-- Name: lp_portal_tokens lp_portal_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_portal_tokens
    ADD CONSTRAINT lp_portal_tokens_pkey PRIMARY KEY (id);


--
-- Name: lp_portal_tokens lp_portal_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_portal_tokens
    ADD CONSTRAINT lp_portal_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: lp_positions lp_positions_fund_id_lp_id_as_of_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_positions
    ADD CONSTRAINT lp_positions_fund_id_lp_id_as_of_key UNIQUE (fund_id, lp_id, as_of);


--
-- Name: lp_positions lp_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_positions
    ADD CONSTRAINT lp_positions_pkey PRIMARY KEY (id);


--
-- Name: lp_quarterly_reports lp_quarterly_reports_fund_quarter_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_quarterly_reports
    ADD CONSTRAINT lp_quarterly_reports_fund_quarter_unique UNIQUE (fund_id, quarter_end);


--
-- Name: lp_quarterly_reports lp_quarterly_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_quarterly_reports
    ADD CONSTRAINT lp_quarterly_reports_pkey PRIMARY KEY (id);


--
-- Name: lp_reports lp_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_reports
    ADD CONSTRAINT lp_reports_pkey PRIMARY KEY (id);


--
-- Name: lp_requests lp_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_requests
    ADD CONSTRAINT lp_requests_pkey PRIMARY KEY (id);


--
-- Name: lp_scoring_factors lp_scoring_factors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_scoring_factors
    ADD CONSTRAINT lp_scoring_factors_pkey PRIMARY KEY (key);


--
-- Name: lp_statement_imports lp_statement_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_statement_imports
    ADD CONSTRAINT lp_statement_imports_pkey PRIMARY KEY (id);


--
-- Name: lp_subscription_files lp_subscription_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_subscription_files
    ADD CONSTRAINT lp_subscription_files_pkey PRIMARY KEY (id);


--
-- Name: lp_subscriptions lp_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_subscriptions
    ADD CONSTRAINT lp_subscriptions_pkey PRIMARY KEY (lp_id);


--
-- Name: lp_terms_acceptances lp_terms_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_terms_acceptances
    ADD CONSTRAINT lp_terms_acceptances_pkey PRIMARY KEY (id);


--
-- Name: lp_verification lp_verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_verification
    ADD CONSTRAINT lp_verification_pkey PRIMARY KEY (lp_id);


--
-- Name: market_signals market_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_signals
    ADD CONSTRAINT market_signals_pkey PRIMARY KEY (id);


--
-- Name: match_outcome_events match_outcome_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_outcome_events
    ADD CONSTRAINT match_outcome_events_pkey PRIMARY KEY (id);


--
-- Name: match_pipeline_actions match_pipeline_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_pipeline_actions
    ADD CONSTRAINT match_pipeline_actions_pkey PRIMARY KEY (id);


--
-- Name: match_sessions match_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_sessions
    ADD CONSTRAINT match_sessions_pkey PRIMARY KEY (id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: matching_algorithms matching_algorithms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matching_algorithms
    ADD CONSTRAINT matching_algorithms_pkey PRIMARY KEY (id);


--
-- Name: matching_weight_history matching_weight_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matching_weight_history
    ADD CONSTRAINT matching_weight_history_pkey PRIMARY KEY (id);


--
-- Name: mc_actuals mc_actuals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_actuals
    ADD CONSTRAINT mc_actuals_pkey PRIMARY KEY (id);


--
-- Name: mc_budget_lines mc_budget_lines_fund_id_year_category_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_budget_lines
    ADD CONSTRAINT mc_budget_lines_fund_id_year_category_key UNIQUE (fund_id, year, category);


--
-- Name: mc_budget_lines mc_budget_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_budget_lines
    ADD CONSTRAINT mc_budget_lines_pkey PRIMARY KEY (id);


--
-- Name: mcp_tokens mcp_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tokens
    ADD CONSTRAINT mcp_tokens_pkey PRIMARY KEY (id);


--
-- Name: mcp_tokens mcp_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tokens
    ADD CONSTRAINT mcp_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_user_id_org_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_org_id_key UNIQUE (user_id, org_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: model_prices model_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_prices
    ADD CONSTRAINT model_prices_pkey PRIMARY KEY (model);


--
-- Name: news_articles news_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_articles
    ADD CONSTRAINT news_articles_pkey PRIMARY KEY (id);


--
-- Name: news_articles news_articles_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_articles
    ADD CONSTRAINT news_articles_slug_unique UNIQUE (slug);


--
-- Name: news_generation_logs news_generation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_generation_logs
    ADD CONSTRAINT news_generation_logs_pkey PRIMARY KEY (id);


--
-- Name: news_regions news_regions_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_regions
    ADD CONSTRAINT news_regions_code_unique UNIQUE (code);


--
-- Name: news_regions news_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_regions
    ADD CONSTRAINT news_regions_pkey PRIMARY KEY (id);


--
-- Name: news_scheduled_posts news_scheduled_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_scheduled_posts
    ADD CONSTRAINT news_scheduled_posts_pkey PRIMARY KEY (id);


--
-- Name: news_source_items news_source_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_source_items
    ADD CONSTRAINT news_source_items_pkey PRIMARY KEY (id);


--
-- Name: news_sources news_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_sources
    ADD CONSTRAINT news_sources_pkey PRIMARY KEY (id);


--
-- Name: news_themes news_themes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_themes
    ADD CONSTRAINT news_themes_pkey PRIMARY KEY (id);


--
-- Name: news_themes news_themes_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_themes
    ADD CONSTRAINT news_themes_slug_key UNIQUE (slug);


--
-- Name: notifications_legacy_20260916 notifications_legacy_20260916_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications_legacy_20260916
    ADD CONSTRAINT notifications_legacy_20260916_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: onboarding_drafts onboarding_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_drafts
    ADD CONSTRAINT onboarding_drafts_pkey PRIMARY KEY (user_id, persona);


--
-- Name: option_grants option_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.option_grants
    ADD CONSTRAINT option_grants_pkey PRIMARY KEY (id);


--
-- Name: option_pools option_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.option_pools
    ADD CONSTRAINT option_pools_pkey PRIMARY KEY (company_id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: outreach_campaign_members outreach_campaign_members_campaign_id_crm_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_campaign_members
    ADD CONSTRAINT outreach_campaign_members_campaign_id_crm_entry_id_key UNIQUE (campaign_id, crm_entry_id);


--
-- Name: outreach_campaign_members outreach_campaign_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_campaign_members
    ADD CONSTRAINT outreach_campaign_members_pkey PRIMARY KEY (id);


--
-- Name: outreach_campaign_schedules outreach_campaign_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_campaign_schedules
    ADD CONSTRAINT outreach_campaign_schedules_pkey PRIMARY KEY (id);


--
-- Name: outreach_campaigns outreach_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_campaigns
    ADD CONSTRAINT outreach_campaigns_pkey PRIMARY KEY (id);


--
-- Name: outreach_consents outreach_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_consents
    ADD CONSTRAINT outreach_consents_pkey PRIMARY KEY (id);


--
-- Name: outreach_crawl_queue outreach_crawl_queue_campaign_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_crawl_queue
    ADD CONSTRAINT outreach_crawl_queue_campaign_id_member_id_key UNIQUE (campaign_id, member_id);


--
-- Name: outreach_crawl_queue outreach_crawl_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_crawl_queue
    ADD CONSTRAINT outreach_crawl_queue_pkey PRIMARY KEY (id);


--
-- Name: outreach_events outreach_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_events
    ADD CONSTRAINT outreach_events_pkey PRIMARY KEY (id);


--
-- Name: outreach_messages outreach_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_messages
    ADD CONSTRAINT outreach_messages_pkey PRIMARY KEY (id);


--
-- Name: outreach_messages outreach_messages_tracking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_messages
    ADD CONSTRAINT outreach_messages_tracking_id_key UNIQUE (tracking_id);


--
-- Name: outreach_replies outreach_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_replies
    ADD CONSTRAINT outreach_replies_pkey PRIMARY KEY (id);


--
-- Name: outreach_reply_deliveries outreach_reply_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_reply_deliveries
    ADD CONSTRAINT outreach_reply_deliveries_pkey PRIMARY KEY (reply_id);


--
-- Name: outreach_templates outreach_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_templates
    ADD CONSTRAINT outreach_templates_pkey PRIMARY KEY (id);


--
-- Name: outreaches outreaches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreaches
    ADD CONSTRAINT outreaches_pkey PRIMARY KEY (id);


--
-- Name: passport_documents passport_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passport_documents
    ADD CONSTRAINT passport_documents_pkey PRIMARY KEY (id);


--
-- Name: passport_shares passport_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passport_shares
    ADD CONSTRAINT passport_shares_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_unique UNIQUE (token);


--
-- Name: pitch_deck_analyses pitch_deck_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_deck_analyses
    ADD CONSTRAINT pitch_deck_analyses_pkey PRIMARY KEY (id);


--
-- Name: pitch_decks pitch_decks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_decks
    ADD CONSTRAINT pitch_decks_pkey PRIMARY KEY (id);


--
-- Name: plan_catalog plan_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_catalog
    ADD CONSTRAINT plan_catalog_pkey PRIMARY KEY (plan);


--
-- Name: planning_scenarios planning_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_scenarios
    ADD CONSTRAINT planning_scenarios_pkey PRIMARY KEY (user_id, org_id, tool);


--
-- Name: platform_api_keys platform_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_api_keys
    ADD CONSTRAINT platform_api_keys_pkey PRIMARY KEY (id);


--
-- Name: platform_flags platform_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_flags
    ADD CONSTRAINT platform_flags_pkey PRIMARY KEY (key);


--
-- Name: portfolio_companies portfolio_companies_fund_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_companies
    ADD CONSTRAINT portfolio_companies_fund_id_key UNIQUE (fund_id, id);


--
-- Name: portfolio_companies portfolio_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_companies
    ADD CONSTRAINT portfolio_companies_pkey PRIMARY KEY (id);


--
-- Name: portfolio_companies portfolio_companies_slug_per_fund_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_companies
    ADD CONSTRAINT portfolio_companies_slug_per_fund_unique UNIQUE (fund_id, slug);


--
-- Name: portfolio_kpi_extractions portfolio_kpi_extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_kpi_extractions
    ADD CONSTRAINT portfolio_kpi_extractions_pkey PRIMARY KEY (id);


--
-- Name: portfolio_kpis_monthly portfolio_kpis_month_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_kpis_monthly
    ADD CONSTRAINT portfolio_kpis_month_unique UNIQUE (company_id, month_end);


--
-- Name: portfolio_kpis_monthly portfolio_kpis_monthly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_kpis_monthly
    ADD CONSTRAINT portfolio_kpis_monthly_pkey PRIMARY KEY (id);


--
-- Name: portfolio_metrics portfolio_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_metrics
    ADD CONSTRAINT portfolio_metrics_pkey PRIMARY KEY (id);


--
-- Name: potential_duplicates potential_duplicates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.potential_duplicates
    ADD CONSTRAINT potential_duplicates_pkey PRIMARY KEY (id);


--
-- Name: private_artifacts private_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_artifacts
    ADD CONSTRAINT private_artifacts_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: provider_bills provider_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_bills
    ADD CONSTRAINT provider_bills_pkey PRIMARY KEY (month, provider);


--
-- Name: relationship_attachments relationship_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_attachments
    ADD CONSTRAINT relationship_attachments_pkey PRIMARY KEY (id);


--
-- Name: relationship_materials relationship_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_materials
    ADD CONSTRAINT relationship_materials_pkey PRIMARY KEY (id);


--
-- Name: relationship_meetings relationship_meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_meetings
    ADD CONSTRAINT relationship_meetings_pkey PRIMARY KEY (id);


--
-- Name: relationship_messages relationship_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_messages
    ADD CONSTRAINT relationship_messages_pkey PRIMARY KEY (id);


--
-- Name: research_crawl_logs research_crawl_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_crawl_logs
    ADD CONSTRAINT research_crawl_logs_pkey PRIMARY KEY (id);


--
-- Name: research_documents research_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_documents
    ADD CONSTRAINT research_documents_pkey PRIMARY KEY (id);


--
-- Name: research_organizations research_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_organizations
    ADD CONSTRAINT research_organizations_pkey PRIMARY KEY (id);


--
-- Name: research_organizations research_organizations_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_organizations
    ADD CONSTRAINT research_organizations_slug_unique UNIQUE (slug);


--
-- Name: roles roles_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_unique UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: saved_templates saved_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_templates
    ADD CONSTRAINT saved_templates_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: send_authorizations send_authorizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_authorizations
    ADD CONSTRAINT send_authorizations_pkey PRIMARY KEY (id);


--
-- Name: send_items send_items_authorization_id_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_items
    ADD CONSTRAINT send_items_authorization_id_message_id_key UNIQUE (authorization_id, message_id);


--
-- Name: send_items send_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_items
    ADD CONSTRAINT send_items_pkey PRIMARY KEY (id);


--
-- Name: sender_profiles sender_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sender_profiles
    ADD CONSTRAINT sender_profiles_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);


--
-- Name: smoke_runs smoke_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smoke_runs
    ADD CONSTRAINT smoke_runs_pkey PRIMARY KEY (id);


--
-- Name: spv_portal_tokens spv_portal_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_portal_tokens
    ADD CONSTRAINT spv_portal_tokens_pkey PRIMARY KEY (id);


--
-- Name: spv_portal_tokens spv_portal_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_portal_tokens
    ADD CONSTRAINT spv_portal_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: spv_subscriptions spv_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_subscriptions
    ADD CONSTRAINT spv_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: spvs spvs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spvs
    ADD CONSTRAINT spvs_pkey PRIMARY KEY (id);


--
-- Name: staff_login_attempts staff_login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_login_attempts
    ADD CONSTRAINT staff_login_attempts_pkey PRIMARY KEY (id);


--
-- Name: staff_mfa staff_mfa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_mfa
    ADD CONSTRAINT staff_mfa_pkey PRIMARY KEY (staff_id);


--
-- Name: staff_sessions staff_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_sessions
    ADD CONSTRAINT staff_sessions_pkey PRIMARY KEY (id);


--
-- Name: startup_documents startup_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_documents
    ADD CONSTRAINT startup_documents_pkey PRIMARY KEY (id);


--
-- Name: startup_profiles startup_profiles_org_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_profiles
    ADD CONSTRAINT startup_profiles_org_id_version_key UNIQUE (org_id, version);


--
-- Name: startup_profiles startup_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_profiles
    ADD CONSTRAINT startup_profiles_pkey PRIMARY KEY (id);


--
-- Name: startups startups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startups
    ADD CONSTRAINT startups_pkey PRIMARY KEY (id);


--
-- Name: studio_projects studio_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_projects
    ADD CONSTRAINT studio_projects_pkey PRIMARY KEY (id);


--
-- Name: submission_assessment_jobs submission_assessment_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_assessment_jobs
    ADD CONSTRAINT submission_assessment_jobs_pkey PRIMARY KEY (id);


--
-- Name: subscribers subscribers_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_email_unique UNIQUE (email);


--
-- Name: subscribers subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_pkey PRIMARY KEY (id);


--
-- Name: svs_sigreplace_bak_2026_06_02_1129 svs_sigreplace_bak_2026_06_02_1129_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.svs_sigreplace_bak_2026_06_02_1129
    ADD CONSTRAINT svs_sigreplace_bak_2026_06_02_1129_pkey PRIMARY KEY (id);


--
-- Name: sync_logs sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_logs
    ADD CONSTRAINT sync_logs_pkey PRIMARY KEY (id);


--
-- Name: syndicate_partners syndicate_partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndicate_partners
    ADD CONSTRAINT syndicate_partners_pkey PRIMARY KEY (id);


--
-- Name: syndicates syndicates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndicates
    ADD CONSTRAINT syndicates_pkey PRIMARY KEY (id);


--
-- Name: syndicates syndicates_spv_fund_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndicates
    ADD CONSTRAINT syndicates_spv_fund_id_key UNIQUE (spv_fund_id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_invitations team_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_pkey PRIMARY KEY (id);


--
-- Name: team_invitations team_invitations_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_token_unique UNIQUE (token);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: teams teams_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_slug_unique UNIQUE (slug);


--
-- Name: telegram_bots telegram_bots_bot_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_bots
    ADD CONSTRAINT telegram_bots_bot_user_id_key UNIQUE (bot_user_id);


--
-- Name: telegram_bots telegram_bots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_bots
    ADD CONSTRAINT telegram_bots_pkey PRIMARY KEY (id);


--
-- Name: telegram_link_codes telegram_link_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_pkey PRIMARY KEY (code_hash);


--
-- Name: telegram_links telegram_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_links
    ADD CONSTRAINT telegram_links_pkey PRIMARY KEY (id);


--
-- Name: telegram_pending telegram_pending_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_pending
    ADD CONSTRAINT telegram_pending_pkey PRIMARY KEY (id);


--
-- Name: telegram_prefs telegram_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_prefs
    ADD CONSTRAINT telegram_prefs_pkey PRIMARY KEY (link_id);


--
-- Name: telegram_sent telegram_sent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_sent
    ADD CONSTRAINT telegram_sent_pkey PRIMARY KEY (bot_id, chat_id, message_id);


--
-- Name: telegram_shown telegram_shown_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_shown
    ADD CONSTRAINT telegram_shown_pkey PRIMARY KEY (link_id, proposal_id);


--
-- Name: telegram_updates telegram_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_updates
    ADD CONSTRAINT telegram_updates_pkey PRIMARY KEY (bot_id, update_id);


--
-- Name: tenant_entitlements tenant_entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_entitlements
    ADD CONSTRAINT tenant_entitlements_pkey PRIMARY KEY (org_id);


--
-- Name: tenant_lifecycle_events tenant_lifecycle_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_lifecycle_events
    ADD CONSTRAINT tenant_lifecycle_events_pkey PRIMARY KEY (id);


--
-- Name: tenant_lifecycle tenant_lifecycle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_lifecycle
    ADD CONSTRAINT tenant_lifecycle_pkey PRIMARY KEY (org_id);


--
-- Name: tenant_requests tenant_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_requests
    ADD CONSTRAINT tenant_requests_pkey PRIMARY KEY (id);


--
-- Name: tenant_tombstones tenant_tombstones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_tombstones
    ADD CONSTRAINT tenant_tombstones_pkey PRIMARY KEY (id);


--
-- Name: tenant_tombstones tenant_tombstones_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_tombstones
    ADD CONSTRAINT tenant_tombstones_request_id_key UNIQUE (request_id);


--
-- Name: term_grids term_grids_deal_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_grids
    ADD CONSTRAINT term_grids_deal_id_version_key UNIQUE (deal_id, version);


--
-- Name: term_grids term_grids_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_grids
    ADD CONSTRAINT term_grids_pkey PRIMARY KEY (id);


--
-- Name: unit_prices unit_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_prices
    ADD CONSTRAINT unit_prices_pkey PRIMARY KEY (unit);


--
-- Name: url_health_checks url_health_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.url_health_checks
    ADD CONSTRAINT url_health_checks_pkey PRIMARY KEY (id);


--
-- Name: url_health_jobs url_health_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.url_health_jobs
    ADD CONSTRAINT url_health_jobs_pkey PRIMARY KEY (id);


--
-- Name: url_repair_candidates url_repair_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.url_repair_candidates
    ADD CONSTRAINT url_repair_candidates_pkey PRIMARY KEY (id);


--
-- Name: usage_events usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_pkey PRIMARY KEY (id);


--
-- Name: usage_warnings usage_warnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_warnings
    ADD CONSTRAINT usage_warnings_pkey PRIMARY KEY (org_id, month, threshold);


--
-- Name: user_email_settings user_email_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_settings
    ADD CONSTRAINT user_email_settings_pkey PRIMARY KEY (id);


--
-- Name: user_email_settings user_email_settings_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_settings
    ADD CONSTRAINT user_email_settings_user_id_unique UNIQUE (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: valuation_snapshots valuation_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuation_snapshots
    ADD CONSTRAINT valuation_snapshots_pkey PRIMARY KEY (id);


--
-- Name: valuations_409a valuations_409a_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuations_409a
    ADD CONSTRAINT valuations_409a_pkey PRIMARY KEY (id);


--
-- Name: vector_embeddings vector_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vector_embeddings
    ADD CONSTRAINT vector_embeddings_pkey PRIMARY KEY (id);


--
-- Name: waterfall_runs waterfall_runs_fund_id_run_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waterfall_runs
    ADD CONSTRAINT waterfall_runs_fund_id_run_number_key UNIQUE (fund_id, run_number);


--
-- Name: waterfall_runs waterfall_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waterfall_runs
    ADD CONSTRAINT waterfall_runs_pkey PRIMARY KEY (id);


--
-- Name: workspace_access_events workspace_access_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_access_events
    ADD CONSTRAINT workspace_access_events_pkey PRIMARY KEY (id);


--
-- Name: workspace_autonomy workspace_autonomy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_autonomy
    ADD CONSTRAINT workspace_autonomy_pkey PRIMARY KEY (org_id, risk_class);


--
-- Name: workspace_data_policy workspace_data_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_data_policy
    ADD CONSTRAINT workspace_data_policy_pkey PRIMARY KEY (org_id);


--
-- Name: workspace_decks workspace_decks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_decks
    ADD CONSTRAINT workspace_decks_pkey PRIMARY KEY (id);


--
-- Name: workspace_invitations workspace_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_pkey PRIMARY KEY (id);


--
-- Name: workspace_invitations workspace_invitations_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: workspace_ownership_transfers workspace_ownership_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_ownership_transfers
    ADD CONSTRAINT workspace_ownership_transfers_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);


--
-- Name: action_proposals_idem_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX action_proposals_idem_idx ON public.action_proposals USING btree (org_id, idempotency_key);


--
-- Name: action_proposals_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_proposals_org_status_idx ON public.action_proposals USING btree (org_id, status, created_at DESC);


--
-- Name: action_proposals_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_proposals_run_idx ON public.action_proposals USING btree (org_id, run_id);


--
-- Name: activities_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activities_user_idx ON public.activities USING btree (user_id, created_at DESC);


--
-- Name: agent_events_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_events_open_idx ON public.agent_events USING btree (created_at) WHERE (processed_at IS NULL);


--
-- Name: agent_events_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_events_org_idx ON public.agent_events USING btree (org_id, created_at DESC);


--
-- Name: agent_executions_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_executions_open_idx ON public.agent_executions USING btree (status, heartbeat_at) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: agent_executions_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_executions_org_idx ON public.agent_executions USING btree (org_id, created_at DESC);


--
-- Name: agent_executions_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_executions_period_idx ON public.agent_executions USING btree (org_id, agent_id, period_key) WHERE (trigger = ANY (ARRAY['schedule'::text, 'event'::text]));


--
-- Name: agent_runs_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_entry_idx ON public.agent_runs USING btree (crm_entry_id, started_at DESC);


--
-- Name: agent_runs_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_mode_idx ON public.agent_runs USING btree (mode, started_at DESC);


--
-- Name: agent_runs_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_started_idx ON public.agent_runs USING btree (started_at DESC);


--
-- Name: ai_calls_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_calls_actor_idx ON public.ai_calls USING btree (actor_id, created_at DESC);


--
-- Name: ai_calls_cost_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_calls_cost_state_idx ON public.ai_calls USING btree (created_at DESC, cost_state);


--
-- Name: ai_calls_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_calls_created_idx ON public.ai_calls USING btree (created_at DESC);


--
-- Name: ai_calls_failures_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_calls_failures_idx ON public.ai_calls USING btree (created_at DESC) WHERE (ok = false);


--
-- Name: ai_calls_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_calls_provider_idx ON public.ai_calls USING btree (provider, created_at DESC);


--
-- Name: ai_calls_rejected_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_calls_rejected_idx ON public.ai_calls USING btree (created_at DESC) WHERE (provider = 'rejected'::text);


--
-- Name: ai_calls_resolution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_calls_resolution_idx ON public.ai_calls USING btree (resolution, created_at DESC) WHERE (resolution IS NOT NULL);


--
-- Name: ai_calls_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_calls_run_idx ON public.ai_calls USING btree (run_id, created_at) WHERE (run_id IS NOT NULL);


--
-- Name: ai_calls_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_calls_task_idx ON public.ai_calls USING btree (task, created_at DESC);


--
-- Name: ai_calls_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_calls_workspace_idx ON public.ai_calls USING btree (workspace_id, created_at DESC);


--
-- Name: ai_media_tasks_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_media_tasks_owner_idx ON public.ai_media_tasks USING btree (user_id, scope_key);


--
-- Name: ai_studio_assets_output; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_studio_assets_output ON public.ai_studio_assets USING btree (job_id) WHERE (job_id IS NOT NULL);


--
-- Name: ai_studio_assets_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_studio_assets_owner ON public.ai_studio_assets USING btree (user_id, scope_key);


--
-- Name: ai_studio_consents_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_studio_consents_scope ON public.ai_studio_consents USING btree (scope_key, created_at DESC);


--
-- Name: ai_studio_credit_ledger_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_studio_credit_ledger_day ON public.ai_studio_credit_ledger USING btree (scope_key, source, day);


--
-- Name: ai_studio_credit_ledger_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_studio_credit_ledger_recent ON public.ai_studio_credit_ledger USING btree (scope_key, created_at DESC);


--
-- Name: ai_studio_credit_refund_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_studio_credit_refund_once ON public.ai_studio_credit_ledger USING btree (job_id, source) WHERE (kind = 'refund'::text);


--
-- Name: ai_studio_credit_spend_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_studio_credit_spend_once ON public.ai_studio_credit_ledger USING btree (job_id, source) WHERE (kind = 'spend'::text);


--
-- Name: ai_studio_jobs_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_studio_jobs_history ON public.ai_studio_jobs USING btree (user_id, scope_key, created_at DESC);


--
-- Name: ai_studio_jobs_lost; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_studio_jobs_lost ON public.ai_studio_jobs USING btree (created_at) WHERE ((provider = 'comfy'::text) AND (provider_id IS NULL));


--
-- Name: ai_studio_jobs_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_studio_jobs_pending ON public.ai_studio_jobs USING btree (next_poll_at) WHERE (status = ANY (ARRAY['submitting'::text, 'queued'::text, 'running'::text, 'saving'::text]));


--
-- Name: ai_studio_pipelines_consent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_studio_pipelines_consent ON public.ai_studio_pipelines USING btree (consent_id);


--
-- Name: ai_studio_pipelines_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_studio_pipelines_scope ON public.ai_studio_pipelines USING btree (scope_key, created_at DESC);


--
-- Name: ai_studio_reviews_gate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_studio_reviews_gate ON public.ai_studio_reviews USING btree (pipeline_id, gate, reviewed_at DESC);


--
-- Name: alert_events_incident_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alert_events_incident_idx ON public.alert_events USING btree (incident_id, at);


--
-- Name: alert_incidents_live_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX alert_incidents_live_uq ON public.alert_incidents USING btree (rule_key, subject) WHERE (status <> 'resolved'::text);


--
-- Name: alert_incidents_resolved_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alert_incidents_resolved_idx ON public.alert_incidents USING btree (rule_key, subject, resolved_at DESC) WHERE (status = 'resolved'::text);


--
-- Name: alert_incidents_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alert_incidents_status_idx ON public.alert_incidents USING btree (status, severity, opened_at DESC);


--
-- Name: anker_chat_events_awaiting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anker_chat_events_awaiting_idx ON public.anker_chat_events USING btree (scope_key) WHERE awaiting;


--
-- Name: anker_chat_events_chat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anker_chat_events_chat_idx ON public.anker_chat_events USING btree (chat_id, id);


--
-- Name: anker_chat_events_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anker_chat_events_scope_idx ON public.anker_chat_events USING btree (scope_key, created_at DESC);


--
-- Name: anker_chat_events_seq_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX anker_chat_events_seq_idx ON public.anker_chat_events USING btree (chat_id, seq);


--
-- Name: anker_chats_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anker_chats_user_idx ON public.anker_chats USING btree (user_id, updated_at DESC);


--
-- Name: audit_events_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_actor_idx ON public.audit_events USING btree (actor_email, created_at DESC);


--
-- Name: audit_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_created_idx ON public.audit_events USING btree (created_at DESC);


--
-- Name: audit_events_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_scope_idx ON public.audit_events USING btree (scope_key, created_at DESC) WHERE (scope_key IS NOT NULL);


--
-- Name: audit_events_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_target_idx ON public.audit_events USING btree (target_type, target_id);


--
-- Name: billing_credit_ledger_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_credit_ledger_org_idx ON public.billing_credit_ledger USING btree (org_id, created_at DESC);


--
-- Name: campaign_crm_entries_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_crm_entries_campaign_idx ON public.campaign_crm_entries USING btree (outreach_campaign_id, stage);


--
-- Name: campaign_crm_entries_sendable_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_crm_entries_sendable_idx ON public.campaign_crm_entries USING btree (outreach_campaign_id, stage, created_at) WHERE (stage = 'queued'::text);


--
-- Name: campaign_crm_entries_submission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_crm_entries_submission_idx ON public.campaign_crm_entries USING btree (submission_id);


--
-- Name: campaign_crm_entries_uniq_investor; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX campaign_crm_entries_uniq_investor ON public.campaign_crm_entries USING btree (outreach_campaign_id, investor_id) WHERE (investor_id IS NOT NULL);


--
-- Name: campaign_interest_tokens_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_interest_tokens_entry_idx ON public.campaign_interest_tokens USING btree (campaign_crm_entry_id);


--
-- Name: capital_call_line_items_call_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capital_call_line_items_call_status_idx ON public.capital_call_line_items USING btree (call_id, status);


--
-- Name: capital_call_line_items_lp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capital_call_line_items_lp_idx ON public.capital_call_line_items USING btree (fund_lp_id);


--
-- Name: capital_calls_fund_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capital_calls_fund_status_idx ON public.capital_calls USING btree (fund_id, status, call_number DESC);


--
-- Name: comp_bands_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comp_bands_company_idx ON public.comp_bands USING btree (company_id, created_at DESC);


--
-- Name: company_audit_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_audit_log_created_idx ON public.company_audit_log USING btree (created_at DESC);


--
-- Name: compliance_deadlines_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_deadlines_fund_idx ON public.compliance_deadlines USING btree (fund_id, year);


--
-- Name: compliance_settings_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_settings_fund_idx ON public.compliance_fund_settings USING btree (fund_id);


--
-- Name: contracts_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contracts_owner_idx ON public.contracts USING btree (created_by, created_at DESC);


--
-- Name: crm_activities_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_activities_scope_idx ON public.crm_activities USING btree (scope_key, occurred_at DESC);


--
-- Name: crm_activities_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_activities_subject_idx ON public.crm_activities USING btree (subject_type, subject_id, occurred_at DESC);


--
-- Name: crm_boards_legacy_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX crm_boards_legacy_session_idx ON public.crm_boards USING btree (user_id, source_session_id) WHERE ((source_session_id IS NOT NULL) AND (org_id IS NULL));


--
-- Name: crm_boards_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_boards_scope_idx ON public.crm_boards USING btree (scope_key, created_at DESC);


--
-- Name: crm_boards_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_boards_user_idx ON public.crm_boards USING btree (user_id, archived);


--
-- Name: crm_boards_workspace_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX crm_boards_workspace_session_idx ON public.crm_boards USING btree (org_id, source_session_id) WHERE (source_session_id IS NOT NULL);


--
-- Name: crm_companies_firm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_companies_firm_idx ON public.crm_companies USING btree (firm_id) WHERE (firm_id IS NOT NULL);


--
-- Name: crm_companies_identity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX crm_companies_identity_idx ON public.crm_companies USING btree (org_id, identity);


--
-- Name: crm_companies_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_companies_scope_idx ON public.crm_companies USING btree (scope_key, created_at DESC);


--
-- Name: crm_deals_board_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_deals_board_idx ON public.crm_deals USING btree (board_id);


--
-- Name: crm_deals_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_deals_company_idx ON public.crm_deals USING btree (company_id);


--
-- Name: crm_deals_migrated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX crm_deals_migrated_idx ON public.crm_deals USING btree (migrated_from_entry_id) WHERE (migrated_from_entry_id IS NOT NULL);


--
-- Name: crm_deals_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_deals_scope_idx ON public.crm_deals USING btree (scope_key, added_at DESC);


--
-- Name: crm_deals_scope_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_deals_scope_stage_idx ON public.crm_deals USING btree (scope_key, stage);


--
-- Name: crm_entries_board_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_board_idx ON public.crm_entries USING btree (board_id);


--
-- Name: crm_entries_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_embedding_hnsw ON public.crm_entries USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: crm_entries_firm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_firm_idx ON public.crm_entries USING btree (firm_id);


--
-- Name: crm_entries_investor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_investor_idx ON public.crm_entries USING btree (investor_id);


--
-- Name: crm_entries_legacy_identity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX crm_entries_legacy_identity_idx ON public.crm_entries USING btree (user_id, source, import_key) WHERE (org_id IS NULL);


--
-- Name: crm_entries_linkedin_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_linkedin_data_idx ON public.crm_entries USING btree (user_id, linkedin_data_at DESC NULLS LAST) WHERE (linkedin_data IS NOT NULL);


--
-- Name: crm_entries_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_scope_idx ON public.crm_entries USING btree (scope_key, added_at DESC);


--
-- Name: crm_entries_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_session_idx ON public.crm_entries USING btree (source, source_session_id);


--
-- Name: crm_entries_twenty_opportunity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_twenty_opportunity_idx ON public.crm_entries USING btree (twenty_opportunity_id) WHERE (twenty_opportunity_id IS NOT NULL);


--
-- Name: crm_entries_user_firm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_user_firm_idx ON public.crm_entries USING btree (user_id, firm_id);


--
-- Name: crm_entries_user_investor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_user_investor_idx ON public.crm_entries USING btree (user_id, investor_id);


--
-- Name: crm_entries_user_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_user_stage_idx ON public.crm_entries USING btree (user_id, stage);


--
-- Name: crm_entries_workspace_identity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX crm_entries_workspace_identity_idx ON public.crm_entries USING btree (org_id, source, import_key);


--
-- Name: crm_entries_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_entries_workspace_idx ON public.crm_entries USING btree (org_id, board_id);


--
-- Name: crm_migration_report_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_migration_report_idx ON public.crm_migration_report USING btree (migration, finding);


--
-- Name: crm_people_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_people_company_idx ON public.crm_people USING btree (company_id);


--
-- Name: crm_people_identity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX crm_people_identity_idx ON public.crm_people USING btree (org_id, identity);


--
-- Name: crm_people_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_people_scope_idx ON public.crm_people USING btree (scope_key, created_at DESC);


--
-- Name: crm_saved_views_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_saved_views_scope_idx ON public.crm_saved_views USING btree (scope_key);


--
-- Name: crm_saved_views_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_saved_views_user_idx ON public.crm_saved_views USING btree (user_id);


--
-- Name: crm_saved_views_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_saved_views_workspace_idx ON public.crm_saved_views USING btree (org_id, user_id);


--
-- Name: crm_tasks_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_entry_idx ON public.crm_tasks USING btree (crm_entry_id);


--
-- Name: crm_tasks_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_scope_idx ON public.crm_tasks USING btree (scope_key, due_at);


--
-- Name: crm_tasks_user_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_user_open_idx ON public.crm_tasks USING btree (user_id, due_at) WHERE (done_at IS NULL);


--
-- Name: crm_tasks_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_workspace_idx ON public.crm_tasks USING btree (org_id, crm_entry_id);


--
-- Name: cron_runs_job_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cron_runs_job_idx ON public.cron_runs USING btree (job, started_at DESC);


--
-- Name: cron_runs_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cron_runs_recent_idx ON public.cron_runs USING btree (started_at DESC);


--
-- Name: data_room_documents_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_room_documents_fund_idx ON public.data_room_documents USING btree (fund_id, category, created_at DESC) WHERE (archived_at IS NULL);


--
-- Name: data_room_documents_lp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_room_documents_lp_idx ON public.data_room_documents USING btree (fund_lp_id, created_at DESC) WHERE ((archived_at IS NULL) AND (fund_lp_id IS NOT NULL));


--
-- Name: deal_documents_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_documents_deal_idx ON public.deal_documents USING btree (deal_id, category, created_at DESC);


--
-- Name: deal_founders_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_founders_deal_idx ON public.deal_founders USING btree (deal_id, is_primary DESC, created_at);


--
-- Name: deal_opps_fund_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_opps_fund_stage_idx ON public.deal_opportunities USING btree (fund_id, stage);


--
-- Name: deck_templates_favorite_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deck_templates_favorite_idx ON public.deck_templates USING btree (favorite) WHERE (favorite = true);


--
-- Name: deck_templates_shortlist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deck_templates_shortlist_idx ON public.deck_templates USING btree (shortlisted) WHERE (shortlisted = true);


--
-- Name: deck_templates_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deck_templates_type_idx ON public.deck_templates USING btree (deck_type);


--
-- Name: decks_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX decks_fund_idx ON public.decks USING btree (fund_id) WHERE (fund_id IS NOT NULL);


--
-- Name: decks_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX decks_owner_idx ON public.decks USING btree (owner_id, created_at DESC);


--
-- Name: decks_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX decks_template_idx ON public.decks USING btree (template_id);


--
-- Name: dependency_checks_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dependency_checks_recent_idx ON public.dependency_checks USING btree (checked_at DESC);


--
-- Name: directory_candidates_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX directory_candidates_queue_idx ON public.directory_candidates USING btree (kind, status, tier, score DESC);


--
-- Name: directory_tombstones_batch_email_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX directory_tombstones_batch_email_uq ON public.directory_tombstones USING btree (source, email_hash) WHERE ((source IS NOT NULL) AND (email_hash IS NOT NULL) AND (linkedin_hash IS NULL));


--
-- Name: directory_tombstones_batch_li_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX directory_tombstones_batch_li_uq ON public.directory_tombstones USING btree (source, linkedin_hash) WHERE ((source IS NOT NULL) AND (linkedin_hash IS NOT NULL) AND (email_hash IS NULL));


--
-- Name: directory_tombstones_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX directory_tombstones_email_idx ON public.directory_tombstones USING btree (email_hash) WHERE (email_hash IS NOT NULL);


--
-- Name: directory_tombstones_linkedin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX directory_tombstones_linkedin_idx ON public.directory_tombstones USING btree (linkedin_hash) WHERE (linkedin_hash IS NOT NULL);


--
-- Name: discovery_exports_org_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX discovery_exports_org_day_idx ON public.discovery_exports USING btree (org_id, created_at);


--
-- Name: discovery_saved_searches_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX discovery_saved_searches_owner_idx ON public.discovery_saved_searches USING btree (org_id, user_id);


--
-- Name: distribution_line_items_dist_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX distribution_line_items_dist_status_idx ON public.distribution_line_items USING btree (distribution_id, status);


--
-- Name: distribution_line_items_lp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX distribution_line_items_lp_idx ON public.distribution_line_items USING btree (fund_lp_id);


--
-- Name: distributions_fund_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX distributions_fund_status_idx ON public.distributions USING btree (fund_id, status, distribution_number DESC);


--
-- Name: distributions_source_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX distributions_source_company_idx ON public.distributions USING btree (source_company_id);


--
-- Name: document_extractions_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_extractions_expiry_idx ON public.document_extractions USING btree (expires_at);


--
-- Name: document_extractions_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_extractions_key_idx ON public.document_extractions USING btree (org_id, doc_hash, kind, version);


--
-- Name: drag_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drag_company_idx ON public.data_room_access_grants USING btree (company_id);


--
-- Name: drag_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drag_token_idx ON public.data_room_access_grants USING btree (token);


--
-- Name: drd_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drd_company_idx ON public.data_room_documents USING btree (company_id);


--
-- Name: drd_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drd_item_idx ON public.data_room_documents USING btree (company_id, item_key);


--
-- Name: drd_room_section_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drd_room_section_idx ON public.data_room_documents USING btree (room_type, section);


--
-- Name: drdv_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drdv_doc_idx ON public.data_room_document_views USING btree (document_id, viewed_at DESC);


--
-- Name: drdv_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drdv_fund_idx ON public.data_room_document_views USING btree (fund_id, viewed_at DESC);


--
-- Name: drr_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drr_company_idx ON public.data_room_requests USING btree (company_id, status);


--
-- Name: drr_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drr_fund_idx ON public.data_room_requests USING btree (fund_id, status);


--
-- Name: dsar_requests_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dsar_requests_email_idx ON public.dsar_requests USING btree (requester_email_hash, kind) WHERE (closed_at IS NULL);


--
-- Name: dsar_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dsar_requests_status_idx ON public.dsar_requests USING btree (status, due_at);


--
-- Name: dsar_requests_token_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dsar_requests_token_uq ON public.dsar_requests USING btree (verify_token_hash) WHERE (verify_token_hash IS NOT NULL);


--
-- Name: early_access_requests_attribution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX early_access_requests_attribution_idx ON public.early_access_requests USING gin (attribution jsonb_path_ops);


--
-- Name: early_access_requests_email_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX early_access_requests_email_key_unique ON public.early_access_requests USING btree (email_key);


--
-- Name: early_access_requests_invite_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX early_access_requests_invite_token_idx ON public.early_access_requests USING btree (invite_token_hash) WHERE (invite_token_hash IS NOT NULL);


--
-- Name: early_access_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX early_access_requests_status_idx ON public.early_access_requests USING btree (status, created_at DESC);


--
-- Name: email_oauth_accounts_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_oauth_accounts_user_idx ON public.email_oauth_accounts USING btree (user_id, provider);


--
-- Name: email_verifications_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verifications_expires_idx ON public.email_verifications USING btree (expires_at);


--
-- Name: email_verifications_provider_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verifications_provider_day_idx ON public.email_verifications USING btree (provider, checked_at);


--
-- Name: entity_memory_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX entity_memory_key_idx ON public.entity_memory USING btree (org_id, entity_type, entity_id, key);


--
-- Name: equity_filings_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX equity_filings_company_idx ON public.equity_filings USING btree (company_id, due_date);


--
-- Name: eval_runs_ran_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eval_runs_ran_idx ON public.eval_runs USING btree (ran_at DESC);


--
-- Name: extension_tokens_hash_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extension_tokens_hash_active_idx ON public.extension_tokens USING btree (token_hash) WHERE (revoked_at IS NULL);


--
-- Name: extension_tokens_hash_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX extension_tokens_hash_uk ON public.extension_tokens USING btree (token_hash) WHERE (token_hash IS NOT NULL);


--
-- Name: extension_tokens_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extension_tokens_user_active_idx ON public.extension_tokens USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- Name: extension_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extension_tokens_user_idx ON public.extension_tokens USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- Name: fee_accruals_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_accruals_fund_idx ON public.fee_accruals USING btree (fund_id, period_end);


--
-- Name: financial_reports_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_reports_fund_idx ON public.financial_reports USING btree (fund_id, period);


--
-- Name: forecast_scenarios_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX forecast_scenarios_user_idx ON public.forecast_scenarios USING btree (user_id, created_at DESC);


--
-- Name: founder_match_results_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX founder_match_results_entity_idx ON public.founder_match_results USING btree (run_id, entity_id);


--
-- Name: founder_match_runs_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX founder_match_runs_org_idx ON public.founder_match_runs USING btree (org_id, created_at DESC);


--
-- Name: founder_match_sessions_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX founder_match_sessions_owner_idx ON public.founder_match_sessions USING btree (org_id, user_id, expires_at);


--
-- Name: founder_notifications_submission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX founder_notifications_submission_idx ON public.founder_notifications USING btree (submission_id, created_at DESC);


--
-- Name: founder_submissions_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX founder_submissions_campaign_idx ON public.founder_submissions USING btree (outreach_campaign_id) WHERE (outreach_campaign_id IS NOT NULL);


--
-- Name: founder_submissions_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX founder_submissions_email_idx ON public.founder_submissions USING btree (lower(founder_email), created_at DESC);


--
-- Name: founder_submissions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX founder_submissions_status_idx ON public.founder_submissions USING btree (status, created_at);


--
-- Name: fund_assessment_history_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fund_assessment_history_fund_idx ON public.fund_assessment_history USING btree (fund_id, captured_at DESC);


--
-- Name: fund_connect_invites_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fund_connect_invites_entity_idx ON public.fund_connect_invites USING btree (entity_id, created_at DESC);


--
-- Name: fund_connect_invites_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fund_connect_invites_fund_idx ON public.fund_connect_invites USING btree (fund_id, created_at DESC);


--
-- Name: fund_connect_invites_live_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fund_connect_invites_live_uq ON public.fund_connect_invites USING btree (fund_id, entity_id) WHERE (status = 'sent'::text);


--
-- Name: fund_lps_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fund_lps_contact_idx ON public.fund_lps USING btree (lp_contact_id);


--
-- Name: fund_lps_fund_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fund_lps_fund_status_idx ON public.fund_lps USING btree (fund_id, status);


--
-- Name: fund_lps_subscription_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fund_lps_subscription_idx ON public.fund_lps USING btree (fund_id, subscription_status);


--
-- Name: fund_profiles_workspace_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fund_profiles_workspace_user_idx ON public.fund_profiles USING btree (org_id, user_id);


--
-- Name: fund_relationships_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fund_relationships_fund_idx ON public.fund_relationships USING btree (fund_id, stage, created_at DESC);


--
-- Name: fund_relationships_fund_lp_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fund_relationships_fund_lp_uq ON public.fund_relationships USING btree (fund_lp_id) WHERE (fund_lp_id IS NOT NULL);


--
-- Name: fund_relationships_open_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fund_relationships_open_uq ON public.fund_relationships USING btree (entity_id, fund_id) WHERE (stage = ANY (ARRAY['interested'::text, 'in_talks'::text, 'invited_to_onboard'::text, 'onboarding'::text, 'on_hold'::text]));


--
-- Name: fund_relationships_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fund_relationships_user_idx ON public.fund_relationships USING btree (user_id, created_at DESC);


--
-- Name: fund_subscription_packages_one_current_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fund_subscription_packages_one_current_uq ON public.fund_subscription_packages USING btree (fund_id) WHERE (status = 'current'::text);


--
-- Name: fund_subscription_packages_one_draft_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fund_subscription_packages_one_draft_uq ON public.fund_subscription_packages USING btree (fund_id) WHERE (status = 'draft'::text);


--
-- Name: fund_subscription_packages_version_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fund_subscription_packages_version_uq ON public.fund_subscription_packages USING btree (fund_id, version);


--
-- Name: fundraising_rounds_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fundraising_rounds_scope_idx ON public.fundraising_rounds USING btree (user_id, org_id);


--
-- Name: fundraising_rounds_workspace_board_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fundraising_rounds_workspace_board_idx ON public.fundraising_rounds USING btree (org_id, board_id);


--
-- Name: funds_assessment_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funds_assessment_gin_idx ON public.funds USING gin (assessment);


--
-- Name: funds_legal_field_approvals_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funds_legal_field_approvals_gin_idx ON public.funds USING gin (legal_field_approvals);


--
-- Name: funds_legal_fields_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funds_legal_fields_gin_idx ON public.funds USING gin (legal_fields);


--
-- Name: funds_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funds_status_idx ON public.funds USING btree (status);


--
-- Name: grant_exercises_grant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX grant_exercises_grant_idx ON public.grant_exercises USING btree (grant_id, exercised_on);


--
-- Name: idx_documents_startup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_startup ON public.documents USING btree (startup_id);


--
-- Name: idx_documents_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_user ON public.documents USING btree (user_id);


--
-- Name: idx_early_access_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_early_access_requests_created_at ON public.early_access_requests USING btree (created_at DESC);


--
-- Name: idx_early_access_requests_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_early_access_requests_email ON public.early_access_requests USING btree (email);


--
-- Name: idx_early_access_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_early_access_requests_status ON public.early_access_requests USING btree (status);


--
-- Name: idx_email_suppressions_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_suppressions_email ON public.email_suppressions USING btree (lower(email));


--
-- Name: idx_investor_calls_crm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_investor_calls_crm ON public.investor_calls USING btree (crm_entry_id);


--
-- Name: idx_investor_calls_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_investor_calls_user ON public.investor_calls USING btree (user_id, created_at DESC);


--
-- Name: idx_investor_updates_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_investor_updates_user ON public.investor_updates USING btree (user_id, created_at DESC);


--
-- Name: idx_market_signals_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_signals_at ON public.market_signals USING btree (signal_at DESC);


--
-- Name: idx_market_signals_sector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_signals_sector ON public.market_signals USING btree (lower(sector));


--
-- Name: idx_outreach_replies_classify_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_replies_classify_claim ON public.outreach_replies USING btree (received_at) WHERE (classification IS NULL);


--
-- Name: idx_update_recipients_update; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_update_recipients_update ON public.investor_update_recipients USING btree (update_id);


--
-- Name: idx_update_recipients_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_update_recipients_user ON public.investor_update_recipients USING btree (user_id);


--
-- Name: impersonation_grants_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX impersonation_grants_token_idx ON public.impersonation_grants USING btree (token_hash);


--
-- Name: intake_submissions_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intake_submissions_fund_idx ON public.intake_submissions USING btree (fund_id, created_at DESC);


--
-- Name: intake_submissions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intake_submissions_status_idx ON public.intake_submissions USING btree (status) WHERE (status = ANY (ARRAY['received'::text, 'assessing'::text]));


--
-- Name: investment_firms_activity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investment_firms_activity_idx ON public.investment_firms USING btree (activity_checked_at NULLS FIRST);


--
-- Name: investment_firms_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investment_firms_embedding_hnsw ON public.investment_firms USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: investment_firms_norm_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investment_firms_norm_class_idx ON public.investment_firms USING btree (norm_class, norm_country);


--
-- Name: investment_firms_norm_sectors_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investment_firms_norm_sectors_idx ON public.investment_firms USING gin (norm_sectors);


--
-- Name: investment_firms_norm_stages_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investment_firms_norm_stages_idx ON public.investment_firms USING gin (norm_stages);


--
-- Name: investments_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investments_company_idx ON public.investments USING btree (company_id);


--
-- Name: investments_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investments_fund_idx ON public.investments USING btree (fund_id, status);


--
-- Name: investor_calls_import; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX investor_calls_import ON public.investor_calls USING btree (user_id, org_id, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: investor_calls_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_calls_workspace ON public.investor_calls USING btree (user_id, org_id, created_at DESC);


--
-- Name: investor_claim_codes_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_claim_codes_user_idx ON public.investor_claim_codes USING btree (user_id, created_at DESC);


--
-- Name: investor_entities_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_entities_user_idx ON public.investor_entities USING btree (user_id) WHERE (archived_at IS NULL);


--
-- Name: investor_entity_events_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_entity_events_entity_idx ON public.investor_entity_events USING btree (entity_id, at DESC);


--
-- Name: investor_entity_invites_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_entity_invites_email_idx ON public.investor_entity_invites USING btree (lower(email));


--
-- Name: investor_entity_invites_open_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX investor_entity_invites_open_uq ON public.investor_entity_invites USING btree (entity_id, lower(email)) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: investor_entity_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_entity_members_user_idx ON public.investor_entity_members USING btree (user_id);


--
-- Name: investor_signup_codes_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_signup_codes_email_idx ON public.investor_signup_codes USING btree (lower(email), created_at DESC);


--
-- Name: investor_update_recipients_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX investor_update_recipients_email_idx ON public.investor_update_recipients USING btree (update_id, lower(email)) WHERE (email IS NOT NULL);


--
-- Name: investor_updates_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_updates_workspace_idx ON public.investor_updates USING btree (org_id, created_at DESC);


--
-- Name: investors_email_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investors_email_hash_idx ON public.investors USING btree (email_hash) WHERE (email_hash IS NOT NULL);


--
-- Name: investors_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investors_embedding_hnsw ON public.investors USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: investors_firm_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investors_firm_id_idx ON public.investors USING btree (firm_id);


--
-- Name: investors_linkedin_hashes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investors_linkedin_hashes_idx ON public.investors USING gin (linkedin_hashes);


--
-- Name: investors_norm_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investors_norm_class_idx ON public.investors USING btree (norm_class, norm_country);


--
-- Name: investors_norm_sectors_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investors_norm_sectors_idx ON public.investors USING gin (norm_sectors);


--
-- Name: investors_norm_stages_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investors_norm_stages_idx ON public.investors USING gin (norm_stages);


--
-- Name: investors_unhashed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investors_unhashed_idx ON public.investors USING btree (id) WHERE (hashed_at IS NULL);


--
-- Name: journal_entries_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_fund_idx ON public.journal_entries USING btree (fund_id, entry_date);


--
-- Name: journal_entries_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_source_idx ON public.journal_entries USING btree (fund_id, source_kind);


--
-- Name: journal_lines_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_lines_account_idx ON public.journal_lines USING btree (account_code);


--
-- Name: journal_lines_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_lines_entry_idx ON public.journal_lines USING btree (entry_id);


--
-- Name: kpi_extractions_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kpi_extractions_company_idx ON public.portfolio_kpi_extractions USING btree (company_id);


--
-- Name: kpi_extractions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kpi_extractions_status_idx ON public.portfolio_kpi_extractions USING btree (status, created_at DESC);


--
-- Name: kyc_cases_lp_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX kyc_cases_lp_uniq ON public.kyc_cases USING btree (fund_lp_id) WHERE (fund_lp_id IS NOT NULL);


--
-- Name: kyc_cases_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kyc_cases_owner_idx ON public.kyc_cases USING btree (created_by, created_at DESC);


--
-- Name: kyc_docs_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kyc_docs_case_idx ON public.kyc_documents USING btree (case_id);


--
-- Name: kyc_document_files_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kyc_document_files_case_idx ON public.kyc_document_files USING btree (case_id);


--
-- Name: kyc_document_files_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kyc_document_files_doc_idx ON public.kyc_document_files USING btree (doc_id, created_at DESC);


--
-- Name: kyc_hits_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kyc_hits_case_idx ON public.kyc_screening_hits USING btree (case_id);


--
-- Name: kyc_watchlist_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX kyc_watchlist_uniq ON public.kyc_watchlist USING btree (name, list);


--
-- Name: legal_documents_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX legal_documents_fund_idx ON public.legal_documents USING btree (fund_id, entity_id);


--
-- Name: legal_documents_key_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX legal_documents_key_unique_idx ON public.legal_documents USING btree (fund_id, doc_key);


--
-- Name: legal_entities_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX legal_entities_fund_idx ON public.legal_entities USING btree (fund_id, kind);


--
-- Name: legal_entities_slug_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX legal_entities_slug_unique_idx ON public.legal_entities USING btree (fund_id, slug);


--
-- Name: li_action_queue_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_action_queue_campaign_idx ON public.li_action_queue USING btree (campaign_id) WHERE (campaign_id IS NOT NULL);


--
-- Name: li_action_queue_claim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_action_queue_claim_idx ON public.li_action_queue USING btree (user_id, status, scheduled_for, created_at);


--
-- Name: li_action_queue_sender_done_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_action_queue_sender_done_idx ON public.li_action_queue USING btree (sender_id, action_type, completed_at) WHERE (status = 'done'::text);


--
-- Name: li_action_queue_sender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_action_queue_sender_idx ON public.li_action_queue USING btree (sender_id, status);


--
-- Name: li_campaign_members_accepted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_campaign_members_accepted_idx ON public.li_campaign_members USING btree (campaign_id) WHERE (accepted_at IS NOT NULL);


--
-- Name: li_campaign_members_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_campaign_members_campaign_idx ON public.li_campaign_members USING btree (campaign_id, state);


--
-- Name: li_campaign_members_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_campaign_members_due_idx ON public.li_campaign_members USING btree (campaign_id, state, last_action_at);


--
-- Name: li_campaign_members_sender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_campaign_members_sender_idx ON public.li_campaign_members USING btree (sender_id) WHERE (sender_id IS NOT NULL);


--
-- Name: li_campaign_senders_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_campaign_senders_campaign_idx ON public.li_campaign_senders USING btree (campaign_id);


--
-- Name: li_campaign_steps_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_campaign_steps_campaign_idx ON public.li_campaign_steps USING btree (campaign_id, step_order);


--
-- Name: li_campaigns_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_campaigns_user_idx ON public.li_campaigns USING btree (user_id, status);


--
-- Name: li_conversations_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_conversations_member_idx ON public.li_conversations USING btree (member_id) WHERE (member_id IS NOT NULL);


--
-- Name: li_conversations_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_conversations_user_idx ON public.li_conversations USING btree (user_id, last_message_at DESC);


--
-- Name: li_lead_list_members_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_lead_list_members_list_idx ON public.li_lead_list_members USING btree (list_id, created_at DESC);


--
-- Name: li_lead_lists_shared_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_lead_lists_shared_idx ON public.li_lead_lists USING btree (shared_org_id) WHERE (shared_org_id IS NOT NULL);


--
-- Name: li_lead_lists_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_lead_lists_user_idx ON public.li_lead_lists USING btree (user_id, created_at DESC);


--
-- Name: li_messages_conversation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_messages_conversation_idx ON public.li_messages USING btree (conversation_id, sent_at);


--
-- Name: li_suppressions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX li_suppressions_user_idx ON public.li_suppressions USING btree (user_id);


--
-- Name: linkedin_connections_firm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX linkedin_connections_firm_idx ON public.linkedin_connections USING btree (firm_slug) WHERE (firm_slug IS NOT NULL);


--
-- Name: linkedin_connections_owner_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX linkedin_connections_owner_company_idx ON public.linkedin_connections USING btree (owner_id, company);


--
-- Name: linkedin_connections_owner_degree_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX linkedin_connections_owner_degree_idx ON public.linkedin_connections USING btree (owner_id, degree);


--
-- Name: linkedin_connections_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX linkedin_connections_owner_idx ON public.linkedin_connections USING btree (owner_id);


--
-- Name: linkedin_connections_owner_slug_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX linkedin_connections_owner_slug_uk ON public.linkedin_connections USING btree (owner_user_id, profile_slug) WHERE ((owner_user_id IS NOT NULL) AND (profile_slug IS NOT NULL));


--
-- Name: linkedin_mutuals_owner_mutual_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX linkedin_mutuals_owner_mutual_idx ON public.linkedin_mutuals USING btree (owner_id, mutual_url);


--
-- Name: linkedin_mutuals_owner_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX linkedin_mutuals_owner_person_idx ON public.linkedin_mutuals USING btree (owner_id, person_url);


--
-- Name: linkedin_senders_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX linkedin_senders_user_idx ON public.linkedin_senders USING btree (user_id, status);


--
-- Name: linkedin_senders_user_urn_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX linkedin_senders_user_urn_uidx ON public.linkedin_senders USING btree (user_id, member_urn) WHERE (member_urn IS NOT NULL);


--
-- Name: loan_covenants_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_covenants_loan_idx ON public.loan_covenants USING btree (loan_id);


--
-- Name: loan_payments_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_payments_loan_idx ON public.loan_payments USING btree (loan_id, paid_on);


--
-- Name: loans_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loans_owner_idx ON public.loans USING btree (created_by, created_at DESC);


--
-- Name: lp_accounts_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_accounts_email_idx ON public.lp_accounts USING btree (lower(email));


--
-- Name: lp_commitment_events_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_commitment_events_fund_idx ON public.lp_commitment_events USING btree (fund_id, created_at);


--
-- Name: lp_commitment_events_partner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_commitment_events_partner_idx ON public.lp_commitment_events USING btree (partner_id);


--
-- Name: lp_contact_matches_session_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_contact_matches_session_score_idx ON public.lp_contact_matches USING btree (session_id, score DESC);


--
-- Name: lp_contact_matches_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_contact_matches_stage_idx ON public.lp_contact_matches USING btree (fund_profile_id, stage);


--
-- Name: lp_documents_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_documents_fund_idx ON public.lp_documents USING btree (fund_id, created_at DESC);


--
-- Name: lp_documents_lp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_documents_lp_idx ON public.lp_documents USING btree (lp_id) WHERE (lp_id IS NOT NULL);


--
-- Name: lp_eval_labels_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_eval_labels_org_idx ON public.lp_eval_labels USING btree (org_id, fund_profile_id);


--
-- Name: lp_firm_matches_session_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_firm_matches_session_score_idx ON public.lp_firm_matches USING btree (session_id, score DESC);


--
-- Name: lp_firm_matches_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_firm_matches_stage_idx ON public.lp_firm_matches USING btree (fund_profile_id, stage);


--
-- Name: lp_information_sharing_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_information_sharing_fund_idx ON public.lp_information_sharing USING btree (fund_id);


--
-- Name: lp_match_audit_match_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_match_audit_match_idx ON public.lp_match_audit USING btree (match_id, created_at DESC);


--
-- Name: lp_match_feedback_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_match_feedback_org_idx ON public.lp_match_feedback USING btree (org_id, entity_key, created_at DESC);


--
-- Name: lp_match_sessions_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_match_sessions_fund_idx ON public.lp_match_sessions USING btree (fund_profile_id, created_at DESC);


--
-- Name: lp_match_sessions_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_match_sessions_hash_idx ON public.lp_match_sessions USING btree (org_id, inputs_hash, created_at DESC) WHERE (inputs_hash IS NOT NULL);


--
-- Name: lp_match_sessions_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_match_sessions_open_idx ON public.lp_match_sessions USING btree (status, heartbeat_at) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: lp_match_sessions_open_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lp_match_sessions_open_uq ON public.lp_match_sessions USING btree (org_id, inputs_hash) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: lp_match_sessions_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_match_sessions_org_idx ON public.lp_match_sessions USING btree (org_id, created_at DESC);


--
-- Name: lp_portal_access_log_lp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_portal_access_log_lp_idx ON public.lp_portal_access_log USING btree (lp_id, at DESC);


--
-- Name: lp_portal_codes_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_portal_codes_token_idx ON public.lp_portal_codes USING btree (token_id, created_at DESC);


--
-- Name: lp_portal_sessions_lp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_portal_sessions_lp_idx ON public.lp_portal_sessions USING btree (lp_id, created_at DESC);


--
-- Name: lp_portal_tokens_lp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_portal_tokens_lp_idx ON public.lp_portal_tokens USING btree (lp_id) WHERE (revoked = false);


--
-- Name: lp_positions_fund_asof_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_positions_fund_asof_idx ON public.lp_positions USING btree (fund_id, as_of DESC);


--
-- Name: lp_positions_lp_asof_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_positions_lp_asof_idx ON public.lp_positions USING btree (lp_id, as_of DESC);


--
-- Name: lp_quarterly_reports_fund_quarter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_quarterly_reports_fund_quarter_idx ON public.lp_quarterly_reports USING btree (fund_id, quarter_end DESC);


--
-- Name: lp_quarterly_reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_quarterly_reports_status_idx ON public.lp_quarterly_reports USING btree (status);


--
-- Name: lp_requests_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_requests_fund_idx ON public.lp_requests USING btree (fund_id, created_at DESC);


--
-- Name: lp_requests_lp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_requests_lp_idx ON public.lp_requests USING btree (lp_id, created_at DESC);


--
-- Name: lp_statement_imports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_statement_imports_status_idx ON public.lp_statement_imports USING btree (fund_id, status, created_at DESC);


--
-- Name: lp_subscription_files_lp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_subscription_files_lp_idx ON public.lp_subscription_files USING btree (lp_id, created_at DESC) WHERE (lp_id IS NOT NULL);


--
-- Name: lp_subscription_files_package_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_subscription_files_package_idx ON public.lp_subscription_files USING btree (package_id) WHERE (role = 'package_doc'::text);


--
-- Name: lp_terms_lp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lp_terms_lp_idx ON public.lp_terms_acceptances USING btree (lp_id, accepted_at DESC);


--
-- Name: match_outcome_events_firm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_outcome_events_firm_idx ON public.match_outcome_events USING btree (firm_id);


--
-- Name: match_outcome_events_investor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_outcome_events_investor_idx ON public.match_outcome_events USING btree (investor_id);


--
-- Name: match_outcome_events_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_outcome_events_subject_idx ON public.match_outcome_events USING btree (source, subject_id);


--
-- Name: match_outcome_events_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_outcome_events_type_idx ON public.match_outcome_events USING btree (event_type);


--
-- Name: match_outcome_events_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_outcome_events_user_idx ON public.match_outcome_events USING btree (user_id);


--
-- Name: matching_weight_history_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matching_weight_history_active_idx ON public.matching_weight_history USING btree (engine, is_active, created_at DESC);


--
-- Name: mc_actuals_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mc_actuals_fund_idx ON public.mc_actuals USING btree (fund_id, occurred_on);


--
-- Name: mcp_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcp_tokens_user_idx ON public.mcp_tokens USING btree (user_id);


--
-- Name: mcp_tokens_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcp_tokens_workspace_idx ON public.mcp_tokens USING btree (workspace_id);


--
-- Name: memberships_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memberships_user_idx ON public.memberships USING btree (user_id);


--
-- Name: news_articles_scheduled_for_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX news_articles_scheduled_for_idx ON public.news_articles USING btree (scheduled_for) WHERE (((status)::text = 'draft'::text) AND (scheduled_for IS NOT NULL));


--
-- Name: news_articles_slug_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX news_articles_slug_unique_idx ON public.news_articles USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: news_source_items_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX news_source_items_recent_idx ON public.news_source_items USING btree (published_at DESC NULLS LAST);


--
-- Name: news_source_items_source_url_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX news_source_items_source_url_idx ON public.news_source_items USING btree (source_url);


--
-- Name: notifications_user_dedupe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notifications_user_dedupe_idx ON public.notifications USING btree (user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);


--
-- Name: notifications_user_feed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_feed_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: notifications_user_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_unread_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: onboarding_drafts_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onboarding_drafts_workspace_idx ON public.onboarding_drafts USING btree (workspace_id);


--
-- Name: option_grants_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX option_grants_company_idx ON public.option_grants USING btree (company_id, created_at DESC);


--
-- Name: outreach_campaign_members_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_campaign_members_campaign_idx ON public.outreach_campaign_members USING btree (campaign_id);


--
-- Name: outreach_campaign_members_crm_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_campaign_members_crm_entry_idx ON public.outreach_campaign_members USING btree (crm_entry_id);


--
-- Name: outreach_campaign_members_enrichment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_campaign_members_enrichment_idx ON public.outreach_campaign_members USING btree (campaign_id, enrichment_status) WHERE (selected = true);


--
-- Name: outreach_campaign_members_selected_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_campaign_members_selected_idx ON public.outreach_campaign_members USING btree (campaign_id, selected) WHERE (selected = true);


--
-- Name: outreach_campaign_members_tier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_campaign_members_tier_idx ON public.outreach_campaign_members USING btree (campaign_id, tier) WHERE (tier IS NOT NULL);


--
-- Name: outreach_campaign_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_campaign_members_user_idx ON public.outreach_campaign_members USING btree (user_id, status);


--
-- Name: outreach_campaign_schedules_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_campaign_schedules_campaign_idx ON public.outreach_campaign_schedules USING btree (campaign_id, status);


--
-- Name: outreach_campaign_schedules_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_campaign_schedules_due_idx ON public.outreach_campaign_schedules USING btree (scheduled_at, status) WHERE (status = 'pending'::text);


--
-- Name: outreach_campaigns_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_campaigns_user_idx ON public.outreach_campaigns USING btree (user_id, archived);


--
-- Name: outreach_crawl_queue_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_crawl_queue_campaign_idx ON public.outreach_crawl_queue USING btree (campaign_id);


--
-- Name: outreach_crawl_queue_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_crawl_queue_status_idx ON public.outreach_crawl_queue USING btree (status, requested_at);


--
-- Name: outreach_crawl_queue_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_crawl_queue_user_status_idx ON public.outreach_crawl_queue USING btree (user_id, status);


--
-- Name: outreach_events_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_events_kind_idx ON public.outreach_events USING btree (kind, occurred_at DESC);


--
-- Name: outreach_events_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_events_message_idx ON public.outreach_events USING btree (message_id, occurred_at DESC);


--
-- Name: outreach_events_provider_event_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outreach_events_provider_event_uidx ON public.outreach_events USING btree (provider_event_id) WHERE (provider_event_id IS NOT NULL);


--
-- Name: outreach_messages_call_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outreach_messages_call_idx ON public.outreach_messages USING btree (call_id) WHERE (call_id IS NOT NULL);


--
-- Name: outreach_messages_call_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_messages_call_lookup_idx ON public.outreach_messages USING btree (call_id);


--
-- Name: outreach_messages_crm_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_messages_crm_entry_idx ON public.outreach_messages USING btree (crm_entry_id);


--
-- Name: outreach_messages_followup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_messages_followup_idx ON public.outreach_messages USING btree (needs_followup, followup_due_at) WHERE (needs_followup = true);


--
-- Name: outreach_messages_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_messages_message_id_idx ON public.outreach_messages USING btree (email_message_id) WHERE (email_message_id IS NOT NULL);


--
-- Name: outreach_messages_resend_sync_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_messages_resend_sync_idx ON public.outreach_messages USING btree (last_resend_sync_at NULLS FIRST) WHERE ((channel = 'email'::text) AND (resend_id IS NOT NULL) AND (status = ANY (ARRAY['sent'::text, 'delivered'::text, 'opened'::text, 'clicked'::text, 'replied'::text])));


--
-- Name: outreach_messages_scheduled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_messages_scheduled_idx ON public.outreach_messages USING btree (status, scheduled_for) WHERE (status = ANY (ARRAY['queued'::text, 'approved'::text]));


--
-- Name: outreach_messages_sender_contact_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outreach_messages_sender_contact_kind_idx ON public.outreach_messages USING btree (user_id, crm_entry_id, kind) WHERE (call_id IS NULL);


--
-- Name: outreach_messages_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_messages_thread_idx ON public.outreach_messages USING btree (email_thread_id) WHERE (email_thread_id IS NOT NULL);


--
-- Name: outreach_messages_tracking_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_messages_tracking_idx ON public.outreach_messages USING btree (tracking_id) WHERE (tracking_id IS NOT NULL);


--
-- Name: outreach_messages_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_messages_user_status_idx ON public.outreach_messages USING btree (user_id, status);


--
-- Name: outreach_replies_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_replies_class_idx ON public.outreach_replies USING btree (classification);


--
-- Name: outreach_replies_crm_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_replies_crm_entry_idx ON public.outreach_replies USING btree (crm_entry_id);


--
-- Name: outreach_replies_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_replies_user_idx ON public.outreach_replies USING btree (user_id);


--
-- Name: outreach_reply_deliveries_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outreach_reply_deliveries_message_idx ON public.outreach_reply_deliveries USING btree (outreach_message_id) WHERE (outreach_message_id IS NOT NULL);


--
-- Name: outreach_templates_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_templates_user_idx ON public.outreach_templates USING btree (user_id, archived);


--
-- Name: passport_documents_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX passport_documents_entity_idx ON public.passport_documents USING btree (entity_id, doc_type, created_at DESC);


--
-- Name: passport_shares_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX passport_shares_entity_idx ON public.passport_shares USING btree (entity_id, shared_at DESC);


--
-- Name: platform_api_keys_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_api_keys_provider_idx ON public.platform_api_keys USING btree (provider, created_at DESC);


--
-- Name: portfolio_companies_fund_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX portfolio_companies_fund_status_idx ON public.portfolio_companies USING btree (fund_id, status);


--
-- Name: portfolio_companies_sector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX portfolio_companies_sector_idx ON public.portfolio_companies USING btree (sector);


--
-- Name: portfolio_companies_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX portfolio_companies_stage_idx ON public.portfolio_companies USING btree (stage);


--
-- Name: portfolio_kpi_extractions_fund_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX portfolio_kpi_extractions_fund_status_idx ON public.portfolio_kpi_extractions USING btree (fund_id, status, created_at DESC);


--
-- Name: portfolio_kpis_company_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX portfolio_kpis_company_month_idx ON public.portfolio_kpis_monthly USING btree (company_id, month_end DESC);


--
-- Name: private_artifacts_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX private_artifacts_expiry_idx ON public.private_artifacts USING btree (expires_at);


--
-- Name: private_artifacts_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX private_artifacts_scope_idx ON public.private_artifacts USING btree (user_id, org_id);


--
-- Name: relationship_attachments_msg_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationship_attachments_msg_idx ON public.relationship_attachments USING btree (message_id);


--
-- Name: relationship_attachments_rel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationship_attachments_rel_idx ON public.relationship_attachments USING btree (relationship_id);


--
-- Name: relationship_materials_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationship_materials_fund_idx ON public.relationship_materials USING btree (fund_id);


--
-- Name: relationship_materials_live_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX relationship_materials_live_uq ON public.relationship_materials USING btree (relationship_id, document_id) WHERE (revoked_at IS NULL);


--
-- Name: relationship_meetings_rel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationship_meetings_rel_idx ON public.relationship_meetings USING btree (relationship_id, created_at DESC);


--
-- Name: relationship_messages_rel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationship_messages_rel_idx ON public.relationship_messages USING btree (relationship_id, created_at);


--
-- Name: saved_templates_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_templates_user_idx ON public.saved_templates USING btree (user_id, created_at DESC);


--
-- Name: send_authorizations_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX send_authorizations_active_idx ON public.send_authorizations USING btree (status, expires_at) WHERE (status = 'active'::text);


--
-- Name: send_authorizations_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX send_authorizations_org_idx ON public.send_authorizations USING btree (org_id, approved_at DESC);


--
-- Name: send_items_auth_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX send_items_auth_idx ON public.send_items USING btree (authorization_id, status);


--
-- Name: send_items_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX send_items_due_idx ON public.send_items USING btree (send_after) WHERE (status = 'approved'::text);


--
-- Name: send_items_live_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX send_items_live_message_idx ON public.send_items USING btree (message_id) WHERE (status = ANY (ARRAY['approved'::text, 'sending'::text]));


--
-- Name: sender_profiles_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sender_profiles_user_idx ON public.sender_profiles USING btree (user_id);


--
-- Name: smoke_runs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX smoke_runs_created_idx ON public.smoke_runs USING btree (created_at DESC);


--
-- Name: spv_portal_tokens_sub_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX spv_portal_tokens_sub_idx ON public.spv_portal_tokens USING btree (subscription_id, created_at DESC);


--
-- Name: spv_subscriptions_spv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX spv_subscriptions_spv_idx ON public.spv_subscriptions USING btree (spv_id, created_at DESC);


--
-- Name: spvs_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX spvs_owner_idx ON public.spvs USING btree (created_by, created_at DESC);


--
-- Name: staff_login_attempts_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_login_attempts_email_idx ON public.staff_login_attempts USING btree (lower(email), at DESC);


--
-- Name: staff_login_attempts_ip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_login_attempts_ip_idx ON public.staff_login_attempts USING btree (ip, at DESC);


--
-- Name: staff_sessions_staff_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_sessions_staff_idx ON public.staff_sessions USING btree (staff_id, created_at DESC);


--
-- Name: startups_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX startups_org_idx ON public.startups USING btree (org_id);


--
-- Name: startups_public_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX startups_public_idx ON public.startups USING btree (is_public) WHERE is_public;


--
-- Name: studio_projects_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX studio_projects_fund_idx ON public.studio_projects USING btree (fund_id, stage);


--
-- Name: submission_assessment_jobs_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX submission_assessment_jobs_due_idx ON public.submission_assessment_jobs USING btree (status, updated_at) WHERE (status = ANY (ARRAY['pending'::text, 'running'::text]));


--
-- Name: submission_assessment_jobs_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX submission_assessment_jobs_uniq ON public.submission_assessment_jobs USING btree (submission_id, phase);


--
-- Name: syndicate_partners_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX syndicate_partners_fund_idx ON public.syndicate_partners USING btree (lead_fund_id);


--
-- Name: syndicates_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX syndicates_lead_idx ON public.syndicates USING btree (lead_fund_id);


--
-- Name: tasks_assignee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_assignee_idx ON public.tasks USING btree (assignee_id, stage);


--
-- Name: tasks_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_org_idx ON public.tasks USING btree (org_id);


--
-- Name: telegram_bots_member_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX telegram_bots_member_uq ON public.telegram_bots USING btree (org_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: telegram_bots_workspace_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX telegram_bots_workspace_uq ON public.telegram_bots USING btree (org_id) WHERE (user_id IS NULL);


--
-- Name: telegram_link_codes_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_link_codes_user_idx ON public.telegram_link_codes USING btree (user_id, created_at DESC);


--
-- Name: telegram_links_live_bot_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX telegram_links_live_bot_uq ON public.telegram_links USING btree (bot_id, telegram_user_id) WHERE (status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text]));


--
-- Name: telegram_links_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_links_org_idx ON public.telegram_links USING btree (org_id, status);


--
-- Name: telegram_links_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_links_user_idx ON public.telegram_links USING btree (user_id, status);


--
-- Name: telegram_pending_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_pending_expiry_idx ON public.telegram_pending USING btree (expires_at);


--
-- Name: telegram_pending_link_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_pending_link_idx ON public.telegram_pending USING btree (link_id, created_at DESC);


--
-- Name: telegram_sent_org_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_sent_org_kind_idx ON public.telegram_sent USING btree (org_id, kind, sent_at DESC);


--
-- Name: telegram_updates_chat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_updates_chat_idx ON public.telegram_updates USING btree (chat_id, update_id);


--
-- Name: telegram_updates_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_updates_status_idx ON public.telegram_updates USING btree (status, received_at);


--
-- Name: tenant_lifecycle_events_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_lifecycle_events_org_idx ON public.tenant_lifecycle_events USING btree (org_id, id DESC);


--
-- Name: tenant_requests_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_requests_org_idx ON public.tenant_requests USING btree (org_id, created_at DESC);


--
-- Name: tenant_tombstones_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_tombstones_org_idx ON public.tenant_tombstones USING btree (org_id);


--
-- Name: uq_email_suppressions_user_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_email_suppressions_user_email ON public.email_suppressions USING btree (user_id, lower(email));


--
-- Name: uq_intake_submissions_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_intake_submissions_ref ON public.intake_submissions USING btree (public_ref);


--
-- Name: uq_market_signals_derived; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_market_signals_derived ON public.market_signals USING btree (investor_id, signal_type) WHERE ((investor_id IS NOT NULL) AND (source = 'derived'::text));


--
-- Name: uq_outreach_consents_user_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_outreach_consents_user_email ON public.outreach_consents USING btree (user_id, lower(email));


--
-- Name: uq_outreach_replies_provider_msgid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_outreach_replies_provider_msgid ON public.outreach_replies USING btree (user_id, provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: usage_events_org_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_events_org_month_idx ON public.usage_events USING btree (org_id, created_at DESC);


--
-- Name: usage_events_unit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_events_unit_idx ON public.usage_events USING btree (unit, created_at DESC);


--
-- Name: valuation_snapshots_fund_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX valuation_snapshots_fund_idx ON public.valuation_snapshots USING btree (fund_id, as_of_date DESC);


--
-- Name: valuation_snapshots_inv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX valuation_snapshots_inv_idx ON public.valuation_snapshots USING btree (investment_id, as_of_date DESC, created_at DESC);


--
-- Name: valuations_409a_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX valuations_409a_company_idx ON public.valuations_409a USING btree (company_id, created_at DESC);


--
-- Name: workspace_access_events_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_access_events_org_idx ON public.workspace_access_events USING btree (org_id, id DESC);


--
-- Name: workspace_decks_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_decks_scope_idx ON public.workspace_decks USING btree (user_id, org_id, updated_at DESC);


--
-- Name: workspace_decks_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_decks_workspace_idx ON public.workspace_decks USING btree (org_id, updated_at DESC);


--
-- Name: workspace_invitation_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_invitation_pending_idx ON public.workspace_invitations USING btree (org_id, lower(email)) WHERE (status = 'pending'::text);


--
-- Name: workspace_transfer_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_transfer_pending_idx ON public.workspace_ownership_transfers USING btree (org_id) WHERE (status = 'pending'::text);


--
-- Name: anker_chat_events anker_chat_event_scope_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER anker_chat_event_scope_trg BEFORE INSERT ON public.anker_chat_events FOR EACH ROW EXECUTE FUNCTION public.anker_chat_event_scope();


--
-- Name: anker_chat_events anker_chat_events_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER anker_chat_events_no_update BEFORE DELETE OR UPDATE ON public.anker_chat_events FOR EACH ROW EXECUTE FUNCTION public.anker_chat_events_append_only();


--
-- Name: crm_activities crm_activities_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_activities_no_update BEFORE DELETE OR UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.crm_activities_append_only();


--
-- Name: crm_deals crm_deal_entity_parent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_deal_entity_parent BEFORE INSERT OR UPDATE OF org_id, company_id, person_id, board_id ON public.crm_deals FOR EACH ROW EXECUTE FUNCTION public.check_crm_entity_parent();


--
-- Name: crm_entries crm_entry_workspace_parent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_entry_workspace_parent BEFORE INSERT OR UPDATE OF org_id, board_id ON public.crm_entries FOR EACH ROW EXECUTE FUNCTION public.check_crm_workspace_parent();


--
-- Name: crm_entries crm_import_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_import_identity BEFORE INSERT ON public.crm_entries FOR EACH ROW EXECUTE FUNCTION public.set_crm_import_identity();


--
-- Name: crm_people crm_person_entity_parent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_person_entity_parent BEFORE INSERT OR UPDATE OF org_id, company_id ON public.crm_people FOR EACH ROW EXECUTE FUNCTION public.check_crm_entity_parent();


--
-- Name: crm_tasks crm_task_workspace_parent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_task_workspace_parent BEFORE INSERT OR UPDATE OF org_id, crm_entry_id ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION public.check_crm_workspace_parent();


--
-- Name: fundraising_rounds round_workspace_parent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER round_workspace_parent BEFORE INSERT OR UPDATE OF org_id, board_id ON public.fundraising_rounds FOR EACH ROW EXECUTE FUNCTION public.check_crm_workspace_parent();


--
-- Name: fund_profiles sync_matching_fund_legacy; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_matching_fund_legacy BEFORE INSERT OR UPDATE ON public.fund_profiles FOR EACH ROW EXECUTE FUNCTION public.sync_matching_fund_legacy();


--
-- Name: accelerated_match_jobs accelerated_match_jobs_founder_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accelerated_match_jobs
    ADD CONSTRAINT accelerated_match_jobs_founder_id_users_id_fk FOREIGN KEY (founder_id) REFERENCES public.users(id);


--
-- Name: accelerated_match_jobs accelerated_match_jobs_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accelerated_match_jobs
    ADD CONSTRAINT accelerated_match_jobs_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id);


--
-- Name: activity_logs activity_logs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: agent_runs agent_runs_crm_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_crm_entry_id_fkey FOREIGN KEY (crm_entry_id) REFERENCES public.crm_entries(id) ON DELETE CASCADE;


--
-- Name: ai_processing_logs ai_processing_logs_cancelled_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_processing_logs
    ADD CONSTRAINT ai_processing_logs_cancelled_by_users_id_fk FOREIGN KEY (cancelled_by) REFERENCES public.users(id);


--
-- Name: ai_processing_logs ai_processing_logs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_processing_logs
    ADD CONSTRAINT ai_processing_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: ai_studio_artifacts ai_studio_artifacts_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_artifacts
    ADD CONSTRAINT ai_studio_artifacts_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.ai_studio_pipelines(id) ON DELETE CASCADE;


--
-- Name: ai_studio_jobs ai_studio_jobs_audio_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_jobs
    ADD CONSTRAINT ai_studio_jobs_audio_asset_id_fkey FOREIGN KEY (audio_asset_id) REFERENCES public.ai_studio_assets(id);


--
-- Name: ai_studio_jobs ai_studio_jobs_source_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_jobs
    ADD CONSTRAINT ai_studio_jobs_source_asset_id_fkey FOREIGN KEY (source_asset_id) REFERENCES public.ai_studio_assets(id);


--
-- Name: ai_studio_pipelines ai_studio_pipelines_consent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_pipelines
    ADD CONSTRAINT ai_studio_pipelines_consent_id_fkey FOREIGN KEY (consent_id) REFERENCES public.ai_studio_consents(id);


--
-- Name: ai_studio_reviews ai_studio_reviews_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_reviews
    ADD CONSTRAINT ai_studio_reviews_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.ai_studio_pipelines(id) ON DELETE CASCADE;


--
-- Name: ai_studio_stages ai_studio_stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_studio_stages
    ADD CONSTRAINT ai_studio_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.ai_studio_pipelines(id) ON DELETE CASCADE;


--
-- Name: alert_events alert_events_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_events
    ADD CONSTRAINT alert_events_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.alert_incidents(id) ON DELETE CASCADE;


--
-- Name: anker_chat_events anker_chat_events_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anker_chat_events
    ADD CONSTRAINT anker_chat_events_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.anker_chats(id) ON DELETE CASCADE;


--
-- Name: archived_contacts archived_contacts_archived_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_contacts
    ADD CONSTRAINT archived_contacts_archived_by_users_id_fk FOREIGN KEY (archived_by) REFERENCES public.users(id);


--
-- Name: archived_investment_firms archived_investment_firms_archived_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_investment_firms
    ADD CONSTRAINT archived_investment_firms_archived_by_users_id_fk FOREIGN KEY (archived_by) REFERENCES public.users(id);


--
-- Name: archived_investors archived_investors_archived_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_investors
    ADD CONSTRAINT archived_investors_archived_by_users_id_fk FOREIGN KEY (archived_by) REFERENCES public.users(id);


--
-- Name: background_jobs background_jobs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_jobs
    ADD CONSTRAINT background_jobs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: batch_enrichment_jobs batch_enrichment_jobs_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_enrichment_jobs
    ADD CONSTRAINT batch_enrichment_jobs_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: calendar_meetings calendar_meetings_related_deal_id_deals_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_meetings
    ADD CONSTRAINT calendar_meetings_related_deal_id_deals_id_fk FOREIGN KEY (related_deal_id) REFERENCES public.deals(id);


--
-- Name: calendar_meetings calendar_meetings_related_firm_id_investment_firms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_meetings
    ADD CONSTRAINT calendar_meetings_related_firm_id_investment_firms_id_fk FOREIGN KEY (related_firm_id) REFERENCES public.investment_firms(id);


--
-- Name: calendar_meetings calendar_meetings_related_investor_id_investors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_meetings
    ADD CONSTRAINT calendar_meetings_related_investor_id_investors_id_fk FOREIGN KEY (related_investor_id) REFERENCES public.investors(id);


--
-- Name: calendar_meetings calendar_meetings_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_meetings
    ADD CONSTRAINT calendar_meetings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: call_sync_devices call_sync_devices_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sync_devices
    ADD CONSTRAINT call_sync_devices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: campaign_crm_entries campaign_crm_entries_outreach_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_crm_entries
    ADD CONSTRAINT campaign_crm_entries_outreach_campaign_id_fkey FOREIGN KEY (outreach_campaign_id) REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_crm_entries campaign_crm_entries_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_crm_entries
    ADD CONSTRAINT campaign_crm_entries_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.founder_submissions(id) ON DELETE CASCADE;


--
-- Name: campaign_interest_tokens campaign_interest_tokens_campaign_crm_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_interest_tokens
    ADD CONSTRAINT campaign_interest_tokens_campaign_crm_entry_id_fkey FOREIGN KEY (campaign_crm_entry_id) REFERENCES public.campaign_crm_entries(id) ON DELETE CASCADE;


--
-- Name: capital_call_line_items capital_call_line_items_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capital_call_line_items
    ADD CONSTRAINT capital_call_line_items_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.capital_calls(id) ON DELETE CASCADE;


--
-- Name: capital_call_line_items capital_call_line_items_fund_lp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capital_call_line_items
    ADD CONSTRAINT capital_call_line_items_fund_lp_id_fkey FOREIGN KEY (fund_lp_id) REFERENCES public.fund_lps(id) ON DELETE CASCADE;


--
-- Name: capital_calls capital_calls_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capital_calls
    ADD CONSTRAINT capital_calls_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: checklist_sessions checklist_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_sessions
    ADD CONSTRAINT checklist_sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: compliance_deadlines compliance_deadlines_compliance_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_deadlines
    ADD CONSTRAINT compliance_deadlines_compliance_item_id_fkey FOREIGN KEY (compliance_item_id) REFERENCES public.compliance_items(id) ON DELETE CASCADE;


--
-- Name: compliance_deadlines compliance_deadlines_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_deadlines
    ADD CONSTRAINT compliance_deadlines_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: compliance_fund_settings compliance_fund_settings_compliance_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_fund_settings
    ADD CONSTRAINT compliance_fund_settings_compliance_item_id_fkey FOREIGN KEY (compliance_item_id) REFERENCES public.compliance_items(id) ON DELETE CASCADE;


--
-- Name: compliance_fund_settings compliance_fund_settings_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_fund_settings
    ADD CONSTRAINT compliance_fund_settings_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: contacts contacts_source_firm_id_investment_firms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_source_firm_id_investment_firms_id_fk FOREIGN KEY (source_firm_id) REFERENCES public.investment_firms(id);


--
-- Name: contacts contacts_source_investor_id_investors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_source_investor_id_investors_id_fk FOREIGN KEY (source_investor_id) REFERENCES public.investors(id);


--
-- Name: crm_activities crm_activities_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: crm_boards crm_boards_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_boards
    ADD CONSTRAINT crm_boards_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: crm_companies crm_companies_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: crm_deals crm_deals_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.crm_boards(id) ON DELETE SET NULL;


--
-- Name: crm_deals crm_deals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.crm_companies(id) ON DELETE SET NULL;


--
-- Name: crm_deals crm_deals_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: crm_deals crm_deals_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.crm_people(id) ON DELETE SET NULL;


--
-- Name: crm_entries crm_entries_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_entries
    ADD CONSTRAINT crm_entries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: crm_people crm_people_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_people
    ADD CONSTRAINT crm_people_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.crm_companies(id) ON DELETE SET NULL;


--
-- Name: crm_people crm_people_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_people
    ADD CONSTRAINT crm_people_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: crm_saved_views crm_saved_views_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_saved_views
    ADD CONSTRAINT crm_saved_views_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: crm_tasks crm_tasks_crm_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_crm_entry_id_fkey FOREIGN KEY (crm_entry_id) REFERENCES public.crm_entries(id) ON DELETE CASCADE;


--
-- Name: crm_tasks crm_tasks_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: data_room_documents data_room_documents_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_documents
    ADD CONSTRAINT data_room_documents_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: data_room_documents data_room_documents_fund_lp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_room_documents
    ADD CONSTRAINT data_room_documents_fund_lp_id_fkey FOREIGN KEY (fund_lp_id) REFERENCES public.fund_lps(id) ON DELETE CASCADE;


--
-- Name: database_backups database_backups_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_backups
    ADD CONSTRAINT database_backups_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: database_backups database_backups_restored_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_backups
    ADD CONSTRAINT database_backups_restored_by_users_id_fk FOREIGN KEY (restored_by) REFERENCES public.users(id);


--
-- Name: deal_documents deal_documents_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_documents
    ADD CONSTRAINT deal_documents_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deal_opportunities(id) ON DELETE CASCADE;


--
-- Name: deal_evaluations deal_evaluations_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_evaluations
    ADD CONSTRAINT deal_evaluations_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deal_opportunities(id) ON DELETE CASCADE;


--
-- Name: deal_founders deal_founders_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_founders
    ADD CONSTRAINT deal_founders_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deal_opportunities(id) ON DELETE CASCADE;


--
-- Name: deal_opportunities deal_opportunities_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_opportunities
    ADD CONSTRAINT deal_opportunities_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: deal_room_access_grants deal_room_access_grants_firm_id_investment_firms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_access_grants
    ADD CONSTRAINT deal_room_access_grants_firm_id_investment_firms_id_fk FOREIGN KEY (firm_id) REFERENCES public.investment_firms(id);


--
-- Name: deal_room_access_grants deal_room_access_grants_investor_id_investors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_access_grants
    ADD CONSTRAINT deal_room_access_grants_investor_id_investors_id_fk FOREIGN KEY (investor_id) REFERENCES public.investors(id);


--
-- Name: deal_room_access_grants deal_room_access_grants_room_id_deal_rooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_access_grants
    ADD CONSTRAINT deal_room_access_grants_room_id_deal_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.deal_rooms(id);


--
-- Name: deal_room_access_grants deal_room_access_grants_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_access_grants
    ADD CONSTRAINT deal_room_access_grants_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: deal_room_audit_events deal_room_audit_events_room_id_deal_rooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_audit_events
    ADD CONSTRAINT deal_room_audit_events_room_id_deal_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.deal_rooms(id);


--
-- Name: deal_room_audit_events deal_room_audit_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_audit_events
    ADD CONSTRAINT deal_room_audit_events_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: deal_room_documents deal_room_documents_room_id_deal_rooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_documents
    ADD CONSTRAINT deal_room_documents_room_id_deal_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.deal_rooms(id);


--
-- Name: deal_room_documents deal_room_documents_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_documents
    ADD CONSTRAINT deal_room_documents_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id);


--
-- Name: deal_room_documents deal_room_documents_uploaded_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_documents
    ADD CONSTRAINT deal_room_documents_uploaded_by_users_id_fk FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: deal_room_milestones deal_room_milestones_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_milestones
    ADD CONSTRAINT deal_room_milestones_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: deal_room_milestones deal_room_milestones_room_id_deal_rooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_milestones
    ADD CONSTRAINT deal_room_milestones_room_id_deal_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.deal_rooms(id);


--
-- Name: deal_room_nda_agreements deal_room_nda_agreements_room_id_deal_rooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_nda_agreements
    ADD CONSTRAINT deal_room_nda_agreements_room_id_deal_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.deal_rooms(id);


--
-- Name: deal_room_nda_agreements deal_room_nda_agreements_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_nda_agreements
    ADD CONSTRAINT deal_room_nda_agreements_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: deal_room_notes deal_room_notes_author_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_notes
    ADD CONSTRAINT deal_room_notes_author_id_users_id_fk FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: deal_room_notes deal_room_notes_room_id_deal_rooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_notes
    ADD CONSTRAINT deal_room_notes_room_id_deal_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.deal_rooms(id);


--
-- Name: deal_room_questions deal_room_questions_answered_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_questions
    ADD CONSTRAINT deal_room_questions_answered_by_users_id_fk FOREIGN KEY (answered_by) REFERENCES public.users(id);


--
-- Name: deal_room_questions deal_room_questions_asked_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_questions
    ADD CONSTRAINT deal_room_questions_asked_by_users_id_fk FOREIGN KEY (asked_by) REFERENCES public.users(id);


--
-- Name: deal_room_questions deal_room_questions_document_id_deal_room_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_questions
    ADD CONSTRAINT deal_room_questions_document_id_deal_room_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.deal_room_documents(id);


--
-- Name: deal_room_questions deal_room_questions_room_id_deal_rooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_room_questions
    ADD CONSTRAINT deal_room_questions_room_id_deal_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.deal_rooms(id);


--
-- Name: deal_rooms deal_rooms_deal_id_deals_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_rooms
    ADD CONSTRAINT deal_rooms_deal_id_deals_id_fk FOREIGN KEY (deal_id) REFERENCES public.deals(id);


--
-- Name: deal_rooms deal_rooms_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_rooms
    ADD CONSTRAINT deal_rooms_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: deal_rooms deal_rooms_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_rooms
    ADD CONSTRAINT deal_rooms_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id);


--
-- Name: deals deals_assigned_to_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_assigned_to_users_id_fk FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: deals deals_firm_id_investment_firms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_firm_id_investment_firms_id_fk FOREIGN KEY (firm_id) REFERENCES public.investment_firms(id);


--
-- Name: deals deals_investor_id_investors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_investor_id_investors_id_fk FOREIGN KEY (investor_id) REFERENCES public.investors(id);


--
-- Name: deals deals_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: deals deals_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id);


--
-- Name: decks decks_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT decks_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.deck_templates(id) ON DELETE RESTRICT;


--
-- Name: discovery_saved_searches discovery_saved_searches_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_saved_searches
    ADD CONSTRAINT discovery_saved_searches_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: distribution_line_items distribution_line_items_distribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_line_items
    ADD CONSTRAINT distribution_line_items_distribution_id_fkey FOREIGN KEY (distribution_id) REFERENCES public.distributions(id) ON DELETE CASCADE;


--
-- Name: distribution_line_items distribution_line_items_fund_lp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_line_items
    ADD CONSTRAINT distribution_line_items_fund_lp_id_fkey FOREIGN KEY (fund_lp_id) REFERENCES public.fund_lps(id) ON DELETE CASCADE;


--
-- Name: distributions distributions_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributions
    ADD CONSTRAINT distributions_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: distributions distributions_source_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributions
    ADD CONSTRAINT distributions_source_company_id_fkey FOREIGN KEY (source_company_id) REFERENCES public.portfolio_companies(id) ON DELETE SET NULL;


--
-- Name: document_chunks document_chunks_document_id_research_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_document_id_research_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.research_documents(id);


--
-- Name: document_extractions document_extractions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_extractions
    ADD CONSTRAINT document_extractions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: email_templates email_templates_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: enrichment_jobs enrichment_jobs_applied_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_jobs
    ADD CONSTRAINT enrichment_jobs_applied_by_users_id_fk FOREIGN KEY (applied_by) REFERENCES public.users(id);


--
-- Name: fee_accruals fee_accruals_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_accruals
    ADD CONSTRAINT fee_accruals_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: fee_schedules fee_schedules_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedules
    ADD CONSTRAINT fee_schedules_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: folk_failed_records folk_failed_records_run_id_folk_import_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folk_failed_records
    ADD CONSTRAINT folk_failed_records_run_id_folk_import_runs_id_fk FOREIGN KEY (run_id) REFERENCES public.folk_import_runs(id);


--
-- Name: folk_field_mappings folk_field_mappings_approved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folk_field_mappings
    ADD CONSTRAINT folk_field_mappings_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: folk_import_runs folk_import_runs_initiated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folk_import_runs
    ADD CONSTRAINT folk_import_runs_initiated_by_users_id_fk FOREIGN KEY (initiated_by) REFERENCES public.users(id);


--
-- Name: folk_import_runs folk_import_runs_workspace_id_folk_workspaces_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folk_import_runs
    ADD CONSTRAINT folk_import_runs_workspace_id_folk_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.folk_workspaces(id);


--
-- Name: founder_match_exclusions founder_match_exclusions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_match_exclusions
    ADD CONSTRAINT founder_match_exclusions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: founder_match_results founder_match_results_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_match_results
    ADD CONSTRAINT founder_match_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.founder_match_runs(id) ON DELETE CASCADE;


--
-- Name: founder_match_runs founder_match_runs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_match_runs
    ADD CONSTRAINT founder_match_runs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: founder_match_runs founder_match_runs_profile_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_match_runs
    ADD CONSTRAINT founder_match_runs_profile_version_id_fkey FOREIGN KEY (profile_version_id) REFERENCES public.startup_profiles(id) ON DELETE SET NULL;


--
-- Name: founder_match_sessions founder_match_sessions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_match_sessions
    ADD CONSTRAINT founder_match_sessions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: founder_notifications founder_notifications_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_notifications
    ADD CONSTRAINT founder_notifications_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.founder_submissions(id) ON DELETE CASCADE;


--
-- Name: founder_submissions founder_submissions_outreach_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_submissions
    ADD CONSTRAINT founder_submissions_outreach_campaign_id_fkey FOREIGN KEY (outreach_campaign_id) REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL;


--
-- Name: fund_compliance_profile fund_compliance_profile_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_compliance_profile
    ADD CONSTRAINT fund_compliance_profile_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: fund_connect_invites fund_connect_invites_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_connect_invites
    ADD CONSTRAINT fund_connect_invites_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.investor_entities(id) ON DELETE CASCADE;


--
-- Name: fund_connect_invites fund_connect_invites_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_connect_invites
    ADD CONSTRAINT fund_connect_invites_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: fund_investments fund_investments_deal_id_deals_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_investments
    ADD CONSTRAINT fund_investments_deal_id_deals_id_fk FOREIGN KEY (deal_id) REFERENCES public.deals(id);


--
-- Name: fund_investments fund_investments_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_investments
    ADD CONSTRAINT fund_investments_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id);


--
-- Name: fund_listings fund_listings_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_listings
    ADD CONSTRAINT fund_listings_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: fund_lps fund_lps_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_lps
    ADD CONSTRAINT fund_lps_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: fund_lps fund_lps_lp_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_lps
    ADD CONSTRAINT fund_lps_lp_contact_id_fkey FOREIGN KEY (lp_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: fund_profiles fund_profiles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_profiles
    ADD CONSTRAINT fund_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: fund_relationships fund_relationships_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_relationships
    ADD CONSTRAINT fund_relationships_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.investor_entities(id) ON DELETE CASCADE;


--
-- Name: fund_relationships fund_relationships_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_relationships
    ADD CONSTRAINT fund_relationships_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: fund_relationships fund_relationships_fund_lp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_relationships
    ADD CONSTRAINT fund_relationships_fund_lp_id_fkey FOREIGN KEY (fund_lp_id) REFERENCES public.fund_lps(id) ON DELETE SET NULL;


--
-- Name: fundraising_rounds fundraising_rounds_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraising_rounds
    ADD CONSTRAINT fundraising_rounds_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.crm_boards(id) ON DELETE RESTRICT;


--
-- Name: fundraising_rounds fundraising_rounds_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraising_rounds
    ADD CONSTRAINT fundraising_rounds_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: grant_exercises grant_exercises_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grant_exercises
    ADD CONSTRAINT grant_exercises_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.option_grants(id) ON DELETE CASCADE;


--
-- Name: ic_memos ic_memos_approved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ic_memos
    ADD CONSTRAINT ic_memos_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: ic_memos ic_memos_investment_case_id_investment_cases_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ic_memos
    ADD CONSTRAINT ic_memos_investment_case_id_investment_cases_id_fk FOREIGN KEY (investment_case_id) REFERENCES public.investment_cases(id);


--
-- Name: ic_memos ic_memos_last_edited_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ic_memos
    ADD CONSTRAINT ic_memos_last_edited_by_users_id_fk FOREIGN KEY (last_edited_by) REFERENCES public.users(id);


--
-- Name: ic_memos ic_memos_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ic_memos
    ADD CONSTRAINT ic_memos_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: ic_votes ic_votes_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ic_votes
    ADD CONSTRAINT ic_votes_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deal_opportunities(id) ON DELETE CASCADE;


--
-- Name: impersonation_grants impersonation_grants_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation_grants
    ADD CONSTRAINT impersonation_grants_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.company_staff(id);


--
-- Name: interaction_logs interaction_logs_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interaction_logs
    ADD CONSTRAINT interaction_logs_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: interaction_logs interaction_logs_firm_id_investment_firms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interaction_logs
    ADD CONSTRAINT interaction_logs_firm_id_investment_firms_id_fk FOREIGN KEY (firm_id) REFERENCES public.investment_firms(id);


--
-- Name: interaction_logs interaction_logs_investor_id_investors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interaction_logs
    ADD CONSTRAINT interaction_logs_investor_id_investors_id_fk FOREIGN KEY (investor_id) REFERENCES public.investors(id);


--
-- Name: interaction_logs interaction_logs_outreach_id_outreaches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interaction_logs
    ADD CONSTRAINT interaction_logs_outreach_id_outreaches_id_fk FOREIGN KEY (outreach_id) REFERENCES public.outreaches(id);


--
-- Name: interaction_logs interaction_logs_performed_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interaction_logs
    ADD CONSTRAINT interaction_logs_performed_by_id_users_id_fk FOREIGN KEY (performed_by_id) REFERENCES public.users(id);


--
-- Name: interaction_logs interaction_logs_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interaction_logs
    ADD CONSTRAINT interaction_logs_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id);


--
-- Name: interview_feedback interview_feedback_interview_id_interviews_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_feedback
    ADD CONSTRAINT interview_feedback_interview_id_interviews_id_fk FOREIGN KEY (interview_id) REFERENCES public.interviews(id);


--
-- Name: interview_messages interview_messages_interview_id_interviews_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_messages
    ADD CONSTRAINT interview_messages_interview_id_interviews_id_fk FOREIGN KEY (interview_id) REFERENCES public.interviews(id);


--
-- Name: interview_scores interview_scores_interview_id_interviews_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_scores
    ADD CONSTRAINT interview_scores_interview_id_interviews_id_fk FOREIGN KEY (interview_id) REFERENCES public.interviews(id);


--
-- Name: interviews interviews_founder_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interviews
    ADD CONSTRAINT interviews_founder_id_users_id_fk FOREIGN KEY (founder_id) REFERENCES public.users(id);


--
-- Name: interviews interviews_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interviews
    ADD CONSTRAINT interviews_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id);


--
-- Name: introductions introductions_connector_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.introductions
    ADD CONSTRAINT introductions_connector_id_users_id_fk FOREIGN KEY (connector_id) REFERENCES public.users(id);


--
-- Name: introductions introductions_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.introductions
    ADD CONSTRAINT introductions_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id);


--
-- Name: introductions introductions_requester_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.introductions
    ADD CONSTRAINT introductions_requester_id_users_id_fk FOREIGN KEY (requester_id) REFERENCES public.users(id);


--
-- Name: introductions introductions_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.introductions
    ADD CONSTRAINT introductions_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id);


--
-- Name: introductions introductions_target_firm_id_investment_firms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.introductions
    ADD CONSTRAINT introductions_target_firm_id_investment_firms_id_fk FOREIGN KEY (target_firm_id) REFERENCES public.investment_firms(id);


--
-- Name: introductions introductions_target_investor_id_investors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.introductions
    ADD CONSTRAINT introductions_target_investor_id_investors_id_fk FOREIGN KEY (target_investor_id) REFERENCES public.investors(id);


--
-- Name: investment_cases investment_cases_assigned_to_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_cases
    ADD CONSTRAINT investment_cases_assigned_to_users_id_fk FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: investment_cases investment_cases_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_cases
    ADD CONSTRAINT investment_cases_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: investment_signals investment_signals_document_id_research_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_signals
    ADD CONSTRAINT investment_signals_document_id_research_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.research_documents(id);


--
-- Name: investments investments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investments
    ADD CONSTRAINT investments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.portfolio_companies(id) ON DELETE SET NULL;


--
-- Name: investments investments_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investments
    ADD CONSTRAINT investments_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: investor_calls investor_calls_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_calls
    ADD CONSTRAINT investor_calls_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: investor_company_links investor_company_links_company_id_investment_firms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_company_links
    ADD CONSTRAINT investor_company_links_company_id_investment_firms_id_fk FOREIGN KEY (company_id) REFERENCES public.investment_firms(id);


--
-- Name: investor_company_links investor_company_links_investor_id_investors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_company_links
    ADD CONSTRAINT investor_company_links_investor_id_investors_id_fk FOREIGN KEY (investor_id) REFERENCES public.investors(id);


--
-- Name: investor_entity_events investor_entity_events_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_entity_events
    ADD CONSTRAINT investor_entity_events_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.investor_entities(id) ON DELETE CASCADE;


--
-- Name: investor_entity_invites investor_entity_invites_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_entity_invites
    ADD CONSTRAINT investor_entity_invites_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.investor_entities(id) ON DELETE CASCADE;


--
-- Name: investor_entity_members investor_entity_members_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_entity_members
    ADD CONSTRAINT investor_entity_members_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.investor_entities(id) ON DELETE CASCADE;


--
-- Name: investor_matches investor_matches_session_id_match_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_matches
    ADD CONSTRAINT investor_matches_session_id_match_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.match_sessions(id) ON DELETE CASCADE;


--
-- Name: investor_updates investor_updates_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_updates
    ADD CONSTRAINT investor_updates_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: investors investors_firm_id_investment_firms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investors
    ADD CONSTRAINT investors_firm_id_investment_firms_id_fk FOREIGN KEY (firm_id) REFERENCES public.investment_firms(id);


--
-- Name: investors investors_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investors
    ADD CONSTRAINT investors_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: journal_entries journal_entries_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: journal_lines journal_lines_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: kyc_cases kyc_cases_fund_lp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_cases
    ADD CONSTRAINT kyc_cases_fund_lp_id_fkey FOREIGN KEY (fund_lp_id) REFERENCES public.fund_lps(id) ON DELETE SET NULL;


--
-- Name: kyc_documents kyc_documents_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_documents
    ADD CONSTRAINT kyc_documents_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.kyc_cases(id) ON DELETE CASCADE;


--
-- Name: kyc_screening_hits kyc_screening_hits_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_screening_hits
    ADD CONSTRAINT kyc_screening_hits_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.kyc_cases(id) ON DELETE CASCADE;


--
-- Name: li_action_queue li_action_queue_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_action_queue
    ADD CONSTRAINT li_action_queue_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.linkedin_senders(id) ON DELETE SET NULL;


--
-- Name: li_campaign_members li_campaign_members_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_members
    ADD CONSTRAINT li_campaign_members_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.li_campaigns(id) ON DELETE CASCADE;


--
-- Name: li_campaign_members li_campaign_members_last_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_members
    ADD CONSTRAINT li_campaign_members_last_action_id_fkey FOREIGN KEY (last_action_id) REFERENCES public.li_action_queue(id) ON DELETE SET NULL;


--
-- Name: li_campaign_members li_campaign_members_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_members
    ADD CONSTRAINT li_campaign_members_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.linkedin_senders(id) ON DELETE SET NULL;


--
-- Name: li_campaign_senders li_campaign_senders_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_senders
    ADD CONSTRAINT li_campaign_senders_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.li_campaigns(id) ON DELETE CASCADE;


--
-- Name: li_campaign_senders li_campaign_senders_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_senders
    ADD CONSTRAINT li_campaign_senders_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.linkedin_senders(id) ON DELETE CASCADE;


--
-- Name: li_campaign_steps li_campaign_steps_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaign_steps
    ADD CONSTRAINT li_campaign_steps_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.li_campaigns(id) ON DELETE CASCADE;


--
-- Name: li_campaigns li_campaigns_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_campaigns
    ADD CONSTRAINT li_campaigns_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.linkedin_senders(id) ON DELETE SET NULL;


--
-- Name: li_conversations li_conversations_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_conversations
    ADD CONSTRAINT li_conversations_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.li_campaign_members(id) ON DELETE SET NULL;


--
-- Name: li_conversations li_conversations_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_conversations
    ADD CONSTRAINT li_conversations_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.linkedin_senders(id) ON DELETE SET NULL;


--
-- Name: li_lead_list_members li_lead_list_members_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_lead_list_members
    ADD CONSTRAINT li_lead_list_members_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.li_lead_lists(id) ON DELETE CASCADE;


--
-- Name: li_messages li_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_messages
    ADD CONSTRAINT li_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.li_conversations(id) ON DELETE CASCADE;


--
-- Name: loan_covenants loan_covenants_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_covenants
    ADD CONSTRAINT loan_covenants_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: loan_payments loan_payments_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_payments
    ADD CONSTRAINT loan_payments_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: lp_commitment_events lp_commitment_events_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_commitment_events
    ADD CONSTRAINT lp_commitment_events_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: lp_commitment_events lp_commitment_events_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_commitment_events
    ADD CONSTRAINT lp_commitment_events_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.syndicate_partners(id) ON DELETE CASCADE;


--
-- Name: lp_commitments lp_commitments_lp_id_lp_entities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_commitments
    ADD CONSTRAINT lp_commitments_lp_id_lp_entities_id_fk FOREIGN KEY (lp_id) REFERENCES public.lp_entities(id);


--
-- Name: lp_contact_matches lp_contact_matches_firm_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_contact_matches
    ADD CONSTRAINT lp_contact_matches_firm_match_id_fkey FOREIGN KEY (firm_match_id) REFERENCES public.lp_firm_matches(id) ON DELETE CASCADE;


--
-- Name: lp_contact_matches lp_contact_matches_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_contact_matches
    ADD CONSTRAINT lp_contact_matches_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lp_match_sessions(id) ON DELETE CASCADE;


--
-- Name: lp_distributions lp_distributions_investment_id_fund_investments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_distributions
    ADD CONSTRAINT lp_distributions_investment_id_fund_investments_id_fk FOREIGN KEY (investment_id) REFERENCES public.fund_investments(id);


--
-- Name: lp_entities lp_entities_firm_id_investment_firms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_entities
    ADD CONSTRAINT lp_entities_firm_id_investment_firms_id_fk FOREIGN KEY (firm_id) REFERENCES public.investment_firms(id);


--
-- Name: lp_eval_labels lp_eval_labels_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_eval_labels
    ADD CONSTRAINT lp_eval_labels_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: lp_firm_matches lp_firm_matches_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_firm_matches
    ADD CONSTRAINT lp_firm_matches_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lp_match_sessions(id) ON DELETE CASCADE;


--
-- Name: lp_information_sharing lp_information_sharing_lp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_information_sharing
    ADD CONSTRAINT lp_information_sharing_lp_id_fkey FOREIGN KEY (lp_id) REFERENCES public.fund_lps(id) ON DELETE CASCADE;


--
-- Name: lp_match_feedback lp_match_feedback_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_match_feedback
    ADD CONSTRAINT lp_match_feedback_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: lp_match_sessions lp_match_sessions_fund_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_match_sessions
    ADD CONSTRAINT lp_match_sessions_fund_profile_id_fkey FOREIGN KEY (fund_profile_id) REFERENCES public.fund_profiles(id) ON DELETE CASCADE;


--
-- Name: lp_pipeline_events lp_pipeline_events_contact_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_pipeline_events
    ADD CONSTRAINT lp_pipeline_events_contact_match_id_fkey FOREIGN KEY (contact_match_id) REFERENCES public.lp_contact_matches(id) ON DELETE CASCADE;


--
-- Name: lp_pipeline_events lp_pipeline_events_firm_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_pipeline_events
    ADD CONSTRAINT lp_pipeline_events_firm_match_id_fkey FOREIGN KEY (firm_match_id) REFERENCES public.lp_firm_matches(id) ON DELETE CASCADE;


--
-- Name: lp_portal_access_log lp_portal_access_log_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_portal_access_log
    ADD CONSTRAINT lp_portal_access_log_token_id_fkey FOREIGN KEY (token_id) REFERENCES public.lp_portal_tokens(id) ON DELETE SET NULL;


--
-- Name: lp_portal_tokens lp_portal_tokens_lp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_portal_tokens
    ADD CONSTRAINT lp_portal_tokens_lp_id_fkey FOREIGN KEY (lp_id) REFERENCES public.fund_lps(id) ON DELETE CASCADE;


--
-- Name: lp_positions lp_positions_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_positions
    ADD CONSTRAINT lp_positions_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.lp_statement_imports(id) ON DELETE SET NULL;


--
-- Name: lp_positions lp_positions_lp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_positions
    ADD CONSTRAINT lp_positions_lp_id_fkey FOREIGN KEY (lp_id) REFERENCES public.fund_lps(id) ON DELETE SET NULL;


--
-- Name: lp_quarterly_reports lp_quarterly_reports_fund_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_quarterly_reports
    ADD CONSTRAINT lp_quarterly_reports_fund_fk FOREIGN KEY (fund_id) REFERENCES public.funds(id);


--
-- Name: lp_reports lp_reports_approved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_reports
    ADD CONSTRAINT lp_reports_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: lp_reports lp_reports_generated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lp_reports
    ADD CONSTRAINT lp_reports_generated_by_users_id_fk FOREIGN KEY (generated_by) REFERENCES public.users(id);


--
-- Name: match_pipeline_actions match_pipeline_actions_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_pipeline_actions
    ADD CONSTRAINT match_pipeline_actions_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.investor_matches(id) ON DELETE CASCADE;


--
-- Name: match_pipeline_actions match_pipeline_actions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_pipeline_actions
    ADD CONSTRAINT match_pipeline_actions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.match_sessions(id) ON DELETE CASCADE;


--
-- Name: match_pipeline_actions match_pipeline_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_pipeline_actions
    ADD CONSTRAINT match_pipeline_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: match_sessions match_sessions_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_sessions
    ADD CONSTRAINT match_sessions_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id);


--
-- Name: match_sessions match_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_sessions
    ADD CONSTRAINT match_sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: matches matches_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: matches matches_firm_id_investment_firms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_firm_id_investment_firms_id_fk FOREIGN KEY (firm_id) REFERENCES public.investment_firms(id);


--
-- Name: matches matches_investor_id_investors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_investor_id_investors_id_fk FOREIGN KEY (investor_id) REFERENCES public.investors(id);


--
-- Name: matches matches_session_id_match_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_session_id_match_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.match_sessions(id);


--
-- Name: matches matches_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id);


--
-- Name: matching_weight_history matching_weight_history_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matching_weight_history
    ADD CONSTRAINT matching_weight_history_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: mc_actuals mc_actuals_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_actuals
    ADD CONSTRAINT mc_actuals_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: mc_budget_lines mc_budget_lines_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_budget_lines
    ADD CONSTRAINT mc_budget_lines_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: news_generation_logs news_generation_logs_article_id_news_articles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_generation_logs
    ADD CONSTRAINT news_generation_logs_article_id_news_articles_id_fk FOREIGN KEY (article_id) REFERENCES public.news_articles(id);


--
-- Name: news_generation_logs news_generation_logs_scheduled_post_id_news_scheduled_posts_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_generation_logs
    ADD CONSTRAINT news_generation_logs_scheduled_post_id_news_scheduled_posts_id_ FOREIGN KEY (scheduled_post_id) REFERENCES public.news_scheduled_posts(id);


--
-- Name: news_scheduled_posts news_scheduled_posts_article_id_news_articles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_scheduled_posts
    ADD CONSTRAINT news_scheduled_posts_article_id_news_articles_id_fk FOREIGN KEY (article_id) REFERENCES public.news_articles(id);


--
-- Name: news_source_items news_source_items_source_id_news_sources_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_source_items
    ADD CONSTRAINT news_source_items_source_id_news_sources_id_fk FOREIGN KEY (source_id) REFERENCES public.news_sources(id);


--
-- Name: notifications_legacy_20260916 notifications_legacy_20260916_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications_legacy_20260916
    ADD CONSTRAINT notifications_legacy_20260916_user_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: onboarding_drafts onboarding_drafts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_drafts
    ADD CONSTRAINT onboarding_drafts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: outreach_campaign_members outreach_campaign_members_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_campaign_members
    ADD CONSTRAINT outreach_campaign_members_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE;


--
-- Name: outreach_campaign_schedules outreach_campaign_schedules_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_campaign_schedules
    ADD CONSTRAINT outreach_campaign_schedules_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE;


--
-- Name: outreach_crawl_queue outreach_crawl_queue_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_crawl_queue
    ADD CONSTRAINT outreach_crawl_queue_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE;


--
-- Name: outreach_crawl_queue outreach_crawl_queue_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_crawl_queue
    ADD CONSTRAINT outreach_crawl_queue_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.outreach_campaign_members(id) ON DELETE CASCADE;


--
-- Name: outreach_events outreach_events_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_events
    ADD CONSTRAINT outreach_events_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.outreach_messages(id) ON DELETE CASCADE;


--
-- Name: outreach_messages outreach_messages_crm_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_messages
    ADD CONSTRAINT outreach_messages_crm_entry_id_fkey FOREIGN KEY (crm_entry_id) REFERENCES public.crm_entries(id) ON DELETE CASCADE;


--
-- Name: outreach_messages outreach_messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_messages
    ADD CONSTRAINT outreach_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.outreach_messages(id) ON DELETE SET NULL;


--
-- Name: outreach_replies outreach_replies_crm_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_replies
    ADD CONSTRAINT outreach_replies_crm_entry_id_fkey FOREIGN KEY (crm_entry_id) REFERENCES public.crm_entries(id) ON DELETE CASCADE;


--
-- Name: outreach_replies outreach_replies_in_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_replies
    ADD CONSTRAINT outreach_replies_in_reply_to_message_id_fkey FOREIGN KEY (in_reply_to_message_id) REFERENCES public.outreach_messages(id) ON DELETE SET NULL;


--
-- Name: outreaches outreaches_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreaches
    ADD CONSTRAINT outreaches_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: outreaches outreaches_firm_id_investment_firms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreaches
    ADD CONSTRAINT outreaches_firm_id_investment_firms_id_fk FOREIGN KEY (firm_id) REFERENCES public.investment_firms(id);


--
-- Name: outreaches outreaches_investor_id_investors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreaches
    ADD CONSTRAINT outreaches_investor_id_investors_id_fk FOREIGN KEY (investor_id) REFERENCES public.investors(id);


--
-- Name: outreaches outreaches_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreaches
    ADD CONSTRAINT outreaches_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: outreaches outreaches_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreaches
    ADD CONSTRAINT outreaches_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id);


--
-- Name: outreaches outreaches_template_id_email_templates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreaches
    ADD CONSTRAINT outreaches_template_id_email_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.email_templates(id);


--
-- Name: passport_documents passport_documents_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passport_documents
    ADD CONSTRAINT passport_documents_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.investor_entities(id) ON DELETE CASCADE;


--
-- Name: passport_shares passport_shares_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passport_shares
    ADD CONSTRAINT passport_shares_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.passport_documents(id) ON DELETE CASCADE;


--
-- Name: passport_shares passport_shares_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passport_shares
    ADD CONSTRAINT passport_shares_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.investor_entities(id) ON DELETE CASCADE;


--
-- Name: passport_shares passport_shares_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passport_shares
    ADD CONSTRAINT passport_shares_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.fund_relationships(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: pitch_deck_analyses pitch_deck_analyses_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_deck_analyses
    ADD CONSTRAINT pitch_deck_analyses_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: pitch_deck_analyses pitch_deck_analyses_document_id_deal_room_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_deck_analyses
    ADD CONSTRAINT pitch_deck_analyses_document_id_deal_room_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.deal_room_documents(id);


--
-- Name: pitch_deck_analyses pitch_deck_analyses_room_id_deal_rooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_deck_analyses
    ADD CONSTRAINT pitch_deck_analyses_room_id_deal_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.deal_rooms(id);


--
-- Name: planning_scenarios planning_scenarios_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_scenarios
    ADD CONSTRAINT planning_scenarios_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: platform_api_keys platform_api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_api_keys
    ADD CONSTRAINT platform_api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.company_staff(id);


--
-- Name: portfolio_companies portfolio_companies_fund_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_companies
    ADD CONSTRAINT portfolio_companies_fund_fk FOREIGN KEY (fund_id) REFERENCES public.funds(id);


--
-- Name: portfolio_kpi_extractions portfolio_kpi_extractions_company_fund_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_kpi_extractions
    ADD CONSTRAINT portfolio_kpi_extractions_company_fund_fk FOREIGN KEY (fund_id, company_id) REFERENCES public.portfolio_companies(fund_id, id);


--
-- Name: portfolio_kpi_extractions portfolio_kpi_extractions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_kpi_extractions
    ADD CONSTRAINT portfolio_kpi_extractions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.portfolio_companies(id) ON DELETE SET NULL;


--
-- Name: portfolio_kpi_extractions portfolio_kpi_extractions_fund_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_kpi_extractions
    ADD CONSTRAINT portfolio_kpi_extractions_fund_fk FOREIGN KEY (fund_id) REFERENCES public.funds(id);


--
-- Name: portfolio_kpis_monthly portfolio_kpis_monthly_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_kpis_monthly
    ADD CONSTRAINT portfolio_kpis_monthly_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.portfolio_companies(id) ON DELETE CASCADE;


--
-- Name: potential_duplicates potential_duplicates_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.potential_duplicates
    ADD CONSTRAINT potential_duplicates_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: private_artifacts private_artifacts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_artifacts
    ADD CONSTRAINT private_artifacts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: relationship_attachments relationship_attachments_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_attachments
    ADD CONSTRAINT relationship_attachments_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: relationship_attachments relationship_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_attachments
    ADD CONSTRAINT relationship_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.relationship_messages(id) ON DELETE CASCADE;


--
-- Name: relationship_attachments relationship_attachments_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_attachments
    ADD CONSTRAINT relationship_attachments_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.fund_relationships(id) ON DELETE CASCADE;


--
-- Name: relationship_materials relationship_materials_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_materials
    ADD CONSTRAINT relationship_materials_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: relationship_materials relationship_materials_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_materials
    ADD CONSTRAINT relationship_materials_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.fund_relationships(id) ON DELETE CASCADE;


--
-- Name: relationship_meetings relationship_meetings_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_meetings
    ADD CONSTRAINT relationship_meetings_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: relationship_meetings relationship_meetings_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_meetings
    ADD CONSTRAINT relationship_meetings_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.fund_relationships(id) ON DELETE CASCADE;


--
-- Name: relationship_messages relationship_messages_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_messages
    ADD CONSTRAINT relationship_messages_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: relationship_messages relationship_messages_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_messages
    ADD CONSTRAINT relationship_messages_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.fund_relationships(id) ON DELETE CASCADE;


--
-- Name: research_crawl_logs research_crawl_logs_document_id_research_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_crawl_logs
    ADD CONSTRAINT research_crawl_logs_document_id_research_documents_id_fk FOREIGN KEY (document_id) REFERENCES public.research_documents(id);


--
-- Name: research_crawl_logs research_crawl_logs_organization_id_research_organizations_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_crawl_logs
    ADD CONSTRAINT research_crawl_logs_organization_id_research_organizations_id_f FOREIGN KEY (organization_id) REFERENCES public.research_organizations(id);


--
-- Name: research_documents research_documents_organization_id_research_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_documents
    ADD CONSTRAINT research_documents_organization_id_research_organizations_id_fk FOREIGN KEY (organization_id) REFERENCES public.research_organizations(id);


--
-- Name: send_items send_items_authorization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.send_items
    ADD CONSTRAINT send_items_authorization_id_fkey FOREIGN KEY (authorization_id) REFERENCES public.send_authorizations(id) ON DELETE CASCADE;


--
-- Name: spv_portal_tokens spv_portal_tokens_spv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_portal_tokens
    ADD CONSTRAINT spv_portal_tokens_spv_id_fkey FOREIGN KEY (spv_id) REFERENCES public.spvs(id) ON DELETE CASCADE;


--
-- Name: spv_portal_tokens spv_portal_tokens_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_portal_tokens
    ADD CONSTRAINT spv_portal_tokens_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.spv_subscriptions(id) ON DELETE CASCADE;


--
-- Name: spv_subscriptions spv_subscriptions_spv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_subscriptions
    ADD CONSTRAINT spv_subscriptions_spv_id_fkey FOREIGN KEY (spv_id) REFERENCES public.spvs(id) ON DELETE CASCADE;


--
-- Name: staff_mfa staff_mfa_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_mfa
    ADD CONSTRAINT staff_mfa_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.company_staff(id) ON DELETE CASCADE;


--
-- Name: staff_sessions staff_sessions_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_sessions
    ADD CONSTRAINT staff_sessions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.company_staff(id) ON DELETE CASCADE;


--
-- Name: startup_documents startup_documents_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_documents
    ADD CONSTRAINT startup_documents_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id) ON DELETE CASCADE;


--
-- Name: startup_profiles startup_profiles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_profiles
    ADD CONSTRAINT startup_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: startups startups_founder_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startups
    ADD CONSTRAINT startups_founder_id_users_id_fk FOREIGN KEY (founder_id) REFERENCES public.users(id);


--
-- Name: studio_projects studio_projects_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_projects
    ADD CONSTRAINT studio_projects_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: submission_assessment_jobs submission_assessment_jobs_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_assessment_jobs
    ADD CONSTRAINT submission_assessment_jobs_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.founder_submissions(id) ON DELETE CASCADE;


--
-- Name: sync_logs sync_logs_initiated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_logs
    ADD CONSTRAINT sync_logs_initiated_by_users_id_fk FOREIGN KEY (initiated_by) REFERENCES public.users(id);


--
-- Name: syndicate_partners syndicate_partners_lead_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndicate_partners
    ADD CONSTRAINT syndicate_partners_lead_fund_id_fkey FOREIGN KEY (lead_fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: syndicates syndicates_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndicates
    ADD CONSTRAINT syndicates_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deal_opportunities(id) ON DELETE SET NULL;


--
-- Name: syndicates syndicates_lead_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndicates
    ADD CONSTRAINT syndicates_lead_fund_id_fkey FOREIGN KEY (lead_fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: syndicates syndicates_spv_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syndicates
    ADD CONSTRAINT syndicates_spv_fund_id_fkey FOREIGN KEY (spv_fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: team_invitations team_invitations_invited_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_invited_by_users_id_fk FOREIGN KEY (invited_by) REFERENCES public.users(id);


--
-- Name: team_invitations team_invitations_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_invited_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_invited_by_users_id_fk FOREIGN KEY (invited_by) REFERENCES public.users(id);


--
-- Name: team_members team_members_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: teams teams_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: telegram_prefs telegram_prefs_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_prefs
    ADD CONSTRAINT telegram_prefs_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.telegram_links(id) ON DELETE CASCADE;


--
-- Name: term_grids term_grids_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_grids
    ADD CONSTRAINT term_grids_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deal_opportunities(id) ON DELETE CASCADE;


--
-- Name: url_repair_candidates url_repair_candidates_health_check_id_url_health_checks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.url_repair_candidates
    ADD CONSTRAINT url_repair_candidates_health_check_id_url_health_checks_id_fk FOREIGN KEY (health_check_id) REFERENCES public.url_health_checks(id);


--
-- Name: user_email_settings user_email_settings_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_settings
    ADD CONSTRAINT user_email_settings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_roles user_roles_role_id_roles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_roles_id_fk FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: valuation_snapshots valuation_snapshots_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuation_snapshots
    ADD CONSTRAINT valuation_snapshots_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: valuation_snapshots valuation_snapshots_investment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuation_snapshots
    ADD CONSTRAINT valuation_snapshots_investment_id_fkey FOREIGN KEY (investment_id) REFERENCES public.investments(id) ON DELETE CASCADE;


--
-- Name: waterfall_runs waterfall_runs_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waterfall_runs
    ADD CONSTRAINT waterfall_runs_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;


--
-- Name: workspace_access_events workspace_access_events_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_access_events
    ADD CONSTRAINT workspace_access_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: workspace_decks workspace_decks_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_decks
    ADD CONSTRAINT workspace_decks_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: workspace_invitations workspace_invitations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: workspace_ownership_transfers workspace_ownership_transfers_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_ownership_transfers
    ADD CONSTRAINT workspace_ownership_transfers_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: ai_studio_artifacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_studio_artifacts ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_studio_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_studio_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_studio_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_studio_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_studio_credit_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_studio_credit_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_studio_credit_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_studio_credit_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_studio_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_studio_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_studio_pipelines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_studio_pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_studio_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_studio_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_studio_scope_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_studio_scope_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_studio_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_studio_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: early_access_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.early_access_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_reply_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_reply_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_access_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_access_events ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_ownership_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_ownership_transfers ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



