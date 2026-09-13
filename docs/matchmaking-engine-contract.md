# Matchmaking engine contract

This contract applies to both platform matchmaking flows:

- Founder → investor: `/dashboard/find-investors`
- VC/GP → LP: `/dashboard/matchmaking`

## Input readiness

The client shows a blocking readiness panel and the API repeats the validation
before any scoring work starts.

| Flow | Required inputs |
| --- | --- |
| Founder | Startup name, funding stage, company location, at least one sector, and a positive round size |
| VC/GP | Fund name, positive target raise, headquarters, at least one fund sector, and at least one investment geography |

Optional economics are validated when present (for example, maximum check ≥
minimum check and hard cap ≥ target raise). Draft fund profiles may be saved,
but an incomplete draft cannot start a run.

## Deck extraction

Deck extraction is additive: values already entered by a person are retained;
only empty fields are filled. A zero is treated as a real value. Uploads are
limited to five files and 4 MB combined. The primary deck must be a real PDF;
supporting files may be PDF, TXT, Markdown, CSV, or JSON. AI/provider failure
falls back to deterministic text extraction and leaves a low confidence note
for review.

## Isolation and retention

All profile, run, export, pipeline, and founder-session reads are scoped to the
authenticated user and active workspace. Partial LP runs are marked `running`
or `failed` and are not exposed as completed results. Founder results are
stored in `founder_match_sessions` for 24 hours and expire automatically.

## Migration

Apply `scripts/migrations/2026-09-11-matching-profile-contract.sql` after the
workspace/persona and matching-v2 migrations. It is additive and repeatable;
it reconciles legacy fund-profile columns, adds workspace ownership, creates
durable founder sessions, and adds LP run status tracking.

## Verification

The contract is covered by the matching integration and form tests. Run:

```sh
pnpm typecheck
pnpm test
```

Authenticated browser verification should still be run against the deployed
environment after the migration is applied.
