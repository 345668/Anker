# The Anker assistant: what is wired, what is not, and how to remap it

**Date:** 2026-09-21 · **Scope:** every path from a user message to a model —
the assistant, the chatbot, model routing, provider selection · **Method:**
traced each surface from its UI call to the model that answers it. No changes
made.

The ask was: make Mistral Small exclusive to the chatbot, put Qwen Cloud's
strong models behind the assistant, and let a user pick a frontier model
(Claude, GPT, Gemini). All three run into the same wall, which is worth stating
before any of the detail:

> **Provider selection is a single global value.** `providerOverride` in
> `system_settings/ai_router_v1` is one string for the whole platform. There is
> no per-surface, per-persona or per-task provider. "Mistral for the chatbot,
> Qwen for the assistant" cannot be expressed today — not as a setting, not as
> an env var, not in code.

The tier machinery for doing it well already exists and is good. What is
missing is one dimension in the routing key.

---

## 1. What is actually running right now

Measured, not assumed — the live `ai_router_v1` row and the environment:

| | |
| --- | --- |
| `providerOverride` | **not set** — the auto chain decides |
| API keys in the shared config | **none** |
| Provider keys in the environment | **`DASHSCOPE_API_KEY` only** |
| `modelOverride` | empty |
| Disabled tasks | none |

So the platform can currently reach **exactly one provider: Qwen Cloud**. There
is no Anthropic, OpenAI, Gemini or Mistral credential anywhere.

Two consequences worth being blunt about:

- **Frontier model selection cannot work today,** whatever the UI offers. It is
  not a routing problem first; it is three missing keys.
- **Mistral Small is not "currently the forced provider".** That phrase is in
  the portal's own help text (`ai-config-client.tsx`, `KEY_META.mistralApiKey`)
  and it is stale. Nothing is forced, and Mistral has no key. Moving Mistral to
  the chatbot is not a migration away from something — it is a new deployment.

---

## 2. Three surfaces, three different model paths

| Surface | Entry | Model resolution | Tools | Streaming |
| --- | --- | --- | --- | --- |
| **Chatbot** `chat-content.tsx` | `/api/chat` | `getAiSdkModel()` — global provider, **task ignored** | none | **yes** (`streamText`) |
| **Assistant** `assistant-powerhouse.tsx` | `/api/assistant` | `generate({task:"deep_research"})` | full tool loop | no |
| **Text chat** `assistant-powerhouse.tsx` | `/api/anker/chat` | `generate({task:"deep_research"})` | none by design | no |
| **ANKER AI** `anker-ai-chat.tsx` | `/api/assistant` | sends `model`, **route drops it** | full tool loop | no |

Read that table twice. **The surface that can use tools cannot stream, and the
surface that streams cannot use tools.** Everything agentic is a blocking POST
with a 240-second timeout, which is why the UI has to say "this can take a
minute".

### The routing key is one dimension short

`getAiSdkModel()` takes no arguments. It resolves the global provider and that
provider's default model — no task, no tier. So the chatbot gets whatever the
platform-wide provider is, at its default model, regardless of what it is being
asked to do. The tier system does not reach it at all.

---

## 3. What is not fully implemented

Ranked by how surprising the gap is to someone reading the code.

### N1 — The model picker's choice is silently discarded *(highest)*

`components/anker-ai/anker-ai-chat.tsx` has a working model picker. It loads
`/api/anker/models`, lets the user choose, defaults to `qwen-flash`, and sends
`model` on every agent request — in both the JSON and multipart branches.

`lib/assistant/agent.ts` accepts it:

```ts
runAssistant(task, { provider?: string; model?: string; ... })
// and: if (gen.provider || gen.model) return generate(prompt, {...gen, ...})
```

`app/api/assistant/route.ts` reads `task`, `scopeKey`, `files` and `maxSteps`.
**It never reads `model`.** The pick is dropped between the browser and the
agent, and the user is shown no indication that their choice did nothing.

Both ends of this feature exist. The middle is four lines.

### N2 — That UI is not mounted anywhere

`anker-ai-chat.tsx` is imported by no page. It also never sends `scopeKey`,
which the route requires — `scopeKey !== p.scopeKey` would 409 every request
with "Workspace changed". So the picker is not merely ignored; the component it
lives in has never been wired up.

