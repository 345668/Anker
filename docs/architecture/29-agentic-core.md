# 29 — The agentic core: native tool calling, a surface-aware routing key, and a cost ceiling

**Date:** 2026-09-27 · **Status:** phase 1 DONE 2026-09-27; phases 2–6 design ·
**Companion to:** [28](28-assistant-system-design.md) (the runtime *around* the loop),
[the 2026-09-21 assessment](../assessments/assistant-model-architecture-2026-09-21.md)
(findings N1–N6) · **Reference:** AutoGPT (§1) · **Surfaces:**
`/dashboard/assistant`, `/dashboard/anker-ai`, `/dashboard/chat`

Doc 28 rebuilt everything *around* the loop — workspace-scoped history, an
append-only event log, SSE streaming with resume, per-persona model tiers — and
deliberately left the loop itself alone. That work landed on 2026-09-26.

The loop is now the oldest thing in the assistant. It is a prompt-rendered ReAct
parser whose header still explains itself in terms of `gemma2:2b` on a laptop,
sitting on a routing key that cannot express which model answers which surface.
This document is the loop and the key beneath it.

**Rule for this document:** every proposal closes a numbered finding of the
2026-09-21 assessment, or a row of doc 27 §2. Anything that closes neither is a
rewrite of working code and does not belong here — doc 28 §10's first risk,
restated.

---

## 1. The licence, first

Doc 27 §1 established the habit: decide what a reference permits before designing
around it. AutoGPT is **two licences in one repository**, and the split runs
against us.

| Path | Licence | What is in it |
| --- | --- | --- |
| `autogpt_platform/` | **Polyform Shield 1.0.0** | The modern platform: graph/block execution, durable runs, credential vault, scheduling, per-run cost accounting |
| everything else | **MIT** | AutoGPT Classic, Forge, the benchmark, the Classic GUI |

Polyform Shield is source-available with a non-compete, **not** an open-source
licence. It is closer to doc 25 §7's AGPL situation than to doc 27's MIT one:
study it, do not copy from it. Anker is a venture operating system rather than an
agent-building platform, so the non-compete probably does not bite — but "probably
does not bite" is not a basis for putting someone else's restricted code in this
repository, and the EspoCRM precedent already set the answer.

**And the permissive half is the wrong half.** AutoGPT Classic is a 2023-era
prompt-parsed JSON command loop: the model is asked to emit a command object,
the parser is forgiving, the command catalogue is rendered into the prompt. That
is a precise description of `lib/assistant/agent.ts` today. The MIT code we are
free to take is the pattern this document exists to remove.

**Consequence:** AutoGPT contributes **ideas, not code**. `NOTICE` gains nothing,
because nothing is adapted. The three ideas worth carrying are named in §7 and
§9; each is credited there and each is reachable without reading their source.

## 2. What is actually running, verified 2026-09-27

Re-measured against the code rather than inherited from the assessment, because
doc 28's five phases landed in between and moved several of these.

| # | Finding | State today | Evidence |
| --- | --- | --- | --- |
| — | Streaming | **Fixed since.** SSE frames, resume from the event log | `app/api/assistant/route.ts:51–96` |
| — | Persona model tier | **Fixed since.** `personaModelTask()` drives the loop | doc 28 phase 5 |
| N2 | The ANKER AI UI is not mounted | **Fixed since** — and it exposed a live defect, §2.1 | `components/anker-ai/anker-ai-page.tsx:49` |
| N1 | The model pick is discarded | **Open.** The client sends `model`; the route reads `task`, `scopeKey`, `chatId`, `files`, `maxSteps` and never `model` | `route.ts:23–33` vs `anker-ai-chat.tsx:158,164` |
| N3 | `agent_plan` / `agent_verify` / `investor_score` unused | **Open.** Declared with tiers, zero call sites | `lib/ai/model-router.ts:71–73,101–103` |
| N4 | Hand-rolled ReAct loop | **Open.** Whole catalogue rendered to prose; lenient parse; forced synthesis | `lib/assistant/agent.ts:27–31,48–76` |
| N5 | Catalogue is Qwen-only | **Open.** Frontier names appear only in a type union | `lib/ai/model-catalog.ts:24` |
| N6 | Global provider vs per-task model | **Open.** `getAiSdkModel()` takes no arguments | `lib/ai/provider.ts:902` |
| — | **No native tool calling anywhere** | **Open.** `streamText` / `generateText` / `tool(` — zero hits in `lib/ai` and `lib/assistant`; `sdk-bridge.ts` uses only `generateObject` | grep, 2026-09-27 |
| — | No cost ceiling | **Open.** `checkAiBudget()` caps wall-clock and *call count*, not money | `lib/assistant/context.ts:22–28` |

