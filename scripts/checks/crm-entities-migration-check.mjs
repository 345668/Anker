/**
 * Validate scripts/migrations/2026-09-25-crm-entities.sql against a throwaway
 * in-memory PGlite database. Never connects to Neon.
 *
 *   node scripts/checks/crm-entities-migration-check.mjs
 *
 * Creates the minimum prerequisite schema, seeds rows chosen for the awkward
 * cases, applies the migration, asserts the split, then applies it again to
 * prove idempotency. Exits non-zero on any failure.
 *
 * The fixtures are the point. Each one exists because it broke, or could break,
 * a version of the split:
 *   e1,e2  two contacts at one firm            → one company, two people, two deals
 *   e3     firm-level row, firm not in directory → company named from display_name
 *   e4     unmappable stage                    → lands at queued AND is reported
 *   e5     terminal synonym (closed_lost)      → folded onto passed AND reported
 *   e6     VC workspace                        → untouched
 *   e7     legacy row with NULL org_id         → untouched, NULL scope_key
 *   e8     PERSON whose firm is not in the directory → company must NOT take the
 *          person's name (this was a real bug)
 *   e9     no firm_id and no investor_id, has a title → classified person
 *   e10    no firm_id and no investor_id, no person signals → classified company
 */
import { PGlite } from "@electric-sql/pglite"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATION = process.argv[2]
  ?? path.join(HERE, "..", "migrations", "2026-09-25-crm-entities.sql")

const db = new PGlite()
let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`)
}
const rejects = async (q) => {
  try { await db.query(q); return "accepted" } catch { return "rejected" }
}

// ─── Prerequisite schema (only what the migration touches) ──────────────────
await db.exec(`
CREATE TABLE organizations (id text PRIMARY KEY, name text, kind text, archived_at timestamptz);
CREATE TABLE investment_firms (id text PRIMARY KEY, name text);
CREATE TABLE crm_boards (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text, org_id text REFERENCES organizations(id),
  name text NOT NULL, source_session_id text, position int,
  is_default boolean NOT NULL DEFAULT false, archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE crm_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text, org_id text REFERENCES organizations(id),
  source text, source_session_id text, import_key text, firm_id text, investor_id text,
  display_name text NOT NULL, display_title text, display_email text, display_linkedin text,
  display_location text, display_type text, display_score int, display_tier text, why_match text,
  stage text NOT NULL DEFAULT 'queued', notes text, owner text, board_id text,
  research_summary text, research_url text, research_at timestamptz,
  tags text[] NOT NULL DEFAULT '{}',
  added_at timestamptz DEFAULT now(), last_contacted_at timestamptz, updated_at timestamptz DEFAULT now());
CREATE TABLE crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text, org_id text REFERENCES organizations(id),
  crm_entry_id text REFERENCES crm_entries(id) ON DELETE CASCADE, title text NOT NULL,
  due_at timestamptz, done_at timestamptz, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE crm_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text, org_id text REFERENCES organizations(id),
  name text NOT NULL, filters jsonb NOT NULL DEFAULT '{}'::jsonb, position int,
  created_at timestamptz NOT NULL DEFAULT now());
`)

// ─── Fixtures ───────────────────────────────────────────────────────────────
await db.exec(`
INSERT INTO organizations (id,name,kind) VALUES
  ('org_f','Acme Inc','company'),
  ('org_v','Fund I','fund');
INSERT INTO investment_firms (id,name) VALUES ('firm_a','Alpha Capital');
INSERT INTO crm_boards (id,user_id,org_id,name) VALUES ('b1','u1','org_f','Seed');

