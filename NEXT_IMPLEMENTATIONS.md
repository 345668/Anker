# Anker — Platform Assessment & Next Implementations

> Assessed 2026-07-22 against `main` @ `4c17641` (live on Vercel + Neon).
> Companion to [`AUDIT.md`](AUDIT.md) (May 2026 route audit) and
> [`FEATURE_INTEGRATION_CHECKLIST.md`](FEATURE_INTEGRATION_CHECKLIST.md).
> This file is the working backlog: assessment first, then the
> prioritized implementation plan. Check items off as they land.

---

## 1. Snapshot

| Dimension | State |
|---|---|
| Surface area | 242 API routes · 136 pages · 177 lib modules (2.3 MB) |
| Feature depth | Very high — AI failover chain, LP portal, compliance register, outreach engine, crawl worker, Chrome extension v0.4.0 |
| Automated tests | **0 test files** |
| CI on `main` | **None** (only `extension-release.yml`) — every push deploys straight to prod with no build/typecheck gate |
| Input validation | zod in **1 of 242** routes |
| Rate limiting | None on public API surface |
| Auth coverage | ~192/242 routes guarded; **4 confirmed-open expensive AI routes** (see §2.1) |
| Migration discipline | Raw SQL run by hand; **no applied-migrations ledger** — drift already happened once (2026-07-17 set shipped in code days before it was applied to Neon) |
| Known TODO/FIXME markers | 45 |

**Overall:** the product is far ahead of the platform. Feature velocity has
been excellent; the highest-value next work is *not* another feature — it is
closing the safety gap between "push to main" and "live in prod", and closing
the abuse gap on the open AI endpoints. After that, a short list of
high-leverage product completions.

---

## 2. Findings

### 2.1 Security — open, expensive endpoints  🔴 highest priority

Confirmed **no auth reference of any kind** (session, bearer, secret, 401):

| Route | Exposure |
|---|---|
| `app/api/fund-deck/analyze/route.ts` | Unauthenticated → 240 s of multi-provider AI per call. Direct cost-abuse vector on the live domain. |
| `app/api/founder/analyze-deck/route.ts` | Same class — heavy AI on an open POST. |
| `app/api/chat/route.ts` | Open LLM proxy — free tokens for anyone who finds the URL. |
| `app/api/outreach/run/route.ts` | Accepts `xlsxPath` (reads a server path) and `outputDir` (writes to a server path) from the request body, unauthenticated. Path-traversal + arbitrary-write risk, and it can trigger real outreach. |

Adjacent gaps:

- `app/api/artifacts/[file]/route.ts` — verify it can't stream files outside
  the artifacts dir (it takes a filename segment).
- No rate limiting anywhere on the public surface; even *authenticated* AI
  routes can be hammered.
- `app/api/internal/wc-pipeline` is `NODE_ENV` dev-gated — acceptable, but
  it's the pattern to migrate onto a real guard.
- Extension routes are fine (bearer token) — the earlier grep flagged them
  only due to case sensitivity.

### 2.2 Deployment safety — no gate between keystroke and prod  🔴

- Pushing `main` = deploying, but there is no CI running `tsc`, `next build`,
  or lint. A type error only surfaces when Vercel's build fails (or worse,
  doesn't).
- Zero automated tests across 177 lib modules — including money-adjacent
  logic: LP position math, capital-account rollups, compliance deadline
  applicability, provider failover ordering (which already regressed once —
  the qwen/mistral pin bug fixed in `82b1c17`).
- The Jul-22 session collision (two working trees committing the same
  features to `main` independently, resolved only because one tree was a
  strict superset) shows the single-branch workflow is at its limit.

### 2.3 Data & migrations  🟡

- No `schema_migrations` ledger — nothing records which of the 15
  `scripts/migrations/*.sql` files have been applied to which database.
  The 2026-07-17 drift incident (code live, tables missing) is the proof.
- `2026-07-17-kpi-extractions.sql` status on Neon is **unverified** — the
  other three from that date were applied 2026-07-22; this one predates the
  session and should be confirmed/applied the same way.
