# 33 — The cost ceiling: a run that cannot be priced cannot be capped

**Status:** design, 2026-09-29. Implements doc 29 phase 4 *(G4)*, §7:

> `checkAiBudget()` enforces a 240-second deadline and a **16 model-call** cap. It
> has no notion of money. […] extend the context with accumulated tokens and an
> estimated spend, fed from what `generateDetailed()` already returns, and check
> it in `checkAiBudget()` beside the call cap.
>
> **Acceptance:** a run that exceeds its ceiling stops with a clear message and a
> `run.ended{reason: budget}` event; the per-run figure is visible in the usage
> panel; a provider reporting no tokens degrades to the call cap and is labelled.

**E2 is answered** from the investor deck v3 (2026-09-29): see §4.

---

## 1. What is actually running, verified 2026-09-29

| Claim | Evidence |
| --- | --- |
| The budget is time + call count, with no money | `lib/assistant/context.ts:22-28` |
| The context carries exactly `{principal, signal, deadline, modelCalls}` | `lib/assistant/context.ts:17` |
| **Token counts are never captured** | see §1.1 |
| `GenerateResult` has no token fields | `lib/ai/provider.ts:256-269` |
| The catalogue prices DashScope models, not frontier ones | `priceIn`/`priceOut`; doc 32 §1.3 left frontier rows unpriced on purpose |
| `run.ended` exists with `reason: "error" \| "done"` | `lib/assistant/agent.ts:325,333` |
| A fourth path captures usage and records nothing | `generateTyped`, `lib/ai/sdk-bridge.ts:80-85` |

### 1.1 The phase's premise is false — C1

Doc 29 §7 says "`lib/ai/usage.ts` already records `prompt_tokens` and
`output_tokens` per provider, model and task". The **schema** does. The **code**
does not.

`AiCallRecord` accepts both fields and `recordAiCall` writes them
(`usage.ts:114-115`); `aiUsageSummary` sums them (`:249-250`). But no call site
ever supplies them — `provider.ts` does not parse `usage` from any provider
response, and `GenerateResult` has nowhere to put it if it did.

Measured against the live database:

```
ai_calls: 2531 rows | prompt_tokens set: 0 | output_tokens set: 0 | duration_ms set: 2531
```

Every row for every call ever made. `duration_ms` proves the recording path
works; tokens were simply never produced. So `aiUsageSummary.totals.promptTokens`
has always returned null, and the honest reading of "no provider in this window
reported tokens" was, all along, "nothing has ever asked them".

**This inverts the phase.** Capturing tokens is the work; enforcing a ceiling on
top is the small part. A ceiling built on the existing data would cap every run at
zero spend forever — it would pass its own tests and never fire.

### 1.2 Pricing covers the cheap models, not the expensive ones — C2

Money = tokens × price, and the catalogue prices only DashScope models. Doc 32
deliberately left frontier rows unpriced rather than inventing figures (§1.3).

So the models a ceiling exists to guard against — doc 29 §7: "sixteen calls on
`qwen-flash` and sixteen on a frontier model differ by orders of magnitude" — are
exactly the ones that cannot be priced today. The deck puts frontier at **20–50×**
the fast tier.

This is not a reason to invent prices. It is a reason for the ceiling to be
explicit that its coverage is partial, and to keep the call cap as the bound where
price is unknown.

### 1.3 The honest limit is two limits, not one — C3

§7 names one: a provider that reports no tokens falls back to the call cap. There
are two independent ways a run cannot be priced:

1. the provider reported no usage, or
2. the model has no price in the catalogue (every frontier model, today).

Either one means the money ceiling cannot bind for that call. Both must degrade to
the call cap **and be labelled**, or an operator reading "€0.00 spent" cannot tell
a cheap run from an unmeasured one. The run's figure therefore carries a coverage
flag, not just a number.

### 1.4 The deck promises a different mechanism — C4

Doc 29's acceptance is that a run over its ceiling **stops**. The deck (p.10) says
research and outreach agents are metered "per run — **approval above a cost cap**",
and approval-gating is the product's stated principle.

These are different behaviours, and the approval one needs an approval queue that
does not exist (doc 28 D2 is still open). This phase builds the stop, because that
is what doc 29 specifies and what can ship without D2. **Escalate-to-approval is
the natural successor**, and the ceiling built here is its prerequisite either way:
you cannot ask for approval above a cap you cannot compute.

Related gap, named so it is not mistaken for this phase: the deck's "credit
allowance sized to its tier", top-ups and 7–18%-of-plan envelope describe a
**monthly metering and billing** system. This phase caps **one run**. Nothing here
enforces a monthly allowance, and the two should not be conflated in any copy.

---

## 2. Data model

### 2.1 Tokens through the generation path

```ts
// GenerateResult gains:
usage?: { promptTokens?: number; outputTokens?: number }
```