INSERT INTO crm_entries
  (id,user_id,org_id,source,firm_id,investor_id,display_name,display_title,display_email,
   display_linkedin,display_location,display_type,display_score,display_tier,stage,notes,owner,
   board_id,tags,research_summary,research_at,added_at) VALUES
  ('e1','u1','org_f','founder_matching','firm_a','inv_1','Ada Partner','Partner','ada@alpha.test',
   NULL,'Berlin','vc',91,'A','in_diligence','likes us','u1','b1','{warm}','Summary A','2026-09-01','2026-08-01'),
  ('e2','u1','org_f','founder_matching','firm_a','inv_2','Bo Principal','Principal','bo@alpha.test',
   NULL,'Berlin','vc',77,'B','engaged',NULL,'u1','b1','{}',NULL,NULL,'2026-08-02'),
  ('e3','u1','org_f','manual','firm_ghost',NULL,'Ghost Ventures',NULL,NULL,
   NULL,'Paris','vc',60,'C','soft_circle',NULL,NULL,'b1','{}',NULL,NULL,'2026-08-03'),
  ('e4','u1','org_f','manual',NULL,'inv_4','Cy Angel','Angel','cy@x.test',
   NULL,'NYC','angel',55,'C','nurturing',NULL,NULL,NULL,'{}',NULL,NULL,'2026-08-04'),
  ('e5','u1','org_f','manual',NULL,'inv_5','Dee Seed',NULL,NULL,
   NULL,NULL,'angel',NULL,NULL,'closed_lost',NULL,NULL,NULL,'{}',NULL,NULL,'2026-08-05'),
  ('e6','u2','org_v','lp_matching','firm_a','inv_6','LP One',NULL,NULL,
   NULL,NULL,'lp',NULL,NULL,'contacted',NULL,NULL,NULL,'{}',NULL,NULL,'2026-08-06'),
  ('e7','u1',NULL,'manual',NULL,'inv_7','Legacy Person',NULL,NULL,
   NULL,NULL,NULL,NULL,NULL,'queued',NULL,NULL,NULL,'{}',NULL,NULL,'2026-08-07'),
  ('e8','u1','org_f','manual','firm_zz','inv_8','Eve Partner','Partner','eve@zz.test',
   NULL,'Lisbon','vc',70,'B','contacted',NULL,NULL,NULL,'{}',NULL,NULL,'2026-08-08'),
  ('e9','u1','org_f','manual',NULL,NULL,'Finn Freelance','Scout',NULL,
   NULL,NULL,NULL,NULL,NULL,'queued',NULL,NULL,NULL,'{}',NULL,NULL,'2026-08-09'),
  ('e10','u1','org_f','manual',NULL,NULL,'Gamma Partners',NULL,NULL,
   NULL,'Madrid','vc',NULL,NULL,'queued',NULL,NULL,NULL,'{}',NULL,NULL,'2026-08-10'),
  -- e11 shares e9's normalised name with no investor_id: the two MERGE onto one
  -- person with two deals. That is the loss the preflight is meant to catch
  -- before this ever runs, so both the warning and the merge are asserted.
  ('e11','u1','org_f','manual',NULL,NULL,'finn  freelance','Advisor',NULL,
   NULL,NULL,NULL,NULL,NULL,'queued',NULL,NULL,NULL,'{}',NULL,NULL,'2026-08-11'),
  -- VC workspace rows (phase 5). e20/e21 exercise the narrowing that differs from
  -- founder: a GP has soft_circle and no term_sheet, so term_sheet folds INTO
  -- soft_circle — the opposite direction from the founder pipeline. e22 proves VC
  -- keeps soft_circle where founder folds it away.
  ('e20','u2','org_v','lp_matching',NULL,'inv_20','Greta Allocator','CIO',NULL,
   NULL,'Zurich','lp',80,'A','term_sheet',NULL,NULL,NULL,'{}',NULL,NULL,'2026-08-20'),
  ('e21','u2','org_v','lp_matching',NULL,'inv_21','Hugo Endowment',NULL,NULL,
   NULL,NULL,'lp',NULL,NULL,'passed',NULL,NULL,NULL,'{}',NULL,NULL,'2026-08-21'),
  ('e22','u2','org_v','lp_matching',NULL,'inv_22','Ines Pension','Head of PE',NULL,
   NULL,'Madrid','lp',75,'B','soft_circle',NULL,NULL,NULL,'{}',NULL,NULL,'2026-08-22');
