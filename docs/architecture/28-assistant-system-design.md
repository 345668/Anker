# 28 — Assistant platform: system design and roadmap

**Date:** 2026-09-26 · **Status:** design, nothing built · **Companion to:**
[27](27-anker-ai-and-assistants.md) (what to take from t3code and why) ·
**Depends on:** [00 §2.2](00-persona-isolation.md) scope key,
[03 §4](03-persona-scoped-entities.md) per-persona assistant ·
**Succeeded by:** [29](29-agentic-core.md) — this document rebuilt everything
*around* the loop and left the loop alone; 29 is the loop and the routing key
beneath it

Doc 27 decided *what* to take. This is *how*: the target architecture, the data
model, the interfaces, and a phased roadmap with acceptance criteria for each
phase.

**Rule for this document:** every proposal names the row of doc 27 §2 it changes.
Anything that changes no row is a rewrite of working code and does not belong
here.

---

## 1. Goals

| # | Goal | Doc 27 §2 row |
| --- | --- | --- |
| G1 | One person's founder and VC assistant histories are different entities | Assistant history isolation — *not built* |
| G2 | A run that dies mid-tool-call can be resumed, and any step can be explained afterwards | Durable conversation state — *not built* |
| G3 | The user sees the assistant working, step by step, rather than a spinner | Streaming — *not built* |
| G4 | An approval-gated tool can park a pending intent instead of failing closed | Durable conversation state — *not built* |
| G5 | Each persona gets its own framing, tools and model tier | Per-persona identity — *partly built* |

### 1.1 Non-goals

- **Replacing the tool, policy or persona layers.** They are built and good
  (doc 27 §2). This design consumes them unchanged.
- **Multi-agent-provider abstraction.** `lib/ai/provider.ts` already falls back
  across Qwen, Anthropic and Ollama. A second routing layer solves nothing.
- **Effect, a monorepo, ACP, SSH/Tailscale, desktop or mobile shells.**
- **LP-specific behaviour beyond the shared shape.** An LP has no workspace until
  doc 01, so it has no scope to read from. The design must not *prevent* LP; it
  should not wait for it either.

---

## 2. Architecture

### 2.1 As-is

```
  client (dashboard/anker-ai, assistant panel)
      │  POST, blocks until complete
      ▼
  /api/assistant ─────────────┐        /api/anker/chat
      │                       │             │  text only, no tools
      │ requireAiPrincipal()  │             ▼
      ▼                       │        generate() ── provider chain
  lib/assistant/agent.ts      │
      │  ReAct loop, bounded  │
      ├─ toolsFor(principal) ─┤ policy.ts: canUseTool + validateToolInput
      ├─ executeTool() ───────┘
      ▼
  anker_chats.messages  ← one jsonb blob, user_id only
```

Two entry points, no streaming, history in a blob that no workspace owns.

### 2.2 Target

```
  client
      │  POST  ──────────────────────────────────►  SSE event stream
      ▼                                                    ▲
  /api/assistant                                           │
      │                                                    │
      ├─ requireAiPrincipal()  → AiPrincipal{scopeKey}      │
      │                                                    │
      ▼                                                    │
  ┌──────────────── conversation runtime ─────────────────┐│
  │  decider    pure: (state, input) → events             ││
  │     │                                                 ││
  │     ▼                                                 ││
  │  anker_chat_events   append-only, scope_key ──────────┼┘
  │     │                                                 │
  │     ▼                                                 │
  │  reactors   perform side effects for an event         │
  │     ├─ tool.execute   → executeTool()  (unchanged)    │
  │     ├─ model.generate → provider       (unchanged)    │
  │     └─ approval.park  → awaits a human                │
  └───────────────────────────────────────────────────────┘
      │
      ▼
  anker_chats  ← projection: title, model, last message, scope_key
```

The decider/reactor split is doc 27 §4.1. Its value is that **intent is durable
before any work happens**: the event saying "call `crm_update_stage` with these
arguments" is written before the call, so a crash leaves a resumable record and an
approval gate has something concrete to hold.

