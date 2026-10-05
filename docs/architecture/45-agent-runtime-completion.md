# 45. Completing the agent runtime: staff control, evals, events, model agents, memory, outreach

Status: design 2026-10-05. Finishes what [44](44-agent-runtime.md) §2 listed as not built. Same rule throughout: an agent proposes ([43](43-action-layer-and-approval-inbox.md)); a person or an owner-set policy decides. Each part below is independent and shippable on its own; the order is the order of build.

## 1. Staff pause screen in SAIL (S-8, the part that exists now)

Today staff must set the platform flags by hand, and the Flags page cannot create them (its key pattern has no dot). Decision: the kill flags become `agents_disabled` (everything) and `agents_disabled_<agent_id>` (one agent), which fit the existing flag editor, and the runtime reads those. SAIL gets **/agents** (admin and superadmin to change, staff to read): a switch for "all agents" and one per agent with a required reason (audited through the same `setFlag`), and **metadata only** per the firewall: runs in the last 7 days by agent and status, how many workspaces have each agent on, and recent failed or killed runs with workspace name, status and error text. Never a plan, output or record. A pause stops the next step of a run in flight (44 §5).

## 2. Evals

An **eval case** is a named invariant over behaviour, never over text. Two kinds, both in `lib/evals`:
- **Behavioural cases** (run in CI and nightly, against an in-memory database seeded by the case): no proposal above an agent's risk ceiling; an untrusted run never auto-commits even with the switch on; a dry run creates no proposals; a crash resumes without duplicates; a model agent given an **injected instruction** inside the data it reads proposes nothing it was not defined to, and its narrative cannot state a number that is not in its facts; memory written by an agent is `agent`-sourced and never overwrites a pinned entry.
- **Live read-only cases** (nightly, against production, SELECTs only): every enabled `agent_settings` row names a known agent and an enabling member who is still in the workspace; no execution has been `running` with a heartbeat over an hour old; no workspace has two executions for one agent and period; every applied proposal has an undo record or is of a kind that has none; no pending proposal is past its expiry for over a day; no enabled agent belongs to a paused workspace.
Results are stored (`eval_runs`: suite, case, pass/fail, detail, at) and the nightly cron (`/api/cron/evals`, tracked, in the stale-job monitor) records a failing case loudly (a `cron_runs` failure that the dependency check already surfaces); SAIL shows the last run and failures on `/agents`. **"On deploy"** is met by the behavioural cases being part of the test suite that gates the build; the live cases run nightly, not per deploy, because a deploy has no production state to inspect before it is live.

## 3. Event triggers

A small event table (`agent_events`: org, kind, subject id, payload, created, processed) and one emitter, `emit(orgId, kind, subject, payload)`, called where the fact happens, never from a model. First events: `crm.stage_changed` (from the stage-move capability when applied, and from the CRM routes that change a stage), `crm.task_completed` is not added until something uses it. A definition declares `triggers: [{ event }]` beside or instead of a schedule. The dispatcher turns each unprocessed event into at most one run per definition that listens for it, with the **event id as the period key**, so redelivery or a second dispatcher cannot run it twice; it respects the same switches, ceilings and dry-run. Events older than 7 days are dropped unprocessed (an agent must not act on stale news). First event agent: **Reply keeper**: when a contact moves to *Responded* it proposes a task "Reply to X" due in two days, unless the contact already has an open task. It reads nothing but the workspace's own record, so it is trusted R0.

## 4. Agents that use a model

