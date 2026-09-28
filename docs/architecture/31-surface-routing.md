# 31 — The surface dimension: routing by what is asking

**Status:** design, 2026-09-28. Implements doc 29 phase 2 *(G2, N6)*:

> `surfaces` in `ai_router_v1`; `resolveModel({surface, task, requested})`;
> `getAiSdkModel({surface, task})`. **Default every surface to today's
> behaviour**, so nothing moves until a surface is pointed somewhere new.

N6 in one line (doc 29 §5): `providerOverride` is global, `modelOverride` is per
task, and the two never meet — so a per-task model id is interpreted against
whatever provider happens to be global, and
`modelOverride.deck_extract = "claude-sonnet-4.5"` means nothing unless the whole
platform is on Anthropic. The missing dimension is **what is asking**.

Two product decisions this phase was waiting on were answered 2026-09-28:

- **E1 — `/dashboard/anker-ai` text mode is `copilot`**, not `chatbot`. It keeps
  user model picks, which is what doc 29 phase 1 shipped there. Had this gone the
  other way, phase 2 would have had to revoke the picker in ANKER AI's default
  mode.
- **E3 — persona tiers are left exactly as they are.** All three personas run
  `modelTask: "deep_research"` → tier `deep` (`lib/agents/personas.ts:46,63,81`,
  `lib/ai/model-router.ts:96`). Retuning is a config edit *after* this lands, so
  the acceptance bar below — byte-identical selection with no config change —
  stays intact as the safety net.

---

## 1. What is actually running, verified 2026-09-28

| Claim | Evidence |
| --- | --- |
| The chain is built from config alone, with no notion of a caller | `lib/ai/provider.ts:452` `providerChain(cfg)` |
| A pinned provider leads the chain; `providerStrict` makes it the only entry | `lib/ai/provider.ts:471-478` |
| `getAiSdkModel()` takes no arguments and uses the global provider | `lib/ai/provider.ts:941-943` |
| Config is a JSON blob in `system_settings.ai_router_v1`, parsed field-by-field | `lib/ai/runtime-config.ts:146-175` |
| Per-task model override exists; per-surface does not | `AiRouterConfig.modelOverride`, `lib/ai/runtime-config.ts:47` |
| Provenance already reserves a `surface` value for this phase | doc 30 §1.3, `lib/ai/usage.ts` `AiResolution` |

### 1.1 The provider cache is surface-blind — P1

`resolveProvider()` memoises its answer in a module-global with a 5-second TTL,
and that cache is consulted **before any other rule**:

```ts
// lib/ai/provider.ts:167
if (_resolved && Date.now() - _resolvedAt < RESOLVED_TTL_MS) return _resolved
```

`_resolved` is keyed on nothing. Adding a `surface` argument to this function
without touching the cache would mean the first surface to ask within any
5-second window decides the provider for every other surface — intermittently,
under load, and never in a test that calls it once. This is the single most
dangerous line in the phase.

Fix: surface-specific resolution does not go through this cache at all. The
cache stays exactly as it is for the global, no-surface path, so existing
behaviour and its TTL are untouched.

### 1.2 The config writer is a whitelist — P2

`patchRouterConfig` does not merge; it **rebuilds** the object field by field
(`lib/ai/runtime-config.ts:215-238`) and writes the result. A key that is read
but not listed there is therefore destroyed by the next unrelated save — change
an API key, lose every surface mapping, with nothing logged.

So `surfaces` must be added to the reader *and* the writer in the same change.
This is called out as its own finding because the failure is silent, delayed, and
looks like someone else's bug.

### 1.3 Two callers, not four — P3

Doc 29 §5 says "its four current callers pass their surface". There are two:
`app/api/chat/route.ts:25` and `app/api/documents/analyze/route.ts:24`. Doc 29
§13's first risk is "rebuilding what exists … re-measure before each phase"; this
is that measurement, and it makes the phase smaller than written.

### 1.4 `chatbot` has nothing to reject yet — P4

Doc 29 §5 is emphatic that `chatbot` must **reject** a supplied provider rather
than default away from it, because "Mistral is exclusive to the chatbot" is false
the first time a request can override it. Measured: `/api/chat` destructures only
`{ messages, context }` from the body (`app/api/chat/route.ts:22`) and calls
`getAiSdkModel()` with no arguments. **No request can override it today.**

That changes the work but not the requirement. The acceptance criterion as
written ("a user-supplied provider on `chatbot` is rejected") is currently
vacuous — there is no input to reject. What this phase owes is that the property
holds *by construction*: `resolveModel` refuses a `requested` value on a surface
whose config forbids choice, so the guard is in place before anyone adds a `model`
field to that route's body. The test asserts the resolver's refusal, not the
route's, because the route has no such input to give it.

### 1.5 A surface pin must reuse the chain's semantics — P5

