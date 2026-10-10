# 37 — Anker as the agentic ERP for venture capital: status, gaps and spec

**Date:** 2026-10-03 (third edition: the open items of the second edition were verified; §18 is the verification log, §17 the revision notes) · **Status:** assessment
and spec, nothing built · **Companion:** [38](38-sail-monitoring-and-admin.md) (SAIL, the monitoring and admin plane) ·
**Builds on:** [00](00-persona-isolation.md) persona isolation, [28](28-assistant-system-design.md) assistant runtime,
[29](29-agentic-core.md) agentic core, [30](30-ai-observability.md), [33](33-cost-ceiling.md),
[35](35-ai-availability-qwen-first.md) · **Prior work this spec must not contradict:**
[`docs/platform-audit-2026-09.md`](../platform-audit-2026-09.md), [`docs/assessments/`](../assessments/),
[`docs/anker-agent-tooling-expansion.md`](../anker-agent-tooling-expansion.md),
[`docs/anker-agentic-deepseek-plan.md`](../anker-agentic-deepseek-plan.md),
[`docs/metal-feature-gap.md`](../metal-feature-gap.md), [`docs/carta-parity-plan.md`](../carta-parity-plan.md)

**Rule for this document:** every claim in §2 was read from the repository, the production database (read-only
counts) or production behaviour on 2026-10-03, and says which. Anything not verified is marked *(unverified)*. Every
proposal from §5 on closes a gap named in §3.

---

## 0. The goal, stated so it can be tested

> Anker is the **system of record** and the **operator** for a venture firm and for the companies and investors around
> it: it holds the facts, and software agents do the routine work on them, under rules the humans set, with every
> action explained and reversible.

"ERP" is the system-of-record half. "Agentic" is the operator half: agents that **read** all of it, **propose** work, and
**commit** the work a human has authorised, instead of a chat window that writes answers.

The test is not "has an assistant". It is: **a week of a firm's routine work is done by agents, and the partner reviews
exceptions instead of doing the work.** §12 turns that into numbers.

| Persona | The firm's job Anker takes on |
| --- | --- |
| **Founder** | Run the raise: find and rank investors, run outreach, keep the pipeline and data room current, model the round |
| **VC fund manager (GP)** | Run the fund: deal flow to IC, portfolio monitoring, LP reporting and capital calls, compliance and KYC |
| **LP** | Watch the capital: positions, distributions, documents, questions answered from the fund's own records |

### 0.1 What "ERP" has to mean here (the completeness checklist)

An ERP is judged by its primitives, not its screens. For a venture firm the checklist is below; "status" is from §2.

| Primitive | What it requires | Status |
| --- | --- | --- |
| Ledger of record | Double-entry, event-sourced, reproducible, period close | **Built** (event-sourced fund GL, idempotent rebuild, trial balance nets to zero; 46 journal entries in production). Capital-account reconciliation exists in `capital-account.ts`; period close and a lock on closed periods: not found |
| Maker–checker | A second person approves consequential changes; segregation of duties | One approval step exists (legal-document fields, `legal/fields/approve`); **none found for capital calls or distributions** (the R3 two-person rule is a requirement here, §5.1) |
| Roles and permissions | Per-module, per-action, per-entity | Workspace roles and persona guards: **built**. Per-action matrix: partial |
| Document control | Versioned, access-logged, watermarked, retained | Data room with grants and view logs: built; **0 files in production** |
| Audit trail | Every change, who, what, before/after | Wired in fund modules, **0 rows** (§2.4); not wired for CRM, outreach or agent actions |
| Workflow engine | States, approvals, SLAs, reminders | Per-module ad hoc; no shared engine |
| Integration layer | Bank, e-signature, KYC screening, accounting, email, calendar | **Verified (§11, §18):** live are Resend, Vercel Blob, Qwen/OpenAI/Mistral, LinkedIn extension; wired in code but **not live** are Stripe webhooks, reply detection, DocuSign, KYC screening, Twenty, Companies House; none exist for bank, accounting, calendar |
| Reporting | LP reports, tear sheets, regulatory exports | Built (portfolio reporting, quarterly reports); depends on data being present |
| Single customer record | One identity across modules | **Absent** (§5.3) |
| Multi-entity | Funds, SPVs, management company | Funds and SPVs modelled; **0 SPVs in production** |
| Data import/export | Bulk in, portable out | Imports built (directory drop importer); customer data export/portability: not found |

---

## 1. What this document is not

- Not a rewrite. The loop, the router, the matching engine and persona isolation work; §5 adds layers around them.
- Not a feature list. A module is judged by one question: can an agent read it, propose against it, and be stopped by a
  policy? If not, it is not yet part of the ERP.
- Not a marketing document. Where a public claim is not true, this spec says so (§8.1).
- Not about SAIL. That is [38](38-sail-monitoring-and-admin.md); §6.4 lists only what Anker must expose to it.

---

## 2. Where Anker stands (verified 2026-10-03)

### 2.1 Size and shape

| Fact | Evidence |
| --- | --- |
| ~2,040 tracked files; 207 pages, 407 API routes | `git ls-files` |
| 3 personas; ~45 dashboard modules | `app/dashboard/*`, `lib/nav/work-areas.ts` |
| 118 migration files plus setup scripts (about 170 `CREATE TABLE` statements); the September audit counted 236 tables in the live database | `scripts/`, audit §1 |
| 15 scheduled jobs (outreach, campaigns, deliverability, signals, verification, directory, ranker, uploads sweep) | `vercel.json` |
| 109 test files, ~1,070 tests, including in-process Postgres integration tests for authorization; **unit and integration tests run only from `lib/**`** — no component, route-handler or end-to-end test exists | `vitest.config.ts`, `*.integration.test.ts` |
| CI: typecheck, redaction scan, vitest, production build; a push to `main` deploys | `.github/workflows` |
| Directory: 20,998 firms, 50,000 people | production |
| 37 design documents; 10 of them (27–36) written since 2026-09-26; plus the audits listed above | `docs/` |

### 2.2 Production reality (read-only counts, 2026-10-03)

This is the most important table in the document, and the first draft left it out.

| Measure | Value | Reading |
| --- | --- | --- |
| Organizations / memberships | 12 / 12 (11 founder, 1 VC, **0 LP**) | A pilot-scale install |
| Active users, last 30 days (distinct users with chat activity) | **2** | Mostly the owner and tests |
| Paying: `billing_subscriptions`, `billing_customers` | **0, 0** | No revenue; Stripe is wired in test mode |
| Credit ledger | grants only; **nothing debits credits** | Plans and credits are not enforced (§7.3) |
| `crm_entries` / `outreach_messages` / `outreach_campaigns` | 12,584 / 2,153 / 11 | The outreach loop has been run at volume, largely by the owner's own campaigns |
| `founder_submissions` / `founder_match_runs` / `match_outcome_events` | 13 / 27 / 2,092 | Founder matching has real exercise |
| `ai_calls` | 3,115 total; last 7 days 584 calls, **565 ok (96.7%)**, 19 failed | The failures are exactly what SAIL should surface |
| `anker_chats` / `anker_chat_events` | 73 / 298 | Light assistant use |
| `funds`, `fund_lps`, `capital_calls` (+ line items), `distributions` (+ line items), `journal_entries`, `kyc_cases` | 2, 8, 4 (32), 3 (24), 46, 9 | Fund OS has been exercised on an early fund (8 LPs); the September audit's empty line items are now backfilled |
| `portfolio_companies`, `deals`, `spvs`, `ic_memos`, `valuations_409a`, `data_room_files`, `decks`, `investor_calls`, `investor_updates`, `lp_entities` | **0 each** | The VC deal-to-IC loop, the data room, decks, calls, updates and LP entities have never run with data |
| `agent_runs` | **0** | See §2.4 |
| `audit_events` | **0** | See §2.4 |
| `email_suppressions`, `notifications` | 0, 0 | No suppression has ever been recorded; no one is notified of anything |
| `early_access_requests` | 2 | The form writes (an audit worry now closed) |

**Reading.** Anker has built roughly three products' worth of engine and has roughly one product's worth of use, which is
the September audit's conclusion and is still true. An agentic ERP cannot be designed in a vacuum on a system with no
real fund data in it: the first requirement of this spec is that **real firms use it** (§7.1, Phase A).

### 2.3 Depth by area (measured by library code, not by page size)

The first draft judged depth by page line counts, which is wrong: pages are thin wrappers and the work lives in `lib/`.
Non-test TypeScript lines by area:

| Area | Lines | Reading |
| --- | --- | --- |
| `lib/portfolio` (Fund OS: ledger, calls, distributions, capital accounts, reporting, fund performance) | **16,900** | The deepest module by far |
| `lib/matching` (founder and LP engines, extraction, dedup) | 10,100 | Strong and exercised |
| `lib/ai` (router, lanes, OCR, failures) | 8,200 | Strong |
| `lib/outreach` + `lib/linkedin` + `lib/campaign` | 6,400 + 2,100 + 800 | Strong, the revenue-shaped loop |
| `lib/assistant` (loop, tools, policy, events) | 4,700 | Strong |
| `lib/modules` (409A OPM, waterfall, vesting, SPV economics, KYC, loans) | 2,000 | Real engines, small |
| `lib/decks`, `lib/dataroom`, `lib/crm`, `lib/contracts` | 900, 650, 860, 330 | Modest |
| `lib/calls`, `lib/network`, `lib/updates`, `lib/signals`, `lib/planning`, `lib/compliance`, `lib/compensation`, `lib/forecasting` | 300, 180, 90, 90, 70, 120, 100, 60 | **Genuinely thin**: these are the "ERP" areas that are screens over little logic |

