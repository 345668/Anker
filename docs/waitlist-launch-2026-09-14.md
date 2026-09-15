# Anker waitlist launch

Public route: `/waitlist`. The homepage, navigation and footer link to it. Existing `/early-access` links redirect while preserving bounded campaign parameters. Admin review: `/dashboard/admin/waitlist`, protected by the existing server-side admin guard.

## Database rollout

Run from the repository root with the production connection in `DATABASE_URL` and a trusted database owner role. Apply before deploying the new application version:

```sh
psql "$DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 \
  --file scripts/migrations/2026-08-31-early-access-requests.sql \
  --file scripts/migrations/2026-09-14-waitlist-signups.sql
```

Both files are repeatable. This explicit transaction is intentional: the generic migration runner currently executes statements separately. Existing duplicate records remain intact; the canonical row receives a unique normalized email key, prioritizing invited records. The migration does not infer consent for historical records. RLS blocks unprivileged direct table access; the application must connect with its trusted backend role.

Verify `/waitlist` returns 200 after deployment. Submit one controlled access request, check it appears in the admin list, and repeat with the same email to confirm no extra row. A database failure must display an error rather than success. No database credentials or production deployment access were available during implementation; this rollout has not been performed here.

## Behavior and limits

- Required name, email, persona and access-email consent; optional organization.
- Stores consent timestamp/version and campaign source. No account, team membership or outbound email is created automatically.
- Duplicate submissions return the same public confirmation without overwriting the existing request or status.
- A honeypot and the existing per-instance rate limiter reduce automated submissions. The limiter is not a distributed quota or full bot defense.
- The private list is read-only, paginated and excludes retained legacy duplicate rows without canonical email keys.
- Access-email consent is not newsletter consent. Invitations remain a separate, deliberate workflow.

## Ad alignment

Vertical 720×1280, 24 fps, 14 seconds, using the approved Wild Ride footage and supplied silver Anker logo.

| Time | Copy / action |
| --- | --- |
| 0.5–3.2 s | “Venture moves fast.” Word entrance, then clean exit. |
| 5.75–9.15 s | “Stay anchored.” Short slide and settle timed to the camera orbit. |
| 10–14 s | Logo reveal, “Join the waitlist”, `an-ker.de/waitlist`. |

Retain source action audio, fade it out before the end scene; no added voiceover. Publish the ad only after the production waitlist route and signup persistence are verified.

## Verification

282 tests pass across 49 suites, including concurrent normalized-email submissions, migration repeatability with legacy duplicates, consent/role/honeypot validation, database failure handling, admin denial before querying, duplicate click prevention, retained fields after failure and focus on success. TypeScript check passes.

Local HTTP verification: `/waitlist` returns 200 with the expected form; `/early-access?source=ad` redirects to `/waitlist?source=ad`. Browser screenshot verification was blocked by browser installation certificate/download errors.

The native Higgsedit composition is in `scripts/media/anker-waitlist-ad.jsx`. It expects the approved clip and silver logo at the paths in the script; run with the installed Higgsedit runtime. Its render is silent; the delivery export remuxes the source audio with a fade from 9.1 to 10 seconds and pads silence through 14 seconds.