`providerChain` gives a pinned provider two behaviours: it leads the chain with
the others as backup, or — under `providerStrict` — it is the only entry
(`:471-478`). A surface pin that bypassed this would silently drop failover, or
silently ignore the strictness an admin set for cost and compliance reasons. A
surface's provider is therefore fed into the *same* pin logic rather than applied
after it.

---

## 2. Data model

One new optional key in `ai_router_v1`. No migration: the row is JSON.

```ts
/** Per-surface routing. A surface absent from this map behaves exactly as it
 *  does today — that is the phase's acceptance bar, not a nicety. */
surfaces: Record<string, AiSurfaceConfig>

interface AiSurfaceConfig {
  /** Leads this surface's chain, with providerStrict's semantics (P5). */
  provider?: ProviderName | null
  /** Task tag whose tier this surface uses, overriding the caller's task. */
  task?: string | null
  /** Whether a request may name its own model/provider. Defaults per surface
   *  from SURFACE_DEFAULTS below, never from the request. */
  userSelectable?: boolean
}
```

The four surfaces and their built-in defaults, from doc 29 §5's table with E1
applied:

| Surface | Route | User may pick | Why |
| --- | --- | --- | --- |
| `chatbot` | `/api/chat` | **no** | §5: an exclusive provider claim is void if a request can override it (P4) |
| `assistant` | `/api/assistant` | yes | ships today, doc 29 phase 1 |
| `copilot` | `/api/anker/chat` | yes | **E1**; ships today, doc 29 phase 1 |
| `batch` | extraction / enrichment / scoring | no | no user in the loop to ask |

`userSelectable` lives in code as the default and in config only as an override,
so the safe answer survives an empty or malformed config.

## 3. The resolver

`resolveModel({surface, task, requested})` in `lib/ai/model-router.ts`,
implementing doc 29 §5's order, most specific first:

1. **the request's `model`** — only if the surface permits choice *and* the model
   is in the catalogue. This is `resolveModelChoice()` from phase 1, unchanged and
   reused; the surface check is the new gate in front of it.
2. **`surfaces[surface]`** — its `provider`, and its `task` in place of the
   caller's.
3. **`providerOverride`** — the global break-glass, unchanged.
4. **the automatic chain** — as today.

It returns the decision *and* its provenance, so doc 30's `resolution` column is
filled by the thing that made the decision rather than inferred beside it:
`request`, `surface`, `global`, `auto`. `surface` becomes reachable for the first
time here, which is why doc 30 made that column text.

**Rejection is visible**, per doc 29 §5. A `requested` model on a surface that
forbids choice returns a refusal with a distinct reason — `not-selectable`,
alongside phase 1's `unknown` and `not-conversational` — so the existing notice
and the existing `ai_calls` refusal row both carry it with no new plumbing.

## 4. Enforcement points

| Change | Where |
| --- | --- |
| `surfaces` in the config type, reader **and writer** (P2) | `lib/ai/runtime-config.ts` |
| `SURFACE_DEFAULTS`, `resolveModel()`, `not-selectable` | `lib/ai/model-router.ts`, `lib/ai/model-catalog.ts` |
| Surface's provider fed into the existing pin logic (P5) | `lib/ai/provider.ts` `providerChain` |
| `resolveProvider({surface})` bypassing the global cache (P1) | `lib/ai/provider.ts` |
| `getAiSdkModel({surface, task})`, two callers pass theirs (P3) | `lib/ai/provider.ts`, `app/api/chat`, `app/api/documents/analyze` |
| Routes declare their surface | `/api/assistant` → `assistant`, `/api/anker/chat` → `copilot` (E1) |

## 5. Acceptance

1. **With no `surfaces` config, every resolution is identical to today.** The
   test asserts the resolved provider, chain and model for each surface against
   the pre-change values, because this is the property that makes the phase safe
   to deploy.
2. Pointing `chatbot` at Mistral `fast` and `assistant` at Qwen `reason` takes
   effect with no deploy, and the two do not affect each other.
3. A `requested` model on `chatbot` is refused with `not-selectable`, and the
   refusal is recorded once as doc 30's `rejected` row (P4: asserted at the
   resolver, since the route has no such input).
4. A surface pin keeps failover, and honours `providerStrict` when set (P5).
5. Two surfaces resolving inside the same 5-second window get their own answers
   (P1 — the assertion that fails if the global cache is reused).
6. A save that touches only an API key leaves `surfaces` intact (P2).
7. Rows carry `resolution = 'surface'` when rule 2 decided.

Each mutation-tested as in phases 1 and 30: reverting the line it guards must
fail that test and only that test.

## 6. Out of scope

- **Retuning any tier or provider.** E3: the mechanism ships, the values do not
  move. Acceptance 1 is the proof.
- **Admin UI for editing `surfaces`.** The config is reachable through the
  existing `/api/admin/ai-config` patch; a form for it is worth doing once the
  numbers from doc 30 say which surface is worth moving.
- **Doc 28 D1** (one assistant or two). E1 answers the routing question without
  settling the product one.
- **Native tool calling, cost ceiling** — doc 29 phases 4 and 5.