- `run-migration.mjs` (root) is untracked-local; the committed docstring
  points at `scripts/oneshot/run-migration.mjs`. Pick one home, commit it.
- Artifacts write to `/tmp/` on Vercel — ephemeral; generated decks/docs die
  with the lambda. Vercel Blob was already identified as the fix (checklist
  §13) and `@vercel/blob` is already a dependency.

### 2.4 Validation & error hygiene  🟡

- zod is installed and used in exactly one route; everywhere else request
  bodies are `body?.field` optional-chaining. Malformed input fails deep in
  handlers with generic 500s instead of 400s at the boundary.
- The newsroom-draft pattern from `7a7eeab` (surface the *real* provider
  failure + actionable hint) is the right model — it exists in one route and
  should become the shared error path for all AI-backed routes.

### 2.5 Repo hygiene  🟢 quick wins

- `package.json` name is still `my-v0-project`; version `0.1.0` while the
  app is functionally v0.4.x.
- Root-level clutter: 5 extension zips (0.1.1–0.4.0; only 0.4.0 is current,
  and one copy is already tracked under `extensions/linkedin/store-assets/`),
  `StarNode.tsx.patch` (self-described scratch), `.fuse_hidden*` junk,
  `linkedin-posts-extension-network.md` (uncommitted analysis note),
  `docker-compose.yml.bak`.
- `components/anker/` cleanup recommended in AUDIT.md §Recommended-next-moves
  is still outstanding.
- Two stale git locks (`HEAD.lock`, `index.lock`) had to be cleared on
  2026-07-22 — symptom of interrupted sessions writing to the same tree.

### 2.6 Product gaps worth closing (from checklist §13 + audit)

- LP portal has no notification loop — tokens are minted and copied by hand;
  no email delivery of the portal link, no expiry warning.
- Compliance register tracks deadlines but nothing *pushes* — no digest email
  / in-app reminder when a filing window opens.
- Audio transcription, TTS, video gen: deferred, still no in-app pull. Leave.
- Learned LP ranker: blocked on labelled outcomes — start *capturing*
  outcomes now (match → outreach → reply → commitment) so the dataset exists
  in 6 months.
- Remaining 3 modelling tools (ecommerce-forecast, enterprise-saas-forecast,
  fund-of-funds, venture-studio-model) — scaffolded, ~300 lines each.

---

## 3. Implementation plan

Ordered. Each phase is shippable on its own; nothing in P1+ should start
before P0 lands, because P0 is what makes shipping the rest safe.

### P0 — Stop the bleeding (½–1 day)  ✅ DONE 2026-07-22

- [x] **Guard the 4 open AI routes.** New `lib/auth/require-user.ts` (sibling
      of `requireAdmin`, works in both Supabase + local-JWT modes); applied to
      `fund-deck/analyze`, `founder/analyze-deck`, `chat`. For `outreach/run`,
      **`xlsxPath` and `outputDir` removed from the body** — output dir is now
      a fixed server constant, profiles must be supplied inline. Verified all
      callers (find-investors, matchmaking, chat) are post-login dashboard
      features, so no anonymous flow breaks.
- [x] **Path-confinement in `artifacts/[file]`** — already safe: `path.basename`
      + rejects any name containing a separator + extension allow-list. No
      change needed.
- [x] **CI gate on `main`** — `.github/workflows/ci.yml`: `tsc --noEmit`
      (essential — `next.config.mjs` sets `ignoreBuildErrors:true`, so Vercel
      never catches type errors) + `next build` with stub env. Lint omitted:
      ESLint is not installed/configured in this repo (see P3).
- [x] **`kpi-extractions` migration** — verified `portfolio_kpi_extractions`
      already exists on Neon; no action needed.
- [x] **Migration runner tracked** at `scripts/oneshot/run-migration.mjs`.
- [x] **Bonus:** fixed 3 pre-existing type errors in
      `outreach/campaigns/[id]/enrich` (read `.value` without narrowing the
      `generateTyped` union) so the new `tsc` gate is green. Project now
      typechecks clean.

### P1 — Platform floor (2–4 days)  🔧 in progress

