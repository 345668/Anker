-- CRM entities: companies, people, deals, activities.
-- Doc: docs/architecture/25-per-persona-crm.md, phase 2.
--
-- Founder workspaces only (organizations.kind='company'). VC and LP keep reading
-- crm_entries until phases 5-6, so the reader is switched per persona and nothing
-- here changes what an unmigrated persona sees.
--
-- crm_entries is neither modified nor deleted. It remains the system of record
-- until phase 7, and every crm_deals row carries migrated_from_entry_id so a bad
-- split can be diagnosed against the original rather than reconstructed.
--
-- ids are TEXT throughout, like crm_entries.id — never cast to ::uuid.
-- Re-runnable: every insert is keyed on a generated identity or on
-- migrated_from_entry_id, so applying twice is a no-op.
--
-- Preflight: scripts/checks/crm-entities-preflight.sql (read-only).
-- Local validation: scripts/checks/crm-entities-migration-check.mjs (PGlite).

-- ─── scope_key on the existing four ─────────────────────────────────────────
-- Generated, never written. Doc 00 §2.2 requires the key be derived server-side
-- and never constructed by hand; a generated column makes that an invariant the
-- database holds rather than a convention code is trusted to follow. A NULL
-- org_id (an unmigrated private record, per the 2026-09-13 migration) yields a
-- NULL scope_key, which is what keeps those rows invisible to scoped queries
-- instead of collecting them under a bogus 'org:' prefix.
ALTER TABLE crm_boards      ADD COLUMN IF NOT EXISTS scope_key text GENERATED ALWAYS AS ('org:'||org_id) STORED;
ALTER TABLE crm_entries     ADD COLUMN IF NOT EXISTS scope_key text GENERATED ALWAYS AS ('org:'||org_id) STORED;
ALTER TABLE crm_tasks       ADD COLUMN IF NOT EXISTS scope_key text GENERATED ALWAYS AS ('org:'||org_id) STORED;
ALTER TABLE crm_saved_views ADD COLUMN IF NOT EXISTS scope_key text GENERATED ALWAYS AS ('org:'||org_id) STORED;

