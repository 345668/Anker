# Restoring production from Neon's history

Doc 59 R4. A backup you have never restored is a hope. This is how to restore, and how to prove it works. **The drill is read-only and deletes its own branch; it never touches production.**

## Objectives (write the real numbers here after the first drill)
- **RPO** (how much recent data can be lost): equals the **history window of the Neon plan** on the production project. Read it in the Neon console (Project, Settings, Storage, History retention) and write it here: `____`. A point in time older than that cannot be restored.
- **RTO** (how long to a working read-only app): target 2 hours. The measured time of the drill below is the real number; write it here after the first pass: `____`.

## What you need (yours to provide; Claude never enters or stores these)
1. A Neon **API key** (Neon console, Account settings, API keys). A key limited to the one project is best.
2. The **project id** (Neon console, Project settings; looks like `quiet-water-123456`).
3. The production connection string, which is `NEON_DATABASE_URL` in `.env.local`.

## Run the drill (about fifteen minutes; quarterly)
In your own terminal, in the repository. Nothing is read from a file and nothing is printed:
```bash
NEON_API_KEY=... NEON_PROJECT_ID=... NEON_DATABASE_URL=... node scripts/restore-drill.mjs --plan
NEON_API_KEY=... NEON_PROJECT_ID=... NEON_DATABASE_URL=... node scripts/restore-drill.mjs
```
`--plan` says what it would do and calls nothing. The real run: creates a **read-only** branch of production as it was 60 minutes ago (`--age-min` to change), compares row counts of 20 important tables (tolerance 1% or 10 rows, plus rows written since the point in time), runs three read-only queries on it, records the result in `restore_drills` (dates, counts and timings only, no row content) and **deletes the branch**. It prints `PASSED` or `FAILED` and, on failure, which table was off.
- If it says the branch was **not deleted**, delete it in the Neon console (Branches, `restore-drill-...`); a leftover branch costs money.
- The result appears in SAIL, **Restore drill**. A pass clears the alert `restore_drill_overdue`; the alert is raised after 100 days without a pass (and now, because none has ever passed).
- **After the first pass:** write the measured time above as the real RTO.

## A real restore (if production data is lost or damaged)
Who decides: the founder. Do not start without deciding what the target point in time is.
1. In the Neon console, **Branches, Create branch**, parent = the production branch, **Point in time** = just before the damage. Make it **read-write**. Note its connection string. (Neon's own guide: "Instant restore" and "Branch restore"; the console can also restore the production branch in place to a point in time, which keeps its connection strings but **discards everything after that point**.)
2. **Check the branch before trusting it:** row counts of the important tables against what you expect (`node scripts/restore-drill.mjs` does this for a branch it makes itself; for a branch you made, run the counts in the Neon SQL editor), sign in through a preview deployment pointed at it (Vercel, a preview with `DATABASE_URL`/`NEON_DATABASE_URL` set to the branch), open a workspace and a call.
3. **Cut over** one of two ways: (a) restore the production branch in place to that point in time (fastest; loses everything after it); or (b) change `DATABASE_URL` and `NEON_DATABASE_URL` in Vercel Production to the restored branch and redeploy (production keeps running on the damaged branch until you do; keep it for forensics).
4. After cutover: `/api/health` must say `schemaBehind: 0`; run the smoke workflow; tell any customer whose data in the lost window is gone.
5. Anything written between the point in time and the cutover is **not** in the restored copy: that is the RPO. Names of workspaces that were active in that window are in `ai_calls` and `cron_runs` of the damaged branch.

## What this does not cover
Blob storage (uploaded decks, data room files, call audio is never stored) is not in Neon: Vercel Blob keeps its own copies and a restore of the database does not restore deleted blobs. Third-party systems (Supabase auth users, Resend, Stripe) are restored by their own providers; the database holds only references to them.
