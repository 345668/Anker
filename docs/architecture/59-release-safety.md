# 59. Spec: release safety (migrations you can trust, a restore you have tried, a scale budget, a smoke test)

Status: **spec. Nothing is built.** Implements doc 37 gap G17 (testing stops at the library boundary; migration ledger drifts; no restore drill) and G9 (no scale or time budget in CI), sections 10.1 to 10.3 of that document. Builds on 56 (alerts), which can carry every check below. Raised on 2026-10-16 as the next engineering item after metering (58): the platform now has 2,000 tests, but nothing yet proves that what is deployed matches the database it runs on, or that the database can be brought back.

## 1. What is true today (measured 2026-10-16)
- **The ledger is not the truth.** `scripts/migrations` has 155 files; `schema_migrations` has 138 rows; **17 files are not recorded** (every migration from `2026-10-03-ops-telemetry` to `2026-10-10b-activation-view`: tenant control, action proposals, agent runtime, send authorizations, the media studio). Their features run in production, so the objects exist: the ledger is simply wrong. The September finding was the same shape (7 "pending" migrations, one genuinely missing, and that one broke every Anker AI conversation for weeks because nobody could tell a real gap from a false alarm).
- **Code can ship before its migration.** Deploys are automatic on push to `main`; migrations are run by hand. Two migrations this week (`2026-10-16m` to `q`) were applied before the push on purpose; nothing enforces that order.
- **No migration chain builds a database.** The first migrations assume tables that predate them (`scripts/001_tesseract_schema.sql`, `012`, `013`, loose files). The tests build only the slice of schema each needs. So "do all migrations apply cleanly, twice, in order" has never been asked.
- **`pnpm migrate` writes to production** (it targets the Neon URL) with no confirmation.
- **CI** runs typecheck, a redaction scan, the unit and PGlite tests, and a build. It runs no scale test, no post-deploy check and no schema check.
- **Backups:** nothing in the repository describes a restore. Neon keeps history for a window that depends on the plan; **that window has not been checked and no restore has ever been tried.** RPO and RTO are undefined.
- **Scale:** the directory has about 21,000 firms and 50,000 people. One all-pairs comparison already hung matching once (the 504 class). The only guard is a hand-made test at a smaller size.

## 2. Principles
1. **The ledger is a derived fact, not a belief.** It is checked against the database, not trusted.
2. **A migration is additive unless it says otherwise,** and says what restore point protects it.
3. **Production is touched on purpose.** The default run is a dry run; production needs an explicit flag and shows the host.
4. **A backup that was never restored is a hope.** The drill is scheduled and its date is visible.
5. **Slow checks run nightly, not on every push,** so they are kept.
6. **Every check ends in the alert engine** (doc 56), so a red result reaches a person.

## 3. R1: the ledger tells the truth (about 1 day)
- `pnpm migrate:verify` (read-only). For each migration file, read the objects it creates (tables, columns, indexes, constraints, functions, views, seeded rows keyed by primary key) and probe the database for each. Result per file: **applied** (every object present), **partial** (some missing: the dangerous case), **absent**, or **unknown** (changes only data or objects the parser does not understand: listed for a person). It prints a table and exits non-zero on any partial.
- `pnpm migrate:verify --record` writes ledger rows for files that are **applied**, with a note `reconciled by probe`. It never records partial, absent or unknown. The 17 current files are the first run.
- **Guardrails on the runner:** default is `--dry-run` showing the host name and the statements; production needs `--yes-production`; a file containing `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` or a `DELETE` without `WHERE` is refused unless its first line is `-- destructive: <restore point or reason>`.
- A CI test fails any new migration that breaks the additive rule or lacks the header, and any file not idempotent when applied twice to the slice of schema it needs (the pattern the fixtures already follow).
- Acceptance: `migrate:verify` on production reports no partial; ledger rows equal files; the test list of destructive statements is empty without a header.

