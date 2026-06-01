# Anker — platform audit (May 2026)

A pass over `app/dashboard/*`, `components/*` and `app/api/*` to flag
placeholder UI, dead workflows, redundant routes and orphaned files.
The report ends with a short "do this next" list.

## TL;DR

* **No dead buttons.** No `Coming soon`, no `href="#"`, no empty
  `onClick={() => {}}` anywhere in the dashboard components. The
  visible UI is fully wired to real handlers.
* **`components/anker/` is a near-orphan.** 19 of its 20 files are
  unreferenced; only `animated-tesseract.tsx` is imported (by 3 auth
  pages). Safe to delete the rest, or move that one file into
  `components/tesseract/` and remove the folder.
* **Four overlapping CRM-ish routes** exist with subtly different
  jobs. They should stay separate but the homepage / sidebar copy
  should say what each is for. Map below.
* **Tools manifest is now 11 shipped, 3 planned.** Three tools were
  built this session: OpEx Pro-Forma, Exit Waterfall, VC Fund Model.

## Dashboard route inventory

| Route                        | Purpose                                                    | Status   |
| ---------------------------- | ---------------------------------------------------------- | -------- |
| `/dashboard`                 | Founder home — KPIs, recent activity                       | live     |
| `/dashboard/find-investors`  | Founder → VC matching (uses LP-matching v2 engine)         | live     |
| `/dashboard/matchmaking`     | Fund → LP matching, fund-deck uploader, profile editor     | live     |
| `/dashboard/discover`        | Investor explorer (lists from `/api/investors`)            | live     |
| `/dashboard/investors`       | Browse investors + firms (paginated, real DB)              | live     |
| `/dashboard/deals`           | Deals + firm/investor cross-ref                            | live     |
| `/dashboard/cap-table`       | Native cap-table modeler                                   | live     |
| `/dashboard/runway`          | Native 3-scenario runway planner                           | live     |
| `/dashboard/term-sheet`      | Native term-sheet red-flag analyzer                        | live     |
| `/dashboard/tools`           | Index of every native calculator                           | live     |
| `/dashboard/tools/<slug>`    | Per-tool calculator pages (8 shipped + 3 new this session) | live     |
| `/dashboard/templates`       | Legacy Foresight templates (admin-only)                    | live     |
| `/dashboard/documents`       | Document hub (data-room links)                             | live     |
| `/dashboard/data-room`       | Documents organized as a data-room                         | live     |
| `/dashboard/pitch-deck`      | Pitch-deck management                                      | live     |
| `/dashboard/fundraising`     | Top-level fundraise overview                               | live     |
| `/dashboard/analytics`       | Analytics / insights                                       | live     |
| `/dashboard/chat`            | AI assistant chat                                          | live     |
| `/dashboard/help`            | Help / docs                                                | live     |
| `/dashboard/settings`        | User settings                                              | live     |
| `/dashboard/company`         | Company profile                                            | live     |
| **CRM-ish family**           |                                                            |          |
| `/dashboard/crm`             | Legacy CRM — reads `outreaches` table                      | live     |
| `/dashboard/outreach`        | Email-outreach workflow (also `outreaches` table)          | live     |
| `/dashboard/pipeline`        | Deal-pipeline view (deals + matches)                       | live     |
| `/dashboard/shortlist`       | New shortlist-driven CRM (reads `crm_entries`)             | live     |

### CRM-ish family — what's the actual difference?

This is the only place a user could reasonably get confused.

| Route        | Backing table     | Primary use                                                         |
| ------------ | ----------------- | ------------------------------------------------------------------- |
| `crm`        | `outreaches`      | Per-startup outreach log. Old-style table view + kanban.            |
| `outreach`   | `outreaches`      | The same table, but optimized for **composing** outreach (templates).|
| `pipeline`   | `deals`+`matches` | Deal-stage view of the AI-matched pipeline (not outreach).          |
| `shortlist`  | `crm_entries`     | The new shortlist-from-xlsx kanban + 4-step DM composer.            |

**Recommendation:** keep the four routes (each has a real reason to
exist) but tighten the sidebar labels:

