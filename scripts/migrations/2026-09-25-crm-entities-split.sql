-- The founder split, as a callable function.
-- Doc: docs/architecture/25-per-persona-crm.md §6.1-6.2
--
-- 2026-09-25-crm-entities.sql created the schema and ran the split, but at that
-- point every crm_entries row had a NULL org_id, so the split matched nothing.
-- Adoption (scripts/oneshot/adopt-legacy-crm-contacts.mjs) then gave 627 rows a
-- workspace, and they need the split run again.
--
-- Re-running the recorded migration file is not how the ledger works, and copying
-- its INSERTs into a second file would leave two copies of the same logic to drift.
-- So the split becomes a function here: this migration defines it and calls it
-- once, and any future adoption is `SELECT crm_founder_split();` with no new SQL.
--
-- Idempotent, for the same reasons the original was: companies and people key on
-- their generated identity, deals on migrated_from_entry_id, activities and report
-- rows on NOT EXISTS.
--
-- Reads crm_founder_migration_plan, created by the earlier migration.

CREATE OR REPLACE FUNCTION crm_founder_split() RETURNS TABLE (
  companies_added  integer,
  people_added     integer,
  deals_added      integer,
  activities_added integer,
  findings_added   integer
) LANGUAGE plpgsql AS $fn$
DECLARE c integer; p integer; d integer; a integer; f integer; t integer;
BEGIN
  -- 1. Companies, one per firm within a workspace. A person-level row whose firm
  --    is absent from the directory keeps firm_id but cannot be named from
  --    display_name — that is the person's name.
  INSERT INTO crm_companies (org_id, firm_id, name, location, kind, created_by)
  SELECT DISTINCT ON (pl.org_id, pl.company_identity)
         pl.org_id,
         pl.firm_id,
         COALESCE(NULLIF(btrim(fm.name),''),
                  CASE WHEN pl.kind = 'company' THEN NULLIF(btrim(pl.display_name),'') END,
                  'Unnamed firm'),
         CASE WHEN pl.kind = 'company' THEN pl.display_location END,
         CASE WHEN pl.kind = 'company' THEN pl.display_type END,
         pl.user_id
    FROM crm_founder_migration_plan pl
    LEFT JOIN investment_firms fm ON fm.id = pl.firm_id
   WHERE pl.company_identity IS NOT NULL
   ORDER BY pl.org_id, pl.company_identity, pl.added_at
      ON CONFLICT (org_id, identity) DO NOTHING;
  GET DIAGNOSTICS c = ROW_COUNT;

  -- 2. People, attached to their firm's company when there is one.
  INSERT INTO crm_people (org_id, company_id, investor_id, name, title, email, linkedin, location, created_by)
  SELECT DISTINCT ON (pl.org_id, pl.person_identity)
         pl.org_id,
         cc.id,
         pl.investor_id,
         COALESCE(NULLIF(btrim(pl.display_name),''), 'Unnamed contact'),
         pl.display_title,
         pl.display_email,
         pl.display_linkedin,
         pl.display_location,
         pl.user_id
    FROM crm_founder_migration_plan pl
    LEFT JOIN crm_companies cc ON cc.org_id = pl.org_id AND cc.identity = pl.company_identity
   WHERE pl.person_identity IS NOT NULL
   ORDER BY pl.org_id, pl.person_identity, pl.added_at
      ON CONFLICT (org_id, identity) DO NOTHING;
  GET DIAGNOSTICS p = ROW_COUNT;

  -- 3. Deals, one per entry, so nothing is merged and nothing is lost.
  INSERT INTO crm_deals (
    org_id, company_id, person_id, board_id, stage, score, tier, why_match,
    notes, owner, tags, source, source_session_id, migrated_from_entry_id,
    added_at, last_contacted_at, created_by
  )
  SELECT pl.org_id, cc.id, cp.id, pl.board_id,
         COALESCE(pl.founder_stage, 'queued'),
         pl.display_score, pl.display_tier, pl.why_match,
         pl.notes, pl.owner, COALESCE(pl.tags, '{}'),
         pl.source, pl.source_session_id, pl.entry_id,
         COALESCE(pl.added_at, now()), pl.last_contacted_at, pl.user_id
    FROM crm_founder_migration_plan pl
    LEFT JOIN crm_companies cc ON cc.org_id = pl.org_id AND cc.identity = pl.company_identity
    LEFT JOIN crm_people    cp ON cp.org_id = pl.org_id AND cp.identity = pl.person_identity
      ON CONFLICT (migrated_from_entry_id) WHERE migrated_from_entry_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS d = ROW_COUNT;

  -- 4. The research cache becomes the first activity.
  INSERT INTO crm_activities (org_id, kind, subject_type, subject_id, subject, body, metadata, occurred_at, created_by)
  SELECT dl.org_id, 'note', 'deal', dl.id, 'Research summary', pl.research_summary,
         jsonb_build_object('migrated', true, 'url', pl.research_url),
         COALESCE(pl.research_at, pl.added_at, now()), pl.user_id
    FROM crm_founder_migration_plan pl
    JOIN crm_deals dl ON dl.migrated_from_entry_id = pl.entry_id
   WHERE NULLIF(btrim(COALESCE(pl.research_summary,'')),'') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM crm_activities av
        WHERE av.subject_type='deal' AND av.subject_id=dl.id AND av.metadata->>'migrated'='true');
  GET DIAGNOSTICS a = ROW_COUNT;

  -- 5. Findings. Every judgment the split made, recorded rather than applied
  --    silently (doc 25 §6 rule 1).
  f := 0;

  INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
  SELECT '2026-09-25-crm-entities', pl.org_id, pl.entry_id, 'unmappable_stage',
         format('stage %L is not canonical and has no alias; deal created at queued', pl.raw_stage)
    FROM crm_founder_migration_plan pl
   WHERE pl.canonical IS NULL
     AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                      WHERE r.entry_id = pl.entry_id AND r.finding = 'unmappable_stage');
  GET DIAGNOSTICS t = ROW_COUNT; f := f + t;

  INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
  SELECT '2026-09-25-crm-entities', pl.org_id, pl.entry_id, 'folded_stage',
         format('%L → %L: %s', pl.raw_stage, pl.founder_stage, pl.note)
    FROM crm_founder_migration_plan pl
   WHERE pl.note IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                      WHERE r.entry_id = pl.entry_id AND r.finding = 'folded_stage');
  GET DIAGNOSTICS t = ROW_COUNT; f := f + t;

  INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
  SELECT '2026-09-25-crm-entities', pl.org_id, pl.entry_id, 'ambiguous_entry_kind',
         format('no firm_id or investor_id; classified as %s from display fields', pl.kind)
    FROM crm_founder_migration_plan pl
   WHERE pl.ambiguous
     AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                      WHERE r.entry_id = pl.entry_id AND r.finding = 'ambiguous_entry_kind');
  GET DIAGNOSTICS t = ROW_COUNT; f := f + t;

  INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
  SELECT '2026-09-25-crm-entities', pl.org_id, pl.entry_id, 'company_name_unresolved',
         format('firm_id %L is not in investment_firms; company left as Unnamed firm', pl.firm_id)
    FROM crm_founder_migration_plan pl
    JOIN crm_companies cc ON cc.org_id = pl.org_id AND cc.identity = pl.company_identity
   WHERE pl.firm_id IS NOT NULL AND cc.name = 'Unnamed firm'
     AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                      WHERE r.entry_id = pl.entry_id AND r.finding = 'company_name_unresolved');
  GET DIAGNOSTICS t = ROW_COUNT; f := f + t;

  INSERT INTO crm_migration_report (migration, org_id, entry_id, finding, detail)
  SELECT '2026-09-25-crm-entities', dl.org_id, dl.migrated_from_entry_id, 'person_without_company',
         format('contact %L migrated with no company', pe.name)
    FROM crm_deals dl
    JOIN crm_people pe ON pe.id = dl.person_id
   WHERE dl.company_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM crm_migration_report r
                      WHERE r.entry_id = dl.migrated_from_entry_id AND r.finding = 'person_without_company');
  GET DIAGNOSTICS t = ROW_COUNT; f := f + t;

  RETURN QUERY SELECT c, p, d, a, f;
END $fn$;

REVOKE ALL ON FUNCTION crm_founder_split() FROM PUBLIC;

SELECT * FROM crm_founder_split();
