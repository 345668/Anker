# 37 — Anker as the agentic ERP for venture capital: status, gaps and spec

**Date:** 2026-10-03 · **Status:** assessment and spec, nothing built · **Companion:** [38](38-sail-monitoring-and-admin.md)
(SAIL, the monitoring and admin plane) · **Builds on:** [00](00-persona-isolation.md) persona isolation,
[28](28-assistant-system-design.md) assistant runtime, [29](29-agentic-core.md) agentic core,
[30](30-ai-observability.md), [33](33-cost-ceiling.md), [35](35-ai-availability-qwen-first.md)

**Rule for this document:** every claim in §2 was read from the repository or observed on production on
2026-10-03, and says which. Anything not verified is marked *(unverified)*. Every proposal in §5 onward closes a
gap named in §3.

---

## 0. The goal, stated so it can be tested

> Anker is the **system of record** and the **operator** for a venture firm and for the companies and
> investors around it: it holds the facts, and software agents do the routine work on them, under rules the
> humans set, with every action explained and reversible.

"ERP" is the system-of-record half: one place where funds, LPs, deals, portfolio companies, investors,
documents, compliance and communications live, and where a change in one is visible in the others. "Agentic" is
the operator half: agents that **read** all of it, **propose** work, and **commit** the work a human has
authorised, instead of a chat window that writes answers.

The test of success is not "has an assistant". It is: **a week of a firm's routine work is done by agents, and
the partner reviews exceptions instead of doing the work.** §7 turns that into numbers.

Three users, three jobs (existing personas, [00](00-persona-isolation.md)):

| Persona | The firm's job Anker takes on |
| --- | --- |
| **Founder** | Run the raise: find and rank investors, run outreach, keep the pipeline and data room current, model the round |
| **VC fund manager (GP)** | Run the fund: deal flow to IC, portfolio monitoring, LP reporting and capital calls, compliance and KYC |
| **LP** | Watch the capital: positions, distributions, documents, questions answered from the fund's own records |

---

## 1. What this document is not