The runtime's step context gains `generate(prompt)`, which runs inside the same `withAiContext` as the assistant: the workspace's plan, pause state and monthly AI allowance apply, the run has the definition's `maxSpendUsd` as a hard ceiling (a run over it ends `budget_stopped`, its finished steps kept), and spend is recorded on the execution. Rules for a model step: (1) the data it reads is passed fenced as data, never as instructions; (2) its output is **validated by code before it is used**: a narrative may contain only numbers that appear in the step's facts, and anything else discards it and keeps the deterministic text; (3) a model step can never call `propose`; it returns text, and proposals come from deterministic steps. First model use: the **Weekly brief** gains an optional "Write it up" step (a short paragraph in plain words), **off by default**, switched on per workspace; if the model fails, is over budget or fails validation the brief is the deterministic one, so the feature can only add. Task `agent_brief` on the balanced tier, ceiling $0.05 per run.

## 5. Memory

`entity_memory (org_id, entity_type, entity_id, key, value, source, confidence, valid_until, pinned, created_by, created_at)`: workspace-scoped tenant data (in the erasure registry and export; never shared across workspaces, never used for training). Written **only through `propose`** (capability `memory_remember`, R0), so a person sees what the system is about to remember and can reject it. A person-written or person-edited entry is `pinned`; an agent's proposal can never replace a pinned value (the apply refuses with the reason). Reads: an assistant tool `memory_recall` (read-only) and `recall()` for agents. Expiry (`valid_until`) is honoured on every read. First use: the Pipeline keeper skips a contact with a live `follow_up_paused` memory, so "stop chasing Ann until March" is something the system keeps. The Agents page lists the workspace's memory with delete for owners and admins; delete is audited.

## 6. The outreach agents

Facts first (read from the code, not the earlier assumption in 44): the **tick agent** (`lib/agents/outreach-agent.ts`) never sends: it enriches a firm, builds a profile, drafts the sequence, classifies a reply and syncs the stage. It does two things a tenant must not do through a definition: `enrichFirm` writes the **shared directory**, and sending (the campaign engine, `lib/outreach/engine.ts`) is a separate, already approval-gated path with its own gates (suppression, country gate, sender caps). So:
- **Re-express the tick agent as a definition** with steps *profile* (read), *draft* (writes `outreach_messages` drafts for that workspace, so it becomes a `propose` capability `outreach_draft_sequence`, R1, one proposal per contact with the drafts as the diff), *classify reply* (reads an inbound message, so the run is untrusted) and *sync stage* (existing deterministic function). The *enrich* step is dropped from tenant runs (directory writes are an owner-console feature, doc 43 §12); it stays available through the owner route.
- **Sending stays where it is.** The per-batch approval for R2 is not rebuilt here: the campaign engine's existing "approve the batch, then the scheduler sends within caps" is the R2 gate, and a definition may not propose a send capability (none is registered, and the ceiling is R1). This is stated so the next reader does not mistake the gap for an oversight: the proposal layer gains an R2 capability only when sending moves into it.
- The existing manual button and `/api/agents/tick` keep working unchanged until the definition has run in dry-run beside them on real data; the cut-over is a separate, reversible decision.

## 7. Risks and answers

| Risk | Answer |
| --- | --- |
| A model agent is steered by text in the data | Data fenced; the model step cannot propose; output validated against the facts; an injection eval pins it |
| Event storms | One run per (definition, event); events expire in 7 days; per-workspace switch and platform kill apply |
| Memory becomes an unreviewed write channel | Writes only via `propose`; pinned entries immutable to agents; deletable and audited |
| A live eval reads tenant content | Live cases count and compare ids and timestamps only, never read content columns |
| Staff pause leaks tenant data | Metadata only: counts, statuses, error text, workspace name |
| Outreach definition drafts for a suppressed contact | Drafting is not sending; the send gates are unchanged and still apply at send time |

## 8. Tests

Each part ships with its own: flag-key rename and the kill path (engine); the eval runner and every case (CI); event dedup, expiry, and the Reply keeper (PGlite); model step budget stop, validation fallback and the injection case with a fake generator; memory propose/pin/expire/recall and the keeper skipping a paused contact; the outreach definition's draft capability and its untrusted classify step. SAIL's page is a thin read of the shared tables plus `setFlag`, tested at the query level.
