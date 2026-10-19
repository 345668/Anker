# 35 — AI availability: Qwen first, doors open to the rest

Status: implemented 2026-10-01. Source: `Anker-SAIL-AI-Audit-2026-09-30.md`.

## Why

A production diagnostic showed one provider (Mistral) returning HTTP 429 with no
fallback: only a Mistral credential was stored. The audit's findings were
checked against the **current** tree (which is well past the audit's 21 Sep
snapshot) before anything was changed. Still true, and fixed here:

| # | Finding | Where |
|---|---|---|
| 1 | Qwen ranked **last** in `resolveProvider`, `providerChain` and PDF vision | `lib/ai/provider.ts`, `lib/ai/pdf-vision.ts` |
| 2 | Three different Qwen endpoints (Beijing, `intl.ap-southeast-1.maas`, Singapore); no region setting | provider, pdf-vision, embeddings |
| 3 | Saved per-task and Qwen model overrides ignored by the Qwen branch and the stream path | `runProvider`, `generateStream` |
| 4 | Qwen errors labelled "Mistral"; Qwen absent from `getAiStatus` | `runOpenAICompatible`, `getAiStatus` |
| 5 | Failure cause discarded; every failure became a generic 503 | `agent.ts`, `/api/assistant`, `/api/anker/chat` |
| 6 | Per-message 5-token probe on `deep_research`, a data-quality switch the whole platform shares | `runAssistant` |
| 7 | `patchRouterConfig` caches **ciphertext** as the runtime key | `runtime-config.ts` |
| 8 | `clearTaskOverride` writes decrypted provider keys back **in the clear** and returns them to the browser; `emailVerificationApiKey` was never redacted | `runtime-config.ts`, `/api/admin/ai-config` |
| 9 | `/api/diagnostics` is public and makes a billable model call | `app/api/diagnostics/route.ts` |
| 10 | Gemini default `gemini-2.0-flash` is past its shutdown date | provider, router, catalogue |

## Decisions

1. **Qwen leads, nothing is removed.** Auto order becomes
   `qwen → anthropic → openai → mistral → gemini → ollama`. Every provider keeps its
   key slot, adapter, catalogue entries and failover role. An admin
   `providerOverride` still wins, and `providerStrict` still forbids failover.
   Embeddings are **not** moved: stored vectors are tied to one model.
2. **One Qwen endpoint resolver** (`lib/ai/qwen-endpoint.ts`): `QWEN_BASE_URL` >
   region (`cfg.qwenRegion` / `QWEN_REGION`: `intl` Singapore, `us` Virginia,
   `cn` Beijing) > workspace id > default `intl`. Alibaba keys are region-bound, so a
   401 on Qwen now says to check the region.
3. **Typed failures** (`lib/ai/failure.ts`): `rate_limited`, `quota_exhausted`,
   `credentials_invalid`, `credentials_missing`, `model_unavailable`,
   `task_disabled`, `config_unreadable`, `cancelled`, `timeout`, `provider_error`.
   Carried on `GenerateResult`, recorded on the ambient AI context, mapped by the
   routes to a status, a safe message, retry guidance and a request id. Provider
   detail stays in server logs.
4. **No inference to ask "is AI up?"** The assistant checks readiness from
   configuration (provider chain, credential, task enabled) and lets the first real
   call report its own failure.
5. **Assistants get their own task**, `assistant_chat` (deep tier, same chains), so
   switching off the research-dossier task no longer disables founder/VC/LP chat.
6. **Secrets cross one boundary.** Persisted = encrypted; runtime = decrypted;
   responses = redacted by one helper that covers every secret field. Writes
   invalidate the cache and re-read rather than caching what was just persisted.
7. **Diagnostics need an admin.** Anonymous callers get a bare liveness answer with
   no provider call. Detail and the optional inference probe (`?probe=1`) require
   `requireAdmin`.

## Out of scope (named so nobody assumes otherwise)

- **SAIL** is a separate repository: deploy-token failure, staff-role checks on its
  PATCH, optimistic concurrency, task-list drift, and the secret list on its config
  page. None is touched here.
- **Operator actions** that code cannot do: raise or replace the Mistral capacity,
  store a DashScope key (or set `DASHSCOPE_API_KEY`), clear the stored Mistral
  `providerOverride` (SAIL → Auto), choose `QWEN_REGION` to match the key.
- A **distributed** rate limiter needs shared state (Redis or a table). The
  process-local gate stays and is documented as best-effort.