This is unfinished work rather than a live outage, and it is the single largest
piece of "already built, not connected" in this area.

### N3 — Three reasoning-tier tasks exist and are never called

`TASKS` declares `agent_plan`, `agent_verify` and `investor_score`, with
comments describing subgoal decomposition, a numeric-claim verifier and an SPCT
scorer, and `TASK_TIER` routes the first two to the `reason` tier. Grep finds
**zero call sites** for all three outside the router itself.

The reasoning tier is therefore configured, chained to real models
(`qwen3.7-max → qwen3.6-max-preview → qwen3-max → qwen-max`) and never used.
The agent does no planning step and no verification step; it goes straight into
the tool loop.

### N4 — The agent's design assumption is out of date

`lib/assistant/agent.ts` opens by explaining itself:

> *"A ReAct-style JSON tool loop on the local AI provider (Ollama / Anthropic).
> … Local models are weak at strict tool-calling, so parsing is lenient and the
> loop is bounded."*

That was a correct decision for `gemma2:2b` on a laptop. Every model now
proposed for this path — Qwen3-Max, GLM-5.2, Claude, GPT — supports **native
tool calling** with schema-validated arguments. The hand-rolled JSON loop costs
accuracy (a model that can emit a typed call is being asked to emit prose that
is then parsed leniently), costs tokens (the whole tool catalogue is rendered
into every prompt), and costs the ability to stream.

`lib/ai/sdk-bridge.ts` already wraps the AI SDK for typed output and says in
its own header that it exists for "NEW code paths". The agent is the code path
it was written for, and does not use it.

### N5 — The model catalogue is Qwen-only

`lib/ai/model-catalog.ts` describes itself as "the Qwen Cloud free-tier +
partner models, plus the platform's own providers". It contains no Claude, GPT
or Gemini entries. `/api/anker/models` serves it, so a picker built on it can
only ever offer Qwen. Adding frontier models to the UI means adding them here
first, with their categories and capabilities.

### N6 — `providerStrict` and per-task model overrides never meet

`modelOverride` is per task. `providerOverride` is global. A per-task model id
is interpreted against whatever the global provider happens to be, so
`modelOverride.deck_extract = "claude-sonnet-4.5"` silently means nothing
unless the whole platform is on Anthropic at that moment.

---

## 4. What is genuinely well built

Worth saying, because the remap should keep it.

- **The DashScope tier chains.** Each tier is an ordered fallback chain within
  the family — `deep: [glm-5.2, glm-5.2-fast-preview, qwq-plus, qwen3-max]` —
  so a deprecated or rate-limited model degrades within the family before
  cross-provider failover. That is more thought than most routers get.
- **The task → tier table.** Nineteen tasks with a defensible tier each, and
  comments explaining why (`ai_rationale: fast // run hundreds of times per
  match run`).
- **Cross-provider failover with retry, rate gating and per-attempt telemetry**
  (the last added yesterday).
- **The safety envelope**: `AiPrincipal` through AsyncLocalStorage, a tool
  allowlist intersected with persona scope, a model-call budget, and prompts
  that mark uploaded content as untrusted data. The agentic rewrite must not
  step outside this.

---

## 5. The remap

One change unlocks all three requests: **make the routing key
`(surface, task) → provider + model chain` instead of `task → model chain` with
a global provider.**

### 5.1 Introduce the surface

A surface is *what is asking*, and there are four:

| Surface | What it is | Wants |
| --- | --- | --- |
| `chatbot` | public/marketing chat, no tools, no platform data | cheap, fast, streaming |
| `assistant` | the tool-using agent on a workspace's real data | strong reasoning, native tools |
| `copilot` | short in-product helpers (rationales, summaries) | fast, bulk-safe |
| `batch` | pipelines: extraction, enrichment, scoring | balanced, cost-aware |

This is the missing dimension. It is orthogonal to task: `doc_summary` from the
chatbot and `doc_summary` inside a batch pipeline should not be forced onto the
same provider.

### 5.2 Config shape

```jsonc
{
  "surfaces": {
    "chatbot":   { "provider": "mistral", "tier": "fast" },
    "assistant": { "provider": "qwen",    "tier": "reason" },
    "copilot":   { "provider": "qwen",    "tier": "fast" },
    "batch":     { "provider": "qwen",    "tier": "balanced" }
  },
  "userSelectable": ["qwen", "anthropic", "openai", "gemini"],
  "providerOverride": null   // kept: a global break-glass, not the normal path
}
```