- Not a rewrite. The loop, the router, the matching engine and the persona isolation work; §5 adds a layer
  around them ([28](28-assistant-system-design.md)'s rule, restated).
- Not a feature list per module. Modules are judged by one question: can an agent read it, propose against it,
  and be stopped by a policy? A module that cannot answer yes is not part of the ERP yet.
- Not about SAIL. The operator console is [38](38-sail-monitoring-and-admin.md); §6.4 here lists only what
  Anker must expose to it.

---

## 2. Where Anker stands (verified 2026-10-03)

### 2.1 Size and shape

| Fact | Evidence |
| --- | --- |
| ~2,040 tracked files; 207 pages, 407 API routes | `git ls-files` |
| 3 personas; ~45 dashboard modules | `app/dashboard/*`, `lib/nav/work-areas.ts` |
| About 170 `CREATE TABLE` statements across 118 migrations and setup scripts (a few are legacy or backup tables), one shared Neon database | `scripts/migrations/*.sql`, `scripts/*.sql` |
| 15 scheduled jobs (outreach, campaigns, deliverability, signals, verification, directory, ranker, uploads sweep) | `vercel.json` |
| 109 test files, ~1,070 tests; CI runs typecheck, a redaction scan, vitest and a production build; a push to `main` deploys | `.github/workflows`, `pnpm test` |
| Directory: ~21,000 firms and ~50,000 people | production, 2026-10-03 |
| 37 design documents; 10 of them (27–36) written since 2026-09-26 | `docs/architecture/` |

### 2.2 What is real, by area

**Strong (works end to end, used, tested):**

- **Founder raise.** Deck → profile extraction → matching engine v3 (seven weighted components, gates, tiers,
  headroom grading) → ranked workbook, with mandate filters, dedup and verified answer blocks. Exercised live
  on production with two real decks on 2026-10-02/03.
- **Outreach engine.** Sequences, scheduler, deliverability, re-engagement, suppression, LinkedIn action queue
  (senders, approvals, extension). Cron-driven.
- **Founder application campaign.** Public `/apply` → assessment → matching → send waves, with operator controls.
- **AI platform.** Qwen-first routing with free then plan lanes, typed failures, a per-run cost ceiling, a call
  log, attachments straight to private blob storage, OCR, web search. Persona-scoped tool allowlists.
- **Identity and isolation.** Persona and workspace scope keys, an owner tier firewalled from tenant records,
  audit events.

**Present but thin (a page and a table, little behind it):**

- Most "ERP" modules: cap table, 409A, share plans, compensation, equity compliance, term sheet (founder);
  KYC/AML, fund tax, SPVs, loan operations, contracts, valuations, forecasting (VC). Their pages are 10–80 lines
  over a component and a table. They are screens, not workflows. *(Depth beyond the page was not audited
  module by module; §8 makes that the first task of each module's phase.)*
- Portfolio (VC) is the one deep module: ~1,700 lines of pages, the fund/deals/performance/reports views.
- LP persona: three work areas (assistant, distributions, documents) and two tools.

**Absent:**

- **No governed write path for agents.** `crm_update_stage`, `crm_add_task`, `enrich_firms` and
  `build_investor_profile` are on a `BLOCKED` list in `lib/assistant/policy.ts`, with the comment that they
  "require a separate human-reviewed administrative/action workflow". That workflow does not exist: there is
  no proposals table, no approval inbox. Doc 28 G4 (a gated tool parks a pending intent) is design only.
  So today agents **read, research, draft and rank**, and the only commits are `send_outreach` (gated by
  write permission) and `match_investors` (saves a run).
- **No general agent runtime.** Two purpose-built background agents exist (the outreach tick, the campaign
  engine). A third agent requires a new route, a new cron and new code. There is no trigger/schedule/run model
  an agent definition plugs into.
- **No entity memory.** What the assistant "knows" about a workspace is whatever its tools query on that turn
  plus a transcript. No durable, provenance-tagged facts ("this LP prefers email on Tuesdays", "this founder's
  round is $1.5M, stated on slide 13").
- **No evaluation harness.** Quality is checked by hand: the two decks and the Germany search were run in a
  browser by a person. There is no golden set, no scheduled canary, no score over time.
- **No cross-entity graph.** A firm, a person, a deal, an LP and a portfolio company are separate tables joined
  ad hoc. There is no single identity per real-world entity that all modules share.

### 2.3 What broke in production this week (and what each says)

| Event | Root cause | What it shows |
| --- | --- | --- |
| Founder matching returned a bare 504 for two runs | An all-pairs name comparison in firm clustering: 24 s at 4,000 firms, minutes at 21,000 | No test at directory scale; the unit tests used a handful of names |
| The 504 left one log line ("Task timed out") | No structured application logging inside a run | A hung run cannot be diagnosed from outside; the cause was found by reasoning, not by looking |
| Deck reading ran before the run's clock started | Two budgets, not one | Time limits must be one budget per request |
| `web_search` never worked in production | Pointed at a localhost search engine no serverless function can reach | Production dependencies were never checked against a real deploy |
| 75 firms all scored "100" | Four components saturate at 1.0 for any firm that clears a bar | Ranking quality was judged by eye on one case |
| A model said "scored 40" when 37 existed | The model's prose was trusted over the tool's count | Free text is not a source of truth; the verified-block pattern is the fix and must be general |
| 773 import conflicts, 35 same-name firms wrongly folded into others | Name-only identity matching; no merge/review workflow | Directory identity needs a service, not scripts |

None of these were model failures. They were **missing platform properties**: scale tests, one clock,
structured traces, dependency checks, quality evals, source-of-truth discipline, identity resolution. Those are
the foundation §5 builds, because an agent that operates the firm's records cannot sit on them.

### 2.4 Verdict

Anker is a strong **founder-fundraising product with an AI research and matching core**, and the *skeleton* of a
venture ERP: many entities and screens, one deep module, no governed way for an agent to change anything. The
distance to the goal in §0 is not more modules. It is four platform pieces (§5): a **governed action layer**,
an **agent runtime**, **entity memory and identity**, and **evals plus traces**. After those, each module becomes
a set of agent jobs (§6) instead of a screen.

---

## 3. The gaps, ranked

| # | Gap | Why it blocks the goal | Closed by |
| --- | --- | --- | --- |
| G1 | Agents cannot change records through any governed path | Without it Anker is a research tool; "agentic ERP" is false | §5.1 action layer |
| G2 | No approval inbox, no autonomy policy | Humans cannot safely say "do this kind of thing without asking" | §5.1, §5.2 |
| G3 | No agent runtime (triggers, schedules, durable runs, resume) | Each new agent is bespoke; background work does not scale | §5.2 |
| G4 | No traces or structured run logs | Cannot debug, cost, or audit a run; hangs are invisible | §5.4 |
| G5 | No evals or canaries | Every release risks silent quality loss; regressions found by users | §5.4 |
| G6 | No entity identity or memory | Modules cannot share facts; agents re-derive them every turn | §5.3 |
| G7 | Directory data quality (dupes, conflicts, freshness) is a script and a CSV | Matching quality is capped by data quality | §5.3, §6.5 |
| G8 | ERP modules are screens, not workflows | A VC cannot run a fund week on them | §6 |
| G9 | No scale/perf budget in CI | The 504 class of bug returns | §5.4 |
| G10 | Two operator consoles (in-app `/dashboard/admin` and SAIL) | Duplicated effort, unclear owner | [38](38-sail-monitoring-and-admin.md) §4 |

---

## 4. Principles (the rules every phase obeys)

1. **The tool decides facts; the model decides words.** Counts, scores, names and amounts in an answer come from
   a tool result and are rendered from it (the verified-block pattern, generalised). Where the model's prose
   states a number that a tool contradicts, the tool's number replaces it. *(Already true for matching and
   scoring; becomes true for every tool.)*
2. **Read freely, propose by default, commit under policy.** Every capability is one of three kinds (§5.1), and
   the kind, not the model, decides what happens.
3. **Every action is explainable and reversible.** What was done, by which agent, on whose authority, from which
   inputs, and how to undo it. Irreversible actions (sending money, sending email to a third party, filing) are
   never autonomous by default.
4. **Humans own autonomy.** A workspace owner sets, per action class, how much runs unattended. Defaults are
   conservative and the platform can only lower a ceiling, never raise it past what the owner allowed.
5. **One budget per request, one trace per run.** Time, calls and money are bounded together; every run leaves a
   trace a person can read.
6. **Scale is a test, not a hope.** Anything that touches the directory is tested at directory size.
7. **A module is part of the ERP when an agent can read it, propose against it, and a policy can stop it.**
8. **Tenant isolation is never traded for convenience.** Persona and workspace scope keys, the owner firewall and
   redaction rules ([00](00-persona-isolation.md), [23](23-redaction-check.md)) are preconditions, not features.

---

## 5. Target architecture: five layers around the existing core

```
 Surfaces   web app · assistant · Anker AI · MCP · email · browser extension
 ─────────────────────────────────────────────────────────────────────────────
 Governance   policy (autonomy levels) · approvals · audit · cost ceiling · evals
 Agent runtime   definitions · triggers · durable runs · memory · scheduling
 Action layer   typed capabilities: READ · PROPOSE · COMMIT, idempotent, reversible
 System of record   entity graph · event log · documents · directory   (existing tables)
```

### 5.1 The action layer: capabilities and proposals (closes G1, G2)

Every operation an agent can perform is a **capability** with a typed input schema (the schema machinery in
`lib/assistant/tool-schemas.ts` already enforces bounds), declared once:

| Kind | Meaning | Example |
| --- | --- | --- |
| `read` | No side effect | `crm_search`, `fund_performance`, `query_investors` |
| `propose` | Produces a **proposal**: the exact change, its evidence and its diff, stored, not applied | "move 14 contacts to *Contacted*", "draft capital call #7", "merge these two firms" |
| `commit` | Applies a proposal that is approved (by a human or by standing policy), idempotently, with an undo record | the same three, after approval |

**The proposals table** (new, `action_proposals`): `id`, `workspace`, `persona`, `capability`, `input`, `diff`
(before/after, human-readable and machine-applicable), `evidence` (tool results, document refs), `risk_class`,
`agent_run_id`, `status` (`pending | approved | rejected | applied | undone | expired`), `decided_by`,
`decided_at`, `applied_at`, `undo` (what reverses it), `idempotency_key`.

**Risk classes** decide the default path; owners can only tighten them or loosen within a ceiling:

| Class | Examples | Default |
| --- | --- | --- |
| R0 internal, reversible, own data | tag a contact, create a task, move a CRM stage, attach a note | auto-commit after the owner enables it for the class; always logged |
| R1 internal, bulk or structural | merge firms, bulk stage move, import into the directory, rebuild a profile | propose, one-click approve |
| R2 external, reversible-ish | send an email or LinkedIn message to a third party, publish an update | propose; approve per batch; rate-limited; suppression enforced |
| R3 money, legal, regulatory | capital call, distribution, KYC decision, filing, signature | propose only; two-person rule where the fund requires it; never autonomous |

The `BLOCKED` list in `policy.ts` becomes the first set of `propose` capabilities (`crm_update_stage`,
`crm_add_task`, `enrich_firms`, `build_investor_profile`), so the work that is blocked today starts working
under governance rather than being unblocked blindly.

**Approval inbox.** One queue per workspace (and a roll-up in SAIL for staff oversight): pending proposals
grouped by agent run, with the diff, the evidence, approve / edit / reject, and "always allow this class".
Acceptance is in §8.

### 5.2 The agent runtime (closes G3)

An **agent definition** is data, not a route:

```
id, persona, goal (one sentence), tools (capabilities), policy (risk ceiling, budget),
triggers [ schedule | event | manual | inbound-message ],
inputs (what it reads), outputs (proposals or artifacts), success check (how it knows it is done)
```

The runtime provides: trigger dispatch (a cron fan-out plus an event bus over the existing event log); **durable
runs** (state in `agent_runs` and the existing chat event log, resumable after a crash, with the single request
clock of §4.5); a **plan step** (the run writes its plan as the first event, so a person can read intent before
action); **memory** (§5.3); **budgets** per definition; and a **dry-run mode** that executes everything except
`commit`. The two bespoke agents (outreach tick, campaign engine) are re-expressed as definitions; nothing else
about them changes. New agents (§6) are then a definition and a test, not a route.

### 5.3 Entity identity and memory (closes G6, G7)

- **Entity graph.** A single `entities` identity (type, canonical id) for firm, person, company, fund, LP, deal;
  existing tables keep their rows and gain a `entity_id`. Identity resolution is **one service** with the rules
  already proven this week (accent folding, acronym and former-name aliases, initials, website host, same-name
  collision guard) and a **review queue** for the cases it will not decide. The import conflict CSV becomes a
  queue in SAIL ([38](38-sail-monitoring-and-admin.md) §3.4), not a file in Downloads.
- **Provenance on every field.** Where a value came from, when, and how sure (the founder profile already stores
  provenance per field; extend the same shape to directory fields).
- **Entity memory.** Durable facts about an entity, scoped to a workspace, each with provenance and an expiry:
  `(entity, key, value, source, confidence, valid_until)`. Agents read it as context and write to it only through
  `propose`. A memory a person edits is pinned.
- **Freshness.** Every directory record carries `verified_at` and `activity_at`; stale records are down-weighted in
  ranking (the recency component exists) and queued for re-verification by an agent.

### 5.4 Governance: traces, evals, budgets (closes G4, G5, G9)

- **Run traces.** One structured record per run: plan, each model call (provider, model, lane, tokens, cost,
  latency, outcome), each tool call (input hash, duration, result size, error), the final answer, every proposal
  it made, and the request clock at each step. Streamed calls record too (doc 30's open finding). Logs carry the
  run id so a platform-level timeout is still attributable.
- **Evals.** A versioned golden set (`evals/`), starting from the cases we have run by hand: a matching run for a
  pre-seed healthcare deck, a US-VC-sports mandate, a Germany climate search with a stated country, the
  count-claim correction, an import that must add nothing on re-run. Each case asserts structure and invariants
  (no duplicate firm, scores strictly ordered, count equals tool count, location required, no unstated check
  size used), not exact text. Run **on every deploy** against production data read-only and **nightly**; results
  are stored and charted (SAIL).
- **Scale budget in CI.** A directory-sized fixture (21,000 firms) and a time budget on every function that
  touches it. A change that goes quadratic fails CI.
- **Dependency checks.** A startup and nightly check that every external dependency a feature names (search,
  OCR, email, DNS, model lanes) answers from the production runtime, reported to SAIL. (`web_search` would have
  failed this on day one.)
- **Spend.** The per-run ceiling exists ([33](33-cost-ceiling.md)); add a per-workspace daily ceiling and a
  platform alert threshold.

### 5.5 Surfaces

The assistant and Anker AI stay the conversational surface; the **approval inbox** and a **run timeline** are the
new first-class surfaces; MCP and the browser extension call the same capabilities (so they inherit policy).
Email-in is added later (§6.2 inbound).

---

## 6. The modules, as agent jobs

For each persona: the system-of-record work to finish, then the agent jobs, each with its autonomy ceiling. A
job ships when its acceptance (§8) passes. "Today" is from §2.

### 6.1 Founder: run the raise

| Agent job | Reads | Proposes / commits | Ceiling | Today |
| --- | --- | --- | --- | --- |
| Match and rank investors (with mandate) | deck, profile, directory | ranked workbook, saved run | R0 | **done** |
| Keep the pipeline current | replies, calendar, calls | stage moves, tasks, notes | R0 auto after enable | blocked (`crm_*`) |
| Run outreach waves | approved sequences, suppression | send batches | R2 per batch | engine exists, no approval inbox |
| Follow-up sweep | stale contacts | drafts for approval | R2 | drafts exist |
| Weekly raise brief | pipeline, activity, signals | a one-page update to the founder | R0 | missing |
| Data room readiness | data room, checklist | gap list, requests | R1 | tools exist (`dataroom_*`) |
| Round modelling | cap table, term sheets | scenarios, dilution | R0 | tools exist |

System of record to finish: one CRM per persona is built ([25](25-per-persona-crm.md)); cap table, 409A, share
plans, term sheet are screens and need the proposal path (a model change is a proposal, not a direct edit).

### 6.2 VC: run the fund

| Agent job | Reads | Proposes / commits | Ceiling | Today |
| --- | --- | --- | --- | --- |
| Deal intake and screen | inbound decks, forms, email | deal record, first screen, scorecard | R1 | deal pipeline view only |
| IC memo | deal, data room, calls | memo draft with cited evidence | R0 | `ic_memo` tool exists |
| Portfolio monitoring | KPIs, updates, signals | alerts, update requests, KPI rollup | R1 | `portfolio_kpi_rollup` exists |
| LP reporting | positions, KPIs | quarterly report draft, LP Q&A answers | R1 / R2 on send | report tables exist |
| Capital calls and distributions | fund, LP positions | drafted call/distribution | **R3 propose only** | `draft_capital_call` exists |
| KYC/AML | cases, screening hits | case triage, evidence pack | **R3** | module is a screen |
| Compliance calendar | deadlines, filings | reminders, filing drafts | R1 / R3 on file | digest cron exists |
| LP prospecting | directory, matching | ranked LPs, outreach | R2 | LP matching exists |

This is where the ERP claim lives or dies. The fund-operations modules (KYC, fund tax, SPVs, loans, contracts)
each need the same audit before any agent touches them: *what is the workflow a GP follows, which step is a
decision, which is a lookup*. Agents take the lookups first.

### 6.3 LP: watch the capital

Read-only by design: positions, capital account, distributions and documents, with an assistant that answers
from the fund's own records and **cites the record**. Ceiling R0 throughout; any request that implies action
(redemption, transfer) is routed to the GP as a proposal on the GP's queue.

### 6.4 What Anker must expose to SAIL

SAIL is the operator console ([38](38-sail-monitoring-and-admin.md)). Anker owes it, behind the existing
service-token relay and allowlist: run traces and AI usage (read), the proposal queue roll-up (read, plus
staff-only force-reject), eval results (read), dependency check results (read), cron/job health (read), import and
identity review queues (read/write), tenant usage metrics (read), and feature/entitlement flags (read/write).
The contract is listed in [38](38-sail-monitoring-and-admin.md) §5.

### 6.5 The directory as a product

The directory (firms, people, activity) is the asset every persona depends on. It needs an owner and an SLO:
identity resolution service and review queue (§5.3); freshness agent (re-verify, re-activity); conflict
policy ("fill what is empty, never overwrite, record disagreements", [24](24-directory-import.md)) turned into a
queue with a decision log; per-source quality scores; and the import path gated by the same dry-run → approve →
apply flow as every other R1 action.

---

## 7. Metrics: how we know it is working

| Outcome | Measure | Target by end of phase 4 |
| --- | --- | --- |
| Agents do the routine work | share of routine actions executed by agents (proposals applied ÷ all CRM/outreach/report changes) | > 60% for founder, > 40% for VC |
| Humans review exceptions | proposals approved unchanged ÷ decided | > 85% (else the agent is wrong, not the human lazy) |
| Safe | irreversible actions taken without approval | 0 |
| Reliable | run success rate; p95 run time; hung/timeout runs | > 97%; < 120 s; 0 bare 504s |
| Correct | eval pass rate on every deploy; nightly drift | 100% invariants; no regression > 2 pts |
| Cheap | cost per completed job | tracked per job, ceiling per workspace |
| Clean data | duplicate rate in the directory; stale (> 12 months) share | < 0.5%; < 15% |

---

## 8. Roadmap with acceptance

Phases are ordered by what unblocks the rest. Each ends in a demo a partner could watch.

**Phase 0 — Foundations (the 504 class never returns).**
Run traces with run id in every log line; streamed calls recorded; dependency checks (nightly and on deploy);
directory-scale fixture and time budgets in CI; evals v0 (the five hand-run cases) wired to CI and a nightly job.
*Acceptance:* a deliberately slowed run produces a trace that names the slow step; CI fails on a quadratic change
to firm clustering; evals fail when a golden case is made wrong on purpose.

**Phase 1 — The action layer and the approval inbox.**
`action_proposals`, the three capability kinds, risk classes, the inbox UI, undo records; move `crm_update_stage`,
`crm_add_task`, `enrich_firms`, `build_investor_profile` off `BLOCKED` onto `propose`; audit events for every
decision; owner-set autonomy per class.
*Acceptance:* "move the stale contacts to *Contacted* and add follow-up tasks" yields one proposal with a diff;
approving applies it once (idempotent on retry) and an undo restores the prior state; with auto-commit enabled for
R0, the same request commits without a click and still appears in the log; an R3 capability can never auto-commit
whatever the setting.

**Phase 2 — The agent runtime.**
Agent definitions as data; schedule and event triggers; durable resume; dry-run; per-definition budgets; the
outreach tick and campaign engine re-expressed as definitions with no behaviour change.
*Acceptance:* a new agent ("weekly raise brief") ships as a definition plus a test with no new route; killing the
process mid-run and restarting resumes it; dry-run produces the proposals it would make and applies none.

**Phase 3 — Identity and memory.**
`entities` and `entity_id` on firm/person/fund/LP/company; the identity service and its review queue; provenance
on directory fields; entity memory with expiry; freshness agent.
*Acceptance:* the same real firm written four ways resolves to one entity across founder, VC and LP views;
re-importing the 2026-10 drop adds nothing and surfaces its conflicts in the queue; a stated fact on a deck is
retrievable with its source on the next run.

**Phase 4 — The founder loop, closed.**
Pipeline-keeping, outreach waves through the inbox, follow-up sweep, weekly brief, data-room readiness.
*Acceptance:* a founder connects a deck and a mailbox and, a week later, has a current pipeline, a drafted next
wave awaiting approval and a one-page brief, having made only approvals.

**Phase 5 — The VC fund loop.**
Audit each fund-operations module (§6.2) → workflows; deal intake and IC memo; portfolio monitoring; LP reporting;
capital call and distribution proposals (R3, two-person).
*Acceptance:* a quarter-end for a test fund: LP reports drafted from KPIs with every figure traceable to a record,
capital call proposal with a human two-person approval, compliance calendar current.

**Phase 6 — LP and the network.**
LP assistant with cited answers; GP-routed requests; LP prospecting.
*Acceptance:* an LP question is answered with the record it came from, and an action request lands on the GP queue.

Phases 0 and 1 are the commitment; later phases are re-planned from what they teach. Rough size: P0 about two
weeks, P1 three, P2 three, P3 four; P4–P6 each about four, in parallel where teams allow.

---

## 9. Security, tenancy and compliance

- Policy is evaluated server-side on every `commit`, against the **acting principal** (persona, role, workspace),
  never against the model's claim. The existing `canUseTool` becomes `canUseCapability` and gains the risk class.
- The owner tier stays firewalled from tenant private records ([00](00-persona-isolation.md), owner-account
  rules). SAIL reads aggregate and trace data, not tenant private records, except through an audited view-as grant.
- Proposals and traces store **no prompt text** by default (the call log already does not); evidence is stored as
  references to records, not copies.
- Third-party sends keep suppression, rate limits and the deliverability gate; R2 is never auto-committed.
- Regulatory actions (R3) always keep a human decision of record. Anker does not decide KYC outcomes, file, or move
  money.
- Redaction and secrets rules unchanged; no customer name enters the repository.

---

## 10. Decisions for the founder

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Default autonomy: ship with R0 auto-commit **on** or **off**? | Off at launch; owners turn it on per class after seeing the inbox for a week |
| D2 | One database or per-tenant? | Keep the shared database and scope keys; revisit only at enterprise demand |
| D3 | Fund-operations modules (KYC, tax, SPVs, loans, contracts): build, partner, or integrate? | Audit first (Phase 5); integrate regulated parts (screening, e-signature) rather than build |
| D4 | Retire the in-app `/dashboard/admin` once SAIL has parity? | Yes ([38](38-sail-monitoring-and-admin.md) §4) |
| D5 | Which persona leads the next quarter? | Founder loop (Phase 4): it is the revenue product and the shortest path to proof |
| D6 | Model policy: stay Qwen-first? | Yes; the router and the eval harness are what make a model swap safe |

---

## 11. Non-goals

A general-purpose workflow builder; a second chat product; replacing the matching engine; autonomous financial,
legal or regulatory action; per-tenant infrastructure; building screening or e-signature ourselves.

---

## 12. First two weeks (if approved)

1. Trace record and run id through the loop, the tools and the logs (Phase 0).
2. Directory-scale fixture and time budgets in CI; nightly dependency check.
3. Evals v0: the five cases, run on deploy.
4. `action_proposals` table, the capability kinds, the first `propose` capability (`crm_add_task`), and a minimal
   inbox page, behind a flag.

The Phase 1 demo (one proposal, approved, applied once, undone) is the milestone that turns "assistant" into
"operator".