- Ollama needs a reachable model server; enabling the flag alone changes nothing.

## Rollback

Every change is code-only and additive. Revert the commit to restore the previous
order; no migration, no stored-data change. Stored configuration written by SAIL
is read exactly as before.

## Acceptance (from the audit)

Simulated 429 → `rate_limited` with retry guidance; a configured backup succeeds;
strict mode does not escape its provider. A saved task or Qwen model is the model
submitted upstream and shown in status. Save, clear-task and reload never put
plaintext in storage or ciphertext upstream. Anonymous `/api/diagnostics` makes no
provider call.

## Addendum (2026-10-02): Qwen lanes, free allowance first

Two Qwen credentials, spent in order: the pay-as-you-go key's free allowances (free-tier models only, model by model), then the token-plan key on its own endpoint and model list, then the other providers. Implemented in `lib/ai/qwen-lanes.ts`.

- Env: `QWEN_FREE_API_KEY`, `QWEN_PLAN_API_KEY`, `QWEN_PLAN_BASE_URL` (default `coding-intl`), `QWEN_PLAN_MODEL_<TIER>`, `QWEN_PLAN_MODELS`. Neither key variable set = the single-lane behaviour above, unchanged.
- Signal: 403 `AllocationQuota.FreeTierOnly` / 429 `Throttling.AllocationQuota` mark that model exhausted for 30 minutes (per instance); a plain rate limit does not. A bad key leaves the lane.
- Limit: code cannot read a balance. Without the console's free-quota-only mode on each model, Alibaba bills past the allowance instead of returning the signal.
- Status: `/api/diagnostics` (admin) shows `provider.qwenLanes` with currently skipped models; no keys.

## Addendum 2026-10-19: switching to the next Qwen model when one is spent or closed to the key

**What was wrong.** The model-by-model switch existed only in the blocking path (`generateDetailed`) and only recognised the wording "free tier exhausted" (`AllocationQuota.FreeTierOnly`). Two gaps: (1) DashScope also answers a model the key may not call, including a free allowance that has run out for the account, with `403 Access to model denied. Please make sure you are eligible for using the model.`; the blocking path read any 403 as "the key is bad" and gave up the whole lane instead of trying the next model. (2) The native tool-calling path (`generateWithTools`: Anker AI, Telegram, agents) took one Qwen model, never remembered a dead one, and on any failure went straight to the next provider, so every request paid for a refusal first.

**Now, in all three paths** (blocking, tool calling, streaming's fallback): one classifier, `classifyQwenFault` in `lib/ai/qwen-lanes.ts`, reads a failed call as *allowance* (this model's free allowance is spent), *model_denied* (this key may not call this model), *lane* (the whole key: a 401, a bad key, arrears, a 403 that names no model), or *transient* (rate limit, outage, timeout). Allowance and model_denied remember the model and move to the next Qwen model; lane gives up that lane; transient moves on for this request only without closing anything. A spent allowance is remembered for 30 minutes (`QWEN_EXHAUSTED_TTL_MS`). A refusal is held for a minute until another model in the same request answers, and then for two hours (`QWEN_DENIED_TTL_MS`): if every model is refused it is the key or the endpoint that is wrong, and fixing that must not wait hours. A 404 closes a model only when its message names the model, so a wrong endpoint does not close them all.

**Order of models.** The task's own tier chain, then the neighbouring tiers (`TIER_SPILL`: fast to balanced to deep, balanced to deep to fast, deep to balanced to fast, reason to deep to balanced), in the free lane and in the plan lane, then the other providers as before. A cheap task can therefore cost more than usual when its own models are closed; each call is still recorded and priced, and the run ceiling and the workspace allowance apply. `QWEN_TIER_SPILL=off` restores the old chains. `qwenLaneStatus` shows what is being skipped and why. `classifyFailure` now calls the same refusal a model problem, not a bad credential.

**Verified.** Unit tests for the classifier and the holds; the blocking path (a refused model is skipped, the next answers, the dead one is not asked again; a whole tier closed falls to the next tier); the tool-calling path (the same, and a rate limit does not close a model, a bad key stops at once); the full suite. Against the real DashScope with this machine's key every model of the Qwen chains answered "denied" or "Model not exist" (the key stored in the database cannot be decrypted here, so the environment key was used), so the walk through all twelve models, the spill and the short hold were exercised for real, but a successful switch to a working model was not seen live: that needs the production key.
