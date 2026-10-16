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
