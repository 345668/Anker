# 32 — The frontier catalogue: models you do not have keys for yet

**Status:** design, 2026-09-28. Implements doc 29 phase 3 *(N5)*:

> Entries in `model-catalog.ts` with categories and capabilities; `TIER_CHAINS`
> generalised from `DASHSCOPE_TIER_CHAINS` to `[provider][tier]`. Keys are
> procurement (§3.1); this phase makes them usable the day they land and is worth
> doing before them.
>
> **Acceptance:** `/api/anker/models` offers a frontier model; selecting one with
> no key configured fails with "not configured", not a generic error.

---

## 1. What is actually running, verified 2026-09-28

| Claim | Evidence |
| --- | --- |
| N5 holds: the catalogue is Qwen-only | 71 of 71 entries are `provider: "dashscope"` in `lib/ai/model-catalog.ts` |
| Frontier providers exist only as a type union | `lib/ai/model-catalog.ts:24` |
| Tier chains are DashScope-shaped | `DASHSCOPE_TIER_CHAINS: Record<ModelTier, string[]>`, `lib/ai/model-router.ts:139` |
| The picker is served the whole catalogue, unfiltered by what is usable | `app/api/anker/models/route.ts` returns `MODEL_CATALOG` verbatim |
| A pick is validated for existence and category, never for a key | `resolveModelChoice`, `lib/ai/model-catalog.ts:191-197` |
| Key presence is already computable | `hasCredential(provider, cfg)`, `lib/ai/provider.ts` |

### 1.1 The constraint that shapes this phase — Q1

`model-catalog.ts` has **no imports**, and that is load-bearing, not incidental:
doc 29 phase 1 put `rejectionMessage()` there so the composer — a
`"use client"` component — could import the copy without pulling a server module
into the browser bundle. The production build is what proves it.

So the "is there a key for this?" test **cannot** live in that file. Answering it
needs the router config, which needs the database. Putting it there would drag
`@/lib/db` into the client bundle and break the build.

It goes where doc 31 put the same kind of gate: `resolveModel()` in
`model-router.ts`, which already takes an `AiRouterConfig`. The *reason* stays a
value in the catalogue — a string union is free — and only the *check* moves. This
is exactly the split `not-selectable` already uses, so it is a pattern being
followed rather than invented.

### 1.2 "Not configured" is not "unknown" — Q2

The obvious shortcut is to let an unusable model fall through to
`reason: "unknown"`. That would satisfy the letter of the acceptance criterion and
destroy the number doc 30 built.

`unknown` means *the catalogue and the picker disagree* — doc 29 calls a rising
count of those "N5 recurring", and the fix is a code change. `not-configured`
means *the platform is missing a credential it could buy* — the fix is
procurement, by a different person, on a different timescale. Folding them
together makes `rejectedByReason` unactionable in the one case this phase creates
on purpose.

So `not-configured` is a fourth `ModelRejection`, beside `unknown`,
`not-conversational` and doc 31's `not-selectable`.

### 1.3 Model ids are not invented — Q3

A catalogue entry naming a model that does not exist produces exactly the
"unknown model" upstream failure this phase exists to prevent, and it does so
after a user picks it. So the seed is restricted to ids this repo already calls:

| Provider | Id | Source |
| --- | --- | --- |
| anthropic | `claude-haiku-4-5-20251001` | `ANTHROPIC_DEFAULT_MODEL`, `provider.ts:86` |
| gemini | `gemini-2.0-flash` | `GEMINI_DEFAULT_MODEL`, `:88` |
| openai | `gpt-4o-mini` | `OPENAI_DEFAULT_MODEL`, `:91` |
| mistral | `mistral-small-latest` | `MISTRAL_DEFAULT_MODEL`, `:93` |

plus the current Claude family (`claude-opus-5-5`, `claude-sonnet-5`), which is
independently known.

**Deliberately narrow.** The OpenAI, Gemini and Mistral rows are one id each — the
one the platform already sends — because a wider list would mean guessing version
strings, and a wrong guess is a runtime 404 attributable to this document. Adding
to these lists is a one-line edit per model once the ids are confirmed against
each vendor's current lineup.

**No fabricated prices.** `priceIn`/`priceOut` are optional and are left unset on
frontier rows rather than estimated. The picker renders price when present; an
invented number shown next to a real one is worse than a blank.

---

## 2. Data model

Two additions to `CatalogModel`, both optional so all 71 existing rows are
untouched:

```ts
/** Native tool calling. Declared now because doc 29 phase 5 branches on it and
 *  a catalogue that cannot answer "can this model call tools?" forces that phase
 *  to hardcode a list. Nothing reads it yet. */
tools?: boolean
```

No other capability flags. A flag nothing reads is a claim nobody checks, and the
catalogue already carries `category`, `contextTokens` and `maxOutTokens` for the
distinctions the UI makes today.

### 2.1 `TIER_CHAINS[provider][tier]`