So the corrected picture is: **Fund OS is deep; founder fundraising is deep; compliance, forecasting, compensation,
signals, updates, calls and planning are thin.** The ERP claim is strongest on the fund ledger side and weakest on
compliance and forecasting.

### 2.4 What is real, and what is wired but empty

**Live and used:** founder matching (deck → profile → engine v3 → workbook, with mandate filters, dedup, headroom
grading, verified answer blocks), the outreach and LinkedIn engine (caps by warmed-up sender, suppression, approval
gate that never auto-sends), the founder application campaign (`/apply` → assessment → matching → waves), the AI platform
(Qwen-first lanes, typed failures, per-run cost ceiling, call log, attachments to private blob storage, OCR, web search),
persona and workspace isolation.

**Wired but empty (and so unproven):**

- **`audit_events` has 0 rows.** Writers exist in fund modules (capital calls, distributions, KYC, 409A, share plans,
  listings, information sharing) through `recordChange`, and no such change has happened. **Nothing audits assistant,
  CRM, outreach or agent actions.** The audit trail exists on paper for the modules nobody has used.
- **`agent_runs` has 0 rows.** It is written only by `outreach-agent.ts`'s `tick`, which no cron calls (the scheduled
  jobs are `outreach-scheduler` and friends). The "agent runtime" the first draft proposed to extend is a table nothing
  currently fills.
- **No `/api/impersonate/accept` exists in Anker.** SAIL mints view-as grants (1 minted, 0 used) and builds a link to a
  tenant endpoint that is not there. View-as is not functional (§38).

**Absent:**

- **No governed write path for agents.** `crm_update_stage`, `crm_add_task`, `enrich_firms`, `build_investor_profile`
  are on the `BLOCKED` list in `lib/assistant/policy.ts` "pending a separate human-reviewed workflow" that does not
  exist: no proposals table, no approval inbox. Doc 28 G4 is design only. Agents read, research, draft and rank; the only
  commits are `send_outreach` (write-permission gated) and `match_investors` (saves a run).
- **No general agent runtime;** two bespoke background agents exist (outreach tick, campaign engine).
- **No entity memory;** what the assistant knows is what its tools return that turn plus a transcript.
- **No evaluation harness.** Docs [`anker-agentic-deepseek-plan`](../anker-agentic-deepseek-plan.md) §6 planned one for
  its Phase 3; it was not built. Quality is checked by hand in a browser.
