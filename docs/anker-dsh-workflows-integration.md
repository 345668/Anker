# DeepSeek Harness → Anker: Workflow Extraction & Integration Plan

*Source repo: `github.com/345668/deepseek-harness` (a mirror of DeepSeek AI's
**DeepSeek Harness `dsh`**, MIT-licensed). This document extracts the reusable
agentic **workflows** from `dsh` and maps them onto Anker's agent
(`lib/assistant/agent.ts`). It is the implementation companion to
[`anker-agentic-deepseek-plan.md`](anker-agentic-deepseek-plan.md): where that plan
derived practices from the DeepSeek **papers**, `dsh` is DeepSeek's **reference
implementation** of the same ideas — so we adopt its proven designs directly.*

## What dsh is

A plugin agent harness ("everything is a plugin," built on Cordis) with ~57 packages.
It is **not** a drop-in library for a Next.js app — most packages expect the Cordis
`ctx` runtime. Two things make it useful to us anyway:

1. Its **workflow designs are battle-tested and documented** (each package ships a
   README + an `.agents/notes` decision record) — we can **re-implement the patterns**
   natively in Anker's loop.
2. It ships a **`dsh-sdk-client`** that drives a dsh runtime **as a subprocess over
   stdio JSON-RPC** — so Anker can optionally **sidecar** dsh for heavy orchestration
   without importing the runtime.

**License:** MIT (© 2026 DeepSeek). Adopting patterns is unrestricted; if we copy code
verbatim we add attribution to `THIRD_PARTY_NOTICES` and keep the MIT header.

## The extractable workflows (and their Anker mapping)

| dsh package(s) | Workflow / pattern | Anker gap today (`agent.ts`) | Integration |
|---|---|---|---|
| **`goal/`**, `goal-round-driver`, `tool-goal` | **Durable same-session goal** + continuation driver — a persisted north-star objective consumed across rounds | The loop only has the raw `userTask` string; no persisted objective across steps/turns | Add `ctx.goal` to the assistant session: a persisted objective + acceptance criteria that every step is re-anchored to. Powers long tasks (campaign build, fund analysis). |
| **`plan/plan-mode`** | **Plan mode**: logged plan state, review flow, step-boundary flush, explicit exit tool | No plan phase — pure step-by-step react | A "plan → (review) → execute" mode for high-stakes tasks. Realizes the *subgoal decomposition* item in the papers plan. |
| **`workflow/tool-ralph`** | **Ralph fresh-agent loop**: one immutable objective handed to a *sequence of fresh child agents* (`inheritsParentContext:false`), bounded `maxRounds` | Anker re-sends a **growing** transcript every step → context rot on long tasks | A bounded "fresh-context" loop: re-invoke the agent each round with a *fresh* transcript but the **persisted goal + accumulated artifacts/notes**. Ideal for "enrich this whole list", "keep refining the IC memo until acceptance". |
| **`workflow/tool-workflow`**, `workflow`, `workflow-worker-thread` | **Model-authored orchestration**: the model writes a JS script that fans out subagents in phases and returns structured results | Anker BATCHES (`score_investors`, `enrich_firms`) but can't do model-authored multi-phase fan-out | Phase 2/3: a `workflow`-style tool for "research 20 firms in parallel → synthesize". Start with fixed phases; model-authored later. |
| **`subagent/*`** (`spawn-in-process` = fresh child, `fork-in-process` = child from parent history, `tool-subagent`, `tool-subagent-report`) | **Subagent delegation** with multiple providers | No delegation; one flat loop does everything | Add a `delegate` tool that runs a focused child agent (fresh or forked) for a subtask — e.g. the **engine-verifier** subagent and per-firm research subagents from the papers plan. |
| **`compaction/`** (`compaction-basic` summarizer, `compaction-tool-result-pruner` model-free pruning, `command-compact`) | **Context compaction**: token-pressure summarization + model-free tool-result pruning | Flat transcript grows unbounded; nothing is pruned or summarized | **Directly implements V3.2 thinking-retention** (papers plan §2). Add token-pressure summarization + prune bulky tool results (kept: tool call + short result; dropped: raw dumps). |
| **`guard/`** (`repeat-tool-reminder`, `timeout-policy`) | **Loop-hygiene guards**: advisory reminders on repeated calls, per-call tool deadlines | Anker has a single "same tool+input twice → stop" check | Upgrade to advisory repeat-reminders (nudge instead of hard stop) + per-tool timeouts. |
| **`hooks/`** + interception extension points | **Typed lifecycle interception** (pre/post tool, agent events) | No interception seam | A tiny pre/post-tool hook seam — the clean insertion point for the **engine-verifier**, audit logging, and guards. |

