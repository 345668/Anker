# Scope — DB-editable integration keys

**Goal:** let staff set / rotate a *safe subset* of integration keys from the Owner Console
(no redeploy), exactly like the AI-provider keys and news-provider keys already work.
Everything else stays env-only.

Status: **scoping only** — no code yet. This plan reuses an existing, proven pattern.

---

## 1. The pattern already exists — reuse it

Two subsystems already resolve keys **DB-first, env-fallback**, admin-managed from a page,
persisted in a single `system_settings` JSONB row, cached ~5 s:

- **AI provider keys** — `lib/ai/runtime-config.ts` (`system_settings` key `ai_router_v1`),
  edited on `/dashboard/settings/api-keys`. Resolution: `cfg?.anthropicApiKey || process.env.ANTHROPIC_API_KEY`.
- **News provider keys** — `lib/news/runtime-keys.ts` (`system_settings` key `news_providers_v1`),
  edited on `/dashboard/admin/newsroom/api-keys`. Key names are **verbatim env-var names** so
  DB and env stay greppable/auditable.

**`lib/news/runtime-keys.ts` is the template** — copy its shape for integrations.

---

## 2. Which keys — and which stay env-only

| Env var | DB-editable? | Why |
|---|---|---|
| `RESEND_API_KEY` | ✅ yes | Integration key; rotating it shouldn't need a redeploy. |
| `OPENSANCTIONS_API_KEY` | ✅ yes | Integration key. |
| `COMPANIES_HOUSE_API_KEY` | ✅ yes | Integration key. |
| `COMP_BENCHMARK_API_URL` + `COMP_BENCHMARK_API_KEY` | ✅ yes | Integration endpoint + key. |
| `DOCUSIGN_BASE_URI` + `DOCUSIGN_ACCOUNT_ID` + `DOCUSIGN_ACCESS_TOKEN` | ✅ yes | Integration creds (the access token rotates often — good UI win). |
| `DOC_WORKER_URL` + `DOC_WORKER_TOKEN` | ✅ yes | Integration endpoint + token. |
| `SUPABASE_SERVICE_ROLE_KEY` | ⛔ **never** | Bypasses all row-level security; a settings API that can read/write it is a catastrophic leak vector. Env-only. |
| `CRON_SECRET` | ⛔ **never** | Request-auth secret; reading it from the DB at auth time is a bootstrapping + threat-surface problem. Env-only. |
| `BLOB_READ_WRITE_TOKEN` | ⛔ recommend env-only | Storage credential wired into the platform; low rotation need, keep with core secrets. |
| `DATABASE_URL` / Supabase URL / anon key | ⛔ never | Bootstrap — the DB can't store the key needed to reach the DB. |