CREATE INDEX IF NOT EXISTS crm_boards_scope_idx      ON crm_boards (scope_key, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_entries_scope_idx     ON crm_entries (scope_key, added_at DESC);
CREATE INDEX IF NOT EXISTS crm_tasks_scope_idx       ON crm_tasks (scope_key, due_at ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS crm_saved_views_scope_idx ON crm_saved_views (scope_key);

-- ─── crm_companies ──────────────────────────────────────────────────────────
-- The counterparty organisation. firm_id links to the shared directory; the
-- remaining columns are a snapshot so the row survives its directory row being
-- changed or cleaned up, which is the property crm_entries.display_* already has
-- and the one piece of that schema worth keeping.
CREATE TABLE IF NOT EXISTS crm_companies (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id     text NOT NULL REFERENCES organizations(id),
  scope_key  text GENERATED ALWAYS AS ('org:'||org_id) STORED,
  firm_id    text,
  name       text NOT NULL,
  domain     text,
  location   text,
  kind       text,
  notes      text,
  -- Dedupe within a workspace: the directory id when we have one, otherwise the
  -- normalised name. Generated so the key cannot drift from what it is derived
  -- from.
  --
  -- Internal whitespace is collapsed, not just trimmed: "Alpha  Capital" and
  -- "Alpha Capital" are a typo apart, and treating them as two companies defeats
  -- the point of a dedupe key. The cost is that two genuinely different records
  -- with the same name merge — which the preflight reports as a merge risk so a
  -- human decides, rather than the migration deciding silently.
  identity   text GENERATED ALWAYS AS (COALESCE(firm_id, 'name:'||lower(btrim(regexp_replace(name,'\s+',' ','g'))))) STORED,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_companies_identity_idx ON crm_companies (org_id, identity);
CREATE INDEX IF NOT EXISTS crm_companies_scope_idx ON crm_companies (scope_key, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_companies_firm_idx  ON crm_companies (firm_id) WHERE firm_id IS NOT NULL;

-- ─── crm_people ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_people (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id      text NOT NULL REFERENCES organizations(id),
  scope_key   text GENERATED ALWAYS AS ('org:'||org_id) STORED,
  company_id  text REFERENCES crm_companies(id) ON DELETE SET NULL,
  investor_id text,
  name        text NOT NULL,
  title       text,
  email       text,
  linkedin    text,
  location    text,
  notes       text,
  -- Whitespace-collapsed, as for crm_companies.identity above.
  identity    text GENERATED ALWAYS AS (COALESCE(investor_id, 'name:'||lower(btrim(regexp_replace(name,'\s+',' ','g'))))) STORED,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_people_identity_idx ON crm_people (org_id, identity);
CREATE INDEX IF NOT EXISTS crm_people_scope_idx   ON crm_people (scope_key, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_people_company_idx ON crm_people (company_id);

-- ─── crm_deals ──────────────────────────────────────────────────────────────
-- What is being pursued. One deal per migrated crm_entries row, which keeps the
-- split lossless and reversible; a founder who tracks the same firm across two
-- rounds gets two deals against one company, which is the point of separating
-- them.
--
-- `stage` is validated against the persona's definition in application code
-- (lib/crm/definitions), not by a CHECK constraint here: the stage set is
-- per-persona, and encoding one persona's pipeline into a shared table is how the
-- next persona's migration gets blocked.
CREATE TABLE IF NOT EXISTS crm_deals (
  id                     text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id                 text NOT NULL REFERENCES organizations(id),
  scope_key              text GENERATED ALWAYS AS ('org:'||org_id) STORED,
  company_id             text REFERENCES crm_companies(id) ON DELETE SET NULL,
  person_id              text REFERENCES crm_people(id) ON DELETE SET NULL,
  board_id               text REFERENCES crm_boards(id) ON DELETE SET NULL,
  stage                  text NOT NULL,
  amount                 numeric,
  close_date             date,
  score                  int,
  tier                   text,
  why_match              text,
  notes                  text,
  owner                  text,
  tags                   text[] NOT NULL DEFAULT '{}',
  source                 text,
  source_session_id      text,
  -- Provenance for the phase-2 split. Unique, so re-running is a no-op.
  migrated_from_entry_id text,
  added_at               timestamptz NOT NULL DEFAULT now(),
  last_contacted_at      timestamptz,
  created_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_deals_migrated_idx ON crm_deals (migrated_from_entry_id) WHERE migrated_from_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_deals_scope_stage_idx ON crm_deals (scope_key, stage);
CREATE INDEX IF NOT EXISTS crm_deals_scope_idx       ON crm_deals (scope_key, added_at DESC);
CREATE INDEX IF NOT EXISTS crm_deals_company_idx     ON crm_deals (company_id);
CREATE INDEX IF NOT EXISTS crm_deals_board_idx       ON crm_deals (board_id);

-- ─── crm_activities ─────────────────────────────────────────────────────────
-- What happened. Append-only: corrections are new rows, never edits.
--
-- The reason is the one doc 05 §S1-S2 gives for the equity tables — a history
-- that can be silently rewritten is not evidence of anything. A relationship
-- record whose call log can be edited after the fact cannot answer "when did we
-- last speak" in a way anyone should rely on.
--
-- occurred_at is when it happened; created_at is when it was logged. Backfilled
-- email and call history needs the two to differ.
CREATE TABLE IF NOT EXISTS crm_activities (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id       text NOT NULL REFERENCES organizations(id),
  scope_key    text GENERATED ALWAYS AS ('org:'||org_id) STORED,
  kind         text NOT NULL CHECK (kind IN ('meeting','call','email','note','stage_change','task_done')),
  subject_type text NOT NULL CHECK (subject_type IN ('company','person','deal')),
  subject_id   text NOT NULL,
  subject      text,
  body         text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_activities_subject_idx ON crm_activities (subject_type, subject_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_activities_scope_idx   ON crm_activities (scope_key, occurred_at DESC);

-- Enforced in the database, because "append-only" maintained only by convention
-- is not append-only. A correction is an INSERT.
CREATE OR REPLACE FUNCTION crm_activities_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'crm_activities is append-only; record a correcting entry instead' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS crm_activities_no_update ON crm_activities;
CREATE TRIGGER crm_activities_no_update BEFORE UPDATE OR DELETE ON crm_activities
  FOR EACH ROW EXECUTE FUNCTION crm_activities_append_only();

-- ─── Cross-tenant parent integrity ──────────────────────────────────────────
-- Same guarantee the 2026-09-13 migration gave crm_entries and crm_tasks: a
-- child cannot reference a parent in another workspace, even through a missed
-- legacy integration or a hand-written insert.
CREATE OR REPLACE FUNCTION check_crm_entity_parent() RETURNS trigger LANGUAGE plpgsql AS $$
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
DROP TRIGGER IF EXISTS crm_person_entity_parent ON crm_people;
CREATE TRIGGER crm_person_entity_parent BEFORE INSERT OR UPDATE OF org_id,company_id ON crm_people
  FOR EACH ROW EXECUTE FUNCTION check_crm_entity_parent();
DROP TRIGGER IF EXISTS crm_deal_entity_parent ON crm_deals;
CREATE TRIGGER crm_deal_entity_parent BEFORE INSERT OR UPDATE OF org_id,company_id,person_id,board_id ON crm_deals
  FOR EACH ROW EXECUTE FUNCTION check_crm_entity_parent();

-- ─── Migration report ───────────────────────────────────────────────────────
-- Doc 25 §6 rule 1: values are mapped, never guessed, and every judgment the
-- split had to make is recorded here rather than applied silently.
-- crm_entries.stage has been free text since May with three disagreeing writers,
-- and firm_id / investor_id are both optional on a manual add, so this table will
-- not be empty. Reading it is part of running the migration.
CREATE TABLE IF NOT EXISTS crm_migration_report (
  id          bigserial PRIMARY KEY,
  migration   text NOT NULL,
  org_id      text,
  entry_id    text,
  finding     text NOT NULL,
  detail      text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_migration_report_idx ON crm_migration_report (migration, finding);

-- ─── The plan ───────────────────────────────────────────────────────────────
-- Every decision the split makes, as one inspectable view. SELECT from it before
-- running the inserts to see exactly what will happen; it is also what the
-- report is built from, so the preview and the record cannot disagree.
--
-- Founder-scoped by construction: the JOIN to organizations excludes VC and LP
-- workspaces and, because it is an inner join, also excludes the legacy rows
-- whose org_id is NULL.
--
-- The alias list mirrors STAGE_ALIASES in lib/crm/definitions/types.ts. The two
-- must change together; the definitions test asserts the TS side, and an alias
-- added there needs a line here before this migration next runs.
CREATE OR REPLACE VIEW crm_founder_migration_plan AS
WITH alias(raw, canonical) AS (
  VALUES ('in_diligence','diligence'), ('due_diligence','diligence'), ('replied','responded'),
         ('engaged','responded'), ('rejected','declined'), ('closed','committed'),
         ('closed_won','committed'), ('closed_lost','declined'), ('prospect','queued')
), canon(stage) AS (
  VALUES ('queued'),('identified'),('researched'),('contacted'),('responded'),('meeting'),
         ('diligence'),('soft_circle'),('term_sheet'),('committed'),('wired'),
         ('passed'),('declined'),('lost')
-- Narrow a canonical stage onto the founder definition's set. Canonical stages a
-- founder pipeline has no column for map to the nearest founder stage, and every
-- one of those rows is reported as folded.
), narrow(canonical, founder, note) AS (
  VALUES ('queued','queued',NULL), ('contacted','contacted',NULL), ('responded','responded',NULL),
         ('meeting','meeting',NULL), ('diligence','diligence',NULL), ('term_sheet','term_sheet',NULL),
         ('committed','committed',NULL), ('passed','passed',NULL),
         ('identified','queued','no founder column for identified'),
         ('researched','queued','no founder column for researched'),
         ('soft_circle','term_sheet','no founder column for soft_circle'),
         ('wired','committed','wired folded into committed'),
         ('declined','passed','declined folded into passed'),
         ('lost','passed','lost folded into passed')
), classified AS (
  SELECT e.*,
         c.canonical,
         n.founder AS founder_stage,
         n.note,
         -- Is this row a person or an organisation? investor_id and firm_id are
         -- both optional on a manual add (app/api/crm/entries/route.ts), so a
         -- row can carry neither. Decide on the evidence present — a title, an
         -- email or a LinkedIn URL describes a human — and report every row that
         -- had to be decided this way rather than read off an id.
         CASE
           WHEN e.investor_id IS NOT NULL THEN 'person'
           WHEN e.firm_id IS NOT NULL THEN 'company'
           WHEN NULLIF(btrim(COALESCE(e.display_title,'')),'') IS NOT NULL
             OR NULLIF(btrim(COALESCE(e.display_email,'')),'') IS NOT NULL
             OR NULLIF(btrim(COALESCE(e.display_linkedin,'')),'') IS NOT NULL THEN 'person'
           ELSE 'company'
         END AS kind
    FROM crm_entries e
    JOIN organizations o ON o.id = e.org_id AND o.kind = 'company'
    LEFT JOIN LATERAL (
      SELECT COALESCE(a.canonical, k.stage) AS canonical
        FROM (SELECT lower(btrim(COALESCE(e.stage,''))) AS v) s
        LEFT JOIN alias a ON a.raw = s.v
        LEFT JOIN canon k ON k.stage = s.v
       LIMIT 1
    ) c ON true
    LEFT JOIN narrow n ON n.canonical = c.canonical
)
SELECT id AS entry_id, org_id, user_id, stage AS raw_stage, canonical, founder_stage, note, kind,
       (investor_id IS NULL AND firm_id IS NULL) AS ambiguous,
       firm_id, investor_id, display_name, display_title, display_email, display_linkedin,
       display_location, display_type, display_score, display_tier, why_match, notes, owner,
       board_id, tags, source, source_session_id, added_at, last_contacted_at,
       research_summary, research_url, research_at,
       -- A company is created for any row that names a firm, and for a
       -- firm-level row that does not. A person-level row with no firm_id gets
       -- no company: naming a company after the person would be worse than
       -- leaving the link empty, and the empty link is reported.
       -- Must match the generated identity columns exactly, whitespace collapsing
       -- included, or the joins below silently attach nothing.
       CASE WHEN firm_id IS NOT NULL THEN firm_id
            WHEN kind = 'company' THEN 'name:'||lower(btrim(regexp_replace(display_name,'\s+',' ','g')))
       END AS company_identity,
       CASE WHEN kind = 'person'
            THEN COALESCE(investor_id, 'name:'||lower(btrim(regexp_replace(display_name,'\s+',' ','g'))))
       END AS person_identity
  FROM classified;

-- ─── The split ──────────────────────────────────────────────────────────────

-- 1. Companies, one per firm within a workspace.
--
--    The name comes from the directory when the firm resolves. When it does not,
--    only a firm-level row can supply it — display_name on a person-level row is
--    the person's name, and using it here would label the firm after its
--    employee. Those rows keep firm_id and are reported so the name can be
--    resolved by a later directory re-sync.
INSERT INTO crm_companies (org_id, firm_id, name, location, kind, created_by)
SELECT DISTINCT ON (p.org_id, p.company_identity)
       p.org_id,
       p.firm_id,
       COALESCE(NULLIF(btrim(f.name),''),
                CASE WHEN p.kind = 'company' THEN NULLIF(btrim(p.display_name),'') END,
                'Unnamed firm'),
       CASE WHEN p.kind = 'company' THEN p.display_location END,
       CASE WHEN p.kind = 'company' THEN p.display_type END,
       p.user_id
  FROM crm_founder_migration_plan p
  LEFT JOIN investment_firms f ON f.id = p.firm_id
 WHERE p.company_identity IS NOT NULL
 ORDER BY p.org_id, p.company_identity, p.added_at
    ON CONFLICT (org_id, identity) DO NOTHING;

-- 2. People, one per contact, attached to their firm's company when there is one.
INSERT INTO crm_people (org_id, company_id, investor_id, name, title, email, linkedin, location, created_by)
SELECT DISTINCT ON (p.org_id, p.person_identity)
       p.org_id,
       cc.id,
       p.investor_id,
       COALESCE(NULLIF(btrim(p.display_name),''), 'Unnamed contact'),
       p.display_title,
       p.display_email,
       p.display_linkedin,
       p.display_location,
       p.user_id
  FROM crm_founder_migration_plan p
  LEFT JOIN crm_companies cc ON cc.org_id = p.org_id AND cc.identity = p.company_identity
 WHERE p.person_identity IS NOT NULL
 ORDER BY p.org_id, p.person_identity, p.added_at
    ON CONFLICT (org_id, identity) DO NOTHING;

-- 3. Deals, one per entry, so nothing is merged and nothing is lost.
INSERT INTO crm_deals (
  org_id, company_id, person_id, board_id, stage, score, tier, why_match,
  notes, owner, tags, source, source_session_id, migrated_from_entry_id,
  added_at, last_contacted_at, created_by
)
SELECT p.org_id,
       cc.id,
       cp.id,
       p.board_id,
       -- Unmappable stages land on the founder entry stage and are reported;
       -- never dropped, never silently renamed.
       COALESCE(p.founder_stage, 'queued'),
       p.display_score,
       p.display_tier,
       p.why_match,
       p.notes,
       p.owner,
       COALESCE(p.tags, '{}'),
       p.source,
       p.source_session_id,
       p.entry_id,
       COALESCE(p.added_at, now()),
       p.last_contacted_at,
       p.user_id
  FROM crm_founder_migration_plan p
  LEFT JOIN crm_companies cc ON cc.org_id = p.org_id AND cc.identity = p.company_identity
  LEFT JOIN crm_people    cp ON cp.org_id = p.org_id AND cp.identity = p.person_identity
    ON CONFLICT (migrated_from_entry_id) WHERE migrated_from_entry_id IS NOT NULL DO NOTHING;

-- 4. The research cache becomes the first activity, so a migrated record opens
--    with the history it already had rather than looking untouched.
INSERT INTO crm_activities (org_id, kind, subject_type, subject_id, subject, body, metadata, occurred_at, created_by)
SELECT d.org_id, 'note', 'deal', d.id, 'Research summary', p.research_summary,
       jsonb_build_object('migrated', true, 'url', p.research_url),
       COALESCE(p.research_at, p.added_at, now()), p.user_id
  FROM crm_founder_migration_plan p
  JOIN crm_deals d ON d.migrated_from_entry_id = p.entry_id
 WHERE NULLIF(btrim(COALESCE(p.research_summary,'')),'') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM crm_activities a
      WHERE a.subject_type='deal' AND a.subject_id=d.id AND a.metadata->>'migrated'='true'
   );

-- ─── Report ─────────────────────────────────────────────────────────────────
-- Each block is guarded by NOT EXISTS so a re-run does not duplicate findings.

-- Stage values the mapping could not resolve at all. These are the rows to read.
INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
SELECT '2026-09-25-crm-entities', p.org_id, p.entry_id, 'unmappable_stage',
       format('stage %L is not canonical and has no alias; deal created at queued', p.raw_stage)
  FROM crm_founder_migration_plan p
 WHERE p.canonical IS NULL
   AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                    WHERE r.entry_id = p.entry_id AND r.finding = 'unmappable_stage');

-- Stages that resolved but had no founder column and were folded.
INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
SELECT '2026-09-25-crm-entities', p.org_id, p.entry_id, 'folded_stage',
       format('%L → %L: %s', p.raw_stage, p.founder_stage, p.note)
  FROM crm_founder_migration_plan p
 WHERE p.note IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                    WHERE r.entry_id = p.entry_id AND r.finding = 'folded_stage');

-- Rows with neither firm_id nor investor_id, where person-or-company was decided
-- from the display fields. The count matters: a large number means manual adds
-- are not recording ids and the importer needs fixing, not the migration.
INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
SELECT '2026-09-25-crm-entities', p.org_id, p.entry_id, 'ambiguous_entry_kind',
       format('no firm_id or investor_id; classified as %s from display fields', p.kind)
  FROM crm_founder_migration_plan p
 WHERE p.ambiguous
   AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                    WHERE r.entry_id = p.entry_id AND r.finding = 'ambiguous_entry_kind');

-- Firms that are referenced but absent from the directory, so the company kept
-- its firm_id but could not be named.
INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
SELECT '2026-09-25-crm-entities', p.org_id, p.entry_id, 'company_name_unresolved',
       format('firm_id %L is not in investment_firms; company left as Unnamed firm', p.firm_id)
  FROM crm_founder_migration_plan p
  JOIN crm_companies cc ON cc.org_id = p.org_id AND cc.identity = p.company_identity
 WHERE p.firm_id IS NOT NULL
   AND cc.name = 'Unnamed firm'
   AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                    WHERE r.entry_id = p.entry_id AND r.finding = 'company_name_unresolved');

-- Contacts migrated with no company. Expected for a hand-added contact; a large
-- count means the directory join is wrong rather than the data thin.
INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
SELECT '2026-09-25-crm-entities', d.org_id, d.migrated_from_entry_id, 'person_without_company',
       format('contact %L migrated with no company', pe.name)
  FROM crm_deals d
  JOIN crm_people pe ON pe.id = d.person_id
 WHERE d.company_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                    WHERE r.entry_id = d.migrated_from_entry_id AND r.finding = 'person_without_company');