## 4. R2: a schema baseline, so a database can be built from nothing (about 2 days)
- Generate `db/baseline/<date>.sql` from production **schema only** (tables, columns, types, defaults, constraints, indexes, extensions, views, functions; no rows, no secrets), using the existing introspection script as a starting point and a diff to prove it.
- Migrations dated after the baseline are applied on top. Older migrations are kept for history but are not part of the chain.
- A CI job (nightly and on any change under `scripts/migrations` or `db`) builds an ephemeral Postgres (the PGlite the tests already use, with `pgvector` if it can be loaded; a service container otherwise) from the baseline plus the newer migrations, applies them a second time, then **compares the resulting schema with the last recorded production schema** (a committed, regenerated snapshot like `keyed-tables.snapshot.json`). A difference fails the job and says which table or column.
- Acceptance: the diff between a database built from scratch and production is empty or lists only known, commented exceptions.

## 5. R3: deploy order is checked (about 1 day)
- A build-time constant `EXPECTED_SCHEMA` is the newest migration file name the code needs. `GET /api/health` (new, unauthenticated, no data) answers `{ ok, schemaBehind: [files not applied] }` by comparing that constant with the (now trustworthy) ledger, plus a database ping.
- Alert rule `schema_behind` (severity 1: it means features are broken now): any file the deployed code expects that the ledger lacks, for two checks in a row. Runbook: apply the named file, then re-check.
- The GitHub workflow that follows a deploy (below) fails on `schemaBehind`.

## 6. R4: a restore you have tried (about 1 day to build, then yours to run)
- **Set the objectives in writing:** RPO equals the Neon history window of the production plan (to be read from the Neon console and written here); RTO target 2 hours to a working read-only app on a restored branch.
- **Runbook** (`docs/runbooks/restore.md`): create a Neon branch from a point in time; check row counts of the 20 most important tables against production; point a preview deployment at the branch and sign in; what to do to cut production over, and who decides.
- **Drill script** `scripts/restore-drill.mjs`: creates a branch at "one hour ago" through the Neon API, compares counts within a stated tolerance (rows written in the last hour excepted), runs three read-only queries, writes the outcome to a `restore_drills` table (date, branch age, counts, pass or fail, time taken) and deletes the branch. It needs a Neon API key and the project id: **the founder provides these; they are never entered or stored by Claude.**
- **Visibility:** SAIL shows the date of the last drill and its result; alert rule `restore_drill_overdue` (severity 3, 100 days). Quarterly cadence, run by the founder with Claude on hand.
- Acceptance: one drill has passed, with the measured time written into the runbook as the real RTO.

## 7. R5: a scale and time budget (about 2 days)
- A generator builds a fixture at **production size** (21,000 firms, 50,000 people, realistic name collisions) in the in-process database.
- Budgeted tests, each with a time limit that fails the build: directory search, matching dedup, identity detection (doc 55), the person registry lookup (doc 54), tenant export of a large workspace, the alert evaluation, `usageThisMonth` with a year of calls. The limits start at 2x today's measured time.
- Runs **nightly** in CI and on demand, not per push. A failure opens an issue and raises an alert.
- Acceptance: the first all-pairs style regression added on purpose is caught.

## 8. R6: a smoke test after every deploy (about 1 day)
- A GitHub workflow runs on `deployment_status` success: `/api/health`, the sign-in page returns 200, the public pages render, and one read-only authenticated route using a dedicated smoke service token (read-only, no data, rotated; created by the founder in SAIL). A failure raises an incident and posts to Telegram through the ops bot.
- Not included: browser journeys (later; they need a stable test workspace and are the most expensive to keep).

## 9. SLOs (to write down, not to build)
Availability of the app and the public intake form, latency of chat first token and of directory search, freshness of the cron jobs (already measured in `cron_runs`). Targets are proposed in section 12 and measured by data the platform already collects; no new tooling.

