# 12. Region: what is where, and how to move the database to the EU

*Closes, as far as it can be closed from the code, the gap "identity documents are stored in the United States" (question 19). The move itself needs the founder's Neon and hosting access and a short maintenance window; it has **not** been done.*

## Facts, 2026-10-23
- **Database (Neon): AWS us-east-1, US East (N. Virginia).** Confirmed from the connection address.
- **Hosting (Vercel):** the sub-processor register says US (inferred); functions run in the region set for the project.
- **Sign-in (Supabase)** and **email (Resend):** provider-default regions, not chosen deliberately. Their actual regions are read with `node scripts/legal/read-regions.mjs` (set `SUPABASE_ACCESS_TOKEN` and `RESEND_API_KEY` in your own shell for the two lookups, or read them from each dashboard) and entered in the sub-processor register.

## What the code already does about it
- **The passport has its own switch, `investor_passport`, off.** Until it is turned on, Anker stores no investor identity documents at all (a fund's own onboarding still collects them in the fund's own flow, in the same database, as before). Sign-up, finding funds, requests, conversations and NDAs can open without it.
- Everything personal is behind the other switches too; with all of them off the investor tables are empty.

## Options
1. **Open without the passport**, keep the US database, and rely on SCCs / the EU-US Data Privacy Framework for what remains (profiles, conversations). Counsel to say whether that is enough for non-document data.
2. **Move the database to an EU region before opening** (recommended if the passport is wanted). Steps below.
3. **Do nothing yet**; keep everything closed.

## Moving the database (outline; do it in a quiet hour, with a rollback)
1. **Prepare.** Create a new Neon project in an EU region (AWS eu-central-1, Frankfurt, is the nearest to Germany). Note its connection strings. Take a fresh backup of production (a Neon branch, and a `pg_dump`).
2. **Freeze writes.** Put the application in maintenance mode, or pause the cron jobs and switch the platform flags off, for the duration.
3. **Copy.** `pg_dump --no-owner --format=custom <old> | pg_restore --no-owner -d <new>` (or Neon's import). Then compare row counts per table between the two databases (a ten-line script) and spot-check files by opening one document.
4. **Cut over.** In the hosting environment replace `NEON_DATABASE_URL` and `DATABASE_URL` with the new strings; redeploy. Run the migration ledger check (`node scripts/migrate-manifest.mjs`) and the smoke checks.
5. **Verify** with `node scripts/legal/read-regions.mjs`: the database line should now show an EU region. Update the sub-processor register (Neon: region EU, basis declared) and the privacy notice.
6. **Roll back** if anything is wrong: set the two variables back to the old database, which is untouched and still has the data from before the freeze; re-do the copy later.
7. **Retire the old database** only after a week of clean operation, after taking a last backup into EU storage.

Sign-in and email: both providers offer EU regions. A Supabase project's region cannot be changed in place (new project and a user migration); a Resend sending domain's region is set when the domain is created (re-create the domain in an EU region and update the DNS records). If their data is judged low risk (a sign-in record; a six-digit code and content-free notices), counsel may accept them as they are with the right transfer terms.

## Not built, on purpose
A second file store outside the database. Fund-held copies of documents live in the same database, so it would move only part of the problem and add orphaned-file risks; the database move fixes all of it.