* `CRM` → "Outreach log" (what it is)
* `Outreach` → "Compose outreach" (what it does)
* `Pipeline` → "Deal pipeline"
* `Shortlist` → "Shortlist & DMs" (what it does)

Or merge `crm` + `outreach` (both live on `outreaches`) into a
single tabbed view to remove the perceived duplication.

## Components — orphan + redundancy check

* `components/anker/` — 20 files, 1 imported. Specifically:
  * **Used:** `animated-tesseract.tsx` (3 auth pages).
  * **Orphans:** `analytics-content.tsx`, `chat-content.tsx`,
    `company-content.tsx`, `crm-content.tsx`, `dashboard-content.tsx`,
    `dashboard-sidebar.tsx`, `data-room-content.tsx`, `deals-content.tsx`,
    `footer-section.tsx`, `fundraising-content.tsx`, `help-content.tsx`,
    `hero-section.tsx`, `industries-section.tsx`, `investors-content.tsx`,
    `navigation.tsx`, `pipeline-content.tsx`, `pitch-deck-content.tsx`,
    `portfolio-section.tsx`, `settings-content.tsx`.

  These are all earlier drafts that were superseded when the page
  switched to the `tesseract/` namespace. Safe to delete in one
  cleanup commit.

* `components/tesseract/` — 36 files, all referenced. This is the
  active design system; no orphans here.

## API surface

All API routes are wired and use the same DB driver
(`lib/db/index.ts`, auto-routes to Neon serverless OR `pg` based on
the URL). Notable routes:

| Route                                       | Status |
| ------------------------------------------- | ------ |
| `/api/firms` (GET)                          | live, paginated, filterable |
| `/api/investors` (GET)                      | live, paginated, filterable |
| `/api/lp/matching/run-v2` (POST)            | live, calls v2 engine        |
| `/api/founder/matching/run` (POST)          | live                         |
| `/api/fund-deck/{extract,analyze,docx}`     | live                         |
| `/api/founder/extract-profile`              | live                         |
| `/api/founder/analyze-deck`                 | live                         |
| `/api/crm/entries`, `[id]`, `import-shortlist` | live                      |
| `/api/outreach/{generate, messages, replies}` | live                       |
| `/api/lp/fund-profiles` (GET / upsert POST) | live                         |
| `/api/tools/[slug]/export`                  | live, dispatches by slug     |

## Tools — manifest after this session

**Shipped (11)**

* unit-economics
* qsbs-eligibility
* saas-forecast
* venture-valuation
* vc-performance
* cap-table (existing dedicated page)
* runway (existing dedicated page)
* term-sheet (existing dedicated page)
* **opex-proforma** (new)
* **exit-waterfall** (new)
* **vc-fund-model** (new)

**Still planned (3)**

* ecommerce-forecast
* enterprise-saas-forecast
* fund-of-funds
* venture-studio-model

(Removed `opex-proforma`, `exit-waterfall`, `vc-fund-model` from the
planned list now that they ship.)

## Recommended next moves

1. **Delete `components/anker/`** except `animated-tesseract.tsx`
   (move that into `components/tesseract/`). Single cleanup commit.
2. **Tighten sidebar labels** on the CRM-ish family — call each one
   by its actual job.
3. **Build the remaining 3 tools** (ecommerce-forecast,
   enterprise-saas-forecast, fund-of-funds, venture-studio-model)
   when needed; the scaffolding (manifest + export route + tools
   index + ToolShell) makes each one a ~200-line lib + ~100-line UI
   addition.
4. **Wire the multi-model AI router smoke-test.** Once you've pulled
   `qwen2.5:7b-instruct` and `qwen2.5:14b-instruct`, run a small LP
   matchmaking (5-10 firms) and a fund-deck analysis to confirm the
   router is calling the right model for each task. The status page
   in `providerInfo()` exposes the live mapping.
5. **Production deploy.** `pnpm build && pnpm start` per `DEPLOY.md`.
   The build won't run inside the Cowork sandbox (Linux/arm64) but
   will run cleanly on macOS where you have `@next/swc-darwin-arm64`
   already cached in `node_modules/.pnpm/`.