Everything above is a proven design for exactly the gaps the papers plan identified —
`dsh` and that plan **converge**.

## Two integration paths

**Path A — adopt patterns natively (recommended default).** Re-implement the designs as
small modules in Anker (`lib/assistant/`), driven from `agent.ts`. Fits Vercel
serverless, no new runtime, no heavy dependency. Best for: goal, plan, compaction,
guard, hooks, the Ralph loop, and single-level subagent delegation.

**Path C — sidecar dsh via `dsh-sdk-client` (optional, later).** For genuinely heavy
multi-agent orchestration (the `workflow` tool, real Claude-Code/Codex subagent
providers), run a dsh runtime as a subprocess and drive it over JSON-RPC from a
**dedicated long-running Anker worker** (not a serverless function). Adds power at the
cost of a deployable agent service. Defer until a workflow needs it.

*(Path B — importing `@deepseek-ai/dsh-*` packages directly into Next.js — is not
viable: they expect the Cordis host runtime.)*

## Recommended integration set (phased)

**Phase 1 — context + hygiene + goal (high ROI, low risk; Path A):**
1. **Compaction** — token-pressure summarization + tool-result pruning on the transcript
   (fixes unbounded growth; implements V3.2 retention).
2. **Guard** — repeat-tool advisory reminders + per-tool timeouts (replaces the blunt
   dup-stop).
3. **Goal** — a persisted session objective + acceptance criteria re-anchored each step.
4. **Hook seam** — pre/post-tool interception (the insertion point for the papers plan's
   engine-verifier).

**Phase 2 — planning + fresh-context loops:**
5. **Plan mode** — plan → optional review → execute for high-stakes tasks.
6. **Ralph loop** — bounded fresh-context iteration for long-horizon tasks.
7. **Subagent delegation** — a `delegate` tool (fresh/fork child) incl. the verifier
   subagent.

**Phase 3 — orchestration:**
8. **Workflow tool** — fixed-phase parallel fan-out (e.g. batch firm research), evolving
   toward model-authored scripts; sidecar dsh (Path C) if/when needed.

## How this composes with the papers plan
`dsh` gives us the *scaffolding* (goal, plan, compaction, guard, subagent, Ralph);
the papers plan gives us the *reasoning quality* (engine-verified answers, SPCT scoring,
reasoning tier, self-consistency, agentic evals). Built together: Anker's agent gains a
persisted goal, a plan, a compacted context, hygiene guards, a hook seam that runs the
**engine-verifier**, delegation to focused subagents, and fresh-context Ralph loops for
long tasks — DeepSeek's harness design realizing DeepSeek's papers' practices.

## Open questions for you
- **Scope:** adopt the Phase-1 set natively now, or evaluate the dsh **sidecar** (Path C)
  first for a specific heavy workflow?
- **Deploy shape:** is a dedicated long-running agent worker on the table, or must
  everything stay within Vercel serverless (which favors Path A)?
- **Attribution:** confirm we add MIT attribution to `THIRD_PARTY_NOTICES` for any
  design/code we lift.

*Awaiting your direction before implementing (per "and wait").*
