# 43. The action layer and the approval inbox (Phase 1)

Status: design 2026-10-05. Implements [37](37-anker-agentic-venture-erp.md) §5.1 and Phase 1, weeks 5–6 of §13.1. Depends on nothing unbuilt; Phase 2 (agent runtime) builds on it.

## 1. The problem

The assistant has five tools it is **not allowed to run** (`BLOCKED` in `lib/assistant/policy.ts`): `crm_update_stage`, `crm_add_task`, `enrich_firms`, `enrich_db_from_xlsx`, `build_investor_profile`.
They were blocked because a write by a model, on text it may have read on a web page, must not happen unreviewed, and there was nowhere to review it. So "move the stale contacts to *Contacted*
and add follow-up tasks" cannot be done at all, and `audit_events` carries no assistant action. Phase 1 gives blocked work a governed path instead of unblocking it blindly.

## 2. Scope of this change

In: the `action_proposals` table; a capability registry with `crm_update_stage` and `crm_add_task` as the first two `propose` capabilities (both class R0); the proposal lifecycle (pending, approved/applied,
rejected, undone, expired); an owner-set autonomy switch per workspace and risk class; the untrusted-input cap; audit events for every state change; the assistant routing; an inbox page, API and nav entry.
Out (named so they are not mistaken for done): `enrich_firms`, `enrich_db_from_xlsx`, `build_investor_profile` (they stay blocked; the registry makes them a one-entry addition each, in the next change),
R1 bulk capabilities, R2 sends (the outreach engine already has its own approval gate), R3 maker-checker, the SAIL roll-up (S-8), an "edit before approving" screen.

## 3. Model

```
action_proposals
  id, org_id, persona, requested_by (user), capability, input (jsonb),
  summary (one line), diff (jsonb: [{ label, before, after }]), evidence (jsonb: record refs, tool names),
  risk_class (R0..R3), run_id, chat_id, source_trust ('trusted' | 'untrusted'),
  status (pending | applied | rejected | undone | expired | failed),
  decided_by, decided_at, applied_at, undone_at, undo (jsonb), failure,
  idempotency_key (unique per org), auto_committed (bool), created_at, expires_at (14 days)
workspace_autonomy
  org_id, risk_class, auto_commit (bool), set_by, set_at      primary key (org_id, risk_class)
```

A proposal is one capability call. The inbox groups proposals by `run_id`, so one request that produces fourteen stage moves and fourteen tasks is one group with one "approve all"; the single-call
form is the same thing with a group of one. (37 says "one proposal with a diff"; grouping by run keeps each change independently undoable, which a single fat proposal would not.)

## 4. Capabilities

A capability is declared once: `kind` (`propose`), `riskClass`, an input check, and three functions.
- `plan(scope, input)` reads current state (never writes) and returns `summary`, `diff` and `evidence`; it fails for an input that names a record outside the workspace, so a bad proposal is refused when it is made, not when it is approved.
- `apply(scope, proposal)` performs the write, scoped by `org_id`, and returns the `undo` record (for a stage move: the id, the stage before and the stage applied; for a task: the new task id).
- `undo(scope, proposal)` reverses it only if the world still matches: a stage is restored only if it is still the stage that was applied; a task is removed only if it is not done. Otherwise it refuses with the reason ("moved again since"), because undo must never overwrite later work.

`crm_update_stage` and `crm_add_task` keep their tool names, descriptions and input schemas, so the model and MCP see no change except the observation: "Proposed: … (awaiting approval)", or "Done: …" when policy auto-committed.

## 5. Policy

- Risk classes follow 37 §5.1. R0 may auto-commit **only** if the workspace owner or an admin turned it on for the workspace, and **only** for `trusted` proposals. R1 needs one-click approval; R2 and R3 never auto-commit (no capability of those classes exists yet; the rule is enforced in code and tested so the first one inherits it).
- **Untrusted-input cap.** A run is marked untrusted the moment it reads external content: `web_search`, `web_crawl`, a fetched URL, an attachment (image, spreadsheet, PDF) or the outreach inbox (inbound replies are written by strangers). A proposal made in an untrusted run carries `source_trust = 'untrusted'`, is never auto-committed whatever the setting, and the inbox shows why. The mark is run-wide and sticky: after a web read, everything later in the run is treated as possibly influenced.
- Who may decide: any member who can write in the workspace (owner, admin, member; not an LP, not a read-only token). Who may change autonomy: owner and admin. A proposal can be approved by the person who asked for it (there is no second-person rule below R3).
- The assistant cannot approve: the approve route is a signed-in user session only, never the assistant principal or an MCP token, so a prompt-injected model can propose but cannot decide.