- **No cross-entity identity;** firm, person, deal, LP and portfolio company are separate tables joined ad hoc.
- **No MFA or SSO** in Anker (the audit's finding stands; the false claims were removed from the site, §8.1).
- **No entitlement enforcement** (§7.3) and **no data-subject-request tooling** (§8).
- **`ai_calls` has tokens, workspace, duration and provider but no cost column and no run id** (verified from the
  migration). Per-run spend exists only in memory during a run; historical cost per tenant and a call-to-run link do not
  exist. The trace the spec asks for needs both.

### 2.5 What the September audit found, and its status today

| Audit finding (`platform-audit-2026-09.md`) | Status 2026-10-03 |
| --- | --- |
| Landing page claimed SOC 2 Type II "Certified", 2FA, SSO | **Removed** (verified in `security-section.tsx`, `product-mockups.tsx`) |
| 11 of 12 "data integrations" logos decorative | **Closed on the live site.** The metrics, integrations, security, developers, testimonials and pricing sections are no longer imported by any page (dead components); 20 public routes were crawled and none carries a logo marquee, a certification, or an inflated count (§18) |
| 60,000 investors / 40,000 LPs overstated | **Closed on the live site** (no such figure on any crawled page). The false strings remain in the unused components and should be deleted so they cannot return |
| Signals, calls, updates unreachable in the app nav | **Fixed** (in `work-areas.ts`) |
| Fund GL never materialised; capital-call line items empty | **Fixed** (46 entries; 32 and 24 line items) |
| `deals` and `pipeline` legacy duplicates | Redirects in place |
| Early-access form might not write | **Closed** (2 rows) |
| LP onboarding absent, LP persona 3 pages | **Open** |
| Run one full cross-persona loop with real data | **Open** (0 portfolio companies, 0 IC memos) |
| Instrument activation | **Done 2026-10-03, derived not tracked**: SAIL `/activation` reads the funnel (profile, match, draft, send, reply), loop completion, time to first match and WAU/MAU from tables the product already writes; retroactive. Limit: active = AI, outreach or CRM activity, not page views |
| Invented performance statistics on the site | **Closed on the live site** (none on any crawled page) |
| *New:* the Terms name Supabase, Vercel, Anthropic, OpenAI, Google, Alibaba, Resend and Blob but not **Mistral** (a live key) or **Stripe**; the privacy policy names Anthropic and Google, for which no key exists | **Open**: make the public sub-processor list match the register (§8.4) |
| *New:* there is no `/pricing` page (404) | Consistent with unvalidated pricing (§7.2) |

### 2.6 What broke in production this week

| Event | Root cause | What it shows |
| --- | --- | --- |
| Founder matching returned a bare 504 for two runs | An all-pairs name comparison in firm clustering: 24 s at 4,000 firms, minutes at 21,000 | No test at directory scale |
| The 504 left one log line | No structured application logging inside a run | A hung run could not be diagnosed from outside |
| Deck reading ran before the run's clock started | Two budgets, not one | One time budget per request |
| `web_search` never worked in production | Pointed at a localhost search engine | Production dependencies never checked from a real deploy |
| 75 firms all scored "100" | Four components saturated at 1.0 | Ranking quality judged by eye on one case |
| A model said "scored 40" when 37 existed | Model prose trusted over the tool's count | Free text is not a source of truth |
| 772 import conflicts; 35 same-name firms folded into others | Name-only identity matching; no review workflow | Directory identity needs a service |

None were model failures. They are **missing platform properties**.

### 2.7 Verdict

Anker is a strong **founder-fundraising product with an AI research and matching core**, a **deep fund-ledger engine
that has never run on real fund data**, and thin compliance/forecasting/compensation layers. It has no paying
customers, about two active users, no governed way for an agent to change a record, and no enforcement of plans. The
distance to §0 is therefore two kinds of work in a fixed order: **(1) make it used and true** (customers, honest claims,
metering, compliance), and **(2) add the platform layers** (§5) that turn the assistant into an operator. Doing (2)
without (1) builds an operator for a firm that does not exist.

---

## 3. The gaps, ranked

| # | Gap | Why it blocks the goal | Closed by |
| --- | --- | --- | --- |
| G0 | No design partners; no real fund or paying customer | Nothing can be proven; the spec would be fiction | §7.1, Phase A |
| G1 | Agents cannot change records through any governed path | Without it Anker is a research tool | §5.1 |
| G2 | No approval inbox, no autonomy policy | Humans cannot safely delegate | §5.1, §5.2 |
| G3 | No agent runtime (triggers, durable runs, resume); `agent_runs` unused | Each agent is bespoke | §5.2 |
| G4 | No traces: no run id on calls, no cost column, no structured logs | Cannot debug, cost or audit a run | §5.4 |
| G5 | No evals or canaries | Silent quality loss; regressions found by users | §5.4, §10 |
| G6 | No entity identity or memory | Modules cannot share facts | §5.3 |
| G7 | Directory data quality (dupes, conflicts, freshness, provenance, licence) | Matching quality is capped by data quality; legal exposure | §5.3, §8.2 |
| G8 | Thin areas (compliance, forecasting, compensation, signals, updates, calls, planning) are screens | A VC cannot run a fund week on them | §6 |
| G9 | No scale/perf budget in CI | The 504 class returns | §10.1 |
| G10 | Two operator consoles | Duplicated effort | [38](38-sail-monitoring-and-admin.md) §4 |
| G11 | Entitlements and metering not enforced; credits never debited | No revenue path | §7.3 |
| G12 | No data-subject-request, retention or erasure tooling; the privacy policy does not cover the 50,000 third-party person records | Legal exposure as controller | §8.2 |
| G13 | Outreach carries no `List-Unsubscribe` header; legal basis for cold B2B email per jurisdiction unreviewed | Deliverability and legal exposure | §8.3 |
| G14 | AI processing sends confidential deal documents to third-country providers by default; no per-tenant provider policy | Blocks confidential VC use | §8.4 |
| G15 | No MFA/SSO; no SOC 2 | Blocks enterprise and institutional LPs | §8.5 |
| G16 | Agent-specific threat model absent (prompt injection via crawled pages, uploads, inbound mail) | A write-capable agent multiplies the impact | §9 |
| G17 | Testing stops at the library boundary; migration ledger drifts; no restore drill | Releases are riskier than they look | §10 |
| G18 | LP persona is 3 pages with no onboarding | The three-persona thesis has a missing leg | §6.3 |
| G19 | Activation is not instrumented | Cannot decide what to cut or build | §12 |

---

## 4. Principles (the rules every phase obeys)

1. **The tool decides facts; the model decides words.** Counts, scores, names and amounts in an answer come from a tool
   result and are rendered from it. *(True for matching and scoring today; becomes true for every tool.)* This is the
   "sealed engine computes, a person approves only what doesn't tie" principle of
   [`anker-agent-tooling-expansion`](../anker-agent-tooling-expansion.md), generalised.
2. **Read freely, propose by default, commit under policy.** Every capability is read, propose or commit (§5.1).
3. **Every action is explainable and reversible.** What, by which agent, on whose authority, from which inputs, and how to
   undo it. Irreversible actions are never autonomous by default.
4. **Humans own autonomy.** Owners set it per action class; the platform can only lower a ceiling.
5. **One budget per request, one trace per run.** Time, calls and money bounded together; every run leaves a trace.
6. **Scale is a test, not a hope.** Anything touching the directory is tested at directory size.
7. **A module is part of the ERP when an agent can read it, propose against it, and a policy can stop it.**
8. **Isolation is a precondition.** Persona and workspace scope keys, the owner firewall and redaction rules
   ([00](00-persona-isolation.md), [23](23-redaction-check.md)) are never traded for convenience.
9. **Claims integrity.** Nothing public (site, deck, docs, in-app) states a capability, certification, integration or
   number the platform cannot show. A claims register with an owner and a measured source is part of release (§8.1).
10. **Disclose side effects before they happen.** An action that emails or messages real people states how many and who
    before it runs, and a safe mode exists. (A founder-application "re-assess" emails the applicant every time; testing
    must never do that to a real applicant.)
11. **Treat every external input as hostile.** Web pages, uploaded files, inbound email and LinkedIn messages are data,
    never instructions, and can never by themselves authorise an R1–R3 action (§9).

---

## 5. Target architecture: five layers around the existing core

```
 Surfaces   web app · assistant · Anker AI · MCP · email · browser extension
 ─────────────────────────────────────────────────────────────────────────────
 Governance   policy (autonomy levels) · approvals · audit · cost ceiling · evals · claims register
 Agent runtime   definitions · triggers · durable runs · memory · scheduling
 Action layer   typed capabilities: READ · PROPOSE · COMMIT, idempotent, reversible
 System of record   entity graph · event log · documents · directory · ledger   (existing tables)
```

### 5.1 The action layer: capabilities and proposals (G1, G2)

Every operation an agent can perform is a **capability** with a typed input schema (the bounds in
`lib/assistant/tool-schemas.ts` already enforce this), declared once:

| Kind | Meaning | Example |
| --- | --- | --- |
| `read` | No side effect | `crm_search`, `fund_performance`, `query_investors` |
| `propose` | Produces a **proposal**: the exact change, its evidence and its diff, stored, not applied | "move 14 contacts to *Contacted*", "draft capital call #7", "merge these two firms" |
| `commit` | Applies an approved proposal (by a human or by standing policy), idempotently, with an undo record | the same, after approval |

**`action_proposals`** (new): `id`, `workspace`, `persona`, `capability`, `input`, `diff` (human-readable and
machine-applicable), `evidence` (references to tool results and records, not copies), `risk_class`, `agent_run_id`,
`status` (`pending | approved | rejected | applied | undone | expired`), `decided_by`, `decided_at`, `applied_at`,
`undo`, `idempotency_key`, `source_trust` (whether any input came from untrusted content, §9).

**Risk classes** set the default; owners can only tighten, or loosen within a ceiling:

| Class | Examples | Default |
| --- | --- | --- |
| R0 internal, reversible, own data | tag, create a task, move a CRM stage, attach a note | propose; auto-commit only after the owner enables the class; always logged |
| R1 internal, bulk or structural | merge firms, bulk stage move, directory import, rebuild a profile | propose, one-click approve |
| R2 external to a third party | send an email or LinkedIn message, publish an update | propose; approve per batch; rate limits, suppression, sender caps and `List-Unsubscribe` enforced; **never auto-commit** |
| R3 money, legal, regulatory | capital call, distribution, KYC decision, filing, signature | propose only; maker–checker (two people) where the fund requires it; never autonomous |

An action whose inputs include untrusted content (a crawled page, an uploaded file, an inbound message) is **capped at
R0 auto-commit** whatever the setting; anything above R0 needs a human to see the evidence (§9).

The `BLOCKED` set becomes the first `propose` capabilities (`crm_update_stage`, `crm_add_task`, `enrich_firms`,
`build_investor_profile`), so blocked work starts working under governance instead of being unblocked blindly.

**Approval inbox.** One queue per workspace: pending proposals grouped by run, with the diff and evidence;
approve / edit / reject / "always allow this class". Staff see a roll-up in SAIL ([38](38-sail-monitoring-and-admin.md)
§3.3).

**Audit.** Every proposal state change and every commit writes `audit_events` (the table exists with zero rows; making it
carry assistant, CRM and agent actions is a Phase 1 deliverable, closing the §2.4 gap).

### 5.2 The agent runtime (G3)

An **agent definition** is data, not a route: `id, persona, goal, tools (capabilities), policy (risk ceiling, budget),
triggers [schedule | event | manual | inbound-message], inputs, outputs, success check`.

The runtime provides trigger dispatch (a cron fan-out plus an event bus over the existing event log); **durable runs**
(state in `agent_runs`, which finally gets writers, and the chat event log; resumable after a crash; one request clock);
a **plan step** written first so a person can read intent before action; **memory** (§5.3); per-definition **budgets**;
a **dry-run** mode that executes everything except `commit`; and a **kill switch** per definition and per workspace. The
two bespoke agents are re-expressed as definitions with no behaviour change.

### 5.3 Entity identity and memory (G6, G7)

- **Entity graph.** One `entities` identity (type, canonical id) for firm, person, company, fund, LP, deal; existing
  tables keep their rows and gain `entity_id`. **Identity resolution is one service** using the rules proven this week
  (accent folding, acronym and former-name aliases, initials, website host, same-name collision guard) with a **review
  queue** for what it will not decide. The import conflicts (716 still open) become that queue.
- **Provenance on every field:** where from, when, how sure; extend the founder profile's per-field provenance to
  directory fields, and add **source and licence** per import batch (§8.2).
- **Entity memory:** `(entity, key, value, source, confidence, valid_until)`, workspace-scoped, written only through
  `propose`; a person-edited memory is pinned. **Memory is tenant data**: never shared across workspaces, never used to
  train, covered by erasure (§8.2).
- **Freshness:** `verified_at` and `activity_at` per record; stale records down-weighted in ranking and queued for
  re-verification by an agent.

### 5.4 Governance: traces, evals, budgets (G4, G5, G9)

- **Run traces.** Add `run_id` to `ai_calls` and to tool-call records; add a **cost** column computed at write time from
  tokens and the catalogue price (priced or explicitly unpriced); store, per run, the plan, each model call (provider,
  model, lane, tokens, cost, latency, outcome), each tool call (input hash, duration, result size, error), every proposal
  made, the request clock at each step, and the final answer. **Streamed calls record too** (doc 30's open finding).
  Application logs carry the run id so a platform-level timeout is still attributable.
- **Evals.** A versioned golden set (`evals/`), starting from cases run by hand: a matching run for a pre-seed healthcare
  deck, a US-VC-sports mandate, a Germany climate search with a stated country, the count-claim correction, an import
  that must add nothing on re-run, a prompt-injection case (§9). Cases assert invariants (no duplicate firm; scores
  strictly ordered; count equals tool count; location required; no unstated check size used; no R1+ action from untrusted
  input), not text. Run on every deploy against production data read-only and nightly; results stored and charted in SAIL.
- **Scale budget in CI.** A directory-sized fixture (21,000 firms) and a time budget on every function that touches it.
- **Dependency checks.** Nightly and on deploy: every external dependency a feature names (search, OCR, email, DNS,
  model lanes) answers from the production runtime, reported to SAIL.
- **Spend.** Per-run ceiling exists ([33](33-cost-ceiling.md)); add per-workspace daily ceilings and a platform alert.

### 5.5 Entitlements and metering (G11)

Plans are defined once (features, limits, credits); a single `can(workspace, feature)` and a single
`meter(workspace, unit, qty)` are called by every capability. AI runs debit credits from the ledger at the cost recorded
in §5.4; exhausted credits degrade to the free lane or stop with a clear message, never an error. SAIL edits plans and
overrides per tenant ([38](38-sail-monitoring-and-admin.md) §3.6).

### 5.6 Surfaces

The assistant and Anker AI stay the conversational surface; the **approval inbox** and **run timeline** become
first-class; MCP (`POST /api/mcp`, multi-tenant token map) and the browser extension call the same capabilities and so
inherit policy; email-in comes later. WebMCP exposes page tools and must respect the same gate.

---

## 6. The modules, as agent jobs

### 6.0 Module depth, measured (library lines, API routes, rows in production)

Library size alone was a weak proxy, so each module was checked on four signals (2026-10-03): non-test library lines, API
routes, rows in its tables in production, and whether a test file exists for its library files. *Test counts are a lower
bound (matched by file name).* No module was clicked through in the browser, so UI-level workflow quality is still
unverified; the table says what the code and the data show.

| Module | Lib lines | API routes | Production rows | Verdict |
| --- | --- | --- | --- | --- |
| Fund ledger / Fund OS | 16,937 | 96 | 2 funds, 8 LPs, 4 calls, 3 distributions, 46 journal entries, 8 valuation snapshots | **Deep and exercised** on one early fund; 8 test files |
| Founder matching, outreach, LinkedIn network | 10,100 + 6,400 + 2,100 | many | 27 match runs, 286 sent messages, 12,584 CRM entries, 1,988 LinkedIn connections, 9 extension tokens | **Live** |
| Market signals | 86 | 1 | 600 | **Live** (a thin engine, working cron) |
| Compliance calendar | 120 | 2 | 27 items, 14 deadlines | **Used lightly**; thin |
| KYC/AML | 427 | 6 | 9 cases, 6 watchlist, 0 screening hits | **Workflow used, screening not live** (no provider key) |
| Deal pipeline / IC | 732 | 13 | 0 deals, 9 deal documents, 0 IC memos | Built, never run |
| Data room | 1,446 | 4 | 0 files, 1 document, 1 grant | Built, almost unused |
| LP portal | 902 | 17 | 1 token, 0 positions, 0 reports | Built, unused |
| Cap table, share plans, 409A | 355, 285, 222 | 6, 5, 2 | 0 pools, 0 grants, 0 valuations | Engines with no data |
| SPVs, loans, contracts | 311, 300, 327 | 7, 6, 3 | 0, 0, 0 (no e-signature configured) | Built, unused |
| Decks / studio | 922 | 12 | 132 templates, 0 decks | Built, unused |
| Call intelligence, investor updates | 303, 94 | 10, 4 | 0, 0 | Built, never run (calls has 12 test files) |
| Forecasting, planning, compensation, equity filings | 64, 74, 96, 120 | 2, 1, 2, 2 | 0, 0, 0, 0 | **Thin** |
| Term sheet analysis | 526 | 1 | none (stateless) | A tool, not a workflow |

**Reading.** Of 22 modules, five have live data, one is half-live, and sixteen are built and unexercised or thin. The
agent jobs below start where data exists (founder loop, ledger, KYC cases, compliance calendar) and the rest are
sequenced after a partner brings real data (§7.1).

For each persona: the work to finish, the agent jobs with their autonomy ceilings, and today's state from §2.

### 6.1 Founder: run the raise

| Agent job | Reads | Proposes / commits | Ceiling | Today |
| --- | --- | --- | --- | --- |
| Match and rank investors (with mandate) | deck, profile, directory | ranked workbook, saved run | R0 | **done** |
| Keep the pipeline current | replies, calendar, calls | stage moves, tasks, notes | R0 after enable | blocked (`crm_*`) |
| Run outreach waves | approved sequences, suppression | send batches | R2 per batch | engine exists; no approval inbox |
| Follow-up sweep | stale contacts | drafts for approval | R2 | drafts exist |
| Weekly raise brief | pipeline, activity, signals | a one-page update | R0 | missing |
| Data-room readiness | data room, checklist | gap list, requests | R1 | tools exist; 0 files in production |
| Round modelling | cap table, term sheets | scenarios, dilution | R0 | engines exist (waterfall, 409A, vesting) |

### 6.2 VC: run the fund

| Agent job | Reads | Proposes / commits | Ceiling | Today |
| --- | --- | --- | --- | --- |
| Deal intake and screen | inbound decks, forms, email | deal record, first screen, scorecard | R1 | `deals` = 0; pipeline view only |
| IC memo | deal, data room, calls | memo draft with cited evidence | R0 | `ic_memo` tool exists; 0 memos |
| Portfolio monitoring | KPIs, updates, signals | alerts, update requests, KPI rollup | R1 | `portfolio_kpi_rollup` exists; 0 portfolio companies |
| LP reporting | positions, KPIs | quarterly report draft, LP answers | R1 / R2 on send | report tables exist |
| Capital calls and distributions | fund, LP positions | drafted call or distribution | **R3 propose only** | `draft_capital_call` exists; 4 calls, 3 distributions seeded |
| KYC/AML | cases, screening hits | triage, evidence pack | **R3** | `kyc` module; 9 cases |
| Compliance calendar | deadlines, filings | reminders, filing drafts | R1 / R3 on file | weekly digest cron; `lib/compliance` is 120 lines |
| LP prospecting | directory, matching | ranked LPs, outreach | R2 | LP matching exists |

The fund-operations modules need one audit each before an agent touches them: *what workflow does a GP follow, which step
is a decision, which a lookup*. Agents take lookups first. The deep, tested part is the ledger (§2.3); the thin parts are
compliance and forecasting, which are where the agent jobs will find the least to stand on.

### 6.3 LP: watch the capital

Read-only by design (R0): positions, capital account, distributions, documents, with an assistant that answers from the
fund's own records **and cites the record**; any request that implies action (redemption, transfer) becomes a proposal on
the GP's queue. **Open structural hole:** no LP onboarding, no commitment or subscription flow, `lp_entities` = 0, three
pages. The LP leg needs onboarding, subscription, a capital-account drill-down and self-serve tax documents before an LP
agent has anything to say. This is its own phase (Phase 6) and an honest "not yet" on the site until it ships (§8.1).

### 6.4 What Anker must expose to SAIL

Behind the existing service-token relay and allowlist: run traces and AI usage, the proposal roll-up, eval and
dependency results, cron health, identity and import review queues, tenant usage, entitlements, and a **working view-as
accept endpoint** (§2.4). The contract is in [38](38-sail-monitoring-and-admin.md) §5.

### 6.5 The directory as a product

The directory is the asset every persona depends on and needs an owner and an SLO: the identity service and review queue;
freshness agent; the conflict policy ("fill what is empty, never overwrite, record disagreements",
[24](24-directory-import.md)) as a queue with a decision log; per-source quality scores; the import path gated by the
dry-run → approve → apply flow as every R1 action; and **source, licence and lawful-basis fields per batch** (§8.2).

---

## 7. Business: customers, pricing, position

### 7.1 Design partners first (Phase A)

The test of the spec is real firms. **Chosen (D8, answered 2026-10-03):** two fund managers and three founders.

| Partner | What it is | What it exercises |
| --- | --- | --- |
| **Partner A**: a venture studio that builds software companies from university and hospital research; raising a $40M second fund | VC persona | LP matching and outreach for its raise, LP-facing documents, then Fund OS once it has a fund |
| **Partner B**: a consumer-AI seed fund launching a $5M fund | VC persona | The same LP loop at a smaller scale; thesis-based deal screening of inbound founders |
| **Founders 1–3**: three real company decks from the founder's own library, picked to differ in region, stage and deck quality: a US consumer-app pre-seed ($500K), an EU fintech pre-seed (EUR 500K), and a Germany/Italy B2B SaaS seed whose deck has a damaged text layer (an OCR robustness case) | Founder persona | The matching and outreach loop, and **inbound deal flow into Partners A and B**, which exercises the never-run path `founder_submissions` → deals → IC |

Both partners are themselves **fundraising**, which is the LP-matching job Anker already does well, so Phase A can start
with working product and still reach the unexercised half of the platform (deal intake, IC, data room, LP portal).
Success = each partner completes a loop unaided and says what they would pay. The names live outside the repository (the
redaction rule); this document uses descriptors.

### 7.2 Who pays for what

| Buyer | Pays for | Unit | Evidence needed |
| --- | --- | --- | --- |
| Founder | the raise: matching, outreach, data room, modelling | per workspace per month + credits | 3 partners complete a raise cycle |
| GP / fund | fund ops, reporting, LP portal, agents | per fund + LPs seat or AUM tier | 1 fund runs a quarter-end |
| LP | free through the GP's fund | none | LP onboarding exists |

Plans today: `starter` 500, `pro` 5,000, `scale` 25,000 credits, persona-agnostic ([04](04-personas-entitlements-and-billing.md)).
The pricing model is not validated and nothing enforces it.

### 7.3 Metering and unit economics (G11)

Nothing debits credits; there is no cost per run in storage; and the free-lane-first routing means current AI spend is
near zero but unmeasured. Before pricing: (1) record cost per call and per run (§5.4); (2) compute cost per completed job
(a matching run, an LP report); (3) set a gross-margin target and per-job ceilings; (4) debit credits from the ledger;
(5) enforce plan limits in `can()`. Do **not** publish usage-based prices before step 2.

### 7.4 Position (from our own gap analyses; not re-researched in this pass)

[`metal-feature-gap`](../metal-feature-gap.md) and [`carta-parity-plan`](../carta-parity-plan.md) place the nearest
products as an "OS for capital formation" (fundraising workflow, investor updates, guidance) and a cap-table/fund-admin
platform. The wedge that neither covers, per those documents: **one platform spanning founder, GP and LP**, a 50,000-person
directory with a ranked matching engine, and approval-gated outreach. The risks: the investor-data vendors Anker does not
integrate (the audit found 11 of 12 logos decorative), and a deep ledger without customers. A competitor review (data
vendors, VC CRMs, fund-admin tools) is an open task (§15).

### 7.5 Capacity (D7, answered: "just me and you")

The team is **one founder and one AI engineer (Claude)**. That changes the plan more than any other fact:

- **The founder is the scarce resource** and does what only a person can: partner conversations, selling, decisions,
  legal and counsel contact, approving anything that touches a real third party, and connecting accounts and secrets
  (Stripe webhook, mailbox, provider keys; these are never entered by Claude).
- **Claude builds, tests, deploys and checks**: code, migrations, evals, CI, live verification on production, and the
  documents. Work arrives in sessions, each ending in something deployed, verified and green.
- **Rules that keep it honest:** at most two work streams at once; every slice is demoable; no phase longer than three
  weeks without a partner seeing it; safety layers (auth hardening, traces, proposals) are never the thing cut; a feature
  nobody has asked for is cut before a safety layer is.
- **Parallelism is gone.** The earlier phase sizes assumed a team; §13 is re-cut to a serial plan with a cut list.

---

## 8. Compliance, legal and trust

This section lists exposures found in the code and public pages. It is **not legal advice**. In the third edition the
**factual premises were verified against primary sources** (the statute text, the platform's own terms, the supervisory
rules; §18): the rules exist as stated. **Applying them to Anker's facts is a judgment for counsel**, and §8.7 sets out the
defaults to adopt now, the trigger for engaging counsel, and a scoped brief. The founder's instruction (2026-10-03) was
"do what's best and standard"; §8.7 is that.

### 8.1 Claims integrity

The audit's removal of SOC 2 / 2FA / SSO claims was correct and is verified. Make it a process: a **claims register** (every
public claim, its measured source, owner, last-verified date) checked at release; any number on the site comes from a
query, not a draft. Re-verify the integrations marquee, the investor-count figures and the performance statistics the
audit flagged (§2.5).

### 8.2 Personal data: the directory and data-subject rights (G7, G12)

Anker holds **50,000 person records** (names, titles, emails, LinkedIn URLs, locations) it did not collect from the data
subjects, sourced from imports, scraping and partner lists, plus contact data founders upload. Findings:

- The privacy policy (`app/privacy/page.tsx`) describes account data, uploaded content and usage data. It does **not**
  describe the third-party investor directory, its sources, the lawful basis (typically legitimate interest, with a written
  assessment), the Article 14 notice, or how an investor opts out.
- `email_suppressions` has 0 rows and `li_suppressions` exists; there is **no cross-channel suppression registry** and no
  public opt-out path for a directory person.
- **No data-subject-request tooling** (access, rectification, erasure, restriction, objection) and no retention schedule
  was found; a person's record is referenced by CRM entries, match results and outcome events, so erasure is a design
  problem (tombstone and anonymise, keep the aggregates).
- Imported lists carry provenance only as a `source` string; some arrived with the vendor's promotional footer. **Licence
  and permitted use per source are not recorded.** Require source, licence, acquisition date and permitted use per batch
  before an import is applied.

Requirements: a directory privacy notice and legitimate-interest assessment; a public opt-out that suppresses everywhere;
DSAR/erasure tooling with tombstones; retention rules by table; per-source licence fields; and a record of processing.

### 8.3 Outreach law and platform terms (G13)

- **Email: Germany.** The unfair-competition act's section 7(2) no. 2 treats "advertising using an automated calling
  machine, a fax machine or electronic mail without the addressee's prior express consent" as an unacceptable nuisance.
  Verified from the statute's English text: the *presumed consent* standard appears only in no. 1 (telephone, to another
  market participant); **email has no business exemption**. The only carve-out is the existing-customer rule in
  subsection (3) (address obtained in a sale, own similar goods, no objection, clear opt-out at collection and every use).
  Whether a founder's *fundraising* email is "advertising" in this sense is not settled by the text and is a counsel
  question; until answered, treat it as advertising.