`)

// ─── Preflight (read-only, runs BEFORE the migration) ───────────────────────
{
  const preflight = await readFile(path.join(HERE, "crm-entities-preflight.sql"), "utf8")
  const rows = (await db.query(preflight)).rows.map(r => `${r.issue} | ${r.record_id}`)
  console.log("preflight")
  check("reports exactly the findings the fixtures contain", rows, [
    "ambiguous_entry_kind | org_f as company ×1",
    "ambiguous_entry_kind | org_f as person ×2",
    "firm_not_in_directory | firm_ghost",
    "firm_not_in_directory | firm_zz",
    "folded_stage | closed_lost ×1",
    "folded_stage | soft_circle ×1",
    "merges_two_people_into_one | org_f:finn freelance ×2",
    "unmappable_stage | nurturing ×1",
  ])
  console.log()
}

// ─── Apply ──────────────────────────────────────────────────────────────────
const sqlText = await readFile(MIGRATION, "utf8")
try { await db.exec(sqlText); console.log(`applied ${path.basename(MIGRATION)}\n`) }
catch (e) { console.error("MIGRATION FAILED:", e.message); process.exit(1) }

const one = async (q) => (await db.query(q)).rows[0]
const all = async (q) => (await db.query(q)).rows

// ─── scope_key ──────────────────────────────────────────────────────────────
console.log("scope_key")
check("generated from org_id", (await one(`SELECT scope_key FROM crm_entries WHERE id='e1'`)).scope_key, "org:org_f")
check("NULL for a legacy private record", (await one(`SELECT scope_key FROM crm_entries WHERE id='e7'`)).scope_key, null)
check("cannot be written by hand", await rejects(`UPDATE crm_entries SET scope_key='org:other' WHERE id='e1'`), "rejected")

// ─── Classification ─────────────────────────────────────────────────────────
console.log("\nclassification")
const kinds = Object.fromEntries((await all(
  `SELECT entry_id, kind FROM crm_founder_migration_plan ORDER BY 1`)).map(r => [r.entry_id, r.kind]))
check("investor_id ⇒ person", kinds.e1, "person")
check("firm_id only ⇒ company", kinds.e3, "company")
check("no ids but a title ⇒ person", kinds.e9, "person")
check("no ids and no person signals ⇒ company", kinds.e10, "company")

// ─── Companies ──────────────────────────────────────────────────────────────
console.log("\ncompanies")
check("one per firm; a shared firm is not duplicated",
  (await all(`SELECT name FROM crm_companies ORDER BY name`)).map(r => r.name),
  ["Alpha Capital", "Gamma Partners", "Ghost Ventures", "Unnamed firm"])
check("directory name wins", (await one(`SELECT name FROM crm_companies WHERE firm_id='firm_a'`)).name, "Alpha Capital")
check("firm-level row names its own company from display_name",
  (await one(`SELECT name FROM crm_companies WHERE firm_id='firm_ghost'`)).name, "Ghost Ventures")
// The bug this exists for: a person-level row whose firm is absent from the
// directory must not label the company after the person.
check("company is NOT named after the person when the firm is unresolved",
  (await one(`SELECT name FROM crm_companies WHERE firm_id='firm_zz'`)).name, "Unnamed firm")

// ─── People ─────────────────────────────────────────────────────────────────
console.log("\npeople")
check("one per contact", Number((await one(`SELECT count(*) n FROM crm_people`)).n), 6)
check("e9 and e11 merged onto one person, as the preflight warned",
  Number((await one(`SELECT count(*) n FROM crm_deals d JOIN crm_people p ON p.id=d.person_id WHERE p.name='Finn Freelance'`)).n), 2)
check("both contacts share the one company",
  Number((await one(`SELECT count(*) n FROM crm_people p JOIN crm_companies c ON c.id=p.company_id WHERE c.firm_id='firm_a'`)).n), 2)
check("the ambiguous person exists and has no company",
  (await one(`SELECT company_id FROM crm_people WHERE name='Finn Freelance'`)).company_id, null)
check("the ambiguous company was not made a person",
  Number((await one(`SELECT count(*) n FROM crm_people WHERE name='Gamma Partners'`)).n), 0)

// ─── Stage mapping ──────────────────────────────────────────────────────────
console.log("\ndeals — stage mapping")
const stages = Object.fromEntries((await all(
  `SELECT migrated_from_entry_id e, stage FROM crm_deals ORDER BY 1`)).map(r => [r.e, r.stage]))
check("in_diligence → diligence", stages.e1, "diligence")
check("engaged → responded", stages.e2, "responded")
check("soft_circle folded onto term_sheet", stages.e3, "term_sheet")
check("unmappable 'nurturing' → queued", stages.e4, "queued")
check("closed_lost → passed", stages.e5, "passed")
check("canonical value passes through", stages.e8, "contacted")

// ─── Isolation ──────────────────────────────────────────────────────────────
console.log("\nisolation")
check("VC workspace untouched", Number((await one(`SELECT count(*) n FROM crm_deals WHERE org_id='org_v'`)).n), 0)
check("legacy NULL-org row untouched", Number((await one(`SELECT count(*) n FROM crm_deals WHERE migrated_from_entry_id='e7'`)).n), 0)
check("one deal per founder entry", Number((await one(`SELECT count(*) n FROM crm_deals`)).n), 9)

// ─── Activities ─────────────────────────────────────────────────────────────
console.log("\nactivities")
check("research summary became a note", (await one(`SELECT body FROM crm_activities WHERE kind='note'`)).body, "Summary A")
check("occurred_at is when it happened, not when logged",
  (await one(`SELECT occurred_at::date::text d FROM crm_activities`)).d, "2026-09-01")
check("append-only: UPDATE rejected", await rejects(`UPDATE crm_activities SET body='edited'`), "rejected")
check("append-only: DELETE rejected", await rejects(`DELETE FROM crm_activities`), "rejected")

// ─── Cross-tenant integrity ─────────────────────────────────────────────────
console.log("\ncross-tenant integrity")
const someCompany = (await one(`SELECT id FROM crm_companies LIMIT 1`)).id
check("a deal cannot reference another workspace's company",
  await rejects(`INSERT INTO crm_deals (org_id,company_id,stage) VALUES ('org_v','${someCompany}','queued')`), "rejected")
check("a person cannot reference another workspace's company",
  await rejects(`INSERT INTO crm_people (org_id,company_id,name) VALUES ('org_v','${someCompany}','X')`), "rejected")

// ─── Report ─────────────────────────────────────────────────────────────────
console.log("\nmigration report")
check("every judgment recorded", (await all(
  `SELECT finding, count(*)::int n FROM crm_migration_report GROUP BY 1 ORDER BY 1`)).map(r => `${r.finding}=${r.n}`),
  [
    "ambiguous_entry_kind=3",    // e9, e10, e11
    "company_name_unresolved=1", // e8's firm_zz
    "folded_stage=2",            // e3 soft_circle, e5 closed_lost→declined→passed
    "person_without_company=4",  // e4, e5, e9, e11
    "unmappable_stage=1",        // e4 'nurturing'
  ])
check("the unmappable finding names the offending value",
  /nurturing/.test((await one(`SELECT detail FROM crm_migration_report WHERE finding='unmappable_stage'`)).detail), true)

// ─── Idempotency ────────────────────────────────────────────────────────────
console.log("\nre-run")
await db.exec(sqlText)
for (const [t, n] of [["crm_deals", 9], ["crm_companies", 4], ["crm_people", 6], ["crm_activities", 1], ["crm_migration_report", 11]]) {
  check(`${t} not duplicated`, Number((await one(`SELECT count(*) n FROM ${t}`)).n), n)
}

// ─── crm_founder_split(): the split as a re-callable function ───────────────
// 2026-09-25-crm-entities-split.sql lifts the split into a function so a later
// adoption can re-run it without re-running a recorded migration. It must produce
// exactly what the original INSERTs produced, or the two diverge silently.
{
  console.log("\ncrm_founder_split()")
  const splitFile = path.join(HERE, "..", "migrations", "2026-09-25-crm-entities-split.sql")
  let splitSql
  try { splitSql = await readFile(splitFile, "utf8") } catch { splitSql = null }

  if (!splitSql) {
    console.log("  skip  2026-09-25-crm-entities-split.sql not present")
  } else {
    await db.exec(splitSql)
    const before = {}
    for (const t of ["crm_companies", "crm_people", "crm_deals", "crm_activities", "crm_migration_report"]) {
      before[t] = Number((await one(`SELECT count(*) n FROM ${t}`)).n)
    }
    check("calling it on an already-split database adds nothing",
      before, { crm_companies: 4, crm_people: 6, crm_deals: 9, crm_activities: 1, crm_migration_report: 11 })

    // Rebuild from scratch: clear the derived tables and let the function alone
    // repopulate them. TRUNCATE does not fire the append-only row trigger.
    await db.exec(`TRUNCATE crm_migration_report, crm_activities, crm_deals, crm_people, crm_companies;`)
    const r = (await db.query(`SELECT * FROM crm_founder_split()`)).rows[0]
    check("rebuilds the same row counts from empty",
      [Number(r.companies_added), Number(r.people_added), Number(r.deals_added), Number(r.activities_added)],
      [4, 6, 9, 1])
    check("and records the same findings", Number(r.findings_added), 11)
    check("stage mapping survives the rebuild",
      (await one(`SELECT stage FROM crm_deals WHERE migrated_from_entry_id='e1'`)).stage, "diligence")
    check("the person-named-company bug stays fixed after rebuild",
      (await one(`SELECT name FROM crm_companies WHERE firm_id='firm_zz'`)).name, "Unnamed firm")
    check("VC rows are still untouched — the founder split must not reach them",
      Number((await one(`SELECT count(*) n FROM crm_deals WHERE org_id='org_v'`)).n), 0)
  }
}

// ─── crm_split(persona): phase 5 generalises it to VC ──────────────────────
// The narrowing differs per persona in BOTH directions: a founder folds
// soft_circle into term_sheet, a GP folds term_sheet into soft_circle. Getting
// that backwards would be invisible in a founder-only test.
{
  console.log("\ncrm_split(persona)")
  const genFile = path.join(HERE, "..", "migrations", "2026-09-25-crm-split-personas.sql")
  let genSql
  try { genSql = await readFile(genFile, "utf8") } catch { genSql = null }

  if (!genSql) {
    console.log("  skip  2026-09-25-crm-split-personas.sql not present")
  } else {
    await db.exec(genSql)

    check("the founder-specific view and function are gone",
      [
        Number((await one(`SELECT count(*) n FROM information_schema.views WHERE table_name='crm_founder_migration_plan'`)).n),
        Number((await one(`SELECT count(*) n FROM information_schema.routines WHERE routine_name='crm_founder_split'`)).n),
      ], [0, 0])

    check("the plan now classifies both personas",
      (await all(`SELECT persona, count(*)::int n FROM crm_migration_plan GROUP BY 1 ORDER BY 1`))
        .map(r => `${r.persona}=${r.n}`),
      ["founder=9", "vc=4"])

    const vcStages = Object.fromEntries((await all(
      `SELECT d.migrated_from_entry_id e, d.stage FROM crm_deals d WHERE d.org_id='org_v' ORDER BY 1`))
      .map(r => [r.e, r.stage]))
    check("VC: canonical value passes through", vcStages.e6, "contacted")
    check("VC: term_sheet folds INTO soft_circle (founder folds the other way)", vcStages.e20, "soft_circle")
    check("VC: passed folds into declined", vcStages.e21, "declined")
    check("VC: soft_circle is kept, not folded", vcStages.e22, "soft_circle")
    check("founder still folds soft_circle INTO term_sheet",
      (await one(`SELECT stage FROM crm_deals WHERE migrated_from_entry_id='e3'`)).stage, "term_sheet")

    check("VC deals created", Number((await one(`SELECT count(*) n FROM crm_deals WHERE org_id='org_v'`)).n), 4)
    check("founder deals unchanged", Number((await one(`SELECT count(*) n FROM crm_deals WHERE org_id='org_f'`)).n), 9)

    // The same directory firm in two workspaces must become two companies, one per
    // workspace — identity is unique per (org_id, identity), not globally.
    check("a shared directory firm yields one company PER workspace",
      (await all(`SELECT org_id, count(*)::int n FROM crm_companies WHERE firm_id='firm_a' GROUP BY 1 ORDER BY 1`))
        .map(r => `${r.org_id}=${r.n}`),
      ["org_f=1", "org_v=1"])

    check("no VC person is attached to a founder workspace company",
      Number((await one(`
        SELECT count(*) n FROM crm_people p JOIN crm_companies c ON c.id=p.company_id
         WHERE p.org_id <> c.org_id`)).n), 0)

    check("VC findings recorded under their own migration label",
      (await all(`SELECT finding, count(*)::int n FROM crm_migration_report
                   WHERE migration='crm_split:vc' GROUP BY 1 ORDER BY 1`))
        .map(r => `${r.finding}=${r.n}`),
      ["folded_stage=2", "person_without_company=3"])

    check("crm_split refuses a persona with no workspace model", await (async () => {
      try { await db.query(`SELECT * FROM crm_split('lp')`); return "accepted" } catch { return "rejected" }
    })(), "rejected")

    // Re-running both personas must add nothing.
    await db.query(`SELECT * FROM crm_split('founder')`)
    const again = (await db.query(`SELECT * FROM crm_split('vc')`)).rows[0]
    check("re-running adds nothing",
      [Number(again.companies_added), Number(again.people_added), Number(again.deals_added), Number(again.findings_added)],
      [0, 0, 0, 0])
    check("totals stable after re-run",
      [
        Number((await one(`SELECT count(*) n FROM crm_deals`)).n),
        Number((await one(`SELECT count(*) n FROM crm_people`)).n),
        Number((await one(`SELECT count(*) n FROM crm_companies`)).n),
      ], [13, 10, 5])
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall checks passed")
process.exit(failures ? 1 : 0)