Resolution order, most specific first:

1. per-request `provider`/`model` — only if the provider is in `userSelectable`
   **and** the surface permits user choice (the chatbot must not, or "Mistral
   exclusive" is a lie the first time someone picks something else);
2. `surfaces[surface]`;
3. `providerOverride` (break-glass);
4. the auto chain, as today.

This answers the brief directly: Mistral is pinned to `chatbot` and reachable
from nowhere else; the assistant sits on Qwen's `reason` tier; frontier
providers become selectable without becoming default.

### 5.3 Frontier models, in the order they must happen

1. **Keys.** Anthropic, OpenAI and Gemini credentials, stored encrypted in the
   shared config where the portal already manages them. Nothing below works
   before this, and it is not a code change.
2. **Catalogue.** Frontier entries in `model-catalog.ts` with their category
   and capabilities, so `/api/anker/models` can offer them.
3. **Per-provider tier chains.** `DASHSCOPE_TIER_CHAINS` generalised to
   `TIER_CHAINS[provider][tier]`, so "deep on Anthropic" resolves the way "deep
   on DashScope" already does.
4. **Honour the pick.** Read `model` and `provider` in
   `app/api/assistant/route.ts`, validate against `userSelectable` and the
   catalogue, pass to `runAssistant` — which already accepts them (N1).

### 5.4 The agentic loop

Replace the hand-rolled ReAct JSON loop with **native tool calling** through
the AI SDK, keeping every guardrail:

- tools declared once with zod schemas, reused as AI SDK tool definitions
  instead of being rendered into the prompt as text;
- the persona allowlist filters the tool set **before** it reaches the model,
  as it does now;
- `checkAiBudget()` stays on every step; the step cap stays;
- the lenient JSON parser stays **as a fallback** for any model without native
  tool calling, so a local Ollama deployment does not regress.

Then add the two steps that already have tasks and tiers and no code
(N3): a `agent_plan` call before the loop and an `agent_verify` pass over
numeric claims in the answer. Both on the `reason` tier, both skippable when
the task is disabled — the kill switch already does this.

And **stream it**: native tool calling over `streamText` is what makes a
tool-using answer feel fast. The present design cannot stream because the
prompt-parse-loop only produces text at the very end.

### 5.5 Sequencing

Each step ends somewhere shippable and observable, now that AI calls are
recorded.

1. **Honour the model pick** (N1) and mount the picker with its `scopeKey`
   (N2). Small, and it stops the UI lying.
2. **Add the surface dimension** (5.1, 5.2). Default every surface to today's
   behaviour, so nothing changes until a surface is pointed somewhere new.
3. **Point the assistant at Qwen `reason`**, the chatbot at Mistral `fast`.
   Watch the usage panel: latency and failure rate per task are now visible, so
   this is a measured change rather than a hopeful one.
4. **Add frontier keys and catalogue entries**, enable `userSelectable`.
5. **Rewrite the loop on native tool calling**, with the JSON loop retained as
   the fallback. Largest step, and the one with real regression risk — the
   Decile-test behaviour is the acceptance bar.
6. **Add plan and verify passes** (N3).

## 6. Risks worth naming

- **One provider today.** Every route currently depends on DashScope. Until a
  second key exists, cross-provider failover has nothing to fail over to, and
  the failover counter in the usage panel will read zero for a reassuring but
  meaningless reason.
- **"Mistral exclusive" is only true if enforced.** If the chatbot surface can
  be overridden per request, it is not exclusive. The surface config must
  reject a user-supplied provider for `chatbot`, not merely default away from
  it.
- **Native tool calling changes failure modes.** A lenient parser fails softly
  and often; a schema-validated tool call fails hard and rarely. Error handling
  written for the first will not be right for the second.
- **Cost.** Moving the assistant from `deep` to `reason` moves it to
  `qwen3.7-max`. `ai_rationale` already runs "hundreds of times per match run"
  on the fast tier; a careless surface default could put that on a frontier
  model. The audit's A3 finding — no per-run ceiling — becomes urgent the day
  frontier keys are added.
