# Status register: what is built, what has been tried live, what is open

Kept by hand at the end of a piece of work. **Verified live** means it was run against production (www.an-ker.de and the production database) and the result checked. **Built, not tried live** means unit and in-process database tests pass but nothing has been run for real. Last updated 2026-10-18. The tests in every row pass (2,072 in Anker, 188 in SAIL on 2026-10-17).

**The one finding that outranks every row:** no design partner or customer has used any of these modules (doc 37, G0). Summit Venture Studio and Winner Capital have 0 contacts and 0 investors. The 8 investors in the original fund are demo records. Everything below is infrastructure waiting for a first real user.

## 1. Telegram channel (doc 57)
| | State |
| --- | --- |
| Built | T1 to T4 (link, read and write modes, proposals with buttons, voice notes up to 45 minutes, files, spoken replies, files out, `/forget`, daily brief, sensitive-class summaries); a workspace's own bot connected in the app (§19); a member's personal bot (§20); a leaver loses phones and bot; configurable daily limits |
| Verified live | The crons run (`telegram-sweep` every minute, `telegram-notify`, 0 failures); migrations applied |
| **Built, not tried live** | **Everything that touches Telegram:** webhook delivery, linking, answers, buttons, voice transcription and spoken replies, file reading, `/forget`, notifications, own-bot connection. **No bot exists yet** (`telegram_bots` 0 rows, `telegram_links` 0 rows, flag `telegram_channel` off) |
| Gaps by design | Save a file to the data room and save a voice note as a CRM note as proposals (CRM activities are append-only); agent-result messages; several workspaces per phone; investors on Telegram; WhatsApp. Allowance warnings (doc 58) do not reach Telegram. No member-removal screen exists in the app (the cleanup runs from the sweep) |
| Open founder steps | **Run `docs/runbooks/telegram-first-run.md`** (the page is `/dashboard/channels`, now in the sidebar). Connect a bot (in the app: Connected channels), assign feature `channel_telegram`, turn on flag `telegram_channel`; optional shared bot token `TELEGRAM_PRODUCT_BOT_TOKEN`; counsel on the LGPL MP3 library and on Telegram as a processor; revoke and replace the exposed operator bot token |

## 2. Metering (doc 58)
| | State |
| --- | --- |
| Built | M1 (editable model prices, cost state and owner on every AI call, estimates, two alerts), M2 (one meter for speech, search, documents, media), M3 (estimate-based check, 80% and 100% warnings, usage page, SAIL unit economics, provider bills, at-limit alert) |
| Verified live | The `usage-warnings` cron has run 79 times without failure; migrations applied; the M1 backfill ran on 3,290 calls |
| Built, not tried live | The usage page and the SAIL Model prices and Unit economics pages (not opened by me); a warning actually being sent (no workspace has a limit and spend); the estimate check refusing a job; a metered unit event from real traffic (no AI calls in the last 24 hours) |
| Gaps | The 7 unit prices and 2 model prices are **unverified placeholders**; history without token counts cannot be priced; when the allowance runs out chat is refused (no free-lane fallback); free-lane share not shown; M4 credit ledger deliberately not built |
| Open founder steps | Check the placeholder prices in SAIL; enter the provider bills monthly |

## 3. Release safety (doc 59)
| | State |
| --- | --- |
| Built | R1 (`migrate:verify`, dry-run runner, destructive-header rule), R3 (manifest, `/api/health`, `schema_behind` alert), R6 (post-deploy smoke) |
| Verified live | The ledger reconciled (156 of 156); `/api/health` answers `schemaBehind: 0`; the 7 public checks of the smoke script pass |
| Built, not tried live | The `schema_behind` and `smoke_failed` alerts firing; the GitHub workflow running after a real deploy; the deep checks and the report (no `SMOKE_TOKEN` yet) |
| Not built | R2 (schema baseline and from-scratch build), R4 (restore drill), R5 (nightly scale budget) |
| Known drift | 6 older migration files whose objects differ from production (`scripts/migrations-known-drift.json`); 3 files the checker cannot read; no code was found to need the missing objects |
| Open founder steps | `SMOKE_TOKEN` in Vercel and in GitHub; a Neon API key for the restore drill; check the Neon history window of the plan |

## 3a. Earlier work still open
Counsel review of the privacy notice and the legitimate-interest assessment (doc 54); classify the `folk` directory source; doc 55 E2 to E4 wait for the first ~100 candidate decisions; external uptime monitor; Stripe webhook secret and test; a connected reply mailbox; `OUTREACH_FOOTER_ADDRESS`; `SAIL_URL`; a Hunter API key in SAIL; DashScope key and the Mistral pin (doc 35); the ffmpeg binary upload; the Chrome Web Store package; the legacy `notifications` table blocking its migration.

## 4. The investor leg (doc 60)
| | State |
| --- | --- |
| Built | L1 to L5: contact address, 30-day personal link with emailed code, onboarding checklist, subscription package and countersign, identity documents (encrypted), capital account and statement PDF, notices, published documents, reminders and activity, optional account, requests to the fund |
| **Verified live (2026-10-17, 40 checks twice, then by hand)** | Invitation and code emails through Resend (real inbox, real code entered); everything in the walk-through: details, terms, subscription return, rejection and re-send, countersign, identity upload and encryption, no auto-clearing without screening, statement PDF, tax document, requests and the assistant handing an action to the fund, access log |
| Found and fixed by that test | The portal returned a server error to every investor (missing column); a file over 4 MB failed with a generic message |
| **Built, not tried live** | The optional account (creates a sign-in with a password); a fund that belongs to a workspace, where a request becomes a proposal in the Actions inbox; the fund manager's screens in a browser (the panels are behind a sign-in); the 8 existing investors (demo records without addresses) |
| Gaps | 4 MB file limit; no virus scanner; no retention timer; no separate compliance role (owner or admin); no wire details after countersign; the weekly brief does not mention stuck investors; the assistant's request detection is keyword-based; rejecting a request does not email the investor |
| Open | Add real addresses and run one fund's first real investor end to end |

## 5. Investor profiles and relationships (doc 61)
Spec only. Nothing built.

## 6. How a live test is done (so it can be repeated)
A throwaway fund and investor with an obvious name are created in production, addressed to the founder's own mailbox; the portal is driven over HTTP; fund-side steps run through the library from a script (TypeScript run with `tsx`, `DATABASE_URL` pointed at the Neon database because `.env.local` points it at a dead local address, a temporary stub for `server-only`); everything is deleted in a `finally` block and the row counts are checked. Things that create a real account or password, or read the founder's inbox, are left to the founder.
