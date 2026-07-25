# Founder Campaign Engine — Strategic Implementation Plan

**Author:** Philippe M. Masindet — Founder, Anker AI
**Status:** Draft for review · **Target first campaign:** week of 2026-08-03
**Scope:** Public founder submission → batched AI assessment → dimensional
investor matching → progressive email outreach → per‑campaign CRM →
bi‑directional founder/investor notification loop.

---

## 1. Executive summary

We are building a **closed-loop fundraising campaign engine**: a founder submits
their startup + pitch deck on the public website; an AI assessment pipeline
(batch-processed) builds the startup and founder profiles, decides whether the
company is investor-ready, matches it against our investor database on multiple
weighted dimensions, and launches a progressive email outreach campaign to the
best ~100 investors — each email carrying the founder's story and deck, and a
one-click **Interested / Not interested** link. Every reply is classified, synced
to a **campaign-scoped CRM**, and pushed to the founder as a notification. When
the campaign completes, the founder gets a wrap-up report.

**The key strategic insight: most of this already exists in the codebase as
disconnected primitives.** The work is ~30% net-new build and ~70% *wiring
existing engines into one orchestrated, self-driving pipeline* with a public
front door, a submission/assessment queue, and a founder-facing notification loop.

### What already exists (reuse, don't rebuild)

| Requirement | Existing primitive | Location |
|---|---|---|
| Deck + data-room → structured profile | `extractStartupProfile()` (Claude PDF input, heuristic fallback) | `app/api/founder/extract-profile`, `lib/matching/v2/document-extractor.ts` |
| Deck quality analysis | analyze/critique deck | `app/api/founder/analyze-deck`, `lib/ai/pitch-deck-analyzer.ts` |
| **Dimensional** founder→investor matching (sector/stage/check-size/geography +) | `runFounderMatching()`, `computeFirmScoreForStartup()` | `lib/matching/v2/founder-engine.ts`, `founder-scoring.ts` |
| Investor universe | `investment_firms`, `investors` tables | Neon Postgres |
| Outreach campaigns + members + drafts | `outreach_campaigns`, campaign `[id]` sub-routes | `app/api/outreach/campaigns/**` |
| **Progressive** send scheduler (cron) | `outreach-scheduler` + `outreach_campaign_schedules` (`send_batch`, nudge) | `app/api/cron/outreach-scheduler` |
| Email personalization + drafting | `emailDrafter.ts`, `email-personalizer.ts` | `lib/outreach/`, `lib/ai/` |
| **Batch LLM** with concurrency control | `generateBatch(prompts, concurrency)` | `lib/ai/provider.ts` |
| Reply classification (INTERESTED / WRONG_FIT / …) | `classifyAndDraftReply()` | `lib/ai/reply-handler.ts` |
| Outreach analytics + stats | analytics/stats routes | `app/api/outreach/analytics`, `.../stats` |
| Transactional email (tracked / untracked) | `sendEmail()` via Resend | `lib/email/resend.ts` |
| **Magic-link token** pattern (mint plaintext once, store SHA-256) | LP portal tokens | `lib/portfolio/*`, `lp_portal_tokens` |
| Rate limiter (fixed-window) | `rateLimit()`, `AI_HEAVY` | `lib/rate-limit.ts` |
| Outcome event log (for analytics/learning) | `match_outcome_events` | `lib/matching/outcome-events.ts` |

### What is net-new

1. **Public submission surface** on the website (unauthenticated) + hardened
   public API with strong rate limiting and abuse defense.
2. **Submission → assessment queue** with idempotent, resumable **batch** processing.
3. **Conservative assessment gate** that can *reject with constructive feedback*
   before any investor is contacted.
4. **Founder ↔ investor notification loop**: investor one-click interest links,
   CRM-first sync, founder alerts.
5. **Per-campaign CRM view** and **per-campaign progress + analytics UI**.
6. **Lifecycle emails**: submission confirmation, rejection-with-feedback,
   campaign-complete wrap-up — all signed as Philippe / Anker AI.
7. The **orchestrator** that ties submission → assessment → matching →
   campaign-creation → outreach → completion into one state machine.

---

## 2. End-to-end flow