`DASHSCOPE_TIER_CHAINS` becomes `TIER_CHAINS: Record<string, Record<ModelTier, string[]>>`,
keyed by runtime provider name. **The `dashscope` entry keeps its four chains
byte-identical**, and `dashscopeModelChain()` keeps working by reading
`TIER_CHAINS.qwen` — the same safety property phase 2 held to, for the same
reason: every model call in the platform routes through these.

Frontier providers get a single-entry chain per tier, pointing at the one id the
seed knows. A one-model chain is honest about having no fallback, and
`generateDetailed`'s failover across *providers* still applies.

---

## 3. Enforcement points

| Change | Where |
| --- | --- |
| `not-configured` reason + its message | `lib/ai/model-catalog.ts` (type and copy only) |
| Frontier entries, `tools` flag | `lib/ai/model-catalog.ts` |
| `TIER_CHAINS` by provider | `lib/ai/model-router.ts` |
| The key check, refusing with `not-configured` | `resolveModel()`, `lib/ai/model-router.ts` |
| Per-model `configured` in the picker payload | `app/api/anker/models/route.ts` |

The route change is what stops this being a trap: the picker is currently served
every model with no indication of which will work. Offering frontier models
without saying which are reachable would turn one clear refusal into a menu of
them. `configured` lets the UI grey them out; the refusal is the backstop for a
client that ignores it, or a key revoked between listing and sending.

## 4. Acceptance

1. `/api/anker/models` includes at least one model per frontier provider, each
   with a `configured` boolean reflecting whether its key is present.
2. Picking a frontier model with no key refuses with `not-configured`, and the
   message names the provider to add a key for — not a generic failure, and not
   `unknown`.
3. Picking one **with** a key configured is honoured and routed to that provider.
4. `not-configured` is recorded as its own reason in doc 30's refusal counts, and
   is distinguishable from `unknown` in `rejectedByReason`.
5. With no config change, every DashScope tier chain resolves to the same models
   as before — the same byte-identical bar phase 2 set.
6. `model-catalog.ts` still imports nothing, and the production build still
   passes with the composer importing it.

Each mutation-tested: reverting the line it guards fails that test and only that
test.

## 5. Out of scope

- **Buying keys.** Doc 29 §3.1 — procurement. This phase makes a key useful the
  day it lands and is explicitly worth doing first.
- **Widening the frontier lists** beyond the ids in §1.3, for the reason given
  there.
- **Per-model pricing for frontier rows** — left blank rather than estimated.
- **Anything reading `tools`** — that is phase 5.
- **A picker UI that greys out unconfigured models.** The API gains the field;
  using it is a small client change worth doing with the doc 30 follow-up that
  makes the notice name the substitute model.

---

## 6. Built 2026-09-28 — what changed against this design

**A design flaw the implementation exposed: `config === null` is not "no key".**
Both routes read config as `readRouterConfig().catch(() => null)`. As first
written, the key check treated that null as "no credentials", which meant a single
transient database failure would refuse **every** model pick on the platform — with
a message blaming missing credentials that exist. The check now applies only when
config is non-null. Absence of evidence is not evidence of absence, and if a key
genuinely is missing, `generateDetailed` already fails with a precise message
naming it. This is the mutation worth keeping an eye on: removing the `config &&`
guard fails exactly one test.

**`providerConfigured` had to mirror two subtleties of `provider.ts`, not
approximate them.** `anthropicKeyOf` treats the literal string `"stub"` as absent,
and `localEnabledOf` honours `AI_PROVIDER=ollama` / `LOCAL_AI_ENABLED=true` as well
as the config flag. Missing either would make the check disagree with what actually
runs — reporting a model as available and then failing upstream, which is precisely
the generic error this phase replaces.

**Both routes moved from `resolveModelChoice` to `resolveModel`.** They called the
catalogue helper directly, so the key check would never have reached them —
`/api/anker/chat` and `/api/assistant` would have kept honouring picks for
providers with no key. This is what doc 31 §3 meant by one resolver; phase 3 is
what made it necessary rather than tidy.

**`DASHSCOPE_TIER_CHAINS` is retained as an alias of `TIER_CHAINS.qwen`,** so the
two existing readers keep their exact behaviour and the byte-identical claim is
checked by a test asserting all four chains literally.

**Three invariants worth more than the acceptance list**, now asserted: every id in
every chain exists in the catalogue; every chain's models route to the provider
that owns them; and every provider has all four tiers. A chain naming a model the
catalogue lacks is the same upstream failure as §1.3's bad id, reached without
anyone picking anything.

**What the test fixture revealed.** Adding the key check broke four existing
tests — all of them honoured-pick assertions in a fixture with no keys at all. That
is the new behaviour working correctly, but it showed how much of the suite
depended on picks being honoured with no credential present. The fixture now sets a
Qwen key, matching production, so those tests exercise the path they name.

**Verification.** 10 new tests (23 in `surface-routing.test.ts`), 770 passing
overall, typecheck clean, and the production build passes — which is what proves
acceptance 6, since `model-catalog.ts` still imports nothing and the `"use client"`
composer still imports from it. Three mutations each failed exactly one test:
folding `not-configured` into `unknown`, dropping the `config &&` guard, and
changing one id in a DashScope chain.