Populated by each `runProvider` branch from the response body the provider already
returns — OpenAI-compatible providers (`qwen`, `openai`, `mistral`) report
`usage.prompt_tokens` / `usage.completion_tokens`; Anthropic reports
`usage.input_tokens` / `usage.output_tokens`; Gemini reports
`usageMetadata.promptTokenCount` / `candidatesTokenCount`. Absent stays absent —
an unreported count is null, never zero (`usage.ts` rule already).

`generateDetailed` passes it to `recordAiCall`, which finally fills the two columns
it has always had.

### 2.2 Spend in the context

```ts
// lib/assistant/context.ts — the run-scoped counter
{ principal, signal, deadline, modelCalls,
  spendUsd: number,        // accumulated, priced calls only
  pricedCalls: number,     // how many calls contributed a price
  unpricedCalls: number }  // how many could not be priced (§1.3)
```

Enforcement must be in-request, not in `usage.ts`, which is fire-and-forget by
design and therefore cannot block (§7, and `usage.ts` rule 2).

### 2.3 The ceiling, per surface

Reusing phase 2's `surfaces` map rather than inventing a second config
(`AiSurfaceConfig`, doc 31 §2):

```ts
/** Per-RUN ceiling in USD. Omitted means the built-in default for the surface. */
maxRunCostUsd?: number
```

**USD, not EUR.** The catalogue's prices are USD per 1M tokens and are the only
price data in the system. The deck's figures are EUR, and converting would need a
rate nobody has set — a silently wrong rate makes a ceiling wrong in a direction
nobody notices. The business envelope stays EUR; the mechanism stays in the unit
its inputs are in.

## 3. Enforcement points

| Change | Where |
| --- | --- |
| Parse usage per provider; `GenerateResult.usage` | `lib/ai/provider.ts` `runProvider` branches |
| Pass usage to `recordAiCall` (fills columns that were always null) | `generateDetailed` |
| Price a call from the catalogue | new `costOf(model, usage)`, `lib/ai/model-catalog.ts` — pure, no imports (doc 32 §1.1) |
| Accumulate spend; count priced vs unpriced | `lib/assistant/context.ts` |
| Check spend beside the call cap | `checkAiBudget()` |
| `run.ended{reason:"budget"}` | `lib/assistant/agent.ts` |
| Per-run figure + coverage in the panel | `lib/ai/usage.ts`, `/api/admin/ai-usage` |

`checkAiBudget` is called **before** a model call, so it stops the call that would
exceed the ceiling rather than reporting it afterwards. A single call that blows
the ceiling on its own still happens once — there is no way to know its cost before
making it — and that is the documented floor of this mechanism.

## 4. E2 — answered

> **E2:** What is the per-run ceiling, in money, per surface? *(product / finance)*

From the deck, A3's per-workspace monthly AI budget: Founder €45, Fund I–II €200,
Fund III–IV €1,000, LP €40; p.10's "allowances keep AI at 7–18% of plan price";
tier weights fast 1× / balanced 3× / deep 8× / reasoning 15× / frontier 20–50×.

The deck gives a **monthly workspace** envelope; a **per-run** cap has to be derived
from it, and these are therefore *proposed defaults*, configurable per surface:

| Surface | Default | Reasoning |
| --- | --- | --- |
| `chatbot` | $0.10 | One turn, no tools, cheapest tier |
| `copilot` | $0.25 | One turn, may be a frontier pick by choice |
| `assistant` | $1.00 | Agentic, up to 16 calls; ~2% of a founder's monthly AI budget |
| `batch` | $2.00 | No user waiting; larger documents |

Sized as **runaway guards, not quotas**: at $1.00 a founder's €45 month affords
~45 capped assistant runs, and a normal run costs far less. The monthly allowance
the deck describes is a separate mechanism (§1.4) and is not what this enforces.

## 5. Acceptance

1. A completed call records non-null `prompt_tokens` / `output_tokens` for every
   provider that reports them — the assertion that would have failed for all 2531
   existing rows.
2. A run whose priced spend exceeds its surface ceiling stops with a clear message
   and emits `run.ended{reason:"budget"}`.
3. A run whose calls cannot be priced is **not** stopped by the money ceiling, is
   still bound by the 16-call cap, and is labelled unpriced.
4. The per-run figure and its coverage are visible in the usage panel.
5. Ceilings are per surface and configurable without a deploy; an absent config
   uses the §4 defaults.
6. With no ceiling exceeded, behaviour is unchanged — the same byte-identical bar
   as phases 2 and 3.

Each mutation-tested.

## 6. Out of scope

- **Approval above the cap** (§1.4) — needs doc 28 D2.
- **Monthly allowances, credits, top-ups, billing** (§1.4).
- **Prices for frontier models** — doc 32 §1.3 stands; they are unpriced until
  confirmed, and §1.3 here is how the ceiling copes.
- **Recording `generateTyped`** (`sdk-bridge.ts`) — a fourth unrecorded path,
  Ollama-only with two callers. Named in §1 so it is not rediscovered as new.
- **Currency conversion** (§2.3).