`executeTool`, `canUseTool`, `validateToolInput`, `toolsFor` and `PERSONA_AGENTS`
are consumed **unchanged**. This design adds a layer above them; it does not
reach into them.

---

## 3. Data model

### 3.1 `anker_chat_events` — the log

```sql
CREATE TABLE anker_chat_events (
  id          bigserial PRIMARY KEY,          -- ordering within a chat
  chat_id     text NOT NULL REFERENCES anker_chats(id) ON DELETE CASCADE,
  org_id      text REFERENCES organizations(id),
  scope_key   text GENERATED ALWAYS AS ('org:'||org_id) STORED,
  seq         int  NOT NULL,                  -- position within the chat
  kind        text NOT NULL,                  -- §3.3
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Set on a tool.requested that needs a human (policy.ts BLOCKED). Cleared by
  -- a later approval.granted / approval.denied event, never by an UPDATE.
  awaiting    boolean NOT NULL DEFAULT false,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX anker_chat_events_seq_idx  ON anker_chat_events (chat_id, seq);
CREATE INDEX anker_chat_events_scope_idx       ON anker_chat_events (scope_key, created_at DESC);
CREATE INDEX anker_chat_events_awaiting_idx    ON anker_chat_events (scope_key) WHERE awaiting;
```

Append-only, enforced by a trigger, exactly as `crm_activities` is (doc 25 §4.3)
and for the same reason: a history that can be silently rewritten is not evidence
of anything, and these tools move investor records and send outreach.

`scope_key` is a generated column so it cannot drift from `org_id` — the pattern
doc 25 §4.1 established and measured.

### 3.2 `anker_chats` becomes a projection

```sql
ALTER TABLE anker_chats
  ADD COLUMN IF NOT EXISTS org_id    text REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS scope_key text GENERATED ALWAYS AS ('org:'||org_id) STORED;
CREATE INDEX IF NOT EXISTS anker_chats_scope_idx ON anker_chats (scope_key, updated_at DESC);
```

`messages` stays, derived from the log, so nothing that reads it breaks during the
transition. It is the projection, not the record.

**Backfill:** 13 rows. Each becomes one `chat.created` plus one
`message.user`/`message.assistant` per existing message, `org_id` resolved from
the owner's membership — and left NULL when the owner has more than one
workspace, because doc 00 §3 forbids guessing which persona a row belonged to. A
NULL `org_id` yields a NULL `scope_key` and the chat stays invisible to scoped
reads, which is the same conservative outcome the CRM migration chose.

### 3.3 Event taxonomy

| `kind` | Written by | Payload | Reactor |
| --- | --- | --- | --- |
| `chat.created` | decider | `{persona, model}` | — |
| `message.user` | decider | `{content, attachments[]}` | — |
| `model.requested` | decider | `{prompt_ref, task, maxTokens}` | provider |
| `model.delta` | reactor | `{text}` | — (streamed, not persisted individually) |
| `model.completed` | reactor | `{content, usage}` | — |
| `tool.requested` | decider | `{name, input}` | tool, or park |
| `tool.completed` | reactor | `{name, observation, artifact?}` | — |
| `tool.failed` | reactor | `{name, error}` | — |
| `approval.granted` | decider | `{event_id, actor}` | releases the parked tool |
| `approval.denied` | decider | `{event_id, actor, reason}` | — |
| `message.assistant` | decider | `{content}` | — |
| `run.ended` | decider | `{reason: done\|aborted\|budget\|error}` | — |

`model.delta` is the one event that streams without being stored per-event —
persisting a row per token would make the log unreadable and is not needed to
resume, because `model.completed` carries the whole content.

---

## 4. Interfaces

### 4.1 The SSE stream

Stream **events, not tokens** (doc 27 §4.2), so the client can tell a tool call
from an observation from prose:

```
event: tool.requested
data: {"seq":7,"name":"crm_search","input":{"q":"Arcadian"}}

event: model.delta
data: {"seq":8,"text":"Three firms match"}

event: run.ended
data: {"seq":12,"reason":"done"}
```

Every frame carries `seq`, so a client that reconnects sends `Last-Event-ID` and
the server replays from the log rather than re-running the model.

**A partial tool call is never actionable** (doc 27 §6). `tool.requested` is
emitted only once its input has passed `validateToolInput`, never assembled
incrementally on the client.

### 4.2 The contract module

`lib/assistant/contract.ts` — the event union, the request shape and a
`capabilities` descriptor (`{streaming: boolean, events: string[]}`) the client
reads instead of assuming a coordinated deploy (doc 27 §4.3). The existing
`scopeKey` 409 check is the first member of this contract, not a separate
mechanism.

### 4.3 Authorisation

Unchanged, and stated so it survives streaming (doc 27 §4.4): **authenticating a
stream authorises nothing on it.** `canUseTool` is evaluated per
`tool.requested`, at the moment of execution, against the principal resolved then
— not once at connect. A workspace switch mid-stream ends the run with
`run.ended{reason:"aborted"}` rather than continuing under a stale scope.

---

## 5. Sequence: an approval-gated tool

The flow that justifies the event log. `crm_update_stage` is in `policy.ts`'s
`BLOCKED` set today, so the assistant simply cannot call it.

```
 user     decider        log                 reactor        human
  │  ask    │             │                    │              │
  ├────────►│             │                    │              │
  │         ├─ tool.requested{awaiting:true} ─►│              │
  │         │             │   (no side effect) │              │
  │◄── "needs your approval" ─────────────────┤              │
  │         │             │                    │              │
  │         │             │◄─ approval.granted ┼──────────────┤
  │         │             │                    ├─ executeTool │
  │         │             │◄─ tool.completed ──┤              │
  │◄── result ────────────┤                    │              │
```

Today the alternative is to refuse. With the log, the intent is durable, the
human sees exactly what was proposed, and the approval is an auditable event
rather than a UI state.

---

## 6. Roadmap

Five phases. Each ships on its own and leaves both assistants working.

### Phase 1 — Scope the history *(G1)* — **DONE 2026-09-26**

The design assumed this had to be built. It did not: the scoping was designed,
written and merged as `scripts/migrations/2026-09-20-ai-persona-access.sql`, and
**never applied**. Every read and write in `app/api/anker/chats/*` already
filtered on `scope_key`, against a column the database did not have.

So Anker AI's chat history was not leaking — it was **failing outright**. The live
`GET` shape returned `column "scope_key" does not exist`, which means listing,
loading, saving and deleting a conversation all threw. Applying the migration was
the whole of phase 1.

| | |
| --- | --- |
| Applied | `2026-09-20-ai-persona-access.sql`, 7 statements |
| Also added | `anker_chats.revision` (optimistic concurrency the routes already used), `ai_media_tasks`, `private_artifacts.scope_key` |
| Legacy rows | 13 of 13 retained with a NULL `scope_key` — the migration's own comment says "retained but not assigned to an arbitrary workspace", which is doc 00 §3's rule |
| Tests | 3 added to `lib/assistant/persona-access.integration.test.ts` |

**Acceptance met:** a chat saved in `org-a` is absent from `org-b`'s list, returns
404 by id from `org-b`, and remains in `org-a`. A save whose `scopeKey` no longer
matches the session is refused with 409. A legacy unscoped chat stays invisible
rather than being assigned a workspace.

**No `org_id` column was added.** `scope_key` is written directly from the
principal (`org:<orgId>`), so §3.1's generated-column pattern applies to
`anker_chat_events` in phase 3 but not retroactively here — changing `anker_chats`
to a generated column now would mean rewriting the five routes that set it.

#### The finding behind the finding