```
[ WEBSITE ]  Founder fills form + uploads deck  ──POST──▶  /api/public/submit
   │                                                          │ (rate-limited, captcha, size caps)
   │  ◀── "Submission received" email (signed)                ▼
   │                                            INSERT founder_submissions (status=received)
   │
[ BATCH ASSESSMENT ENGINE ]  cron: campaign-assessment (every N min)
   │   picks up received submissions → per batch:
   │     1. extractStartupProfile(deck + fields)      → startup + founder profile
   │     2. analyze-deck / readiness scoring          → assessment_score, gaps
   │     3. GATE: conservative suitability decision
   │            ├─ NOT READY → status=declined, send feedback email (signed), STOP
   │            └─ READY     → status=assessed
   │     4. runFounderMatching(startup)               → top ~100 investors (dimensional)
   │     5. create outreach_campaign + members (from matches)
   │     6. draft personalized emails (generateBatch / Anthropic Batches)
   │            → attach deck, inject founder story + signature
   │     7. status=campaign_ready ; auto-list in Outreach tab
   │
[ PROGRESSIVE OUTREACH ]  cron: outreach-scheduler (existing, every 10 min)
   │   send_batch flips drafts→queued in waves → send worker emails investors
   │   each email carries: founder story, deck link, Interested/Not links, signature
   │   progress bar advances as sent/total climbs
   │
[ NOTIFICATION LOOP ]
   │   investor clicks Interested/Not  ──▶  /api/public/interest/[token]
   │        → write to CAMPAIGN CRM (source of truth) → notify founder (email + in-app)
   │   investor replies by email       ──▶  classifyAndDraftReply → same CRM + founder notify
   │
[ COMPLETION ]  when queue drained or admin marks complete
        → status=completed → send founder wrap-up (contacted N, interested M, deck opens…)
```

---

## 3. Data model (new tables)

Ledger-aware SQL migrations under `scripts/migrations/`, applied via
`scripts/oneshot/run-migration.mjs`. All `IF NOT EXISTS` / additive.

```sql
-- The public submission (one row per founder application)
founder_submissions (
  id, public_ref (short human code, e.g. ANK-8F3K),
  campaign_batch_id,                 -- which marketing campaign/wave
  startup_name, website, one_liner, sector[], stage,
  raise_amount, check_size_min, check_size_max, location,
  founder_name, founder_email, founder_linkedin, founder_title, team_json,
  traction_json, extra_fields_json,  -- everything else from the form
  deck_blob_key, data_room_keys[],   -- Vercel Blob (private)
  status,   -- received | assessing | assessed | declined | campaign_ready
            -- | outreaching | completed | failed
  assessment_score, assessment_json, decline_reason,
  startup_profile_id,                -- links to matching engine profile
  outreach_campaign_id,              -- links to the created campaign
  ip_hash, user_agent, created_at, updated_at
)

-- Assessment queue / audit (idempotent, resumable)
submission_assessment_jobs (
  id, submission_id, phase,          -- extract | readiness | match | draft | done
  status, attempts, batch_provider_id, error, created_at, updated_at
)

-- Per-campaign investor tracking CRM (campaign-scoped, exclusive)
campaign_crm_entries (
  id, outreach_campaign_id, submission_id,
  investor_id, firm_id, investor_email,
  match_score, match_rationale,
  stage,        -- queued | contacted | opened | interested | not_interested
                --        | meeting | passed
  contacted_at, opened_at, responded_at,
  interest_token_hash,               -- SHA-256 of one-click link token
  interest_choice, interest_at,
  founder_notified_at, notes, created_at, updated_at
)

-- One-click investor interest links (magic-link pattern from LP portal)
campaign_interest_tokens (
  token_hash PRIMARY KEY, campaign_crm_entry_id,
  choice_locked, expires_at, used_at, created_at
)

-- Founder-facing notifications (in-app + email fan-out log)
founder_notifications (
  id, submission_id, type,           -- interest | reply | milestone | complete
  payload_json, emailed_at, read_at, created_at
)
```

> Reuse note: `campaign_crm_entries` intentionally mirrors the vocabulary of the
> existing `crm_entries` / `match_outcome_events` so the learned-ranker outcome
> log and analytics keep working. Every stage transition also writes a
> `match_outcome_events` row via the existing `recordStageTransition()`.

---

## 4. Component plan (mapped to your requirements)

### 4.1 Public submission form — *on the website, not the platform*

- New **public** route group, e.g. `app/apply/page.tsx` (unauthenticated,
  website chrome — not under `app/dashboard`).
- Multi-step form: company → founders/team → traction/metrics → deck + data-room
  upload → review → submit. "Detailed for LPs and investors" = rich structured
  fields (sector, stage, round, check size, revenue/traction, team, links) so the
  matcher and drafts have real signal, not just a deck.
