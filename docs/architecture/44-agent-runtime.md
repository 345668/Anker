# 44. The agent runtime (Phase 2)

Status: design 2026-10-05. Implements [37](37-anker-agentic-venture-erp.md) §5.2 and Phase 2 (the "Phase 2 minimum" of §13.1 weeks 7–8). Builds on the action layer in [43](43-action-layer-and-approval-inbox.md): an agent never writes to a workspace itself, it **proposes**.

## 1. The problem

Anker has two bespoke agents (the outreach tick and the campaign engine), each a route with its own loop, its own table (`agent_runs`, keyed to a single CRM entry) and no way to pause it, dry-run it, or see what it
did across a workspace. A new agent today means a new route, a new table and new bespoke safety. There is no scheduled work for a workspace at all: nothing keeps a pipeline moving while the founder is away.

## 2. Scope of this change (the minimum that proves the runtime)

In: agent **definitions as data**; a runtime with **durable, resumable runs**, **schedule and manual triggers**, **dry-run**, a **per-run budget**, and **kill switches** at three levels; two real definitions, **Pipeline keeper** and
**Weekly brief**; a per-workspace enable switch; the Agents page; proposals made by an agent labelled with it in the inbox; tests including a crash-and-resume; the cron dispatcher.
Out (named so they are not mistaken for done): event and inbound-message triggers; re-expressing the two bespoke outreach agents as definitions (they send mail, an R2 action, and need the per-batch approval work first; they keep running unchanged);
memory (§5.3); model-written narrative (the two first agents are deterministic on purpose, §6); evals on deploy and the SAIL view of them (S-3, S-8); a definition editor (definitions ship in code, reviewed like code).

## 3. Definitions are data

```
AgentDefinition { id, version, title, summary, personas, riskCeiling ("R0".."R3"), maxSpendUsd, schedule (cron-ish: "weekly:mon@07" | "daily@07"),
                  config schema + defaults (e.g. staleDays), steps: ordered [{ id, label, run(ctx) -> JSON }] }
```
Kept in a registry in code (`lib/agents/runtime/definitions.ts`): plain objects with no routes, versioned, tested, and shipped through review, so an agent cannot be added or loosened without a deploy. Workspace choices live in the database: `agent_settings (org_id, agent_id, enabled, config, enabled_by)`. A definition
declares a **risk ceiling**: the runtime refuses to let a step propose a capability above it (both starting agents are R0).

## 4. Runs are durable

`agent_executions` holds one row per run: `id, org_id, agent_id, agent_version, trigger (schedule|manual), mode (live|dry_run), status (queued|running|succeeded|failed|killed|budget_stopped|stale),
period_key, plan, state (jsonb: each finished step's output), output, error, spend_usd, run_id, attempts, heartbeat_at, started_at, finished_at`.
- **The plan is written first**: before any step runs, the definition's step labels are stored so a person can read what the run will do.
- **Each step's output is checkpointed** to `state` as it completes. A run that dies (a platform kill, a deploy) leaves `running` with a stale heartbeat; the dispatcher finds it after 10 minutes and **resumes**: finished steps are skipped and their stored outputs reloaded, the next step runs. Because proposals are idempotent per `(execution, step, input)`, a step replayed after a crash never duplicates a proposal. Three attempts, then `failed` for a person.
- **Exactly one run per period**: `(org, agent, period_key)` is unique for scheduled runs (the ISO week for weekly agents, the date for daily), so a double dispatch or two overlapping cron invocations cannot run an agent twice. Manual runs get their own key.
- **One clock**: a run has the request deadline of the invocation (300 s) and stops with `stale` at the limit to be resumed, never half-writing.

## 5. Safety

- **Kill switches, checked before the run and between every step:** (1) the workspace's own switch for that agent (off by default; an owner or admin turns it on); (2) a platform flag `agents_disabled_<agent_id>` (and `agents_disabled` for all), set by staff in SAIL, which stops the next step of a run already in flight; (3) the entitlement pause (a paused or offboarding workspace runs nothing, via the existing `assertAllowed`). A killed run ends `killed` with the reason.
- **Agents propose, people decide.** Every write an agent wants goes through `propose` (doc 43) with the agent's id and execution id on the proposal; it applies by itself only where the workspace owner enabled R0 auto-apply, exactly like the assistant. Dry-run records what it *would* propose in the run's output and creates **no** proposals.
- **Whose authority:** a run acts as the person who enabled it (`enabled_by`), resolved through the same principal as the assistant at run time; if they have left the workspace or lost write access, the run fails closed rather than falling back to someone else.
- **Budget:** `maxSpendUsd` per run via the existing run budget; the two first agents use no model, so their spend is zero by construction, which is stated and tested.
- **Untrusted input:** these agents read only the workspace's own records, so their proposals are `trusted`; a definition that reads the web or inbound messages must mark its run untrusted, which already caps it (doc 43).

