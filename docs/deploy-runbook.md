# Anker deploy runbook

Everything needed to bring the platform fully live after the 2026-08 feature work merges.
Grouped by: **environment variables**, **database migrations**, and the **doc-worker
container**. Staff can see the live status of every integration on
`/dashboard/settings/api-keys` → *Platform integrations*.

---

## 1. Environment variables (Vercel → Project → Settings → Environment Variables)

Set for **Production** (and Preview where you want the feature testable). Secrets are
env-only — never store them in the database or a settings UI.

### Core (required for normal operation)
| Var | Enables | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Users & roles full roster (Auth Admin API); sign-up auto-confirm | Supabase → Project Settings → API → `service_role`. **Server-only secret.** |
| `CRON_SECRET` | All scheduled jobs (deadline reminders, compliance digest, outreach) | Any long random string; Vercel Cron sends it as `Authorization: Bearer`. Crons fail closed (401) without it. |
| `DATABASE_URL` / `NEON_DATABASE_URL` | Postgres | Already set in existing deployments. |
| `NEXT_PUBLIC_SUPABASE_URL`, Supabase anon key | Auth | Already set. |

### Email
| Var | Enables |
|---|---|
| `RESEND_API_KEY` | `send_outreach`, LP capital-call / distribution notices |
| `OUTREACH_FROM_EMAIL`, `OUTREACH_FROM_NAME` | From-address for outreach (defaults `vc@an-ker.de` / `Anker`) |
| `APP_URL` | Tracking-pixel / click-through base URL |

### Documents & signing
| Var | Enables |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Persistent storage for generated docs (K-1s, notices) — Vercel Blob |
| `DOC_WORKER_URL` | High-fidelity LaTeX / LibreOffice PDFs (`render_document_pro`). Falls back to serverless docx when unset. |
| `DOC_WORKER_TOKEN` | Optional bearer for the doc-worker (must match the container's token) |
| `DOCUSIGN_BASE_URI` · `DOCUSIGN_ACCOUNT_ID` · `DOCUSIGN_ACCESS_TOKEN` | Contract e-signature. **All three** required. |

### Compliance / market data
| Var | Enables |
|---|---|
| `OPENSANCTIONS_API_KEY` | Live KYC sanctions/PEP/adverse-media screening. Without it KYC uses the local dev watchlist (⚠ not a reliable clear). |
| `COMPANIES_HOUSE_API_KEY` | Sync UK statutory filing deadlines into the equity-compliance register |
| `COMP_BENCHMARK_API_URL` | Pull market salary + equity ranges into comp bands |
| `COMP_BENCHMARK_API_KEY` | Optional bearer for the comp benchmark provider |

### Billing (Stripe — already wired, test-mode connected)
| Var | Enables |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs | Subscription + AI-credit billing. Point the Stripe webhook at `/api/billing/webhook`. |

---

## 2. Database migrations

Run pending migrations against the target database:

```bash
NEON_DATABASE_URL=<prod-url> pnpm migrate          # applies every pending file
NEON_DATABASE_URL=<prod-url> pnpm migrate:status   # list applied / pending
```

New tables from the 2026-08 work (idempotent `CREATE TABLE IF NOT EXISTS`):

| Migration | Adds | For |
|---|---|---|
| `2026-08-23-notifications.sql` | `notifications` | In-app notifications + deadline reminders |
| `2026-08-23-forecast-scenarios.sql` | `forecast_scenarios` | Saved fund-forecasting scenarios |

The runner keeps a `schema_migrations` ledger, so re-running is safe.

---

## 3. Doc-worker container (optional — high-fidelity PDFs)

Only needed for LaTeX-class / LibreOffice output. Everything else (branded docx, PDF via
pdf-lib) is serverless-native.

```bash
# Build (bundles tectonic + LibreOffice):
docker build -t anker-doc-worker services/doc-worker

# Run (any long-lived host — Fly.io / Railway / Render / Cloud Run / ECS):
docker run -p 8080:8080 -e DOC_WORKER_TOKEN=<secret> anker-doc-worker
```

Then set `DOC_WORKER_URL` (+ matching `DOC_WORKER_TOKEN`) on the app. Persist
`/var/cache/tectonic` (a volume) so LaTeX packages aren't re-downloaded on cold start.
Health check: `GET {DOC_WORKER_URL}/health` → `{"ok":true}`. Full contract in
`services/doc-worker/README.md`.

---

## 4. Scheduled jobs (`vercel.json` — already registered)

Vercel Cron picks these up automatically once `CRON_SECRET` is set:

| Path | Schedule |
|---|---|
| `/api/cron/deadline-reminders` | daily 07:00 UTC |
| `/api/cron/compliance-digest` | Mon 08:00 UTC |
| `/api/cron/outreach-scheduler` | every 10 min |
| `/api/cron/campaign-assessment` | every 15 min |
| `/api/cron/campaign-send` | every 30 min |
| `/api/cron/promote-scheduled-articles` | hourly |

Manually trigger/preview any job (no scheduler needed):
`GET /api/cron/deadline-reminders?secret=<CRON_SECRET>&dry=1`.

---

## 5. Post-deploy smoke checks

- `/dashboard/settings/api-keys` → **Platform integrations**: every integration you set
  shows **configured** (✓). Anything still ✗ is inert-but-safe (the feature degrades
  gracefully with a clear message).
- KYC page banner reads **"Screening is live — OpenSanctions"** (not the amber dev-fallback).
- `GET /api/cron/deadline-reminders?secret=…&dry=1` returns a JSON scan summary.
