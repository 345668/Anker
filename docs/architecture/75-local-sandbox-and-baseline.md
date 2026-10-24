# 75. A database from nothing, a sandbox that cannot reach production, and what walking the product found

Status: **built 2026-10-24.** Closes doc 59 R2 (schema baseline and from-scratch build) and gives the founder and the assistant a safe way to run and click through the product.

## 1. What exists
- `db/baseline/<date>.sql`: production's schema only (no rows, no secrets), generated read-only by `scripts/db/make-baseline.mjs` (needs the `pg_dump` client and `NEON_DATABASE_URL`). Platform-owned objects (the Neon session-JWT extension, the PostgREST schema, a leftover platform migrations schema) are dropped; a check refuses a baseline that still references them. Beside it: the ledger of migrations production had applied (`.ledger.json`) and an introspected schema (`.schema.json`).
- `scripts/db/build-local.mjs`: loads the baseline into PGlite (with `vector`), then applies any manifest migration production had not applied when the baseline was taken. `lib/db/baseline.test.ts` builds it in memory in every test run and compares tables, columns and indexes with the recorded production schema: **a migration that breaks the chain, or drift between the baseline and what the build produces, fails the suite.**
- `scripts/db/seed-demo.mjs`: a local founder and a local fund manager (`founder@demo.test`, `vc@demo.test`, password `demo-password-1`), their workspaces, a fund with a fund profile, and the investor switches opened (sign-up and passport on, discoverability off). Local database only.
- `scripts/dev-local.mjs` (`pnpm dev:local`, launch config `anker-local`, port 3100): runs the app on the local database with every key, token and URL from `.env.local` blanked, local sign-in, and **mail written to `.local-outbox.jsonl` instead of sent** (`LOCAL_EMAIL_OUTBOX`, never honoured on a production deployment). Nothing can reach production, send an email or call a paid service.
- To refresh the baseline after a production migration: `NEON_DATABASE_URL=… node scripts/db/make-baseline.mjs` (a new dated file; the build uses the latest).

## 2. Defects found by running it, and fixed
1. **Local sign-in did not work** (the sign-in route had no local path). Fixed, and refused on a production deployment.
2. **The local adapter did not load the `vector` extension**, so every page touching embeddings failed. Fixed.
3. **Editing a file while the dev server ran could crash the database** ("Aborted()"): the module reloaded and opened the same PGlite twice. The instance is now a process-wide singleton.
4. **Investor sign-up used Supabase's admin API unconditionally**; a local adapter now creates the account in the local users table.
5. **Amounts in the fit text were always dollars**, whatever the fund's currency ("$100K" for a euro fund). They now use the fund's currency (€, £, CHF, or the code).
6. **A manager's minimum-cheque rule silently hid the fund's stated minimum commitment** (the page said 100K where the profile said 250K). The rule stays the authority, as designed, but the manager is now **warned** when it disagrees with the profile, or when the rules admit everyone.
7. **The fund page repeated the fit sentence as bullets**, and "minimum 250,000" lacked the currency shown elsewhere on the same page. Fixed.
8. **A fund workspace without a fund** showed three raw errors; it now shows one explanation and a link. (Real onboarding always creates the fund; the seed did not.)

## 3. Verified in a browser on the sandbox (not on production)
Fund manager: listing rules, a listing warning, listing the fund, the investor queue, accept, message, invite to onboard (creates the fund's investor record, sends the onboarding link). Investor: sign-up with a code, profile, entity, fund ranking, fund page, request, content-free notice email, and the fund's portal link with its code step and first onboarding page. All 34 founder pages and 29 fund-manager pages load without a server error.

## 4. Not covered
Production (nothing here touched it except the read-only schema dump); the AI, email and storage providers (their keys are blanked); the passport upload, attachments, team, discoverability and erasure pages (covered by tests, not yet clicked); the visual design review of the founder and fund-manager dashboards beyond first-run screens.
