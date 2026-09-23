# 13 — Email verification

**Date:** 2026-09-22 · **Status:** design, then build · **Decided by the owner:**
"add a real verification service for the emails" · **Replaces:** the
`emailVerified` regex in `founder-scoring.ts:240` and the labels built on it.

---

## 1. What "verified" has to mean

Today three things are called verified, and none of them is:

| Where | What it actually checks |
| --- | --- |
| Founder matching `emailVerified` → "Ready to Email", "With verified email", KPI "verified email", my test-deck lists | the address matches `x@y.z` |
| Campaign `verify-emails` → `email_status = 'valid'` (`lib/outreach/email-quality.ts`) | format, not a role address, not previously bounced, the domain has an MX record |

Neither confirms the **mailbox** exists. The directory holds 9,058 investor
emails; a founder sending to an address that bounces damages their own
sending domain. So:

> **Verified** means a verification provider confirmed the mailbox accepts
> mail. Nothing else is labelled verified.

## 2. Two stages

```
email ─► STAGE 1 — local (free, always on)
           syntax · role address · disposable domain · known bounce/suppression · MX (DNS)
           │  fail → invalid | risky            (final; no provider call)
           ▼
         STAGE 2 — provider (paid, on when a key is configured)
           mailbox check: valid · invalid · catch-all · unknown · spamtrap/abuse
           ▼
         email_verifications  (cache, 90 days for valid, 30 for unknown/risky)
```

**Stage 1** reuses `classifyFormat` and the MX lookup from
`lib/outreach/email-quality.ts`, adds a DNS timeout, a disposable-domain list,
and two bounce sources the platform already has: `outreach_messages.bounced_at`
and `email_suppressions`.

**Stage 2** is a provider adapter. Two are implemented, selected by
environment variable:

| Provider | Endpoint | Mapping |
| --- | --- | --- |
| **ZeroBounce** (default) | `GET https://api.zerobounce.net/v2/validate?api_key&email` | `valid` → valid; `invalid` → invalid; `catch-all` → risky/catch_all; `spamtrap`, `abuse`, `do_not_mail` → invalid (do not send); `unknown` → unknown |
| **NeverBounce** | `GET https://api.neverbounce.com/v4/single/check?key&email` | `valid` → valid; `invalid` → invalid; `disposable` → risky/disposable; `catchall` → risky/catch_all; `unknown` → unknown |

No SMTP probing from our own servers: serverless platforms block outbound
port 25, and probing from our IPs would damage the platform's sending
reputation. That is what the providers are for.

## 3. Statuses

| Status | Meaning | Shown as | Sendable |
| --- | --- | --- | --- |
| `valid` | Provider confirmed the mailbox | **Verified** | yes |
| `risky` (`catch_all`, `role`, `disposable`) | Domain accepts anything, or not a personal mailbox | **Risky** | with care |
| `unknown` | Domain receives mail (MX) but the mailbox is unconfirmed — either no provider is configured or the provider could not tell | **Unconfirmed** | yes, not "verified" |
| `invalid` (`syntax`, `no_mx`, `mailbox`, `bounced`, `suppressed`, `do_not_mail`) | Will not deliver, or must not be sent to | **Invalid** | no |
| *(no row)* | Never checked | **Not checked** | — |

## 4. Storage

```sql
CREATE TABLE email_verifications (
  email        text PRIMARY KEY,          -- lower(trim(email))
  domain       text NOT NULL,
  status       text NOT NULL CHECK (status IN ('valid','risky','unknown','invalid')),
  reason       text,                      -- sub-status: catch_all, role, no_mx, mailbox …
  provider     text NOT NULL,             -- 'local' | 'zerobounce' | 'neverbounce'
  mx_found     boolean,
  checked_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  raw          jsonb                      -- provider response minus the address
);
CREATE INDEX email_verifications_expires_idx ON email_verifications (expires_at);
```

Keyed by address, not by investor row: the same address in the directory, a
CRM entry and a campaign is verified once.

## 5. When verification runs

| Trigger | What | Budget |
| --- | --- | --- |
| **Matching run** | Stage 1 for every contact in the result (cheap, cached). Stage 2 for the **primary contacts of the top 200 firm groups** not yet cached. | counts against the daily cap |
| **Cron** `/api/cron/verify-emails` (daily) | Stage 1 for unchecked directory emails; Stage 2 for the oldest unchecked emails that appear in recent results. | `EMAIL_VERIFICATION_DAILY_LIMIT` (default 500) |
| **On demand** `POST /api/email-verification` | Up to 200 addresses — before saving to CRM or exporting. Signed-in founder or VC workspaces only. | counts against the cap |
| **Bounce feedback** | A hard bounce or complaint from sending sets `invalid/bounced` immediately. | — |

The daily cap is enforced by counting provider rows written today, so it
holds across server instances.

## 6. Configuration

The key can come from either place; the environment wins so a deployment can
pin its own.

| Source | How |
| --- | --- |
| **SAIL → AI config → Provider keys** (production) | "Email verification (ZeroBounce / NeverBounce)" with a provider choice and a **Test the key** button that checks one address through the tenant. Stored in `system_settings.ai_router_v1`, **encrypted** with `CONFIG_ENC_KEY` like every other provider key, never returned to the browser. |
| **Environment** | `EMAIL_VERIFICATION_PROVIDER` (`zerobounce` default, or `neverbounce`) and `EMAIL_VERIFICATION_API_KEY`. |

`EMAIL_VERIFICATION_DAILY_LIMIT` (default 500) caps provider checks per day
wherever the key came from.

**`CONFIG_ENC_KEY` must be set in production.** Without it SAIL refuses to
store a key rather than writing it in the clear — and the keys already in that
row are in plaintext for exactly this reason (doc 10, assistant audit §1).
Setting it and re-saving that page encrypts them in place.

With no key at all, Stage 1 still runs and every passing address is
**Unconfirmed**. Nothing is labelled Verified until a provider says so.

**Owner endpoints** (`/api/admin/email-verification`, relayed by SAIL):
`GET` reports whether a provider is configured, where the key came from,
today's budget, and how the directory's addresses stand; `POST { email }`
verifies one address so a new key can be proven.

## 7. Data protection

Stage 2 sends an investor's business email address to the provider. It sends
nothing else — no name, no firm, no user data — and only addresses from the
investor directory or a user's own CRM, never test data. Both providers offer
a data processing agreement; **the owner signs it when creating the account**.
The provider response is stored without the address echo.

## 8. What changes elsewhere

- Scoring (doc 11 §4.7): evidence quality and contact rank use the status.
- Founder lists and the product workbook: the "Email verified" column becomes
  **Email status** (Verified / Unconfirmed / Risky / Invalid / Not checked);
  "Ready to Email" contains Verified and Unconfirmed, never Invalid.
- UI: the KPI reads "Verified emails" only for `valid`; otherwise "Emails
  (unconfirmed)".
- Discover: the email column shows the status badge.