- **Email: deliverability and technical rules.** Verified from the mailbox provider's published requirements: all senders
  need SPF or DKIM, valid forward/reverse DNS, TLS, and a spam rate under 0.3%; senders of 5,000 or more messages a day to
  its users also need DMARC alignment and **one-click unsubscribe** (`List-Unsubscribe` plus `List-Unsubscribe-Post`) with a
  visible link in the body. Anker sends 286 messages in total today, so it is below the bulk threshold, but **no
  `List-Unsubscribe` header exists in the code**, suppression has 0 entries, and a customer's campaign can cross the
  threshold. Engineering must add the header, a working unsubscribe, and the spam-rate monitor either way.
- **LinkedIn.** Verified from the User Agreement, section 8.2: members must not use "software, devices, scripts, robots or
  any other means ... (such as crawlers, browser plugins and add-ons ...) to scrape or copy the Services" nor "bots or
  other unauthorized automated methods to access the Services, add or download contacts, send or redirect messages".
  Anker's extension reads connections (1,988 stored) and automates messages through a customer's own session, with
  warm-up-adjusted daily caps (`lib/linkedin/sending-window.ts`). That is squarely the conduct the clause names, and the
  consequence for the customer is account restriction. Say so plainly in the product and the terms, keep human approval
  and conservative caps, and plan an alternative that does not automate the member's session.