## 6. Lifecycle and idempotency

`pending` → `applied` (approve, or auto-commit) → `undone`; `pending` → `rejected`; `pending` → `expired` (14 days, applied lazily on read and by the existing cleanup path); an apply that throws → `failed` with the message, the write rolled back by the single statement it is. Approval claims the proposal with `UPDATE … SET status='applied' WHERE id=$1 AND status='pending' RETURNING`, and only the caller that gets the row applies it, so a double click or a retried request applies once; a repeat returns the stored result. `idempotency_key` (the run id plus a hash of capability and input) makes the assistant retrying the same call within a run return the existing proposal instead of a second one.

## 7. Audit

Every transition goes through `recordChange` (scope `org:<id>`, action `action_proposal.created|applied|rejected|undone|failed|auto_committed`, with who and the proposal summary), and the applied write itself is recorded as the underlying change (`crm_entry.stage_changed`, `crm_task.created`) with the proposal id in its context. The tenant's own history shows assistant and agent actions for the first time.

## 8. Surfaces

`/dashboard/actions` (nav: under the assistant group for founder and VC): pending groups with diffs and evidence, approve, approve all in a group, reject, and an Applied tab with Undo; an autonomy card for owners and admins ("Apply low-risk changes without asking" for R0, off by default, with the untrusted-input exception stated). Routes: `GET /api/actions`, `POST /api/actions/<id>` (approve, reject, undo), `POST /api/actions/bulk`, `GET/PUT /api/actions/autonomy`. The assistant's answer links to the inbox when it creates a proposal.

## 9. Risks and answers

| Risk | Answer |
| --- | --- |
| A proposal from an injected page changes records | Cap: untrusted proposals never auto-commit and always need a human who sees the evidence; the model cannot approve |
| Approval applies stale input (the record changed meanwhile) | `plan` runs at proposal time and `apply` re-reads at approval time, scoped by org; the diff shown is the proposal-time one, the undo record is the apply-time one |
| Undo clobbers later work | Undo checks the world still matches and refuses otherwise |
| Double apply | Atomic claim on `status='pending'`; idempotency key on creation |
| Cross-workspace access | Every read and write is scoped by `org_id` taken from the principal or session, never from input; tested with a foreign record id |
| Existing assistant tests assume the five tools are blocked | Two are moved to `propose`; the other three stay in `BLOCKED` and keep their tests |

## 10. Tests

Against PGlite with the real migration: plan/apply/undo for both capabilities; double approval applies once; foreign record refused at proposal time and at apply time; undo refused after a later change; auto-commit only when enabled and trusted; untrusted run never auto-commits; R2/R3 never auto-commit even if the switch is somehow set; expiry; the assistant tool path (blocked tools now propose; read-only and non-writing principals cannot); the approve route rejects a non-session principal. Acceptance is 37 Phase 1, restated: a request for several stage moves and tasks yields a group with diffs; approving applies each once and a retry changes nothing; undo restores the stage; with R0 auto-commit on, the same request commits and still appears in the log; a run that read a web page is capped.

## 11. Built and verified, 2026-10-05

Built: migration `2026-10-05-action-proposals.sql` (applied to production), `lib/actions/{model,capabilities,store,session}.ts`, routes under `app/api/actions`, the inbox at `/dashboard/actions` (nav, under AI), the assistant routing in `lib/assistant/registry.ts` (the run-wide untrusted mark in `context.ts`), and the two tables in the tenant erasure registry. `crm_update_stage` and `crm_add_task` left `BLOCKED` for the propose path; their old `run` bodies now throw, so nothing can reach the write except through the inbox. `enrich_firms`, `enrich_db_from_xlsx` and `build_investor_profile` remain blocked.

Tests: 14 against PGlite with the real migration (apply once, double approval, foreign record, undo refused after later work, expiry, auto-commit rules, untrusted cap, R1 to R3 never loosened, audit trail) and 5 on the assistant path (propose not write, read-only refused, web read or attachment marks the run untrusted); the full suite passes.

Verified against production with a throwaway workspace (removed afterwards): proposals changed nothing until approved; approval applied once and a repeat said "already applied"; undo restored the stage; the audit trail held created, applied and undone; with the switch on a trusted stage move applied by itself while an untrusted one stayed pending.
Not verified: the inbox page and the assistant's live tool call (they need a signed-in session), and the "approve" route's refusal of a non-session caller beyond its unit-level guard.
