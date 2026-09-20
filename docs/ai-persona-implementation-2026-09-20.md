# AI persona implementation — 20 September 2026

Branch: `feat/anker-editorial-website`. Base: `2a365b2`.

This implements the security and persona foundation from the AI audit. It is not a claim that all audit findings or the full agent roadmap are complete. The recovered branch's Halyard/Call Intelligence work is preserved.

## Implemented

- Shared server-resolved AI principal: authenticated user, active membership, persona, explicit workspace scope, verified personal LP entitlements, write permission and optional token restrictions. Missing persona fails closed; staff/owner status never creates tenant authority.
- One tool registry, permission filter and bounded schema validator shared by browser agent and MCP. Tool descriptions are no longer treated as input validation. Administrative directory mutations and CRM mutations are withheld until a separate approval workflow exists.
- MCP tokens require an explicit workspace and current membership. Cookie context cannot redirect token execution into another workspace. Empty token allowlists remain empty. Readonly tokens cannot create artifacts, mutate records or prepare sending actions.
- LP-only accounts can use both AI pages without a founder or GP membership. LP capital-account SQL is restricted to their entitled `fund_lps` IDs; managers can read only the active fund. Amounts use the recorded currency; missing values and zero-denominator DPI remain unknown.
- LP artifact generation no longer requires workspace write permission. Bytes remain durable in PostgreSQL with user and scope ownership, expiry and legacy ownership compatibility. Deck generation returns both PPTX and PDF artifacts.
- `send_outreach` is draft-only, even for `confirm:true`. Nothing is sent or queued by that tool. Existing Outreach remains the human-controlled sending surface. Real action proposals, approvals and delivery receipts are still a separate follow-up.
- Founder tools read saved runway/cap-table scenarios through the existing deterministic engines. Founder and VC tools read their own workspace's analyzed calls. LP tools read personal capital notices and document metadata through existing entitlement helpers.
- Portfolio exports label missing data and snapshot periods. Removed mixed-currency monetary totals and the misleading cross-company cash/burn runway calculation. Currency and period normalization is needed before restoring meaningful aggregate financial totals.
- Both AI entry points use the same existing assistant component, persona copy and allowed-tool list. Added LP navigation, a non-admin status endpoint, keyboard-native conversation selection, reduced-motion scrolling, request cancellation and prevention of thread switching while a request is active.
- Saved conversations are scoped by user/workspace and guarded by revision on updates. No automatic deletion after ten chats. Unscoped legacy rows are retained but hidden; they are not guessed into a workspace. History persists from the client after a successful response; fully server-owned conversation execution remains pending.
- Actual request bytes and upload sizes are bounded. Image/XLSX references resolve before execution. Unsupported Word/audio uploads and unreadable PDFs produce explicit errors. Follow-up turns need re-uploaded binary attachments; durable attachment references are not yet implemented.
- Chat uses the configured provider router and task policy. Final synthesis retains explicitly selected internal provider settings; disabled tasks are not bypassed by a fallback task. Nested router calls share a 16-call execution budget, and supported provider fetches receive cancellation signals.
- Web crawling checks public IPs on every redirect, pins DNS resolution to the validated address, caps response bytes and time, and marks retrieved text as untrusted data.
- Media task polling requires a recorded user/workspace ownership receipt. Legacy provider task IDs without ownership receipts are rejected.
- Live-call Observe execution now binds the authenticated device workspace to the same principal and intersects its existing Observe allowlist. It remains read-only.

## Deploy before use

Apply the new migration against the intended database before releasing this branch:

```bash
node scripts/oneshot/run-migration.mjs scripts/migrations/2026-09-20-ai-persona-access.sql
```

The normal migration runner reads `DATABASE_URL` or `NEON_DATABASE_URL`. Existing base migrations must already be applied. The new migration is idempotent; integration tests apply it twice. It adds artifact scope, nullable organization ownership for personal LP exports, media ownership receipts and conversation scope/revision. It does not delete existing artifacts or chats.

For legacy MCP environment tokens, configure `ANKER_MCP_WORKSPACE_ID` alongside the existing user/token settings. DB-backed tokens must have `workspace_id`. Tokens with no workspace now fail closed. LP portal-only access currently uses a verified session email; personal LP access via MCP still needs a dedicated identity mapping.

## Validation

- Full existing suite plus initial regression cases: 55 test files / 356 tests passed.
- Final targeted suite after additional history, persona-spoofing and provider-policy cases: 5 files / 70 tests passed.
- TypeScript check: `pnpm typecheck`.
- PostgreSQL integration coverage includes two funds, two workspaces, founder and LP-only users; foreign capital-account requests, personal LP exports, artifact ownership/expiry, media task ownership, concurrent conversation revisions and workspace-bound token execution.
- No real email, paid AI generation or customer data was used in tests.
- Authenticated production browser journeys, production migrations and deployed-provider smoke tests have not been run in this environment.

## Remaining audit work

1. Durable agent run records, idempotency, background execution/resume, cross-instance concurrency and billing/quota reservations. Current execution is request-bound; cancellation is best-effort for legacy tools and does not undo completed work.
2. Persisted, human-approved CRM/outreach proposals with exact-payload review, permission revalidation and idempotent delivery monitoring. Do not re-enable model-controlled mutations before this exists.
3. Server-owned full conversation history and durable attachment context, including DOCX extraction and actual audio transcription. Migration/recovery UI for unscoped historical chats and pagination beyond the 100-chat list.
4. Durable image/video downloads, media retries and paid-generation budgets. Ownership polling is fixed; temporary provider media URLs are not yet copied into private durable storage. Media and arbitrary-model pickers are not exposed in the unified assistant UI until their lifecycle is consistent.
5. Provider policy parity for direct vision/media helpers, precise token/cost accounting, configured capability availability, per-workspace provider settings and more complete cancellation propagation.
6. End-to-end browser verification for founder-only, GP-only, LP-only, view-only and revoked-membership journeys, including mobile and provider failures. Capability expansion should build on the shared principal/registry rather than add another tool dispatcher.
