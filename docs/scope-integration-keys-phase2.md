# Scope — DB-editable integration keys, Phase 2

Follow-on to Phase 1 (PR #24: `lib/config/crypto.ts` + `integration-keys.ts` resolver +
`/api/admin/integration-keys`, with OpenSanctions + Companies House already converted).
Phase 2 converts the remaining integrations and adds the editable UI.

Status: **queued** — no code yet.

---

## Prerequisites (must be on `main` first)

1. **#24** — the resolver + encrypted store + admin API (Phase 1). Everything below imports it.
2. **#22** — the read-only integrations panel + `lib/config/integrations.ts` (edited in §3–4).
   *(Already merged to `main`.)*
3. **#19** — `lib/compensation/benchmark.ts` (the comp-benchmark consumer converted in §2).

If #24/#19 aren't merged when this starts, do the parts that are unblocked and leave the
rest as a marked TODO — same pattern used through this whole effort.

---

## 1. What Phase 2 delivers

- The remaining four integrations read keys through the resolver (DB-first, env-fallback).
- `integrationStatuses()` reflects **DB or env** (not just env), with a per-integration source.
- The #22 panel's editable-subset rows become **editable** (password input + Save/Clear),
  wired to `/api/admin/integration-keys`. Core secrets stay read-only status.

---

## 2. Remaining consumer conversions

Same mechanical change as Phase 1: `isXConfigured()` and every `process.env.<KEY>` read →
`await getIntegrationKey("<KEY>")`; `isXConfigured` becomes `async`, callers get `await`.

| Module | Env vars | `process.env` reads | `isXConfigured` callers to await |
|---|---|---|---|
| `lib/email/resend.ts` | `RESEND_API_KEY` | 3 (L179 `sendEmail`, L255 `isResendConfigured`, L273 `getResendEmail`) | **16** ← the big ripple |
| `lib/contracts/docusign.ts` | `DOCUSIGN_BASE_URI` · `_ACCOUNT_ID` · `_ACCESS_TOKEN` | 3 (in `sendForSignature`) + the `isDocuSignConfigured` triple-check | 3 |
| `lib/docworker/client.ts` | `DOC_WORKER_URL` · `DOC_WORKER_TOKEN` | `isDocWorkerConfigured` (URL) + `renderViaDocWorker` (URL, TOKEN) | 2 |
| `lib/compensation/benchmark.ts` | `COMP_BENCHMARK_API_URL` · `_API_KEY` | `isBenchmarkConfigured` (URL) + `fetchBenchmark` (URL, KEY) | 0 (self + page) — **needs #19** |

**Notes**
- **Resend is the bulk of the work** — 16 call sites (send routes, LP notices, campaign
  jobs). All are in `async` handlers, so the change is `if (isResendConfigured())` →
  `if (await isResendConfigured())`. Grep: `grep -rl isResendConfigured app lib`.
- Multi-var integrations (DocuSign, doc-worker, comp benchmark) call `getIntegrationKey`
  once per var and keep their existing "all present?" logic.
- Leave the leftover `process.env.*_TIMEOUT_MS` reads as-is — those are tuning knobs, not
  secrets, and stay env-only.

---

## 3. `lib/config/integrations.ts` — reflect DB **or** env

`integrationStatuses()` currently checks `process.env` only, so a DB-saved key would still
read "not set". Make it **async** and resolve through the store:

```ts
export async function integrationStatuses(): Promise<IntegrationStatus[]> { … }
// per row: configured = !!(await getIntegrationKey(name)) || <core-secret env check>
//          source     = await keySource(name)   // "db" | "env" | null (editable rows only)
```
Core-secret rows (service role, cron, blob) keep the direct `process.env` check — they're
not in the resolver. The page (`app/dashboard/settings/api-keys/page.tsx`) changes
`integrationStatuses()` → `await integrationStatuses()`.

---

## 4. Editable UI on the #22 panel

In `components/tesseract/api-keys-content.tsx`, the ✅ editable integrations (see the Phase 1
scope §2 allowlist) get an input + Save/Clear, wired to the Phase 1 API:

- On mount, `GET /api/admin/integration-keys` → per-key `{ set, source, hint }`.
- Password input per editable key; **Save** → `PATCH { NAME: value }`; **Clear** → `PATCH { NAME: "" }`.
- Show a chip: **"saved"** (DB) vs **"env"** (from deployment) via `source`, so an operator
  sees where the live value comes from and that a saved value shadows env.
- If `encryptionConfigured` is false (`CONFIG_ENC_KEY` unset), disable the inputs with a
  hint ("set CONFIG_ENC_KEY to edit keys here") — reads still work from env.
- Core secrets (service role, cron, blob) remain **read-only status rows** (no input).

Mirror the existing AI-keys input/Clear pattern already in this component.

---

## 5. Testing

- `tsc` clean after each conversion (watch the Resend caller ripple).
- Per integration: route/page compiles (307 / 401 / 403), `isXConfigured` still returns the
  right boolean from env when no DB value.
- Round-trip through the API: `PATCH` a test key → `GET` shows `set:true, source:"db"` →
  the consumer's `isXConfigured` returns true → `PATCH ""` → falls back to env/unset.
- UI harness (as in Phase 1) for the editable rows.

---

## 6. Effort & sequencing

| Chunk | Est. |
|---|---|
| Resend (16 callers) | ~0.5 day |
| DocuSign + doc-worker + comp benchmark | ~0.25 day |
| `integrations.ts` async + editable UI | ~0.25–0.5 day |

**~1 day total.** No new tables, no migration (reuses `system_settings` + the Phase 1 store).
Best done as **one PR after #24 (+ #19) land on `main`**, so all consumers and the resolver
are in the same tree.