## 10. Tests
Ledger verification: applied, partial, absent and unknown cases on fixture schemas; `--record` never records partial. Runner: dry run is the default; production flag required; destructive header enforced. Baseline: build-from-scratch equals the snapshot; a deliberate drift is reported. Health: behind and not behind. Restore drill: counts within and outside tolerance, branch always deleted even on failure. Budget tests: a deliberate slow path fails.

## 11. Slices and order
R1 first (it removes the false alarms and makes R3 possible), then R3 (it prevents the breakage class), then R2, R5, R6, and R4 when the founder has the Neon credentials to hand. Roughly 8 working days in all; R1 and R3 are the ones that change daily life.

## 12. Decisions for the founder (defaults chosen; change any)
1. **Dry run by default for `pnpm migrate`** (default yes).
2. **Baseline date = the day R2 is built;** older migrations stay as history (default yes).
3. **`/api/health` is public and reveals only ok and the count of missing migrations, not their names** (default; the names go to the alert).
4. **Drill cadence quarterly, RTO target 2 hours** (defaults; the real figure replaces the target after the first drill).
5. **Nightly budget tests, not per push.**
6. **Neon API key and smoke token: you create and enter them yourself** where the scripts read them.

## 13. Not in scope
Moving off the shared Neon database; point-in-time recovery of Supabase auth data (a separate provider, to be read from its own plan); end-to-end browser journeys; a customer-facing status page (doc 38).

## 14. Build status, R1 and R3 (2026-10-16)
Built and tested (2,000+ tests green). Run against production the same day.
- **R1.** `pnpm migrate:verify` (read-only; `--record` records only files whose objects are all present) reads each file with a purpose-built reader (`scripts/lib/migration-sql.mjs`: tables with their columns, added columns, indexes, functions, views, constraints, extensions; objects a later file drops or renames are not expected) and compares with the database in six catalog queries. **First run: all 17 unrecorded files were fully applied and are now recorded; the ledger has 155 rows for 155 files.**
- **What the first run found, which the ledger had hidden:** six older files recorded as applied whose objects differ from production (listed with a reason in `scripts/migrations-known-drift.json`): `deals` and `lp_match_audit` have a different shape than their files describe, `investment_firms` columns were named differently, `news_articles` and `investment_firms` lack some indexes, `fund_profiles` lacks eight columns the 2026-09-11 file adds, and the `agent_runs_latest` view does not exist. I found no code that reads any of the missing objects; none was changed. Three files create nothing the reader understands (data only) and are listed as unknown. A new partial file that is not on the known list makes the command exit 1. The baseline (R2) retires the list.
- **Runner guardrails.** `pnpm migrate` is now a dry run that shows the database host; `pnpm migrate:apply` or `--yes-production` applies; `--backfill` is a dry run unless `--yes-production`; a file with `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` or a `DELETE` with no `WHERE` is refused unless its first line is `-- destructive: <restore point or reason>` (a test enforces this on every file, and none currently needs it). The dry run of `--all` before the ledger was fixed would have shown the 17 files as pending: exactly the mistake the old runner invited.
- **R3.** `lib/migrations/manifest.json` lists the migration files the build expects (`pnpm migrate:manifest` regenerates it; a test fails if it differs from the folder). `GET /api/health` answers `{ ok, db, schemaBehind: <count> }` (503 if the database does not answer), never names or data. Alert rule `schema_behind` lists the missing files with a runbook.
- **Deviation:** `schema_behind` is **severity 2, not 1**. The alert engine opens severity 1 on the first sighting, and a deploy that precedes its migration by a few minutes is normal; severity 2 opens after two sightings, which is the "two checks in a row" the spec wanted.
- **Adding a migration now means:** write the file, run `pnpm migrate:manifest`, apply it with `--yes-production` (or `pnpm migrate:apply`), then push.
- Not yet: R2 (baseline and from-scratch build), R4 (restore drill), R5 (scale budget), R6 (post-deploy smoke, which will read `/api/health`).

