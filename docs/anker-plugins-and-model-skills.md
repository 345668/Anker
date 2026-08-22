# Anker as Plugins + Per-Model Skill Files — extracted from DeepSeek Harness

*Analysis of `github.com/345668/deepseek-harness` (DeepSeek Harness `dsh`, MIT) for two
goals: (1) make Anker's platform **usable as plugins by agents**, and (2) give **each
model a detailed role/skill file** (markdown or JSON) that shapes every call. Companion
to [`anker-dsh-workflows-integration.md`](anker-dsh-workflows-integration.md) and
[`anker-agentic-deepseek-plan.md`](anker-agentic-deepseek-plan.md).*

## What dsh does (the two mechanisms we extract)

**Plugins.** dsh is "everything is a plugin" (Cordis). Capabilities register on a shared
`ctx`: `ctx.tools` (tool registry + a `pre-execute → guards → execute → post-execute →
finalize → result` pipeline, presentable as *native function-calling* or *Code Mode*),
`ctx.skills`, `ctx.llm` (provider-neutral adapter registry), `ctx.subagents`. Critically,
**`mcp/mcp-client` bridges any external MCP server's tools onto `ctx.tools`** — so the
standards-based way to be "a plugin for agents" is to **be an MCP server**. An
**agent preset** (`preset/agent-presets`) is a directory (`agent.cordis.yml`) that
composes a *toolset + persona + skills* into a named agent.

**Skills.** A skill is a `SKILL.md`: YAML frontmatter (`name`, `description` — a rich
"Use when…" trigger; optional `disable-model-invocation`, `user-invocable`) + a markdown
body. `skill-filesystem` discovers them from project/user roots; `tool-skill` shows a
**catalog** (name+description only) and loads the body on demand (progressive
disclosure). A **`persona`** row owns/shadows the system prompt for one agent.

---

## Goal 1 — Anker platform usable as plugins

### 1a. Ship an **Anker MCP server** (highest leverage)
Anker already has a tool belt (`lib/assistant/tools.ts`, `tools-fo.ts`,
`tools-platform.ts`): CRM, deal pipeline, network/intro paths, outreach, fund
performance, matchmaking, 409A/loan/vesting engines, doc/xlsx generation. Wrap these as
an **MCP server** (`@modelcontextprotocol/sdk`) at e.g. `apps/mcp/` or a route:

```
anker-mcp (stdio + HTTP/SSE)
├── tools:  crm.search, crm.move_stage, deals.list, deals.advance,
│           match.lps, score.investors, valuation.opm_409a, loan.amortize,
│           vesting.schedule, outreach.draft_batch, fund.metrics, docs.generate …
├── resources: investor DB, fund records (scoped, read-only)
└── auth:   per-workspace token → owner/persona scoping (reuse lib/auth)
```

Then **any** agent — dsh (via `mcp-client`), Claude Desktop, Cursor, or Anker's own
assistant — loads Anker as a plugin. One tool definition, many consumers. This is the
cleanest realization of "platform usable as plugins," and it reuses the existing tool
logic (the MCP layer is a thin adapter + auth scoping).

### 1b. Internal **tool registry + execute pipeline**
Refactor the flat `ALL_TOOLS` map into a small registry mirroring `ctx.tools`:
`register(tool, {personas, scope})` + a `pre-execute → guards → execute → post-execute`
pipeline. This gives us, for free, the insertion seam for the papers plan's
**engine-verifier** (a `post-execute`/final guard), the **guards** (repeat-reminder,
timeouts), audit logging, and **per-persona tool scoping** (the MoE shared-vs-specialized
split).

### 1c. **Agent presets** = tools + persona + skills
Formalize the three persona copilots as presets (mirroring `agent-presets`):

```yaml
# presets/fund-copilot/agent.cordis.yml   (illustrative)
persona: skills/personas/fund-copilot.md      # role prose (dsh `persona` row)
tools:   [deals.*, fund.*, match.lps, score.investors, outreach.*, docs.*]
skills:  [investor-score, fund-assessment, ic-memo, lp-match]
```

Anker already resolves persona → destinations (`personas.ts`); a preset just adds the
**tool subset** and the **skill set** per persona.

---

## Goal 2 — a detailed role/skill file per model call

Every model call in Anker goes through the router (`lib/ai/model-router.ts`,
task → tier → model). Today the *role* lives inline in whatever function calls
`generate(...)`. We externalize it into **one skill file per task/role**, adopting dsh's
`SKILL.md` format, and inject it automatically.

### 2a. Skill files (`skills/models/<task>.md`)
Frontmatter + body, one per router task. The body specifies, in detail, the model's
**role on the platform**, its **inputs**, its **strict output contract**, the **DeepSeek
practice** it applies, and its **constraints**:

```markdown
---
name: campaign-readiness
task: campaign_readiness          # router TaskTag
tier: reason                      # fast | balanced | deep | reason
model: null                       # optional hard pin; null = router decides
description: Conservative investor-readiness gate — scores a founder submission 0–100
  and decides proceed/decline with constructive feedback.
temperature: 0.2
maxTokens: 1200
---
# Role
You are Anker's **readiness gate**… (full role, rubric, SPCT principles→critique→score,
decline-feedback contract, refusal to fabricate, output JSON schema) …
```

### 2b. A JSON manifest (`skills/manifest.json`)
The "JSON prompt" the request mentions: a machine-readable map of every task → skill →
tier → default model → call params, so the loader (and admin UI) can resolve a role
without parsing markdown, and so the mapping is auditable in one place.

### 2c. The loader (`lib/ai/skills-loader.ts`)
A thin filesystem provider (mirroring `skill-filesystem`): read `skills/models/*.md` +
`manifest.json` once, cache, and expose `roleSkill(task)`. Wire it into `generate()` /
the router so **every call is prefixed with its role skill** and its params
(temperature/maxTokens) come from the skill. For the interactive assistant, also expose
the skill **catalog + a `skill` tool** (progressive disclosure, like `tool-skill`) so the
agent can pull in a specialized role mid-task.

### 2d. Why this is "fine-tuning without fine-tuning"
We don't train the models (Anker routes to providers). Instead we give each call a
**tight, versioned role contract** — the highest-ROI lever for hosted models, and exactly
what dsh's skill/persona system institutionalizes. Skills are diffable, reviewable, and
A/B-testable per model; the manifest makes the whole model-role surface one artifact.

---

## Deliverables in this change
- `skills/README.md` — the adopted `SKILL.md` format + authoring rules.
- `skills/manifest.json` — task → skill/tier/model/params (the JSON prompt map).
- `skills/models/*.md` — a role file per model call (exemplars shipped; rest follow the
  same shape).
- `skills/personas/*.md` — the three copilot persona rows (Goal 1c).
- *(design, not yet built):* `lib/ai/skills-loader.ts`, the MCP server (`apps/mcp/`),
  and the tool-registry pipeline.

## Recommended order
1. **Skill files + manifest + loader** (Goal 2) — self-contained, immediate quality win,
   no architecture change. *(scaffolded now)*
2. **Tool registry + execute pipeline** (Goal 1b) — unlocks verifier/guards/scoping.
3. **Anker MCP server** (Goal 1a) — makes the platform a plugin for every agent.
4. **Agent presets** (Goal 1c) — tie persona → tools → skills.

## Licensing
dsh is MIT (© 2026 DeepSeek). We adopt the `SKILL.md` **format** and the plugin/MCP
**patterns** (formats and architectures aren't copyrightable); any copied code gets an
MIT attribution in `THIRD_PARTY_NOTICES`.
