# Founder Outreach Engine — Runbook

How to configure and operate the email outreach loop (send → detect → classify →
respond → follow-up). Engine design: `docs/founder-outreach-audit.md`.

**Where to set these:** Vercel → the Anker project → **Settings → Environment
Variables** (Production). Redeploy after changing them. For local dev, put them
in `.env.local` (never commit it).

---

## 1. Required to make the loop fully live

| Var | Purpose | If missing |
|-----|---------|-----------|
| `RESEND_API_KEY` | Sends all outbound outreach + drives delivery/bounce sync. | No email sends; approved replies stay `queued`; the deliverability cron skips. |
| `IMAP_HOST` | Inbound mailbox host (e.g. `imap.mailbox.org`). | Inbound replies are never pulled — the loop can't detect signals. |
| `IMAP_USER` | Inbound mailbox login (e.g. `vc@an-ker.de`). | Same as above. |
| `IMAP_PASS` | Inbound mailbox password / app-password. | Same as above. |
| `CRON_SECRET` | Bearer secret the Vercel crons authenticate with. | If unset, cron routes run **unauthenticated** (they allow all). Set it. |

**IMAP optional tuning** (sensible defaults if omitted):
`IMAP_PORT` (993) · `IMAP_SECURE` (`true`) · `IMAP_MAILBOX` (`INBOX`).

> The IMAP client libs (`imapflow`, `mailparser`) load lazily at runtime. If they
> aren't installed, the poller returns a graceful "not installed" no-op — install
> with `pnpm add imapflow mailparser`.

---

## 2. Sender identity (outbound "From" / reply-to)

| Var | Purpose |
|-----|---------|
| `OUTREACH_FROM_EMAIL` | The From address for outreach sends (must be on a Resend-verified domain). |
| `OUTREACH_FROM_NAME` | Display name on the From. |
| `ANKER_REPLY_TO` | Reply-to address (route replies back to the IMAP mailbox above). |
| `ANKER_BCC_EMAILS` | Optional comma-separated BCC (archive/CRM drop). |
| `OUTREACH_DAILY_CAP` | Optional per-day send ceiling (deliverability safety). |

**Keep these aligned:** set `ANKER_REPLY_TO` (and ideally `OUTREACH_FROM_EMAIL`)
to the same inbox `IMAP_USER` watches, so investor replies land where the poller
looks. Threading (In-Reply-To/References) is automatic.

---

## 3. AI classification (drafts + reply classes)

The classifier routes through `lib/ai/provider.ts`.

| Var | Purpose | If missing |
|-----|---------|-----------|
| `ANTHROPIC_API_KEY` | Preferred model for classify + draft. | Falls back to Ollama, then to a keyword heuristic (still works, lower quality). |

Auto-classification also needs the founder's **default sender profile**
(`sender_profiles.profile_set`) — built in the app under Outreach → sender
profile. Without it, replies are ingested and follow-ups are suppressed, but
drafts are skipped until a profile exists.

---

## 4. Optional — Gmail (send today; inbound is an extension point)

| Var | Purpose |
|-----|---------|
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_REDIRECT_URL` | Gmail OAuth for sending from a connected Gmail account. |

Gmail **inbound** polling is not built yet (`pollAllMailboxes` has the slot).
Until then, inbound retrieval is IMAP-only.

---

## 5. Misc

| Var | Purpose |
|-----|---------|
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | Absolute base URL for links + open/click tracking. |
| `TRACK_VIA_APP` | Route open/click tracking through the app instead of Resend. |
| `ANKER_SIGNATORY_*` | Signature block (name/title/email/website/linkedin) appended to sends. |

---

## 6. The crons (all `CRON_SECRET`-gated)

Registered in `vercel.json`:

| Path | Schedule | Does |
|------|----------|------|
| `/api/cron/outreach-poll` | `*/10 * * * *` | Pull inbound replies, classify + draft, suppress follow-ups. |
| `/api/cron/outreach-deliverability` | `0 * * * *` | System-wide Resend event sync; bounce/complaint → suppress + stop sequence. |
| `/api/cron/outreach-reengage` | `0 6 * * *` | Re-open due `reengage_on` replies as approval-gated drafts. |
| `/api/cron/outreach-scheduler` | `*/10 * * * *` | Batch sends + opener nudges. |

Sending stays **approval-gated**: the crons only pull, draft, and enqueue —
a human approves in the follow-up inbox, which sends.

---

## 7. Verify it's working

```bash
# Crons must reject without the secret (expect 401):
curl -s -o /dev/null -w '%{http_code}\n' https://www.an-ker.de/api/cron/outreach-poll

# Manually fire a cron (replace $CRON_SECRET):
curl -s -X GET https://www.an-ker.de/api/cron/outreach-poll \
  -H "Authorization: Bearer $CRON_SECRET"
# → { ok, poll:{ providers:[{provider:"imap", result:{ pulled, matched, newReplies }}]},
#     classify:{ considered, classified, suppressed } }
```

Then in the app: **Outreach → Inbox** shows classified replies with editable
drafts (Approve & send), and **Outreach → Analytics** shows the reply funnel
(reply-rate, positive-rate, time-to-first-reply, suppressed count).

## 8. Common issues

- **Replies not appearing** → `IMAP_*` unset/wrong, or `ANKER_REPLY_TO` points to
  a different mailbox than `IMAP_USER`. Check `inbox_poll_state.last_error`.
- **Drafts not generated** → no default `sender_profiles` row, or no AI key.
- **Approved reply didn't send** → `RESEND_API_KEY` unset (reply left `queued`),
  or recipient is on `email_suppressions` (bounced/complained earlier).
- **Nudging people who replied** → shouldn't happen now; if it does, confirm the
  poll cron is running (follow-up suppression fires on ingest).