## 6. The two first agents (deterministic on purpose)

Principle 1 of 37 (the tool decides facts, the model decides words): both can be done with queries and templates, which makes them cheap, testable and impossible to hallucinate. A model-written narrative is a later, optional step.
- **Pipeline keeper** (founder, VC; daily 07:00). Finds contacts in *Contacted* or *Responded* whose last contact is older than `staleDays` (default 14) and that have no open task, and proposes one follow-up task each ("Follow up with Ann Investor — no contact for 18 days"), at most 10 per run, oldest first. Never moves a stage and never contacts anyone.
- **Weekly brief** (founder, VC; Monday 07:00). Writes a short brief from counts: contacts by stage, what moved this week, overdue and due-this-week tasks, proposals waiting in the inbox, and for a fund the deal pipeline by stage. Stored on the run and shown on the Agents page. Proposes nothing.

## 7. Surfaces and routes

`/dashboard/agents` (nav, under AI): each definition with its summary, an on/off switch (owner/admin), its schedule, **Run now** and **Dry run**, the latest runs with plan, status, output and proposals made. Routes: `GET /api/agents` (definitions, settings, recent executions), `PUT /api/agents/settings`, `POST /api/agents/run { agentId, mode }` (session only, never the assistant principal),
and the dispatcher `GET /api/cron/agents` every 15 minutes (fan out due runs, resume stale ones; tracked by `trackCron`, and added to the stale-job monitor). The inbox labels an agent's proposals ("Pipeline keeper").

## 8. Risks and answers

| Risk | Answer |
| --- | --- |
| An agent loops or floods the inbox | Per-run cap on proposals, one run per period, three attempts, kill switches between steps |
| A crash duplicates work | Checkpointed steps; proposals idempotent per execution and step |
| A run acts for someone who has left | Fails closed on principal resolution |
| Two dispatchers race | Unique `(org, agent, period_key)`; a claim by conditional update on status |
| A bad definition ships | Definitions are reviewed code with tests; risk ceiling enforced by the runtime, not by the definition |
| Cost surprise | No model in the first two; the budget mechanism is wired and tested for the first model-using one |

## 9. Tests

Against PGlite with the real migration: plan written first; steps checkpoint; **crash and resume** (a step throws after another finished: the resume skips the finished step and does not duplicate proposals); one run per period under concurrent dispatch; dry-run creates no proposals; each kill switch stops a live run between steps; a left member fails closed; the risk ceiling refuses a higher-class proposal; Pipeline keeper picks the right contacts (stale, no open task, capped, oldest first, other workspaces ignored); Weekly brief counts match the data; the dispatcher resumes stale runs and ignores disabled workspaces. Acceptance is 37 Phase 2, restated: a new agent ships as a definition plus a test with no new route; killing the process mid-run and restarting resumes it; dry-run applies nothing.

## 10. Built and verified, 2026-10-05

Built: migration `2026-10-05b-agent-runtime.sql` (applied to production; also adds `agent_id` and `execution_id` to `action_proposals`), `lib/agents/runtime/{model,definitions,engine}.ts`, routes `/api/agents`, `/api/agents/settings`, `/api/agents/run`, the dispatcher `/api/cron/agents` (every 15 minutes, in `vercel.json` and the stale-job monitor), `/dashboard/agents` (nav, under AI), the "Proposed by" label in the Actions inbox, and the two new tables in the tenant erasure registry. Staleness is judged by the database clock only, so a worker's clock cannot make a live run look dead.

Tests: 19 against PGlite with the real migrations (schedules and periods, the plan written first, oldest-first and capped proposals, dry-run creates nothing, crash and resume reusing stored step results with no duplicate proposals, a dead run resumed and a live one left alone, three attempts, two claimants run once, one run per period under repeated dispatch, workspace and platform kill switches before and between steps, a paused workspace, a left member failing closed, the risk ceiling, brief counts matching data); the full suite passes (1276 tests).

Verified against production with a throwaway workspace (removed afterwards): a dry run named the two quiet contacts and created nothing; with the agent enabled and the clock past 07:00 UTC the dispatcher started exactly one run and a second dispatch started none; the proposals were labelled with the agent and no task existed until approval; the platform kill flag stopped a run with its reason; the weekly brief's counts matched the data. Before 07:00 UTC the same dispatch correctly started nothing.
Not verified: the Agents page and the run/settings routes (they need a signed-in session), and the cron firing on Vercel's own schedule.