The ledger reported **7 pending migrations**. Probing each one's objects against
production showed most were already applied in substance — `document_extractions`,
`matching_weight_history`, `lp_match_audit`, `outreach_messages.call_id` and its
index all exist. So `schema_migrations` has **drifted**: it reports PENDING for
work that is live.

That drift is what hid this. A ledger nobody trusts is a ledger nobody reads, and
the one genuinely-missing migration sat behind six false alarms. Reconciling it is
its own task; `--all` is not the answer, because
`2026-09-16-call-followup-per-call.sql` carries a COORDINATED RELEASE warning and
the ledger cannot be trusted to say what ran.

### Phase 2 — Settle the two-assistant question *(blocks 3-5)* — **DONE 2026-09-26**

**Decision: they stay separate.** Owner's call, 2026-09-26.

The separation is a **safety property**, not a product preference. `/api/anker/chat`
tells the model in its own system prompt that it has no tools and must never claim
to have touched a record. Merging the surfaces would make that promise
conditional, and a user could no longer tell, from the page they are on, whether
the thing they are talking to can act on their workspace.

| | Anker AI | AI Assistant |
| --- | --- | --- |
| Page | `/dashboard/anker-ai` | `/dashboard/assistant` |
| Route | `/api/anker/chat` | `/api/assistant` |
| Tools | **none, by design** | the full policy-gated set |
| Can change records | no | yes, subject to `canUseTool` and the `BLOCKED` approval set |
| Nav description | "Conversation · multi-model · no access to your records" | "Runs tools on your workspace · research and deliverables" |

#### What "separate" turned out to require

They were not separate. Both `/dashboard/assistant` and `/dashboard/anker-ai`
rendered the **same component**, `PersonaAssistantPage` → `AssistantPowerhouse` →
`/api/assistant`. So the nav advertised two products and delivered one: clicking
"ANKER AI" gave you the agentic assistant.

The real Anker AI chat existed — `components/anker-ai/anker-ai-chat.tsx` — and was
**imported by nothing**. It had drifted out of reach of its own backend:

- it sent no `scopeKey`, which `/api/anker/chat` has required since the persona
  work — every request would have been a 409;
- it sent no `scopeKey` or `revision` when saving, so `/api/anker/chats` would have
  rejected every write after phase 1;
- its header claimed "SSE → text stream" while the route returns `text/plain` and
  the component concatenates raw chunks. Harmless, but it would have sent the next
  reader looking for framing that is not there.

Made separate:

| Change | File |
| --- | --- |
| Server wrapper resolving the principal and passing `scopeKey` | `components/anker-ai/anker-ai-page.tsx` (new) |
| `scopeKey` + `revision` threaded through send, save and load; scope guard on opening a chat | `components/anker-ai/anker-ai-chat.tsx` |
| Page renders Anker AI instead of the assistant | `app/dashboard/anker-ai/page.tsx` |
| Nav says what each can *do* | `lib/nav/taxonomy.ts` |
| Each route header names its counterpart | both route files |

**Acceptance met:** the two pages render different components, both compile and
serve, and the difference is stated in the nav, the page metadata and both route
headers. The Anker AI route header also carries the rule that keeps the split
honest: *anything that gives this route a tool breaks the promise the UI makes on
its behalf — add it to `/api/assistant` instead.*

**Not done here:** the chat is still non-streaming (one `text/plain` body the
client concatenates). Event framing is phase 4, which now has one unambiguous
surface to land on — the reason this phase blocked 3-5.

### Phase 3 — The event log *(G2, G4)* — **PARTLY DONE 2026-09-26**

Built: the table, its guarantees, the backfill, the reader, and event capture on
the conversational surface. **Not** built: the agent loop does not yet emit
`tool.requested` before executing, so resume and approval-parking are *expressible
but not yet exercised*.