- Upload straight to **Vercel Blob (private)** — reuse the `saveArtifact()`/Blob
  path already in `lib/assistant/artifact.ts`. Enforce 25 MB/deck (matches
  existing `extract-profile` cap), whitelist PDF/PPTX.
- On submit → `POST /api/public/submit` → row in `founder_submissions`
  (status `received`) → **confirmation email** (§4.6) → thank-you screen with
  `public_ref` for status lookup.

### 4.2 Security & abuse defense (public endpoint)

The public endpoint is the one internet-facing attack surface, so it gets
defense-in-depth:

- **Rate limiting**: reuse `lib/rate-limit.ts`, keyed by hashed IP *and* by email,
  with a strict window (e.g. 3 submissions / IP / hour, 1 / email / 24h). Flag:
  the current limiter is in-memory/per-instance — for a public endpoint promote
  to **Upstash Redis** behind the same `rateLimit()` signature (the file already
  notes this swap). *Decision needed — see §9.*
- **CAPTCHA / bot check**: Cloudflare Turnstile or hCaptcha token verified
  server-side before the row is written. (Note: platform rules forbid *me*
  solving CAPTCHAs — this is us *requiring* one of submitters, which is fine.)
- **Payload caps**: max file size + type whitelist + max field lengths; reject
  early, before Blob upload.
- **Content safety**: store `ip_hash` + `user_agent`; dedupe by
  `(founder_email, startup_name)`; honeypot field; optional email
  ver/domain-MX check.
- **No secrets in the client**: submission writes nothing sensitive; assessment
  runs server-side only.

### 4.3 Batch assessment engine — *conservative, feedback-issuing*

New cron `app/api/cron/campaign-assessment` (CRON_SECRET-gated, `maxDuration=300`),
processing `received` submissions in **batches**:

1. **Extract** — `extractStartupProfile(deck + form fields)` →
   `StartupProfile` + founder profile. Form fields override/augment deck
   extraction (fields are higher-trust than OCR).
2. **Readiness score** — reuse `pitch-deck-analyzer` + a rubric prompt
   (team, market, traction, clarity, deck completeness). Produces
   `assessment_score` + structured `gaps[]`.
3. **Conservative gate** — a deliberately strict threshold. If below bar →
   `status=declined`, generate **constructive feedback** ("what to fix before
   re-applying") and send the founder a respectful decline email (§4.6). **No
   investor is ever contacted for a declined company.** This protects investor
   relationships (our scarcest asset) and is the single most important business
   rule in the engine.
4. **Match** — `runFounderMatching(startup, { maxContacts: ~100 })` →
   dimensional scoring already covers **sector, stage, check size, geography**
   (+ synonyms). Top ~100 by score become campaign members.
5. **Draft** — `generateBatch()` (or Anthropic **Message Batches API** for true
   async 50%-cheaper bulk at high volume) drafts one personalized email per
   investor: founder story + why-this-match rationale + deck link + signature.
6. **Assemble campaign** — create `outreach_campaign`, insert
   `campaign_crm_entries` + drafts, set `status=campaign_ready`; it now appears in
   the **Outreach tab** automatically.

**LLM batch strategy:** default to the concurrency-limited `generateBatch()`
(already provider-aware: 8 for Anthropic, throttled for others). For large waves,
add an adapter to Anthropic's **Message Batches API** (submit N requests, poll,
collect) — best fit for "heavy requirements … matchmaking, drafting" since these
are non-interactive and tolerate minutes of latency. Idempotency via
`submission_assessment_jobs.batch_provider_id`.

### 4.4 Progressive outreach + progress bar

- Reuse the **existing** `outreach-scheduler` cron + `outreach_campaign_schedules`
  `send_batch` action — it already flips drafts→queued in waves and a send worker
  emails them. We schedule waves (e.g. 20/day) at campaign start.
- **Progress bar**: derive `sent / total` per campaign from
  `campaign_crm_entries` counts (cheap aggregate, same pattern as the compliance
  badge). A lightweight `/api/outreach/campaigns/[id]/progress` returns
  `{ total, drafted, sent, opened, interested, done }`; the Outreach tab renders a
  bar + live counts per campaign.
- **Analytics**: reuse `app/api/outreach/analytics` + `match_outcome_events`;
  surface per-campaign sent / open-rate / reply-rate / interested-count and a
  funnel.

### 4.5 Notification loop — investor → founder, CRM-first

