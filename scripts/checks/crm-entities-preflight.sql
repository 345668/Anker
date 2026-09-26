-- Read-only preflight. Run before scripts/migrations/2026-09-25-crm-entities.sql.
-- Doc: docs/architecture/25-per-persona-crm.md §6 rule 3 — measure before running.
-- Requires the prior CRM and 2026-09-13 workspace migrations.
--
-- Founder workspaces only, matching the migration's own scope. Every returned row
-- needs a decision before release. Unlike most preflights, rows here are EXPECTED:
-- crm_entries.stage has been free text since May with three disagreeing writers,
-- and firm_id / investor_id are both optional on a manual add. The point is to see
-- the shape and the counts before the split runs, not to reach zero.
--
-- The two issues that merge data, and so matter most:
--   merges_two_people_into_one   — distinct contacts collapsing onto one record
--   duplicate_company_by_name    — one firm arriving as two companies
-- Everything else is recorded by the migration itself in crm_migration_report.
WITH founder AS (
  SELECT e.* FROM crm_entries e
  JOIN organizations o ON o.id=e.org_id AND o.kind='company'
), canon(stage) AS (
  VALUES ('queued'),('identified'),('researched'),('contacted'),('responded'),('meeting'),
         ('diligence'),('soft_circle'),('term_sheet'),('committed'),('wired'),
         ('passed'),('declined'),('lost')
), alias(raw) AS (
  VALUES ('in_diligence'),('due_diligence'),('replied'),('engaged'),('rejected'),
         ('closed'),('closed_won'),('closed_lost'),('prospect')
), no_founder_column(stage) AS (
  VALUES ('identified'),('researched'),('soft_circle'),('wired'),('declined'),('lost')
), classified AS (
  SELECT f.*,
         lower(btrim(coalesce(f.stage,''))) AS norm_stage,
         CASE
           WHEN f.investor_id IS NOT NULL THEN 'person'
           WHEN f.firm_id IS NOT NULL THEN 'company'
           WHEN nullif(btrim(coalesce(f.display_title,'')),'') IS NOT NULL
             OR nullif(btrim(coalesce(f.display_email,'')),'') IS NOT NULL
             OR nullif(btrim(coalesce(f.display_linkedin,'')),'') IS NOT NULL THEN 'person'
           ELSE 'company'
         END AS kind
  FROM founder f
), issues AS (
  -- Stage values with no canonical key and no alias. Every such row is created at
  -- the founder entry stage, so read these before deciding that is acceptable.
  SELECT 'unmappable_stage' AS issue,
         c.norm_stage || ' ×' || count(*)::text AS record_id
  FROM classified c
  WHERE c.norm_stage NOT IN (SELECT stage FROM canon)
    AND c.norm_stage NOT IN (SELECT raw FROM alias)
  GROUP BY c.norm_stage

  UNION ALL
  -- Stages that resolve but have no founder column, so they fold. Expected; the
  -- count tells you how much of the pipeline is about to lose resolution.
  SELECT 'folded_stage', c.norm_stage || ' ×' || count(*)::text
  FROM classified c
  WHERE c.norm_stage IN (SELECT stage FROM no_founder_column)
     OR c.norm_stage IN ('rejected','closed_lost','wired','closed_won')
  GROUP BY c.norm_stage

  UNION ALL
  -- Rows carrying neither id, where person-or-company is inferred from the
  -- display fields. A large count means manual adds are not recording ids — fix
  -- app/api/crm/entries/route.ts rather than accepting the inference.
  SELECT 'ambiguous_entry_kind', c.org_id || ' as ' || c.kind || ' ×' || count(*)::text
  FROM classified c
  WHERE c.investor_id IS NULL AND c.firm_id IS NULL
  GROUP BY c.org_id, c.kind

  UNION ALL
  -- Referenced firms absent from the directory. Their company keeps firm_id but
  -- cannot be named, so it lands as 'Unnamed firm' pending a re-sync.
  SELECT 'firm_not_in_directory', c.firm_id
  FROM classified c
  LEFT JOIN investment_firms f ON f.id=c.firm_id
  WHERE c.firm_id IS NOT NULL AND f.id IS NULL
  GROUP BY c.firm_id

  UNION ALL
  -- MERGE RISK. Two or more person rows with no investor_id sharing a normalised
  -- name become ONE crm_people row with several deals attached. If they are
  -- genuinely different people, give one of them an investor_id, or rename, before
  -- migrating — after the split they are indistinguishable.
  SELECT 'merges_two_people_into_one',
         c.org_id || ':' || lower(btrim(regexp_replace(c.display_name,'\s+',' ','g'))) || ' ×' || count(*)::text
  FROM classified c
  WHERE c.kind='person' AND c.investor_id IS NULL
  GROUP BY c.org_id, lower(btrim(regexp_replace(c.display_name,'\s+',' ','g')))
  HAVING count(*) > 1

  UNION ALL
  -- MERGE RISK, mirror case. Two company rows with no firm_id sharing a name
  -- become one company.
  SELECT 'merges_two_companies_into_one',
         c.org_id || ':' || lower(btrim(regexp_replace(c.display_name,'\s+',' ','g'))) || ' ×' || count(*)::text
  FROM classified c
  WHERE c.kind='company' AND c.firm_id IS NULL
  GROUP BY c.org_id, lower(btrim(regexp_replace(c.display_name,'\s+',' ','g')))
  HAVING count(*) > 1

  UNION ALL
  -- The opposite failure: the same firm arriving both with and without a firm_id
  -- produces TWO companies with the same name, because identity is keyed on
  -- firm_id when present and on the name when not. Dedupe by setting firm_id on
  -- the name-only rows first.
  SELECT 'duplicate_company_by_name', c.org_id || ':' || lower(btrim(regexp_replace(c.display_name,'\s+',' ','g')))
  FROM classified c
  WHERE c.kind='company'
  GROUP BY c.org_id, lower(btrim(regexp_replace(c.display_name,'\s+',' ','g')))
  HAVING count(DISTINCT coalesce(c.firm_id,'∅')) > 1

  UNION ALL
  -- A board referenced by an entry in a different workspace would be rejected by
  -- the new deal trigger. Should be empty — the 2026-09-13 trigger already
  -- prevents it — so a row here means that trigger was bypassed.
  SELECT 'entry_board_workspace_mismatch', e.id
  FROM founder e JOIN crm_boards b ON b.id=e.board_id
  WHERE e.org_id IS DISTINCT FROM b.org_id

  UNION ALL
  -- Rows with a blank display_name become 'Unnamed firm' / 'Unnamed contact' and
  -- all collapse onto one identity per workspace. Name them first.
  SELECT 'blank_display_name', c.org_id || ':' || c.id
  FROM classified c
  WHERE nullif(btrim(coalesce(c.display_name,'')),'') IS NULL
)
SELECT issue, record_id FROM issues ORDER BY issue, record_id;