## 15. Build status, R6 (2026-10-17)
Built and tested (2,010 tests green); migration `2026-10-17-smoke-runs.sql` applied.
- **Workflow** `.github/workflows/post-deploy-smoke.yml`: runs when Vercel reports a successful **Production** deployment (and by hand from the Actions tab), and runs `scripts/smoke.mjs https://www.an-ker.de`.
- **Checks.** `/api/health` (database reachable, no migration missing; retried for about a minute while a new deployment's address switches over), six public pages (`/`, `/login`, `/privacy`, `/privacy/subprocessors`, `/terms`, `/security`; a redirect counts as alive), and the deep read-only checks behind `GET /api/smoke`: database, migrations, entitlements, AI configuration, cron ledger. The deep route returns only pass or fail per check.
- **Reporting.** The script posts the result to `POST /api/smoke`; a failed run becomes the alert `smoke_failed` (severity 2, email and Telegram through the alert engine) naming the failing checks and the commit, and clears after the next passing run or a day. If the whole site is down, the report cannot be sent but the workflow run itself goes red and GitHub notifies the repository owner.
- **Default chosen:** the "smoke service token" is a shared secret `SMOKE_TOKEN` (compared in constant time; unset means the route answers 503, never "allowed"), not a user session. It opens only these two read-only routes.
- **Founder step, not done:** `openssl rand -hex 32`, then set the value as `SMOKE_TOKEN` in Vercel (Production, then redeploy) and as a GitHub Actions secret of the same name. Until both exist the workflow runs the public checks and says the deep checks were skipped.
- Not included: browser journeys.

## Build status: R5 (2026-10-31)
**Built, tested; the nightly workflow has not run on GitHub yet.** `lib/perf/budget.ts` (seeded production-size fixtures: 21,000 firm names with the collisions real data has, 50,000 people; `within(label, limitMs, fn)`), `scale.budget.test.ts` (pure work), `db.budget.test.ts` (the real schema built from the baseline, 200 workspaces, 300,000 AI calls over a year, 100,000 usage events, one workspace with 100,000 contacts), `regression.budget.test.ts`. Off unless `RUN_BUDGET=1`, so a normal `vitest run` lists them as skipped; `pnpm budget` runs them; `.github/workflows/nightly-budget.yml` runs them nightly and on demand and opens (or comments on) one issue, "Scale budget exceeded", with the measurements.
**Measured 2026-10-31 (ms) and the budget set:** cluster 21,000 firm names 198 (1,000); merge 21,000 scored firms 222 (1,000); merge 50,000 contacts 20 (1,000); hash 50,000 emails 105 (1,000); evaluate every alert rule over 400 jobs, 150 checks and 300 privacy requests 1 (1,000); split, figures and filter a 1,000,000-character Halyard call 1 / 3 / 19 / 530 (1,000; the repeat filter 1,100); `usageThisMonth` over a year of calls 7 (1,000); resolve a workspace's scope 1 (1,000); count its rows 54 (1,000); export a workspace with 100,000 contacts 3,726 (7,500). The rule is twice the measured time, never below a 1,000 ms floor so a slow runner does not make a budget flaky.
**Acceptance met:** a deliberate all-pairs pass over the 21,000 names (the shape of the 2026-10-03 regression) takes 2.6 s against a 1,000 ms budget and is reported as `BUDGET EXCEEDED`.
**Not covered, said plainly:** directory search and the person-registry lookup (they are SQL against indexes the in-process database does not plan the way Neon does, so a budget there would mislead; they need a real-database run); identity detection (doc 55 E1) at scale; the model and network paths. An exceeded budget raises a GitHub issue, not an alert in the app. Times from a developer laptop and from a GitHub runner differ; if the first nightly run shows the floor is too tight, the budget is raised in a commit that says so.
