# Anker — Venture Operating System

The AI platform for ventures. One application, three personas: **Founders** raise
the round, **VCs / GPs** source deals and run the fund, **LPs** monitor their
capital — over one shared data and intelligence layer.

> Full technical detail (architecture, engine mathematics, ML methods, security)
> lives in [`docs/anker-whitepaper.md`](docs/anker-whitepaper.md).

---

## What's inside

| Area | Highlights |
|---|---|
| **Founder Suite** | Investor discovery & matching, Cap Table, 409A, Share Plans, Runway, Raise Pipeline, Data Room |
| **Fund OS** | Deal flow, fund admin (calls/distributions/NAV), performance (TVPI/DPI/MOIC/IRR), SPVs, KYC/AML, fund tax, contracts, compliance, reporting |
| **Investor Room** | LP self-serve capital account, distributions & calls, documents |
| **Engines** | OPM 409A valuation · private-credit loan servicing · equity vesting — pure-math modules, textbook-verified |
| **AI** | Provider-agnostic model router; tool-calling agent that adapts into Founder / Fund / Investor **persona copilots**; semantic matching over 47k+ investors |
| **Billing** | Stripe subscriptions + AI-credit ledger |

---

## Stack

- **Next.js** (App Router) · **TypeScript** · **Tailwind CSS v4**
- **Neon** (serverless Postgres) · **Supabase Auth**
- **Vercel** (hosting) · **Stripe** (billing)
- Package manager: **pnpm** (this repo uses pnpm — `npm install` is not supported here)

---

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Type-check without a full build (avoids writing tsbuildinfo on constrained disks):

```bash
npx tsc --noEmit --incremental false
```

---

## Environment

Secrets live only in a **gitignored** `.env.local`. Key variables:

```bash
# Database (Neon) / local Postgres
DATABASE_URL=…                 # or LOCAL_DB=true for in-process PGlite
NEON_DATABASE_URL=…

# Auth (Supabase)
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…

# Registration (invite-only; fails closed if unset)
SIGNUP_INVITE_CODE=…           # link: /register?invite=<SIGNUP_INVITE_CODE>

# Billing (Stripe)
STRIPE_SECRET_KEY=…            # sk_… (test or live)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=…
STRIPE_WEBHOOK_SECRET=…        # whsec_… (create the webhook endpoint first)
STRIPE_PRICE_STARTER=…         # price_…
STRIPE_PRICE_PRO=…
STRIPE_PRICE_SCALE=…

# AI providers (any subset; router degrades gracefully)
ANTHROPIC_API_KEY=…
DASHSCOPE_API_KEY=…            # Qwen / GLM / DeepSeek / Kimi gateway
```

**Production:** set the same variables in Vercel → Project → Settings →
Environment Variables. `.env.local` is local-only and is never deployed or
committed.

---

## Database migrations

Migrations are plain SQL under `scripts/migrations/`. Apply one to Neon with:

```bash
NEON_DATABASE_URL="$(grep -E '^NEON_DATABASE_URL=' .env.local | cut -d= -f2-)" \
  node scripts/oneshot/run-migration.mjs scripts/migrations/<file>.sql
```

The runner splits on `;` and strips full-line comments — never place a `;` inside
a comment.

---

## Repository map

```
app/
  dashboard/            in-app shell (persona-scoped); engines' detail pages
  lp/                   LP Investor Room portal
  api/                  route handlers (engines, assistant, billing, admin)
  (marketing)           home, products, solutions, investor-database, newsroom
components/
  shell/                app-nav, contextual rail, command palette, page header
  modules/              engine detail clients (loans, 409A, share plans, …)
  landing/              marketing site (navigation, sections, footer)
  admin/                owner console (audit feed, billing)
lib/
  modules/              PURE math: opm-409a, loan-amortization, vesting, …
  portfolio/            fund/LP/investments/data-room services
  ai/                   model-router, embeddings, semantic-search
  agents/               personas (copilots), outreach, portfolio-search
  billing/              stripe client + billing/credit ledger
  auth/                 admin/owner tiers, persona guard, signups
  nav/                  shared navigation taxonomy (site + app)
scripts/migrations/     SQL migrations
docs/                   this README, the white paper, the redesign plan
```

---

## The engines (where the math lives)

- **409A / OPM** — `lib/modules/opm-409a.ts` (Black–Scholes, two-class waterfall,
  bisection back-solve) · service `lib/modules/valuation-409a.ts`
- **Loan servicing** — `lib/modules/loan-amortization.ts` (amortization, Actual/365
  accrual) · service `lib/modules/loan-servicing.ts`
- **Share plans / vesting** — `lib/modules/vesting.ts` (cliff-aware vesting,
  termination freeze) · service `lib/modules/share-plans.ts`

Each pure module is import-free of the DB and verified against textbook values.

---

## AI & persona agents

- **Model router:** `lib/ai/model-router.ts` (multi-provider, task-tiered).
- **Agent loop:** `lib/assistant/agent.ts` + tools in `lib/assistant/tools*.ts`.
- **Persona copilots:** `lib/agents/personas.ts` — Founder / Fund / Investor,
  each with a role, tool scope, integrated features (from the nav taxonomy), and
  suggested tasks. Wired into `/api/assistant` and both chat surfaces.

---

## Security notes

- Registration is invite-only and fails closed (`lib/auth/signups.ts`).
- Post-login redirects accept internal paths only (open-redirect guard).
- Platform owners are firewalled from tenant private records (structural), with a
  single explicit, logged LP-portal oversight exception.
- Append-only audit trail: `lib/audit/audit-log.ts` → `/dashboard/admin/audit`.

---

## Conventions

- Commit only when asked; secrets only in gitignored `.env.local`.
- Financial quantities are **derived from ledgers**, never hand-typed.
- Pure math stays free of I/O so it runs identically on server and client.
```