| Built | Where |
| --- | --- |
| `anker_chat_events` + append-only trigger + scope inheritance | `scripts/migrations/2026-09-26-anker-chat-events.sql` (applied) |
| Append, read, read-since, projection, awaiting-approval query | `lib/assistant/events.ts` |
| Event capture on save | `app/api/anker/chats/route.ts` |
| Migration validation, 21 checks | `scripts/checks/anker-chat-events-check.mjs` |
| Projection tests, 10 | `lib/assistant/events.test.ts` |

**Backfill, verified against production:** 13 chats → 81 events (13
`chat.created`, 34 `message.user`, 34 `message.assistant`), and the turn count
matches the blob for **every** chat. All 81 carry a NULL scope, which is correct
rather than a defect: phase 1 left all 13 legacy chats unassigned (doc 00 §3) and
events inherit their conversation's scope.

#### Append-only met the user's right to delete, and lost

The design said "append-only, like `crm_activities`". Applied literally with
`ON DELETE CASCADE`, that made **deleting a conversation impossible**: the cascade
could not remove the child events, so the parent delete failed and
`DELETE /api/anker/chats/[id]` — an existing, legitimate action — would have
broken. The PGlite check caught it before it reached Neon.

The resolution is a distinction worth keeping: **append-only protects against
rewriting history, not against a user deleting their own conversation.** The
trigger now refuses a `DELETE` while the parent chat still exists (someone editing
the record) and permits it when the chat is already gone (the cascade). Both cases
are asserted.

#### Deviation from §3.1

§3.1 specified `org_id` with a generated `scope_key`. Phase 1 established that
`anker_chats` carries `scope_key` directly, so events inherit it **from the parent
by trigger** instead — which additionally makes it impossible for an event to
claim a workspace its conversation does not belong to, and keeps one scoping
pattern in the feature rather than two.

#### The loop now records intent — done 2026-09-26

`lib/assistant/agent.ts` emits `tool.requested` **before** calling `executeTool`,
then `tool.completed` or `tool.failed` after. The log is now a record of what the
assistant *intended*, not only of what was said.

| | |
| --- | --- |
| Events around the call | `lib/assistant/agent.ts`, via a `logEvent` helper |
| `chatId` threaded client → route → loop | `assistant-powerhouse.tsx`, `/api/assistant`, `runAssistant(opts.chatId)` |
| Tests | 3 added, incl. the ordering assertion |

**Logging never fails a run.** `logEvent` swallows and warns — the same contract
`lib/matching/outcome-events.ts` uses. An account of the work is not a
precondition for it.

**A `chatId` from a client is not trusted.** The route confirms the conversation
belongs to this user *and* this workspace before the loop writes to it; a stale or
forged id is dropped rather than honoured, which would otherwise write one
workspace's tool history into another's conversation.

**G2 (resume) is now expressible and asserted**: a run that dies between
`tool.requested` and its outcome leaves an intent with no settlement, and the test
`leaves a resumable intent when a tool never settles` pins both that shape and
the fact that it renders as nothing.

#### Still open: G4, approval-parking

Writing `tool.requested{awaiting}` is only half of §5. The other half is that a
`BLOCKED` tool must *reach* the loop to be parked — and today `canUseTool` filters
those tools out of `toolsFor()` entirely, so the model never sees them and the
assistant simply refuses.

Closing G4 therefore means letting `BLOCKED` tools be *proposed but not executed*,
which changes what the assistant may attempt. That is a deliberate safety decision
and is **not** taken here. The mechanism is ready for it: the event kind, the
`awaiting` flag, its partial index, the `awaitingApproval()` query and the
projection behaviour all exist and are tested.

#### Known gap: the first turn

`chatId` exists only once a conversation has been saved, and the client saves
*after* a run. So tool events are logged from the second turn onward; a
single-turn conversation records nothing. Creating the chat row before the run
would close it — a small client flow change, not a schema one.

### Phase 4 — Streaming *(G3)* — **PARTLY DONE 2026-09-26**

Done: the provider streams, and Anker AI delivers incrementally. Not done: the
assistant's **event** stream (§4.1) and `Last-Event-ID` resume.

