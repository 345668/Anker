# Early-access invitations — configuration and operation

Applies to `early_access_requests`, migration `scripts/migrations/2026-09-18-waitlist-invitations.sql`
(applied to Neon on 2026-09-18).

## What an invitation is

A random 24-byte token. Only its SHA-256 hash is stored (`invite_token_hash`); the raw
value exists in the sending process and in the applicant's email, nowhere else — the same
shape as `mcp_tokens` and `extension_tokens`.

Each token is **single-use** and **email-bound**: redeeming it requires the signup address
to equal the invited address, and sets `accepted_at`. That is what makes `accepted` an
observed fact rather than an assertion, and it means a forwarded link is useless to whoever
receives it.

## Environment

| Variable | Where | Default | Effect |
| --- | --- | --- | --- |
| `WAITLIST_INVITE_TTL_DAYS` | Anker | `14` | How long a new invitation link stays valid. Accepts 1–90; anything else (unset, `0`, `9999`, a typo) falls back to 14. |
| `SIGNUP_INVITE_CODE` | Anker | — | The legacy shared code. Still accepted at sign-up, indefinitely. |
| `SIGNUP_REQUIRES_INVITE` | Anker | — | The gate itself. With it on and neither credential present, sign-up is refused. |
| `ANKER_BASE_URL` / `TENANT_APP_URL` | SAIL | — | Which Anker deployment the portal drives. |
| `PORTAL_SERVICE_TOKEN` | both | — | Shared bearer, ≥32 chars, identical in both projects. |

Set the TTL on Vercel and redeploy:

```bash
vercel env add WAITLIST_INVITE_TTL_DAYS production
```

The bound is deliberate. An unbounded lifetime turns a one-off credential into a permanent
one, so an env typo cannot mint a token that never expires — it silently reverts to 14 days.

## Per-send override

Both consoles expose a "link expires in N days" field next to the send buttons, defaulting
to whatever `WAITLIST_INVITE_TTL_DAYS` is set to. It applies to that send only and does not
change the default. Out-of-range values fall back to the default rather than failing the
send.

## Resend is not configurable, on purpose

Resending mints a new token and clears the old hash, so the previously emailed link stops
working. There is no option to keep both alive: two live tokens for one applicant is no
longer single-use, and `accepted_at` would stop identifying which link was used. If someone
mistyped their address, resend — that is the intended repair.

## Where it runs

- **Anker owner console** — `/dashboard/admin/waitlist`, owner-gated.
- **SAIL staff portal** — `/waitlist`, staff-session-gated, forwarding through
  `/api/anker/admin/waitlist` to Anker's `/api/admin/waitlist`.

Both call `lib/marketing/waitlist-admin.ts`. Neither holds its own copy of the rules: the
token has to be minted by the app that will later redeem it, and a second implementation
would be a second way to grant access to the tenant.

`admin/waitlist` is on SAIL's `PROXY_ALLOWLIST` and is **admin-scoped, not user-scoped** —
it needs no `x-portal-act-as-user`. The invitation email is sent by Anker as the platform,
not on behalf of a tenant user.

## Lifecycle

```
pending ──approve──▶ approved ──invite──▶ invited ──(signup)──▶ accepted
   │                    ▲                    │
 decline              reopen              revoke
   ▼                    │                    ▼
declined ───────────────┘                 revoked ──invite──▶ invited
```

`accepted` is terminal here. Revoking a link cannot take back an account that already
exists — that is an action on the account, not on the waitlist.

If the invitation email fails to send, the token is cleared and the row returns to
`approved` with `invite_error` set. No access is granted by a failed send, and the console
shows it.

## Operational notes

- `invite_resend_id` holds Resend's id, so delivery reconciles through the existing
  `lib/email/resend-sync.ts` path rather than a second mechanism.
- Sign-up accepts a per-applicant token **or** `SIGNUP_INVITE_CODE`. The shared code has no
  removal date; drop it only when no outstanding link depends on it.
- The token is verified before the account is created and spent only after. A rejected
  password or an already-registered address therefore leaves the applicant's link usable.
- Every rejection at redemption returns one message. Distinguishing "unknown token" from
  "wrong email" would make the endpoint an oracle for probing which addresses were invited.