- **Approval gate.** Outreach never auto-sends; keep that invariant (R2 is never auto-committed).
- **Who is the sender.** The customer sends through Anker. Allocation of responsibility between platform and customer (and
  whether Anker is a processor of the customer's contact data) belongs in the terms and a customer DPA; counsel question 3.

### 8.4 AI processing and data residency (G14)

The privacy policy lists Anthropic, OpenAI, Google, Alibaba Cloud and local models and says sub-processors may be outside
the EU. Production is **Qwen-first**: confidential decks, data-room files and LP documents go to Alibaba Cloud's
international (Singapore) endpoint by default; the keys on file are Qwen, OpenAI, Mistral and Resend. Findings:

- The router policy is **global** (SAIL sets provider and per-task models for the whole platform). There is **no
  per-workspace provider policy**, so a GP cannot say "never send my deal documents to a third-country provider".
- Requirements: a **sub-processor register** (provider, region, purpose, DPA status, retention, training opt-out) kept as
  data and shown in the privacy page and in SAIL; a **per-workspace data-handling policy** (allowed providers and regions,
  by data class: public web, deck, data room, LP documents) enforced in the router; an "EU-only" and a "no external
  provider (local model)" mode for confidential data classes; and attachment retention limits (the upload sweep exists).
- **Public text does not match what runs.** The Terms name Supabase, Vercel, Anthropic, OpenAI, Google, Alibaba, Resend and
  Blob but not Mistral (a live key) or Stripe; the privacy policy names Anthropic and Google, for which no key exists in
  production. The register fixes this: the public list is generated from it.
- Provider terms (no training on customer data, retention) must be verified in writing per provider; the policy's "we
  choose providers that contractually agree not to train" is a claim that needs the paper.

### 8.5 Security attestations and enterprise readiness (G15)

No MFA, no SSO/SAML, no SOC 2 report. Institutional LPs and larger funds will ask. Order of work: MFA for all users (and
for SAIL staff first), session management, SSO/SAML for GP workspaces, then a SOC 2 Type I readiness exercise (policies,
access reviews, change management, vendor management; the audit log, migration process and CI are the evidence base),
then Type II. Do not claim any of it before it exists.

### 8.6 Financial and regulatory scope

Anker computes IRR, 409A backsolves, waterfalls, capital accounts and drafts capital calls and KYC cases. It must stay on
the side of **tooling for a regulated person**, never the regulated act: it does not give investment advice, make KYC
decisions, file, sign or move money (R3). Valuation outputs carry the model, inputs and a "not a valuation opinion" notice;
the AI Act risk class of each agent job is recorded in its definition (none of the current jobs is expected to be high-risk;
KYC triage must be re-assessed if it ever scores individuals).

### 8.7 Standard-practice defaults, the counsel trigger, and the brief

**Defaults to adopt now** (low-regret, standard for a platform that sends outreach and holds third-party contact data;
each is engineering or drafting work, none needs a lawyer to start):

| # | Default | Basis |
| --- | --- | --- |
| 1 | `List-Unsubscribe` and one-click unsubscribe on every outreach email; a visible link; the sender entity named in the footer; SPF, DKIM and DMARC aligned; a spam-rate and bounce monitor | §8.3 |
| 2 | One **global suppression registry** across email and LinkedIn; an unsubscribe, a complaint, a bounce or an objection suppresses everywhere and is checked before every send | §8.2, §8.3 |
| 3 | **Country send-gate:** no cold email to recipients in Germany unless the customer attests prior express consent or an existing-customer relationship; other EU countries gated the same way until counsel decides; non-EU defaults permitted with the footer and opt-out | §8.3 (UWG 7(2) no. 2) |
| 4 | A **directory privacy notice** with every Article 14 element (controller, purposes and legal basis, categories, recipients, third-country transfers, retention, rights, source, complaint route), published on the site and **included at first contact** (the rule's trigger is first communication or one month, whichever is earlier); do not rely on the "disproportionate effort" exemption | §8.2 |
| 5 | A written **legitimate-interest assessment** for the directory (purpose, necessity, balancing, safeguards, opt-out) kept with the records of processing | §8.2 |
| 6 | **Objection and erasure handling:** a public opt-out and a request route that tombstone the person, keep aggregates, and suppress | §8.2 |
| 7 | **Per-source licence record** (source, licence, date, permitted use) required before an import is applied; no list with an unclear licence is applied | §8.2 |
| 8 | **Sub-processor register** as data, generating the public lists; DPAs on file; a workspace setting to refuse third-country providers for confidential data classes | §8.4 |
| 9 | **LinkedIn disclosure** in the product and terms, human approval retained, caps conservative, no new scraping features | §8.3 |
| 10 | **MFA** for staff and for GP workspaces; no certification claim until it exists | §8.5 |
| 11 | A **claims register** checked at release | §8.1 |

**Counsel trigger.** Engage counsel for a **scoped fixed-fee review, not a retainer**, before any of: the first paid
customer; publishing the directory notice; enabling cold email to any EU country; or announcing the LP product to
institutions. Until then the defaults above are the operating policy.

**The counsel brief (six questions, each with the facts attached):**

1. Lawful basis and notice for the 50,000-person directory (legitimate-interest assessment, Article 14 approach, retention).
2. Is a founder's fundraising email to an investor "advertising" under UWG 7, and what consent evidence is needed by country?
3. Allocation of responsibility between Anker and the customer for outreach; processor versus controller for customers'
   uploaded contact data; the customer DPA.
4. Exposure and wording for the LinkedIn extension, given User Agreement 8.2.
5. Transfers: Alibaba Cloud (Singapore) and any other non-EU provider; the DPA and transfer-assessment position; what to
   promise customers about training and retention.
6. Whether the LP and fund tooling (capital calls, KYC triage, valuations) places Anker inside any regulated activity, and
   the disclaimers needed.

---

## 9. Security: the agent threat model (G16)

A write-capable agent changes the security posture; reading a hostile web page was low-stakes, acting on it is not.

| Threat | Path | Control |
| --- | --- | --- |
| **Indirect prompt injection** | A crawled page, an uploaded deck, an inbound email or a LinkedIn message tells the agent to act | All external text is wrapped as untrusted data (already done for uploads and `web_crawl`); actions with untrusted inputs are capped at R0 (§5.1); injection cases are part of the eval suite |
| **Confused deputy** | The agent acts with the user's full rights | `commit` is checked against the acting principal, never the model's claim; capabilities are scoped per agent definition |
| **Model-supplied identifiers** | The model passes ids (`score_investors ids`, `crm` ids) that belong to another workspace | Every capability re-authorises every id against the workspace; tests for cross-tenant ids |
| **Data exfiltration** | The agent fetches an attacker URL with data in it (SSRF, link rendering) | `public-fetch.ts` private-address guard exists; add an allowlist mode for confidential workspaces and strip active content |
| **Cross-tenant memory leakage** | Shared memory or caches | Memory and caches keyed by workspace; no global learned state from tenant data |
| **Cost abuse** | A loop or a malicious prompt burns credits | Per-run, per-workspace, platform ceilings (§5.4) |
| **Token and secret exposure** | MCP tokens, service token, provider keys | Scoped, rotatable, shown once; MCP tokens carry a persona and tool allowlist; SAIL's service token is full admin on the tenant side and gets a request log and an IP/identity restriction |
| **Public endpoints** | `/apply`, `/api/public/*`, early access | Rate limits exist on the public submit routes; only 11 of 407 API routes use the limiter, so audit the rest, add bot protection to public forms |
| **Supply chain** | Dependencies, the browser extension | Lockfile CI; the extension release workflow already exists; add dependency scanning |

---

## 10. Engineering quality

### 10.1 Testing strategy

Today: unit tests and in-process Postgres integration tests under `lib/**` (authorization is well covered), a build, a
typecheck, a redaction scan. **Missing:** route-handler contract tests, component tests, any end-to-end test, scale
tests, evals, a post-deploy smoke, and chaos for provider failure. Add, in order of value: (1) the directory-scale and
time-budget tests; (2) evals (§5.4) on every deploy; (3) route contract tests for the capability layer and the
proposal state machine; (4) a handful of end-to-end journeys on a preview (sign in, match a deck, approve a proposal,
undo it); (5) provider-failure drills (lane exhausted, key rejected, search 403) asserting the typed failure reaches the
user; (6) property tests for the financial engines (IRR, waterfall, ledger balance).

### 10.2 Migrations and schema governance

The migration ledger (`schema_migrations`, 118 rows) has reported already-applied migrations as pending, so it cannot be
trusted as a gate; `pnpm migrate` targets the production Neon database, not a local one; SAIL and Anker both write to
tables the other reads, with duplicated helpers; an orphan table was found by the September audit. Requirements: migrations
applied to an ephemeral database in CI; a ledger reconciliation job; expand/contract for breaking changes; **one owner per
table** and a published schema contract for the tables SAIL touches; no destructive migration without a restore point.

### 10.3 Reliability, backup and recovery

Not found in the repository: SLOs, an RPO/RTO, a restore drill, an incident process, a status page. Set: availability and
latency SLOs for the app, matching, and chat; a documented restore of the shared Neon database (point-in-time recovery) with
a **quarterly drill**; an incident template and a blameless review for each Sev-1/2; a customer status page after the
internal board is trusted ([38](38-sail-monitoring-and-admin.md) §3.5).

---

## 11. Integrations inventory (verified 2026-10-03)

Method: the **names** of the production environment variables (never values), the platform's encrypted integration-key
store (key names and whether set, never values), and rows in the tables each integration writes.

| Integration | In code | Production state | Evidence |
| --- | --- | --- | --- |
| Neon Postgres, Supabase auth | yes | **Live** | env, 12 organizations |
| Vercel Blob (uploads, attachments) | yes | **Live** | `BLOB_READ_WRITE_TOKEN` |
| Qwen (free and plan lanes), OpenAI, Mistral | yes | **Live**; Qwen first. No Anthropic or Gemini key | platform keys, `QWEN_PLAN_*`, 3,115 `ai_calls` |
| Resend (outbound email) | yes | **Live**: 286 sent | `RESEND_API_KEY` in env and in the key store (the key store holds only this key) |
| SendGrid | yes | Key present in env; no evidence of use | env only |
| LinkedIn (extension, action queue) | yes | **Live**: 9 extension tokens, 3 campaigns, 2 senders, 1,988 connections | tables |
| Market signals, newsroom, email verification | yes | **Live**: 600 signals, 90 published articles, 9,913 verifications (all by the local stage; no paid verifier) | tables |
| Stripe | yes | **Not working**: secret and publishable keys present, **`STRIPE_WEBHOOK_SECRET` absent**, so webhooks cannot be verified; 0 customers, 0 subscriptions | env, tables |
| **Reply detection** (IMAP, Gmail OAuth) | yes | **Not live**: no `IMAP_*` or `GOOGLE_OAUTH_*` variables, 0 connected mail accounts, **0 replies recorded from 286 sends** | env, tables |
| DocuSign | yes | **Not live**: no `DOCUSIGN_*` variables; 0 contracts | env, tables |
| KYC screening (OpenSanctions), Companies House | yes | **Not live**: the key store holds neither key; 4 cases carry a screened date with 0 hits (inferred: screened against the local 6-row watchlist only, since no provider key exists) | key store |
| Twenty CRM | yes | **Not live**: no `TWENTY_*` variables | env |
| SearXNG, Ollama, Marker (PDF), n8n, doc-worker | optional services | **Not used** (search runs on Qwen) | env |
| MCP server, WebMCP | yes | 0 MCP tokens issued | table |
| Data vendors, calendar, bank feeds, accounting | **none** | none | code |

**Two findings with consequences.** (1) The outreach loop is half-live: it sends, but it **cannot see replies**, so
classification, follow-up and the "booking" steps downstream of a reply have never run on real data. (2) Billing cannot work
until the webhook secret is set. Both are founder actions (secrets) plus verification by Claude, and both are in Phase A.

---

## 12. Metrics: how we know it is working

| Outcome | Measure | Target by end of Phase 4 |
| --- | --- | --- |
| **Activation** | organizations completing the full loop with real data; weekly active users; time to first value | 3 founders + 1 fund; 20 WAU |
| **Revenue** | paying workspaces; monthly recurring revenue; credit burn vs plan | first paying customers; gross margin above target |
| Agents do the routine work | share of routine actions executed by agents (proposals applied ÷ all CRM/outreach/report changes) | > 60% founder, > 40% VC |
| Humans review exceptions | proposals approved unchanged ÷ decided | > 85% |
| Safe | irreversible actions without approval; R1+ actions from untrusted input | 0; 0 |
| Reliable | run success rate; p95 run time; platform-killed runs | > 97%; < 120 s; 0 |
| Correct | eval pass rate per deploy; nightly drift | 100% invariants; no regression > 2 pts |
| Cheap | cost per completed job vs ceiling | tracked per job |
| Clean data | duplicate rate; stale share; sources with a licence on file | < 0.5%; < 15%; 100% |
| Compliant | DSARs closed in time; suppressions honoured across channels | 100%; 100% |
| Honest | public claims with a verified source | 100% |

The current baselines are in §2.2 (for example 96.7% AI call success over 7 days, 2 monthly active users, 0 paying).

---

## 13. Roadmap with acceptance

**Sized for two people** (D7): the founder and Claude, serial, at most two streams. Phases keep their definitions; the
order and size are re-cut. Week numbers are working weeks from the start; each ends with something deployed and verified on
production.

### 13.1 The first eight weeks

| Weeks | Stream 1 (founder-led, Claude supports) | Stream 2 (Claude-led, founder reviews) | Exit check |
| --- | --- | --- | --- |
| 1–2 | Set the Stripe webhook secret; connect a mailbox so replies are detected; confirm the two partners and three decks; review the directory notice, the legitimate-interest assessment and the counsel brief drafts | **Make it safe and true:** SAIL hardening (CI gate, MFA, login limit, revocable sessions, working view-as); Anker Phase 0 core (`run_id` and `cost_usd` on `ai_calls`, structured run logs, `cron_runs`, dependency check that includes the webhook and reply-detection states); `List-Unsubscribe`, unsubscribe route and the global suppression registry; delete the dead landing components; fix the public provider list | Webhooks verified end to end in test mode; a reply appears in the CRM; a failing change cannot reach SAIL production |
| 3–4 | **Phase A with partners:** onboard Partner A and Partner B as VC workspaces; run their LP fundraising loop with approvals; load the three founder decks as inbound deals and run intake by hand to find what is missing | Instrument activation (events table, loop completion, first-value time); fix what the partners hit; the country send-gate | Both partners complete one LP outreach wave through the approval gate; the three decks reach a deal record |
| 5–6 | Weekly partner calls; decide what they would pay | **Phase 1 core:** `action_proposals`, the three capability kinds, the inbox, undo, `audit_events` for assistant/CRM actions; move `crm_add_task` and `crm_update_stage` onto `propose` | One proposal from a real request is approved, applied once and undone |
| 7–8 | Review the first agent output with a partner | **Phase 2 minimum + evals v0:** two agent definitions as data (weekly brief, pipeline-keeping); durable runs; evals for the five hand cases plus an injection case; SAIL status board and AI operations (S-2, S-3) | A scheduled agent produces proposals unattended; evals run on deploy; SAIL shows last week's AI failures by kind |

After week 8, **re-plan from what the partners did**, not from this table. Counsel is engaged at the trigger in §8.7 (before the
first paid customer or the directory notice), which probably falls inside weeks 5–8.

### 13.2 What is cut or deferred (and why)

SSO/SAML and SOC 2 (no institutional buyer yet; MFA first); the full entity graph (a minimal identity service and review
queue only, in Phase 3); LP onboarding and the LP assistant (no LP has asked; the partners are GPs); per-module rewrites of
forecasting, compensation and planning (only what a partner needs); the agent-definition registry UI; a vendor observability
integration (a hosting log drain is the minimum); a customer status page; per-workspace provider policy beyond a simple
"refuse third-country providers" switch.

### 13.3 Phase definitions and acceptance (unchanged in substance)

**Phase A — Activation and truth.** Recruit the partners (done: §7.1); instrument activation; verify and fix the claims
register; **live billing** (webhook secret, live keys), metering recorded; **reply detection live**; an honest "coming" state
for LP onboarding; view-as working.
*Acceptance:* a partner's loop is timed; every number on the site traces to a query; a reply to a sent email appears in the CRM.

**Phase 0 — Foundations.** `run_id` and cost on `ai_calls`; run traces and structured logs; streamed calls recorded;
dependency checks; directory-scale fixture and time budgets in CI; evals v0 with an injection case; `cron_runs`; migration CI
on an ephemeral database.
*Acceptance:* a deliberately slowed run produces a trace naming the slow step; CI fails on a quadratic change to firm
clustering; evals fail when a golden case is made wrong on purpose.

**Phase 1 — The action layer and the approval inbox.** `action_proposals`, capability kinds, risk classes, the inbox, undo,
`audit_events` for assistant/CRM/agent actions; `crm_*`, `enrich_firms`, `build_investor_profile` off `BLOCKED` onto
`propose`; owner-set autonomy per class; the untrusted-input cap.
*Acceptance:* "move the stale contacts to *Contacted* and add follow-up tasks" yields one proposal with a diff; approving
applies it once (idempotent on retry) and undo restores the prior state; with R0 auto-commit on, the same request commits and
still appears in the log; an R3 capability never auto-commits; a proposal built from an injected page is capped.

**Phase 2 — The agent runtime.** Definitions as data; schedule and event triggers; durable resume; dry-run; budgets; kill
switches; the outreach tick and campaign engine re-expressed as definitions.
*Acceptance:* a new agent ships as a definition plus a test with no new route; killing the process mid-run and restarting
resumes it; dry-run applies nothing.

**Phase 3 — Identity, memory, compliance foundations.** The identity service and review queue; provenance and licence per
import batch; entity memory; the cross-channel suppression registry; DSAR/erasure tooling; the directory notice; the
workspace provider switch; entitlements and credit debiting.
*Acceptance:* one real firm written four ways resolves to one entity; an erasure request removes a person everywhere while
keeping aggregates; a workspace set to refuse third-country providers runs on an allowed provider or refuses clearly; a plan
change flips a limit.

**Phase 4 — The founder loop, closed.** Pipeline-keeping, outreach waves through the inbox, follow-up sweep, weekly brief,
data-room readiness; MFA for GP workspaces.
*Acceptance:* a founder connects a deck and a mailbox and a week later has a current pipeline, a drafted next wave awaiting
approval and a one-page brief, having made only approvals.

**Phase 5 — The VC fund loop.** Audit each fund-operations module into workflows with the partners; deal intake and IC memo;
portfolio monitoring; LP reporting; capital call and distribution proposals (R3, maker–checker); compliance and forecasting
depth.
*Acceptance:* a partner fund's quarter-end: LP reports drafted from KPIs with every figure traceable to a record, a capital
call proposal with a two-person approval, the compliance calendar current.

**Phase 6 — LP and the network (deferred, §13.2).** LP onboarding, subscription, capital-account drill-down; an LP assistant
with cited answers; SOC 2 Type I readiness.

Realistic size after week 8, one stream at a time: Phase 3 about five weeks, Phase 4 about four, Phase 5 about six. The dates
move with the partners, not the other way round.

---

## 14. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | No customers: building an operator for a firm that does not exist | High | High | Phase A first; design partners are an exit criterion |
| R2 | An agent commits a wrong or hostile action | Medium | High | Proposals, risk classes, untrusted-input cap, undo, evals |
| R3 | Directory personal-data exposure (no notice, no DSAR, unlicensed sources) | Medium | High | §8.2 before wider launch |
| R4 | Cold-email or LinkedIn automation causes legal or account harm to a customer | Medium | High | §8.3; approval gate; caps; counsel |
| R5 | Confidential deal documents processed by a provider the customer would reject | Medium | High | §8.4 per-workspace provider policy |
| R6 | A repeat of the quadratic-style outage | Medium | Medium | Scale tests, one clock, traces, canaries |
| R7 | Public claims drift ahead of the product again | Medium | High | Claims register at release |
| R8 | Single shared database is a blast radius and a coupling point with SAIL | Medium | High | Schema contract, owners, least-privilege roles, restore drill |
| R9 | Vendor or model lane change breaks quality or cost | Medium | Medium | Router, evals as the safety net, cost per job |
| R10 | Team capacity below the plan | High | Medium | D7; cut scope, not safety layers |

---

## 15. Decisions and open questions for the founder

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Default autonomy: R0 auto-commit **on** or **off** at launch? | Off; owners enable per class after a week of the inbox |
| D2 | One database or per-tenant? | Keep shared and scope keys; revisit at enterprise demand |
| D3 | Fund-operations modules: build, partner, or integrate? | Audit first; integrate regulated parts (screening, e-signature, bank) |
| D4 | Retire the in-app `/dashboard/admin` once SAIL has parity? | Yes |
| D5 | Which persona leads? | Founder loop (revenue product, shortest proof), with one real fund in parallel to exercise Fund OS |
| D6 | Stay Qwen-first? | Yes, behind a per-workspace provider policy; evals make a swap safe |
| D7 | Team size and weekly capacity? | **Answered: the founder and Claude.** The roadmap is re-cut (§7.5, §13) |
| D8 | Who are the design partners? | **Answered:** two fund managers (a university-research venture studio raising a $40M fund; a consumer-AI seed fund launching $5M) and three founder decks chosen from the founder's library (§7.1). Names stay out of the repository |
| D9 | Is the investor directory a product, a service, or an internal asset? | Treat it as the core asset; fund the privacy and licence work in Phase 3 |
| D10 | Do we pursue SOC 2? | Yes, Type I readiness in Phase 6; MFA and SSO earlier because they unblock sales |
| Q1 | Counsel review of §8 | **"Do what is best and standard":** adopt the §8.7 defaults now; engage counsel for a scoped fixed-fee review at the trigger (first paid customer, directory notice, EU cold email, LP launch) using the six-question brief |
| Q2 | Competitor review (data vendors, VC CRMs, fund admin) | One week, before pricing |
| Q3 | Which integrations are live and which are decoration? | **Answered (§11).** Next: set the Stripe webhook secret, connect a mailbox, then retire unused code |
| Q4 | A mailbox to connect for reply detection, and a decision on webhook secret and live Stripe keys | Founder action in week 1 (secrets are never entered by Claude) |
| Q5 | Do the two partners agree to be named in sales material? | Ask when they have seen results; until then they are descriptors only |

---

## 16. Non-goals

A general-purpose workflow builder; a second chat product; replacing the matching engine; autonomous financial, legal or
regulatory action; per-tenant infrastructure; building screening or e-signature ourselves; advice, valuation opinions or
KYC decisions presented as Anker's own.

---

## 17. Revision notes: what the scrutiny pass changed

The first edition of this document (earlier on 2026-10-03) had these faults, now corrected:

1. **Depth was judged by page size.** Measured by library code, Fund OS (16,900 lines) and the matching and outreach engines
   are deep; compliance (120), forecasting (60), compensation (100), signals, updates, calls and planning are thin (§2.3).
2. **It ignored the September audit and four planning documents.** Its findings, and which are fixed or open, are in §2.5.
3. **It omitted the business reality** (12 organizations, 2 monthly active users, 0 paying, 0 LPs) and so put engineering
   ahead of activation. Phase A and §7 are new.
4. **`agent_runs` and `audit_events` were described as existing infrastructure.** Both have zero rows and few or no writers.
5. **Missing areas added:** compliance and legal (§8), the agent threat model (§9), testing, migrations and recovery (§10),
   entitlements and metering (§5.5, §7.3), integrations (§11), position and capacity (§7), a risk register (§14).
6. **The ERP definition was implicit;** the completeness checklist is §0.1.
7. **`ai_calls` was assumed to support cost and traces;** it has no cost column and no run id (§2.4, §5.4).
8. **Still unverified in the second edition:** which integrations are live; whether the site's claims were fixed; per-module workflow depth; the team size; legal conclusions. **Resolved in the third edition (§18).**

### Third edition (verification pass)

9. **Integrations verified** from production environment-variable names, the encrypted key store (names only) and table rows (§11).
   New findings: the Stripe webhook secret is absent, **replies are not detected (0 of 286 sends)**, e-signature, KYC screening and
   Twenty are not live.
10. **Public claims verified closed** by crawling 20 public routes; the offending sections are dead components still in the repo.
    One new mismatch found (the public sub-processor lists).
11. **Module depth** measured on four signals instead of one (§6.0): five modules live, one half-live, sixteen unexercised or thin.
    Click-through of each UI remains undone.
12. **Capacity** answered (founder plus Claude): the roadmap is re-cut and serial (§13).
13. **Legal premises** verified against the statute text, the platform terms and the supervisory rules; a secondary tool summary
    of the statute was wrong on business email and was replaced by reading the raw text. Application to Anker is for counsel;
    standard-practice defaults and a counsel brief added (§8.7).
14. **Design partners chosen** (§7.1).

---

## 18. Verification log (2026-10-03)

| Item | How verified | Result |
| --- | --- | --- |
| Which integrations are live | Production environment-variable names (no values), the key store (names only), table rows | §11; Stripe webhook secret absent; reply detection not live; DocuSign, KYC screening, Twenty not live; Resend, Blob, Qwen/OpenAI/Mistral, LinkedIn extension live |
| Public integration and count claims | Crawled the home page and 19 other public routes; searched for certifications, vendor names, counts, percentages; checked which landing components any page imports | No certification, logo marquee or inflated count on any live page; the old sections are unused components (delete them); `/pricing` is a 404 |
| Module workflow depth | Library lines, API routes, production row counts and test files for 22 modules | §6.0; UI click-through not done |
| Team size | The founder | One founder and Claude |
| Legal premises | Statute text (UWG section 7 read from the raw English translation), the platform user agreement (LinkedIn 8.2), the mailbox provider sender requirements, GDPR Article 14 | Premises confirmed; **applying them is for counsel** (§8.7) |


**Revision 2026-10-03 (send-gate):** `lib/email/send-gate.ts` is now the single gate for outreach: the global opt-out, then the country rule
(Germany and the other EU/EEA states need a per-recipient attestation in `outreach_consents`, recorded through `/api/outreach/consent`; the
country comes from the caller, then the directory record, then the domain's country code; unknown or non-EU is permitted with footer and
opt-out; `OUTREACH_COUNTRY_GATE=off` disables the country rule only). Found and closed in the same change: the **Gmail send path
(`sendGmail`) bypassed the opt-out, the footer and the unsubscribe headers**; it now passes the same gate and carries the same footer and
headers. The platform's own pitch-us cron has no sender user, so gated recipients are blocked there until an attestation flow exists for it.
Still open: cross-channel suppression (email opt-out to LinkedIn and back) and an Anker screen to record attestations (API only today).

**Revision 2026-10-03 (the three send-gate gaps, closed):**
- **Cross-channel suppression** (`lib/compliance/suppression.ts`): an unsubscribe, a spam complaint or an explicit LinkedIn objection ("stop", "do not contact", "remove me") now suppresses the person on every channel. The same person is joined through the directory, CRM people and contacts (email to LinkedIn profile and back). Global LinkedIn rows live in `li_suppressions` under owner `*` and the sequencer reads them with the user's own. "Not interested" stays with the one sender; a bounce suppresses only that address (it is a dead address, not an objection). Deviation from the section 13 wording ("a bounce ... suppresses everywhere"): deliberate, recorded here.
- **Pitch-us consent:** the pitch-us cron sends as the platform sender (`platform:pitch-us`); held recipients appear in the Owner Console (Held pitch emails), where the owner attests per recipient and the held entries return to the queue; audited as `outreach.pitch_consent`.
- **Consent screen for senders:** `/dashboard/outreach/consent` (founder and VC personas) records, lists and withdraws attestations.

**Revision 2026-10-04:** inbound deal intake designed and built as [39](39-fund-inbound-deal-intake.md): per-fund public form (`/intake/<slug>`, embeddable), a configurable two-layer engine (gates then AI rubric, thesis and free-text instructions, presets, test run), and a ranked, categorised pipeline (Passed, Review, Not a fit). The hard-coded flagship in `/api/public/submit` remains for Anker's own founder campaign.

---

## 19. Implementation status, read from the repository and production on 2026-10-10 (fourth edition)

Doc 37 said "nothing built". Since 2026-10-03 the platform layers of section 5 were built (docs 43 to 46). **What is real, what is empty, and what is next:**

| Spec item | Status | Evidence |
| --- | --- | --- |
| §5.1 action layer, proposals, risk classes, approval inbox, undo | **Built** (doc 43; capabilities `crm_update_stage`, `crm_add_task`, `memory_remember`, `outreach_save_drafts`, `outreach_send_batch`; R2/R3 never auto-commit; untrusted runs capped) | production table `action_proposals`: **0 rows ever**, so unused in production |
| §5.2 agent runtime: definitions as data, schedule and event triggers, durable runs, kill switches, memory, model steps | **Built** (docs 44, 45; four definitions: pipeline keeper, weekly brief, reply keeper, outreach drafter) | `agent_executions`: **1 row** |
| §5.3 entity memory | **Built** (`entity_memory`, written through a capability) | table exists; identity service and review queue: **not built** (`entities` does not exist) |
| §5.4 run traces and cost; cron tracking; dependency check; evals | **Built** (`ai_calls.run_id` and `cost_usd`, `cron_runs` 9,144 rows, dependency check, 116 `eval_runs` including live read-only evals) | production |
| §5.4 evals with an injection case; scale budget in CI | evals built; **the 21,000-firm CI fixture is not verified here** | — |
| §5.5 entitlements: one `can` and `meter`; AI credits debited from a ledger | `assertAllowed`, `assertWithinLimit`, `ai_spend_usd_month` exist and are used by the studio and assistant; **no credit ledger** (`credit_ledger` does not exist) | production |
| Send governance (not in the original spec; added by this work) | **Built** (doc 46 P0 to P4): every outreach send runs under a recorded send authorization, one approver (the sender), exact recipients and text hashed, 7-day expiry, platform pause, shadow log, enforcement flag (off), dated sequences, LinkedIn actions recorded | `send_authorizations`: 1 row |
| §8.3 `List-Unsubscribe`, global suppression registry, country send gate | **Built** (`unsubscribeHeaders`, `email_suppressions`, `assertOutreachAllowed`) | code; suppressions: 0 rows |
| §8.2 data-subject requests, retention, erasure for the 50,000 directory persons | **Not built** (`dsar_requests`, `erasure_requests` do not exist; tenant erasure exists for workspaces) | production |
| §8.4 per-workspace provider policy ("refuse third-country providers") | **Not built** | grep |
| §8.5 MFA | **Built in SAIL** (TOTP step-up; enrolment is a founder action) | SAIL |
| Phase A activation and truth | Instrumentation **built in SAIL** (`/activation`, derived from product records) and **extended today** with the governed-work counts and a per-workspace view `activation_by_workspace` in Anker (`2026-10-10b`) | see below |

### 19.1 What production says about adoption (the finding that matters)
From `activation_by_workspace` on 2026-10-10 (14 live workspaces):
- **One** workspace has ever emailed a contact: the founder's own ("Anker": 641 contacts, mail sent). It is the only one with activity in the last month.
- The two **design-partner workspaces** (Summit Venture Studio and Winner Capital, created 2026-10-04) have **0 contacts**; "Anker Fund I" has 50 contacts and nothing else; the other ten workspaces are empty accounts created on 2026-08-08 or 2026-09-30.
- **0 proposals** have ever been created, **1 agent run** ever finished, **1 send authorization** (the founder's own test).
So the platform layers exist and are tested, and **no customer or partner has used them**. This is gap G0 and risk R1 of this document, unchanged: "building an operator for a firm that does not exist." More platform work will not move this number. What moves it is in sections 7.1 and 13.1: the partners using it. Two things engineering can do that serve that directly: make the first session produce something (section 19.2), and make adoption visible weekly (done).

### 19.2 What to build next, in order
1. **First-run value for the design partners (Phase A, week 3 to 4 of 13.1).** A partner who signs in should reach "a reviewed list of investors, a draft wave waiting for approval, and a brief" without configuration: guided setup from a deck or fund thesis, the first drafts created for them, and the approval screen as the landing page. Measure with `activation_by_workspace` (time from workspace created to first contact, first draft, first approved send).
2. **The directory privacy work (Phase 3, G12, G14):** `dsar_requests` and erasure for directory persons, a per-batch source and licence record, and the workspace provider switch. These are the compliance blockers named before any wider launch and before the first paid customer.
3. **Credit ledger and the single `can`/`meter`** (G11), once a paying customer is in sight.
4. **Entity identity service and review queue** (G6, G7), when the partners' data shows duplicate firms hurting a real run.
Items 2 to 4 are real work with real value, but each one waits behind getting a single partner through item 1.