- Each outreach email embeds two signed one-click links:
  `…/api/public/interest/[token]?c=yes|no`. Token = plaintext once, **SHA-256
  stored** (`campaign_interest_tokens`), reusing the LP-portal minting/revocation
  code.
- **CRM-first (recommended):** the click updates `campaign_crm_entries`
  (`interest_choice`, `stage=interested|not_interested`) → writes
  `match_outcome_events` → **then** fans out a `founder_notifications` row +
  founder email. My CRM stays the single source of truth; the founder always sees
  what I see. (Alternative — notify founder directly and sync CRM after — is
  faster to build but risks drift; not recommended.)
- Email replies flow through the **existing** `classifyAndDraftReply()`
  (INTERESTED / WRONG_FIT / …) into the same CRM + notification path, so both the
  link path and the reply path converge on one place.
- Founder notifications: email immediately on *interested*; batch the rest into a
  daily digest to avoid noise.

### 4.6 Lifecycle emails (all signed)

Transactional via `sendEmail({ noTracking: true })`. Shared **signature block**
helper injected into every founder- and investor-facing send:

```
Philippe M. Masindet
Founder, Anker AI
beetlesflying@gmail.com
https://www.linkedin.com/in/philippe-m-masindet/
```

| Trigger | Recipient | Content |
|---|---|---|
| Submission received | Founder | Confirmation + `public_ref` + what happens next |
| Assessed: not ready | Founder | Respectful decline + specific, constructive feedback |
| Investor interested | Founder | Immediate alert + investor context + next step |
| Campaign complete | Founder | Wrap-up: contacted N, opened X, interested M, next steps |
| Outreach | Investor | Founder story + deck + Interested/Not links + signature |

### 4.7 Per-campaign exclusive CRM

- `campaign_crm_entries` scoped by `outreach_campaign_id` → each campaign has its
  own board of "every investor already contacted" with stage, interest, timestamps.
- A new **Campaign CRM view** in the platform (reuse `app/api/crm` board/view
  rendering) filtered to one campaign; the founder sees a read-only slice via a
  portal token (LP-portal pattern) if we choose to expose it.

---

## 5. Orchestration & state machine

`founder_submissions.status` is the spine:

```
received → assessing → assessed ─┬─▶ campaign_ready → outreaching → completed
                                 └─▶ declined (terminal, feedback sent)
                    (any) → failed (retryable; job queue backs off)
```

- Two crons drive it: **campaign-assessment** (received→campaign_ready|declined)
  and the existing **outreach-scheduler** (outreaching→completed).
- Everything is **idempotent + resumable** (`submission_assessment_jobs`), so a
  timeout or redeploy mid-batch never double-sends or loses a submission — the
  same discipline already used by `outreach_campaign_schedules`.
- Admin controls in the Outreach tab: pause/resume, force-complete, re-run
  assessment, edit drafts before the first wave.

---

## 6. Phased rollout (realistic for a next-week launch)

A fully autonomous engine is **not** a one-week build. Recommendation: ship a
**human-in-the-loop MVP** for the first campaign, then automate. This de-risks the
launch and lets us watch the assessment gate and email quality before it runs
unattended.

### Phase 0 — First campaign MVP (this week)  ← BUILT ✅ (2026-07-25)
- [x] Public `app/apply` form + `/api/public/submit` + in-memory rate limit +
  honeypot + Turnstile hook (enforced when configured). Status page `/apply/status/[ref]`.
- [x] `founder_submissions` (+ 4 supporting tables) migrated; Blob upload;
  signed confirmation email.
- [x] `campaign-assessment` cron: extract → readiness → **automatic conservative
  gate** (auto-decline + feedback email, or auto-proceed) → dimensional match →
  batched draft → campaign.
- [x] `campaign-send` cron: **small progressive waves**; deck link + one-click
  Interested/Not links + signature; wrap-up email on completion.
- [x] Interest loop (`/api/public/interest/[token]`): CRM-first — view/yes/no →
  campaign CRM → `match_outcome_events` → founder alert.
- [x] Control room `/dashboard/campaigns`: progress bars, funnel, per-campaign
  investor CRM, pause/resume/force-complete.
- Founders submit → get confirmed → engine auto-assesses, auto-matches, and
  auto-launches outreach end-to-end, no human step.
- **Not yet done:** deploy to production; Turnstile keys; tune the readiness
  threshold on real decks; link `/apply` from the marketing site nav.

### Phase 1 — Automation (week 2)
- `campaign-assessment` cron (batch, conservative auto-gate + auto-feedback).
- Interest one-click links + CRM-first notification loop + founder alerts.
- Per-campaign CRM view + completion wrap-up email.

