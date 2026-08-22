# Improving Anker AI's Agentic Prowess — DeepSeek Practices Applied

*Source: the DeepSeek research corpus (`Deep Seek - Research papers/`). Grounded in
Anker's actual agent code: `lib/assistant/agent.ts`, `lib/ai/model-router.ts`,
`lib/agents/personas.ts`, `lib/assistant/tools*.ts`, and the pure-math engines in
`lib/modules/*`.*

## Framing: what transfers and what doesn't

DeepSeek's headline results come from **training** (RL with GRPO, reward models,
MoE/MLA architecture). **Anker does not train models** — it *routes* to providers
(Anthropic + DashScope: Qwen/GLM/DeepSeek/Kimi) and runs a **ReAct-style JSON
tool loop** (`agent.ts`). So we adopt DeepSeek's **inference-time and architectural
practices**, not the RL training itself. The good news: the most valuable ideas —
explicit reasoning, self-verification, verifiable rewards, principled critique,
test-time scaling, subgoal planning — are all **prompt/orchestration patterns** we
can implement directly, and Anker has a rare asset most agents lack: **deterministic
financial engines that can act as ground-truth verifiers.**

### The five highest-leverage transfers

1. **Engine-verified answers** — use `lib/modules/*` (409A/OPM, loan amortization,
   vesting, fund TVPI/IRR) as an *oracle* to check every number the agent asserts.
   DeepSeek's core lesson (R1, V3.2): *reward what you can verify.* Anker can verify
   the math exactly. This is the single biggest, lowest-risk win.
2. **Explicit thinking + thinking-retention in the tool loop** (R1 §2.3; V3.2 §3.2.1).
3. **Self-Principled Critique for all scoring** (SPCT, 2504.02495).
4. **A reasoning tier + test-time compute budget** in the router (R1; V3.2).
5. **An agentic eval harness** of "hard to solve, easy to verify" tasks (V3.2 §3.2.3).

---

## The corpus, mapped to Anker

| DeepSeek practice | Paper(s) | Anker gap today | Change |
|---|---|---|---|
| Explicit `<think>` reasoning before answering; rule/format rewards; self-verification & reflection *emerge* from reasoning | **R1** 2501.12948 | `agent.ts` `thought` is a one-line field, not a real reasoning trace; no verification | Add a real planning/thinking phase + a verify pass |
| **Thinking-retention** in tool-calling: keep reasoning across tool-only rounds, drop it only on a new *user* message, always keep tool calls+results | **V3.2** 2512.02556 §3.2.1 | Prompt is fully rebuilt from a flat transcript each step; reasoning is discarded | Structured message history with a retention policy |
| **"Hard to solve, easy to verify"**; `<task, tools, verifier>` tuples; a verification agent validates candidates | **V3.2** §3.2.3; **Prover-V1.5** 2408.08152 (RL from verifier feedback) | Agent numbers are never checked against the engines | Engine-verifier gate + agentic eval set |
| **Self-verifiable reasoning** — train/prompt a verifier, have the generator resolve its own issues | **DeepSeekMath-V2** 2511.22570 | No self-critique of drafts/answers | Self-verify pass on high-stakes outputs |
| **Self-Principled Critique Tuning** — generate weighted *principles* per input, then a *critique*, then a score; vote over k samples | **SPCT** 2504.02495 | `score_investors`, `assessReadiness` (campaign_readiness) emit opaque scores | Principles→critique→score scorer |
| **GRPO / self-consistency** (sample many, vote) | **DeepSeekMath** 2402.03300 | Single sample, temp 0.2 | Inference-time voting on high-stakes only |
| **Subgoal decomposition** / recursive planning | **Prover-V2** 2504.21801 | No upfront plan; pure step-by-step react | A planner step before the loop |
| **Reasoning primitives** (logic-flow planning, state-space search, decision-tree traversal, modular decomposition) | **CodeI/O** 2502.07316 | — | Use as explicit scaffolds in the planner prompt |
| **Reasoning tier / thinking modes; test-time compute scales with difficulty** | **R1**; **V3.2** | Router has `fast/balanced/deep`, no `reason` tier or effort budget | Add a `reason` tier + `effort` |
| **Context optical compression** for long docs | **DeepSeek-OCR** 2510.18234 / OCR-2 2601.20552 | Deck/data-room extraction is token-heavy | Optional: OCR-compress long docs |
| **Shared + routed experts** (isolate shared knowledge, specialize the rest) | **DeepSeekMoE** 2401.06066 | `ALL_TOOLS` is one flat belt for every persona | Split shared vs persona-specialized tools |