- [x] **Migrations ledger.** `schema_migrations(filename, applied_at, checksum)`
      table; `run-migration.mjs` is now ledger-aware (`--status` / `--all` /
      `--backfill` / single-file, records + skips). `pnpm migrate` /
      `migrate:status` wrappers. Backfilled on Neon: 40 files recorded, 0
      pending.
- [x] **Rate limiting.** `lib/rate-limit.ts` fixed-window limiter keyed by
      user id; applied AI_HEAVY (12/min) to fund-deck/analyze +
      founder/analyze-deck, AI_INTERACTIVE (40/min) to chat. In-memory /
      per-instance v1. *Still to do: extend to `assistant` + newsroom
      `draft`, and default-on for other POST routes.*
- [x] **Bonus (found via new tsc gate):** fixed a live email-tracking bug —
      `track/open/[id]` + `track/click/[id]` typed `params` as sync so the
      tracking id was always empty and no open/click was ever recorded.
- [ ] **Boundary validation.** Shared `parseBody(schema)` helper (zod is
      already installed); adopt in the ~20 highest-traffic POST routes.
      400s with field errors instead of deep 500s.
- [ ] **First tests where the money is.** Vitest + the 5 highest-risk pure
      modules: provider chain ordering (`lib/ai/provider.ts` — already
      regressed once), LP position/rollup math, compliance applicability
      rules, statement-extract column mapping, outreach send gating.
      Wire into the CI job.
- [ ] **Branch discipline.** Feature branches + PR into `main`, now that CI
      exists to make PRs meaningful. Kills the two-working-trees collision
      class.

### P2 — Product completions (1–2 weeks, parallelizable)

- [ ] **Artifacts → Vercel Blob.** Swap the `/tmp` writer behind the existing
      `/api/artifacts/[file]` streamer; dependency already installed.
      Generated decks/letters survive the lambda.
- [ ] **LP portal delivery loop.** "Send link" action (Resend template) next
      to the existing copy-to-clipboard; access-log view on the LP row
      (`lp_portal_access_log` is already populated); expiry-warning cron via
      the existing scheduler.
- [ ] **Compliance nudges.** Weekly digest (existing cron + Resend) of
      deadlines entering their window; badge count on the Compliance nav
      item.
- [ ] **Shared AI-error surface.** Extract the `7a7eeab` detailed-error
      pattern into `lib/ai/route-error.ts`; adopt in all AI-backed routes so
      every failure names provider, cause, and fix location.
- [ ] **Outcome capture for the learned ranker.** Event table
      (match_shown → contacted → replied → committed) written from outreach +
      CRM transitions. Zero UI; it just accumulates training data.

### P3 — Hygiene sweep (½ day, anytime)

- [ ] `package.json`: name `anker`, version `0.4.0`.
- [ ] Delete root zips 0.1.1–0.3.0 + extracted `0.1.2/`, `StarNode.tsx.patch`,
      `.fuse_hidden*`, `docker-compose.yml.bak`; decide fate of
      `linkedin-posts-extension-network.md` (commit to `docs/` or delete).
- [ ] `components/anker/` cleanup per AUDIT.md (keep `animated-tesseract.tsx`).
- [ ] `.gitignore`: add `*.patch`, `.fuse_hidden*`, root `*.zip`.

### Deliberately not now

| Item | Why |
|---|---|
| Stripe billing | No paying-user motion yet; schema sketch is enough |
| Edge runtime moves | Node runtime isn't the bottleneck anywhere measured |
| Audio/TTS/video | No in-app pull; providers already integrated when needed |
| Redis-backed rate limits | Only if in-memory limits prove insufficient |
| Learned ranker training | Blocked on data — P2 outcome capture unblocks it |

---

## 4. Suggested sequencing

```
Week 1   P0 entirely → P1 migrations ledger + rate limiting
Week 2   P1 validation + tests + branch discipline → start P2 Blob + portal loop
Week 3   P2 compliance nudges + AI-error surface + outcome capture → P3 sweep
```

The single most important line in this file: **P0 first.** Four open AI
routes on a public domain with paid provider keys behind them is the one
finding that gets worse every day it waits.
