# Call agent bridge — design

**Date:** 2026-09-19 · **Status:** proposal, nothing built · **Spans:** Anker,
`anker-call-intelligence`

Goal: while a founder or VC is on a call, the desktop companion should be able
to get useful work out of Anker's agents — not just transcribe and sync
afterwards.

This document exists because that sentence hides three decisions that lead to
materially different systems. It answers them, says why, and records what was
rejected.

---

## 1. What already exists

Most of the substrate is built. Listing it first so none of it gets rebuilt.

| Piece | Where | State |
| --- | --- | --- |
| Device authentication | `lib/calls/devices.ts` | Done. `anker_call_<43 chars>` bearer, SHA-256 at rest, revalidates membership, workspace archive and persona **on every request** — not just at pairing. |
| Call records | `lib/calls/records.ts` | Done. Org-scoped, content-hashed, idempotent per call. |
| Agent tool belt | `lib/assistant/tools*.ts` | Done. 27 tools across four modules, persona-scoped by `lib/agents/presets.ts`. |
| Agent loop | `lib/assistant/agent.ts` | Done. ReAct-style JSON tool loop over `lib/ai/provider.ts`. |
| Qwen inference | `lib/ai/model-router.ts` | Done. DashScope tier chains, key encrypted since `f76c378`. |
| Outreach approval gate | `lib/outreach/deliver.ts` | Done, and load-bearing: a message is written `queued` and only a claimed `queued → sending` transition sends it. |
| Desktop → Anker sync | `src/anker-sync.js` | Done, but one-directional and post-hoc. |

**The gap is not capability. It is that nothing lets a live call reach the tool
belt, and nothing decides what an agent may do while no one is watching it.**

## 2. Three decisions

### 2.1 Where does the agent run?

**Decision: server-side, in Anker. The desktop never runs agent tools.**

This is not a preference — it falls out of what the tools are. `crm_update_stage`,
`crm_add_task`, `crm_search`, `deal_pipeline`, `outreach_inbox` and
`fund_performance` all read and write Anker's database under an org scope. A
desktop process cannot hold that scope without holding a database credential,
and the moment it does, revocation stops being possible.

So the bridge is: desktop sends context, Anker runs the agent, desktop shows the
result.

**This dissolves the key-custody question entirely.** The agent runs where the
Qwen key already is (encrypted in `ai_router_v1`, decrypted server-side per
call), so no provider key ever has to be distributed to a laptop for agent work.
The desktop keeps its own provider key for its overlay copilot and local
transcription, which is a separate concern and stays as it is.

Rejected: shipping short-lived scoped DashScope tokens to devices. It solves key
rotation and nothing else — the tools still could not run there.

### 2.2 May an agent act during a live call?

**Decision: no. During a call, agents propose. A human applies.**

Three independent reasons, any one of which is sufficient:

1. **The input is unreliable.** The agent's view of the conversation is
   speech-to-text output. Whisper mishears names, numbers and negations. An
   agent that moves a deal to `committed` because it heard "we're in" when the
   investor said "we're in principle interested, but" has written a falsehood
   into the CRM that nobody watched it write.
2. **The user cannot supervise.** They are talking. The defining property of
   this moment is that their attention is elsewhere, which is exactly when
   unattended writes are least safe.
3. **It breaks an existing invariant.** `lib/outreach/deliver.ts` never sends
   without a human transition through `queued`. An agent that could send from a
   call would be a second path around a gate that was deliberately built.

So the bridge produces **proposals**: structured, reviewable, one-tap to apply,
and discarded if ignored.

#### The reversibility test

Not every action deserves the same friction. Proposals are classified by what
happens if the agent is wrong:

| Tier | Meaning | Examples | During a call |
| --- | --- | --- | --- |
| **Observe** | Reads only. Being wrong costs a wasted lookup. | `crm_search`, `deal_pipeline`, `network_intro_paths`, `fund_performance`, `web_search` | **Runs automatically.** |
| **Propose** | Writes something reversible inside Anker. | `crm_update_stage`, `crm_add_task`, drafting a follow-up | **Queued for one tap.** |
| **Never** | Leaves the building, or cannot be undone. | sending email, LinkedIn actions, anything in `lib/outreach/deliver.ts` | **Not offered at all.** |

"Never" is not a permission an admin can grant. It is the class of action whose
consequence is outside our system, where an undo does not exist — a sent email
has been read. Those stay where they already are: the outreach queue, after the
call, with the existing gate.

The tier is a property of the tool, declared next to its definition in
`lib/assistant/tools*.ts`, not a config value. A tool whose blast radius changes
should have its tier changed in the same commit.

### 2.3 How does "real-time" actually work?

**Decision: desktop-initiated request/response on transcript milestones. No
persistent connection, no server push.**

The desktop already holds a durable segmented buffer (`src/capture-buffer.js`).
It sends a window of recent transcript when something worth reacting to happens
— a speaker turn completes, a threshold of new text accrues, or the user
explicitly asks.

Why not SSE or WebSocket: Anker runs on Vercel serverless with a bounded
`maxDuration`. A held-open connection is a fight with the platform, and it buys
nothing here — the desktop is the only thing that knows when new speech exists,
so it is the natural initiator. It also means the existing device-token bearer is
the entire auth story.