*Not applied (architecture/training papers, informative only):* DeepSeek-V2/V3/V4,
MLA, NSA, aux-loss-free balancing, DualPath, Engram, mHC, Fire-Flyer HPC — these are
about building/serving models, which Anker delegates to providers. *Skipped:*
DreamCraft3D (3D generation, unrelated).

---

## Concrete changes

### 1. Engine-verified answers (Phase 1 — do first)
**Practice:** *reward what you can verify* (R1, V3.2). **Anker's edge:** the pure-math
modules already compute the authoritative number.

Add `lib/assistant/verify.ts` — after the agent produces a final answer that contains
financial claims, extract the claims and recompute with the matching engine; append a
reconciliation and force a correction on mismatch.

```ts
// lib/assistant/verify.ts  (sketch — engines live in lib/modules/)
import * as opm from "@/lib/modules/opm-409a"          // 409A/OPM back-solve
import * as loan from "@/lib/modules/loan-amortization" // level payment / schedule
import * as vest from "@/lib/modules/vesting"           // cliff-aware vesting
import * as waterfall from "@/lib/modules/waterfall"    // fund distributions
// (+ valuation-409a, loan-servicing, share-plans, spv-economics as needed)

/** Recompute any numeric claim the agent made against the deterministic engine
 *  that owns it. Returns discrepancies the agent must reconcile before answering. */
export async function verifyClaims(answer: string, ctx: VerifyCtx): Promise<Discrepancy[]> {
  // 1. LLM extracts structured claims: {kind:'irr'|'fmv'|'payment'|'vested', value, inputs}
  // 2. For each, call the owning pure-math module with the same inputs
  // 3. Flag |claimed - computed| / computed > tol  (tol ~ 0.5%)
}
```

