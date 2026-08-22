# Anker Model Skills

Per-model **role files** that shape every LLM call Anker makes. Format adopted from
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)'s `SKILL.md`
(MIT). Each call the router (`lib/ai/model-router.ts`) makes resolves to a skill here;
the skill body is prefixed to the prompt and its params (`tier`, `temperature`,
`maxTokens`) drive the call — so a model's role is versioned, diffable, and reviewable
instead of buried inline. See design: `docs/anker-plugins-and-model-skills.md`.

## Layout
```
skills/
  README.md            ← this file (the format)
  manifest.json        ← task → skill/tier/model/params (machine-readable map)
  models/<task>.md     ← one role file per router task
  personas/<copilot>.md ← persona rows for the three agent presets
```

## `SKILL.md` format
YAML frontmatter + markdown body:

```markdown
---
name: <kebab-case id>              # unique
task: <router TaskTag>             # ties to lib/ai/model-router.ts TASKS
tier: fast | balanced | deep | reason
model: <hard pin | null>           # null = router/tier decides
description: <one-line "what this role does">  # shown in the skill catalog
temperature: <0–1>
maxTokens: <int>
json: true|false                   # expect strict JSON out
---
# Role — <what this model IS on the platform>
## Inputs
## Output contract   (strict schema when json:true)
## Method            (the DeepSeek practice this role applies)
## Constraints
```

## Tiers (map to `model-router.ts`)
- **fast** — classification, short rewrites, 1-liners (gemma2:2b class).
- **balanced** — structured JSON extraction, schema discipline (qwen2.5:7b class).
- **deep** — long-form analysis, scoring, critique (qwen2.5:14b class).
- **reason** — *new*: planning, verification, high-stakes gates → a reasoning model
  (DeepSeek-R1-distill / GLM-thinking / Claude extended thinking).

## Authoring rules
- **Zero-shot, not few-shot** (DeepSeek-R1: few-shot degrades reasoning models) — describe
  the task and output format directly; don't paste examples into reasoning-tier skills.
- **Strict output contract** — when `json:true`, give the exact schema; the caller parses it.
- **No fabrication** — every role forbids inventing firms, people, or numbers.
- **Apply the matching practice** — scorers use SPCT (principles → critique → score);
  numeric roles defer to the engine verifier; planners decompose into subgoals.
- Keep the body tight; the description is the trigger the catalog shows.