**Latency budget.** A proposal that arrives after the topic has moved on is
noise. Target under 2 s from request to first proposal, which rules out the deep
tiers: this path uses `qwen-flash` (the `fast` tier in
`DASHSCOPE_TIER_CHAINS`), a bounded step count, and the Observe tools only.
Anything needing `deep` or `reason` belongs to post-call analysis, which already
exists and has no latency constraint.

---

## 3. Shape

```
  desktop                         Anker                        agent
  ───────                         ─────                        ─────
  capture-buffer
      │  turn completes
      ├──► POST /api/calls/agent ──► authenticateDevice()
      │    { callId, window,        (lib/calls/devices.ts)
      │      hint? }                     │
      │                                  ├─► rate limit, per device
      │                                  ├─► runAssistant(persona-scoped,
      │                                  │     Observe tools, fast tier)
      │                                  │
      │                                  └─► persist proposals
      │◄───── { proposals[] } ◄───────────┘   (call_agent_proposals)
      │
   overlay shows them
      │  user taps "Apply"
      ├──► POST /api/calls/agent/apply ──► re-auth, re-check tier,
           { proposalId }                   execute the single tool,
                                            audit, mark applied
```

Two endpoints, both device-authenticated:

- `POST /api/calls/agent` — context in, proposals out. Never writes anything
  outside `call_agent_proposals`.
- `POST /api/calls/agent/apply` — applies exactly one proposal, by id.

**Apply re-validates everything.** It does not trust the proposal row: it
re-authenticates the device, re-resolves the org scope, re-checks the tool's
tier, and confirms the target still exists and still belongs to that workspace.
A proposal generated twenty minutes ago under a membership that has since been
revoked must not apply. This is the same reasoning as `authenticateDevice`
revalidating membership per request rather than at pairing.

**Proposals expire.** An unapplied proposal is dead once the call ends, plus a
short grace period. Stale advice about a conversation that has finished is worse
than none, and an expiry means the table cannot become a queue of forgotten
half-decisions.

## 4. Schema

One table. Org-scoped like everything else in `lib/calls/`.

```sql
CREATE TABLE call_agent_proposals (
  id          text PRIMARY KEY,
  call_id     text NOT NULL REFERENCES investor_calls(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  org_id      text NOT NULL,
  tool        text NOT NULL,           -- must be a Propose-tier tool at apply time
  args        jsonb NOT NULL,
  rationale   text,                    -- what the agent heard; shown to the user
  transcript_offset int,               -- which moment produced it, for review
  status      text NOT NULL DEFAULT 'offered'
              CHECK (status IN ('offered','applied','dismissed','expired','failed')),
  applied_at  timestamptz,
  error       text,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_agent_proposals_live_idx
  ON call_agent_proposals (call_id, status, created_at DESC);
```

`rationale` is not decoration. A proposal the user cannot evaluate in one glance
will either be applied blindly or ignored entirely, and both defeat the point.
It should quote the span of transcript it came from.

## 5. Failure modes worth designing for now

- **The agent is confidently wrong.** Mitigated by the tier system, `rationale`,
  and expiry. Not eliminated. The honest position is that an Observe-only live
  path plus reviewable writes is the safe envelope; widening it needs evidence
  from use, not optimism.
- **Cost runs away.** Every speaker turn is a potential inference. Needs a
  per-device rate limit (`lib/rate-limit.ts`), a minimum interval between runs,
  and a per-call ceiling. Without these a long call is an unbounded bill.
- **The workspace changes mid-call.** Handled: `authenticateDevice` revalidates,
  and apply re-checks. A revoked device's pending proposals simply stop applying.
- **Transcript leaves the device.** Today the desktop only uploads a transcript
  the user explicitly selects. This path sends windows continuously, which is a
  **material change to the privacy story** and must be stated plainly in the app
  — a toggle that is off by default, not buried consent. Local Whisper keeping
  audio on the device is currently a selling point on the install page; this
  feature does not break that, but it does mean text leaves, and users should be
  told in those words.
- **Anker is unreachable.** The overlay must degrade to its existing local
  copilot silently. A call is not the moment to surface a sync error.

## 6. Explicitly not in scope

- Agents acting without the user, during or after a call.
- Any outreach send path. That gate stays where it is.
- Streaming transcript to Anker for storage. Windows are for reasoning; the
  stored transcript remains the one the user chooses.
- A new inference credential for devices. §2.1 removes the need.

## 7. Phases

1. **Observe only.** `/api/calls/agent` with the read-only tools, no proposals
   table, results shown in the overlay and forgotten. Proves the latency budget
   and the cost profile against a real call before any write path exists.
2. **Proposals.** Add the table, the Propose tier, and apply-with-re-validation.
3. **Tighten from evidence.** Which proposals get applied, which get ignored, and
   what the per-call cost actually is. Ignored proposals are the signal — a tier
   nobody applies is a tier that should not be generated.

Phase 1 is genuinely useful on its own: "who at this fund led our last round",
"what stage is this deal", "who do we know here", answered mid-sentence without
the user leaving the call. That is most of the value, at none of the risk.

---

## Open questions for the product owner

1. **Is the continuous-transcript change acceptable?** §5 — it is the one thing
   here that alters what the app promises about data leaving the machine.
2. **Should Observe run automatically, or only when asked?** Automatic is more
   useful and more expensive, and it means inference on every turn of every
   call. My recommendation is automatic with a hard per-call ceiling, but this is
   a cost decision.
3. **Does `crm_update_stage` belong in Propose at all?** Deal stage is a number
   other people make decisions on. It may deserve to be post-call only, even with
   a tap.