Two facts change the cost of this work, and both are good news:

- **The schemas already exist.** `lib/assistant/tool-schemas.ts` holds
  `TOOL_SCHEMAS: Record<string, JSONSchema>` with **an entry for all 51 tools**
  (verified: zero tools without one), plus `inputSchemaFor()` which falls back to
  a permissive object schema. It was written for the MCP endpoint, which already
  consumes it as `inputSchema`. The assessment treated "declare the tools with
  schemas" as pending work; it is done, in the wrong file's name only.
- **The SDK is already installed.** `ai@6.0.168` exports `streamText`, `tool`,
  **`dynamicTool`** and **`jsonSchema`** (verified against
  `node_modules/ai/dist/index.d.ts`). Native tool calling needs no new
  dependency. `dynamicTool` is the right primitive here because the tool set is
  filtered per principal at runtime and is therefore not statically typeable.

### 2.1 A live defect found while measuring — fixed

`components/anker-ai/anker-ai-chat.tsx` has two request branches. The streaming
text branch sends `scopeKey`; the **agent branch never did**. `/api/assistant`
rejects a mismatch with 409 (`route.ts:34`), and `p.scopeKey` is never empty —
it is always `org:<id>` or `lp:<userId>` (`principal.ts:23`). So the absent field
was compared as `""` and **agent mode on `/dashboard/anker-ai` returned 409
"Workspace changed" for every user, on every request.**

N2 mounting the component is what turned unfinished work into an outage. Fixed by
mirroring the branch that was already correct, in the same file. `pnpm typecheck`
clean; 65 tests pass. Not covered by a test: the repository has no component test
infrastructure (no `.test.tsx` anywhere), and introducing a testing-library setup
for a two-line fix is disproportionate. §9 phase 1 gives it a route-level test
instead, which is where the contract actually lives.

---

## 3. Goals

| # | Goal | Closes |
| --- | --- | --- |
| G1 | The model a user picks is the model that answers, or they are told why not | N1, N5 |
| G2 | Which model serves which surface is expressible in configuration | N6 |
| G3 | Tools are called natively, schema-validated, and stream as they resolve | N4 |
| G4 | A run cannot cost an unbounded amount of money | — (assessment §6) |
| G5 | The agent plans before acting and verifies numbers after | N3 |

### 3.1 Non-goals

- **Re-implementing the tool, policy, persona or event layers.** They are built
  and good. This design consumes `executeTool`, `canUseTool`,
  `validateToolInput`, `toolsFor`, `PERSONA_AGENTS` and `appendEvents`
  **unchanged**, exactly as doc 28 §2.2 does.
- **Porting AutoGPT.** §1.
- **New agentic capabilities** — scheduled autonomous runs, user-composed
  workflows, sub-agent delegation, long-term memory. All are reasonable and none
  belong on a core that cannot yet stream a tool call or honour a model choice.
  They are a later document.
- **Frontier keys.** Buying and installing Anthropic / OpenAI / Gemini
  credentials is a procurement step, not a code change (assessment §5.3). This
  design must work with two providers and get better with five.
- **Deleting the JSON loop.** It stays as the fallback for any model without
  native tool calling, so a local Ollama deployment does not regress.

---

## 4. Architecture

### 4.1 As-is

```
  client                        model
     │  POST + Accept: SSE        ▲
     ▼                           │  one text completion per step
  /api/assistant                 │
     │                           │
     ▼                           │
  agent.ts  ReAct loop ──────────┘
     │   prompt = SYSTEM + allToolCatalog(51 tools) + transcript
     │   ↓ parse JSON leniently
     ├─ executeTool() ──► policy.ts  (canUseTool, validateToolInput)
     └─ appendEvents() ──► anker_chat_events   ← doc 28
```

The loop streams *events it generates itself*. The model call inside each step
still blocks to completion, so "streaming" today means step-granular, not
token-granular. Tool choice is prose the parser recovers.