| Built | Where |
| --- | --- |
| `generateStream`, `canStream` | `lib/ai/provider.ts` |
| Streamed response | `app/api/anker/chat/route.ts` |
| Tests, 9 | `lib/ai/provider-stream.test.ts` |

**Streaming is safe to call unconditionally.** `generateStream` yields the same
total text `generate()` would return; a provider that cannot stream yields exactly
one chunk. Identical content, degraded delivery — so a caller never branches, and
a missing key, a refused connection, a non-200 or an opened-but-empty stream all
fall back to the blocking path rather than surfacing a truncated answer.

Only the OpenAI-compatible providers stream (`qwen`, `openai`, `mistral`), which
covers the live chain. `canStream()` exists so a route advertises what it actually
got — `X-Anker-Streaming: 0|1` — rather than promising a stream and delivering one
chunk (§4.2). A client seeing `0` is not broken; it is correctly informed.

**Budget, routing, failover and kill-switches are not reimplemented** on the
streaming path. The blocking path owns them and a second copy would drift, so the
streaming path handles one provider family and defers everything else to it.

#### The injection posture, under re-assembly

Phase 4's real risk is not that a streamed model is newly persuadable. It is that
**a guard written against a whole response stops matching when the response
arrives in pieces**. Three tests pin the property the chat route depends on:

- an injection attempt split across four frames, none containing the whole
  phrase, reassembles **verbatim** — so whatever held for the blocking text holds
  for the streamed text;
- tool output imitating the stream's own framing (`event: approval.granted`) stays
  **data**: the parser reads only `delta.content`, so it can never be mistaken for
  a control frame;
- an empty stream degrades to the blocking path rather than yielding nothing.

Plus the parsing case a naive line-splitter gets wrong: an SSE frame **split
across two reads** is buffered until its terminator arrives, rather than dropped.

#### The assistant event stream — done 2026-09-26

`/api/assistant` streams the run as **events**, not tokens.

```
id: 7
event: tool.requested
data: {"name":"crm_search","input":{"q":"Arcadian"},"step":1}

event: result
data: {"answer":"Three firms match.","steps":[…],"artifacts":[]}
```

| | Where |
| --- | --- |
| `onEvent` on the run, fired as each event happens | `lib/assistant/agent.ts` |
| SSE response, replay, `result` / `error` frames | `app/api/assistant/route.ts` |
| Frame reader and live step rendering | `components/assistant/assistant-powerhouse.tsx` |
| Tests, 3 | `persona-access.integration.test.ts` |

**Content negotiation, not a second endpoint.** A client sending
`Accept: text/event-stream` gets the stream; every existing caller keeps the JSON
contract. That is §8's independent-roll property made concrete, and it is why the
change needed no coordinated deploy.

**One place records how a run ended.** The loop returns from three points — final
answer, unstructured output, forced synthesis — so `runAssistant` is now a thin
wrapper that emits `message.assistant` and `run.ended` around
`runAssistantLoop`. Instrumenting each return was how one of them would
eventually be missed.

**Streaming is a view of the run, never a participant.** `onEvent` is not awaited
and its throw is caught: a consumer that fails or blocks must not change what the
assistant does — the same contract the logging already had.

**Resume.** A client that drops reconnects with `Last-Event-ID`; the route replays
from `readEventsSince()` and marks those frames `replayed: true` rather than
re-running the model. It needs a persisted chat, so it inherits phase 3's
first-turn gap.

**Acceptance met:** a `tool.requested` is its own frame, arriving before the
tool settles and before `result`, so the client distinguishes a tool call from
prose without parsing text — and now renders each step as it happens instead of a
single spinner.

#### Still not done

- **`X-Anker-Streaming` has no equivalent here.** The assistant advertises its
  stream by responding to `Accept`, not by a capability descriptor; §4.2's
  `capabilities` object remains unbuilt, and would be worth having once a second
  client exists.