### Phase 2 — Scale & intelligence (week 3+)
- Anthropic Message Batches API for high-volume drafting/assessment.
- Redis-backed global rate limit; queue backpressure.
- Full analytics dashboard per campaign; feed `match_outcome_events` into the
  learned ranker; A/B email templates; deck open-tracking → auto follow-up nudge
  (existing `send_openers_nudge`).

---

## 7. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Auto-sending to investors for a weak startup burns our investor goodwill | High | Conservative gate + **Phase 0 human review** before any send; strict readiness threshold |
| Public endpoint abused (spam/DoS/upload bombs) | High | Redis rate limit + Turnstile + size/type caps + honeypot + IP hashing |
| Email deliverability / spam flagging at volume | High | Progressive waves (existing scheduler), warmed domain, `noTracking` on transactional, SPF/DKIM/DMARC check before launch |
| LLM batch cost/latency at scale | Med | `generateBatch` concurrency caps now; Anthropic Batches API (‑50%) in Phase 2 |
| Mismatched/embarrassing personalization | Med | Draft-review step in Phase 0; quality checks (`email-quality.ts`) before queueing |
| PII of founders/investors mishandled | High | Private Blob, no PII in URLs/query strings, tokens hashed at rest, decline feedback not shared with investors |
| Serverless function bloat (recent deploy hit 250 MB) | Med | Keep heavy data out of function bundles (`.vercelignore` + `outputFileTracingExcludes`) |

---

## 8. Reused files & new files (build map)

**New (net):**
- `app/apply/**` (public form) · `app/api/public/submit/route.ts` ·
  `app/api/public/interest/[token]/route.ts` · `app/api/public/status/[ref]/route.ts`
- `app/api/cron/campaign-assessment/route.ts` (+ `vercel.json` entry)
- `lib/campaign/assessment.ts` (gate + rubric) · `lib/campaign/orchestrator.ts` ·
  `lib/campaign/interest-tokens.ts` · `lib/email/signature.ts` ·
  `lib/email/founder-lifecycle.ts`
- `app/api/outreach/campaigns/[id]/progress/route.ts` + Campaign CRM view UI
- Migration: `scripts/migrations/2026-07-2x-founder-campaign-engine.sql`

**Reused (wire, don't rebuild):**
- `lib/matching/v2/founder-engine.ts`, `founder-scoring.ts`,
  `document-extractor.ts` · `lib/ai/provider.ts` (`generateBatch`),
  `pitch-deck-analyzer.ts`, `reply-handler.ts` ·
  `app/api/cron/outreach-scheduler`, `outreach_campaign_schedules` ·
  `lib/email/resend.ts` · `lib/rate-limit.ts` · LP-portal token code ·
  `lib/matching/outcome-events.ts`

---

## 9. Decisions (locked 2026-07-25)

1. **Assessment gate → FULLY AUTOMATIC.** The conservative gate auto-declines
   (with feedback email) and auto-launches outreach with no human approval step.
   → Phase 0 drops the manual-review gate; the threshold is set **strict** and the
   first campaign's sends still go out in **small progressive waves** so we can
   watch early results and pause from the Outreach tab if needed. Gate threshold
   and the decline-feedback template are the two things to tune before go-live.
2. **Rate-limit backend → IN-MEMORY** (`lib/rate-limit.ts`, existing). Reused as-is
   for the public endpoint; combined with Turnstile + size/type caps + honeypot.
   Revisit Redis in Phase 2 if abuse or scale demands a hard global limit.
3. **CAPTCHA → Cloudflare Turnstile** (server-verified token before any row write).
4. **Interest flow → CRM-FIRST.** Investor click updates `campaign_crm_entries`
   (source of truth) → writes `match_outcome_events` → then notifies the founder.
5. **Investor cap → score floor, cap at 100** (skip weak matches even under 100).
6. **Founder visibility → email updates (Phase 1), portal view (Phase 2).**
7. **Deck delivery → private tracked link** (open-tracking → auto-nudge); attach
   PDF on request.

> Build status: Phase 0 code-complete 2026-07-25 (submission front-door +
> assessment engine + progressive sender + interest loop + control room). All
> migrations applied; typecheck clean; 53 tests green. Pending: production
> deploy, Turnstile keys, readiness-threshold tuning. Phase 1 next: founder
> portal view of the campaign CRM, deck open→auto-nudge, richer analytics.
```