### 4.2 Target

```
  client                                       model
     │  POST + Accept: SSE                       ▲
     ▼                                           │  native tool calls,
  /api/assistant                                 │  streamed deltas
     │                                           │
     ├─ resolveModel({surface, task, requested}) ─┤   §5
     │                                           │
     ▼                                           │
  agent.ts  streamText({ tools, stopWhen }) ─────┘
     │   tools = dynamicTool(inputSchemaFor(name))  for toolsFor(principal)
     │   ↓ typed args, no parsing
     ├─ execute: executeTool() ──► policy.ts   (unchanged)
     ├─ onStepFinish ──► appendEvents()        (unchanged taxonomy)
     └─ runBudget: tokens + money ──────────────►  §7
```

Three things change and nothing else: **how a tool is offered** to the model
(schema, not prose), **how the model is chosen** (surface × task, not a global
string), and **what stops a run** (money, not only calls and clock).

---

## 5. The routing key

N6 in one line: `providerOverride` is global, `modelOverride` is per task, and
the two never meet. A per-task model id is interpreted against whatever provider
happens to be global, so `modelOverride.deck_extract = "claude-sonnet-4.5"`
silently means nothing unless the whole platform is on Anthropic.

The missing dimension is **surface** — *what is asking* — and the assessment
§5.1 already named the four. Mapped to the three pages in scope:

| Surface | Reached from | Wants | User may pick a model |
| --- | --- | --- | --- |
| `chatbot` | `/dashboard/chat` → `/api/chat` | cheap, fast, streaming, no tools | **no** |
| `assistant` | `/dashboard/assistant`, `/dashboard/anker-ai` agent mode → `/api/assistant` | strong reasoning, native tools | yes |
| `copilot` | `/dashboard/anker-ai` text mode → `/api/anker/chat`; in-product helpers | fast, bulk-safe | yes |
| `batch` | extraction, enrichment, scoring pipelines | balanced, cost-aware | no |

`chatbot` refusing user choice is not a detail: "Mistral is exclusive to the
chatbot" is false the first time a request can override it. The surface config
must **reject** a supplied provider there, not merely default away from it.

Resolution order, most specific first (assessment §5.2, unchanged):

1. the request's `provider`/`model` — only if the provider is in
   `userSelectable` **and** the surface permits choice **and** the model is in
   the catalogue;
2. `surfaces[surface]`;
3. `providerOverride` — kept as a global break-glass, not the normal path;
4. the automatic chain, as today.

`getAiSdkModel()` gains the argument it has always needed:
`getAiSdkModel({surface, task})`. Its four current callers pass their surface;
`/api/chat` passing `chatbot` is the whole of N6's fix for that route.

**Rejection is visible.** A pick that fails validation returns the resolved model
and a reason, and the client says so. Silently substituting is what N1 already
does, and it is the thing users notice least and trust least.

---

## 6. Native tool calling

The migration is smaller than it looks, because §2's two findings do most of it.

```ts
// per request, after toolsFor(principal) has filtered by persona + role
const tools = Object.fromEntries(
  Object.entries(toolsFor(p)).map(([name, def]) => [name, dynamicTool({
    description: def.description,
    inputSchema: jsonSchema(inputSchemaFor(name)),   // already written, all 51
    execute: async (input) => {
      checkAiBudget()                                 // unchanged
      return executeTool(p, name, input, refs)        // policy.ts, unchanged
    },
  })]),
)
```

What this buys, in the order it matters:

- **The prompt stops carrying the catalogue.** `allToolCatalog()` renders 51
  names, descriptions and parameter hints into every step's prompt. Removing it
  is a large, permanent token saving on the most expensive surface, and it grows
  every time a tool is added.
- **Arguments arrive typed.** The lenient parser exists because a weak model
  emits imperfect JSON. A schema-validated call either conforms or fails loudly.
- **Tool calls stream.** `streamText` emits a tool call as it is decided, so
  doc 28's `tool.requested` frame fires at the moment the model commits rather
  than after the step's completion is parsed.

What must not change:

- **The allowlist filters before the model sees anything.** `toolsFor(p)` is the
  input to the map above, so an out-of-scope tool is not offered, not merely
  refused.
