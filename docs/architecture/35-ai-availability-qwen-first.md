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