The **read-only status panel already shipped (#22)** keeps showing *all* of these; only the
✅ rows gain edit inputs.

---

## 3. Design

### 3a. Resolver — `lib/config/integration-keys.ts` (new)
Mirror `readNewsKeys()`:
```ts
export const INTEGRATION_KEY_NAMES = [
  "RESEND_API_KEY", "OPENSANCTIONS_API_KEY", "COMPANIES_HOUSE_API_KEY",
  "COMP_BENCHMARK_API_URL", "COMP_BENCHMARK_API_KEY",
  "DOCUSIGN_BASE_URI", "DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_ACCESS_TOKEN",
  "DOC_WORKER_URL", "DOC_WORKER_TOKEN",
] as const
export async function readIntegrationKeys(): Promise<Partial<Record<Name,string>>>  // system_settings key 'integration_keys_v1', 5s cache
export async function getIntegrationKey(name): Promise<string | null>               // DB value ?? process.env[name] ?? null
export function invalidateIntegrationKeys(): void
```
Verbatim env-var names (DB == env), same 5 s in-process cache + `invalidate()` after save.

### 3b. Consumers — swap `process.env.X` → `await getIntegrationKey("X")`
Each integration's `isXConfigured()` and key read moves to the resolver. **These become
`async`**, which is the main ripple (see §4). Files:

| Module | Functions to convert |
|---|---|
| `lib/email/resend.ts` | `isResendConfigured`, key read in `sendEmail`, `getResendEmail` |
| `lib/modules/opensanctions.ts` | `isOpenSanctionsConfigured`, `screenViaOpenSanctions` |
| `lib/contracts/docusign.ts` | `isDocuSignConfigured`, `sendForSignature` |
| `lib/compliance/companies-house.ts` | `isCompaniesHouseConfigured`, `authHeader` |
| `lib/compensation/benchmark.ts` | `isBenchmarkConfigured`, `fetchBenchmark` |
| `lib/docworker/client.ts` | `isDocWorkerConfigured`, `renderViaDocWorker` |
| `lib/config/integrations.ts` | `integrationStatuses()` → async, "configured" reflects DB **or** env |

### 3c. API — `PATCH /api/admin/integration-keys` (new, admin-gated)
- `GET` → masked status per key (`{ set, hint }`), never full values (copy the ai-config mask).
- `PATCH { RESEND_API_KEY: "…", … }` → validate the name is in `INTEGRATION_KEY_NAMES`
  (reject anything else — hard guard against writing core secrets), upsert into
  `system_settings 'integration_keys_v1'`, `invalidateIntegrationKeys()`, `logAudit(...)`.
- Empty string clears a key.

### 3d. UI — the #22 panel gains edit rows for the ✅ subset
The ✅ integrations render as password inputs + Save/Clear (like the AI keys); the ⛔ core
secrets stay read-only status. A "configured (env)" vs "configured (saved)" chip tells the
operator where the active value comes from.

---

## 4. The async ripple (main cost — measured)

`isXConfigured()` is sync today (`process.env`). A DB read is async, so callers must `await`.
Caller counts (grep):

| Helper | Files calling it |
|---|---|
| `isResendConfigured` | **16** ← the big one |
| `isOpenSanctionsConfigured` | 4 |
| `isDocuSignConfigured` | 3 |
| `isCompaniesHouseConfigured` | 3 |
| `isDocWorkerConfigured` | 2 |
| `isBenchmarkConfigured` | 0 (self + page) |

Most callers are already inside `async` route handlers, so the change is mechanical
(`if (isResendConfigured())` → `if (await isResendConfigured())`). Resend dominates the
work. **Mitigation option:** keep a synchronous `isResendConfiguredSync()` that reads only
`process.env` for the hot paths, and use the async resolver only where DB-editing matters —
but that splits the source of truth, so prefer the clean async conversion.

---

## 5. Security

- **Masked reads** — the GET only ever returns `{ set, hint }` (last-4), never the value
  (same as ai-config). Writes admin-gated + audit-logged.
- **Name allowlist** — the PATCH rejects any key not in `INTEGRATION_KEY_NAMES`, so the core
  secrets in §2 can never be written even if a client tries.
- **At rest** — `system_settings.value` is plaintext JSONB today (AI + news keys already are).
  Acceptable to match existing posture; **enhancement:** envelope-encrypt integration values
  with a master key (`CONFIG_ENC_KEY`, itself env-only) before storing. Worth doing here since
  DocuSign/Resend tokens are higher-value than the AI keys — flag as Phase 3.
- Precedence: **DB value wins over env** (so a UI rotation takes effect); document this so a
  stale DB value can't silently shadow an env change (clear the DB key to fall back to env).

---

## 6. Effort & phasing

| Phase | Scope | Est. |
|---|---|---|
| **1** | Resolver + API + UI; convert the 3 single-key, low-ripple integrations (OpenSanctions, Companies House, comp benchmark) | ~0.5 day |
| **2** | Resend (16-caller ripple) + DocuSign (3 vars) + doc-worker | ~0.5–1 day |
| **3** | Optional envelope encryption at rest (`CONFIG_ENC_KEY`) | ~0.5 day |

Total ~1–2 days. No new tables (reuse `system_settings`). No migration.

---

## 7. Risks / open questions

1. **Resend ripple (16 files)** — biggest single chunk; low risk but touches many handlers.
2. **Encrypt at rest?** — recommend yes for this set (higher-value tokens than AI keys); needs a decision on `CONFIG_ENC_KEY`.
3. **Include `BLOB_READ_WRITE_TOKEN`?** — proposed env-only; confirm.
4. **Cache staleness (5 s) + multi-instance** — each serverless instance caches independently; a save is visible platform-wide within 5 s. Matches the AI/news behaviour; acceptable.
5. **DocuSign token rotation** — the access token is short-lived; DB-editing helps, but a JWT-grant auto-refresh would be the real fix (out of scope here).

---

## 8. Recommendation

Do **Phase 1 + 2** (make all ✅ integration keys DB-editable, reusing the news-keys pattern),
and **include Phase 3 encryption** given DocuSign/Resend token sensitivity. Keep every §2 ⛔
secret env-only, enforced by the PATCH allowlist. Net: staff rotate integration keys from the
Owner Console with zero redeploy, core secrets stay locked to the deployment environment.