Wire into `agent.ts` before returning `final`: if discrepancies exist, add them to the
transcript and run one more synthesis step ("your figures disagree with the engine —
correct them"). This is DeepSeek's *verifiable reward* loop with a real oracle.

### 2. Explicit thinking + retention (Phase 1/2)
**Practice:** R1's `<think>…</think>`; V3.2's retention policy.

- In `agent.ts`, split the model turn into a **plan/think** field and the **action**
  JSON, and route the thinking to the `reason` tier (below). Keep `thought` but let it
  be multi-line reasoning, not a label.
- Replace the flat `transcript: string[]` with a **structured history** and apply
  V3.2's rule: *retain reasoning while only tool results are appended; drop it when a
  new user message arrives; always keep tool calls + results.* This cuts the redundant
  re-reasoning the current flat-rebuild causes and improves multi-step coherence.

### 3. Self-Principled Critique scoring (Phase 1)
**Practice:** SPCT — generate weighted principles, then critique, then score; the
default DeepSeek-GRM setting *is* self-generated principles, and *filtered* principles
"significantly boost reward quality."

Refactor scoring paths — `score_investors` (`tools.ts`), `assessReadiness`
(`lib/campaign/assessment.ts`, the `campaign_readiness` gate), and fund assessment — to:

```
1. PRINCIPLES: given the thesis/fund, emit 4–6 weighted principles (JSON).
2. CRITIQUE:  for each candidate, analyze against each principle (short text).
3. SCORE:     extract a 0–100 from the critique (weighted).
```

This makes every score **auditable** (principles + critique are shown/stored) and
higher-quality than a one-shot number. It also directly upgrades the paper's §13.3
assessment framework.

### 4. Inference-time scaling on high-stakes only (Phase 2)
**Practice:** self-consistency (DeepSeekMath), SPCT voting.

For *decisions that gate money or outreach* — the readiness decline/accept, the top-N
investor ranking, the assessment score — sample the scorer **k=3–5×** (shuffle order to
kill positional bias, per SPCT) and aggregate (mean for scores, majority for the
accept/decline verdict). Optionally a **meta-judge** filters low-quality samples before
voting. Bounded by a `stakes` flag so we never pay k× on cheap calls.

### 5. Reasoning tier + effort budget (Phase 1)
**Practice:** R1 distillation / V3.2 thinking modes; test-time compute scales with
difficulty.

In `model-router.ts` add a fourth tier `reason` and new tasks `agent_plan`,
`agent_verify`; default `campaign_readiness`, `deck_critique`, `agent_plan`,
`agent_verify` to it. Point `OLLAMA_MODEL_REASON` / the DashScope route at a
**reasoning model** (DeepSeek-R1-distill, GLM-thinking, or Claude with extended
thinking). Add a per-request `effort: 'low'|'med'|'high'` that scales `maxSteps` and the
voting `k` — R1's lesson that harder problems deserve more thinking time, cheaper ones
less (and its warning about *overthinking* simple tasks: cap effort on trivial queries).

### 6. Agentic eval harness (Phase 3)
**Practice:** V3.2 §3.2.3 — synthesize tasks that are *hard to solve, easy to verify*,
each with a Python verifier; keep only non-trivial pass@k.

Build `lib/assistant/evals/` — a set of `<task, verifier>` pairs where the verifier is a
**pure-math engine** or a deterministic DB filter:
- "Level payment on a $100k / 12% / 12mo loan?" → verified by `amortize` (= $8,884.88).
- "Vested options at month 24 for 48k/48mo/12mo?" → `vestedAt` (= 24,000).
- "Rank these 5 LPs for fund X by stage+geo fit" → deterministic filter oracle.
Run in CI (Vitest) — the agent analogue of the existing engine regression suite (§13.2),
catching agent/prompt regressions before they ship.

### 7. Persona = shared + specialized experts (Phase 3)
**Practice:** DeepSeekMoE — isolate *shared* experts (common knowledge) from *routed*
specialists. Today `ALL_TOOLS` is one flat belt injected for every persona. Split into a
**shared core** (research, DB query, doc/xlsx gen) + **persona-specialized** sets
(Founder / Fund / LP) chosen by a routing gate, shrinking each persona's prompt and
sharpening tool selection.

### 8. Document ingestion (Phase 3, optional)
**Practice:** DeepSeek-OCR context optical compression. For very long decks/data-rooms,
optically compress pages to fewer vision tokens before extraction
(`lib/matching/v2/document-extractor`, the deck extractor) — provider-dependent, so
treat as an experiment.

---

## Phased rollout

**Phase 1 — verify + reason + principled scoring (highest ROI, low risk):**
engine-verifier gate (§1), `reason` tier + effort (§5), SPCT scorer on the readiness
gate (§3). No breaking changes; all additive.

**Phase 2 — smarter loop:** thinking-retention history (§2), planner/subgoal step,
self-consistency on high-stakes decisions (§4).

**Phase 3 — durability:** agentic eval harness in CI (§6), MoE persona split (§7),
OCR compression experiment (§8).

## Guardrails (DeepSeek's own cautions)
- **Prefer rule/engine verifiers over neural reward models** — R1 explicitly avoids
  neural RMs on reasoning tasks due to *reward hacking*. Anker's engines are the ideal
  substitute.
- **Zero-shot, not few-shot** — R1: "few-shot prompting consistently degrades"
  reasoning-model performance; describe the task + output format directly (Anker already
  does this — keep it).
- **Watch overthinking** — cap reasoning effort on simple queries; don't pay k× voting
  or a `reason`-tier call when a `fast` model suffices.
- **Don't try to train/RL models here** — Anker routes to providers; these are
  orchestration patterns, not a training program.
