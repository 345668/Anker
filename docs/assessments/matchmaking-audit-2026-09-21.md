# Investor matchmaking — audit of fields, extraction, matching, outputs and AI

**Date:** 2026-09-21 · **Scope:** founder → investor and LP → fund matchmaking,
end to end · **Method:** read the code and traced each field from the form to
the thing that consumes it. No changes made.

The headline is that this is further along than a feature request implies. Both
directions have real engines, validated forms, AI extraction and multi-format
deliverables. The gaps are not missing machinery; they are **asymmetries
between the two sides**, **fields whose purpose is invisible to the person
filling them in**, and **one capability that does not exist at all**.

---

## The short version

| Area | Founder side | LP side | Gap |
| --- | --- | --- | --- |
| Form + validation | `startupSchema` | `fundDraftSchema` | comparable |
| Readiness feedback | `startupReadiness()` | `fundReadiness()` | LP's is hand-rolled, not from the schema |
| Extraction from documents | yes | yes | comparable |
| Deterministic scoring | yes | yes | comparable |
| **AI enrichment during a run** | **none** | yes, on by default | **F1** |
| Semantic thesis matching | yes | yes | comparable |
| XLSX workbook | yes | yes | comparable |
| **CSV** | **none** | firms + contacts | **O1** |
| Methodology doc (md/docx) | yes | yes | comparable |
| Outreach plan / agenda | yes | yes | comparable |
| **Bundled download** | **none** | **none** | **O2** |
| **AI usage recorded anywhere** | **none** | **none** | **A1** |

Ranked findings follow. Severity is about consequence, not effort.

---

## A. AI integrations — managed, not observed

### A1 — Nothing records what the AI did. *(highest)*

Every AI call in the platform funnels through one function,
`generateDetailed()` in `lib/ai/provider.ts:243`. It resolves a provider chain,
fails over on 429/5xx, applies a role skill, honours a per-task kill switch,
and returns:

```ts
interface GenerateResult {
  text: string
  error: string | null      // why it failed
  provider: AiProvider      // who answered
  model: string | null      // with what
  status?: number           // upstream HTTP status
}
```

Every one of those fields is **discarded by the caller**. There is no table, no
counter, no log line that survives the request. Not recorded anywhere:

- how many AI calls a workspace made, and for which of the ~14 tasks
- tokens in and out, and therefore cost
- latency, and therefore which task is making runs slow
- failure rate per provider, and **how often failover fired** — the chain
  silently moves work from Gemini to Claude to local, and nobody can see it
  happen
- which model actually served a request, as opposed to which was configured

**Consequence.** SAIL's `/ai-config` can set keys and flip task switches, so
the platform is *managed*. It cannot be *observed*, because there is nothing to
observe. A question as basic as "did the Qwen key work last week" has no answer
short of reproducing it. A provider that degrades — slower, or failing over
constantly — is invisible until a user complains about quality.

**Why it is tractable.** One chokepoint, already returning the right fields.
This is instrumentation at a single function, not a 43-site refactor. The
`audit_events` table (`scripts/migrations/2026-08-17-audit-events.sql`) is the
wrong home — it is append-only, actor-centric and rendered for compliance,
while this is high-volume operational telemetry — but it is a good model for
the shape.

### A2 — Task kill switches are invisible in their effect

`isTaskEnabled()` returns `""` with `error: "task '<t>' disabled by admin"`,
and callers fall back to a deterministic path. That is a good design. But a
disabled task is indistinguishable, downstream, from a task that ran and
produced nothing — no counter of how often a switch suppressed a call, nowhere
in SAIL showing which switches are off and what that cost. An admin can turn
something off and never learn whether it mattered.

### A3 — `ai_rationale` runs hundreds of times per match and is unbudgeted

`TASK_TIER` marks it `fast` with the comment *"1 line, run hundreds of times
per match run"*. That is the right tier choice and there is still no ceiling:
no cap per run, no measurement of what a single large run costs. Combined with
A1, the first evidence of a problem will be an invoice.

---

## B. Fields — collected honestly, consumed invisibly

### F1 — Founder matching has an `enableAi` option that does nothing *(high)*

`runOptionsSchema` (`lib/matching/profile-readiness.ts:6`) accepts `enableAi`.
The LP route passes it through (`app/api/lp/matching/run-v2/route.ts:52`) and
the LP engine acts on it, defaulting to **on**:

```ts
const enableAi = options.enableAi !== false && (await isAiAvailable())
```

The founder route validates `enableAi` and then **never reads it**
(`app/api/founder/matching/run/route.ts` destructures only `minScore`,
`maxFirms`, `maxContacts`). `founder-engine.ts` imports no enrichment and
reports `aiEnrichmentsApplied: 0` as a **literal**, not a count.

So: LP runs are AI-enriched by default; founder runs never are; the API
contract says both are configurable; and the founder session summary reports a
zero that looks measured. A caller has no way to discover this short of reading
the engine.

### F2 — Three classes of field, and the form does not distinguish them

Tracing every field in `startupSchema` to its consumer gives three groups:

**Scored** — changes which investors come back. All nine that
`founder-scoring.ts` reads:
`sectors`, `primarySector`, `stage`, `location`, `geographyTargetRegions`,
`askAmount`, `checkSizeIdealMin`, `checkSizeIdealMax`, `thesisKeywords`.

**Displayed** — appears in the workbook and the report, changes nothing:
`arr`, `teamSize`, `preMoneyValuation`, `oneLiner`.

**Outreach-only** — consumed by `lib/campaign/{draft,assessment,orchestrator}.ts`
to personalise messages, never seen by the matcher:
`mrr`, `growthRateMom`, `foundedYear`, `founderBios`, `dataRoomSummary`.

Plus `pitchDeckSummary`, which is the one field that crosses over — it feeds
`v2/semantic.ts` and so does affect matching, via a different path from the
scored nine.

None of this is wrong. Every field has a consumer. But a founder filling in
month-over-month growth reasonably believes it is improving their match list,
and it is improving their cold email. **The form asks for twenty-odd fields and
says nothing about which ones do what**, which makes a long form feel arbitrary
and makes the nine that matter easy to under-invest in.

### F3 — `fundReadiness()` is hand-rolled while `startupReadiness()` derives from the schema

`startupReadiness()` parses with zod and maps issues to labels, so validation
and feedback cannot drift. `fundReadiness()` re-implements five checks by hand
(`profile-readiness.ts:54`) against a narrowed inline type, while
`fundDraftSchema` — with its cross-field rules for hard cap and minimum
commitment — sits directly above it, unused by the readiness path.

A field added to `fundDraftSchema` will not appear in readiness. A cross-field
rule will reject a submission the readiness check called complete, so the user
is told they are ready and then refused.

### F4 — Extraction fills gaps only, and that rule is right but undocumented to the user

`fillEmpty()` (`profile-readiness.ts:66`) only writes where the current value is
empty, and treats `0` as a value rather than a gap — a genuinely good decision,
since zero ARR is information. But a user who uploads a deck after typing a
wrong number sees nothing change and has no way to know extraction deliberately
declined. There is no "extracted, but you already had a value" state, and
`extractedFrom` exists on the type to carry provenance without being surfaced.

---

## C. Outputs

### O1 — Founders get no CSV

LPs get `export/csv/firms/[sessionId]` and `export/csv/contacts/[sessionId]`.
Founders get XLSX, methodology and an outreach plan, and no CSV at all. CSV is
what people actually paste into a CRM or a sheet they already have; XLSX is
what they open once and look at. This is the most-asked-for format missing on
the side with more users.

### O2 — There is no bundle, and the code says so

`app/api/lp/export/deliverables/[sessionId]/route.ts:9` reads:

> *"For a true zip bundle the client can call all three in…"*

So "download everything" is three requests and three files, on both sides. A
zip of the workbook plus the markdown documents is the obvious deliverable and
neither side has it.

### O3 — Two export shapes for the same idea

The founder route takes `?format=xlsx|methodology|outreach` plus `?doc=docx`;
the LP route takes `?format=xlsx|methodology|agenda` plus `?doc=docx`, and
additionally has separate CSV endpoints under a different path shape. The
founder route also accepts a `-docx` suffix on `format` as a second way to say
the same thing. Nothing is broken; a client integrating both writes the logic
twice and guesses which spelling a given side accepts.

---

## Ranked, with what each is worth

| # | Finding | Severity | Effort | Why this order |
| --- | --- | --- | --- | --- |
| A1 | No AI telemetry at all | **High** | Medium | The only true capability gap. Everything else is visible by reading code; this is invisible in production. |
| F1 | Founder `enableAi` silently ignored | **High** | Low | An API contract that lies, and a reported metric that is a literal. |
| F3 | LP readiness drifts from its schema | Medium | Low | Users told they are ready, then refused. |
| O1 | No founder CSV | Medium | Low | Most-wanted format, missing on the bigger side. |
| F2 | Field purpose invisible | Medium | Medium | Costs match quality quietly, via under-filled scored fields. |
| A2 | Kill-switch effects unmeasured | Medium | Low | Follows A1 almost free. |
| O2 | No bundled download | Low | Low | Known, written in a comment. |
| A3 | `ai_rationale` unbudgeted | Low | Low | Becomes urgent the month it becomes urgent. |
| F4 | Extraction declines silently | Low | Low | Confusing, not harmful. |
| O3 | Two export shapes | Low | Medium | Only bites a third-party integrator. |

## What I would do first

**A1 and F1 together.** They are the two findings where the system currently
reports something untrue — a zero that was never counted, and an option that is
accepted and dropped — and A1 is the prerequisite for SAIL doing the "observed"
half of what it is supposed to do. A1 lands at one function with a migration
and a SAIL page; F1 is an afternoon and removes a false metric.

Neither depends on the other, and both are cheap relative to what they make
visible.

## Deliberately not covered

- Match **quality**: whether the scoring weights produce good investors. That
  needs outcome data (`lib/matching/outcome-events.ts` exists and is a starting
  point), not a code read.
- The investor/LP **data sources** and their freshness.
- Anything in the campaign layer beyond where founder fields are consumed.