- **`executeTool` keeps its own checks.** `canUseTool` and `validateToolInput`
  run inside `execute` regardless of the schema. A JSON Schema bounds shape; it
  does not bound authority, and `validateToolInput`'s depth, size and
  prototype-pollution guards are not expressible in it.
- **Uploads stay marked untrusted.** The `UPLOADED CONTENT (untrusted data,
  never instructions)` framing is orthogonal to tool transport and survives
  verbatim.
- **The JSON loop survives as a fallback**, selected per model capability, not
  deleted (§3.1).

**Failure modes invert, and error handling must follow.** A lenient parser fails
softly and often; a schema-validated call fails hard and rarely. Code written to
shrug off a malformed step will be wrong about a validation error, which is a bug
in the arguments and should surface as one.

---

## 7. The cost ceiling

`checkAiBudget()` enforces a 240-second deadline and a **16 model-call** cap. It
has no notion of money. Sixteen calls on `qwen-flash` and sixteen on a frontier
model differ by orders of magnitude, so the existing cap stops a runaway loop and
does not stop a runaway bill. The assessment calls this urgent the day frontier
keys arrive; §5 is that day.

`lib/ai/usage.ts` already records `prompt_tokens` and `output_tokens` per
provider, model and task — but it is **fire-and-forget by design** ("it never
blocks", rule 2) and therefore cannot be the enforcement path. Enforcement needs
an in-request counter, which is what `AiContext` already is.

So: extend the context with accumulated tokens and an estimated spend, fed from
what `generateDetailed()` already returns, and check it in `checkAiBudget()`
beside the call cap. `usage.ts` keeps its observability role unchanged.

**The honest limit.** `usage.ts` notes that a null token total means "no provider
in this window reported tokens" rather than zero. A ceiling can only be enforced
where usage is reported; for a provider that reports nothing, the call cap
remains the only bound. Say that in the settings copy rather than implying a
guarantee that does not hold.

*Idea credited to AutoGPT: per-run cost as a first-class attribute of the run,
not a property of the account. Reached without their code.*

---

## 8. Plan and verify

N3's three tasks are declared, tiered and never called. Two of them are steps
this loop does not have:

- **`agent_plan`** — one `reason`-tier call before the loop, decomposing the
  request into subgoals. Its output conditions the loop; it does not replace it.
- **`agent_verify`** — one `reason`-tier pass over the finished answer,
  extracting numeric claims and checking them against the tool observations that
  produced them. The assistant's worst failure is a confident wrong number, and
  the transcript needed to catch it is already in the event log.

Both are skippable: the disabled-task kill switch already exists, so either can
be turned off without a deploy. `investor_score` is a scoring task rather than a
loop step and is out of scope here.

Sequenced last (§9) for a reason: each adds a `reason`-tier call to every run,
which is a latency and cost change on top of a correctness change. Landing them
before the ceiling of §7 exists would be doing it in the wrong order.

---

## 9. Roadmap

Each phase ends somewhere shippable and observable. AI calls are recorded, so
every step below is a measured change rather than a hopeful one.

### Phase 1 — Honour the pick *(G1, N1)* — **DONE 2026-09-28**

Read `model`, validate against the catalogue, pass to the runtime. Report the
outcome so a refused pick is visible rather than silently replaced.

| Built | Where |
| --- | --- |
| `resolveModelChoice()`, `rejectionMessage()`, `RUNTIME_PROVIDER` | `lib/ai/model-catalog.ts` |
| Reads `model` (JSON + multipart), passes the override, returns `modelChoice` on the body and on the stream's `result` frame | `app/api/assistant/route.ts` |
| Same, reported as `X-Anker-Model` / `X-Anker-Model-Rejected` headers | `app/api/anker/chat/route.ts` |
| Reads both signals and shows a refused pick beside the answer (E4) | `components/anker-ai/anker-ai-chat.tsx` |
| Tests, 7 | `lib/assistant/persona-access.integration.test.ts` |

**This phase was scoped wrongly when written.** It named only
`app/api/assistant/route.ts`. `/api/anker/chat` drops the pick the same way and is
ANKER AI's *default* mode, so fixing one route would have left the picker lying
for most requests. Both are done.

**The provider is derived from the catalogue, never taken from the client.** Not
caution — correctness. `generate()` given a `model` and no `provider` resolves the
*global* provider, so a Qwen id would be posted to whatever `providerOverride`
names, today Mistral. A pick without its provider is a pick that fails. This also
surfaced a naming split worth knowing: the catalogue says `dashscope`, the
provider layer says `qwen`, for one service. Mapped, not renamed — the stored
config key is `qwenApiKey` and the category values are served to clients.

**The UI landed 2026-09-28, and E4 is answered: a notice.** The composer reads
`modelChoice` on the agent surface and `X-Anker-Model-Rejected` on the text one,
and shows the refusal beside the answer rather than as an error the user must
clear. A refused pick does not invalidate the answer — it came from a different
model, not from no model — so a blocking error would discard a good answer in
order to report a bad pick. On the streaming path the notice is set before the
first chunk, so it is on screen while the answer is still arriving.

The copy stays in `rejectionMessage()` next to the catalogue rather than being
restated in the component, so both surfaces and any later API consumer word it
identically. That module has no imports, no `server-only` marker and touches no
node APIs, so it bundles into a client component.

**The component itself is not unit-tested,** because the suite is node-only by
design ("pure lib logic, no DB" — `vitest.config.ts`) and there is no jsdom or
testing-library setup to add one to. What covers it instead: the two signals it
reads are asserted route-side in the 7 tests above, `rejectionMessage()` is pure
and tested through them, and a production build is what proves the catalogue
import survives client bundling. The untested part is the rendering — that the
notice appears, and appears before the first chunk. Adding a component
environment is a larger decision than this phase should make alone.

**Still short of the goal in one respect:** the notice names the pick that was
refused but not the model that answered instead. It says "the default", which is
also loose — the task/tier router chose, and that is not the same thing as a
default. Neither route knows that model's id, so this is not a copy fix: it needs
§10's resolution provenance and belongs with that work. §10's other item, a count
of refused picks by reason, is likewise unbuilt — nothing records a refusal today,
so how often this path is hit is currently unmeasurable, and that is the number
that would say whether naming the substitute is worth building.

**Acceptance met:** a request naming a catalogue model is answered by it, with
that model's own provider; an unknown or non-conversational model is answered by
the router's choice **and says so**; no pick leaves selection untouched. The
`scopeKey` contract of §2.1 now has a route-level test — the pre-existing test
covered a *stale* scope, and it was an *absent* one that shipped broken. Each new
assertion was mutation-tested: reverting the fix it guards fails that test and
only that test.

### Phase 2 — The surface dimension *(G2, N6)* — **DONE 2026-09-28**

`surfaces` in `ai_router_v1`; `resolveModel({surface, task, requested})`;
`getAiSdkModel({surface, task})`. **Default every surface to today's behaviour**,
so nothing moves until a surface is pointed somewhere new.

**Acceptance:** with no config change, model selection is byte-identical to
today. Pointing `chatbot` at Mistral `fast` and `assistant` at Qwen `reason`
takes effect without a deploy, and a user-supplied provider on `chatbot` is
rejected rather than honoured.

**Designed and built in [doc 31](31-surface-routing.md).** E1 and E3 were answered
to unblock it: text mode is `copilot` (so phase 1's picker stands), and tiers do
not move in this phase (so byte-identical-by-default remains the safety net).

Five corrections to this phase as written, all in doc 31 §1: the provider cache is
a module-global keyed on nothing and checked before every rule, so surface
resolution goes in front of it rather than through it; `patchRouterConfig` rebuilds
rather than merges, so an unlisted key is wiped by the next unrelated save;
`getAiSdkModel` has **two** callers, not four — and neither is a surface that
carries user traffic, so `surface` also had to become a `GenerateOpts` field or the
config would have looked applied while ANKER AI stayed put; `/api/chat` accepts no
model from its body, so the "reject a user-supplied provider" bar had nothing to
reject and the guard belongs in the resolver; and a surface pin is fed through the
existing pin logic so it inherits failover and `providerStrict`.

### Phase 3 — Frontier catalogue *(N5)* — **DONE 2026-09-28**

Entries in `model-catalog.ts` with categories and capabilities; `TIER_CHAINS`
generalised from `DASHSCOPE_TIER_CHAINS` to `[provider][tier]`. Keys are
procurement (§3.1); this phase makes them usable the day they land and is worth
doing before them.

**Acceptance:** `/api/anker/models` offers a frontier model; selecting one with
no key configured fails with "not configured", not a generic error.

**Designed and built in [doc 32](32-frontier-catalogue.md).** N5 closed: the
catalogue carried 71 entries, all `dashscope`, with the frontier providers existing
only in a type union.

Three things the phase description did not account for. The key check **cannot**
live in `model-catalog.ts` — that file imports nothing so a `"use client"`
component can import its copy, so the reason is a value there and the check is in
`resolveModel()`. "Not configured" must **not** fall through to `unknown`, or doc
30's refusal counts stop distinguishing "a developer must fix the catalogue" from
"someone must buy a key". And model ids are **not invented**: the seed is the four
`*_DEFAULT_MODEL` ids this repo already sends plus the current Claude family, with
no prices on frontier rows, because an entry naming a model that does not exist
produces the exact upstream failure this phase removes.

One flaw surfaced in the build: treating an unreadable config as "no key" would
have let a single database blip refuse every pick platform-wide. The check now
requires a non-null config.

### Phase 4 — The cost ceiling *(G4)* — **DONE 2026-09-29**

§7. Before native tool calling, because that phase changes token volume and this
is what measures it.

**Acceptance:** a run that exceeds its ceiling stops with a clear message and a
`run.ended{reason: budget}` event; the per-run figure is visible in the usage
panel; a provider reporting no tokens degrades to the call cap and is labelled.

**Designed and built in [doc 33](33-cost-ceiling.md). E2 answered** from investor
deck v3: A3's per-workspace monthly AI budgets and p.10's tier weights give the
envelope, and the per-run caps derived from them live in `SURFACE_DEFAULTS`,
configurable per surface through phase 2's `surfaces` map.

**§7's premise was false, and it inverted the phase.** This section says
`usage.ts` "already records `prompt_tokens` and `output_tokens`". The schema did;
the code never had. Measured against production: 2531 rows, **0** with either
column set, while `duration_ms` was set on all 2531. Nothing parsed a provider's
`usage` block and `GenerateResult` had nowhere to put one. So capturing tokens was
the work, and the ceiling on top was the small part — a ceiling built on the
existing data would have capped every run at zero spend forever, passed its own
tests, and never fired.

Two further corrections: the honest limit is **two** limits, since a call is
unpriceable if the provider reported no usage *or* the model has no catalogue price
(every frontier model, by doc 32 §1.3) — both degrade to the call cap and both are
labelled. And doc 29 says a run over its ceiling **stops**, while the deck promises
"approval above a cost cap"; the stop ships now, and escalate-to-approval needs
doc 28 D2, which is still open.

### Phase 5 — Native tool calling *(G3, N4)* — **5a DONE 2026-09-29, ships dark**

§6. The largest step and the only one with real regression risk.

**Acceptance:** the Decile-test workflow — discovery → enrich → qualify → draft,
including the XLSX — produces equivalent output to the JSON loop. Tool calls
appear as `tool.requested` frames before they settle. The prompt no longer
contains the catalogue. A model without native tool calling still runs, on the
retained JSON path.

**Designed and built in [doc 34](34-native-tool-calling.md).** §6's premises hold
— 51 tools, 51 schemas, 0 missing, 0 stale, measured at runtime. This is the first
phase whose stated foundation was accurate.

**The regression risk §11 warns about is the transport, and §6 points straight at
it.** Its sketch routes tool calling through the AI SDK — and the platform's two
existing SDK consumers, `/api/chat` and `/api/documents/analyze`, are entirely
uninstrumented: zero hits for `recordAiCall`, `chargeAiBudget`, `checkAiBudget` or
`withAiContext` between them. Following §6 literally would have moved the
assistant onto that path and forfeited doc 30's recording, phase 4's tokens and
ceiling, and phase 2's surface routing in a single commit. §6 cannot know this; it
predates those phases putting all of it in `generateDetailed`.

So `generateWithTools` drives the SDK from *inside* the same chain — same failover,
recording, charging and provenance — and the SDK supplies only the per-vendor tool
protocol. Tools are **described, never executed** by the SDK: `dynamicTool`
requires an `execute`, so the implementation uses `tool()` without one, and the
agent keeps calling `executeTool` itself so `tool.requested` still precedes the
work (doc 28 §4.1).

**5a is the mechanism, default off.** **5b** is the Decile-workflow comparison
against a live provider, which is this phase's real acceptance bar and cannot be
met from a test suite — see doc 34 §8.

### Phase 6 — Plan and verify *(G5, N3)*

§8, on the ceiling from phase 4.

**Acceptance:** a plan event precedes the first tool call; a numeric claim
contradicted by its own observations is caught in a seeded test; both steps are
disableable without a deploy.

---

## 10. Observability

Doc 28 §7 asked for per-event timing and a per-run budget figure. This design
adds two:

- **Resolution provenance per call** — which of §5's four rules chose the model.
  "Why did that answer?" is otherwise unanswerable once four rules exist.
- **Rejected picks** — a count of user choices refused, by reason. A high count
  means the catalogue and the UI disagree, which is N5 recurring.

**Designed in [doc 30](30-ai-observability.md), 2026-09-28.** Tracing the code
for it found that `generateStream()` records nothing at all, so the surface this
document calls `copilot` — ANKER AI's default — is absent from `ai_calls` whenever
it works, and its failures are recorded as ordinary blocking calls. That is fixed
as part of the slice, because provenance over only the already-visible traffic
would cover the subset that needed it least. Two other corrections there: the
provenance rule cannot be inferred from `opts.provider` (user picks and internal
callers set it identically), and only three of the four rules above exist until
phase 2 lands `surfaces[surface]`.

## 11. Rollout and rollback

Phases 1–4 are additive and default to current behaviour; rolling back the
runtime leaves the configuration readable. Phase 5 is the exception: it changes
how the model is called, so it ships behind a per-surface switch between the
native and JSON paths, with the JSON path retained (§3.1). That switch is the
rollback, and it is per surface so the chatbot is not risked for the assistant.

## 12. Open decisions

| # | Decision | Needed by | Owner |
| --- | --- | --- | --- |
*(None open.)*

**Answered.**

- **E2** — *what is the per-run ceiling, in money, per surface?* — answered
  2026-09-29 from investor deck v3 and shipped with phase 4. The deck gives a
  monthly workspace envelope (A3) and tier weights (p.10); the per-run caps are
  derived from it and proposed, not quoted: `chatbot` $0.10, `copilot` $0.25,
  `assistant` $1.00, `batch` $2.00, configurable per surface. They are runaway
  guards, not quotas — the deck's credit allowances are a separate monthly billing
  mechanism that does not exist yet (doc 33 §1.4).

- **E4** — *is a rejected model pick an error the user must clear, or a notice
  beside the answer?* — **a notice**, 2026-09-28, shipped with phase 1 (§9). The
  answer is valid, so it is shown; the refusal sits beside it.
- **E1** — *does `/dashboard/anker-ai` text mode belong to `copilot` or
  `chatbot`?* — **`copilot`**, 2026-09-28. It keeps the model picker phase 1 gave
  it; `chatbot` would have meant revoking that in ANKER AI's default mode. This
  settles the routing question only, not doc 28 D1 (one assistant or two).
- **E3** — *do the three personas keep `deep_research`?* — **yes for now**,
  2026-09-28. All three still resolve to tier `deep`. Deliberately unchanged so
  phase 2 could keep "byte-identical with no config change" as its acceptance bar;
  retuning is now a config edit, and doc 30's per-surface figures are what should
  drive it.

## 13. Risks

- **Rebuilding what exists.** The §2 table is the guard: three of the six
  original findings were already closed by doc 28, and this document would have
  proposed work for two of them if it had trusted the assessment instead of the
  code. Re-measure before each phase.
- **Native tool calling changes failure modes, not just transport** (§6). The
  error handling is a deliverable of phase 5, not a follow-up to it.
- **Cost.** Phase 2 makes it one config edit to put a surface on a frontier
  model. `ai_rationale` already runs "hundreds of times per match run" on the
  fast tier. Phase 4 exists so that edit cannot be catastrophic, which is why it
  precedes phase 5 and why phase 3 does not enable anything by itself.
- **The Decile test is the only acceptance bar for phase 5,** and it is one
  workflow. A second scripted workflow before that phase would be cheap
  insurance.
- **Two providers today, and the lead one is degraded.** The assessment found
  Mistral forced platform-wide while rate-limited and tier-restricted, so most
  calls succeed only via failover. Phase 2 is what makes that a configuration
  question instead of a code question — but the failover counter should be read
  before and after, not assumed.
