-- Generalise the CRM split from founder-only to per-persona.
-- Doc: docs/architecture/25-per-persona-crm.md phase 5.
--
-- 2026-09-25-crm-entities-split.sql defined crm_founder_split() over a
-- founder-only plan view. VC needs the same split with its own stage narrowing, and
-- two near-identical copies would drift on the first change. So the plan view gains
-- a `persona` column, the narrowing table gains a persona key, and one
-- crm_split(persona) serves both.
--
-- The founder-specific view and function are dropped rather than kept as wrappers:
-- nothing in app code referenced them (only scripts/checks), and leaving a second
-- name for the same logic is how the two versions diverge.
--
-- Persona is derived from the organisation kind exactly as
-- workspace_record_access() and lib/crm/workspace.ts already do — company ⇒
-- founder, anything else ⇒ vc. LP cannot appear here by construction: an LP has no
-- workspace of their own until doc 01 lands, so no crm_entries row can carry an LP
-- org_id.
--
-- Idempotent. Safe to re-run; that is how a later adoption gets picked up.

DROP VIEW IF EXISTS crm_founder_migration_plan;
DROP FUNCTION IF EXISTS crm_founder_split();

CREATE OR REPLACE VIEW crm_migration_plan AS
WITH alias(raw, canonical) AS (
  VALUES ('in_diligence','diligence'), ('due_diligence','diligence'), ('replied','responded'),
         ('engaged','responded'), ('rejected','declined'), ('closed','committed'),
         ('closed_won','committed'), ('closed_lost','declined'), ('prospect','queued')
), canon(stage) AS (
  VALUES ('queued'),('identified'),('researched'),('contacted'),('responded'),('meeting'),
         ('diligence'),('soft_circle'),('term_sheet'),('committed'),('wired'),
         ('passed'),('declined'),('lost')
-- Narrow a canonical stage onto one persona's pipeline. Mirrors the `stages` arrays
-- in lib/crm/definitions/{founder,vc}.ts: a canonical stage the persona has no
-- column for maps to its nearest neighbour and the row is reported as folded.
--
-- The asymmetry is the point. A founder has `term_sheet` and no `soft_circle`; a VC
-- has `soft_circle` and no `term_sheet`. Each folds onto the other's.
), narrow(persona, canonical, target, note) AS (
  VALUES
    -- founder: queued contacted responded meeting diligence term_sheet committed passed
    ('founder','queued','queued',NULL),
    ('founder','contacted','contacted',NULL),
    ('founder','responded','responded',NULL),
    ('founder','meeting','meeting',NULL),
    ('founder','diligence','diligence',NULL),
    ('founder','term_sheet','term_sheet',NULL),
    ('founder','committed','committed',NULL),
    ('founder','passed','passed',NULL),
    ('founder','identified','queued','no founder column for identified'),
    ('founder','researched','queued','no founder column for researched'),
    ('founder','soft_circle','term_sheet','no founder column for soft_circle'),
    ('founder','wired','committed','wired folded into committed'),
    ('founder','declined','passed','declined folded into passed'),
    ('founder','lost','passed','lost folded into passed'),
    -- vc: queued contacted responded meeting diligence soft_circle committed declined
    ('vc','queued','queued',NULL),
    ('vc','contacted','contacted',NULL),
    ('vc','responded','responded',NULL),
    ('vc','meeting','meeting',NULL),
    ('vc','diligence','diligence',NULL),
    ('vc','soft_circle','soft_circle',NULL),
    ('vc','committed','committed',NULL),
    ('vc','declined','declined',NULL),
    ('vc','identified','queued','no vc column for identified'),
    ('vc','researched','queued','no vc column for researched'),
    ('vc','term_sheet','soft_circle','no vc column for term_sheet'),
    ('vc','wired','committed','wired folded into committed'),
    ('vc','passed','declined','passed folded into declined'),
    ('vc','lost','declined','lost folded into declined')
), classified AS (
  SELECT e.*,
         CASE WHEN o.kind = 'company' THEN 'founder' ELSE 'vc' END AS persona,
         c.canonical,
         -- Is this row a person or an organisation? investor_id and firm_id are both
         -- optional on a manual add, so decide on the evidence present and report
         -- every row that had to be decided this way.
         CASE
           WHEN e.investor_id IS NOT NULL THEN 'person'
           WHEN e.firm_id IS NOT NULL THEN 'company'
           WHEN NULLIF(btrim(COALESCE(e.display_title,'')),'') IS NOT NULL
             OR NULLIF(btrim(COALESCE(e.display_email,'')),'') IS NOT NULL
             OR NULLIF(btrim(COALESCE(e.display_linkedin,'')),'') IS NOT NULL THEN 'person'
           ELSE 'company'
         END AS kind
    FROM crm_entries e
    JOIN organizations o ON o.id = e.org_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(a.canonical, k.stage) AS canonical
        FROM (SELECT lower(btrim(COALESCE(e.stage,''))) AS v) s
        LEFT JOIN alias a ON a.raw = s.v
        LEFT JOIN canon k ON k.stage = s.v
       LIMIT 1
    ) c ON true
)
SELECT cl.id AS entry_id, cl.org_id, cl.user_id, cl.persona,
       cl.stage AS raw_stage, cl.canonical, n.target AS target_stage, n.note, cl.kind,
       (cl.investor_id IS NULL AND cl.firm_id IS NULL) AS ambiguous,
       cl.firm_id, cl.investor_id, cl.display_name, cl.display_title, cl.display_email,
       cl.display_linkedin, cl.display_location, cl.display_type, cl.display_score,
       cl.display_tier, cl.why_match, cl.notes, cl.owner, cl.board_id, cl.tags,
       cl.source, cl.source_session_id, cl.added_at, cl.last_contacted_at,
       cl.research_summary, cl.research_url, cl.research_at,
       -- Must match the generated identity columns character for character,
       -- whitespace collapsing included, or the joins attach nothing silently.
       CASE WHEN cl.firm_id IS NOT NULL THEN cl.firm_id
            WHEN cl.kind = 'company' THEN 'name:'||lower(btrim(regexp_replace(cl.display_name,'\s+',' ','g')))
       END AS company_identity,
       CASE WHEN cl.kind = 'person'
            THEN COALESCE(cl.investor_id, 'name:'||lower(btrim(regexp_replace(cl.display_name,'\s+',' ','g'))))
       END AS person_identity
  FROM classified cl
  LEFT JOIN narrow n ON n.persona = cl.persona AND n.canonical = cl.canonical;

-- ─── The split, for one persona ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_split(p_persona text) RETURNS TABLE (
  companies_added  integer,
  people_added     integer,
  deals_added      integer,
  activities_added integer,
  findings_added   integer
) LANGUAGE plpgsql AS $fn$
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
         -- An unmappable stage lands on the persona's entry stage and is reported;
         -- never dropped, never silently renamed.
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
END $fn$;

REVOKE ALL ON FUNCTION crm_split(text) FROM PUBLIC;

-- Run for both personas. Founder is already split, so it adds nothing; VC has no
-- rows in scope yet and also adds nothing. Both are recorded so a later adoption
-- only needs `SELECT crm_split('vc');`.
SELECT 'founder' AS persona, * FROM crm_split('founder');
SELECT 'vc' AS persona, * FROM crm_split('vc');