- **Verified by test, not by eye.** Both surfaces sit behind auth, so the live
  step rendering has not been seen in a browser.

### Phase 5 — Persona tailoring, the remainder *(G5)* — **DONE 2026-09-26**

This phase promised "per-persona model tier **and role prompt**". Half of that was
wrong: **the role prompts already existed** and are substantive and distinct —
Founder Copilot biases toward closing the round, Fund Copilot toward running the
fund and never inventing figures, Investor Copilot toward plain explanation and
refusing to give tax advice. Only the **model tier** was missing.

| Built | Where |
| --- | --- |
| `modelTask` on `PersonaAgent`, `personaModelTask()`, `personaModelTier()` | `lib/agents/personas.ts` |
| Loop uses the persona's task instead of a hardcoded one | `lib/assistant/agent.ts` |
| Chat route likewise | `app/api/anker/chat/route.ts` |
| Tests, 9 | `lib/agents/personas.test.ts` |

**All three personas sit on `deep_research`** — the tier the loop hardcoded
before this existed — so adding the field changed nobody's behaviour.

**The tiers are deliberately not tuned.** It is tempting to read the role text and
assign from it: the LP "explains plainly" so perhaps `balanced`, the GP is
"rigorous with numbers" so perhaps `reason`. That is a cost-and-quality decision
with real consequences, and inferring it from prose would be guessing with
someone else's budget. The mechanism now makes it a one-line edit in one file,
which is what the phase was for.

**An explicit provider/model override still wins.** A user who picks a model is
not second-guessed by the persona's tier.

**Acceptance met:** `personaModelTask()` / `personaModelTier()` read the tier
without touching the agent loop, and a test mutates one persona's task and asserts
the other two are unmoved.

### 6.1 Approval UI

`approval.granted` / `approval.denied` need somewhere for a human to act. Phase 3
makes them expressible; the surface is deliberately unscheduled until phase 2
decides which assistant owns it.

---

## 7. Observability

- **Per-event timing**, so "the assistant is slow" resolves to a model call or a
  tool call rather than a guess.
- **`awaiting` count per scope** — a parked intent nobody ever approves is the
  failure mode of §5, and it is invisible without a counter. Same shape as the
  `unassigned:` bucket doc 00 §3 warns about.
- **Budget**, already enforced by `checkAiBudget()`, surfaced per run rather than
  per process.

## 8. Rollout and rollback

Each phase is additive. Phases 1 and 3 add columns and a table; `messages`
survives as the projection throughout, so rolling back the runtime leaves the data
readable by the current code. Phase 4 is behind the `capabilities` descriptor
(§4.2): a client that does not see `streaming: true` uses the blocking path, so
server and client roll independently.

The append-only trigger is the one thing that is not trivially reversible — by
design (doc 25 §4.3). Dropping it is a migration, not a config change.

## 9. Open decisions

| # | Decision | Needed by | Owner |
| --- | --- | --- | --- |
| D1 | One assistant or two (§6 phase 2) | Phase 3 | product |
| D2 | Does an approval live in the chat, or in a shared queue with the outreach approvals? | Phase 3 | product |
| D3 | Is `model.delta` ever persisted for audit, or is `model.completed` enough? | Phase 4 | this design says completed is enough |
| D4 | Does LP get an assistant before doc 01 gives it a workspace? | Phase 5 | product |

## 10. Risks

- **Rebuilding what exists.** Doc 27 §6's first risk, restated as this document's
  rule: name the §2 row or do not build it.
- **An event log with no reader.** If resume, audit and approval-parking are all
  deferred, phase 3 is a second write path for no benefit. Phase 3 should not ship
  before at least one of them is wanted.
- **`awaiting` events accumulating unactioned.** §7's counter exists for this.
- **Backfill ambiguity.** Multi-workspace owners get a NULL scope and their chats
  become invisible. That is deliberate (§3.2) and matches doc 25 §6.1, but it
  needs the same reporting: say how many, do not discover it later.
