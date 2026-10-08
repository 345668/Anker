# Anker AI Image & Video Studio

Based on Anker main `741f837c852a0137603f951df017c1fd41c449bd` and the protocol/settings inspected in `345668/open-higgsfield` at `b16a0ef`.

## Delivered

The new Image & Video mode at `/dashboard/anker-ai/studio` keeps conversation and tool-running assistants intact. It supports Soul 2, Soul Cinema, Flux 2, Kling 3.0 Turbo and Seedance 2.0 Fast; text-to-image, text-to-video, image-to-video, supported resolution/aspect/duration/audio controls, start-frame uploads, private history, favorites, reuse, previews and downloads. One output per request. Model mappings follow the supplied repository, but paid live generation requires deployment credentials and an account that enables these models.

Founders, VC funds and LPs use server-resolved personas. Jobs/assets require both the current user and scope. LP media is personal and does not grant access to modify fund records. Viewer/readonly tokens cannot create media. Creation enforces existing workspace AI entitlements. Returned history contains no provider credentials or private storage paths.

## Activation

1. Apply the additive SQL migration using the existing server DB owner role:

   `node scripts/oneshot/run-migration.mjs scripts/migrations/2026-10-07b-ai-media-studio.sql`

   Tables enable RLS without browser policies. The server DB role must own these objects or have the appropriate server-only privileges; do not grant direct browser access.

2. Set server environment variables:

   - `HF_API_BASE_URL`: the HTTPS generation API base used with your OpenHiggsfield platform account. Do not use the studio frontend URL or invent an endpoint.
   - `HF_API_KEY`: platform credentials as `id:secret`; never a NEXT_PUBLIC variable.
   - `MEDIA_BLOB_READ_WRITE_TOKEN`: token for a dedicated **private** Vercel Blob store. A public store is unsuitable.
   - `NEXT_PUBLIC_APP_URL`: public HTTPS Anker origin, used for short-lived start-frame links.
   - `CRON_SECRET`: existing cron secret.

3. Deploy with the existing Vercel cron configuration. `/api/cron/ai-media` runs every minute. On another host, schedule an authenticated GET to that path. A protected preview deployment must permit the provider to read the capability URL; production is preferable for live verification.
4. Verify one image and one short video using a test workspace, then a start-frame upload and download. Provider credits/capabilities must be checked against the live account; no paid calls were made during implementation.

## Reliability and limits

SQL row locking serializes reservations. Reusing a request key returns the original job; changing the body with the same key returns 409. Three active jobs and twenty submissions per user/scope daily, thirty per workspace daily, including failures. These request limits bound use but are **not dollar budgets**. Media prices are not inferred or added as fictitious zero-cost `ai_calls`; reconcile real charges with the provider. Existing AI spend limits are checked before submission.

A timeout, interrupted submission or ambiguous 5xx produces `uncertain`, never an automatic paid retry. Support must reconcile that job against provider records. Polling/saving is leased across browser and cron workers. Output saving can resume after a crash; completion is only reported after private storage and ownership metadata persist. Two-hour deadline, 64 MB output limit, PNG/JPEG/WebP/MP4 signature validation, bounded HTTPS fetching with the existing SSRF guard. The existing safe-fetch DNS-rebinding limitation remains.

Start-frame uploads are limited to 3 MB. Sources are shared with the provider through random, hashed, single-asset capabilities that expire within two hours. Upload allowance is a best-effort daily check plus the existing instance rate limiter; paid generation quotas are database-serialized. Never log capability query strings at the edge.

No provider cancel endpoint was verified, so the UI does not claim to cancel a running job. Closing the page only stops browser polling. The server still saves results. Storage failures retry without generating again. The current catalog intentionally excludes the upstream's unimplemented edit/extend/motion-control models and batch workflows.

History is paged, 30 at a time; filters/favorites apply to loaded history. No automatic media deletion or retention policy is introduced. Uploaded assets and finished creations require operational retention management. Videos stream through the authenticated route; byte-range seeking is not yet implemented. The old DashScope endpoint remains for legacy integrations; its models are no longer selectable from the conversation composer.

## Verification

Run `pnpm exec vitest run lib/ai/studio` and `pnpm typecheck`.
The integration suite uses actual PostgreSQL semantics through PGlite, with provider/storage boundaries mocked. It covers reservations, scope/user isolation, role and entitlement checks, concurrency, quotas, ambiguous responses, source ownership and expiry, persistence recovery, image/video output handling, and HTTP input validation. Live external-provider/Blob billing and production deployment are separate acceptance checks.

### Completed checks — 2026-10-07

- 33 tests passed across the provider and PGlite integration suites.
- Full repository TypeScript check passed.
- Browser checks passed with mocked API responses: desktop rendering, preview dialog focus containment/Escape/focus return, saved-image start frame, model-specific video/audio payload, 390 px mobile layout without horizontal overflow, dark theme and reduced-motion preference, and disabled generation when setup is incomplete. No browser page errors were observed.
- Production credentials, live paid generation, private Blob transfers and production migration were not exercised. Those are the activation checks above.

The temporary preview route used for browser verification is excluded from this change.
