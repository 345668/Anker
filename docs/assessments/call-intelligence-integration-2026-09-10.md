# Call Intelligence — implementation and rollout

## Decision

Use a desktop capture companion plus Anker's hosted review workflow. Call-Intelligence is an Electron application, with separate microphone/system-audio capture, local Whisper and BYO cloud providers. It cannot simply run inside a server-rendered website. The desktop implementation remains in its own GPL-3.0-or-later repository; Anker communicates through an upload API. No desktop source was copied into Anker.

Source: https://github.com/345668/Call-Intelligence (branch `feat/anker-private-sync`). Platform: `feat/anker-editorial-website`.

## Persona and ownership contract

| Persona | Entry | Review emphasis | Permitted follow-through |
| --- | --- | --- | --- |
| Founder | Relationships → Call Intelligence | Fundraising, customers, board discussions; evidence versus expressed interest | Link personal CRM contact; save reviewed notes; create an approval-gated outbox draft |
| Fund manager | Deals → Call Intelligence | Founder diligence, portfolio, LP discussions; open evidence and decisions | Same personal CRM/draft flow; no automatic IC, deal or commitment changes |
| LP | Investor portal → Call notes | Private manager discussions and reporting questions | Save reviewed notes and copy follow-up text; no GP CRM/outbox or payment actions |
| Viewer | Role's existing entry | Read own scoped records | No uploads, analysis, linking, drafts or device creation |

Every call belongs to one user AND one organization. Membership is required; organization membership does not share another user's calls. Desktop credentials are fixed to the issuing user and organization, expire after 90 days, and are checked against current membership/role on every request. Browser mutations additionally validate the workspace shown on screen. LP portal access still requires its existing email-to-fund entitlement; an LP must also have a configured organizational workspace for call notes. Missing setup displays a recovery path rather than guessing ownership.

## Completed behavior

1. Paste a transcript or preview/queue one in the desktop app. Acknowledge upload permission. Audio, screenshots and provider credentials are not part of sync.
2. Save the transcript before analysis. A stable client ID and normalized payload hash make retries idempotent; changed content with the same ID returns 409 rather than replacing data.
3. Review original text in Anker. Explicitly opt into platform analysis with Anker's configured provider. The desktop's local-provider choice does not select Anker's provider. Cloud failover is disabled for this analysis call.
4. Analysis returns validated structured output, provenance, uncertainty and proposed actions. Missing provider/malformed output records an analysis failure and retains the transcript. There is no heuristic success impersonating AI analysis.
5. A three-minute analysis lease prevents concurrent runs; run IDs prevent stale completions from replacing newer results. Interrupted serverless jobs are retried explicitly, not advertised as a background worker.
6. Review/save notes, link a personal CRM contact if appropriate, and create a draft. The original auto-stage update is removed. Draft creation never overwrites another draft or changes a sent message back to draft. Repeated creation for the same call returns its existing message ID. Existing per-contact follow-up uniqueness can block a new call's draft; the UI directs the user to the outbox.
7. Existing calls with no organization remain in an “Earlier personal calls” section until their owner explicitly assigns them. No bulk inferred backfill occurs.

## Desktop contract

The Anker settings tab provides pairing, connection identity, transcript preview, explicit queue/upload, error/retry status, removal of a queued copy and disconnect. The queue and sync key are encrypted with Electron safeStorage; missing secure storage or Linux `basic_text` disables sync. Atomic writes preserve queued records across restart. Account/workspace switches are refused while differently owned records remain queued. Retries use the original import ID. 400/409/413 imports are blocked for review; other errors retain the queue and apply capped backoff. Upload is manual, never a live background stream.

The upload snapshot has a 60,000-character limit independent from the copilot's 200-turn context window. Overflow is reported and partial sync is blocked. Stop capture and wait for transcription to drain before queueing. Clear transcript before the next conversation. Queuing persists transcript text locally; live unsaved capture remains in memory and can be lost on crash. Existing desktop provider-key/profile storage is unchanged and remains in its original local settings file.

The inherited Windows executable masquerading script was removed from installation. The application/process and packaged product now identify as Anker Call Intelligence. Existing upstream capture/content-protection behavior is otherwise retained; native permissions and screen-share exclusion require separate OS validation.

## Required database rollout

Apply this after the existing investor-calls and organizations/memberships schema:

```sh
node scripts/oneshot/run-migration.mjs scripts/migrations/2026-09-10-call-intelligence-sync.sql
```

This change adds call scope, import identity, analysis leases, review time, draft linkage and revocable devices. It does not assign or delete existing records. Production migration was not run in this session. The prior fundraising change also requires `2026-09-09-fundraising-rounds.sql` if still pending.

## Private installer delivery

The authenticated `/api/calls/releases` endpoint lists approved release metadata. `/api/calls/download?platform=…` streams the selected installer from a **private Vercel Blob store**, after browser-session/membership validation. It does not redirect to a permanent asset URL. Bearer sync credentials cannot download binaries or read call history.

Set server-only `ANKER_CALL_BLOB_TOKEN` for a dedicated private store and `ANKER_CALL_RELEASES` to a JSON array after uploading/reviewing native builds. Each item requires `platform`, `version`, `pathname` under `call-intelligence/`, a safe `filename`, byte `size`, lowercase SHA-256 and `approved: true`. Accepted platforms: windows-x64, mac-arm64, mac-x64, linux-x64, linux-arm64. Use immutable, versioned blob paths; do not overwrite approved objects. Verify full SHA-256 and native signatures at publication. The delivery endpoint validates authorization and size and exposes the pinned checksum for user verification; it does not buffer and rehash installers during download.

Until the private store and approved manifest are configured, the UI explicitly offers source setup and says signed installers are not published. No certificates, installer builds, private blob objects or public release tags were created in this session. Keep the GPL license and corresponding source with distributed desktop builds; the current source repository is public even if installer access is restricted.

## Validation and remaining release gates

- PGlite integration exercises real SQL, migrations twice, two users/two workspaces, foreign CRM IDs, concurrent retries, expired/revoked/demoted devices, lease recovery and preservation of sent messages.
- Interaction tests cover failed-save retention, stable retry ID, workspace headers, LP action differences, consent, deletion confirmation and unavailable versus empty state.
- Download tests exercise authentication, invalid/missing configuration and private streaming without exposed storage credentials.
- Desktop tests cover encrypted persistence/restart, response loss, account switching, consent, revocation, conflicts, concurrency and filesystem write failure.
- Native end-to-end audio capture, OS credential-store behavior, code signing/notarization and installer download at realistic sizes remain release gates on Windows/macOS/Linux. The cloud browser cannot reach the local preview in this environment, so rendered browser/zoom/mobile QA is not claimed.
- Existing local AppLink socket test is blocked by this runtime's Unix-socket permission; it is unrelated to Anker sync. Do not remove that test or mark the native suite fully passed without running it on a supported machine.
- Before enabling for pilot users: apply migration; deploy Anker branch; build companion branch; connect a test user; capture a consented test call; verify reconnect/revoke/offline recovery, all personas and light/dark layouts; publish only approved native installers.

## Subsequent enhancements

Meeting-specific fund/deal/round links, reviewed task creation, durable queued AI workers, speaker attribution beyond “You/Other participant”, transcript segmentation, retention policies and multi-device bidirectional editing remain separate increments. This implementation deliberately makes transcript upload one-way; web deletions do not delete local copies and local queued-copy removal does not delete an already uploaded call.
